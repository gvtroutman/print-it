import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { FILAMENT_BRANDS, filamentBrandKey } from "../src/lib/filament-brands";

const base = "https://api.openfilamentdatabase.org/api/v1/brands/logo/";
const out = "public/filament-brands";
// Preserve the owner's supplied artwork when refreshing the database logos.
const suppliedLogos: Record<string, { file: string; source: string }> = {
  pinball: { file: `${out}/pinball-source.jpg`, source: "owner-supplied:9346.jpg" },
};
const read = async (url: string) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Logo source answered ${response.status}: ${url}`);
  return response;
};
const index = await (await read(`${base}index.json`)).json() as { logos: { brand_name: string; path: string }[] };
await mkdir(out, { recursive: true });
const logos: Record<string, { name: string; source: string; sha256: string }> = {};
for (const brand of FILAMENT_BRANDS) {
  const key = filamentBrandKey(brand.name);
  const supplied = suppliedLogos[key];
  const keys = [brand.name, ...brand.aliases].map(filamentBrandKey);
  const entry = keys.map(key => index.logos.find(logo => filamentBrandKey(logo.brand_name) === key)).find(Boolean);
  if (!supplied && !entry) { console.info(`${brand.name}: no source logo; using initials until uploaded.`); continue; }
  const info = supplied ? null : await (await read(base + encodeURIComponent(entry!.path))).json() as { logo_file: string };
  const source = supplied?.source ?? base + encodeURIComponent(info!.logo_file);
  const bytes = supplied ? await readFile(supplied.file) : Buffer.from(await (await read(source)).arrayBuffer());
  const image = await sharp(bytes, { limitInputPixels: 16_000_000 }).trim({ threshold: supplied ? 40 : 10 }).resize(256, 128, { fit: "inside" }).webp({ quality: 90 }).toBuffer();
  await writeFile(`${out}/${key}.webp`, image);
  logos[key] = { name: brand.name, source, sha256: createHash("sha256").update(image).digest("hex") };
  console.info(`${brand.name}: ${image.length} bytes`);
}
await writeFile(`${out}/sources.json`, JSON.stringify({ source: base, retrieved: new Date().toISOString().slice(0, 10), logos }, null, 2) + "\n");
await writeFile(`${out}/LICENSE`, await (await read("https://raw.githubusercontent.com/OpenFilamentCollective/open-filament-database/main/LICENSE")).text());
