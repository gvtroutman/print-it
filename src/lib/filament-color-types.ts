import { isScentedMaterial } from "@/lib/filament-traits";

export const FILAMENT_COLOR_TYPES = ["Solid", "Translucent", "Gradient", "Glitter", "Multi Color", "Silk", "Marble", "Composite"] as const;
export type FilamentColorType = (typeof FILAMENT_COLOR_TYPES)[number];
export const FILAMENT_COLOR_FILTERS = [...FILAMENT_COLOR_TYPES, "Scented", "Glow"] as const;
export type FilamentColorFilter = (typeof FILAMENT_COLOR_FILTERS)[number];
type ColorDescription = { name: string; type: string; maker?: string; product?: string; translucent?: boolean; colorType?: FilamentColorType; shade?: string | null };

/** Cooling notes describe the source's print sample, not the member's color choice. */
export function colorDisplayName(name: string): string {
  return name.replace(/\s*\(\s*(?:w\s*\/\s*o|w\s*\/|without|with|no)\s*(?:cooling\s+)?fan\s*\)/gi, "").trim();
}

/** Title case for picker labels, preserving source names used to match selections. */
export function colorTitleCase(name: string): string {
  return colorDisplayName(name).toLowerCase().replace(/(^|[\s(/+&-])\p{L}/gu, letter => letter.toUpperCase());
}

// The supplied Glacier photo shows cyan fading to ice blue and white. Its
// "Multi Rainbow Color" product title otherwise gives it a generic rainbow.
const GLACIER_COLORS = ["#35b8d9", "#99dfea", "#effbfc"];
const glacierGradient = (color: ColorDescription) =>
  color.maker?.toLowerCase().replace(/[^a-z0-9]/g, "") === "3dhojor"
  && /^(?:blue\s+)?glacier(?:\s*\((?:gradient|multi color)\))?$/i.test(colorDisplayName(color.name))
  && /\bpla\b/i.test(color.type);

/** Filled materials, including older samples whose filler is named only by the color. */
function compositeFilament(text: string): boolean {
  return /\b(?:composites?|wood(?:fill(?:ed)?)?|bamboofill|corkfill|fib(?:er|re)(?:glass)?|(?:carbon|glass)[ -]?fib(?:er|re)|[cg]f\d*)\b/i.test(text)
    || /\b(?:metal|copper|brass|bronze|iron|steel|alumin(?:um|ium)|ceramic|bamboo|cork)[ -]?(?:fill(?:ed)?|powder|infused)\b/i.test(text);
}

/** A physical color effect takes precedence over a secondary finish, such as silk. */
export function filamentColorType(color: ColorDescription): FilamentColorType {
  if (glacierGradient(color)) return "Gradient";
  const name = colorDisplayName(color.name);
  const text = `${name} ${color.product ?? ""} ${color.type}`;
  const composite = compositeFilament(text);
  // Old imports can label filled filaments as solid/silk or mistake glass fibre for translucency.
  if (color.colorType && !(composite && ["Solid", "Translucent", "Silk"].includes(color.colorType))) return color.colorType;
  if (/\b(?:multi[ -]?colou?r|dual(?:[ -]colou?r)?|tri(?:ple)?[ -]colou?r|coextrud\w*)\b/i.test(text)
    || /[+/&]/.test(name) && (name.match(/\b(red|gold|green|black|yellow|blue|purple|pink|orange|white|silver|grey|gray|brown|bronze|copper)\b/gi)?.length ?? 0) > 1) return "Multi Color";
  if (/\b(?:rainbow|gradient|ombre|gradual)\b/i.test(text)) return "Gradient";
  if (/\b(?:glitter|sparkle|sparkly|galaxy|stardust|confetti|funfetti)\b/i.test(text)) return "Glitter";
  if (/\bmarble\b/i.test(text)) return "Marble";
  if (composite) return "Composite";
  if (color.translucent || color.shade === "TRN" || /translu|transparent|\bclear\b|\bglass\b|\bcrystal\b|see.?through/i.test(text)) return "Translucent";
  if (/\bsilk\b/i.test(text)) return "Silk";
  return "Solid";
}

export const FILAMENT_TYPE_HELP: Record<FilamentColorType, string> = {
  Solid: "An opaque, single color.",
  Translucent: "A color that lets light through.",
  Gradient: "Colors change gradually along the spool.",
  Glitter: "A base color with sparkling flecks.",
  "Multi Color": "Two or more colors in the same filament.",
  Silk: "A smooth, shiny finish.",
  Marble: "A stone-like finish with contrasting flecks.",
  Composite: "Filament mixed with metal, wood, carbon fiber or other fillers.",
};

export const FILAMENT_FILTER_HELP: Record<FilamentColorFilter, string> = {
  ...FILAMENT_TYPE_HELP,
  Scented: "Filaments labeled as scented, in any color or finish.",
  Glow: "Glow-in-the-dark and luminous filaments, in any color or finish.",
};

/** Scent and glow can accompany any finish; ordinary color names are not enough. */
export function filamentMatchesColorFilter(color: ColorDescription, filter: FilamentColorFilter): boolean {
  const text = `${colorDisplayName(color.name)} ${color.product ?? ""} ${color.type}`;
  if (filter === "Scented") return isScentedMaterial(text);
  if (filter === "Glow") {
    if (/\b(?:non|not|no)[-\s]+(?:glow(?:ing)?|luminous|phosphorescent)\b/i.test(text)) return false;
    return /\b(?:glow(?:ing)?|luminous|phosphorescent)\b/i.test(text);
  }
  return filamentColorType(color) === filter;
}

const NAMED_COLORS: Record<string, string> = {
  red: "#dc3545", gold: "#e4b54b", green: "#43aa8b", black: "#20252b", yellow: "#f6c945",
  blue: "#2787c9", purple: "#7557c7", pink: "#e4328c", orange: "#ef873f", white: "#f7f7f2",
  silver: "#c2c9cf", grey: "#88929b", gray: "#88929b", brown: "#855a3d", bronze: "#a87845", copper: "#bd7955",
};
export const TRANSLUCENT_BACKGROUND = "repeating-conic-gradient(#d4d9dd 0% 25%, #ffffff 0% 50%) 0 0 / 12px 12px";

/** Illustrative finish previews; the recorded hex remains the model's base color. */
export function filamentColorStyle(color: ColorDescription & { hex: string; colors?: string[] }): string {
  const type = filamentColorType(color);
  if (type !== "Composite" && (type === "Translucent" || color.translucent)) {
    if (type !== "Glitter") return `linear-gradient(${color.hex}80, ${color.hex}80), ${TRANSLUCENT_BACKGROUND}`;
  }
  if (type === "Gradient" || type === "Multi Color") {
    const named = (color.name.toLowerCase().match(/\b(red|gold|green|black|yellow|blue|purple|pink|orange|white|silver|grey|gray|brown|bronze|copper)\b/g) ?? []).map(name => NAMED_COLORS[name]);
    const colors = glacierGradient(color) ? GLACIER_COLORS : color.colors?.length ? color.colors : [...new Set(named)];
    const stops = colors.length > 1 ? colors : [color.hex, "#f6c945", "#43aa8b", "#2787c9", "#7557c7"];
    return type === "Gradient"
      ? `linear-gradient(135deg, ${stops.join(", ")})`
      : `conic-gradient(from 45deg, ${stops.map((hex, i) => `${hex} ${i * 100 / stops.length}% ${(i + 1) * 100 / stops.length}%`).join(", ")})`;
  }
  if (type === "Glitter") return `radial-gradient(circle at 3px 4px, #ffffffd9 0 1px, transparent 1.5px) 0 0 / 11px 13px, radial-gradient(circle at 7px 8px, #ffffff99 0 1px, transparent 1.5px) 0 0 / 17px 19px, ${color.hex}`;
  if (type === "Marble") return `radial-gradient(ellipse at 3px 4px, #221a1490 0 0.7px, transparent 1.2px) 0 0 / 9px 11px, radial-gradient(ellipse at 7px 8px, #ffffffa0 0 1px, transparent 1.6px) 0 0 / 13px 17px, ${color.hex}`;
  if (type === "Composite") return `radial-gradient(circle at 2px 3px, #00000030 0 0.5px, transparent 1px) 0 0 / 5px 7px, radial-gradient(circle at 4px 5px, #ffffff30 0 0.5px, transparent 1px) 0 0 / 7px 9px, ${color.hex}`;
  if (type === "Silk") return `linear-gradient(120deg, #00000030, #ffffff90 35%, transparent 52%, #00000035 75%, #ffffff60), ${color.hex}`;
  return color.hex;
}

/** Preserve the finish on Auto requests and saved colors that otherwise store only a name and hex. */
export function filamentColorName(color: ColorDescription): string {
  const type = filamentColorType(color);
  const name = colorDisplayName(color.name);
  if (type === "Solid" || name.toLowerCase().includes(type.toLowerCase())) return name;
  const suffix = ` (${type})`;
  return name.slice(0, 80 - suffix.length) + suffix;
}
