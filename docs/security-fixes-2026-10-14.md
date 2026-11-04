# Security fixes — October 14, 2026

A REA source inspection and bounded reproductions found six credential,
request-body, model-preview and state-transition gaps. These fixes apply to
both direct API callers and the existing forms.

- Passkey registration now checks the real account's owner role at both
  registration endpoints. A member's device session cannot mint a credential
  outside the owner-managed device-link permission model.
- Passkey deletion now requires the same five-minute freshness window as
  enrollment. The underlying endpoint still enforces credential ownership.
  The gate uses Better Auth's authoritative session lookup and its own bearer
  conversion, so cookies and API tokens follow the same rules.
- Uploads now share the JSON API's Origin check. A mismatched or opaque Origin
  is refused before authentication, upload slots, or multipart parsing. API
  clients without Origin retain their existing access.
- Ko-fi counts received bytes instead of trusting Content-Length, cancels a
  body over 64 KiB, and returns 404 before reading when disabled. It accepts
  Ko-fi's `application/x-www-form-urlencoded` delivery format. The route is
  excluded from middleware's large upload-body clone; global security headers
  still come from `next.config.ts`.
- glTF/GLB validation checks integer counts, references, backing-buffer ranges,
  sparse data, aggregate geometry, declared allocation and scene expansion.
  The viewer uses the same preflight with a smaller memory budget, including
  files uploaded before this fix. Its static filament preview skips embedded
  textures and animation tracks that would otherwise allocate unused data.
  Supported zero-filled, interleaved and sparse accessors remain valid.
- Feature withdrawal, decline and advancement now match the current state in
  the database mutation. Withdrawal also matches ownership. A concurrent change
  produces a conflict before any notification, audit entry or cache refresh.

Next.js was updated from 15.5.26 to 15.5.27 to remove the dependency advisories
reported by the registry. The original advisories describe Pages Router or
root-catch-all SSG/ISR prerequisites that were not present in this App Router
checkout; the dependency update does not claim an exploit was demonstrated.

## Regression checks

The added suites exercise real handlers, installed auth endpoints and the
installed glTF loader with bounded inputs and in-memory persistence. They do
not touch a production database, payment provider, printer or stored model.

```bash
npm run verify:passkey-freshness
npm run verify:request-security
npm run verify:gltf
npm run verify:feature-safety
npm run verify:order-safety
npm run verify:models
npm run typecheck
npm audit
```

The new checks also run in CI. The browser WebAuthn suite now uses the test
owner because members cannot enroll. It requires `PASSKEY_TEST=true` and a
loopback app/database; it changes the isolated owner's test credentials and
sessions, and removes only passkeys added by that run.

These are regression checks for the identified gaps, not a replacement for the
full live security probe suite or an assessment of production proxy settings.

Implementation: [passkey policy](../src/lib/passkey-access.ts),
[request Origin](../src/lib/request-origin.ts),
[bounded body reader](../src/lib/request-body.ts),
[glTF declarations](../src/lib/gltf.ts),
[glTF preview](../src/lib/gltf-preview.ts), and
[feature service](../src/lib/features.ts).
