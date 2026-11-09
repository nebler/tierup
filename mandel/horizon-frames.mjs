// horizon/NNNN.bin (smooth escape *8, 0 = inside) -> horizon/png/NNNN.png with the atmosphere palette
import { readFileSync, mkdirSync } from "node:fs"; import { spawn } from "node:child_process";
const D = new URL("horizon/", import.meta.url).pathname, m = JSON.parse(readFileSync(D + "frames.json"));
const { w, h, frames } = m; mkdirSync(D + "png", { recursive: true });
const stops = [[0, [2, 3, 9]], [.45, [7, 13, 32]], [.68, [28, 66, 116]], [.8, [104, 144, 186]], [.9, [255, 138, 58]], [.97, [255, 224, 188]], [1, [255, 250, 242]]];
const pal = (v) => { v = Math.min(1, Math.max(0, v)); for (let k = 1; k < stops.length; k++) if (v <= stops[k][0]) { const [a, A] = stops[k - 1], [b, B] = stops[k], f = (v - a) / (b - a); return A.map((c, j) => c + (B[j] - c) * f); } };
const data = frames.map((f) => new Uint16Array(readFileSync(D + String(f.i).padStart(4, "0") + ".bin").buffer.slice(0)));
const stat = data.map((a) => { const v = [...a].filter((x) => x > 0).sort((p, q) => p - q); return [v[Math.floor(v.length * .03)] / 8, v[Math.floor(v.length * .5)] / 8]; });
// normalisation follows depth smoothly (no per-frame flicker)
const norm = frames.map((f) => { let n = 0, lo = 0, md = 0; frames.forEach((g, k) => { if (Math.abs(g.z - f.z) <= .35) { n++; lo += stat[k][0]; md += stat[k][1]; } }); return [lo / n, md / n]; });
const ff = spawn("ffmpeg", ["-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${w}x${h}`, "-i", "-", "-vf", "scale=960:540:flags=bicubic", "-start_number", "0", D + "png/%04d.png"], { stdio: ["pipe", "inherit", "inherit"] });
for (let k = 0; k < frames.length; k++) {
  const a = data[k], [lo, md] = norm[k], s = (md - lo) * 3.2 + 2, buf = Buffer.alloc(w * h * 3);
  for (let p = 0; p < w * h; p++) { if (!a[p]) continue; const c = pal(1 - Math.exp(-(a[p] / 8 - lo) / s)); buf[3 * p] = c[0]; buf[3 * p + 1] = c[1]; buf[3 * p + 2] = c[2]; }
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
}
ff.stdin.end(); await new Promise((r) => ff.on("close", r)); console.log(frames.length, "pngs");
