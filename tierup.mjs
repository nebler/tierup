// tierup: agent-written code starts in an interpreter and tiers up to compiled wasm mid-run.
//
//   node tierup.mjs [--batches 120] [--rows 400] [--model claude-opus-5-5] [--cached] [--record run.json]
//
// 1. The model writes run(input: string): string for a reconciliation task (or --cached reuses the last one).
// 2. Batches start running immediately in QuickJS (the interpreter code-mode sandboxes use).
// 3. Meanwhile scriptc compiles the same source to a wasm reactor (no file, env or network access).
// 4. When it lands, one batch runs on both tiers; if the outputs are identical the host swaps tiers.
//    If scriptc rejects the code, its errors go back to the model once; otherwise it stays interpreted.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { homedir } from "node:os";
import { parseArgs } from "node:util";
import { getQuickJS } from "quickjs-emscripten";
import { loadReactor } from "./spike/wasi.mjs";
import { makeBatch } from "./data.mjs";

const { values: v } = parseArgs({ options: {
  batches: { type: "string", default: "120" }, rows: { type: "string", default: "400" },
  model: { type: "string", default: "claude-opus-5-5" }, cached: { type: "boolean", default: false },
  record: { type: "string" }, "interpret-only": { type: "boolean", default: false },
} });
const HERE = new URL(".", import.meta.url).pathname;
const WORK = HERE + "work/";
mkdirSync(WORK, { recursive: true });
const BATCHES = Number(v.batches), ROWS = Number(v.rows);
const events = [];
const T0 = performance.now();
const ev = (type, data = {}) => events.push({ t: +((performance.now() - T0) / 1000).toFixed(4), type, ...data });

// ---------- terminal ----------
const tty = process.stdout.isTTY;
const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const state = { tier: "waiting", note: "", done: 0, rows: 0, rate: 0, spark: [], compile: "", code: "" };
const BAR = 36, SPARK = "▁▂▃▄▅▆▇█";
function draw(final = false) {
  const pct = state.done / BATCHES, fill = Math.round(pct * BAR);
  const max = Math.max(1, ...state.spark);
  const lines = [
    c("2", "  agent code   ") + state.code,
    c("2", "  tier         ") + (state.tier === "compiled" ? c("1;38;5;215", "scriptc wasm · compiled") : state.tier === "interpreted" ? c("1", "QuickJS · interpreted") : c("2", state.tier)),
    c("2", "  progress     ") + (state.tier === "compiled" ? c("38;5;215", "█".repeat(fill)) : "█".repeat(fill)) + c("2", "░".repeat(BAR - fill)) + c("2", `  ${state.done}/${BATCHES} batches`),
    c("2", "  throughput   ") + c("1", `${Math.round(state.rate).toLocaleString("en-US").padStart(9)} rows/s  `) + c("38;5;215", state.spark.slice(-40).map((x) => SPARK[Math.min(7, Math.floor((x / max) * 7.99))]).join("")),
    c("2", "  scriptc      ") + state.compile,
    c("2", "  ") + state.note,
  ];
  if (tty && draw.drawn) process.stdout.write(`\x1b[${lines.length}A`);
  process.stdout.write(lines.map((l) => "\x1b[2K" + l).join("\n") + "\n");
  draw.drawn = true;
  if (final) draw.drawn = false;
}

// ---------- the model writes the function ----------
function apiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  if (process.env.ANTHROPIC_API_KEY_FILE) return readFileSync(process.env.ANTHROPIC_API_KEY_FILE.replace(/^~(?=\/)/, homedir()), "utf8").trim();
  const k = spawnSync("security", ["find-generic-password", "-s", "bee-anthropic", "-w"], { encoding: "utf8" });
  if (k.status === 0) return k.stdout.trim();
  throw new Error("no API key (ANTHROPIC_API_KEY, ANTHROPIC_API_KEY_FILE, or Keychain item bee-anthropic)");
}
const TASK = readFileSync(HERE + "task.md", "utf8");
async function ask(messages) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey(), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: v.model, max_tokens: 8000, messages }),
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  const text = d.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const m = text.match(/```(?:ts|typescript)?\n([\s\S]*?)```/);
  return { code: (m ? m[1] : text).trim() + "\n", text };
}

// ---------- scriptc in the background ----------
function compile(src) {
  writeFileSync(WORK + "agent.ts", src);
  writeFileSync(WORK + "agent.profile.json", JSON.stringify({
    profile_format: 1, name: "agent", entry: "agent.ts", emission: "llvm",
    abi: { prefix: "ag_", init_symbol: "ag_init", sink_register_symbol: "ag_sink" },
    exports: [{ export: "run", symbol: "ag_run", params: ["string"], returns: "string" }],
  }));
  const env = { ...process.env, SCRIPTC_TARGET: "wasm32-wasi",
    SCRIPTC_RUNTIME_PACK: process.env.SCRIPTC_RUNTIME_PACK ?? homedir() + "/code/policy-spike/wasm/node_modules/@scriptc/runtime-wasm32-wasi" };
  return new Promise((resolve) => {
    const t = performance.now();
    const p = spawn(HERE + "node_modules/.bin/scriptc", ["build", "--lib", "--profile", "agent.profile.json", "-o", "agent.wasm"], { cwd: WORK, env });
    let err = "";
    p.stdout.on("data", (d) => (err += d)); p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ ok: code === 0 && existsSync(WORK + "agent.wasm"), secs: (performance.now() - t) / 1000, errors: err }));
  });
}

