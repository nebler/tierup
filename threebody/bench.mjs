// Real run: N universes of the three-body problem, one "day" per call. QuickJS first; scriptc compiles threebody.ts to wasm
// in the background; when it is ready both tiers compute the same next state from the same state, are compared, and wasm takes over
// from the interpreter's own state. Afterwards every wasm step is recomputed in the interpreter and compared byte for byte.
//   node --no-warnings threebody/bench.mjs [N] [seconds] [hotAfter] → threebody/run/{meta.json, NNNN.txt}
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { homedir } from "node:os";
import { getQuickJS } from "quickjs-emscripten";
import { loadReactor } from "../spike/wasi.mjs";
const HERE = new URL(".", import.meta.url).pathname, W = HERE + "work/", OUT = HERE + "run/";
mkdirSync(W, { recursive: true }); rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT);
const N = Number(process.argv[2] ?? 1500), SECS = Number(process.argv[3] ?? 15), HOT_AFTER = Number(process.argv[4] ?? 2), VERIFY = process.argv[5] !== "noverify";
const src = readFileSync(HERE + "threebody.ts", "utf8");
writeFileSync(W + "agent.ts", src);
writeFileSync(W + "agent.profile.json", JSON.stringify({ profile_format: 1, name: "agent", entry: "agent.ts", emission: "llvm",
  abi: { prefix: "ag_", init_symbol: "ag_init", sink_register_symbol: "ag_sink" },
  exports: [{ export: "run", symbol: "ag_run", params: ["string"], returns: "string" }] }));
rmSync(W + "agent.wasm", { force: true });
const qjs = (await getQuickJS()).newContext();
qjs.unwrapResult(qjs.evalCode(stripTypeScriptTypes(src).replace(/^export\s+/gm, ""))).dispose();
const fn = qjs.unwrapResult(qjs.evalCode("run"));
const interp = (s) => { const a = qjs.newString(s); const r = qjs.unwrapResult(qjs.callFunction(fn, qjs.undefined, a)); a.dispose(); const o = qjs.getString(r); r.dispose(); return o; };
let state = interp("init," + N);
writeFileSync(OUT + "0000.txt", state, "latin1");
const T0 = performance.now(), now = () => (performance.now() - T0) / 1000;
let compiled = null, compileSecs = null, hotAt = null, err = "";
function startCompile() {
  hotAt = now();
  const env = { ...process.env, SCRIPTC_TARGET: "wasm32-wasi", SCRIPTC_RUNTIME_PACK: homedir() + "/code/policy-spike/wasm/node_modules/@scriptc/runtime-wasm32-wasi" };
  const p = spawn(HERE + "../node_modules/.bin/scriptc", ["build", "--lib", "--profile", "agent.profile.json", "-o", "agent.wasm"], { cwd: W, env });
  p.stdout.on("data", (d) => (err += d)); p.stderr.on("data", (d) => (err += d));
  p.on("close", async (code) => { compileSecs = now(); if (code !== 0 || !existsSync(W + "agent.wasm")) { console.error("compile failed\n" + err); process.exit(1); } compiled = await loadReactor(W + "agent.wasm", "ag_", "run"); });
}
const frames = []; let tier = "quickjs", swapFrame = null;
while (now() < SECS) {
  if (hotAt === null && now() >= HOT_AFTER) startCompile();
  const start = now(); let out;
  if (compiled && tier === "quickjs") {
    const a = interp(state), b = compiled(state);
    if (a !== b) { console.error("MISMATCH at step", frames.length + 1); process.exit(1); }
    tier = "wasm"; swapFrame = frames.length; out = b;
  } else out = tier === "wasm" ? compiled(state) : interp(state);
  const done = now(); state = out;
  frames.push({ i: frames.length + 1, start: +start.toFixed(4), done: +done.toFixed(4), tier });
  writeFileSync(OUT + String(frames.length).padStart(4, "0") + ".txt", state, "latin1");
  await new Promise((r) => setImmediate(r));
}
let identical = 0, checked = 0;
if (VERIFY) for (const f of frames) { if (f.tier !== "wasm") continue; checked++;
  if (interp(readFileSync(OUT + String(f.i - 1).padStart(4, "0") + ".txt", "latin1")) === readFileSync(OUT + String(f.i).padStart(4, "0") + ".txt", "latin1")) identical++; else console.error("DIFF step", f.i); }
const q = frames.filter((f) => f.tier === "quickjs"), w = frames.filter((f) => f.tier === "wasm").slice(1);
const ms = (a) => a.reduce((s, f) => s + (f.done - f.start), 0) / a.length * 1000;
const meta = { n: N, secs: SECS, compileStarted: hotAt, compileSecs, swapFrame, quickjsFrames: q.length, wasmFrames: w.length + 1, quickjsMsPerStep: +ms(q).toFixed(1), wasmMsPerStep: +ms(w).toFixed(2),
  speedup: +(ms(q) / ms(w)).toFixed(1), identical, checked, wasmKB: Math.round(statSync(W + "agent.wasm").size / 1024), frames };
writeFileSync(OUT + "meta.json", JSON.stringify(meta)); console.log({ ...meta, frames: undefined });
