# The API

[← back to the README](../README.md)

Everything the app does over HTTP, and how to drive it yourself.

There is a console at **`/docs`** — Swagger UI, served from this origin, with
your name cookie already attached. It is linked from the account menu. This page is
the reading version: what the endpoints are for, and the handful of decisions
that will otherwise surprise you.

## The short version

```bash
# 1. Pick your name in a browser, then copy the ppp.who cookie's value out of
#    its developer tools (Application → Cookies).
WHO='ppp.who=clx…'

# 2. Use it.
curl -s https://print.example/api/stories \
  -b "$WHO" | jq '.stories[] | {ref, title, status}'
```

## Who you are

There is **no sign-in, no API key and no bearer token**. The API uses the same
two cookies as the browser — see [How identity works](authentication.md):

| | |
| --- | --- |
| **`ppp.who`** | The name you picked on `/hello`. Enough for everything a client can do. `Try it out` at `/docs` works with no setup at all. |
| **`ppp.owner`** | Set by unlocking `/owner` with `ADMIN_PASSWORD`. Needed for the endpoints marked *Printer owner* below, and makes you the owner whatever `ppp.who` says. |

From a script, copy the cookie out of a browser and send it with `curl -b`:

```bash
curl -s https://print.example/api/stories -b 'ppp.who=…'
curl -s -X POST https://print.example/api/stories/4/advance -b 'ppp.owner=…'
```

Without a name the answer is `401 {"error":"Pick your name first."}`.

What that means in practice:

- **`ppp.who` lasts a year** and names a client, not a secret anyone had to
  know: anybody can get one for any name by clicking it on `/hello`. Treat a
  script holding one as acting in that person's name, because the audit trail
  will.
- **`ppp.owner` lasts at most twelve hours**, and every one stops working when
  `ADMIN_PASSWORD` changes. It is the one cookie worth keeping out of shell
  history and CI logs.
- **Changing `APP_SECRET` invalidates both**; pick your name again and copy
  the new value.

Nothing else is a way in. There is no `?token=` parameter, no basic auth, and
no `Authorization` header. (The one exception is the model download, which
also accepts the short-lived `?t=` credential an "Open in PrusaSlicer" link
carries — see [Open in PrusaSlicer](prusaslicer.md).)

## What you can reach

| | | |
| --- | --- | --- |
| `GET` | `/api/health` | Can the app serve? The only endpoint that needs no name. |
| `GET` | `/api/stories` | Your tickets. The printer owner's is everyone's, and `?uploader=<id>,<id>` narrows it to particular people. |
| `GET` | `/api/stories/{id}` | One ticket. |
| `DELETE` | `/api/stories/{id}` | Withdraw your own request. |
| `POST` | `/api/stories/{id}/advance` | Move it one step along. *Printer owner.* |
| `POST` | `/api/stories/{id}/decline` | Say no. *Printer owner.* |
| `POST` | `/api/stories/{id}/flag` | Flag a model problem, with a reason. *Printer owner.* |
| `DELETE` | `/api/stories/{id}/flag` | Clear the flag. *Printer owner.* |
| `GET` `POST` | `/api/stories/{id}/comments` | The conversation on a ticket. |
| `POST` | `/api/stories/{id}/priority` | Set how much it matters: low, medium or high. Yours, or any as the printer owner. |
| `POST` | `/api/stories/{id}/requeue` | Print your own ticket again from the same file, changing what you like. |
| `GET` | `/api/notifications` | Your Activity feed. |
| `POST` | `/api/notifications/read` | Mark one read, or all of them. |
| `GET` | `/api/catalog` | The materials and colours on offer right now, and which sites — if any — this instance imports from. |
| `POST` | `/api/upload` | Upload a model and open a request. Multipart. |
| `POST` | `/api/import/files` | What a link to a model offers: the model and its printable files. `501` unless the instance imports. |
| `POST` | `/api/import` | Open a request from one of those files instead of an upload. |
| `GET` | `/api/models/{id}` | The model's bytes. |
| `GET` | `/api/openapi.json` | This surface, machine-readable. |

`{id}` is the numeric id — `4`, not `PPP-104`. The display ref comes back on
every ticket as `ref`.

## Five things that will otherwise surprise you

**1. There is no "set the status" endpoint.** The flow is
`Requested → Accepted → Printing → Delivery → Done`, forwards, one step at a
time, and `advance` derives the next state rather than taking one. That is the
point: an endpoint accepting a target status is an invitation to skip a step,
and the board's whole claim is that it shows where work actually is. `Declined`
is reachable only from `Requested` — once the printer owner has said yes,
saying no is a conversation rather than a state change.

**2. `404` and `403` mean different things, deliberately.** A ticket you may
not see is `404`, because a `403` would confirm it exists — the same rule the
pages follow. An *action* you may not take is `403`, because these endpoints
are listed in `/api/openapi.json` and pretending they are missing would help
nobody and confuse an honest client whose ticket is fine.

