import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx } from "better-auth/api";
import type { bearer } from "better-auth/plugins/bearer";

import { FRESH_AUTH_SECONDS } from "@/lib/auth-rules";

const REGISTRATION = new Set([
  "/passkey/generate-register-options",
  "/passkey/verify-registration",
]);

/** Enrollment is owner-only; enrollment and deletion require recent proof. */
export function passkeyAccess(tokenPlugin: ReturnType<typeof bearer>) {
  const convertBearer = tokenPlugin.hooks.before[0]!.handler;
  return {
    id: "passkey-access",
    hooks: {
      before: [{
        matcher: (ctx) => REGISTRATION.has(ctx.path ?? "") || ctx.path === "/passkey/delete-passkey",
        handler: createAuthMiddleware(async (ctx) => {
          // Better Auth applies before-hook header changes after all hooks.
          // Reuse its signed bearer conversion here so this hook sees the
          // same credential the endpoint's session middleware will see.
          if (ctx.headers?.has("authorization")) {
            const converted = await convertBearer({ ...ctx, returnHeaders: false });
            if (converted?.context?.headers) ctx.headers = converted.context.headers;
          }
          const signedIn = await getAuthoritativeSessionFromCtx(ctx);
          if (!signedIn) {
            throw new APIError("UNAUTHORIZED", { code: "UNAUTHORIZED", message: "Sign in first." });
          }
          const user = signedIn.user as typeof signedIn.user & { role?: unknown; banned?: unknown };
          if (user.banned === true || (REGISTRATION.has(ctx.path ?? "") && user.role !== "admin")) {
            throw new APIError("FORBIDDEN", {
              code: "PASSKEY_OWNER_ONLY", message: "Only the printer owner can add a passkey.",
            });
          }
          const age = Date.now() - new Date(signedIn.session.createdAt).getTime();
          if (!Number.isFinite(age) || age < 0 || age >= FRESH_AUTH_SECONDS * 1000) {
            throw new APIError("FORBIDDEN", {
              code: "SESSION_NOT_FRESH", message: "Confirm it is you before changing a passkey.",
            });
          }
        }),
      }],
    },
  } satisfies BetterAuthPlugin;
}
