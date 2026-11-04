/** Real handlers and streams, with all credentials/storage/DB calls in memory. */
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

process.env.BETTER_AUTH_URL = "https://print.example.test";
process.env.KOFI_VERIFICATION_TOKEN = "fixture-webhook-verification-token";
const calls: string[] = [];
Object.assign(globalThis, { requestSecurityCalls: calls, requestSecurityActor: { id: "member", role: "client" },
  fetch: async () => { throw new Error("Network disabled"); } });
const mocks: Record<string, string> = {
  "server-only": "export{}",
  "@/lib/authz": "export const currentUser=async()=>{globalThis.requestSecurityCalls.push('auth');return globalThis.requestSecurityActor}",
  "@/lib/intake": "export const checkWish=async()=>{globalThis.requestSecurityCalls.push('validate');return {}};export const openRequest=async()=>{globalThis.requestSecurityCalls.push('save');return {id:1}}",
  "@/lib/donations": "export const receiveKofiGift=async()=>{globalThis.requestSecurityCalls.push('gift');return 'received'}",
  "@/lib/stories": "export class StoryProblem extends Error {}",
  "@/lib/db": "export const db=new Proxy({siteMaintenance:{findUnique:async()=>null}},{get(target,key){if(key in target)return target[key];throw new Error('Real database disabled')}})",
};
registerHooks({ resolve(specifier, context, nextResolve) {
  return Object.hasOwn(mocks, specifier)
    ? { url: "data:text/javascript," + encodeURIComponent(mocks[specifier]!), shortCircuit: true }
    : nextResolve(specifier, context);
} });
const { POST: upload } = await import("../src/app/api/upload/route");
const { POST: kofi } = await import("../src/app/api/kofi/route");
const { config } = await import("../src/middleware");
for (const path of ["/api/kofi", "/api/kofi/", "/api/kofi?test=1"]) {
  assert.equal(unstable_doesMiddlewareMatch({ config, url: path }), false, path);
}
for (const path of ["/api/upload", "/api/kofi-other", "/api/auth/passkey/verify-registration", "/queue"]) {
  assert.equal(unstable_doesMiddlewareMatch({ config, url: path }), true, path);
}
const form = new FormData();
form.set("title", "Fixture");
for (const origin of ["https://hostile.example.test", "null", "", "https://print.example.test:444"]) {
  calls.length = 0;
  const request = new Request("https://print.example.test/api/upload", { method: "POST", headers: { origin }, body: form });
  assert.equal((await upload(request)).status, 403);
  assert.equal(request.bodyUsed, false);
  assert.deepEqual(calls, [], "Refuse before authentication, parsing, slot acquisition or persistence");
}
for (const origin of [undefined, "https://print.example.test"]) {
  calls.length = 0;
  const request = new Request("https://print.example.test/api/upload", { method: "POST", headers: origin === undefined ? {} : { origin }, body: form });
  assert.equal((await upload(request)).status, 200);
  assert.deepEqual(calls, ["auth", "validate", "save"]);
}
Reflect.set(globalThis, "requestSecurityActor", null);
assert.equal((await upload(new Request("https://print.example.test/api/upload", { method: "POST", body: form }))).status, 401);
console.info("PASS upload rejects hostile and opaque Origins before body work; same-origin and API clients still work");

const payload = { verification_token: process.env.KOFI_VERIFICATION_TOKEN, type: "Donation", kofi_transaction_id: "fixture", amount: "5.00", currency: "USD" };
const delivery = new URLSearchParams({ data: JSON.stringify(payload) }).toString();
function streamed(body: string, length?: string) {
  const bytes = new TextEncoder().encode(body);
  let offset = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === bytes.length) { controller.close(); return; }
      const end = Math.min(bytes.length, offset + 4096);
      controller.enqueue(bytes.subarray(offset, end));
      offset = end;
    },
    cancel() { cancelled = true; },
  });
  const request = new Request("https://print.example.test/api/kofi", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...(length === undefined ? {} : { "content-length": length }) },
    body: stream, duplex: "half",
  } as RequestInit);
  return { request, consumed: () => offset, cancelled: () => cancelled };
}
for (const length of [undefined, "1", "0", "not-a-number"]) {
  calls.length = 0;
  const input = streamed(delivery + "&padding=" + "x".repeat(96 * 1024), length);
  assert.equal((await kofi(input.request)).status, 413);
  assert.equal(input.cancelled(), true);
  assert.ok(input.consumed() <= 64 * 1024 + 2 * 4096, "Stop consumption when the real cap is crossed");
  assert.deepEqual(calls, []);
}
const declared = streamed(delivery + "&padding=" + "x".repeat(96 * 1024), "100000");
assert.equal((await kofi(declared.request)).status, 413);
assert.equal(declared.request.bodyUsed, false);
for (const padding of [0, 64 * 1024 - new TextEncoder().encode(delivery + "&padding=").length]) {
  calls.length = 0;
  assert.equal((await kofi(streamed(delivery + "&padding=" + "x".repeat(padding)).request)).status, 200);
  assert.deepEqual(calls, ["gift"]);
}
const forged = streamed(new URLSearchParams({ data: JSON.stringify({ ...payload, verification_token: "wrong" }) }).toString());
assert.equal((await kofi(forged.request)).status, 401);
const malformed = streamed("data=not-json");
assert.equal((await kofi(malformed.request)).status, 400);
delete process.env.KOFI_VERIFICATION_TOKEN;
const off = streamed(delivery);
assert.equal((await kofi(off.request)).status, 404);
assert.equal(off.request.bodyUsed, false);
console.info("PASS Ko-fi byte cap rejects missing/false lengths, cancels oversized streams, retains valid delivery and skips disabled parsing");