// ---------- main ----------
draw();
let src;
if (v.cached && existsSync(WORK + "agent.ts")) {
  src = readFileSync(WORK + "agent.ts", "utf8");
  state.code = `run() · ${src.split("\n").length} lines · cached from the last model run`;
} else {
  state.note = c("2", `asking ${v.model} to write run()…`); draw();
  const t = performance.now();
  src = (await ask([{ role: "user", content: TASK }])).code;
  state.code = `run() · ${src.split("\n").length} lines · written by ${v.model} in ${((performance.now() - t) / 1000).toFixed(1)} s`;
  ev("model", { secs: (performance.now() - t) / 1000, lines: src.split("\n").length });
}
writeFileSync(WORK + "agent.ts", src);

// Interpreter tier: QuickJS with nothing but the script (no I/O at all).
const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();
vm.unwrapResult(vm.evalCode(stripTypeScriptTypes(src).replace(/^export\s+/gm, ""))).dispose();
const qfn = vm.unwrapResult(vm.evalCode("run"));
const interp = (input) => { const s = vm.newString(input); const r = vm.unwrapResult(vm.callFunction(qfn, vm.undefined, s)); s.dispose(); const o = vm.getString(r); r.dispose(); return o; };

let compiled = null, tier = "interpreted";
state.tier = "interpreted"; state.note = "";
state.compile = v["interpret-only"] ? c("2", "off (interpreter-only run)") : c("33", "compiling in the background…");
ev("start", { tier });
const compileStart = performance.now();
const compiling = v["interpret-only"] ? new Promise(() => {}) : (async () => {
  let r = await compile(src);
  if (!r.ok && !v.cached) {
    ev("rejected", { secs: r.secs, errors: r.errors.slice(0, 2000) });
    state.compile = c("31", `rejected (${(r.errors.match(/SC\d{4}/g) ?? []).slice(0, 3).join(", ")}) · asking the model to fix it…`);
    const fix = await ask([{ role: "user", content: TASK }, { role: "assistant", content: "```ts\n" + src + "```" },
      { role: "user", content: "scriptc rejected it:\n" + r.errors.slice(0, 4000) + "\nReturn the full corrected file in one ```ts block. Same behavior." }]);
    r = await compile(fix.code);
    if (r.ok) src = fix.code;
  }
  return r;
})();
compiling.then(async (r) => {
  const secs = (performance.now() - compileStart) / 1000;
  if (!r.ok) { state.compile = c("31", "rejected · staying interpreted"); ev("compile_failed", { secs }); return; }
  compiled = await loadReactor(WORK + "agent.wasm", "ag_", "run");
  state.compile = c("32", `compiled in ${secs.toFixed(1)} s · ${(readFileSync(WORK + "agent.wasm").length / 1024).toFixed(0)} KB wasm · checking…`);
  ev("compiled", { secs, bytes: readFileSync(WORK + "agent.wasm").length });
});

const results = [];
let windowRows = 0, windowT = performance.now();
for (let b = 0; b < BATCHES; b++) {
  const input = makeBatch(b, ROWS);
  let out;
  if (compiled && tier === "interpreted") {
    // Verify before trusting: run this batch on both tiers and require identical output.
    const a = interp(input), z = compiled(input);
    if (a === z) { tier = "compiled"; state.tier = "compiled"; state.compile += c("32", " identical output ✓ swapped"); ev("swap", { batch: b }); }
    else { compiled = null; state.compile = c("31", "outputs differ · staying interpreted"); ev("mismatch", { batch: b }); }
    out = a;
  } else out = tier === "compiled" ? compiled(input) : interp(input);
  results.push(out);
  state.done = b + 1; state.rows += ROWS; windowRows += ROWS;
  const now = performance.now();
  if (now - windowT > 50 || b === BATCHES - 1) {
    state.rate = windowRows / ((now - windowT) / 1000); state.spark.push(state.rate);
    ev("tick", { batch: b + 1, rate: Math.round(state.rate), tier });
    windowRows = 0; windowT = now; draw();
  }
  await new Promise((r) => setImmediate(r));   // let the compiler's events through
}
const total = (performance.now() - T0) / 1000;
ev("done", { total });
state.note = c("1", `done in ${total.toFixed(1)} s`) + c("2", ` · ${(BATCHES * ROWS).toLocaleString("en-US")} rows · ${tier === "compiled" ? "finished compiled" : "interpreted only"}`);
draw(true);
if (v.record) {
  const sh = (...a) => spawnSync(a[0], a.slice(1), { encoding: "utf8" }).stdout.trim();
  const env = { cpu: sh("sysctl", "-n", "machdep.cpu.brand_string"), cores: (await import("node:os")).cpus().length,
    os: "macOS " + sh("sw_vers", "-productVersion"), load: +(await import("node:os")).loadavg()[0].toFixed(1),
    node: process.version, scriptc: sh(HERE + "node_modules/.bin/scriptc", "--version"),
    quickjs: JSON.parse(readFileSync(HERE + "node_modules/quickjs-emscripten/package.json", "utf8")).version };
  writeFileSync(v.record, JSON.stringify({ batches: BATCHES, rows: ROWS, model: v.model, interpretOnly: v["interpret-only"], env, code: src, events }, null, 1));
}
process.exit(0);
