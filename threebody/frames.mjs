// run/NNNN.txt (simulation states) -> run/png/NNNN.png for the steps the video can show, + videos/threebody-data.js
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs"; import { spawn } from "node:child_process";
const D = new URL("run/", import.meta.url).pathname, V = process.argv[2];
const m = JSON.parse(readFileSync(D + "meta.json")), F = m.frames, N = m.n, W = 960, H = 540, SC = 128, CX = 480, CY = 236;
rmSync(D + "png", { recursive: true, force: true }); mkdirSync(D + "png");
const dec = (s, o) => { let n = 0; for (let k = 4; k >= 0; k--) n = n * 90 + s.charCodeAt(o + k) - 32; return n / 67108864 - 32; };
// which steps reach the screen: every interpreted one, and for wasm the last one finished in each 1/30 s
const kept = new Set([0]); let bucket = -1, last = null;
for (const f of F) { if (f.tier === "quickjs") { kept.add(f.i); continue; } const b = Math.floor(f.done * 30); if (b !== bucket && last !== null) kept.add(last); bucket = b; last = f.i; }
kept.add(F.at(-1).i);
const trail = new Float32Array(W * H * 3), COL = [[1.0, .80, .52], [1.0, .42, .20], [.55, .72, 1.0], [.35, 1.0, .85], [1.0, .16, .10]];
function stamp(x, y, c, amp, rad) {
  const px = CX + x * SC, py = CY - y * SC; if (px < -8 || py < -8 || px > W + 8 || py > H + 8) return;
  const x0 = Math.floor(px - rad), y0 = Math.floor(py - rad), s2 = rad * rad * .22;
  for (let j = y0; j <= y0 + 2 * rad + 1; j++) { if (j < 0 || j >= H) continue; for (let i = x0; i <= x0 + 2 * rad + 1; i++) { if (i < 0 || i >= W) continue;
    const d2 = (i - px) * (i - px) + (j - py) * (j - py), w = amp * Math.exp(-d2 / s2), o = (j * W + i) * 3; trail[o] += c[0] * w; trail[o + 1] += c[1] * w; trail[o + 2] += c[2] * w; } }
}
const ff = spawn("ffmpeg", ["-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-i", "-", "-start_number", "0", D + "png/%04d.png"], { stdio: ["pipe", "inherit", "inherit"] });
const alive = [], order = []; let prev = null;
for (let step = 0; step <= F.length; step++) {
  const st = readFileSync(D + String(step).padStart(4, "0") + ".txt", "latin1"); let a = 0;
  for (let k = 0; k < trail.length; k++) trail[k] *= .955;
  for (let u = 0; u < N; u++) { const o = u * 81;
    for (let b = 0; b < 3; b++) stamp(dec(st, o + b * 20), dec(st, o + b * 20 + 5), COL[b], 5 / N, 3);
    if (st.charCodeAt(o + 80) === 33) { a++; stamp(dec(st, o + 60), dec(st, o + 65), COL[3], 14 / N, 1.5); }
    else if (prev && prev.charCodeAt(o + 80) === 33) stamp(dec(st, o + 60), dec(st, o + 65), COL[4], 60 / N, 2);
  }
  alive.push(a); prev = st;
  if (kept.has(step)) { const buf = Buffer.alloc(W * H * 3); for (let k = 0; k < trail.length; k++) buf[k] = 255 * (1 - Math.exp(-trail[k] * 3.2)); order.push(step);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r)); }
}
ff.stdin.end(); await new Promise((r) => ff.on("close", r));
if (V) writeFileSync(V + "/threebody-data.js", "window.H=" + JSON.stringify({ n: N, compileStarted: m.compileStarted, compileSecs: m.compileSecs, swapFrame: m.swapFrame, identical: m.identical, checked: m.checked,
  wasmKB: m.wasmKB, speedup: m.speedup, qms: m.quickjsMsPerStep, wms: m.wasmMsPerStep, src: readFileSync(new URL("threebody.ts", import.meta.url), "utf8"), frames: F.map(({ i, start, done, tier }) => ({ i, start, done, tier })), kept: order, alive }) + ";");
console.log(order.length, "pngs of", F.length, "steps; alive at end", alive.at(-1));
