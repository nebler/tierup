// Renders demo/index.html frame by frame → demo/out/hook-tax-{1080x1080,1920x1080}.mp4 and a GIF.
//   node demo/render.mjs [--fmt square|wide] [--stills 0.5,3,12]
import { chromium } from "playwright-core";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
const FPS = 60;
const fmts = opt("fmt") ? [opt("fmt")] : ["square", "wide"];
const work = path.join(here, "..", "work");
const rd = (f) => JSON.parse(fs.readFileSync(path.join(work, f), "utf8"));
const interp = rd("interp.json"), tierup = rd("tierup.json"), first = rd("run1.json");
const lines = tierup.code.split("\n");
const start = lines.findIndex((l) => l.includes("for (let j = 1; j <= n; j++)"));
const code = { lines: lines.length, model: tierup.model, modelSecs: first.events.find((e) => e.type === "model").secs,
  excerpt: lines.slice(start - 3, start + 5).map((l) => l.replace(/\t/g, "  ")) };
const timings = JSON.stringify({ interp, tierup, code });
const out = path.join(here, "out"); fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--force-color-profile=srgb"] });
async function open(fmt) {
  const width = fmt === "wide" ? 1920 : 1080;
  const page = await browser.newPage({ viewport: { width, height: 1080 } });
  await page.addInitScript(`window.DATA = ${timings};`);
  await page.goto(`file://${here}/index.html?fmt=${fmt}`);
  return { page, width };
}

for (const fmt of fmts) {
  const { page, width } = await open(fmt);
  if (opt("stills")) {
    for (const t of opt("stills").split(",").map(Number)) {
      await page.evaluate((t) => window.renderAt(t), t);
      await page.screenshot({ path: path.join(out, `${fmt}-${t}.png`) });
    }
    continue;
  }
  const total = Math.round((await page.evaluate(() => window.DURATION)) * FPS);
  const mp4 = path.join(out, `tierup-${width}x1080.mp4`);
  const ff = spawn(FFMPEG, ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-tune", "animation", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4], { stdio: ["pipe", "inherit", "inherit"] });
  for (let f = 0; f < total; f++) {
    await page.evaluate((t) => window.renderAt(t), f / FPS);
    const buf = await page.screenshot({ type: "png" });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end(); await new Promise((r) => ff.on("close", r));
  if (fmt === "square") {
    const gif = path.join(out, "tierup.gif");
    execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", mp4, "-vf",
      "fps=30,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=32[p];[b][p]paletteuse=dither=none", gif]);
    console.log(gif);
  }
  console.log(`${mp4} (${total} frames)`);
  await page.close();
}
await browser.close();
