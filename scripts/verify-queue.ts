import "./_env";
/**
 * End-to-end check of the admin queue and the status flow.
 *
 *   npm run verify:queue
 *
 * Drives the real forms — the admin panel is plain server-rendered forms, so
 * this posts exactly what a browser with JavaScript off would post. Which is
 * also the point: the flow has to work without a client bundle.
 *
 * DESTRUCTIVE: wipes users and stories. Development database only.
 */
import { db } from "../src/lib/db";
import { clientIpFrom, ipSource } from "../src/lib/client-ip";
import { BOARD, nextStatus, storyRef as storyRefOf } from "../src/lib/scope";
import { actAs, createClient } from "./_accounts";

const APP = process.env.APP_URL ?? "http://localhost:3000";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  console.info(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || !detail ? "" : `\n          ${detail}`}`);
  ok ? passed++ : failures.push(name);
}
const section = (t: string) =>
  console.info(`\n── ${t} ${"─".repeat(Math.max(0, 54 - t.length))}`);

class Browser {
  jar = new Map<string, string>();
  private store(r: Response) {
    for (const line of r.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const i = pair!.indexOf("=");
      const k = pair!.slice(0, i).trim();
      const v = pair!.slice(i + 1).trim();
      if (!v || line.includes("Max-Age=0")) this.jar.delete(k);
      else this.jar.set(k, v);
    }
  }
  private headers(): Record<string, string> {
    const h: Record<string, string> = { origin: APP };
    if (this.jar.size) h.cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    return h;
  }
  async raw(url: string, init: RequestInit = {}) {
    const r = await fetch(url, {
      ...init,
      redirect: "manual",
      headers: { ...(init.headers ?? {}), ...this.headers() },
    });
    this.store(r);
    return r;
  }
  async go(url: string, init: RequestInit = {}) {
    let r = await this.raw(url, init);
    for (let i = 0; i < 8; i++) {
      const loc = r.headers.get("location");
      if (!loc || r.status < 300 || r.status >= 400) break;
      r = await this.raw(new URL(loc, url).toString());
    }
    return r;
  }
  /** Replays a server-action form the way a JS-less browser does. */
  async submit(url: string, html: string, formIndex: number, values: Record<string, string>) {
    const forms = html.match(/<form\b[\s\S]*?<\/form>/g) ?? [];
    const form = forms[formIndex];
    if (!form) throw new Error(`no form #${formIndex} on ${url}`);
    const body = new FormData();
    for (const tag of form.match(/<input\b[^>]*>/g) ?? []) {
      if (!tag.includes('type="hidden"')) continue;
      const n = /name="([^"]*)"/.exec(tag)?.[1];
      const v = /value="([^"]*)"/.exec(tag)?.[1] ?? "";
      if (n) body.append(unescapeHtml(n), unescapeHtml(v));
    }
    for (const [k, v] of Object.entries(values)) body.set(k, v);
    return this.raw(url, { method: "POST", body });
  }
}
/**
 * React SSR puts an empty comment between static text and an interpolation,
 * so "offers {tip}" reaches the wire as "offers <!-- -->A beer". Asserting on
 * the raw markup therefore fails on copy that is perfectly correct.
 */
const rendered = (html: string) => html.replace(/<!--\s*-->/g, "");

/** Reads one parameter out of a Location header, with form decoding. */
function paramOf(location: string | null, key: string): string {
  if (!location) return "";
  const q = location.split("?")[1] ?? "";
  return new URLSearchParams(q).get(key) ?? "";
}

const unescapeHtml = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
   .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/**
 * A browser that has already said who it is: the cookie picking a name on
 * `/hello` leaves behind, or for the owner the one `/owner` does. The owner
 * section below also unlocks through the real form, once, to prove the short
 * way and the long way agree.
 */
const as = (user: { id: string; role: string }) => actAs(new Browser(), user);

/**
 * Where an owner-only surface sends somebody who is not the owner: to the
 * password prompt, carrying them back afterwards. Pages and form actions both
 * end in a redirect there; neither renders anything of the owner's first.
 */
const toOwnerPrompt = (r: Response) =>
  r.status >= 300 && r.status < 400 && (r.headers.get("location") ?? "").includes("/owner");

/** Finds the index of the form whose markup contains a marker. */
function formIndexContaining(html: string, marker: string): number {
  const forms = html.match(/<form\b[\s\S]*?<\/form>/g) ?? [];
  return forms.findIndex((f) => f.includes(marker));
}

async function makeStory(uploaderId: string, title: string, status = "Requested") {
  return db.story.create({
    data: {
      title, status: status as never, uploaderId,
      material: "PETG", colorName: "Slate", colorHex: "#4a5d78", tip: "A beer",
      quantity: 1, note: "", filename: "part.stl", fileSize: 1234,
      mimeType: "model/stl", storageKey: `k-${title}`, dims: "10 × 10 × 10 mm",
    },
  });
}

