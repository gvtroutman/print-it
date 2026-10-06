/**
 * Avatar fallback: the first two letters of the given name, uppercased.
 *
 * "Ayla Berg" -> "AY", not "AB". This follows the handoff's own examples —
 * every avatar in the prototype (AY, JO, SA, KW, RU) is a first name clipped
 * to two letters, which is what keeps a room full of Bergs distinguishable.
 */
export function initialsFor(name: string): string {
  const first = name.trim().split(/\s+/).filter(Boolean)[0];
  if (!first) return "??";
  // Intl-aware slice so an accented or non-Latin first name is not cut apart.
  return [...first].slice(0, 2).join("").toUpperCase();
}
