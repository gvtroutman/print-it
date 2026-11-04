// Browser checks with local fixtures: no account, live database or role changes.
import assert from "node:assert/strict";
import { access, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:http";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";
import { registerHooks } from "node:module";

// Exercise the actual server action with an isolated account and cookie layer.
const viewState = { user: { role: "admin" }, effects: [] };
globalThis.memberViewFixture = viewState;
const mocks = {
  "next/navigation": 'export const notFound=()=>{throw Error("Not found")};export const redirect=path=>{throw Error("Redirect "+path)}',
  "next/cache": "export const revalidatePath=()=>{}",
  "@/lib/authz": 'export const requireUser=async()=>{const user=globalThis.memberViewFixture.user;if(!user)throw Error("Sign in");return user};export const startPreview=async()=>globalThis.memberViewFixture.effects.push("member");export const endPreview=async()=>globalThis.memberViewFixture.effects.push("admin")',
  "@/lib/db": "export const db={}",
  "@/lib/audit": "export const record=async()=>{}",
};
const hooks = registerHooks({ resolve(specifier, context, next) {
  return Object.hasOwn(mocks, specifier)
    ? { url: "data:text/javascript," + encodeURIComponent(mocks[specifier]), shortCircuit: true }
    : next(specifier, context);
} });
const { selectMemberViewAction } = await import("../src/app/actions/preview.ts");
hooks.deregister();
for (const user of [{ role: "admin" }, { role: "client", previewing: true }]) {
  viewState.user = user;
  for (const view of ["member", "admin"]) {
    const form = new FormData(); form.set("view", view);
    viewState.effects.length = 0;
    await assert.rejects(selectMemberViewAction(form), /Redirect \/member$/);
    assert.deepEqual(viewState.effects, [view]);
  }
}
for (const [user, value, error] of [
  [{ role: "client" }, "admin", /Not found/],
  [{ role: "client" }, "member", /Not found/],
  [{ role: "admin" }, "invalid", /Not found/],
  [{ role: "admin" }, null, /Not found/],
  [null, "admin", /Sign in/],
]) {
  viewState.user = user; viewState.effects.length = 0;
  const form = new FormData(); if (value !== null) form.set("view", value);
  await assert.rejects(selectMemberViewAction(form), error);
  assert.deepEqual(viewState.effects, [], "Rejected requests must not change the view");
}
console.log("View action: owner and preview can select both cards, both stay on /member, member and malformed requests rejected");

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "shots/view-switch-regression");
await mkdir(out, { recursive: true });
const result = await build({
  absWorkingDir: root, tsconfig: path.join(root, "tsconfig.json"),
  stdin: { resolveDir: root, loader: "tsx", contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {UploadForm} from './src/app/upload/upload-form';
    import {MemberCardEditor} from './src/components/member-card-editor';
    const owner={name:'Admin',initials:'AD',email:null,role:'admin',flair:'first-print'};
    const member={name:'Member',initials:"ME",email:null,role:'client',previewing:true,flair:'three-prints'};
    const catalog=[{id:'pla',name:'PLA',description:'',ratings:null,colors:[
      {id:'blue',name:'Library Blue',hex:'#123456',style:'#123456',mode:'solid'}]}];
    const filament={id:'admin:7',name:'Clear Blue',hex:'#112233',maker:'Fixture',type:'PLA',
      product:'PLA',family:'PLA',source:'admin',translucent:true,pageUrl:'https://example.test/sample'};
    const app=createRoot(document.getElementById('root'));
    window.show=kind=>app.render(<>
      <MemberCardEditor {...(kind==='member'?member:kind==='regular'?{...member,previewing:false}:owner)}
        earnedBadgeKeys={['first-print','three-prints']} alternateCard={kind==='regular'?undefined:kind==='member'?owner:member}/>
      <UploadForm key={kind} owner='Owner' catalog={catalog} storeAccess filamentConfig={{brands:[],listings:[]}}
        again={kind==='repeat'?{id:1,ref:'P001',filename:null,fileSize:null,title:'Repeat',material:'Auto',
          colorName:filament.name,colorHex:filament.hex,swatch:null,filament,quantity:1,note:''}:undefined}/>
    </>);
    window.show('new');
  ` },
  bundle: true, splitting: true, format: "esm", platform: "browser", jsx: "automatic",
  outdir: out, entryNames: "entry", chunkNames: "[name]-[hash]", metafile: true,
  loader: { ".png": "dataurl", ".svg": "dataurl" },
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "local-services", setup(b) {
    b.onResolve({ filter: /^next\/(link|navigation)$|^@\/app\/actions\/preview$|^@\/app\/member\/card-flair-action$/ }, args => ({ path: args.path, namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "tsx", resolveDir: root, contents:
      args.path.endsWith('/preview')
        ? 'export const selectMemberViewAction=async form=>{window.actionCount=(window.actionCount??0)+1;window.selectedView=form.get("view");await new Promise(resolve=>window.finishAction=resolve)}'
        : args.path.endsWith('/card-flair-action') ? 'export const setCardFlairAction=async form=>({ok:true,flair:form.get("flair")||null})'
        : args.path === "next/link" ? 'export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}'
        : 'export function useRouter(){return {push(){},refresh(){}}}' }));
  } }],
});
// Follow static imports exactly as a browser does. The large palette must
// only be reachable through the Color step's dynamic import.
const outputs = result.metafile.outputs;
const initial = new Set();
function visit(file) {
  if (initial.has(file)) return;
  initial.add(file);
  for (const imported of outputs[file].imports) if (imported.kind !== "dynamic-import") visit(imported.path);
}
visit(Object.keys(outputs).find(file => file.endsWith("/entry.js")));
for (const file of initial) assert.ok(!Object.keys(outputs[file].inputs).some(input => input.endsWith("filament-palette.json")), "Initial navigation must not load the filament dataset");
const paletteFiles = Object.entries(outputs).filter(([, output]) => Object.keys(output.inputs).some(input => input.endsWith("filament-palette.json"))).map(([file]) => path.basename(file));
assert.ok(paletteFiles.length > 0, "The lazy picker must still include the source palette");
const submissions = [], requests = [], errors = [];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "POST") {
    const chunks=[]; for await (const chunk of req) chunks.push(chunk);
    submissions.push(JSON.parse(Buffer.concat(chunks).toString()));
    res.setHeader("content-type", "application/json"); res.end('{"story":{"id":2}}'); return;
  }
  if (url.pathname === "/") {
    res.setHeader("content-type", "text/html");
    res.end('<!doctype html><html><link rel="stylesheet" href="/entry.css"><style>.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}</style><div id="root"></div><script type="module" src="/entry.js"></script></html>'); return;
  }
  const name = path.basename(url.pathname);
  if (name === "entry.css") {
    res.setHeader("content-type", "text/css"); res.end(await readFile(path.join(out, name))); return;
  }
  if (name.endsWith(".js")) {
    requests.push(name);
    if (paletteFiles.includes(name)) await new Promise(resolve => setTimeout(resolve, 600));
    res.setHeader("content-type", "text/javascript"); res.end(await readFile(path.join(out, name))); return;
  }
  res.setHeader("content-type", "image/svg+xml"); res.end('<svg xmlns="http://www.w3.org/2000/svg"/>');
});
const candidates = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean);
let executablePath;
for (const candidate of candidates) { try { await access(candidate); executablePath=candidate; break; } catch {} }
assert.ok(executablePath, "Set CHROME_PATH to a Chrome/Chromium executable");
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser=await puppeteer.launch({ executablePath, headless: true });
  const page=await browser.newPage(); page.on("pageerror", error=>errors.push(error.message));
  const base=`http://127.0.0.1:${server.address().port}`;
  for (const width of [320,390,1280]) {
    requests.length=0;
    await page.setViewport({width,height:1000});
    await page.goto(base,{waitUntil:"networkidle0"});
    assert.equal(requests.some(file=>paletteFiles.includes(file)),false,"Opening New Order must not fetch the palette");
    assert.ok(await page.$('[aria-label="Admin view selected"][disabled][aria-pressed="true"]'));
    const stack = await page.$eval('form[aria-label="Choose your view"]', form => {
      const front = form.querySelector('[data-active="true"] > [data-tone]');
      const back = form.querySelector('[data-active="false"] > [data-tone]');
      const rect = front.getBoundingClientRect(), faded = back.getBoundingClientRect();
      return { center: rect.x + rect.width / 2, viewport: innerWidth, opacity: getComputedStyle(back).opacity, y: rect.y, backY: faded.y };
    });
    assert.ok(Math.abs(stack.center - stack.viewport / 2) < 1, "Active card must be centered");
    assert.equal(stack.opacity, "0.24", "The other card must be faded");
    assert.ok(stack.backY < stack.y, "The other card must remain selectable above the active card");
    const peek = await page.$eval('[aria-label="Switch to Member view"]', button => {
      const rect = button.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + 20 };
    });
    await page.mouse.click(peek.x, peek.y);
    await page.waitForSelector('[aria-label="Switch to Member view"][disabled][aria-busy="true"]');
    assert.match(await page.$eval('form[aria-label="Choose your view"] [role="status"]',el=>el.textContent),/Switching to Member/);
    assert.equal(await page.evaluate(()=>window.selectedView),'member');
    assert.equal(await page.evaluate(()=>window.actionCount),1,"Only one switch action may run");
    await page.waitForFunction(()=>{
      const form=document.querySelector('form[aria-label="Choose your view"]');
      return form.querySelector('[data-active="true"] > [data-tone]').dataset.tone==='preview'
        && getComputedStyle(form.querySelector('[data-active="false"] > [data-tone]')).opacity==='0.24';
    });
    await page.evaluate(()=>window.finishAction());
    await page.waitForSelector('[aria-label="Switch to Member view"]:not([disabled])');
    await page.evaluate(()=>window.show('member'));
    assert.ok(await page.$('[aria-label="Member view selected"][disabled][aria-pressed="true"]'));
    await page.focus('[aria-label="Switch to Admin view"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[aria-label="Switch to Admin view"][disabled][aria-busy="true"]');
    assert.equal(await page.evaluate(()=>window.selectedView),'admin');
    assert.equal(await page.evaluate(()=>window.actionCount),2,"Keyboard selection must submit once");
    await page.evaluate(()=>window.finishAction());
    await page.waitForSelector('[aria-label="Switch to Admin view"]:not([disabled])');
    await page.click('[aria-labelledby="step-3-heading"] [data-step-open]');
    await page.waitForFunction(()=>document.body.textContent.includes('Loading colors…'));
    await page.waitForSelector('[aria-label="Library Blue"]');
    assert.equal(requests.some(file=>paletteFiles.includes(file)),true,"Opening Color loads the palette on demand");
    await page.click('[aria-label="Library Blue"]');
    await page.click('[aria-labelledby="step-3-heading"] [data-step-heading]');
    assert.ok(await page.$('[aria-labelledby="step-3-heading"] [data-step-open]'));
    await page.evaluate(()=>window.show('repeat'));
    await page.waitForSelector('[aria-label="Print It! again"]');
    const count=submissions.length;
    const posted=page.waitForResponse(response=>response.request().method()==="POST");
    await page.click('[aria-label="Print It! again"]');
    await posted;
    assert.equal(submissions.length,count+1);
    assert.equal(submissions.at(-1).filamentColorId,'admin:7',"Repeat preserves the supplied filament without opening Color");
    assert.equal(submissions.at(-1).colorName,'Clear Blue (Translucent)');
    assert.equal(submissions.at(-1).colorHex,'#112233');
    await page.evaluate(()=>window.show('regular'));
    await page.waitForFunction(()=>!document.querySelector('form[aria-label="Choose your view"]'));
    assert.equal(await page.$$eval('[data-tone]',cards=>cards.length),1,"An ordinary member only sees their own card");
    console.log(width+'px: click/keyboard card selection, pending feedback, member-only card, lazy Color loading and repeat identity passed');
  }
  assert.deepEqual(errors,[]);
} finally {
  await browser?.close(); await new Promise(resolve=>server.close(resolve));
}
