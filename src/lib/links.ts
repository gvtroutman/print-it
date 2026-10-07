import { MAX_LINKS_PER_ORDER } from "@/lib/upload-limits";

/**
 * Links a requester sends with an order: the product the part fits, a video of
 * the thing it fixes, the forum post with the settings that worked.
 *
 * Shared by the form, the upload route and the story page, so the three agree
 * on what counts as a link. Unlike `sourceUrl` these are typed by a person and
 * nothing vouches for where they point — so the rule is about what they can
 * *do* when clicked, not where they go: http or https, nothing else. A
 * `javascript:` or `data:` URL in an href is script, and is refused here and
 * again at render.
 */

const MAX_LINK_LENGTH = 2000;

/**
 * One link, cleaned, or a sentence saying why not.
 *
 * A bare `example.com/thing` is read as https, because that is what someone
 * pasting it meant. Credentials in the URL are dropped rather than stored.
 */
export function parseLink(raw: string): { ok: true; href: string } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Paste a link first." };
  if (text.length > MAX_LINK_LENGTH) return { ok: false, error: "That link is very long." };

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, error: "That does not look like a link." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "Only http and https links can be added." };
  }
  if (!url.hostname.includes(".") && url.hostname !== "localhost") {
    return { ok: false, error: "That does not look like a link." };
  }
  url.username = "";
  url.password = "";
  return { ok: true, href: url.href };
}

/**
 * The links of one order, held to the rules: every one parses, none repeats,
 * and there are not too many. Throws the first problem as a sentence.
 */
export function parseLinks(raw: unknown[]): string[] {
  const links: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string" || !value.trim()) continue;
    const parsed = parseLink(value);
    if (!parsed.ok) throw new Error(`${parsed.error} (${value.slice(0, 80)})`);
    if (!links.includes(parsed.href)) links.push(parsed.href);
  }
  if (links.length > MAX_LINKS_PER_ORDER) {
    throw new Error(`Up to ${MAX_LINKS_PER_ORDER} links per order.`);
  }
  return links;
}

/**
 * A stored link, ready to become an href — or null if it somehow is not one.
 * Re-checked at render because the column outlives the code that wrote it.
 * The label is the host and path, which is what tells a reader where it goes.
 */
export function displayLink(stored: string): { href: string; label: string } | null {
  let url: URL;
  try {
    url = new URL(stored);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const path = url.pathname === "/" ? "" : decodeSafely(url.pathname);
  const label = `${url.hostname.replace(/^www\./, "")}${path}`;
  return { href: url.href, label: label.length > 70 ? `${label.slice(0, 69)}…` : label };
}

function decodeSafely(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
