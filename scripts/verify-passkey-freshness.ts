/** Exercise the installed auth endpoints with an in-memory adapter; no real credentials or database. */
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import React from "react";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { serializeSignedCookie } from "better-call";
import { FRESH_AUTH_SECONDS, SESSION_IDLE_SECONDS } from "../src/lib/auth-rules";

const APP = "http://localhost:3000";
process.env.BETTER_AUTH_URL = APP;
process.env.BETTER_AUTH_SECRET = "isolated-passkey-freshness-test-secret-20261014";
Object.assign(globalThis, {
  React,
  fetch: async () => { throw new Error("Network disabled in passkey freshness checks"); },
});
let appImported = false;
const mocks: Record<string, string> = {
  "server-only": "export{}",
  "@/lib/db": "export const db=new Proxy({},{get(){return ()=>{throw new Error('Real database access disabled')}}})",
  "next/headers": "export const headers=async()=>new Headers()",
  "@/lib/authz": "export const requireUser=async()=>globalThis.passkeyFreshnessActor",
};
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.endsWith(".png")) {
    return { url: "data:text/javascript,export default {src:'/test.png',width:1,height:1}", shortCircuit: true };
  }
  if (specifier === "@/lib/auth" && appImported) {
    return { url: "data:text/javascript,export const auth={api:{getSession:async()=>globalThis.passkeyFreshnessSession}}", shortCircuit: true };
  }
  return Object.hasOwn(mocks, specifier)
    ? { url: "data:text/javascript," + encodeURIComponent(mocks[specifier]!), shortCircuit: true }
    : nextResolve(specifier, context);
} });

const { auth: appAuth } = await import("../src/lib/auth");
appImported = true;
assert.equal(appAuth.options.session?.freshAge, FRESH_AUTH_SECONDS);
assert.equal(FRESH_AUTH_SECONDS, 300);
const plugins = appAuth.options.plugins!.filter(p => ["passkey", "bearer", "passkey-access"].includes(p.id));
assert.deepEqual(plugins.map(p => p.id).sort(), ["bearer", "passkey", "passkey-access"]);
const originalNow = Date.now;
let clockTime = originalNow();
Date.now = () => clockTime;
const createdAt = new Date(clockTime);
const user = { id: "test-owner", name: "Test Owner", email: "freshness@example.test", emailVerified: true, role: "admin", initials: "TO", createdAt, updatedAt: createdAt };
const session = {
  id: "test-session", token: "test-session-token", userId: user.id,
  createdAt, updatedAt: createdAt, expiresAt: new Date(clockTime + SESSION_IDLE_SECONDS * 1000),
};
const storedKey = { id: "fixture-key", userId: user.id, name: "Fixture", credentialID: "fixture-credential",
  publicKey: "fixture", counter: 0, deviceType: "singleDevice", backedUp: false, createdAt };
const store = { user: [user], session: [session], passkey: [] as typeof storedKey[], verification: [] };
const testAuth = betterAuth({
  ...appAuth.options,
  database: memoryAdapter(store),
  databaseHooks: {},
  plugins,
  rateLimit: { enabled: false },
});
const call = (path: string, body?: object, signedIn = true) => testAuth.handler(new Request(`${APP}/api/auth${path}`, {
  method: body === undefined ? "GET" : "POST",
  headers: {
    origin: APP,
    ...(signedIn ? { authorization: `Bearer ${session.token}` } : {}),
    ...(body === undefined ? {} : { "content-type": "application/json" }),
  },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}));
