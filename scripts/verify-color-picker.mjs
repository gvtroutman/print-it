// Original picker and request form, local fixture services, no live database.
import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:http";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import puppeteer from "puppeteer-core";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "shots/color-picker-regression");
await mkdir(out, { recursive: true });
await build({
  absWorkingDir: root, tsconfig: path.join(root, "tsconfig.json"),
  stdin: { resolveDir: root, loader: "tsx", contents: `
    import React, {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {ColorMenu, OtherColors} from './src/app/upload/spool-finder';
    import {UploadForm} from './src/app/upload/upload-form';
    import {SOURCE_FILAMENT_COLORS} from './src/lib/filament-settings-data';
    import {filamentColorType} from './src/lib/filament-color-types';
    const source = SOURCE_FILAMENT_COLORS.find(c => c.id.startsWith('fcx:') && c.family === 'PLA' && !c.translucent && filamentColorType(c) === 'Solid');
    const config = {brands:[{id:'fixture', name:'Fixture', aliases:[]}], listings:[
      {name:'Red', hex:'#ff0000', type:'PLA'},
      {name:'Pale Red', hex:'#f0c0c0', type:'PLA'},
      {name:'Dark Red', hex:'#400000', type:'PLA'},
      {name:'Near Red', hex:'#ff002b', type:'PLA'},
      {name:'Green', hex:'#00ff00', type:'PLA'},
      {name:'Blue', hex:'#0000ff', type:'PLA'},
      {name:'White', hex:'#ffffff', type:'PLA'},
      {name:'Black', hex:'#000000', type:'PLA'},
      {name:'Scented Red', hex:'#ee0000', type:'Silk PLA', product:'Rose scented Silk PLA'},
      {name:'Glow Green', hex:'#22ff22', type:'PLA', product:'Glow-in-the-dark PLA'},
    ].map((color,id) => ({...color, id, product:color.product??color.type, sourceId:source.id, brandId:'fixture', amazonUrl:'https://www.amazon.com/dp/B012345678', active:true}))};
    const shelf = [
      {id:'solid-red', name:'Solid Red', hex:'#ff0000', style:'#ff0000', mode:'solid'},
      {id:'gradient-red', name:'Gradient Red', hex:'#ff0000', style:'linear-gradient(red,blue)', mode:'gradient'},
      {id:'blue', name:'Blue', hex:'#0000ff', style:'#0000ff', mode:'solid'},
    ];
    function Menu() {
      const [hex,setHex]=useState(null), [alpha,setAlpha]=useState(1), [filament,setFilament]=useState(null), [chosenShelf,setShelf]=useState(null);
      return <main style={{maxWidth:640,margin:'auto',padding:16}}>
        <ColorMenu colors={shelf} filamentConfig={config} value={hex} alpha={alpha} material='PLA' storeAccess
          selectedFilament={filament} selectedShelf={chosenShelf}
          onChange={(h,a,f,s)=>{window.lastChoice={hex:h,alpha:a,filament:f,shelf:s};setHex(h);setAlpha(a);setFilament(f??null);setShelf(s??null)}}/>
        <output id='chosen'>{filament?.name??chosenShelf?.name??'Any color'}</output>
      </main>;
    }
    const app=createRoot(document.getElementById('root'));
    window.showFixture = kind => {
      window.lastChoice=null;
      const again={id:1,ref:'P001',filename:null,fileSize:null,title:'Color identity regression',material:kind==='auto'?'Auto':'PLA',colorName:'Gradient Red',colorHex:'#ff0000',swatch:null,quantity:1,note:''};
      app.render(kind==='menu' ? <Menu key={kind}/> : kind==='remote' ? <main style={{padding:16}}><OtherColors key={kind} filamentConfig={config} material='PLA' owner='Test owner' picked={null} onPick={()=>{}} near={null} onNear={()=>{}} clear={false} suggested={true}/></main>
        : <UploadForm key={kind} owner='Test owner' storeAccess filamentConfig={config} again={again} catalog={[{id:'pla',name:'PLA',description:'',ratings:null,colors:shelf}]}/>);
    };
    window.showFixture('menu');
  ` },
  bundle: true, platform: "browser", jsx: "automatic", outfile: path.join(out, "bundle.js"),
  loader: { ".png": "dataurl" }, define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "fixture-navigation", setup(b) {
    b.onResolve({ filter: /^next\/(link|navigation)$/ }, args => ({ path: args.path, namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "tsx", resolveDir: root, contents: args.path === "next/link"
      ? 'export default function Link({href,children,...props}) {return <a href={href} {...props}>{children}</a>}'
      : 'export function useRouter(){return {push(){},refresh(){}}}' }));
  } }],
});
const cssFile = path.join(root, "src/app/globals.css");
const css = await postcss([tailwind({ base: root })]).process(await readFile(cssFile, "utf8"), { from: cssFile });
await writeFile(path.join(out, "style.css"), css.css);
let failPhotos = false;
const submissions = [], errors = [];
const remote = { id: 999, name: "Remote Blue", maker: "Fixture", type: "PLA", hex: "#0000ff", image: "/api/filament-library/999/image", pageUrl: "https://filamentcolors.xyz/swatch/999/", buyUrl: "https://www.amazon.com/dp/B012345678" };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  res.setHeader("cache-control", "no-store");
  if (req.method === "POST") {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    submissions.push(JSON.parse(Buffer.concat(chunks).toString()));
    res.setHeader("content-type", "application/json"); res.end('{"story":{"id":2}}'); return;
  }
  if (url.pathname === "/") {
    res.setHeader("content-type", "text/html");
    res.end('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>'); return;
  }
  if (["/bundle.js", "/style.css"].includes(url.pathname)) {
    res.setHeader("content-type", url.pathname.endsWith(".js") ? "text/javascript" : "text/css");
    res.end(await readFile(path.join(out, url.pathname.slice(1)))); return;
  }
  if (url.pathname === "/api/amazon-products" || url.pathname === "/api/filament-library") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(url.pathname.endsWith("amazon-products") ? { products: [] } : { total: 1, swatches: [remote] })); return;
  }
  if (failPhotos && /\/image$|\/filament-swatches\//.test(url.pathname)) { res.statusCode = 503; res.end(); return; }
  res.setHeader("content-type", "image/svg+xml");
  res.end('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="128"><rect width="480" height="128" rx="20" fill="#aabbcc"/></svg>');
});
const candidates = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean);
let executablePath;
for (const candidate of candidates) { try { await access(candidate); executablePath = candidate; break; } catch {} }
assert.ok(executablePath, "Set CHROME_PATH to a Chrome/Chromium executable for the browser regression checks");
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await puppeteer.launch({ executablePath, headless: true });
  const page = await browser.newPage(); page.on("pageerror", error => errors.push(error.message));
  const base = `http://127.0.0.1:${server.address().port}`;
  const library = '[aria-label="Color you want"]';
  const checked = () => page.$$eval('[aria-label="Color you want"] [aria-checked="true"]', els => els.map(e => e.getAttribute("aria-label")));
  const visible = () => page.$$eval("[data-filament-color]", els => els.map(e => e.getAttribute("aria-label").split(" by ")[0]));
  const retry = async () => { await page.$$eval("button", els => els.find(e => e.textContent === "Retry photos").click()); };
  const settle = () => page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
  async function show(kind) { await page.evaluate(kind => window.showFixture(kind), kind); }
  async function store() { await page.click('button[aria-label="Store"]'); await page.waitForSelector("[data-color-chart]", { visible: true }); }
  for (const width of [320, 393, 1280]) {
    await page.setViewport({ width, height: 1000, hasTouch: width < 400 }); await page.goto(base, { waitUntil: "networkidle0" });
    await page.click(`${library} [aria-label="Gradient Red"]`);
    assert.deepEqual(await checked(), ["Gradient Red"]);
    assert.equal(await page.evaluate(() => window.lastChoice.shelf.id), "gradient-red");
    await page.keyboard.press("ArrowLeft"); assert.deepEqual(await checked(), ["Solid Red"]);
    await page.keyboard.press("ArrowRight"); assert.deepEqual(await checked(), ["Gradient Red"]);
    await store(); await page.click('button[aria-label="Library"]'); assert.deepEqual(await checked(), ["Gradient Red"]);
    await settle(); await page.screenshot({ path: path.join(out, `library-${width}.png`), fullPage: true });

    for (const material of ["specific", "auto"]) {
      await show(material); await page.waitForSelector('[aria-labelledby="step-3-heading"] [data-step-open]');
      await page.click('[aria-labelledby="step-3-heading"] [data-step-open]');
      await page.waitForSelector(`${library} [aria-checked="true"]`, { visible: true });
      assert.deepEqual(await checked(), ["Gradient Red"], "Repeat orders reopen the saved finish");
      await page.click(`${library} [aria-label="Solid Red"]`); await page.click(`${library} [aria-label="Gradient Red"]`);
      const count = submissions.length; await page.click('button[type="submit"]');
      const deadline = Date.now() + 5000;
      while (submissions.length === count && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal(submissions.length, count + 1, "The fixture request must be submitted");
      assert.equal(submissions.at(-1).colorName, "Gradient Red", "Request submission preserves the clicked shelf name");
      assert.equal(submissions.at(-1).swatchId, null);
      if (material === "auto") assert.equal(submissions.at(-1).colorHex, "#ff0000");
    }
    // A failed finish preview must neither exclude its color nor change a choice.
    failPhotos = true; await page.goto(base, { waitUntil: "networkidle0" }); await store();
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some(e => e.textContent === "Retry photos"));
    assert.ok((await visible()).includes("Blue"));
    await page.$eval('[data-filament-color="admin:5"]', e => e.scrollIntoView({ block: "center" }));
    await page.click('[data-filament-color="admin:5"]');
    await page.waitForSelector('[data-filament-selection] [data-filament-photo="unavailable"]');
    await settle(); await page.screenshot({ path: path.join(out, `retry-${width}.png`), fullPage: true });
    const ids = await visible(); failPhotos = false; await retry();
    await page.waitForSelector('[data-filament-selection] [data-filament-photo="sample"]');
    assert.deepEqual(await visible(), ids, "Photo failure and retry preserve catalog results");
    assert.equal(await page.$eval("#chosen", e => e.textContent), "Blue");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await settle(); await page.screenshot({ path: path.join(out, `recovered-${width}.png`), fullPage: true });
    console.log(`${width}px: same-hex mouse/keyboard selection, repeat identity, Auto/specific submissions and photo recovery passed`);
  }
  failPhotos = true; await show("remote");
  await page.waitForSelector('[aria-label="Spools to buy"] [data-filament-photo="unavailable"]');
  assert.equal(await page.$$eval('[aria-label="Spools to buy"] [role="radio"]', els => els.length), 1);
  failPhotos = false; await retry();
  await page.waitForSelector('[aria-label="Spools to buy"] [data-filament-photo="sample"]');
  assert.deepEqual(errors, []);
  console.log("Remote Store search also preserves failed-photo choices and recovers without reopening.");
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
