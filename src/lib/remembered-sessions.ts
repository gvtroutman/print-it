import type { BetterAuthPlugin, GenericEndpointContext } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { expireCookie, setSessionCookie } from "better-auth/cookies";

import {
  DEVICE_MARKER_COOKIE,
  REMEMBER_DEVICE_HEADER,
  REMEMBERED_SESSION_SECONDS,
} from "@/lib/auth-rules";
import { deviceMarkerFor } from "@/lib/device-marker";

/** Read the incoming session, never the new cookie on the response. */
async function previousSession(ctx: GenericEndpointContext) {
  const token = await ctx.getSignedCookie(
    ctx.context.authCookies.sessionToken.name,
    ctx.context.secret,
  );
  if (!token) return null;
  const previous = await ctx.context.internalAdapter.findSession(token);
  return previous && previous.session.expiresAt.getTime() > Date.now() ? previous : null;
}

async function isRemembered(ctx: GenericEndpointContext, token: string) {
  return ctx.getCookie(DEVICE_MARKER_COOKIE) === await deviceMarkerFor(token);
}

/**
 * Remember a browser only after a real sign-in. The marker grants no access:
 * the signed session cookie and its live database row remain the authority.
 * Re-authentication carries the original expiry forward and replaces the old
 * session, so confirming a sensitive action neither forgets the device nor
 * leaves another long-lived credential behind.
 */
export function rememberedSessions() {
  return {
    id: "remembered-sessions",
    hooks: {
      before: [{
        matcher: (ctx) => ctx.path === "/get-session",
        handler: createAuthMiddleware(async (ctx) => {
          const token = await ctx.getSignedCookie(
            ctx.context.authCookies.sessionToken.name,
            ctx.context.secret,
          );
          // Long device sessions have a fixed expiry, including in their last
          // twenty minutes. Let get-session validate/revoke them as usual.
          if (token && await isRemembered(ctx, token)) {
            return { context: { ...ctx, query: { ...ctx.query, disableRefresh: true } } };
          }
        }),
      }],
      after: [{
        matcher: (ctx) => [
          "/sign-in/username", "/sign-in/email", "/passkey/verify-authentication", "/sign-out",
        ].includes(ctx.path ?? ""),
        handler: createAuthMiddleware(async (ctx) => {
          const attributes = {
            httpOnly: true,
            sameSite: "lax" as const,
            path: "/",
            secure: ctx.context.authCookies.sessionToken.attributes.secure,
          };
          if (ctx.path === "/sign-out") {
            ctx.setCookie(DEVICE_MARKER_COOKIE, "", { ...attributes, maxAge: 0 });
            return;
          }

          const signedIn = ctx.context.newSession;
          if (!signedIn) return; // A failed sign-in cannot remember anything.

          const previous = await previousSession(ctx);
          const sameUser = previous?.user.id === signedIn.user.id;
          const preference = ctx.headers?.get(REMEMBER_DEVICE_HEADER);
          const expiresAt = preference === "true"
            ? new Date(Date.now() + REMEMBERED_SESSION_SECONDS * 1000)
            : preference !== "false" && sameUser && previous &&
                await isRemembered(ctx, previous.session.token)
              ? previous.session.expiresAt
              : null;

          if (expiresAt) {
            const session = await ctx.context.internalAdapter.updateSession(
              signedIn.session.token,
              { expiresAt },
            );
            if (!session) {
              throw new APIError("UNAUTHORIZED", { message: "The session is no longer available." });
            }
            const maxAge = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
            // Clear any legacy rememberMe:false flag, which disables refresh
            // and otherwise keeps applying to later passkey sign-ins.
            expireCookie(ctx, ctx.context.authCookies.dontRememberToken);
            await setSessionCookie(ctx, { session, user: signedIn.user }, false, { maxAge });
            ctx.setCookie(DEVICE_MARKER_COOKIE, await deviceMarkerFor(session.token), {
              ...attributes, maxAge,
            });
            const returned = ctx.context.returned;
            if (returned && typeof returned === "object" && "session" in returned) {
              returned.session = session;
            }
          } else {
            ctx.setCookie(DEVICE_MARKER_COOKIE, "", { ...attributes, maxAge: 0 });
          }

          if (sameUser && previous && previous.session.token !== signedIn.session.token) {
            await ctx.context.internalAdapter.deleteSession(previous.session.token);
          }
        }),
      }],
    },
  } satisfies BetterAuthPlugin;
}
