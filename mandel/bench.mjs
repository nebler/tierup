// Real run: render a 1000x1000 Mandelbrot zoom with agent-style code (mandel.ts), progressively (like an interlaced image).
// Starts in QuickJS; scriptc compiles the same file to wasm in the background; after a parity check on one row, swaps tiers.
// At the end every row is re-rendered in QuickJS and compared.
//   node --no-warnings mandel/bench.mjs [size] → mandel/run.json {size, compileSecs, swapRow, total, identicalRows, rows:[{y,h,t,tier}], pixels}
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { homedir } from "node:os";
import { getQuickJS } from "quickjs-emscripten";
import { loadReactor } from "../spike/wasi.mjs";
const HERE = new URL(".", import.meta.url).pathname, W = HERE + "work/";
mkdirSync(W, { recursive: true });
const N = Number(process.argv[2] ?? 1000);
const src = readFileSync(HERE + "mandel.ts", "utf8");
writeFileSync(W + "agent.ts", src);
writeFileSync(W + "agent.profile.json", JSON.stringify({ profile_format: 1, name: "agent", entry: "agent.ts", emission: "llvm",
  abi: { prefix: "ag_", init_symbol: "ag_init", sink_register_symbol: "ag_sink" },
  exports: [{ export: "run", symbol: "ag_run", params: ["string"], returns: "string" }] }));
const T0 = performance.now(), now = () => (performance.now() - T0) / 1000;
let compiled = null, compileSecs = null;
const env = { ...process.env, SCRIPTC_TARGET: "wasm32-wasi", SCRIPTC_RUNTIME_PACK: homedir() + "/code/policy-spike/wasm/node_modules/@scriptc/runtime-wasm32-wasi" };
const p = spawn(HERE + "../node_modules/.bin/scriptc", ["build", "--lib", "--profile", "agent.profile.json", "-o", "agent.wasm"], { cwd: W, env });
let err = ""; p.stdout.on("data", (d) => (err += d)); p.stderr.on("data", (d) => (err += d));
p.on("close", async (code) => {
  compileSecs = now();
  if (code !== 0 || !existsSync(W + "agent.wasm")) { console.error("compile failed\n" + err); return; }
  compiled = await loadReactor(W + "agent.wasm", "ag_", "run");
});
const qjs = (await getQuickJS()).newContext();
qjs.unwrapResult(qjs.evalCode(stripTypeScriptTypes(src).replace(/^export\s+/gm, ""))).dispose();
const fn = qjs.unwrapResult(qjs.evalCode("run"));
const interp = (s) => { const a = qjs.newString(s); const r = qjs.unwrapResult(qjs.callFunction(fn, qjs.undefined, a)); a.dispose(); const o = qjs.getString(r); r.dispose(); return o; };
// progressive order: every 16th row first, then 8th, 4th, 2nd, then the rest. h = block height to draw it with.
const order = []; const passes = [[16, 0, 16], [16, 8, 8], [8, 4, 4], [4, 2, 2], [2, 1, 1]];
for (const [step, off, h] of passes) for (let y = off; y < N; y += step) order.push([y, h]);
const rows = [], pixels = new Array(N); let tier = "quickjs", swapRow = null;
for (let k = 0; k < N; k++) {
  const [y, h] = order[k];
  const input = `${y},${N},${N}`; let out;
  if (compiled && tier === "quickjs") {
    const a = interp(input), b = compiled(input);
    if (a !== b) { console.error("MISMATCH at row", y); process.exit(1); }
    tier = "wasm"; swapRow = k; out = b;
  } else out = tier === "wasm" ? compiled(input) : interp(input);
  pixels[y] = out; rows.push({ y, h, t: +now().toFixed(4), tier });
  if (k % 50 === 0) await new Promise((r) => setImmediate(r));   // let the compiler's events through
}
let same = 0; for (let y = 0; y < N; y++) if (interp(`${y},${N},${N}`) === pixels[y]) same++;
const total = rows[N - 1].t, swapT = rows[swapRow]?.t;
writeFileSync(HERE + "run.json", JSON.stringify({ size: N, compileSecs, swapRow, total, identicalRows: same, rows, pixels }));
console.log({ size: N, compileSecs, swapRow, swapT, total, identicalRows: same,
  quickjsRowsPerSec: +(swapRow / swapT).toFixed(1), wasmRowsPerSec: +((N - swapRow) / (total - swapT)).toFixed(1) });
