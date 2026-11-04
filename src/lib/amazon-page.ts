import { load } from "cheerio/slim";
import { amazonListingUrl } from "@/lib/amazon-listing";
import { amazonImageUrl, type AmazonProductPage } from "@/lib/amazon-product";
import { readFilamentDetails } from "@/lib/amazon-filament-details";

const CURRENCY: Record<string, string> = {
  com: "USD", ca: "CAD", "co.uk": "GBP", de: "EUR", fr: "EUR", it: "EUR", es: "EUR", nl: "EUR", se: "SEK", pl: "PLN",
  "com.be": "EUR", ie: "EUR", "com.au": "AUD", "co.jp": "JPY", in: "INR", "com.br": "BRL", "com.mx": "MXN", sg: "SGD", ae: "AED", sa: "SAR", "com.tr": "TRY",
};
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue | null => value && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : null;
const string = (value: unknown) => typeof value === "string" ? value : "";

/** Schema Product nodes only, including @graph. Never scan arbitrary recommendation data for a price. */
function products(value: unknown, depth = 0): ObjectValue[] {
  if (depth > 6) return [];
  if (Array.isArray(value)) return value.flatMap(item => products(item, depth + 1));
  const node = object(value);
  if (!node) return [];
  const type = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
  return type.includes("Product") ? [node] : products(node["@graph"], depth + 1);
}
function amount(text: string): number | null {
  if (/-\s*[$£€¥￥₹]?\s*\d|\d\s*[-–]\s*[$£€¥￥₹]?\s*\d|\bfrom\b|\bstarting\b/i.test(text)) return null;
  const numeric = text.match(/\d[\d\s\u00a0\u202f.,]*/)?.[0].replace(/[\s\u00a0\u202f]/g, "");
  if (!numeric || /[.,]{2}/.test(numeric)) return null;
  const decimal = /[.,](\d{1,2})$/.exec(numeric);
  const integer = decimal ? numeric.slice(0, decimal.index) : numeric;
  if (/[.,]/.test(integer) && !/^\d{1,3}(?:[.,]\d{3})+$/.test(integer)) return null;
  const normalized = decimal ? numeric.slice(0, decimal.index).replace(/[.,]/g, "") + "." + decimal[1] : numeric.replace(/[.,]/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 && value <= 1_000_000 ? value : null;
}
function currency(text: string, fallback: string): string | null {
  const code = text.match(/\b(USD|CAD|GBP|EUR|AUD|JPY|INR|BRL|MXN|SGD|AED|SAR|TRY|SEK|PLN)\b/)?.[1];
  if (code) return code;
  for (const [mark, code] of [["US$", "USD"], ["CA$", "CAD"], ["A$", "AUD"], ["S$", "SGD"], ["MX$", "MXN"], ["R$", "BRL"], ["£", "GBP"], ["€", "EUR"], ["¥", "JPY"], ["￥", "JPY"], ["₹", "INR"], ["zł", "PLN"], ["kr", "SEK"]])
    if (text.includes(mark)) return code;
  if (text.includes("د.إ")) return "AED";
  if (text.includes("ر.س")) return "SAR";
  if (/\bTL\b/.test(text)) return "TRY";
  return text.includes("$") && ["USD", "CAD", "AUD", "SGD", "MXN", "BRL"].includes(fallback) ? fallback : null;
}

/** Parse markup, without running scripts or accepting another variant's identity. */
export function readAmazonPage(html: string, url: string, checkedAt: string): AmazonProductPage {
  const empty: AmazonProductPage = { url, status: "unavailable", checkedAt: null, price: null, image: null, imageUrl: null, filament: null };
  if (amazonListingUrl(url) !== url) return empty;
  const $ = load(html);
  if (/robot check|captcha|sorry! something went wrong/i.test($("title").text())
    || $("#captchacharacters, form[action*='validateCaptcha'], #auth-captcha-image").length) return { ...empty, status: "blocked" };
  const asin = url.split("/").at(-1)!;
  const structured = $("script[type='application/ld+json']").toArray().flatMap(element => {
    try { return products(JSON.parse($(element).text())); } catch { return []; }
  }).find(product => string(product.sku).toUpperCase() === asin || string(product.productID).replace(/^asin:/i, "").toUpperCase() === asin
    || amazonListingUrl(product.url) === url);
  const selected = $("#ASIN").first().attr("value") ?? $("#dp[data-asin]").first().attr("data-asin");
  // Amazon's canonical URL can name the parent even while #ASIN identifies the selected child.
  const identity = selected ? selected.toUpperCase() === asin : !!structured
    || amazonListingUrl($("link[rel='canonical']").attr("href")) === url || amazonListingUrl($("meta[property='og:url']").attr("content")) === url;
  if (!identity) return empty;
  $("script, style").remove();

  const country = new URL(url).hostname.replace(/^www\.amazon\./, "");
  const nativeCurrency = CURRENCY[country];
  let price: AmazonProductPage["price"] = null;
  // Scoped to the actual buy box. Strike-through/list/unit prices and subscription templates are excluded.
  for (const selector of [
    "#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price)", "#corePrice_feature_div .a-price:not(.a-text-price)",
    "#apex_desktop .apexPriceToPay", "#apex_mobile .apexPriceToPay", "#priceblock_ourprice", "#priceblock_dealprice", "#priceblock_saleprice", "#price_inside_buybox", "#newBuyBoxPrice",
  ]) {
    for (const element of $(selector).toArray()) {
      const node = $(element);
      if (node.closest("[hidden], [aria-hidden='true'], .aok-hidden, .a-hidden, [id^='sns'], [id*='subscription'], [id*='subscribe'], [id*='primeExclusive'], .pricePerUnit, .basisPrice").length) continue;
      const context = node.parents().toArray().slice(0, 3).filter(element => !/^(?:corePrice|apex_)/.test($(element).attr("id") ?? ""))
        .map(element => $(element).text()).join(" ");
      if (/prime[- ]exclusive|prime price|subscribe|see price in (?:cart|checkout)/i.test(context)) continue;
      const offscreen = node.find(".a-offscreen").first().text().trim();
      const whole = node.find(".a-price-whole").first().text().trim();
      const fraction = node.find(".a-price-fraction").first().text().trim();
      const display = offscreen || (whole ? `${node.find(".a-price-symbol").first().text()}${whole}${fraction}` : node.text().trim());
      const value = amount(display); const code = currency(display, nativeCurrency);
      if (value !== null && code) { price = { amount: value, currency: code }; break; }
    }
    if (price) break;
  }
  const availability = $("#availability").first().text();
  if (/currently unavailable|out of stock|temporarily out of stock/i.test(availability)) price = null;
  else if (!price && structured) {
    const offers = Array.isArray(structured.offers) ? structured.offers : [structured.offers];
    for (const raw of offers) {
      const offer = object(raw);
      if (!offer || offer["@type"] !== "Offer" || /outofstock|discontinued/i.test(string(offer.availability))
        || (offer.url && amazonListingUrl(offer.url) !== url) || offer.eligibleCustomerType
        || /subscribe|prime[- ]exclusive/i.test(`${string(offer.name)} ${string(offer.description)}`)) continue;
      const value = amount(String(offer.price ?? "")); const code = string(offer.priceCurrency);
      if (value !== null && Object.values(CURRENCY).includes(code)) { price = { amount: value, currency: code }; break; }
    }
  }
  const main = $("#landingImage, #imgBlkFront, #main-image").first();
  let imageUrl = amazonImageUrl(main.attr("data-old-hires")) ?? amazonImageUrl(main.attr("src"));
  if (!imageUrl && main.attr("data-a-dynamic-image")) {
    try {
      const candidates = object(JSON.parse(main.attr("data-a-dynamic-image")!));
      imageUrl = Object.keys(candidates ?? {}).map(amazonImageUrl).find((value): value is string => !!value) ?? null;
    } catch { /* Malformed image metadata has no effect on pricing. */ }
  }
  if (!imageUrl) imageUrl = amazonImageUrl($("meta[property='og:image']").attr("content"));
  if (!imageUrl && structured) imageUrl = (Array.isArray(structured.image) ? structured.image : [structured.image])
    .map(value => amazonImageUrl(typeof value === "string" ? value : object(value)?.url)).find((value): value is string => !!value) ?? null;
  const filament = readFilamentDetails($, structured);
  return { url, status: price || imageUrl || filament.title || filament.type || filament.hex ? "ready" : "unavailable", checkedAt, price, imageUrl, filament,
    image: imageUrl ? `/api/amazon-products/image?listing=${encodeURIComponent(url)}` : null };
}
