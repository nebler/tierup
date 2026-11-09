// Real run: predict futures one after another (seed 1, 2, 3, …). QuickJS first; after HOT_AFTER seconds scriptc compiles
// future.ts to wasm in the background; when ready, both tiers predict the same future, the answers are compared, and wasm takes over.
// Afterwards every wasm answer is recomputed in the interpreter and compared byte for byte.
//   node --no-warnings futures/bench.mjs [seconds] [hotAfter] [noverify] → futures/run.json
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { homedir } from "node:os";
import { getQuickJS } from "quickjs-emscripten";
import { loadReactor } from "../spike/wasi.mjs";
const HERE = new URL(".", import.meta.url).pathname, W = HERE + "work/";
mkdirSync(W, { recursive: true });
const SECS = Number(process.argv[2] ?? 15.2), HOT_AFTER = Number(process.argv[3] ?? 3.6), VERIFY = process.argv[4] !== "noverify";
const src = readFileSync(HERE + "future.ts", "utf8");
writeFileSync(W + "agent.ts", src);
writeFileSync(W + "agent.profile.json", JSON.stringify({ profile_format: 1, name: "agent", entry: "agent.ts", emission: "llvm",
  abi: { prefix: "ag_", init_symbol: "ag_init", sink_register_symbol: "ag_sink" },
  exports: [{ export: "run", symbol: "ag_run", params: ["string"], returns: "string" }] }));
rmSync(W + "agent.wasm", { force: true });
const qjs = (await getQuickJS()).newContext();
qjs.unwrapResult(qjs.evalCode(stripTypeScriptTypes(src).replace(/^export\s+/gm, ""))).dispose();
const fn = qjs.unwrapResult(qjs.evalCode("run"));
const interp = (s) => { const a = qjs.newString(s); const r = qjs.unwrapResult(qjs.callFunction(fn, qjs.undefined, a)); a.dispose(); const o = qjs.getString(r); r.dispose(); return o; };
const T0 = performance.now(), now = () => (performance.now() - T0) / 1000;
let compiled = null, compileSecs = null, hotAt = null, err = "";
function startCompile() {
  hotAt = now();
  const env = { ...process.env, SCRIPTC_TARGET: "wasm32-wasi", SCRIPTC_RUNTIME_PACK: homedir() + "/code/policy-spike/wasm/node_modules/@scriptc/runtime-wasm32-wasi" };
  const p = spawn(HERE + "../node_modules/.bin/scriptc", ["build", "--lib", "--profile", "agent.profile.json", "-o", "agent.wasm"], { cwd: W, env });
  p.stdout.on("data", (d) => (err += d)); p.stderr.on("data", (d) => (err += d));
  p.on("close", async (code) => { compileSecs = now(); if (code !== 0 || !existsSync(W + "agent.wasm")) { console.error("compile failed\n" + err); process.exit(1); } compiled = await loadReactor(W + "agent.wasm", "ag_", "run"); });
}
const futures = []; let tier = "quickjs", swapAt = null;
while (now() < SECS) {
  if (hotAt === null && now() >= HOT_AFTER) startCompile();
  const seed = futures.length + 1, start = now(); let out;
  if (compiled && tier === "quickjs") {
    const a = interp(String(seed)), b = compiled(String(seed));
    if (a !== b) { console.error("MISMATCH at future", seed); process.exit(1); }
    tier = "wasm"; swapAt = futures.length; out = b;
  } else out = tier === "wasm" ? compiled(String(seed)) : interp(String(seed));
  futures.push({ seed, start: +start.toFixed(4), done: +now().toFixed(4), tier, out });
  await new Promise((r) => setImmediate(r));
}
let identical = 0, checked = 0;
if (VERIFY) for (const f of futures) { if (f.tier !== "wasm") continue; checked++; if (interp(String(f.seed)) === f.out) identical++; else console.error("DIFF future", f.seed); }
// like-for-like speed: the same 24 futures on both tiers
let qt = 0, wt = 0; for (let s = 1; s <= 24; s++) { let t = performance.now(); interp(String(s)); qt += performance.now() - t; t = performance.now(); compiled(String(s)); wt += performance.now() - t; }
const q = futures.filter((f) => f.tier === "quickjs"), w = futures.filter((f) => f.tier === "wasm");
const meta = { secs: SECS, compileStarted: hotAt, compileSecs, swapAt, quickjsFutures: q.length, wasmFutures: w.length, quickjsMs: +(qt / 24).toFixed(1), wasmMs: +(wt / 24).toFixed(2), speedup: +(qt / wt).toFixed(1),
  identical, checked, wasmKB: Math.round(statSync(W + "agent.wasm").size / 1024), futures };
writeFileSync(HERE + "run.json", JSON.stringify(meta)); console.log({ ...meta, futures: undefined });
