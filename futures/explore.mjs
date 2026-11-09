import { readFileSync } from "node:fs"; import { stripTypeScriptTypes } from "node:module"; import { getQuickJS } from "quickjs-emscripten";
const src = stripTypeScriptTypes(readFileSync(new URL("future.ts", import.meta.url), "utf8")).replace(/^export\s+/gm, "");
const run = new Function(src + "; return run;")();
const n = Number(process.argv[2] ?? 400), cnt = {}, hist = new Array(8).fill(0); let t0 = performance.now(); const first = [];
for (let s = 1; s <= n; s++) { const o = run(String(s)), d = o.charCodeAt(1) - 32 + 90 * (o.charCodeAt(2) - 32); cnt[o[0]] = (cnt[o[0]] ?? 0) + 1; hist[Math.min(7, Math.floor(d / 45))]++; if (s <= 20) first.push(o[0] + d); }
console.log(cnt, "days histogram /45:", hist.join(" "), "native ms", ((performance.now() - t0) / n).toFixed(2)); console.log(first.join(" "));
const q = (await getQuickJS()).newContext(); q.unwrapResult(q.evalCode(src)).dispose();
t0 = performance.now(); for (let s = 1; s <= 3; s++) q.unwrapResult(q.evalCode(`run("${s}").length`)).dispose(); console.log("quickjs ms/future", ((performance.now() - t0) / 3).toFixed(0));