async function main() {
  section("setup");
  await db.auditEvent.deleteMany();
  await db.notification.deleteMany();
  await db.story.deleteMany();
  await db.user.deleteMany({ where: { role: "client" } });

  const admin = await db.user.findFirst({ where: { role: "admin" } });
  if (!admin) throw new Error("No admin — run npm run db:seed");
  const ayla = await createClient("Ayla Berg", { email: "ayla@office.example" });

  const ruben = as(admin);
  const client = as(ayla);
  console.info(`  admin=${admin.name}  client=${ayla.name}`);

  // ------------------------------------------------------------------
  section("the queue is admin-only");
  const denied = await client.raw(`${APP}/queue`);
  check("a client is sent to the owner password prompt", toOwnerPrompt(denied),
        `status ${denied.status} ${denied.headers.get("location") ?? ""}`);
  check("which brings them back to the queue once unlocked",
        paramOf(denied.headers.get("location"), "next") === "/queue",
        denied.headers.get("location") ?? "");

  const home = await client.go(`${APP}/`);
  check("a client's home is the rail, not the queue",
        rendered(await home.text()).includes("The backlog"));

  const adminHome = await ruben.go(`${APP}/`);
  check("the admin's home is the queue",
        rendered(await adminHome.text()).includes("queue"));

  // ------------------------------------------------------------------
  section("accepting a ticket");
  const story = await makeStory(ayla.id, "Hook for the monitor arm");
  let page = await (await ruben.go(`${APP}/queue`)).text();
  check("it shows up under Waiting on you",
        page.includes("Waiting on you") && page.includes("Hook for the monitor arm"));
  check("with the wish spelled out", rendered(page).includes("offers A beer"),
        "the wish line did not render as expected");

  const acceptIdx = formIndexContaining(page, "Accept it");
  const accepted = await ruben.submit(`${APP}/queue`, page, acceptIdx, {});
  check("accept redirects with a result",
        accepted.status >= 300 && accepted.status < 400,
        `status ${accepted.status}`);

  let row = await db.story.findUnique({ where: { id: story.id } });
  check("Requested -> Accepted", row?.status === "Accepted", String(row?.status));
  check("the uploader was notified",
        (await db.notification.count({ where: { recipientId: ayla.id, storyId: story.id } })) === 1);
  check("and it was audited",
        (await db.auditEvent.count({ where: { action: "story.status_changed" } })) === 1);
  // `+` is form encoding for a space; decodeURIComponent leaves it alone,
  // so the message has to be read with URLSearchParams.
  check("the toast names the person told",
        paramOf(accepted.headers.get("location"), "toast").includes("Ayla Berg notified"),
        paramOf(accepted.headers.get("location"), "toast"));

  // ------------------------------------------------------------------
  section("priority orders the queue, and is changed on the ticket");
  const routine = await makeStory(ayla.id, "Routine drawer organiser");
  const rush = await makeStory(ayla.id, "Rush job for Friday");
  await db.story.update({ where: { id: rush.id }, data: { priority: "high" } });
  const someday = await makeStory(ayla.id, "Someday desk toy");
  await db.story.update({ where: { id: someday.id }, data: { priority: "low" } });

  const ordered = rendered(await (await ruben.go(`${APP}/queue`)).text());
  const at = (title: string) => ordered.indexOf(title);
  check("the urgent one is first in Waiting on you, though it was filed later",
        at("Rush job for Friday") > 0 && at("Rush job for Friday") < at("Routine drawer organiser") &&
        at("Routine drawer organiser") < at("Someday desk toy"),
        `${at("Rush job for Friday")} / ${at("Routine drawer organiser")} / ${at("Someday desk toy")}`);

  const ticket = await (await client.go(`${APP}/story/${routine.id}`)).text();
  const prioForm = (ticket.match(/<form\b[\s\S]*?<\/form>/g) ?? [])
    .findIndex((f) => f.includes('name="priority"'));
  check("the requester's ticket offers a priority control", prioForm >= 0);
  const set = await client.submit(`${APP}/story/${routine.id}`, ticket, prioForm, { priority: "high" });
  check("submitting it is accepted", set.status >= 300 && set.status < 400, `status ${set.status}`);
  check("and the ticket's priority changed",
        (await db.story.findUnique({ where: { id: routine.id } }))?.priority === "high");
  const board = rendered(await (await client.go(`${APP}/board`)).text());
  const cardOf = (title: string) => {
    const i = board.indexOf(title);
    return i < 0 ? "" : board.slice(Math.max(0, i - 900), i);
  };
  check("a high ticket's card says so", />High</.test(cardOf("Routine drawer organiser")));
  await db.story.update({ where: { id: routine.id }, data: { priority: "medium" } });
  const boardAfter = rendered(await (await client.go(`${APP}/board`)).text());
  const j = boardAfter.indexOf("Routine drawer organiser");
  check("a medium one's does not",
        j > 0 && !/>(High|Medium|Low)</.test(boardAfter.slice(Math.max(0, j - 900), j)));

  await db.story.update({ where: { id: routine.id }, data: { status: "Done" } });
  const done = await (await client.go(`${APP}/story/${routine.id}`)).text();
  check("a finished ticket no longer offers the control", !done.includes('name="priority"'));
  await db.story.deleteMany({ where: { id: { in: [routine.id, rush.id, someday.id] } } });

  // ------------------------------------------------------------------
  section("prints by person — the owner picks people and sees what they sent");
  const bea = await createClient("Bea Quist", { email: "bea@office.example", initials: "BQ" });
  const aylaPart = await makeStory(ayla.id, "Ayla's cable clip");
  const beaPart = await makeStory(bea.id, "Bea's phone stand", "Done");
  const beaOther = await makeStory(bea.id, "Bea's declined thing", "Declined");

  const hidden = await client.raw(`${APP}/admin/prints`);
  check("a client is sent to the owner prompt from the page", toOwnerPrompt(hidden),
        `status ${hidden.status}`);
  check("and from a selection naming a colleague",
        toOwnerPrompt(await client.raw(`${APP}/admin/prints?who=${bea.id}`)));

  const nobody = rendered(await (await ruben.go(`${APP}/admin/prints`)).text());
  check("with nobody picked it lists the people, each with their count, and no tickets",
        nobody.includes("Bea Quist") && nobody.includes(ayla.name) &&
        nobody.includes("Nobody picked yet") && !nobody.includes("Bea's phone stand"));

  const justBea = rendered(await (await ruben.go(`${APP}/admin/prints?who=${bea.id}`)).text());
  check("picking one person shows everything they uploaded, in any state",
        justBea.includes("Bea's phone stand") && justBea.includes("Bea's declined thing") &&
        justBea.includes("2 tickets from Bea Quist"));
  check("and nobody else's", !justBea.includes("Ayla's cable clip"));

  const both = rendered(await (await ruben.go(`${APP}/admin/prints?who=${bea.id}&who=${ayla.id}`)).text());
  check("picking several shows all of theirs",
        both.includes("Bea's phone stand") && both.includes("Ayla's cable clip"));
  check("a picked person's link takes them back out",
        both.includes(`href="/admin/prints?who=${ayla.id}"`) || both.includes(`href="/admin/prints?who=${bea.id}"`));

  const junk = rendered(await (await ruben.go(`${APP}/admin/prints?who=nobody-real&who=${bea.id}`)).text());
  // Asserted on the links the page draws, not on the whole document: Next
  // copies the raw query string into its own payload, so the junk id is in the
  // HTML either way and "it appears nowhere" would fail for a correct page.
  check("an id that names nobody is dropped — it is in none of the links the page builds",
        junk.includes("Bea's phone stand") && !/href="[^"]*nobody-real/.test(junk) &&
        junk.includes("2 tickets from Bea Quist"));

  await db.story.deleteMany({ where: { id: { in: [aylaPart.id, beaPart.id, beaOther.id] } } });
  await db.user.delete({ where: { id: bea.id } });

  // ------------------------------------------------------------------
  section("the flow only moves forward, one step at a time");
  for (const expected of ["Printing", "Delivery", "Done"]) {
    page = await (await ruben.go(`${APP}/queue`)).text();
    const idx = formIndexContaining(page, `Move to ${expected}`);
    check(`the only offer is "Move to ${expected}"`, idx >= 0);
    if (idx < 0) break;
    await ruben.submit(`${APP}/queue`, page, idx, {});
    row = await db.story.findUnique({ where: { id: story.id } });
    check(`advanced to ${expected}`, row?.status === expected, String(row?.status));
  }

  // Delivery is the end of the line; posting again must not wrap around.
  const atEnd = await ruben.raw(`${APP}/queue`, {
    method: "POST",
    body: (() => { const f = new FormData(); f.set("id", String(story.id)); f.set("from", "/queue"); return f; })(),
  });
  row = await db.story.findUnique({ where: { id: story.id } });
  check("a bare POST cannot drive an action", row?.status === "Done",
        `status is now ${row?.status} (raw POST returned ${atEnd.status})`);

  // ------------------------------------------------------------------
  section("declining");
  const fresh = await makeStory(ayla.id, "Cable comb, 6 slots");
  page = await (await ruben.go(`${APP}/queue`)).text();
  const declineIdx = formIndexContaining(page, "Yes, decline");
  await ruben.submit(`${APP}/queue`, page, declineIdx, {});
  row = await db.story.findUnique({ where: { id: fresh.id } });
  check("Requested -> Declined", row?.status === "Declined", String(row?.status));
  check("declining is audited",
        (await db.auditEvent.count({ where: { action: "story.declined" } })) === 1);

  /*
   * A bare POST carries no action id, so Next never routes it and nothing runs.
   * That makes this a check that a stray POST at the page URL is inert — NOT a
   * check that the transition rule holds, which it would pass even if
   * `assertTransition` were deleted.
   *
   * The rule itself is covered, and properly: `verify:api` asserts a 403 for
   * declining an Accepted ticket, and both front doors call the same
   * `src/lib/stories.ts`, so the service is exercised either way. Named for
   * what it does rather than what it looks like it does.
   */
  const late = await makeStory(ayla.id, "Too late to decline", "Printing");
  const lateRes = await ruben.raw(`${APP}/story/${late.id}`, {
    method: "POST",
    body: (() => { const f = new FormData(); f.set("id", String(late.id)); f.set("from", `/story/${late.id}`); return f; })(),
  });
  row = await db.story.findUnique({ where: { id: late.id } });
  check("a stray POST at a ticket URL is inert", row?.status === "Printing",
        `status ${row?.status}, response ${lateRes.status}`);

  // ------------------------------------------------------------------
  section("flagging");
  const flagged = await makeStory(ayla.id, "Thin walls somewhere", "Accepted");
  page = await (await ruben.go(`${APP}/story/${flagged.id}`)).text();
  const flagIdx = formIndexContaining(page, 'name="reason"');
  await ruben.submit(`${APP}/story/${flagged.id}`, page, flagIdx, { reason: "walls are 0.6mm in two spots" });
  row = await db.story.findUnique({ where: { id: flagged.id } });
  check("the ticket is flagged", row?.flagged === true);
  check("with the reason the admin typed",
        row?.flagReason === "walls are 0.6mm in two spots", row?.flagReason ?? "");
  check("flagging does NOT change the status", row?.status === "Accepted", String(row?.status));
  check("the reason reaches the uploader's notification",
        (await db.notification.findFirst({
          where: { recipientId: ayla.id, storyId: flagged.id }, orderBy: { createdAt: "desc" },
        }))?.text.includes("0.6mm") === true);

  const emptyReason = await ruben.submit(`${APP}/story/${flagged.id}`,
    await (await ruben.go(`${APP}/story/${flagged.id}`)).text(),
    formIndexContaining(await (await ruben.go(`${APP}/story/${flagged.id}`)).text(), 'name="reason"'),
    { reason: "x" });
  check("a reason under three characters is refused",
        paramOf(emptyReason.headers.get("location"), "error").length > 0,
        emptyReason.headers.get("location") ?? "");

  page = await (await ruben.go(`${APP}/story/${flagged.id}`)).text();
  const clearIdx = formIndexContaining(page, "Clear the flag");
  check("a flag can be cleared", clearIdx >= 0, "no way to clear it — that is a dead end");
  if (clearIdx >= 0) {
    await ruben.submit(`${APP}/story/${flagged.id}`, page, clearIdx, {});
    row = await db.story.findUnique({ where: { id: flagged.id } });
    check("clearing removes the flag and its reason",
          row?.flagged === false && row?.flagReason === null);
  }

  // ------------------------------------------------------------------
  section("a client cannot drive any of it");
  const target = await makeStory(ayla.id, "Not yours to move");
  const before = target.status;
  for (const [label, path] of [
    ["queue", `${APP}/queue`],
    ["story detail", `${APP}/story/${target.id}`],
  ] as Array<[string, string]>) {
    const f = new FormData();
    f.set("id", String(target.id));
    f.set("from", path.replace(APP, ""));
    await client.raw(path, { method: "POST", body: f });
    const after = await db.story.findUnique({ where: { id: target.id } });
    check(`posting the ${label} action as a client changes nothing`,
          after?.status === before, `status became ${after?.status}`);
  }
  // A bare POST carries no action id, so the two above prove only that a
  // stray request is inert. Replaying the owner's own form — the real action
  // id, lifted from a page the client cannot load — is the attack that
  // matters, and it has to meet `requireAdmin` inside the action.
  const ownersQueue = await (await ruben.go(`${APP}/queue`)).text();
  const acceptTarget = (ownersQueue.match(/<form\b[\s\S]*?<\/form>/g) ?? [])
    .findIndex((f) => f.includes("Accept it") && f.includes(`value="${target.id}"`));
  check("the owner's queue offers to accept it", acceptTarget >= 0);
  if (acceptTarget >= 0) {
    const stolen = await client.submit(`${APP}/queue`, ownersQueue, acceptTarget, {});
    check("replaying the owner's real Accept form as a client changes nothing",
          (await db.story.findUnique({ where: { id: target.id } }))?.status === before);
    check("and sends them to the owner prompt instead", toOwnerPrompt(stolen),
          `status ${stolen.status} ${stolen.headers.get("location") ?? ""}`);
  }

  // The verbs those owner actions write, named — not every `story.*`. A client
  // is a legitimate actor on some of them now (changing the priority of their
  // own ticket, above), and "no story verb at all" would have this check fail
  // for a reason that has nothing to do with what it is guarding.
  check("the client never appears as the actor of an owner's action",
        (await db.auditEvent.count({
          where: {
            actorId: ayla.id,
            action: { in: ["story.status_changed", "story.declined", "story.flagged", "story.flag_cleared"] },
          },
        })) === 0);

  // ------------------------------------------------------------------
  section("the conversation");
  const talk = await makeStory(ayla.id, "Something to discuss", "Accepted");

  // The client writes first.
  let talkPage = await (await client.go(`${APP}/story/${talk.id}`)).text();
  let sayIdx = formIndexContaining(talkPage, 'name="body"');
  check("a client gets a composer on their own ticket", sayIdx >= 0);
  await client.submit(`${APP}/story/${talk.id}`, talkPage, sayIdx, {
    body: "Slate if you have it, otherwise anything dark.",
  });
  let thread = await db.comment.findMany({ where: { storyId: talk.id } });
  check("the comment is stored", thread.length === 1, `${thread.length} comments`);
  check("attributed to the client", thread[0]?.authorId === ayla.id);
  check("and the printer owner is told",
        (await db.notification.count({
          where: { recipientId: admin.id, storyId: talk.id },
        })) === 1);
  check("the client is not told about their own comment",
        (await db.notification.count({
          where: { recipientId: ayla.id, storyId: talk.id },
        })) === 0);

  // The owner replies.
  talkPage = await (await ruben.go(`${APP}/story/${talk.id}`)).text();
  check("the earlier comment is on the page",
        rendered(talkPage).includes("otherwise anything dark"));
  sayIdx = formIndexContaining(talkPage, 'name="body"');
  await ruben.submit(`${APP}/story/${talk.id}`, talkPage, sayIdx, {
    body: "Only bone white on the spool today — alright?",
  });
  check("the reply is stored",
        (await db.comment.count({ where: { storyId: talk.id } })) === 2);
  check("and this time the uploader is told",
        (await db.notification.count({
          where: { recipientId: ayla.id, storyId: talk.id },
        })) === 1);
  check("commenting is audited",
        (await db.auditEvent.count({ where: { action: "comment.added" } })) === 2);

  // Empty is refused.
  const emptySaid = await client.submit(
    `${APP}/story/${talk.id}`,
    await (await client.go(`${APP}/story/${talk.id}`)).text(),
    formIndexContaining(await (await client.go(`${APP}/story/${talk.id}`)).text(), 'name="body"'),
    { body: "   " },
  );
  check("an empty comment is refused",
        paramOf(emptySaid.headers.get("location"), "error").length > 0 &&
        (await db.comment.count({ where: { storyId: talk.id } })) === 2,
        paramOf(emptySaid.headers.get("location"), "error"));

  // Someone else's ticket is not a place to talk.
  const mallory = await createClient("Mallory Vance", { email: "mallory@office.example" });
  const other = as(mallory);
  const trespass = new FormData();
  trespass.set("storyId", String(talk.id));
  trespass.set("body", "I should not be able to say this");
  await other.raw(`${APP}/story/${talk.id}`, { method: "POST", body: trespass });
  check("another client cannot comment on a ticket they cannot see",
        (await db.comment.count({ where: { storyId: talk.id } })) === 2,
        "a comment landed on someone else's ticket");
  check("and is never recorded as having tried successfully",
        (await db.auditEvent.count({ where: { actorId: mallory.id, action: "comment.added" } })) === 0);

  // A hostile body is rendered as text.
  talkPage = await (await client.go(`${APP}/story/${talk.id}`)).text();
  await client.submit(`${APP}/story/${talk.id}`, talkPage,
    formIndexContaining(talkPage, 'name="body"'),
    { body: '<img src=x onerror=alert(1)>' });
  const xssPage = await (await client.go(`${APP}/story/${talk.id}`)).text();
  check("a hostile comment body is escaped, not rendered",
        !/<img\s+src=x/.test(xssPage) && xssPage.includes("&lt;img"),
        "raw markup from a comment reached the page");

  // ------------------------------------------------------------------
  section("saying who you are, through the real form");
  /*
   * Everywhere else in this suite the cookies are minted directly. This is the
   * one place the front door is walked, so the short way round cannot drift
   * from what `/hello` actually does.
   */
  const newcomer = new Browser();
  const hello = await newcomer.go(`${APP}/hello`);
  const helloHtml = await hello.text();
  check("the name picker opens with no cookie at all", hello.status === 200, `status ${hello.status}`);
  check("and lists the people who have picked a name",
        rendered(helloHtml).includes("Ayla Berg"));
  check("but never the printer owner, who is not on that list",
        !helloHtml.includes(`value="${admin.id}"`));

  const addIdx = formIndexContaining(helloHtml, 'name="name"');
  const added = await newcomer.submit(`${APP}/hello`, helloHtml, addIdx, { name: "Gwen Oner" });
  const gwen = await db.user.findFirst({ where: { name: "Gwen Oner" } });
  check("adding a name makes a client row", gwen?.role === "client", `status ${added.status}`);
  check("and remembers it on this device", newcomer.jar.has("ppp.who"));
  check("which is enough to reach the board",
        rendered(await (await newcomer.go(`${APP}/board`)).text()).includes("backlog"));
  check("the new name is in the trail",
        (await db.auditEvent.count({ where: { action: "name.added", actorId: gwen?.id } })) === 1);

  const twin = new Browser();
  const twinPage = await (await twin.go(`${APP}/hello`)).text();
  await twin.submit(`${APP}/hello`, twinPage, formIndexContaining(twinPage, 'name="name"'), {
    name: "  gwen   ONER ",
  });
  check("typing a name that exists picks that person instead of making a twin",
        (await db.user.count({ where: { name: { equals: "Gwen Oner", mode: "insensitive" } } })) === 1 &&
        (await db.auditEvent.count({ where: { action: "name.picked", actorId: gwen?.id } })) === 1);

  const posing = new Browser();
  const posePage = await (await posing.go(`${APP}/hello`)).text();
  const posed = await posing.submit(`${APP}/hello`, posePage,
    formIndexContaining(posePage, 'name="name"'), { name: admin.name.toUpperCase() });
  check("the owner's name cannot be added as a client",
        paramOf(posed.headers.get("location"), "error") === "owner" && !posing.jar.has("ppp.who"),
        posed.headers.get("location") ?? "");

  // The pick buttons carry the id in the button, not a hidden input, so the
  // id is whatever the request says. Naming the owner's row must not work.
  const pickIdx = formIndexContaining(posePage, 'name="userId"');
  check("existing names are offered as buttons", pickIdx >= 0);
  if (pickIdx >= 0) {
    const picked = await posing.submit(`${APP}/hello`, posePage, pickIdx, { userId: admin.id });
    check("picking the owner's row by id is refused",
          paramOf(picked.headers.get("location"), "error") === "unknown" && !posing.jar.has("ppp.who"),
          picked.headers.get("location") ?? "");
  }

  // ------------------------------------------------------------------
  section("the owner pages are unlocked with ADMIN_PASSWORD");

  const counter = new Browser();
  const prompt = await counter.go(`${APP}/owner?next=/admin/prints`);
  const promptHtml = await prompt.text();
  check("the owner prompt opens with no cookie", prompt.status === 200, `status ${prompt.status}`);
  const unlockIdx = formIndexContaining(promptHtml, 'name="password"');
  check("and asks for the password", unlockIdx >= 0);

  const refusedBefore = await db.auditEvent.count({ where: { action: "owner.unlock_refused" } });
  const wrong = await counter.submit(`${APP}/owner`, promptHtml, unlockIdx, {
    password: "not-the-owner-password",
  });
  check("a wrong password is refused",
        paramOf(wrong.headers.get("location"), "error") === "wrong" && !counter.jar.has("ppp.owner"),
        wrong.headers.get("location") ?? "");
  check("and the refusal is in the trail, with no actor",
        (await db.auditEvent.count({ where: { action: "owner.unlock_refused", actorId: null } })) ===
          refusedBefore + 1);

  const password = process.env.ADMIN_PASSWORD ?? "";
  const right = await counter.submit(`${APP}/owner`, promptHtml, unlockIdx, { password });
  check("the right password unlocks the owner pages", counter.jar.has("ppp.owner"),
        `status ${right.status} ${right.headers.get("location") ?? ""} — does ADMIN_PASSWORD match the app's?`);
  check("and goes where it was asked to",
        (right.headers.get("location") ?? "").endsWith("/admin/prints"),
        right.headers.get("location") ?? "");
  // No Max-Age: it should not outlive the browser. Its own expiry is in the
  // signed value, which the security probe tests separately.
  const ownerSetCookie = right.headers.getSetCookie().find((c) => c.startsWith("ppp.owner=")) ?? "";
  check("the owner cookie is a browser-session cookie, HttpOnly",
        ownerSetCookie !== "" && !/max-age|expires/i.test(ownerSetCookie) && /httponly/i.test(ownerSetCookie),
        ownerSetCookie);
  check("the unlocked browser is the owner",
        (await counter.raw(`${APP}/queue`)).status === 200);
  check("and unlocking is audited, as the owner",
        (await db.auditEvent.count({ where: { action: "owner.unlocked", actorId: admin.id } })) >= 1);
  check("the trail never holds the password",
        (await db.auditEvent.findMany({ where: { action: { startsWith: "owner." } } }))
          .every((e) => !JSON.stringify(e).includes("not-the-owner-password") &&
                        (!password || !JSON.stringify(e).includes(password))));

  const clientPrompt = await client.go(`${APP}/owner`);
  check("a client may open the prompt — it is the only way in",
        clientPrompt.status === 200 && (await clientPrompt.text()).includes('name="password"'));

  // ------------------------------------------------------------------
  section("Done is the end of the line, and leaves the rail");

  const shipped = await makeStory(ayla.id, "Bracket, delivered", "Done");
  const boardHtml = rendered(await (await client.go(`${APP}/board`)).text());
  check("a Done ticket is off the board",
        !boardHtml.includes("Bracket, delivered"),
        "the rail is supposed to carry only what is still moving");
  check("but the board still draws the four live rails",
        ["Requested", "Accepted", "Printing", "Delivery"].every((c) => boardHtml.includes(c)));
  check("and Done is not one of them",
        BOARD.length === 4 && !(BOARD as readonly string[]).includes("Done"),
        BOARD.join(", "));

  const mine = rendered(await (await client.go(`${APP}/me`)).text());
  check("it is still visible in the profile", mine.includes("Bracket, delivered"),
        "finished work has to remain findable, or the end state is a delete");

  const doneRow = await db.story.findUnique({ where: { id: shipped.id } });
  check("nothing moves past Done",
        doneRow?.status === "Done" && nextStatus("Done") === null);
  check("and Delivery still moves to Done", nextStatus("Delivery") === "Done");
  await db.story.delete({ where: { id: shipped.id } });

  // ------------------------------------------------------------------
  section("the orderer can withdraw their own request");

  const regret = await makeStory(ayla.id, "Changed my mind", "Requested");
  let storyPage = rendered(await (await client.go(`${APP}/story/${regret.id}`)).text());
  check("the requester is offered the control", storyPage.includes("Withdraw this request"));

  // The "Open in PrusaSlicer" bridge is a bare ppp:// link the story page
  // carries; a local helper handles it (docs/prusaslicer.md). Assert the link
  // is present and carries this ticket's id, so the wiring cannot silently
  // rot — the click's other half lives outside the app and cannot be tested
  // here, but a missing or misnumbered link is the failure that would matter.
  check("the story page offers Open in PrusaSlicer",
        storyPage.includes(`ppp://slice/${regret.id}`),
        "the ppp:// bridge link is missing or has the wrong id");

  const adminView = rendered(await (await ruben.go(`${APP}/story/${regret.id}`)).text());
  check("the printer owner is not — it is not their request",
        !adminView.includes("Withdraw this request"),
        "seeing a ticket is not owning it");

  // Not 'name="storyId"' — the conversation composer carries that too, and
  // matched first. Target the withdraw form by its own button.
  const wIdx = formIndexContaining(storyPage, "Yes, withdraw it");
  check("the withdraw form is found", wIdx >= 0);
  await client.submit(`${APP}/story/${regret.id}`, storyPage, wIdx, {
    storyId: String(regret.id), from: `/story/${regret.id}`,
  });
  check("withdrawing removes the story",
        (await db.story.count({ where: { id: regret.id } })) === 0);
  check("and it is audited",
        (await db.auditEvent.count({
          where: { action: "story.withdrawn", subject: storyRefOf(regret.id) } })) === 1);

  // FRR-101: the window now reaches Accepted — a requester can still pull out
  // after the owner has said yes, as long as it has not reached the bed.
  const acceptedRegret = await makeStory(ayla.id, "Accepted then regretted", "Accepted");
  const accPage = rendered(await (await client.go(`${APP}/story/${acceptedRegret.id}`)).text());
  check("an Accepted ticket now offers withdrawal",
        accPage.includes("Withdraw this request"));
  const accIdx = formIndexContaining(accPage, "Yes, withdraw it");
  await client.submit(`${APP}/story/${acceptedRegret.id}`, accPage, accIdx, {
    storyId: String(acceptedRegret.id), from: `/story/${acceptedRegret.id}`,
  });
  check("an Accepted ticket can be withdrawn",
        (await db.story.count({ where: { id: acceptedRegret.id } })) === 0);
  check("and it is audited as withdrawn",
        (await db.auditEvent.count({
          where: { action: "story.withdrawn", subject: storyRefOf(acceptedRegret.id) } })) === 1);
  check("the owner is told the accepted one is gone",
        (await db.notification.count({
          where: { recipientId: admin.id, text: { contains: "Accepted then regretted" } } })) === 1);

  // Past Accepted the owner has committed the bed and the material; it is no
  // longer the requester's call.
  const underway = await makeStory(ayla.id, "Already on the bed", "Printing");
  storyPage = rendered(await (await client.go(`${APP}/story/${underway.id}`)).text());
  check("a ticket already being printed offers no withdrawal",
        !storyPage.includes("Withdraw this request"));
  const force = new FormData();
  force.set("storyId", String(underway.id));
  force.set("from", `/story/${underway.id}`);
  await client.raw(`${APP}/story/${underway.id}`, { method: "POST", body: force });
  check("and a bare POST cannot force it",
        (await db.story.count({ where: { id: underway.id } })) === 1,
        "a printing ticket was destroyed by a hand-rolled request");

  // Somebody else's ticket must not even be visible, let alone withdrawable.
  const notYours = await makeStory(mallory.id, "Mallory's own", "Requested");
  const steal = new FormData();
  steal.set("storyId", String(notYours.id));
  steal.set("from", `/story/${notYours.id}`);
  await client.raw(`${APP}/story/${notYours.id}`, { method: "POST", body: steal });
  check("and a client cannot withdraw somebody else's",
        (await db.story.count({ where: { id: notYours.id } })) === 1);
  await db.story.deleteMany({ where: { id: { in: [underway.id, notYours.id] } } });

  // ------------------------------------------------------------------
  section("the audit trail believes the right header");

  // Pure function, exercised directly: the alternative is restarting the stack
  // once per mode, and the thing worth testing is precisely which header wins.
  const hdr = (o: Record<string, string>) => new Headers(o);
  const SPOOF = "203.0.113.66";   // what a client sends
  const REAL = "198.51.100.7";    // what the edge saw

  check("unset trusts nothing", ipSource(undefined) === "none");
  check('"false" trusts nothing', ipSource("false") === "none");
  check('"true" means X-Forwarded-For', ipSource("true") === "forwarded");
  check('"cloudflare" means CF-Connecting-IP', ipSource("cloudflare") === "cloudflare");
  check("the value is case- and space-insensitive", ipSource("  CloudFlare ") === "cloudflare");

  check("with no source trusted, nothing is recorded even when headers are present",
        clientIpFrom(hdr({ "x-forwarded-for": SPOOF, "cf-connecting-ip": REAL }), "none") === null);

  check("forwarded mode takes the left-most X-Forwarded-For",
        clientIpFrom(hdr({ "x-forwarded-for": `${REAL}, 10.0.0.1` }), "forwarded") === REAL);
  check("and falls back to X-Real-IP when there is no XFF",
        clientIpFrom(hdr({ "x-real-ip": REAL }), "forwarded") === REAL);

  // The whole point. Cloudflare APPENDS to X-Forwarded-For, so the left-most
  // entry is whatever the client sent; CF-Connecting-IP is set at the edge.
  check("cloudflare mode reads CF-Connecting-IP",
        clientIpFrom(hdr({ "cf-connecting-ip": REAL }), "cloudflare") === REAL);
  check("and ignores a spoofed X-Forwarded-For sitting in front of it",
        clientIpFrom(hdr({ "x-forwarded-for": `${SPOOF}, ${REAL}`, "cf-connecting-ip": REAL }),
                     "cloudflare") === REAL);
  check("with no CF header it records nothing rather than falling back",
        clientIpFrom(hdr({ "x-forwarded-for": SPOOF }), "cloudflare") === null,
        "falling back to XFF here would reopen the hole the mode exists to close");

  check("an absurdly long value is refused rather than stored",
        clientIpFrom(hdr({ "cf-connecting-ip": "a".repeat(200) }), "cloudflare") === null);
  check("surrounding whitespace is trimmed",
        clientIpFrom(hdr({ "cf-connecting-ip": `  ${REAL}  ` }), "cloudflare") === REAL);

  // ------------------------------------------------------------------
  section("the AGPL source offer, and the brand mark");

  const anonPage = await (await new Browser().go(`${APP}/hello`)).text();
  check("the source offer reaches visitors who have not picked a name",
        anonPage.includes("Source · AGPL-3.0"),
        "AGPL section 13 wants it in front of anyone using the app over a network");
  check("and ones who have",
        (await (await ruben.go(`${APP}/board`)).text()).includes("Source · AGPL-3.0"));

  const iconRes = await new Browser().raw(`${APP}/icon.svg`);
  check("the favicon is served, not redirected to the name picker",
        iconRes.status === 200 &&
        (iconRes.headers.get("content-type") ?? "").includes("svg"),
        `status ${iconRes.status} type ${iconRes.headers.get("content-type")}`);
  const iconSvg = await iconRes.text();
  const fills = [...iconSvg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]);
  check("and paints the cherry mark, not the old teal disc",
        fills.includes("#e4322f") && !fills.includes("#12645f"), fills.join(","));

  await db.user.deleteMany({ where: { name: "Gwen Oner", role: "client" } });

  // ------------------------------------------------------------------
  section("History Prints — old work, scoped, filterable, re-queueable");
  const hDone = await makeStory(ayla.id, "Bracket, delivered and done", "Done");
  const hDelivery = await makeStory(ayla.id, "Clip, awaiting collection", "Delivery");
  const hDeclined = await makeStory(ayla.id, "Too thin, declined", "Declined");
  const hActive = await makeStory(ayla.id, "Still on the rail", "Printing");
  const hMallory = await makeStory(mallory.id, "Mallory's finished thing", "Done");

  const hist = rendered(await (await client.go(`${APP}/history`)).text());
  check("history lists the requester's delivered / done / declined",
        hist.includes(storyRefOf(hDone.id)) &&
        hist.includes(storyRefOf(hDelivery.id)) &&
        hist.includes(storyRefOf(hDeclined.id)));
  check("history hides work still on the rail",
        !hist.includes(storyRefOf(hActive.id)), "an active ticket leaked into history");
  check("history is scoped — never another client's",
        !hist.includes(storyRefOf(hMallory.id)) && !hist.includes("Mallory's finished thing"));
  check("each of the requester's own rows offers Print again",
        (hist.match(/Print again/g) ?? []).length >= 3);

  const adminHist = rendered(await (await ruben.go(`${APP}/history`)).text());
  check("the owner's history carries the whole group",
        adminHist.includes(storyRefOf(hDone.id)) && adminHist.includes(storyRefOf(hMallory.id)));

  const doneOnly = rendered(await (await client.go(`${APP}/history?status=Done`)).text());
  check("the status filter narrows to Done only",
        doneOnly.includes(storyRefOf(hDone.id)) && !doneOnly.includes(storyRefOf(hDeclined.id)));
  const tpuOnly = rendered(await (await client.go(`${APP}/history?material=TPU`)).text());
  check("a material filter that matches nothing empties the list",
        !tpuOnly.includes(storyRefOf(hDone.id)));

  // ------------------------------------------------------------------
  section("the uploader sees what happened");
  const feed = await (await client.go(`${APP}/board`)).text();
  check("their Activity count is not zero", /Activity[\s\S]{0,200}[1-9]/.test(feed));

  console.info(
    `\n${passed} checks passed, ${failures.length} failed` +
      (failures.length ? `:\n  - ${failures.join("\n  - ")}` : ""),
  );
  process.exitCode = failures.length ? 1 : 0;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
