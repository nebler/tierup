// Predict one future. run("<number>") builds one arrangement of three suns and a planet from that number,
// simulates it day by day, and reports how long the world lasts.
// Output: outcome letter (S survived, B burned, F frozen, T system torn apart), the day it ended (2 chars),
// then for every day the positions of sun A, B, C and the planet (2 chars per coordinate) so the future can be drawn.
// Only + - * / and sqrt are used, so every runtime computes exactly the same future.
const DAYS = 360, SUB = 800, DT = 0.064 / 800, SOFT = 0.0004;
const MA = 1.0, MB = 0.9, MC = 1.1, SPIN = 0.85, NUDGE = 0.6;

function enc2(v: number): string {
  let n = Math.floor((v + 3) * 1350);
  if (n < 0) n = 0;
  if (n > 8099) n = 8099;
  const a = n % 90;
  return String.fromCharCode(32 + a) + String.fromCharCode(32 + (n - a) / 90);
}
export function run(input: string): string {
  let seed = (Number(input) * 7919 + 104729) % 2147483647;
  const v: number[] = [];
  for (let k = 0; k < 12; k++) { seed = (seed * 48271) % 2147483647; seed = (seed * 48271) % 2147483647; v.push(seed / 2147483647 - 0.5); }
  // three suns: random places and speeds, then shifted so the whole system stays put
  let ax = v[0] * 2.4, ay = v[1] * 2.0, bx = v[4] * 2.4, by = v[5] * 2.0, cx = v[8] * 2.4, cy = v[9] * 2.0;
  const mt = MA + MB + MC;
  let m = (MA * ax + MB * bx + MC * cx) / mt; ax -= m; bx -= m; cx -= m;
  m = (MA * ay + MB * by + MC * cy) / mt; ay -= m; by -= m; cy -= m;
  // they circle the common centre, each with its own nudge
  let r = Math.sqrt(ax * ax + ay * ay + 0.05), avx = -ay * SPIN / r + v[2] * NUDGE, avy = ax * SPIN / r + v[3] * NUDGE;
  r = Math.sqrt(bx * bx + by * by + 0.05); let bvx = -by * SPIN / r + v[6] * NUDGE, bvy = bx * SPIN / r + v[7] * NUDGE;
  r = Math.sqrt(cx * cx + cy * cy + 0.05); let cvx = -cy * SPIN / r + v[10] * NUDGE, cvy = cx * SPIN / r + v[11] * NUDGE;
  m = (MA * avx + MB * bvx + MC * cvx) / mt; avx -= m; bvx -= m; cvx -= m;
  m = (MA * avy + MB * bvy + MC * cvy) / mt; avy -= m; bvy -= m; cvy -= m;
  // the planet: a small circular orbit around sun A
  const R = 0.05;
  let px = ax + R, py = ay, pvx = avx, pvy = avy + Math.sqrt(MA / R);
  let outcome = "S", ended = DAYS;
  const days: string[] = [];
  for (let day = 1; day <= DAYS; day++) {
    for (let s = 0; s < SUB; s++) {
      let dx = bx - ax, dy = by - ay, r2 = dx * dx + dy * dy + SOFT, k = DT / (r2 * Math.sqrt(r2));
      avx += MB * k * dx; avy += MB * k * dy; bvx -= MA * k * dx; bvy -= MA * k * dy;
      dx = cx - ax; dy = cy - ay; r2 = dx * dx + dy * dy + SOFT; k = DT / (r2 * Math.sqrt(r2));
      avx += MC * k * dx; avy += MC * k * dy; cvx -= MA * k * dx; cvy -= MA * k * dy;
      dx = cx - bx; dy = cy - by; r2 = dx * dx + dy * dy + SOFT; k = DT / (r2 * Math.sqrt(r2));
      bvx += MC * k * dx; bvy += MC * k * dy; cvx -= MB * k * dx; cvy -= MB * k * dy;
      if (outcome === "S") {
        dx = ax - px; dy = ay - py; let near = dx * dx + dy * dy;
        k = DT / ((near + 0.00002) * Math.sqrt(near + 0.00002)); pvx += MA * k * dx; pvy += MA * k * dy;
        dx = bx - px; dy = by - py; r2 = dx * dx + dy * dy; if (r2 < near) near = r2;
        k = DT / ((r2 + 0.00002) * Math.sqrt(r2 + 0.00002)); pvx += MB * k * dx; pvy += MB * k * dy;
        dx = cx - px; dy = cy - py; r2 = dx * dx + dy * dy; if (r2 < near) near = r2;
        k = DT / ((r2 + 0.00002) * Math.sqrt(r2 + 0.00002)); pvx += MC * k * dx; pvy += MC * k * dy;
        px += pvx * DT; py += pvy * DT;
        if (near < 0.0001) { outcome = "B"; ended = day; }        // too close to a sun
        else if (near > 1.0) { outcome = "F"; ended = day; }      // too far from every sun
      }
      ax += avx * DT; ay += avy * DT; bx += bvx * DT; by += bvy * DT; cx += cvx * DT; cy += cvy * DT;
    }
    if (outcome === "S" && (ax * ax + ay * ay > 9 || bx * bx + by * by > 9 || cx * cx + cy * cy > 9)) { outcome = "T"; ended = day; } // the suns fly apart
    days.push(enc2(ax) + enc2(ay) + enc2(bx) + enc2(by) + enc2(cx) + enc2(cy) + enc2(px) + enc2(py));
  }
  return outcome + String.fromCharCode(32 + (ended % 90)) + String.fromCharCode(32 + Math.floor(ended / 90)) + days.join("");
}