**3. Withdrawing is the requester's, and it is not the printer owner's.**
Seeing every story is the widest scope in the app and it still does not include
deleting somebody's request. And it only works while nobody has acted on it —
`Requested` or `Declined`. Past that you get `409` and the name of the person
to ask.

**4. Writes refuse a foreign `Origin`.** CSRF here rests on `SameSite=Lax` on
the identity cookies plus an Origin check. A
request with *no* `Origin` header is fine — that is `curl`, and it is not a
browser being driven by somebody else's page. A request with the wrong one is
`403`.

**5. Uploads are multipart, and the bytes decide.** `.stl` and `.3mf` only, at
most 250 MB, validated against the file's actual content rather than its name —
an STL renamed `.3mf` is refused. Nothing reaches storage until the file has
been inspected and no ticket exists until the object is in place, so a rejected
upload leaves nothing behind. The uploader is whoever the name cookie says: an
`uploaderId` or a `status` in the body is ignored.

Material and colour values come from the owner's live catalogue, not a fixed
API enum. `GET /api/catalog` lists the pairs on offer right now — the same read
the request form makes — as `{ materials: [{ name, colors: [{ name, hex, style,
mode }] }] }`. The server checks the pair again when the upload arrives, so a
retired or removed choice is refused even if an older client still posts it.

```bash
curl -s https://print.example/api/upload \
  -b "$WHO" \
  -F file=@clip.stl \
  -F title='Cable clip' -F material=PETG -F colorName=Slate \
  -F quantity=2 -F tip='A beer' -F note='Teal if you have it'
```

## Errors

One shape, everywhere, and the message is written for a person:

```json
{ "error": "PPP-104 is already printing — ask Ruben instead." }
```

| | |
| --- | --- |
| `400` | The request did not parse, or a field failed validation. |
| `401` | No name: no `ppp.who` (or `ppp.owner`) cookie, or one this app did not sign. |
| `403` | You have a name, but that is not yours to do — usually an owner-only endpoint without `ppp.owner` — or a foreign `Origin` on a write. |
| `404` | No such thing, **or** not one you may see. |
| `409` | Real, yours, and not in a state where that makes sense. |
| `413` `422` | Upload too large, or not an acceptable model. |
| `500` | Our fault. The message never carries detail — no stack, no query. |

`500` bodies are deliberately uninformative. The detail is in the server log,
where it belongs.

## Paging

`GET /api/stories` returns at most 25 by default (100 maximum) and a
`nextCursor`. Feed it back as `?before=`:

```bash
curl -s "https://print.example/api/stories?status=Printing&limit=50" \
  -b "$WHO"
```

A cursor rather than an offset, because a ticket created mid-page makes
`skip`/`take` repeat a row or drop one. `status` may be repeated
(`?status=Requested&status=Printing`) or comma-separated.

## Where the rules actually live

Both front doors — the server-rendered forms and these endpoints — call
[`src/lib/stories.ts`](../src/lib/stories.ts). Who may move a ticket, from
which state, who gets told and what goes in the audit trail is decided there
and nowhere else, so the API cannot quietly enforce less than the UI does.
`npm run verify:api` drives the JSON surface against every rule
`npm run verify:queue` drives through the forms.

The boundary itself — 401 vs 403, the Origin check, and the list of fields that
may go on the wire — is [`src/lib/api.ts`](../src/lib/api.ts). Nothing spreads
a database row into a response: every field is named, which is why adding a
column tomorrow cannot leak it.

## The document, and the console

`/api/openapi.json` is OpenAPI 3.1, assembled per request from the app's own
paths. Request bodies are converted from the same Zod schemas the handlers
validate with, so the document cannot promise a rule the server does not
enforce. The two cookies are declared as its security schemes.

Both it and `/docs` need a name. That is a much lower bar than it used to be —
anyone on the network can pick one — but it still keeps the map of the API off
the front page.

Swagger UI is **vendored, not loaded from a CDN** —
`npm run vendor:swagger` copies it out of `node_modules` into `public/docs/`,
which `predev` and `prebuild` run for you. Three reasons: the app's
`script-src 'self'` would refuse a CDN, a deployment on an isolated VLAN has no
outbound internet, and a CDN is a third party in the request path of a tool
that is otherwise entirely first-party.

Generating a client is the usual thing:

```bash
curl -s https://print.example/api/openapi.json -b "$WHO" > openapi.json
npx @openapitools/openapi-generator-cli generate -i openapi.json -g typescript-fetch -o ./client
```

## What is not here

- **No webhooks.** Nothing calls *you*. If you want to know when a ticket moves,
  poll `/api/notifications`.
- **No bulk endpoints.** Five people and one printer; a loop is fine.
- **No API keys, scopes or service accounts.** Every call is made *as* a
  name, and the audit trail records it.
- **No CORS headers.** The API is same-origin. Fetching it from a page you host
  elsewhere is not a supported thing to do.
