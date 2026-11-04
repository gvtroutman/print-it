import type { CheerioAPI } from "cheerio/slim";
import type { AmazonFilamentDetails } from "@/lib/amazon-product";

const clean = (value: string) => value.replace(/[\u200e\u200f\u202a-\u202e]/g, "").replace(/\s+/g, " ").trim();

/** Read actual material names; ambiguous compatibility lists cannot choose a material. */
export function filamentTypeFromText(material: string, title = ""): string | null {
  const bases = (text: string) => {
    const normalized = text.replace(/polylactic acid/ig, "PLA").replace(/polyethylene terephthalate glycol(?: modified)?/ig, "PETG")
      .replace(/acrylonitrile butadiene styrene/ig, "ABS").replace(/thermoplastic polyurethane/ig, "TPU").replace(/polyamide/ig, "Nylon").replace(/polycarbonate/ig, "PC");
    return [...new Set((normalized.match(/\b(?:PLA|PETG|PCTG|CPE|CoPE|PET|ABS|ASA|TPU|TPE|PA6|PA12|PAHT|PA|Nylon|PC|PVA|HIPS|PP|PEEK|PEI|PPS|Resin)\b/gi) ?? []).map(value => /^nylon$/i.test(value) ? "Nylon" : /^resin$/i.test(value) ? "Resin" : value.toUpperCase()))];
  };
  const stated = bases(material); const inferred = bases(title);
  const choices = stated.length ? stated : inferred;
  if (choices.length !== 1) return null;
  let base = choices[0]; const context = `${material} ${title}`;
  if (/carbon fib(?:er|re)|\b(?:PLA|PETG|PA\d*|PAHT|PC|ABS|ASA|PPS)[ -]CF\b/i.test(context)) return `${base}-CF`;
  if (/glass fib(?:er|re)|\b(?:PLA|PETG|PA\d*|PAHT|PC|ABS|ASA)[ -]GF\b/i.test(context)) return `${base}-GF`;
  if (base === "PLA" && /\bPLA\s*(?:\+|plus\b)/i.test(context)) base = "PLA+";
  const finish = /\bsilk\b/i.test(context) ? "Silk" : /\bmatte\b/i.test(context) ? "Matte" : /\bwood\b/i.test(context) ? "Wood" : null;
  return finish && base !== "Resin" ? `${finish} ${base}` : base;
}

/** Selected variant details only; reviews, recommendations and arbitrary script literals are excluded. */
export function readFilamentDetails($: CheerioAPI, structured?: Record<string, unknown>): AmazonFilamentDetails {
  const specs = new Map<string, string>();
  $("#productOverview_feature_div tr, #productDetails_techSpec_section_1 tr, #productDetails_techSpec_section_2 tr, #productDetails_detailBullets_sections1 tr").each((_index, element) => {
    const row = $(element); const cells = row.children("th, td");
    const label = clean(cells.first().text()).replace(/[:：]$/, "").toLowerCase();
    const value = clean(cells.slice(1).text());
    if (label && value && !specs.has(label)) specs.set(label, value);
  });
  if (Array.isArray(structured?.additionalProperty)) for (const value of structured.additionalProperty) {
    if (value && typeof value === "object" && typeof value.name === "string" && typeof value.value === "string") {
      const label = clean(value.name).toLowerCase(); if (!specs.has(label)) specs.set(label, clean(value.value));
    }
  }
  const title = clean($("#productTitle").first().text() || (typeof structured?.name === "string" ? structured.name : "")).slice(0, 300) || null;
  const material = specs.get("material") || specs.get("material type") || (typeof structured?.material === "string" ? structured.material : "");
  const namedColors = [...new Set((title?.match(/\b(?:black|white|gr[ae]y|red|green|blue|cyan|teal|orange|yellow|purple|pink|brown|silver|gold|bronze|maroon|navy|beige|ivory)\b/gi) ?? []).map(value => value.toLowerCase()))];
  const color = clean($("#variation_color_name .selection").first().text()) || specs.get("color") || specs.get("colour")
    || (typeof structured?.color === "string" ? clean(structured.color) : "");
  const colorName = color.replace(/\b\d+(?:\.\d+)?\s*(?:kg|g|lbs?|oz|packs?|spools?|rolls?)\s*/gi, "").replace(/^[\s,–-]+|[\s,–-]+$/g, "").slice(0, 80)
    || (namedColors.length === 1 ? namedColors[0][0].toUpperCase() + namedColors[0].slice(1) : null);
  const statedHex = specs.get("hex code") || specs.get("color hex") || specs.get("hex color") || specs.get("colour hex") || specs.get("hexadecimal color code");
  const hex = statedHex ? /^#?([0-9a-f]{6})$/i.exec(statedHex)?.[1] : /(?:^|\s|\()#([0-9a-f]{6})(?=$|\s|\))/i.exec(color)?.[1];
  return { title, type: filamentTypeFromText(material, title ?? ""), colorName, hex: hex ? `#${hex.toLowerCase()}` : null };
}
