// native look at how the simulation evolves: node explore.mjs [N] [steps]
import { readFileSync, writeFileSync } from "node:fs"; import { stripTypeScriptTypes } from "node:module";
const src = stripTypeScriptTypes(readFileSync(new URL("threebody.ts", import.meta.url), "utf8")).replace(/^export\s+/gm, "");
const run = new Function(src + "; return run;")();
const N = Number(process.argv[2] ?? 300), STEPS = Number(process.argv[3] ?? 560);
const dec = (s, o) => { let n = 0; for (let k = 4; k >= 0; k--) n = n * 90 + s.charCodeAt(o + k) - 32; return n / 67108864 - 32; };
let st = run("init," + N); const t0 = performance.now();
for (let i = 1; i <= STEPS; i++) {
  st = run(st);
  if (i % 40 === 0 || i === 14) {
    let alive = 0, maxR = 0, sx = 0, sy = 0, sxx = 0, syy = 0, psx = 0, psy = 0, pxx = 0, pyy = 0;
    for (let u = 0; u < N; u++) { const o = u * 81; if (st.charCodeAt(o + 80) === 33) alive++;
      for (const b of [0, 20, 40]) maxR = Math.max(maxR, Math.hypot(dec(st, o + b), dec(st, o + b + 5)));
      const x = dec(st, o), y = dec(st, o + 5); sx += x; sy += y; sxx += x * x; syy += y * y;
      const p = dec(st, o + 60), q = dec(st, o + 65); psx += p; psy += q; pxx += p * p; pyy += q * q; }
    const sd = Math.sqrt(sxx / N - (sx / N) ** 2 + syy / N - (sy / N) ** 2), pd = Math.sqrt(Math.max(0, pxx / N - (psx / N) ** 2 + pyy / N - (psy / N) ** 2));
    console.log(String(i).padStart(4), "alive", String(alive).padStart(4), "maxR", maxR.toFixed(2), "sunA spread", sd.toExponential(1), "planet spread", pd.toExponential(1), "A", (sx / N).toFixed(2), (sy / N).toFixed(2));
  }
}
console.log("native ms/step", ((performance.now() - t0) / STEPS).toFixed(2));
