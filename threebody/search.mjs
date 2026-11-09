// find a three-sun start that stays bound and keeps dancing for the whole video
const M = [1.0, 0.9, 1.1], SUB = 30, DT = 0.08 / 30, SOFT = 0.0004, STEPS = 640;
let seed = Number(process.argv[2] ?? 1); const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
const out = [];
for (let trial = 0; trial < 12000; trial++) {
  const p = [], v = []; for (let i = 0; i < 3; i++) { p.push([(rnd() - .5) * 2.2, (rnd() - .5) * 1.6]); v.push([(rnd() - .5) * 1.2, (rnd() - .5) * 1.2]); }
  const mt = M[0] + M[1] + M[2];
  for (const a of [p, v]) for (const d of [0, 1]) { const c = (a[0][d] * M[0] + a[1][d] * M[1] + a[2][d] * M[2]) / mt; for (const b of a) b[d] -= c; }
  const start = JSON.stringify([p, v]);
  let maxR = 0, minD = 9, close = 0, wasClose = [false, false, false], maxRy = 0;
  for (let s = 0; s < STEPS * SUB && maxR < 2.6; s++) {
    let q = 0;
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++, q++) {
      const dx = p[j][0] - p[i][0], dy = p[j][1] - p[i][1], r2 = dx * dx + dy * dy + SOFT, k = DT / (r2 * Math.sqrt(r2));
      v[i][0] += M[j] * k * dx; v[i][1] += M[j] * k * dy; v[j][0] -= M[i] * k * dx; v[j][1] -= M[i] * k * dy;
      const d = Math.sqrt(r2); minD = Math.min(minD, d); const c = d < .35; if (c && !wasClose[q]) close++; wasClose[q] = c;
    }
    for (let i = 0; i < 3; i++) { p[i][0] += v[i][0] * DT; p[i][1] += v[i][1] * DT; maxR = Math.max(maxR, Math.abs(p[i][0]) / 1.5, Math.abs(p[i][1])); }
  }
  if (maxR < 1.9 && minD > 0.06 && close >= 7) out.push({ close, maxR: +maxR.toFixed(2), minD: +minD.toFixed(3), start });
}
out.sort((a, b) => b.close - a.close); console.log(out.length); for (const o of out.slice(0, 6)) console.log(o.close, o.maxR, o.minD, o.start);
