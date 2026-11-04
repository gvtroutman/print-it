import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";

// Render the real admin printer cards with isolated print history. No cloud or database calls.
type Print = { id: string; printerId: string; title: string; outcome: string; startedAt: Date; seconds: number };
let prints: Print[] = [];
let synced = false;
const printerIds = ["fixture-one", "fixture-two"];
Reflect.set(globalThis, "React", React);
Reflect.set(globalThis, "printScoreSync", () => { synced = true; });
Reflect.set(globalThis, "prisma", {
  printer: {
    findMany: async ({ include }: { include: { prints: { take: number } } }) => printerIds.map(id => ({
      id, name: id, readings: [], prints: prints.filter(print => print.printerId === id).slice(0, include.prints.take),
    })),
  },
  printerPrint: {
    count: async () => prints.filter(print => print.outcome === "printing").length,
    groupBy: async (query: { by: string[]; _sum: unknown; _count: unknown }) => {
      assert.ok(synced, "Outcome totals must be read after the page's due sync");
      assert.deepEqual(query, { by: ["printerId", "outcome"], _sum: { seconds: true }, _count: { _all: true } });
      const groups = new Map<string, { printerId: string; outcome: string; _sum: { seconds: number }; _count: { _all: number } }>();
      for (const print of prints) {
        const key = JSON.stringify([print.printerId, print.outcome]);
        const group = groups.get(key) ?? { printerId: print.printerId, outcome: print.outcome, _sum: { seconds: 0 }, _count: { _all: 0 } };
        group._sum.seconds += print.seconds;
        group._count._all++;
        groups.set(key, group);
      }
      return [...groups.values()];
    },
  },
});
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true };
    if (specifier === "next/headers") return { url: "data:text/javascript,export const cookies=async()=>({get:()=>undefined})", shortCircuit: true };
    const resolved = nextResolve(specifier, context);
    const pathname = new URL(resolved.url).pathname;
    if (pathname.endsWith("/src/lib/bambu.ts")) return { ...resolved, url: "data:text/javascript,export const bambuLink=async()=>null;export const syncIfStale=async()=>globalThis.printScoreSync()" };
    if (pathname.endsWith("/src/app/member/actions.ts")) return { ...resolved, url: "data:text/javascript,export const bambuCancelAction=async()=>{};export const bambuConnectAction=bambuCancelAction,bambuSendCodeAction=bambuCancelAction,bambuSyncAction=bambuCancelAction,logHoursAction=bambuCancelAction,removeReadingAction=bambuCancelAction" };
    if (pathname.endsWith(".png")) return { ...resolved, url: 'data:text/javascript,export default {src:"/print-it-star.png",width:64,height:64}' };
    if (pathname.endsWith("/src/app/queue/printer-hours-refresh.tsx")) return { ...resolved, url: "data:text/javascript,export const PrinterHoursRefresh=()=>null" };
    return resolved;
  },
});
const { PrinterHours } = await import("../src/app/member/printer-hours");
const add = (printerId: string, outcome: string, count: number) => {
  for (let index = 0; index < count; index++) prints.push({
    id: String(prints.length), printerId, title: "Fixture print", outcome,
    startedAt: new Date("2026-10-15T12:00:00Z"), seconds: outcome === "printing" ? 0 : 3600,
  });
};
const render = async () => {
  synced = false;
  return load(renderToStaticMarkup(await PrinterHours()));
};
const check = ($: ReturnType<typeof load>, expected: string[]) => {
  const score = $('section[aria-label="Print score"]');
  assert.equal(score.length, 1);
  const values = score.find("dd").map((_, element) => $(element).text().trim()).get();
  assert.deepEqual(values, expected);
  assert.match(score.text(), /across all printers/);
  assert.match(score.text(), /Failed counts include cancellations/);
  assert.equal($("article").find('section[aria-label="Print score"]').length, 0, "The overall score is separate from individual printer cards");
};

let $ = await render();
check($, ["—No finished prints yet", "0", "0 / 0"]);
assert.doesNotMatch($.text(), /NaN|Infinity/);

add(printerIds[0], "printing", 3);
add(printerIds[0], "status 4", 1);
add(printerIds[0], "status 99", 1);
$ = await render();
check($, ["—No finished prints yet", "0", "0 / 0"]);

// The 200 failures are older than the displayed 300-print history limit.
prints = [];
add(printerIds[0], "finished", 300);
add(printerIds[0], "failed", 200);
add(printerIds[0], "printing", 10);
add(printerIds[0], "status 99", 5);
add(printerIds[1], "finished", 1);
add(printerIds[1], "failed", 3);
$ = await render();
check($, ["59.7%success rate", "301", "203 / 504", "40.3% of finished prints"]);
assert.match($('section[aria-label="Print score"]').text(), /40.3% of finished prints/);
assert.equal($("article").eq(0).find('[aria-label="505.0 hours"]').length, 1, "All outcome groups still contribute their runtime to the meter");

prints = [];
add(printerIds[0], "failed", 2);
$ = await render();
check($, ["0.0%success rate", "0", "2 / 2", "100.0% of finished prints"]);
assert.match($('section[aria-label="Print score"]').text(), /100.0% of finished prints/);

prints = [];
add(printerIds[1], "finished", 2);
$ = await render();
check($, ["100.0%success rate", "2", "0 / 2", "0.0% of finished prints"]);

prints = [];
add(printerIds[0], "finished", 2);
add(printerIds[0], "failed", 1);
$ = await render();
check($, ["66.7%success rate", "2", "1 / 3", "33.3% of finished prints"]);

console.info("Print score checks passed: full synced history, one overall score across multiple printers, active/unknown exclusions, empty history, all failures, all successes, rounding and unchanged hour totals.");
