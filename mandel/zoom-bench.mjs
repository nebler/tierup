// Real run: a Mandelbrot zoom whose depth follows the wall clock (ZOOM_RATE octaves per second).
// Each frame renders the depth for "now", so a slow tier shows few frames (choppy) and a fast one many (smooth).
// QuickJS first; scriptc compiles zoom.ts to wasm in the background; parity check on one frame, then swap.
//   node --no-warnings mandel/zoom-bench.mjs [size] [seconds] → mandel/zoom/{frames.json, NNNN.bin}
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { homedir } from "node:os";
import { getQuickJS } from "quickjs-emscripten";
import { loadReactor } from "../spike/wasi.mjs";
const HERE = new URL(".", import.meta.url).pathname, W = HERE + "work-zoom/", OUT = HERE + "zoom/";
mkdirSync(W, { recursive: true }); rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT);
const N = Number(process.argv[2] ?? 360), SECS = Number(process.argv[3] ?? 9), ZOOM_RATE = 1.1;
const src = readFileSync(HERE + "zoom.ts", "utf8");
writeFileSync(W + "agent.ts", src);
writeFileSync(W + "agent.profile.json", JSON.stringify({ profile_format: 1, name: "agent", entry: "agent.ts", emission: "llvm",
  abi: { prefix: "ag_", init_symbol: "ag_init", sink_register_symbol: "ag_sink" },
  exports: [{ export: "run", symbol: "ag_run", params: ["string"], returns: "string" }] }));
rmSync(W + "agent.wasm", { force: true });
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
const frames = []; let tier = "quickjs", swapFrame = null, checks = 0, lastWasm = -1;
while (now() < SECS) {
  const start = now(), z = +(start * ZOOM_RATE).toFixed(5), input = `${z},${N}`;
  let out;
  if (compiled && tier === "quickjs") {
    const a = interp(input), b = compiled(input);
    if (a !== b) { console.error("MISMATCH at z", z); process.exit(1); }
    tier = "wasm"; swapFrame = frames.length; out = b; checks++;
  } else out = tier === "wasm" ? compiled(input) : interp(input);
  const done = now();
  // keep every QuickJS frame; for wasm keep at most one per 1/60 s (the video can't show more)
  if (tier === "quickjs" || done - lastWasm >= 1 / 60) {
    const iters = new Uint16Array(N * N);
    for (let k = 0; k < N * N; k++) iters[k] = (out.charCodeAt(2 * k) - 32) + 90 * (out.charCodeAt(2 * k + 1) - 32);
    writeFileSync(OUT + String(frames.length).padStart(4, "0") + ".bin", Buffer.from(iters.buffer));
    frames.push({ i: frames.length, z, start: +start.toFixed(4), done: +done.toFixed(4), tier });
    if (tier === "wasm") lastWasm = done;
  }
  if (tier === "wasm") frames.at(-1).computed = (frames.at(-1).computed ?? 0) + 1;
  await new Promise((r) => setImmediate(r));
}
const q = frames.filter((f) => f.tier === "quickjs"), w = frames.filter((f) => f.tier === "wasm");
const qMs = q.reduce((s, f) => s + (f.done - f.start), 0) / q.length * 1000;
let wCount = 0, wTime = 0; // measure wasm per-frame cost separately
for (let k = 0; k < 20; k++) { const t = performance.now(); compiled(`${(SECS * ZOOM_RATE).toFixed(3)},${N}`); wTime += performance.now() - t; wCount++; }
const parityZ = [0, 2, 4, 6].map((z) => interp(`${z},${N}`) === compiled(`${z},${N}`));
const meta = { size: N, secs: SECS, zoomRate: ZOOM_RATE, compileSecs, swapFrame, quickjsFrames: q.length, wasmFramesKept: w.length,
  quickjsMsPerFrame: +qMs.toFixed(1), wasmMsPerFrameAtEnd: +(wTime / wCount).toFixed(2), parityExtra: parityZ, frames };
writeFileSync(OUT + "frames.json", JSON.stringify(meta));
console.log({ ...meta, frames: undefined });
