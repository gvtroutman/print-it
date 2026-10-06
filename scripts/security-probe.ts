/**
 * Targeted DAST probes, grouped by OWASP Top 10 (2021).
 *
 *   docker compose up -d db
 *   npm run build && npm start
 *   npm run probe:security
 *
 * A generic scanner (ZAP, Nuclei) cannot reason about *this* app's authority
 * model — who may call which endpoint, whether a name cookie can be pointed
 * at the printer owner, whether a role can be set from outside. These probes
 * do, by driving the real HTTP surface with real cookies.
 *
 * There is no sign-in left. A person is whoever a correctly signed `ppp.who`
 * names, and only ever a client; the printer owner is whoever holds a valid
 * `ppp.owner`, which nothing but `ADMIN_PASSWORD` produces. So most of what
 * used to live under A07 is now one question asked several ways: does a
 * cookie this app did not write, or wrote for something else, buy anything?
 *
 * Needs the same APP_SECRET and ADMIN_PASSWORD as the running app, or every
 * positive control below fails first — which is the hint.
 *
 * DESTRUCTIVE: wipes client users, stories and the audit trail. Development
 * database only.
 */
import "./_env";
import { createHash, createHmac } from "node:crypto";
import { db } from "../src/lib/db";
import { actAs, createClient, pickName } from "./_accounts";
import { OWNER_COOKIE, OWNER_TTL_SECONDS, WHO_COOKIE } from "../src/lib/identity-rules";
import { signOwner, signWho } from "../src/lib/identity-token";
import { safeRedirect } from "../src/lib/safe-redirect";

const APP = process.env.APP_URL ?? "http://localhost:3000";

type Finding = { id: string; title: string; detail: string };
const findings: Finding[] = [];
let passed = 0;

function probe(id: string, title: string, secure: boolean, detail = "") {
  if (secure) {
    passed++;
    console.info(`  ok    ${id}  ${title}`);
  } else {
    findings.push({ id, title, detail });
    console.info(`  FLAG  ${id}  ${title}\n          ${detail}`);
  }
}
const section = (t: string) => console.info(`\n── ${t} ${"─".repeat(Math.max(0, 58 - t.length))}`);

/**
 * Is this response an authenticated page?
 *
 * Keyed on a data attribute the app shell sets, not on a piece of copy. The
 * previous version looked for "Signed in as", which stopped being rendered
 * when the home screen was replaced — so three probes had been passing
 * because the string could never appear, whether or not the session was
 * valid. A negative assertion against copy is only as good as the copy.
 */
const isAuthenticated = (html: string) => html.includes('data-authenticated="true"');

/** A real 12-triangle binary STL, so upload probes exercise the happy path. */
function stlBox(x: number, y: number, z: number): Uint8Array {
  const p = [[0,0,0],[x,0,0],[x,y,0],[0,y,0],[0,0,z],[x,0,z],[x,y,z],[0,y,z]];
  const faces = [[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,4,5],[0,5,1],
                 [1,5,6],[1,6,2],[2,6,7],[2,7,3],[3,7,4],[3,4,0]];
  const tris = faces.map((f) => f.flatMap((i) => p[i]!));
  const buf = new Uint8Array(84 + tris.length * 50);
  const view = new DataView(buf.buffer);
  view.setUint32(80, tris.length, true);
  let off = 84;
  for (const t of tris) {
    for (let i = 0; i < 9; i++) view.setFloat32(off + 12 + i * 4, t[i]!, true);
    off += 50;
  }
  return buf;
}

const unescapeHtml = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"');

