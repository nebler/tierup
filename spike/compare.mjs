// Same script, three tiers: QuickJS (what code-mode sandboxes use), scriptc wasm, and Node/V8 for reference.
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { getQuickJS } from "quickjs-emscripten";
import { loadReactor } from "./wasi.mjs";
import { run as v8run } from "./workload.ts";

// Deterministic data: invoices and bank lines with typos and small amount drift.
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const names = ["Acme Supplies Inc", "Northwind Traders", "Globex Corporation", "Initech LLC", "Umbrella Logistics", "Stark Industrial Co", "Wayne Enterprises", "Hooli Cloud Ltd", "Vandelay Imports", "Soylent Foods GmbH"];
function typo(s) { const i = Math.floor(rnd() * s.length); return rnd() < 0.5 ? s.slice(0, i) + s.slice(i + 1) : s.slice(0, i) + "x" + s.slice(i); }
function batch(n) {
  const invoices = [], bank = [];
  for (let i = 0; i < n; i++) {
    const vendor = names[Math.floor(rnd() * names.length)] + " " + Math.floor(rnd() * 40);
    const amount = Math.round(rnd() * 900000) / 100 + 10;
    invoices.push({ id: "INV-" + i, vendor, amount });
    const r = rnd();
    if (r < 0.6) bank.push({ ref: "B" + i, payee: vendor, amount });
    else if (r < 0.9) bank.push({ ref: "B" + i, payee: typo(vendor.toUpperCase()), amount: Math.round(amount * (1 + (rnd() - 0.5) * 0.01) * 100) / 100 });
    else bank.push({ ref: "B" + i, payee: "Unknown Payee " + i, amount: Math.round(rnd() * 5000) / 100 });
  }
  return JSON.stringify({ invoices, bank });
}

const N = Number(process.argv[2] ?? 400), CALLS = Number(process.argv[3] ?? 5);
const input = batch(N);

function time(label, f) {
  const out = f(); // warm
  const t = performance.now();
  for (let i = 0; i < CALLS; i++) f();
  const ms = (performance.now() - t) / CALLS;
  console.log(`${label.padEnd(26)} ${ms.toFixed(1).padStart(9)} ms/call   ${out}`);
  return { ms, out };
}

const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();
const js = stripTypeScriptTypes(readFileSync(new URL("workload.ts", import.meta.url), "utf8")).replace(/^export /gm, "");
vm.unwrapResult(vm.evalCode(js)).dispose();
const qfn = vm.unwrapResult(vm.evalCode("run"));
const qjs = () => { const s = vm.newString(input); const r = vm.unwrapResult(vm.callFunction(qfn, vm.undefined, s)); s.dispose(); const v = vm.getString(r); r.dispose(); return v; };

const t0 = performance.now();
const wasm = await loadReactor(new URL("workload.wasm", import.meta.url).pathname, "tu_", "run");
console.log(`wasm load+instantiate ${(performance.now() - t0).toFixed(1)} ms; ${N} invoices x ${N} bank lines, ${CALLS} calls each\n`);

const a = time("QuickJS (interpreted)", qjs);
const b = time("scriptc wasm (compiled)", () => wasm(input));
const c = time("Node V8 JIT (reference)", () => v8run(input));
console.log(`\nsame output: ${a.out === b.out && b.out === c.out}   compiled vs QuickJS: ${(a.ms / b.ms).toFixed(1)}x faster`);
