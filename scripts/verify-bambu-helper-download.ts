import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") { console.log("Windows helper download check skipped on this platform."); process.exit(0); }
let requests = 0;
const server = createServer((request, response) => {
  requests++;
  assert.match(request.url ?? "", /\/api\/models\/42\?t=cGF5bG9hZA.c2lnbmF0dXJl$/);
  if (request.url?.startsWith("/redirect/")) { response.writeHead(302, { Location: "http://127.0.0.1:1/should-not-be-fetched" }); response.end(); return; }
  const bytes = Buffer.from("fixture-model");
  response.writeHead(200, { "Content-Length": bytes.length, "Content-Disposition": request.url?.startsWith("/bad-format/") ? 'attachment; filename="hostile.exe"' : 'attachment; filename="../../bracket.stl"' });
  response.end(bytes);
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
try {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const result = await promisify(execFile)("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", fileURLToPath(new URL("./verify-bambu-helper.ps1", import.meta.url)), "-FixtureOrigin", `http://127.0.0.1:${address.port}`], { timeout: 45_000 });
  console.log(result.stdout.trim());
  assert.equal(requests, 3, "One model fetch, one refused redirect and one refused format; no redirect follow-up");
  console.log("Streamed helper download passed: exact bytes, safe ticket filename, no redirects or executable payloads.");
} finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
