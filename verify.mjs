// Every batch, both tiers: the compiled wasm must return exactly what QuickJS returns.
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { getQuickJS } from "quickjs-emscripten";
import { loadReactor } from "./spike/wasi.mjs";
import { makeBatch } from "./data.mjs";
const N = Number(process.argv[2] ?? 240), ROWS = Number(process.argv[3] ?? 400);
const src = readFileSync(new URL("work/agent.ts", import.meta.url), "utf8");
const vm = (await getQuickJS()).newContext();
vm.unwrapResult(vm.evalCode(stripTypeScriptTypes(src).replace(/^export\s+/gm, ""))).dispose();
const fn = vm.unwrapResult(vm.evalCode("run"));
const wasm = await loadReactor(new URL("work/agent.wasm", import.meta.url).pathname, "ag_", "run");
let same = 0;
for (let b = 0; b < N; b++) {
  const input = makeBatch(b, ROWS), s = vm.newString(input), r = vm.unwrapResult(vm.callFunction(fn, vm.undefined, s));
  const q = vm.getString(r); s.dispose(); r.dispose();
  if (q === wasm(input)) same++; else console.log("DIFF batch", b, q, wasm(input));
}
console.log(`${same}/${N} batches identical between QuickJS and compiled wasm`);
process.exit(same === N ? 0 : 1);
