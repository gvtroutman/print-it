import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, newNonce } from "@/lib/csp";
import { OWNER_COOKIE, WHO_COOKIE } from "@/lib/identity-rules";

/**
 * Two jobs, both cheap enough to run on every request.
 *
 * 1. Mint a CSP nonce and attach the policy. Next reads the policy back off
 *    the *request* headers to stamp the nonce onto its own inline scripts,
 *    which is why it is set in both directions.
 *
 * 2. Send visitors who have not said who they are to `/hello`, so they get
 *    the name picker instead of a shell that flashes and then bounces.
 *
 * The second only checks that a cookie is *present*. The real checks are
 * `requireUser`, `requireAdmin` and `storyScope`, which verify the cookie's
 * signature inside every page and every server action.
 */
const PUBLIC_PREFIXES = ["/hello", "/owner"];

const isProd = process.env.NODE_ENV === "production";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const nonce = newNonce();
  const csp = buildCsp(nonce, isProd);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const withCsp = (res: NextResponse) => {
    res.headers.set("content-security-policy", csp);
    return res;
  };

  // API routes are never redirected. A caller with no name needs a 401 with a
  // JSON body, not a 307 to an HTML page it cannot parse — an XHR upload
  // following that redirect would report a mystifying success.
  //
  // The consequence is that every route handler under /api owes its own
  // check. `currentUser()` / `withActor` is how.
  const isApi = pathname.startsWith("/api/");
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  const hasCookie = request.cookies.has(WHO_COOKIE) || request.cookies.has(OWNER_COOKIE);

  if (isApi || isPublic || hasCookie) {
    return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  const hello = new URL("/hello", request.url);
  hello.searchParams.set("next", pathname + search);
  return withCsp(NextResponse.redirect(hello));
}

export const config = {
  // Everything except static assets, which need no nonce and no name.
  //
  // `icon.svg` is on this list because leaving it off put the favicon behind
  // the redirect: a browser with no name asked for it, got a 307, and
  // rendered no icon at all on the one page where the brand does the most
  // work. It is a public brand asset; there is nothing there to protect.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.png$).*)"],
};