class Browser {
  jar = new Map<string, string>();
  private store(res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const eq = pair!.indexOf("=");
      if (eq < 0) continue;
      const k = pair!.slice(0, eq).trim();
      const v = pair!.slice(eq + 1).trim();
      if (!v || line.includes("Max-Age=0")) this.jar.delete(k);
      else this.jar.set(k, v);
    }
  }
  headers(extra: Record<string, string> = {}) {
    const h: Record<string, string> = { origin: APP, ...extra };
    if (this.jar.size) h.cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    return h;
  }
  async raw(url: string, init: RequestInit = {}) {
    const res = await fetch(url, {
      ...init,
      redirect: "manual",
      headers: { ...(init.headers ?? {}), ...this.headers() },
    });
    this.store(res);
    return res;
  }
  /**
   * Post a server-action form the way a browser with no JavaScript does:
   * carry every hidden input (Next's action id among them) and override the
   * visible fields. Mirrors the helper in `verify-queue.ts`.
   *
   * `pick` chooses the form, because `/hello` has two and an app page has the
   * header's "Not you?" form ahead of whatever the probe is after. Throws
   * rather than posting nothing: a probe that submitted the wrong form would
   * pass for the wrong reason.
   */
  async submit(
    url: string,
    html: string,
    values: Record<string, string>,
    pick: (form: string) => boolean = () => true,
  ) {
    const form = (html.match(/<form\b[\s\S]*?<\/form>/g) ?? []).find(pick);
    if (!form) throw new Error(`no matching form on ${url}`);
    const body = new FormData();
    for (const tag of form.match(/<input\b[^>]*>/g) ?? []) {
      if (!tag.includes('type="hidden"')) continue;
      const name = /name="([^"]*)"/.exec(tag)?.[1];
      const value = /value="([^"]*)"/.exec(tag)?.[1] ?? "";
      if (name) body.append(unescapeHtml(name), unescapeHtml(value));
    }
    for (const [k, v] of Object.entries(values)) body.set(k, v);
    return this.raw(url, { method: "POST", body });
  }

  async go(url: string, init: RequestInit = {}) {
    let res = await this.raw(url, init);
    for (let i = 0; i < 8; i++) {
      const loc = res.headers.get("location");
      if (!loc || res.status < 300 || res.status >= 400) break;
      res = await this.raw(new URL(loc, url).toString());
    }
    return res;
  }
  json(path: string, body: unknown) {
    return this.raw(APP + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
}

/**
 * Where a page visit ends up, after every redirect.
 *
 * Middleware only checks that *a* cookie is present, so a forged one gets
 * past it; the refusal comes a step later, from `requireUser` or
 * `requireAdmin` inside the page. Asserting on the first hop would therefore
 * see a 200-bound request and miss the bounce — the final path is the answer.
 * (`res.url` is the last hop's URL, because `go` issues each hop itself.)
 */
async function landing(b: Browser, path: string) {
  const res = await b.go(APP + path);
  return { path: new URL(res.url).pathname, status: res.status, html: await res.text() };
}

/** Where a single redirect points, resolved, or null if it was not one. */
function target(res: Response): URL | null {
  const loc = res.headers.get("location");
  if (!loc || res.status < 300 || res.status >= 400) return null;
  return new URL(loc, APP);
}

/**
 * An owner cookie for an arbitrary expiry, built by hand.
 *
 * `signOwner` always stamps `Date.now() + ttl`, which is the right API for the
 * app and the wrong one for a probe that wants to say "this one expired an
 * hour ago" without trusting the code under test to build it. So the MAC is
 * reproduced here, byte for byte as `identity-token.ts` does it — if the two
 * ever drift, the positive control at the top of A07 catches it first.
 */
function ownerCookieAt(expiresAt: number, password = process.env.ADMIN_PASSWORD ?? "") {
  const digest = createHash("sha256").update(password).digest("hex");
  const mac = createHmac("sha256", process.env.APP_SECRET ?? "")
    .update(`owner:${expiresAt}:${digest}`)
    .digest("base64url");
  return `${expiresAt}.${mac}`;
}

/** A browser holding exactly these cookies and nothing else. */
function holding(cookies: Record<string, string>): Browser {
  const b = new Browser();
  for (const [k, v] of Object.entries(cookies)) b.jar.set(k, v);
  return b;
}

const isHelloForm = (f: string) => f.includes('name="userId"');
const isAddNameForm = (f: string) => f.includes('name="name"');

/** The pages only the printer owner may see. `requireAdmin` guards each. */
const OWNER_PAGES = [
  "/queue",
  "/admin/audit",
  "/admin/catalog",
  "/admin/benefits",
  "/admin/prints",
  "/frr/queue",
];

async function main() {
  section("setup");
  await db.auditEvent.deleteMany();
  await db.notification.deleteMany();
  await db.story.deleteMany();
  await db.user.deleteMany({ where: { role: "client" } });

  const admin = await db.user.findFirst({ where: { role: "admin" } });
  if (!admin) throw new Error("No admin — run npm run db:seed");

  // E-mail addresses on purpose, although nothing in the app reads them any
  // more: they are what A02-api-email below searches the wire for.
  const ayla = await createClient("Ayla Berg", { email: "ayla@office.example", initials: "AY" });
  const mallory = await createClient("Mallory", { email: "mallory@office.example", initials: "MA" });
  console.info(`  admin=${admin.name}  client=${ayla.name}  attacker=${mallory.name}`);

  const client = actAs(new Browser(), ayla);
  const attacker = actAs(new Browser(), mallory);
  const apiAdmin = actAs(new Browser(), admin);
  const anon = new Browser();
  console.info(`  cookies minted: ${client.jar.has(WHO_COOKIE) && apiAdmin.jar.has(OWNER_COOKIE)}`);

  // =====================================================================
  section("A01 Broken Access Control");

  // Positive control. Without it, the "not authenticated" probes below could
  // all pass simply because the marker was never rendered — which is exactly
  // how the previous copy-based version quietly went hollow.
  const realPage = await (await client.go(`${APP}/board`)).text();
  probe("A01-marker", "a real name cookie does render the authenticated marker",
        isAuthenticated(realPage),
        "marker missing — every negative identity probe below is vacuous");

  // And the owner's, for the same reason: every "bounced to /owner" below is
  // only evidence if a valid owner cookie is *not* bounced.
  const ownerQueue = await landing(apiAdmin, "/queue");
  probe("A01-owner-control", "a valid owner cookie does reach the queue",
        ownerQueue.path === "/queue" && isAuthenticated(ownerQueue.html),
        `landed on ${ownerQueue.path} (${ownerQueue.status}) — APP_SECRET or ` +
        "ADMIN_PASSWORD differs from the app's, so every owner probe below is vacuous");

  // Vertical, pages. A client is not told these do not exist — the owner
  // prompt is public and names them — it is sent to the password prompt.
  for (const path of OWNER_PAGES) {
    const r = await landing(client, path);
    probe(`A01-page ${path}`, `${path} sends a client to the owner prompt`,
          r.path === "/owner" && !isAuthenticated(r.html),
          `expected to land on /owner, landed on ${r.path} (${r.status})`);
  }

  // The audit trail names everyone who has ever picked a name. A client
  // reaching it would be a roster leak on top of a privilege one.
  const auditLeak = (await landing(client, "/admin/audit")).html;
  probe("A01-audit-leak", "no audit rows leak to a client",
        !auditLeak.includes("name.picked") && !auditLeak.includes("owner.unlocked"));

  /*
   * A `ppp.who` cookie signed by the app's own key, for the owner's row.
   *
   * This is the cookie a curious client would build if `APP_SECRET` ever
   * leaked, and the one the app itself would write if `pickName` ever stopped
   * filtering on role. `currentUser` resolves a who cookie against client rows
   * only, so it names nobody at all: not the owner, and not a client either.
   * That is why the API answers 401 rather than 403 — there is no actor to
   * refuse — and why `/board` sends it to /hello rather than letting it in.
   */
  const whoForOwner = pickName(new Browser(), admin.id);
  const aylaStory = await db.story.create({
    data: {
      title: "Ayla's private hook", uploaderId: ayla.id, colorName: "Slate",
      colorHex: "#4a5d78", tip: "A beer", filename: "a.stl", fileSize: 1,
      mimeType: "model/stl", storageKey: "secret-key-a1",
    },
  });

  const ownerQueueByWho = await landing(whoForOwner, "/queue");
  probe("A01-who-owner-page", "a signed who cookie for the owner's row does not open the queue",
        ownerQueueByWho.path === "/owner",
        `landed on ${ownerQueueByWho.path} (${ownerQueueByWho.status})`);
  const ownerBoardByWho = await landing(whoForOwner, "/board");
  probe("A01-who-owner-nobody", "and names nobody at all, not even a client",
        ownerBoardByWho.path === "/hello" && !isAuthenticated(ownerBoardByWho.html),
        `landed on ${ownerBoardByWho.path} (${ownerBoardByWho.status})`);
  const listByWho = await whoForOwner.raw(`${APP}/api/stories`);
  probe("A01-who-owner-api", "and the API treats it as no name (401)",
        listByWho.status === 401, `expected 401, got ${listByWho.status}`);
  const advanceByWho = await whoForOwner.raw(`${APP}/api/stories/${aylaStory.id}/advance`, {
    method: "POST",
  });
  probe("A01-who-owner-advance", "and cannot move a ticket",
        advanceByWho.status === 401 &&
        (await db.story.findUnique({ where: { id: aylaStory.id } }))?.status === "Requested",
        `status ${advanceByWho.status}`);

  /*
   * The same thing through the front door: the /hello picker posts a user id,
   * and the id is a form field, so it can say anything. `pickName` looks it up
   * among client rows only; the owner's id is "not on the list".
   */
  const picker = new Browser();
  const helloHtml = await (await picker.raw(`${APP}/hello`)).text();
  const pickedOwner = await picker.submit(`${APP}/hello`, helloHtml, { userId: admin.id }, isHelloForm);
  probe("A01-pick-owner", "the name picker cannot be pointed at the owner's row",
        (target(pickedOwner)?.searchParams.get("error") ?? "") === "unknown" &&
          !picker.jar.has(WHO_COOKIE),
        `status ${pickedOwner.status} -> ${pickedOwner.headers.get("location") ?? ""}, ` +
        `who cookie set: ${picker.jar.has(WHO_COOKIE)}`);

  // Nor can a client add a name that is the owner's, in any case — that is
  // the one name a colleague would take on trust in a notification.
  const twin = new Browser();
  const twinHtml = await (await twin.raw(`${APP}/hello`)).text();
  const twinRes = await twin.submit(`${APP}/hello`, twinHtml,
    { name: admin.name.toUpperCase() }, isAddNameForm);
  probe("A01-add-owner-name", "nobody can add a name that is the owner's",
        (target(twinRes)?.searchParams.get("error") ?? "") === "owner" &&
        (await db.user.count({
          where: { role: "client", name: { equals: admin.name, mode: "insensitive" } },
        })) === 0,
        `status ${twinRes.status} -> ${twinRes.headers.get("location") ?? ""}`);

  /*
   * Owner-only server actions, replayed from a client.
   *
   * A form's action id is not a secret — it is in the HTML of every page that
   * renders the form — so the client here borrows the owner's own "Accept it"
   * form, hidden inputs and all, and posts it with nothing but a name cookie.
   * `requireAdmin()` at the top of the action is what has to say no.
   */
  const ownerTicket = await (await apiAdmin.raw(`${APP}/story/${aylaStory.id}`)).text();
  const replayed = await client.submit(`${APP}/story/${aylaStory.id}`, ownerTicket, {},
    (f) => f.includes("Accept it") && f.includes(`value="${aylaStory.id}"`));
  probe("A01-action-replay", "a client replaying the owner's own form does not move the ticket",
        (await db.story.findUnique({ where: { id: aylaStory.id } }))?.status === "Requested",
        `status ${replayed.status} -> ${replayed.headers.get("location") ?? ""}`);
  probe("A01-action-replay-owner", "and is sent to the owner prompt instead",
        target(replayed)?.pathname === "/owner",
        `expected a redirect to /owner, got ${replayed.status} -> ` +
        `${replayed.headers.get("location") ?? "none"}`);

  probe("A01-role", "the client is still a client, and there is still one owner",
        (await db.user.findUnique({ where: { id: ayla.id } }))?.role === "client" &&
        (await db.user.count({ where: { role: "admin" } })) === 1);

  // Horizontal: the story detail scope, against the data layer.
  // Imported from scope.ts, not authz.ts: the pure rule, no "server-only".
  const { storyScope } = await import("../src/lib/scope");
  const asMallory = await db.story.findFirst({
    where: { AND: [{ id: aylaStory.id }, storyScope({ ...mallory, role: "client" } as never)] },
  });
  probe("A01-idor", "storyScope hides another client's story", asMallory === null,
        "a client can read a story they do not own");

  // API routes answer with status codes rather than redirecting to HTML —
  // middleware deliberately lets them through, so each handler owes its own
  // check. This confirms the upload handler makes it.
  const anonUpload = await anon.raw(`${APP}/api/upload`, {
    method: "POST",
    body: (() => {
      const f = new FormData();
      f.set("file", new File([new Uint8Array([1, 2, 3])], "x.stl"));
      return f;
    })(),
  });
  probe("A01-anon-api", "a call with no name is 401, not a redirect",
        anonUpload.status === 401,
        `expected 401, got ${anonUpload.status} -> ${anonUpload.headers.get("location") ?? ""}`);

  // The uploader is taken from the cookie. A body claiming otherwise must
  // not be able to file a request in someone else's name.
  const spoof = new FormData();
  spoof.set("file", new File([stlBox(15, 15, 15) as BlobPart], "spoof.stl"));
  spoof.set("title", "Filed as someone else");
  spoof.set("material", "PLA");
  spoof.set("colorName", "Teal");
  spoof.set("quantity", "1");
  spoof.set("tip", "A beer");
  spoof.set("note", "");
  spoof.set("uploaderId", admin.id);
  spoof.set("status", "Done");
  await client.raw(`${APP}/api/upload`, { method: "POST", body: spoof });
  const spoofed = await db.story.findFirst({
    where: { title: "Filed as someone else" },
  });
  probe("A01-upload-owner", "the uploader comes from the cookie, not the body",
        spoofed?.uploaderId === ayla.id,
        `story is owned by ${spoofed?.uploaderId}, cookie named ${ayla.id}`);
  probe("A01-upload-status", "a posted status is ignored; new stories are Requested",
        spoofed?.status === "Requested", String(spoofed?.status));
  probe("A02-storage-key", "the storage key is generated, not taken from the filename",
        !!spoofed && !spoofed.storageKey.includes("spoof"),
        spoofed?.storageKey ?? "");

  // -------------------------------------------------------------------
  // The JSON API.
  //
  // It is a second front door onto the same operations as the pages, so it
  // needs the same probes rather than the same *reasoning*. Both go through
  // src/lib/stories.ts, and the point of these is to catch the day one of them
  // stops doing so — a rule that holds only for the caller that remembered it
  // is not a rule.
  //
  // It also departs from the pages' send-them-elsewhere answer, on purpose:
  // these paths are published in /api/openapi.json, so a client is told 403
  // plainly. What is still hidden is whether a *ticket* exists, which is what
  // the IDOR probes below are about.
  const mallorysStory = await db.story.create({
    data: {
      title: "Mallory's own", uploaderId: mallory.id, colorName: "Slate",
      colorHex: "#4a5d78", tip: "A beer", filename: "m.stl", fileSize: 1,
      mimeType: "model/stl", storageKey: "secret-key-m1",
    },
  });

  const clientList = await client.raw(`${APP}/api/stories`);
  probe("A01-api-control", "a real name cookie is accepted by the API",
        clientList.status === 200,
        `status ${clientList.status} — every 401 probe below is vacuous`);

  for (const [method, path] of [
    ["GET", "/api/stories"],
    ["GET", `/api/stories/${aylaStory.id}`],
    ["POST", `/api/stories/${aylaStory.id}/advance`],
    ["GET", `/api/stories/${aylaStory.id}/comments`],
    ["GET", "/api/notifications"],
    ["GET", "/api/openapi.json"],
  ] as const) {
    const r = await anon.raw(APP + path, { method });
    probe(`A01-api-anon ${method} ${path.replace(/\d+/, "{id}")}`,
          "a call with no name is 401, not a redirect",
          r.status === 401,
          `expected 401, got ${r.status} -> ${r.headers.get("location") ?? ""}`);
  }

  // Vertical: rendering no button is not authorisation, and neither is
  // documenting an endpoint without one.
  for (const [name, method, path, body] of [
    ["advance", "POST", `/api/stories/${aylaStory.id}/advance`, null],
    ["decline", "POST", `/api/stories/${aylaStory.id}/decline`, null],
    ["flag", "POST", `/api/stories/${aylaStory.id}/flag`, { reason: "let me in" }],
    ["clear-flag", "DELETE", `/api/stories/${aylaStory.id}/flag`, null],
  ] as const) {
    const r = await client.raw(APP + path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    probe(`A01-api-${name}`, `the API's "${name}" refuses a client`,
          r.status === 403, `expected 403, got ${r.status}`);
  }
  const untouched = await db.story.findUnique({ where: { id: aylaStory.id } });
  probe("A01-api-noop", "and none of it moved the ticket or flagged it",
        untouched?.status === "Requested" && untouched?.flagged === false,
        `${untouched?.status} flagged=${untouched?.flagged}`);

  // Horizontal, over HTTP this time rather than against the data layer: a
  // ticket outside the caller's scope is indistinguishable from one that does
  // not exist.
  for (const [name, path] of [
    ["read", `/api/stories/${mallorysStory.id}`],
    ["thread", `/api/stories/${mallorysStory.id}/comments`],
    ["model", `/api/models/${mallorysStory.id}`],
  ] as const) {
    const r = await client.raw(APP + path);
    probe(`A01-api-idor-${name}`, `another client's ${name} is 404, never 403`,
          r.status === 404, `expected 404, got ${r.status}`);
  }

  // ---------------------------------------------------------------------
  // The "Open in PrusaSlicer" link credential.
  //
  // A second way to be somebody at /api/models/[id], for a desktop helper that
  // holds no cookie. It replaced a long-lived token pasted into a file on the
  // owner's machine, which was a full-authority secret at rest.
  //
  // The token answers *who* and nothing else, so what matters is that it is
  // unforgeable and that it cannot be pointed somewhere it was not minted for.
  // ---------------------------------------------------------------------
  // Minted off a story with real bytes behind it. `mallorysStory` is a bare row
  // with an invented storage key, so a fetch of it 502s for want of a file
  // long after the credential has done its job — which would test nothing.
  const realStory = spoofed!;
  const ticket = await (await apiAdmin.raw(APP + `/story/${realStory.id}`)).text();
  const minted = /ppp:\/\/slice\/\d+\?t=([A-Za-z0-9._-]+)/.exec(ticket)?.[1] ?? "";
  probe("A05-slicer-minted", "a ticket carries a slicer link with its own credential",
        minted.length > 0,
        "no ppp:// link with a ?t= credential on the rendered ticket — the " +
        "helper would fall back to a long-lived token on disk");

  // Anonymous: no cookie at all, exactly the helper's position.
  const bare = (url: string) => fetch(url, { redirect: "manual" });

  probe("A01-slicer-anon", "the model route still refuses a caller with nothing",
        (await bare(APP + `/api/models/${realStory.id}`)).status === 401,
        "an unauthenticated fetch of model bytes was not 401");

  if (minted) {
    probe("A01-slicer-ok", "a minted link fetches the model it names",
          (await bare(APP + `/api/models/${realStory.id}?t=${minted}`)).status === 200,
          "the credential the app just minted did not work — the button is broken");

    // The binding that matters: one link, one model. Without it, a link to your
    // own ticket would be a key to every ticket its holder can see — and the
    // holder here is the printer owner, who can see all of them. Mallory's is
    // the right target precisely because the admin *may* read it by cookie.
    const crossed = await bare(APP + `/api/models/${mallorysStory.id}?t=${minted}`);
    probe("A01-slicer-bound", "and cannot be pointed at a different model",
          crossed.status !== 200,
          `a token minted for ${realStory.id} fetched ${mallorysStory.id} (status ${crossed.status})`);

    const tampered = minted.slice(0, -4) + "AAAA";
    probe("A02-slicer-signature", "a tampered link credential is refused",
          (await bare(APP + `/api/models/${realStory.id}?t=${tampered}`)).status !== 200,
          "the HMAC over the claim is not being checked — anyone could mint one");

    probe("A02-slicer-garbage", "and so is something that is not a token at all",
          (await bare(APP + `/api/models/${realStory.id}?t=not-a-token`)).status !== 200,
          "a malformed credential was accepted");
  }

  const said = await client.raw(APP + `/api/stories/${mallorysStory.id}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body: "hello" }),
  });
  probe("A01-api-idor-write", "and writing to it is refused",
        said.status === 404 &&
        (await db.comment.count({ where: { authorId: ayla.id } })) === 0,
        `status ${said.status}`);

  // Seeing every story is not being allowed to withdraw one. The printer
  // owner has the widest scope in the app and still cannot delete a request
  // that is not theirs.
  const adminDelete = await apiAdmin.raw(APP + `/api/stories/${mallorysStory.id}`, {
    method: "DELETE",
  });
  probe("A01-api-withdraw", "the printer owner cannot withdraw somebody's request",
        adminDelete.status === 403 &&
        (await db.story.count({ where: { id: mallorysStory.id } })) === 1,
        `status ${adminDelete.status}`);

  // Notifications are per recipient, and naming somebody else's id changes
  // nothing rather than erroring — an error would be an oracle for whose is
  // whose.
  const adminNote = await db.notification.create({
    data: { recipientId: admin.id, text: "for the printer owner only" },
  });
  await client.raw(`${APP}/api/notifications/read`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: adminNote.id }),
  });
  probe("A01-api-notification", "a client cannot mark somebody else's notification read",
        (await db.notification.findUnique({ where: { id: adminNote.id } }))?.read === false);

  const feed = await (await client.raw(`${APP}/api/notifications`)).text();
  probe("A01-api-feed", "and never sees it in their own feed",
        !feed.includes("for the printer owner only"), feed.slice(0, 120));

  // The wire format is a place data leaks by omission — one spread of a
  // database row and the object key is public. src/lib/api.ts names every
  // field it emits for exactly this reason.
  const own = await (await client.raw(`${APP}/api/stories/${aylaStory.id}`)).text();
  /*
   * The fixture's key is a distinctive string, not "k1" as it was, because the
   * assertion is a substring search over the whole response body and
   * `uploader.id` is a cuid — 25 lowercase alphanumerics. Two characters
   * collide with one roughly 1.8% of the time, so this probe failed about one
   * run in fifty, for years, on a body that never contained the key at all. A
   * gate that reddens at random is a gate people learn to re-run. Its sibling
   * below already had this right with `secret-key-m1`.
   */
  probe("A02-api-key", "the object's storage key is not on the wire",
        !own.includes("storageKey") && !own.includes("secret-key-a1"), own.slice(0, 200));
  // `email` is optional now and the owner's may be null, and "".includes is
  // always true — so it is only searched for when there is one to find.
  probe("A02-api-email", "and neither is anybody's e-mail address",
        !own.includes("@office.example") && (!admin.email || !own.includes(admin.email)),
        own.slice(0, 200));

  // CSRF: SameSite=Lax plus an Origin check is the app's model, and the API
  // keeps to it. A browser always sends Origin on a cross-site write.
  //
  // Deliberately NOT through `Browser.raw`: that helper stamps this app's own
  // Origin on last, so a probe written through it would send the honest header
  // and pass without testing anything. The jar is borrowed, the headers are
  // built here.
  const foreign = await fetch(APP + `/api/stories/${aylaStory.id}/advance`, {
    method: "POST",
    redirect: "manual",
    headers: {
      ...apiAdmin.headers(),
      origin: "https://attacker.example",
      "content-type": "application/json",
    },
  });
  probe("A05-api-csrf", "a write carrying a foreign Origin is refused",
        foreign.status === 403 &&
        (await db.story.findUnique({ where: { id: aylaStory.id } }))?.status === "Requested",
        `status ${foreign.status}`);

  // The document and the console describe the authority model. Handing that
  // description to a stranger is a free map of it.
  for (const [id, path] of [
    ["A05-openapi-anon", "/api/openapi.json"],
    ["A05-docs-anon", "/docs"],
  ] as const) {
    const r = await anon.raw(APP + path);
    probe(id, `${path} is not served to a stranger`,
          r.status === 401 || (r.status >= 300 && r.status < 400),
          `status ${r.status}`);
  }

  const docsHtml = await (await client.raw(`${APP}/docs`)).text();
  const docsExternal = [
    ...docsHtml.matchAll(/<(?:script|link|img|iframe)\b[^>]*\b(?:src|href)="([^"]+)"/g),
  ].map((m) => m[1]!).filter((u) => /^(?:https?:)?\/\//.test(u));
  probe("A05-docs-selfhosted", "the API console fetches nothing from another origin",
        docsExternal.length === 0, docsExternal.join(" "));

  const anonHome = await anon.raw(`${APP}/`);
  probe("A01-anon", "a visitor with no name is sent to /hello",
        (anonHome.status === 307 || anonHome.status === 302) &&
          target(anonHome)?.pathname === "/hello",
        `got ${anonHome.status} -> ${anonHome.headers.get("location") ?? ""}`);

  // =====================================================================
  section("A02 Cryptographic Failures");

  /*
   * The flags on the cookie the app itself writes, read off a real pick on
   * /hello rather than off the suite's own minted one. `ppp.owner` has the
   * same `base()` options in src/lib/identity.ts; it is not unlocked here
   * because that would mean posting the real owner password, which
   * verify:queue already does.
   */
  const flagsProbe = new Browser();
  const flagsHtml = await (await flagsProbe.raw(`${APP}/hello`)).text();
  const picked = await flagsProbe.submit(`${APP}/hello`, flagsHtml, { userId: ayla.id }, isHelloForm);
  const whoLine = picked.headers.getSetCookie().find((c) => c.startsWith(`${WHO_COOKIE}=`)) ?? "";
  probe("A02-pick-works", "picking a name on /hello sets the name cookie",
        whoLine.length > 0,
        `status ${picked.status}, no ${WHO_COOKIE} Set-Cookie — the flag probes below are vacuous`);
  probe("A02-httponly", "the name cookie is HttpOnly", /HttpOnly/i.test(whoLine), whoLine.slice(0, 120));
  probe("A02-samesite", "the name cookie is SameSite", /SameSite=(Lax|Strict)/i.test(whoLine),
        whoLine.slice(0, 120));
  probe("A02-secure", "the name cookie is Secure (or the app is on plain http)",
        /Secure/i.test(whoLine) || APP.startsWith("http://"),
        whoLine.slice(0, 120));

  // =====================================================================
  section("A03 Injection");

  // The one id a stranger can post is the picker's `userId`. It reaches
  // Prisma as a parameter, so a payload is just a name that is not on the list.
  const sqlPayloads = ["' OR '1'='1", "'; DROP TABLE \"user\"; --", "\\'; SELECT pg_sleep(3); --"];
  let sqlOk = true;
  for (const p of sqlPayloads) {
    const b = new Browser();
    const html = await (await b.raw(`${APP}/hello`)).text();
    const r = await b.submit(`${APP}/hello`, html, { userId: p }, isHelloForm);
    if (r.status >= 500 || b.jar.has(WHO_COOKIE)) sqlOk = false;
  }
  probe("A03-sqli", "SQL metacharacters in the picker's user id are handled", sqlOk,
        "a payload produced a 5xx or a name cookie, suggesting it reached the driver");
  probe("A03-sqli-intact", "user table still exists after injection attempts",
        (await db.user.count()) > 0);

  // Stored XSS through the one attacker-controlled string that gets rendered.
  await db.user.update({
    where: { id: ayla.id },
    data: { name: '<img src=x onerror=alert(1)>"><script>alert(2)</script>' },
  });
  const xssHome = await (await client.go(`${APP}/`)).text();
  // Assert on the dangerous form specifically. The inner attribute text
  // ("onerror=alert(1)") legitimately survives inside an *escaped* string —
  // both in the DOM as "&lt;img … onerror=alert(1)&gt;" and in the RSC flight
  // payload as "<img …" — and matching that substring alone reports
  // correct escaping as a vulnerability. What must never appear is a raw
  // angle bracket opening a tag.
  const rawTag = /<img\s|<script>alert\(2\)/.test(xssHome);
  const wasEscaped = xssHome.includes("&lt;img") || xssHome.includes("\\u003cimg");
  probe("A03-stored-xss", "a hostile display name is escaped when rendered",
        !rawTag && wasEscaped,
        rawTag
          ? "raw markup from the name field reached the page"
          : "the payload was not rendered at all — the probe proved nothing");
  await db.user.update({ where: { id: ayla.id }, data: { name: "Ayla Berg" } });

  for (const page of ["/hello", "/owner"]) {
    const reflected = await (await anon.go(`${APP}${page}?error=%3Cscript%3Ealert(1)%3C%2Fscript%3E`)).text();
    probe(`A03-reflected-xss ${page}`, "the error query parameter is not reflected as markup",
          !reflected.includes("<script>alert(1)</script>"));
  }

  // `next` is echoed into a hidden input on both prompts, after safeRedirect.
  const nextXss = await (await anon.go(`${APP}/hello?next=%2F%3Cscript%3Ealert(1)%3C%2Fscript%3E`)).text();
  probe("A03-next-xss", "a hostile ?next is not reflected as markup",
        !nextXss.includes("<script>alert(1)</script>"));

  // =====================================================================
  section("A04 Insecure Design");

  /*
   * Gone means gone. Each of these was a door the sign-in design needed and
   * this one does not; a merge that brought one back would bring back a
   * surface nothing else in the suite looks at any more. Asked with a name
   * cookie so middleware lets them through to the router — anonymously they
   * would all be 307s to /hello and prove nothing.
   */
  for (const path of [
    "/signin", "/reauth", "/set-password", "/welcome", "/admin/invites", "/invite/x",
    "/api/auth/sign-in/username", "/api/auth/get-session", "/api/auth/admin/list-users",
  ]) {
    const r = await client.raw(APP + path);
    probe(`A04-retired ${path}`, `${path} no longer exists`,
          r.status === 404, `expected 404, got ${r.status} -> ${r.headers.get("location") ?? ""}`);
  }

  // =====================================================================
  section("A05 Security Misconfiguration");

  const headRes = await anon.raw(`${APP}/hello`);
  const H = (n: string) => headRes.headers.get(n) ?? "";
  probe("A05-nosniff", "X-Content-Type-Options is set", H("x-content-type-options") === "nosniff");
  probe("A05-frame", "clickjacking is blocked",
        /DENY|SAMEORIGIN/i.test(H("x-frame-options")) || /frame-ancestors/i.test(H("content-security-policy")));
  probe("A05-referrer", "Referrer-Policy is set", H("referrer-policy").length > 0);
  probe("A05-powered", "X-Powered-By is not advertised", H("x-powered-by") === "",
        `x-powered-by: ${H("x-powered-by")}`);
  probe("A05-csp", "a Content-Security-Policy is served", H("content-security-policy").length > 0,
        "no CSP header — a single XSS gets full script execution");

  for (const path of ["/.env", "/.git/config", "/prisma/schema.prisma", "/package.json", "/.env.local"]) {
    const r = await anon.raw(APP + path);
    probe(`A05-expose ${path}`, `${path} is not served`, r.status === 404 || r.status === 307,
          `status ${r.status}`);
  }

  const errRes = await client.raw(`${APP}/api/stories/${aylaStory.id}/comments`, {
    method: "POST", headers: { "content-type": "application/json" }, body: "{not json",
  });
  const errBody = await errRes.text();
  probe("A05-stacktrace", "malformed input does not return a stack trace",
        errRes.status === 400 && !/at \w+ \(|\.ts:\d+:\d+|node_modules/.test(errBody),
        `status ${errRes.status} ${errBody.slice(0, 120)}`);

  // =====================================================================
  section("A07 Identification and Authentication Failures");

  /*
   * Forged name cookies.
   *
   * Middleware only asks whether a `ppp.who` is *present*, so each of these
   * gets past it; what has to refuse them is `readWho` inside `currentUser`.
   * A page therefore bounces to /hello a hop later than a missing cookie
   * would, and the API answers 401. Ayla's real id is used on purpose: the
   * only thing wrong with the first one is the MAC.
   */
  for (const [name, value] of [
    ["bad-mac", `${ayla.id}.AAAA`],
    ["unsigned", ayla.id],
    ["empty-mac", `${ayla.id}.`],
    ["other-mac", `${ayla.id}.${signWho(mallory.id).split(".").pop()}`],
  ] as const) {
    const forged = holding({ [WHO_COOKIE]: value });
    const api = await forged.raw(`${APP}/api/stories`);
    probe(`A07-who-${name}-api`, `a ${name} name cookie is 401 at the API`,
          api.status === 401, `expected 401, got ${api.status}`);
    const page = await landing(forged, "/board");
    probe(`A07-who-${name}-page`, "and is sent to /hello by the page",
          page.path === "/hello" && !isAuthenticated(page.html),
          `landed on ${page.path} (${page.status})`);
  }

  /*
   * Forged and stale owner cookies.
   *
   * The positive control is A01-owner-control above. Each of these is
   * refused by `readOwner`, and with no `ppp.who` alongside it names nobody,
   * so the API answers 401 and the queue bounces to the owner prompt.
   *
   * "rotated" is a cookie that was perfectly valid under a previous
   * ADMIN_PASSWORD. The password's digest is inside the MAC so that changing
   * it locks every browser out at once — the one lever the owner has if a
   * laptop walks off unlocked.
   */
  const realPassword = process.env.ADMIN_PASSWORD ?? "";
  for (const [name, value] of [
    ["bad-mac", `${Date.now() + 3_600_000}.AAAA`],
    ["unsigned", String(Date.now() + 3_600_000)],
    ["expired", ownerCookieAt(Date.now() - 60 * 60 * 1000)],
    ["expired-api", signOwner(-60)],
    ["rotated", ownerCookieAt(Date.now() + OWNER_TTL_SECONDS * 1000, `${realPassword}-before`)],
  ] as const) {
    const forged = holding({ [OWNER_COOKIE]: value });
    const page = await landing(forged, "/queue");
    probe(`A07-owner-${name}-page`, `a ${name} owner cookie does not open the queue`,
          page.path === "/owner",
          `landed on ${page.path} (${page.status})`);
    const api = await forged.raw(`${APP}/api/stories/${aylaStory.id}/advance`, { method: "POST" });
    probe(`A07-owner-${name}-api`, "and cannot move a ticket",
          api.status === 401 &&
          (await db.story.findUnique({ where: { id: aylaStory.id } }))?.status === "Requested",
          `status ${api.status}`);
  }

  // A forged owner cookie riding along with a real name is still just that
  // name: the client it names, and no more.
  const mixed = holding({
    [WHO_COOKIE]: client.jar.get(WHO_COOKIE)!,
    [OWNER_COOKIE]: `${Date.now() + 3_600_000}.AAAA`,
  });
  const mixedQueue = await landing(mixed, "/queue");
  probe("A07-owner-mixed", "a forged owner cookie beside a real name adds nothing",
        mixedQueue.path === "/owner", `landed on ${mixedQueue.path} (${mixedQueue.status})`);

  /*
   * A wrong owner password.
   *
   * Once, not ten times: the unlock action allows ten wrong guesses a minute
   * per address and this probe is not here to test that limiter — tripping it
   * would leave the next suite's real unlock answered "slow". What it is here
   * for is that a refusal issues no cookie and leaves a trace the owner can
   * read, and that the trace does not carry the guess.
   */
  const guesser = new Browser();
  const ownerHtml = await (await guesser.raw(`${APP}/owner`)).text();
  const GUESS = "definitely-not-the-owner-password";
  const refusedBefore = await db.auditEvent.count({ where: { action: "owner.unlock_refused" } });
  const wrong = await guesser.submit(`${APP}/owner`, ownerHtml, { password: GUESS },
    (f) => f.includes('name="password"'));
  probe("A07-unlock-wrong", "a wrong owner password is refused",
        (target(wrong)?.searchParams.get("error") ?? "") === "wrong",
        `status ${wrong.status} -> ${wrong.headers.get("location") ?? ""}`);
  probe("A07-unlock-nocookie", "and issues no owner cookie",
        !guesser.jar.has(OWNER_COOKIE) &&
          !wrong.headers.getSetCookie().some((c) => c.startsWith(`${OWNER_COOKIE}=`)),
        wrong.headers.getSetCookie().join(" | ").slice(0, 160));
  const refusals = await db.auditEvent.findMany({ where: { action: "owner.unlock_refused" } });
  probe("A07-unlock-audited", "and is written to the audit trail",
        refusals.length === refusedBefore + 1,
        `${refusals.length - refusedBefore} owner.unlock_refused rows written`);
  probe("A07-unlock-noguess", "without the guess in it",
        !JSON.stringify(refusals).includes(GUESS),
        "the audit trail recorded the attempted password");

  // ---------------------------------------------------------------------
  // Redirect targets.
  //
  // `/hello` and `/owner` both take a `?next=` and redirect to it — at once,
  // if the browser is already somebody. That makes them the app's two open
  // redirect candidates, and the moment of redirect the one a person is
  // least suspicious of.
  // ---------------------------------------------------------------------

  // The raw value does appear in the RSC flight payload as a page prop, which
  // is inert. What matters is whether anything *navigable* points off-site,
  // and whether the value survives safeRedirect() into the form.
  for (const page of ["/hello", "/owner"]) {
    const nextHtml = await (await anon.go(`${APP}${page}?next=https://evil.example`)).text();
    const navigable = /(?:href|action|url|location|value)\s*[=:]\s*["']?https?:\/\/evil\.example/i.test(nextHtml);
    probe(`A07-nextparam ${page}`, "no navigable target points off-site", !navigable,
          "an href/action/value referenced the attacker origin");
  }

  /*
   * And over HTTP, with the cookie that makes each page redirect straight
   * away. Asserted on the Location of the first hop — `raw`, not `go` — and
   * resolved, because the question is where a browser would go next.
   *
   * Next normalises the Location it emits, so on its own this would not have
   * caught the old backslash bug (see the safeRedirect probes below); it
   * catches a page that stops calling safeRedirect at all.
   */
  const SPELLINGS = [
    "//evil.example",
    String.raw`/\evil.example`,
    "https://evil.example",
    "http://169.254.169.254/latest/meta-data/",
  ];
  for (const [page, who] of [["/hello", client], ["/owner", apiAdmin]] as const) {
    for (const t of SPELLINGS) {
      const r = await who.raw(`${APP}${page}?next=${encodeURIComponent(t)}`);
      const to = target(r);
      probe(`A07-redirect ${page} ${t}`, `${page} keeps ?next=${t} on this origin`,
            to !== null && to.origin === new URL(APP).origin,
            `status ${r.status} -> ${r.headers.get("location") ?? "no redirect"}`);
    }
  }

  /*
   * Every spelling a URL parser resolves off-origin, not just the one that
   * looks off-origin to a person.
   *
   * The guard this pins used to be `startsWith("/") && !startsWith("//")`,
   * which three of these five walk straight through: the WHATWG parser treats
   * a backslash as a slash in the relative-slash state, so `/\evil.example`
   * starts with a single slash, passes the check, and resolves to
   * https://evil.example/.
   *
   * Asserted against the function rather than over HTTP, and that is the
   * interesting part. Two earlier attempts at this probe were both useless,
   * for reasons worth keeping:
   *
   *   - Searching the response body flagged everything, including targets that
   *     are correctly refused. Middleware builds its /hello redirect from the
   *     raw `pathname + search`, so a refused target legitimately reappears
   *     inside an encoded same-origin return path, and Next serialises raw
   *     `searchParams` into the RSC flight payload regardless.
   *   - Asserting on the redirect Location proved nothing either, because Next
   *     normalises the Location it emits — the backslash spellings came back
   *     same-origin even with the broken guard in place.
   *
   * The pages and actions hand `next` on in more than one way, and no HTTP
   * probe can see every one of them, so the honest pin is the decision
   * itself. `safe-redirect.ts` is pure for exactly this reason, the same
   * reasoning that keeps `scope.ts` out of `authz.ts`.
   */
  const OFFSITE = [
    "//evil.example",
    String.raw`/\evil.example`,
    String.raw`/\/evil.example`,
    String.raw`/\\evil.example`,
    "https://evil.example",
    "https:/evil.example",
    String.raw`\\evil.example`,
  ];
  const SENTINEL = "https://redirect.invalid";
  const leaked = OFFSITE.filter((t) => {
    const out = safeRedirect(t, "/");
    try {
      return new URL(out, SENTINEL).origin !== SENTINEL;
    } catch {
      return true;
    }
  });
  probe("A07-offsite-next", "no ?next spelling survives the redirect guard",
        leaked.length === 0, leaked.map((t) => `${t} -> ${safeRedirect(t, "/")}`).join("  "));

  // The other half: a target that IS same-origin has to survive intact, or the
  // guard is just a redirect to "/" wearing a costume.
  const KEPT: Array<[string, string]> = [
    ["/board", "/board"],
    ["/history?status=Done", "/history?status=Done"],
    ["/admin/audit", "/admin/audit"],
  ];
  const mangled = KEPT.filter(([input, want]) => safeRedirect(input, "/") !== want);
  probe("A07-offsite-keeps", "and a same-origin target is preserved, query and all",
        mangled.length === 0, mangled.map(([i]) => `${i} -> ${safeRedirect(i, "/")}`).join("  "));

  // =====================================================================
  section("A08 Software and Data Integrity Failures");

  /*
   * Mass assignment through "Not on the list?". `addName` reads `name` and
   * nothing else, so a body carrying a role, an id or an address is the same
   * as one that does not: a client row with fields the server chose.
   */
  const assigner = new Browser();
  const assignHtml = await (await assigner.raw(`${APP}/hello`)).text();
  await assigner.submit(`${APP}/hello`, assignHtml, {
    name: "Ines Tegrity",
    role: "admin",
    id: "chosen-by-attacker",
    initials: "ZZ",
    email: "integrity@office.example",
  }, isAddNameForm);
  const assigned = await db.user.findFirst({ where: { name: "Ines Tegrity" } });
  probe("A08-massassign-works", "adding a name does add it (or the probe below is vacuous)",
        assigned !== null, "no row for the added name");
  probe("A08-massassign", "privileged fields cannot be set from the request body",
        assigned?.role === "client" &&
        assigned.id !== "chosen-by-attacker" &&
        assigned.email === null &&
        assigned.initials !== "ZZ" &&
        (await db.user.count({ where: { role: "admin" } })) === 1,
        JSON.stringify(assigned));

  probe("A08-lockfile", "a dependency lockfile is committed",
        await Bun_exists("package-lock.json"));

  // =====================================================================
  section("A10 Server-Side Request Forgery");

  // The one place the server fetches an address a caller supplies. Which
  // addresses it accepts is pinned in detail by verify:import; here it is
  // enough that the cloud metadata service is not one of them, whether
  // importing is switched on (422) or off (501).
  const ssrf = await attacker.json("/api/import/files", {
    url: "http://169.254.169.254/latest/meta-data/",
  });
  probe("A10-metadata", "a link-local import URL is refused before it is fetched",
        ssrf.status === 422 || ssrf.status === 501,
        `status ${ssrf.status} ${(await ssrf.text()).slice(0, 90)}`);

  // =====================================================================
  console.info(
    `\n${passed} probes passed, ${findings.length} flagged.` +
      (findings.length
        ? "\n\nFLAGGED:\n" + findings.map((f) => `  ${f.id}  ${f.title}\n      ${f.detail}`).join("\n")
        : ""),
  );
  process.exitCode = findings.length ? 1 : 0;
}

async function Bun_exists(p: string) {
  const { access } = await import("node:fs/promises");
  return access(p).then(() => true).catch(() => false);
}

main().catch((e) => { console.error(e); process.exitCode = 1; })
      .finally(() => db.$disconnect());
