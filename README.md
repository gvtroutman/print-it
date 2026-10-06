# Pretty Please Print

[![CI](https://github.com/danileau/prettypleaseprint/actions/workflows/ci.yml/badge.svg)](https://github.com/danileau/prettypleaseprint/actions/workflows/ci.yml)
[![Licence: AGPL-3.0](https://img.shields.io/badge/licence-AGPL--3.0-blue.svg)](LICENSE)
[![Self-hosted](https://img.shields.io/badge/self--hosted-docker%20compose-2496ed)](docs/deployment.md)
[![Stars](https://img.shields.io/github/stars/danileau/prettypleaseprint?style=flat)](https://github.com/danileau/prettypleaseprint/stargazers)
[![Forks](https://img.shields.io/github/forks/danileau/prettypleaseprint?style=flat)](https://github.com/danileau/prettypleaseprint/network/members)

**3D print requests for a small office, with no sign-in.** One person owns the
printer. Everyone else picks their name, uploads a model, says what they are
hoping for, and follows it through the print stages on a board — instead of
asking in a corridor and then wondering.

Self-hosted, Docker Compose, no accounts at all. Five people and one printer on
one office network is the size it is built for, and it is honest about that:
there is no multi-tenancy, no billing, no queue theory — and no passwords for
anyone but the printer owner.

> **Keep it on a trusted network.** Names are not proof of identity: anyone who
> can reach the app can pick anybody's name. Put it on the public internet and
> anyone with the URL can submit prints, read anyone's tickets and comment as
> them. See [Do not put this on the internet](docs/authentication.md#do-not-put-this-on-the-internet).

This is a fork of [danileau/prettypleaseprint](https://github.com/danileau/prettypleaseprint)
with its invitation-and-password sign-in removed.

## What it looks like

| The rail — every request as a ticket, scoped to who may see it |
| :-- |
| ![The backlog board](docs/screenshots/board.png) |

| A ticket, with the actual uploaded geometry | The printer owner's queue |
| :-- | :-- |
| ![Story detail with the 3D viewer](docs/screenshots/story.png) | ![The admin queue](docs/screenshots/queue.png) |

## What it does

- **No sign-in.** Pick your name from the list at `/hello`, or type it the
  first time; the browser remembers it. No accounts, invitations, passwords,
  passkeys or email. The printer owner unlocks their pages with one password
  from the server's environment. See **[How identity works](docs/authentication.md)**.
- **Upload a model** — `.stl` or `.3mf`, validated against its actual bytes
  rather than its filename, measured for its bounding box, stored on disk
  and never in the web root.
- **Or paste a link instead** — where the printer owner has switched it on, a
  request can start from a [Printables](https://www.printables.com) link: the
  app lists the model's `.stl` and `.3mf` files, you pick one, and the server
  fetches it. It is then held to exactly what an upload is, and the ticket
  links back to the model's page. Off by default, because it makes the server
  call somebody else's — see
  [Importing from a link](docs/deployment.md#importing-from-a-link).
- **Follow it on a board** — Requested → Accepted → Printing → Delivery, one
  step at a time, forwards only. Or Declined, with a reason. Marking it **Done**
  takes it off the board while keeping it in *My orders*, so the rail carries
  only what is still moving.
- **Withdraw your own request** any time before it reaches the bed — while it
  is Requested, Accepted or Declined, but not once it is Printing. The ticket,
  the conversation and the uploaded file go with it. Plans change; unwanted
  prints waste filament.
- **Print an old request again, differently if you like** — re-queue any past
  ticket of yours (a test print that worked, a declined one you have fixed) as
  a fresh request, without hunting down and re-uploading the file. It opens the
  request form filled in with what you asked for last time, so the material,
  colour, quantity and print settings can change before it is sent. The model
  is copied server-side, so the two tickets own independent files.
- **See what each person has sent** — the printer owner picks one person or
  several at `/admin/prints` and gets everything they have uploaded, in any
  state.
- **Say how much it matters** — a request carries a priority (low, medium,
  high). The printer owner's queue lists the urgent ones first, and the
  requester or the owner can change it on the ticket while it is still on the
  rail. It orders the queue; it does not book the printer.
- **Note print settings** — an optional free-text field on a request for the
  slicer specifics that come with some files (layer height, infill, supports,
  temperatures). The printer owner sees them on the ticket, so they do not
  become a back-and-forth, and a re-print keeps them.
- **Browse your history** — a dedicated `/history` view of the prints that have
  left the rail (delivered, done, declined), filterable by status, material and
  when, with **Print again** on every row. It is where you go to re-run an old
  job.
- **Talk on the ticket** — a conversation thread per request, so "can you do it
  in teal" lives with the model rather than in a chat app.
- **Owner-managed benefits** — the "what's in it for you" tips are the printer
  owner's to define at `/admin/benefits`, and the ones they mark *preferred* are
  starred on the upload form so people know what the owner actually wants. Editing
  or retiring a benefit never rewrites a past request's tip.
- **Owner-managed materials and colours** — the printer owner decides what is
  currently on the shelf at `/admin/catalog`, including display order, solid
  or gradient swatches, and a rainbow “whatever” option. Turning off, renaming,
  or removing an entry changes future requests without rewriting old tickets.
  See **[Materials and colours](docs/material-catalog.md)**.
- **See the actual geometry** — the uploaded mesh rendered in the browser,
  auto-framed, drag to rotate.
- **An audit trail** of every name picked or added, every unlock of the owner
  pages, and everything that happens to someone's model, readable at
  `/admin/audit`, never edited or deleted.
- **Ask for features, triaged like the backlog** — a parallel "frr" board at
  `/frr` where anyone files a feature request (title, priority, category) and
  the owner moves it through the same stages, conversation, notifications and
  audit trail a print goes through. Its own tables; the print flow is untouched.
  See **[Feature requests](docs/feature-requests.md)**.
- **Drive it over HTTP** — every ticket, transition, comment and notification
  is a JSON endpoint, described by an OpenAPI 3.1 document and callable from a
  Swagger console at `/docs`. Same name cookie, same scope, same audit trail as
  the UI; the rules live in one place, so the API cannot enforce less than the
  board does. See **[the API](docs/api.md)**.
- **Open a model straight in PrusaSlicer** — one click on a ticket hands the
  model to a slicer running on your own machine. A small helper the printer
  owner installs once does the fetch, because PrusaSlicer's own deep link
  refuses any host but Printables. The link carries its own short-lived
  credential, so nothing secret sits in the helper's config.
  See **[Open in PrusaSlicer](docs/prusaslicer.md)**.
- **Or just take the file** — a plain download on every ticket, for a machine
  without the helper, a phone, or a slicer that is not PrusaSlicer. Same
  permissions as the ticket, and recorded when the bytes go to somebody other
  than the person who uploaded them.

## Requirements

| | |
| --- | --- |
| Host | anything that runs Docker Compose on **`linux/amd64`** — a NAS, an x86 VPS, a spare laptop. **Not arm64.** The published `ppp-app` and `ppp-migrate` images are built for amd64 only, and a second architecture would have to be verified rather than merely built — the suites are this project's contract, and running them twice is not a commitment it makes. An arm64 host (a Pi 5, an Ampere VPS, an Apple Silicon Mac) fails at `docker compose pull` with `no matching manifest for linux/arm64`. |
| Memory | ~1 GB for the whole stack (app, Postgres) |
| Disk | small — the database is megabytes; uploads are capped at 250 MB each |
| TLS | **required in production.** The app refuses to start when `APP_URL` is not `https://` (localhost excepted): the owner password is typed into it, and the identity cookies carry the `Secure` flag — see [HTTPS](docs/deployment.md#https-is-not-optional) |
| Network | **a trusted one.** There is no sign-in; see [Do not put this on the internet](docs/authentication.md#do-not-put-this-on-the-internet) |
| Mail | **none.** The app sends no email |

## Quick start

```bash
git clone https://github.com/gvtroutman/print-it.git && cd print-it
cp .env.docker.example .env.docker
```

Edit `.env.docker` — generate the secrets and say who the printer owner is:

```bash
APP_SECRET="$(openssl rand -base64 32)"
DB_PASSWORD="$(openssl rand -hex 24)"
ADMIN_PASSWORD="$(openssl rand -base64 18)"
ADMIN_NAME="Your Name"
```

**Leave `APP_URL` at the example's localhost value for now.** It decides
whether the identity cookies are marked `Secure` and which `Origin` the API
accepts writes from, so setting it to a public hostname and then running on
`http://localhost:3000` gives you a stack whose API refuses your browser's
writes as cross-origin, and whose cookies are marked `Secure` for a connection
that is not. Set it when you deploy — see
**[docs/deployment.md](docs/deployment.md)**.

Then bring it up. This build-from-source variant publishes ports, which is what
you want for a first look:

```bash
docker compose --env-file .env.docker \
  -f docker-compose.prod.yml -f docker-compose.build.yml \
  -f docker-compose.test.yml up -d --build
```

Open **http://localhost:3000/hello** and pick or type a name — that is the
whole of getting in. The printer owner's pages (the queue, the catalogue, the
audit trail) are unlocked at `/owner` with `ADMIN_PASSWORD`. For a real
deployment behind a reverse proxy, see **[docs/deployment.md](docs/deployment.md)**
— and read [Do not put this on the internet](docs/authentication.md#do-not-put-this-on-the-internet)
before you give it a public hostname.

## Configuration

Everything is environment variables, read from `.env.docker`. The full file
with commentary is [`.env.docker.example`](.env.docker.example).

| Variable | Required | What it does |
| --- | --- | --- |
| `APP_SECRET` | **yes** | Signs the `ppp.who` and `ppp.owner` cookies and PrusaSlicer links. `openssl rand -base64 32`. Losing or changing it means everyone picks their name again; nothing else is lost. (Was `BETTER_AUTH_SECRET`.) |
| `ADMIN_PASSWORD` | **yes** | Unlocks the owner pages at `/owner`. Unset, they are switched off. Changing it locks every browser that had them unlocked. |
| `DB_PASSWORD` | **yes** | Postgres password. Baked into the data directory on first start — see [Restore](#restore). |
| `APP_URL` | **yes** | The origin the browser sees, including scheme. The cookies' `Secure` flag and the API's `Origin` check derive from it. Should be `https://` anywhere but a laptop. (Was `BETTER_AUTH_URL` for a host-side run.) |
| `ADMIN_NAME` | **yes** | The printer owner, created on first start and renamed if it changes. |
| `ADMIN_EMAIL` | | Optional. Stored on the owner's row; nothing sends to it. |
| `DATA_ROOT` | | Where the database and uploads live on disk. Default `./data`. |
| `TRUST_PROXY_HEADERS` | | Which header carries the client address: `false` (trust nothing, the default), `true` (left-most `X-Forwarded-For`), or `cloudflare` (`CF-Connecting-IP`). It also decides what the owner password's guess limit counts per address. See [the reasoning](docs/deployment.md#why-trust_proxy_headers-is-a-separate-switch). |
| `IMPORT_SOURCES` | | `printables` lets a request start from a Printables link instead of an upload. **Off when unset.** Needs outbound HTTPS, and a misspelt value stops the app. See [Importing from a link](docs/deployment.md#importing-from-a-link). |
| `SOURCE_URL` | | Where this instance's source lives, shown in the footer. **Change it if you modify the code** — see [Licence](#licence). Defaults to `https://github.com/gvtroutman/print-it`. |
| `PPP_REGISTRY` / `PPP_TAG` | | Which published image to run. `PPP_REGISTRY` defaults to `ghcr.io/gvtroutman` — upstream's images still have sign-in. Pin `PPP_TAG` to a release (`v0.3.0`) or a commit SHA; either is also how you roll back. |
| `CF_TUNNEL_TOKEN` | | Connector token for `docker-compose.tunnel.yml`, from Cloudflare Zero Trust. A credential: anything holding it can serve the hostnames routed to that tunnel. See [Deploying behind a Cloudflare Tunnel](docs/deployment.md#deploying-behind-a-cloudflare-tunnel). |

## Deploying

The short version: pull a published image, put a reverse proxy in front, point
`DATA_ROOT` at real storage — and keep it where only the office can reach it.

> **This app has no sign-in.** Anyone who can load it can pick any name, read
> that person's tickets and models, comment as them and submit prints. A
> reverse proxy with a public DNS name or a Cloudflare Tunnel makes it
> reachable from the whole internet unless you put something in front that
> *does* authenticate — a VPN, or Cloudflare Access. See
> [Do not put this on the internet](docs/authentication.md#do-not-put-this-on-the-internet).

```bash
docker compose --env-file .env.docker \
  -f docker-compose.prod.yml -f docker-compose.proxy.yml up -d
```

On a connection whose public address is not yours to keep — a dynamic one, or
none at all — `docker-compose.tunnel.yml` replaces the reverse proxy with a
Cloudflare Tunnel connector that dials *outward*, so there is no port to
forward and no `A` record to keep current. It also puts the app on the public
internet, so read the warning above first. See
[Deploying behind a Cloudflare Tunnel](docs/deployment.md#deploying-behind-a-cloudflare-tunnel).

`docker-compose.prod.yml` **consumes** images rather than building them, so a
deployment needs no source tree and no toolchain, and what runs there is
byte-for-byte what CI tested and signed. It publishes **no host ports at all** —
each overlay adds only what its context needs.

Every merge to `main` publishes images tagged with the commit SHA and `latest`;
every `v*` tag publishes that same commit under its version. Pin `PPP_TAG` to a
release if you want to move deliberately, or to a SHA if you want to follow
`main` closely.

The images are named `ppp-app` and `ppp-migrate` — after the project's old
short name, kept deliberately because they are a deployment interface. Renaming
them would break every pinned `PPP_TAG` in exchange for nothing.

The images are **public**, so a deployment needs no registry credential at all.
`scripts/deploy-wizard.sh` reflects that: run it without a token and it lists
releases, which is the right menu for most deployments; give it a
`read:packages` token and it lists every published image including SHA builds.
That token is optional, is never stored, and is only needed because GitHub
gates the package *listing* API even for public packages.

`scripts/deploy-wizard.sh` is the way to move between versions: it lists what is
published, shows the upgrade notes of every release you are about to cross and
asks whether you have read them, cosign-verifies before swapping, health-checks
after, and rolls back on its own if the new image does not come good. It is a
single file you copy onto the host — copy it again when you upgrade, since it
does not update itself. See **[docs/deployment.md](docs/deployment.md)**.

Releases themselves are cut with `scripts/release-wizard.sh`, from a checkout:
changelog, version, full local test, pull request, tag, images, GitHub release,
with a question before each step that cannot be undone. See
**[Cutting a release](docs/development.md#cutting-a-release)**.

## Backup and restore

### Back up

Everything that matters is under `DATA_ROOT` plus one file:

| | |
| --- | --- |
| `$DATA_ROOT/db/` | Postgres — names, tickets, comments, the audit trail |
| `$DATA_ROOT/uploads/` | the uploaded `.stl` / `.3mf` files, as plain files |
| `$DATA_ROOT/models/` | **only if you have not migrated yet** — the old object store's data directory. Plain `tar` cannot read it usefully; see [Deployment](docs/deployment.md). |
| `.env.docker` | the secrets. **Not** under `DATA_ROOT`, and not in the repo. |

On ZFS, one recursive snapshot of the parent dataset captures all three:

```bash
zfs snapshot -r storage/applications/ppp@$(date +%F)
```

That snapshot is *crash-consistent*, not clean — Postgres replays its WAL on
start and recovers, which is fine and is what it is designed for.

**Without ZFS, do the file copy from inside a container.** The Postgres data
directory is mode `700` owned by uid `70`, so a `tar` or `cp -a` as your own
user cannot even read it, and one run with `sudo` that loses ownership produces
an archive Postgres will refuse to start from:

```bash
docker compose --env-file .env.docker -f docker-compose.prod.yml down
docker run --rm -v "$DATA_ROOT:/data:ro" -v "$PWD:/backup" alpine \
  tar czf /backup/ppp-$(date +%F).tgz -C /data .
```

Either way, take a logical dump alongside it — it restores into *any* Postgres,
not only back onto this data directory, and it needs no root:

```bash
docker exec ppp-db pg_dump -U ppp -Fc ppp > ppp-$(date +%F).dump
```

### Restore

```bash
# 1. stop the stack — never restore under a running Postgres
docker compose --env-file .env.docker -f docker-compose.prod.yml down

# 2. put the data back (ZFS rollback, or extract the archive)
zfs rollback storage/applications/ppp/data/db@2026-08-23
zfs rollback storage/applications/ppp/data/models@2026-08-23
#   without ZFS, from the container-made archive:
#   docker run --rm -v "$DATA_ROOT:/data" -v "$PWD:/backup:ro" alpine \
#     sh -c 'rm -rf /data/db /data/models && tar xzf /backup/ppp-2026-08-23.tgz -C /data'

# 3. bring it up; the migrator applies any pending migrations
docker compose --env-file .env.docker -f docker-compose.prod.yml up -d
docker compose --env-file .env.docker -f docker-compose.prod.yml ps
```

Restoring from a logical dump instead, onto a running stack:

```bash
docker exec -i ppp-db pg_restore -U ppp -d ppp --clean --if-exists < ppp-2026-08-23.dump
```

### When it goes wrong

Both of these were confirmed by actually doing it, not by reasoning about it.

**`DB_PASSWORD` must be the one the restored data was created with.** Postgres
stores the password inside the data directory and ignores `POSTGRES_PASSWORD`
once that directory exists. Get it wrong and the symptoms point everywhere
except the cause:

| what you see | |
| --- | --- |
| `ppp-db` | **healthy** — this is the misleading part |
| `ppp-app` | never starts, so it logs nothing at all |
| `ppp-migrate` | `Error: P1000: Authentication failed against database server` |

So look in the **migrator's** logs, which is the one place nobody thinks to
check because it is the container that is supposed to exit:

```bash
docker compose --env-file .env.docker -f docker-compose.prod.yml logs migrate
```

Nothing is damaged by getting this wrong — the wrong password is refused, not
destructive. Put the right one back and everything returns. This is the main
reason `.env.docker` belongs in the backup.

**`APP_SECRET` is not recoverable, and costs one click each.** Restore without
it and every existing `ppp.who` and `ppp.owner` cookie stops validating — a held
cookie goes from `200` to a `307` back to `/hello`. Nobody is locked out: the
names are rows, so everyone simply picks theirs again, and the owner unlocks
again with `ADMIN_PASSWORD`.

## Troubleshooting

**502 from the reverse proxy, nothing in the app's logs.**
The proxy cannot reach the container. If you route by container name over a
shared Docker network, check both are still on it — updating a proxy that is
itself a managed app recreates its container and silently drops the
attachment:

```bash
docker network inspect npm-proxy --format '{{range .Containers}}{{.Name}} {{end}}'
docker run --rm --network npm-proxy curlimages/curl -sS -m 5 http://ppp-app:3000/api/health
```

**`unauthorized` when pulling the images.**
The published images are public, so this should not happen — check the tag
exists before assuming it is an auth problem:

```bash
docker manifest inspect ghcr.io/gvtroutman/ppp-app:v0.3.0
```

On a **fork** with private packages you do need a credential, and it must be a
*classic* token with **`read:packages`** and nothing else — that scope is
nested under `write:packages` in the checkbox list, which is easy to scroll
past. Fine-grained tokens do not work with ghcr.io at all. Check what yours
carries:

```bash
curl -sSI -H "Authorization: Bearer $TOKEN" https://api.github.com/user | grep -i x-oauth-scopes
```

**The certificate will not issue.**
ACME HTTP-01 validation goes to whatever the public DNS record points at. If
that is still your web host rather than your proxy, the challenge is answered
by the wrong machine and nothing you change locally will help. Check where the
name actually resolves, and what answers there:

```bash
dig +short your.host.example
curl -sS -D - "http://your.host.example/.well-known/acme-challenge/probe" | head -5
```

Behind Cloudflare's proxy, visitors see Cloudflare's certificate regardless, so
an **Origin Certificate** plus SSL mode *Full (strict)* removes ACME from the
picture entirely.

**Every page loads and nothing works.**
Cloudflare's **Rocket Loader** rewrites every `<script>` to load through its own
deferred loader, and the rewritten tags do not carry the per-request CSP nonce
this app's `script-src` requires. Hydration never happens, so no client-side code
runs: the pages render from server HTML and look perfectly normal, but the
upload progress bar, the 3D viewer and the Activity menu all do nothing (picking
a name still works — `/hello` is a plain form). The console shows CSP violations; the app's own logs show nothing at
all, because the requests never reach it. Turn Rocket Loader off, globally or
with a Configuration Rule scoped to the hostname — see
[deployment](docs/deployment.md). Auto Minify and Brotli are fine.

**Audit rows have no IP address.**
`TRUST_PROXY_HEADERS` is unset or `false`, so nothing is trusted. Behind
Cloudflare set it to `cloudflare` — not `true`, because Cloudflare *appends* to
`X-Forwarded-For` and the left-most entry there is whatever the client sent.
Behind a proxy that replaces the header, `true`. Set either only if the app
cannot be reached without going through that proxy.

**`/owner` says the owner pages are switched off.**
`ADMIN_PASSWORD` is not set in the app's environment. Set it in `.env.docker`
and recreate the app container.

**`/owner` says there is no printer owner yet.**
The seed has not run, or failed — usually because `ADMIN_NAME` is empty. Read
the migrator's log:

```bash
docker compose --env-file .env.docker -f docker-compose.prod.yml up -d migrate
docker compose --env-file .env.docker -f docker-compose.prod.yml logs migrate
```

**Every request answers 500 and the log says `APP_SECRET is required`.**
It is unset — or still named `BETTER_AUTH_SECRET` from before sign-in was
removed. Rename it.

## Documentation

| | |
| --- | --- |
| **[How identity works](docs/authentication.md)** | picking a name, the owner password, the cookies, and what having no sign-in costs |
| **[Architecture](docs/architecture.md)** | the viewer, upload validation, decisions taken against the design handoff, and the file layout |
| **[Deployment](docs/deployment.md)** | containers, reverse proxies, the deploy wizard, TLS, first run |
| **[Materials and colours](docs/material-catalog.md)** | the owner-managed catalogue behind the request form |
| **[Feature requests](docs/feature-requests.md)** | the `/frr` track — file a request, triage it exactly like the print backlog |
| **[The API](docs/api.md)** | the JSON surface, calling it with the name cookie, the OpenAPI document and the console at `/docs` |
| **[Open in PrusaSlicer](docs/prusaslicer.md)** | the one-click "send to the slicer" bridge, the helper, and why the deep link cannot be used |
| **[Development](docs/development.md)** | stack, local setup, the verification suites, the full local run, CI, cutting a release |
| **[Security audit](docs/security-audit.md)** | the OWASP Top 10 assessment, findings, and residual risk accepted |
| **[Security policy](SECURITY.md)** | how to report a vulnerability |
| **[Contributing](CONTRIBUTING.md)** | the nine suites are the contract; what a good change looks like |
| **[Changelog](CHANGELOG.md)** | what changed in each release |

## Security

**There is intentionally no user authentication.** A visitor is whoever they
say they are on `/hello`, and that is only safe where everyone who can reach
the app is somebody you would hand the printer queue to anyway — an office
network. Read [How identity works](docs/authentication.md) for exactly what
anyone on that network can do, and
[Do not put this on the internet](docs/authentication.md#do-not-put-this-on-the-internet).

What is still enforced: the printer owner's pages need `ADMIN_PASSWORD`, which
sets a signed browser-session cookie good for at most twelve hours, with wrong
guesses limited to ten a minute per address. The name cookie is signed with
`APP_SECRET` and can only ever name a client, never the owner. Authorisation
answers **404, not 403**, for a ticket that is not yours — a 403 confirms it
exists. Writes from another origin are refused. CSP carries a per-request
nonce. Every name picked, every unlock of the owner pages and every change to a
ticket is audited — with the caveat that the trail records the name somebody
picked, not proof of who they were.

The full assessment, including what was found and fixed and what is knowingly
accepted, is in [docs/security-audit.md](docs/security-audit.md). To report
something, see [SECURITY.md](SECURITY.md).

## Contributing

Issues and pull requests are welcome. The nine verification suites in
`scripts/` are the contract — `verify:models`, `verify:upload`, `verify:import`,
`verify:queue`, `verify:frr`, `verify:benefits`, `verify:catalog`, `verify:api`
and `probe:security`. All but `verify:models` run in CI against the built
container image rather than a dev server. If a change makes one fail, that is the
change talking.

See [docs/development.md](docs/development.md) to get set up.

## Licence

[AGPL-3.0-or-later](LICENSE). Self-host it, fork it, change it, run it for your
office — all of that is yes, and free.

The app carries a **Source · AGPL-3.0** link in its footer. That is section 13
made real: if you modify the code, point `SOURCE_URL` at your own repository.
Leaving it aimed at upstream is worse than removing it, because it looks like
compliance while offering source that is not what is running.

The one condition is the point of the licence: **if you modify it and let people
use your version over a network, you have to offer them your source.** Not a
courtesy, a term. It covers the case a plain GPL misses — running a modified
version as a service without ever distributing a copy — which is exactly how
web software gets taken private.

What that does and does not mean:

- **Running it unmodified obliges you to nothing.** Deploy it for your office,
  never touch the code, and there is nothing to publish and nobody to tell.
- **Modify it and let others use it, and those users can ask for your source.**
  Note *others* includes your own colleagues — §13 counts anyone interacting
  over a network, not just paying customers. In practice that is easy: point
  them at your fork.
- **Selling it is allowed.** No open source licence forbids commercial use, and
  this one does not either. Sell support, sell hosting, sell it outright — your
  users just get the source too.
- **Modification nobody else touches is unconstrained.** Hack on it locally, on
  your own, forever, and the clause never bites.

The asymmetry is deliberate: the licence asks for reciprocity from those who
benefit publicly, and nothing from those who merely use it.

If your organisation's policy forbids AGPL software — some do, blanket-style —
you are welcome to ask about other terms.

Built from the design handoff in `Pretty Please Print/`, which is why story refs
read `PPP-104` and the copy sounds like a diner.
