/** Shared browser-write policy for JSON and multipart requests. */
export function crossOriginWrite(request: Request): boolean {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return false;
  const origin = request.headers.get("origin");
  // Non-browser API clients do not send Origin and can use their bearer token.
  if (origin === null) return false;
  try {
    return origin !== new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin;
  } catch {
    return true;
  }
}