try {
  const fresh = await call("/passkey/generate-register-options");
  assert.equal(fresh.status, 200);
  assert.ok((await fresh.json()).challenge);
  assert.equal(store.verification.length, 1);
  const freshVerify = await call("/passkey/verify-registration", { response: {} });
  assert.equal(freshVerify.status, 400);
  assert.equal((await freshVerify.json()).code, "CHALLENGE_NOT_FOUND");
  console.info("PASS fresh sessions reach both real registration endpoints; options create a challenge");

  for (const age of [FRESH_AUTH_SECONDS, FRESH_AUTH_SECONDS + 60, 60 * 60 * 23]) {
    session.createdAt = new Date(clockTime - age * 1000);
    for (const [path, body] of [
      ["/passkey/generate-register-options", undefined],
      ["/passkey/verify-registration", { response: {} }],
    ] as const) {
      const res = await call(path, body);
      assert.equal(res.status, 403, `${path} at ${age}s`);
      assert.equal((await res.json()).code, "SESSION_NOT_FRESH");
    }
    assert.equal(store.verification.length, 1, "Stale sessions must not create challenges");
    assert.equal(store.passkey.length, 0, "Stale sessions must not save credentials");
  }
  session.createdAt = new Date(clockTime - (FRESH_AUTH_SECONDS - 1) * 1000);
  assert.equal((await call("/passkey/generate-register-options")).status, 200);
  // A ceremony started while fresh must still be blocked at verification
  // if the browser/device prompt remains open beyond the window.
  clockTime += 2_000;
  const expiredDuringPrompt = await call("/passkey/verify-registration", { response: {} });
  assert.equal(expiredDuringPrompt.status, 403);
  assert.equal((await expiredDuringPrompt.json()).code, "SESSION_NOT_FRESH");
  assert.equal((await call("/passkey/generate-register-options", undefined, false)).status, 401);
  assert.equal((await call("/passkey/verify-registration", { response: {} }, false)).status, 401);
  console.info("PASS five-minute boundary, older sessions, mid-ceremony expiry and unauthenticated calls are enforced");

  const challengeCount = store.verification.length;
  session.createdAt = new Date(clockTime);
  for (const memberRole of ["client", "", "admin,client"]) {
    user.role = memberRole;
    for (const [path, body] of [
      ["/passkey/generate-register-options", undefined],
      ["/passkey/verify-registration", { response: {} }],
    ] as const) {
      const res = await call(path, body);
      assert.equal(res.status, 403, `${path} for ${memberRole}`);
      assert.equal((await res.json()).code, "PASSKEY_OWNER_ONLY");
    }
  }
  assert.equal(store.verification.length, challengeCount, "Members cannot mint enrollment challenges");
  user.role = "admin";
  store.passkey.push(storedKey);
  for (const age of [FRESH_AUTH_SECONDS, FRESH_AUTH_SECONDS + 1, -1]) {
    session.createdAt = new Date(clockTime - age * 1000);
    const res = await call("/passkey/delete-passkey", { id: storedKey.id });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, "SESSION_NOT_FRESH");
    assert.equal(store.passkey.length, 1);
  }
  assert.equal((await call("/passkey/delete-passkey", { id: storedKey.id }, false)).status, 401);
  session.createdAt = new Date(clockTime);
  const foreign = { ...storedKey, id: "foreign-key", userId: "someone-else" };
  store.passkey.push(foreign);
  assert.equal((await call("/passkey/delete-passkey", { id: foreign.id })).status, 401);
  assert.equal(store.passkey.length, 2);
  assert.equal((await call("/passkey/delete-passkey", { id: storedKey.id })).status, 200);
  assert.deepEqual(store.passkey.map(p => p.id), [foreign.id]);
  const cookie = await serializeSignedCookie("ppp.session_token", session.token, process.env.BETTER_AUTH_SECRET);
  const cookieCall = () => testAuth.handler(new Request(`${APP}/api/auth/passkey/generate-register-options`, {
    headers: { origin: APP, cookie },
  }));
  assert.equal((await cookieCall()).status, 200, "Cookie callers meet the same gate as bearer callers");
  user.role = "client";
  assert.equal((await cookieCall()).status, 403);
  user.role = "admin";
  session.createdAt = new Date(clockTime - FRESH_AUTH_SECONDS * 1000);
  assert.equal((await cookieCall()).status, 403);
  session.createdAt = new Date(clockTime);
  console.info("PASS member role checks protect both enrollment endpoints; deletion requires fresh auth and ownership");

  const { isFreshAuth } = await import("../src/lib/reauth");
  const { default: WelcomePage } = await import("../src/app/welcome/page");
  Reflect.set(globalThis, "passkeyFreshnessActor", user);
  const reauthRedirect = (error: unknown) => error instanceof Error && "digest" in error &&
    String(error.digest).includes("/reauth?next=%2Fwelcome");
  for (const age of [FRESH_AUTH_SECONDS, FRESH_AUTH_SECONDS + 1]) {
    Reflect.set(globalThis, "passkeyFreshnessSession", { session: { createdAt: new Date(clockTime - age * 1000) } });
    assert.equal(await isFreshAuth(), false);
    await assert.rejects(WelcomePage(), reauthRedirect);
  }
  Reflect.set(globalThis, "passkeyFreshnessSession", { session: { createdAt: new Date(clockTime - (FRESH_AUTH_SECONDS - 1) * 1000) } });
  assert.equal(await isFreshAuth(), true);
  assert.ok(await WelcomePage());
  console.info("PASS welcome page routes stale sessions through reauthentication with the same boundary");
} finally {
  Date.now = originalNow;
}
