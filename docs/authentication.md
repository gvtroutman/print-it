# How identity works

[← back to the README](../README.md)

**There is no sign-in.** Nobody has an account, a password, a passkey or an
invitation. You open the app, pick your name from a list — or type it if this
is your first time — and that is who you are on this device until you say
otherwise. The printer owner has one extra step: a password, from the server's
environment, that unlocks the owner pages.

That is a deliberate trade, and the rest of this page is honest about what it
costs. The short version: **names are not proof of identity.** Anyone who can
reach the app can pick any name. That is fine on an office network where the
people who can reach it are the people who work there, and it is not fine
anywhere else — see [Do not put this on the internet](#do-not-put-this-on-the-internet).

### Why there is no sign-in

This fork used to have the full set: invitation links, usernames and
passwords, passkeys, a breach check, admin-minted password resets, a
twenty-minute session and a "confirm it is still you" prompt before handing out
access. Each piece was reasonable on its own, and every one of them was
something a colleague could get stuck on, for an app whose whole job is "please
print this for me".

For five people sharing one printer and one office, the question a sign-in
answers — *is this really Ayla?* — is one the office already answers. The
question the app actually needs answered is *whose ticket is this?*, and a name
does that. So the machinery went, and with it the mail server, the outbound
breach check, the session table and three dependencies.

What was kept is the part that protects the printer owner's controls, because
those are the ones a curious colleague could do real damage with.

### Picking a name

`/hello` lists everybody who has used the app, alphabetically. Click yours, or
type a new one:

- Typing a name that already exists, in any case, **picks that person** rather
  than making a twin. `ayla` and `Ayla` are the same person.
- A new name creates a `client` user row with nothing in it but the name and
  its initials. Names are 1–40 characters.
- The printer owner's name is refused. Their row never appears on the list and
  cannot be picked — see [the owner](#the-printer-owner) below.

The choice is remembered in a cookie, `ppp.who`, and nothing else: no server
session, no row to expire.

**"Not Ayla? Switch"** in the account menu forgets it (and locks the owner
pages too, if they were unlocked) and goes back to `/hello`. That is the whole
of "signing out".

### The `ppp.who` cookie

```
ppp.who = <userId>.<HMAC-SHA256(APP_SECRET, "who:" + userId)>
```

`HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when `APP_URL` is `https://`,
and it lasts a year — picking your name once per device is enough.

The signature does **not** make the name a credential; anyone can get a
validly signed cookie for any client by clicking that name on `/hello`. What it
does is keep the cookie to values this app wrote. A hand-edited `ppp.who`
naming some other row id — the printer owner's, say — fails the check and is
treated as no name at all. And even a correctly signed value can only ever
resolve to a **client** row: `currentUser()` looks it up with `role: "client"`,
so the owner's row is unreachable through this cookie by construction, not by
convention.

The code is short and worth reading: [`src/lib/identity-token.ts`](../src/lib/identity-token.ts)
signs and reads both cookies, [`src/lib/identity.ts`](../src/lib/identity.ts)
writes them, and [`src/app/actions/identity.ts`](../src/app/actions/identity.ts)
is every action that changes who you are.

### What anyone on the network can do

Be specific about it, because this is the trade. Anyone who can load the app
can pick any client's name, and then do everything that person can:

- read all of their tickets, conversations and uploaded models;
- comment on those tickets as them;
- withdraw their requests, change their priorities and re-queue their prints;
- submit new print requests and feature requests in their name;
- read their Activity feed.

They cannot do anything the printer owner does — advance, decline or flag a
ticket, edit the catalogue or the benefits, read the audit trail — without
`ADMIN_PASSWORD`.

The audit trail still records who did what, but read it for what it is: the
name somebody *picked*, not the person who was at the keyboard. Every name
picked and added is in it (`name.picked`, `name.added`) with the client
address where [`TRUST_PROXY_HEADERS`](deployment.md#why-trust_proxy_headers-is-a-separate-switch)
allows one, which is enough to notice something odd and not enough to prove
anything.

There is also no way to keep somebody out. Suspending an account was a
sign-in feature, and it went with sign-in. If someone should no longer be
ordering prints, that has to be enforced by who can reach the app at all.

### Do not put this on the internet

**If the app is reachable from the public internet, anyone with the URL can
submit prints, read anybody's tickets and models by picking their name, and
comment as them.** There is no sign-in standing in the way, by design.

That includes the deployments this repository ships overlays for:
`docker-compose.tunnel.yml` (a Cloudflare Tunnel) and `docker-compose.proxy.yml`
behind a reverse proxy with a public DNS name both make the app reachable from
anywhere unless you add something in front.

Keep it on the office network. If people must reach it from elsewhere, put a
layer that *does* authenticate in front of the whole hostname — a VPN
(WireGuard, Tailscale), or an authenticating proxy such as Cloudflare Access
on the tunnel. One thing to know before choosing the proxy: the "Open in
PrusaSlicer" helper fetches models with `curl`, not a browser, so a proxy that
demands its own login will refuse it unless that path is let through — see
[Open in PrusaSlicer](prusaslicer.md).

`ADMIN_PASSWORD` protects the owner pages on the internet as well as anywhere
else, but it protects nothing else.

### The printer owner

There is exactly one `admin` user row, the printer owner. Nobody picks it;
`prisma/seed.ts` writes it from `ADMIN_NAME` (and `ADMIN_EMAIL`, which is
optional and stored but not used for anything — the app sends no email). The
seed is an upsert, so changing `ADMIN_NAME` and re-running it renames the owner.

The owner pages — `/queue`, `/admin/catalog`, `/admin/benefits`,
`/admin/prints`, `/admin/audit` and `/frr/queue` — are unlocked at `/owner` with
`ADMIN_PASSWORD`, set in the environment. Visiting any of them without it sends
you there and back again afterwards. If `ADMIN_PASSWORD` is not set, the owner
pages are switched off and `/owner` says so.

Unlocking sets a second cookie:

```
ppp.owner = <expiresAt>.<HMAC-SHA256(APP_SECRET, "owner:" + expiresAt + ":" + sha256(ADMIN_PASSWORD))>
```

- **A browser-session cookie** (no `Max-Age`), so closing the browser locks the
  owner pages — and it carries its own expiry, **twelve hours**, so a browser
  that is never closed does not stay unlocked forever.
- **Changing `ADMIN_PASSWORD` locks every browser at once.** The password's
  digest is inside the MAC, so every owner cookie already handed out stops
  validating the moment the app restarts with a new one. That is the revocation
  story, and it is the only one: there is no list of unlocked browsers to clear.
- **"Lock owner pages"** in the account menu clears it immediately. On a shared
  machine, use it.
- With `ppp.owner` valid, you are the printer owner regardless of what
  `ppp.who` says.

The typed password is compared in constant time against `ADMIN_PASSWORD`.
Wrong guesses are limited to **ten a minute per client address**, counted in
memory: enough to make guessing slow, and it resets when the container
restarts. The address is the one `TRUST_PROXY_HEADERS` allows the app to
believe; with that unset, every client shares a single counter, which means
somebody guessing can also keep the real owner waiting for a minute. Set it
correctly behind a proxy.

Unlocking, refusing and locking are all audited — `owner.unlocked`,
`owner.unlock_refused`, `owner.locked` — so a run of refusals shows up on
`/admin/audit` where the owner will see it.

#### Why there is now an `ADMIN_PASSWORD`

Earlier versions refused to have one, on the grounds that a password in an env
file is also in `docker inspect`, in the shell history that wrote the file and
in every backup of the host, still valid months later. That is all still true.
What changed is the alternative: the old answer was a one-use set-password link
printed by the migrator, which only made sense with accounts to set passwords
on. With no accounts, a single owner secret in the environment is the smallest
thing that works.

So treat it like the other secrets in `.env.docker`: long, random, not reused
anywhere else, and rotated — by editing the file and restarting the app — if
it may have leaked. Rotating also locks every browser that had it.

### Exactly one admin

Application code refuses to seed a second admin, but application code is one
bug away from being wrong, so the storage layer enforces it too:

```sql
CREATE UNIQUE INDEX "user_single_admin" ON "user" (role) WHERE role = 'admin';
```

The index covers only admin rows, so it permits any number of clients and
exactly one admin.

### Authorisation

[`src/lib/authz.ts`](../src/lib/authz.ts) works out who is at the keyboard —
an unlocked owner cookie makes you the printer owner, otherwise `ppp.who` names
a client, otherwise nobody — and holds the handoff's core rule as one exported
fragment that every query composes:

```ts
export function storyScope(actor: Actor): Prisma.StoryWhereInput {
  return actor.role === "admin" ? {} : { uploaderId: actor.id };
}
```

`getStoryOr404` answers **404, not 403**, for a client asking after somebody
else's story — a 403 would confirm the story exists. That still matters even
without sign-in: it stops one person stumbling into another's ticket by
editing a URL, without picking their name on purpose.

`requireUser` sends somebody with no name to `/hello`; `requireAdmin` sends
somebody who has not unlocked the owner pages to `/owner`. Both return the
visitor to where they were going afterwards, through
[`src/lib/safe-redirect.ts`](../src/lib/safe-redirect.ts).

`src/middleware.ts` only checks that one of the two cookies is *present*, to
send a visitor with no name to `/hello` instead of flashing a page and then
bouncing. It is deliberately not the boundary: a forged cookie gets past it and
no further. The real checks — including the signatures — run in every page,
every server action and every route handler.

### The API

The JSON API at `/api/*` uses the same two cookies, and nothing else: there are
no bearer tokens, no API keys and no `Authorization` header. A call with no
name gets `401 {"error":"Pick your name first."}`; a client calling an
owner-only endpoint gets 403. From a script, copy the cookie out of a browser
where you have picked your name — and `ppp.owner` as well for owner endpoints.
The details are in [the API guide](api.md).

The one other credential is the short-lived token inside an "Open in
PrusaSlicer" link, an HMAC signed with `APP_SECRET` that names one person and
one model for half an hour. [Open in PrusaSlicer](prusaslicer.md) explains why
it exists.

### Other decisions worth knowing

- **`APP_SECRET` signs everything** — `ppp.who`, `ppp.owner` and slicer links.
  The app refuses to sign anything without it rather than falling back to a
  default somebody could read in the source. Lose it, or change it, and every
  cookie stops validating: everyone picks their name again, the owner unlocks
  again, and nothing else is lost. Tickets, names and history are rows, not
  cookies.
- **CSRF** rests on `SameSite=Lax` plus an `Origin` check on every write that
  goes through the API boundary: a write whose `Origin` names somewhere other
  than `APP_URL` is refused. Server-action forms get Next's own origin check.
- **`Secure` follows the URL scheme**, not `NODE_ENV`: the cookies are marked
  `Secure` when `APP_URL` is `https://`, and a production build refuses to
  start on any other scheme unless `APP_URL` is a loopback address — see
  [deployment](deployment.md#https-is-not-optional).
- **CSP carries a per-request nonce** minted in `src/middleware.ts`, so
  `script-src` needs no `'unsafe-inline'`.
- **`/hello` and `/owner` work without JavaScript.** Both are plain forms whose
  actions finish in a redirect, so a broken script — Cloudflare's Rocket
  Loader, say — cannot stop anyone getting in.
- **`/hello` does not name the printer owner.** Pages that address the owner by
  first name ("Send it to Ruben") only render once somebody has picked a name.
  The list of clients' names is visible to anyone who loads `/hello`, which is
  the price of a list to pick from.
