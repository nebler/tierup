// node render.mjs <page.html> [--size 1920x1080] [--stills 1,5,9]   → out/<page>.mp4 (30fps) or out/<page>-<t>.png
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const [file, ...rest] = process.argv.slice(2);
const opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : null; };
const stills = opt("--stills")?.split(",").map(Number) ?? null;
const [VW, VH] = (opt("--size") ?? "1080x1080").split("x").map(Number);
const name = path.basename(file, ".html");
const out = path.join(here, "out"); fs.mkdirSync(out, { recursive: true });
const FPS = 30;
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--force-color-profile=srgb"] });
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
await page.goto("file://" + path.resolve(here, file));
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => window.READY !== false, null, { timeout: 60000 });
if (stills) {
  for (const t of stills) { await page.evaluate((t) => window.renderAt(t), t); await page.screenshot({ path: path.join(out, `${name}-${t}.png`) }); }
} else {
  const total = Math.round((await page.evaluate(() => window.DURATION)) * FPS);
  const mp4 = path.join(out, `${name}.mp4`);
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
    "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4], { stdio: ["pipe", "inherit", "inherit"] });
  for (let f = 0; f < total; f++) {
    await page.evaluate((t) => window.renderAt(t), f / FPS);
    const buf = await page.screenshot({ type: "png" });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end(); await new Promise((r) => ff.on("close", r));
  console.log(mp4, total, "frames");
}
await browser.close();
