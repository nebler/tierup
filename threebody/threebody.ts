// The three-body problem, many times over: N universes, each with three suns and one planet, each starting a hair apart.
// run(state) advances every universe by one "day" and returns the new state. Nothing is kept between calls:
// the whole simulation lives in the string, so any runtime can pick up exactly where another left off.
//   run("init,N") -> the starting state.
// State: per universe 16 numbers (x, y, vx, vy for sun A, B, C and the planet) as 5 chars each, then 1 char: planet alive?
// Numbers are fixed-point (1/2^26), and the maths uses only + - * / and sqrt, so every runtime rounds identically.
const SUB = 30, DT = 0.064 / 30, SOFT = 0.0004;
const MA = 1.0, MB = 0.9, MC = 1.1;

function enc(v: number): string {
  let n = Math.floor((v + 32) * 67108864 + 0.5);
  if (n < 0) n = 0;
  if (n > 4294967295) n = 4294967295;
  const a = n % 90; n = (n - a) / 90;
  const b = n % 90; n = (n - b) / 90;
  const c = n % 90; n = (n - c) / 90;
  const d = n % 90; n = (n - d) / 90;
  return String.fromCharCode(32 + a) + String.fromCharCode(32 + b) + String.fromCharCode(32 + c) + String.fromCharCode(32 + d) + String.fromCharCode(32 + n);
}
function dec(s: string, o: number): number {
  const n = s.charCodeAt(o) - 32 + 90 * (s.charCodeAt(o + 1) - 32 + 90 * (s.charCodeAt(o + 2) - 32 + 90 * (s.charCodeAt(o + 3) - 32 + 90 * (s.charCodeAt(o + 4) - 32))));
  return n / 67108864 - 32;
}
function init(n: number): string {
  // one starting arrangement; every universe nudges it by about a thousandth
  const base = [0.5610938575279094, -0.9636872268733665, -0.20959630320295522, -0.18315190985014287, 0.6204314431612219, 0.5523826681166186, -0.3521705070287784, -0.3825447861582715, -1.01771105124819, 0.424129841425827, 0.47868159957168693, 0.47949292490235196];
  let seed = 12345;
  const rows: string[] = [];
  for (let u = 0; u < n; u++) {
    let line = "";
    for (let k = 0; k < 12; k++) {
      seed = (seed * 48271) % 2147483647;
      const jitter = k % 4 < 2 ? (seed / 2147483647 - 0.5) * 0.002 : 0;
      line += enc(base[k] + jitter);
    }
    // the planet: a small orbit around sun A
    seed = (seed * 48271) % 2147483647;
    const jx = (seed / 2147483647 - 0.5) * 0.002;
    seed = (seed * 48271) % 2147483647;
    const jy = (seed / 2147483647 - 0.5) * 0.002;
    const r = 0.08;
    line += enc(base[0] + r + jx) + enc(base[1] + jy) + enc(base[2]) + enc(base[3] + Math.sqrt(MA / r));
    rows.push(line + "!");
  }
  return rows.join("");
}
export function run(input: string): string {
  if (input.length < 40) return init(Number(input.split(",")[1]));
  const n = input.length / 81;
  const rows: string[] = [];
  for (let u = 0; u < n; u++) {
    const o = u * 81;
    let ax = dec(input, o), ay = dec(input, o + 5), avx = dec(input, o + 10), avy = dec(input, o + 15);
    let bx = dec(input, o + 20), by = dec(input, o + 25), bvx = dec(input, o + 30), bvy = dec(input, o + 35);
    let cx = dec(input, o + 40), cy = dec(input, o + 45), cvx = dec(input, o + 50), cvy = dec(input, o + 55);
    let px = dec(input, o + 60), py = dec(input, o + 65), pvx = dec(input, o + 70), pvy = dec(input, o + 75);
    let alive = input.charCodeAt(o + 80) === 33;
    for (let s = 0; s < SUB; s++) {
      // gravity between the three suns
      let dx = bx - ax, dy = by - ay, r2 = dx * dx + dy * dy + SOFT, k = DT / (r2 * Math.sqrt(r2));
      avx += MB * k * dx; avy += MB * k * dy; bvx -= MA * k * dx; bvy -= MA * k * dy;
      dx = cx - ax; dy = cy - ay; r2 = dx * dx + dy * dy + SOFT; k = DT / (r2 * Math.sqrt(r2));
      avx += MC * k * dx; avy += MC * k * dy; cvx -= MA * k * dx; cvy -= MA * k * dy;
      dx = cx - bx; dy = cy - by; r2 = dx * dx + dy * dy + SOFT; k = DT / (r2 * Math.sqrt(r2));
      bvx += MC * k * dx; bvy += MC * k * dy; cvx -= MB * k * dx; cvy -= MB * k * dy;
      if (alive) {
        // the planet feels all three; too close and it burns, too far and it is lost
        dx = ax - px; dy = ay - py; r2 = dx * dx + dy * dy; if (r2 < 0.0004) alive = false;
        k = DT / ((r2 + 0.00002) * Math.sqrt(r2 + 0.00002)); pvx += MA * k * dx; pvy += MA * k * dy;
        dx = bx - px; dy = by - py; r2 = dx * dx + dy * dy; if (r2 < 0.0004) alive = false;
        k = DT / ((r2 + 0.00002) * Math.sqrt(r2 + 0.00002)); pvx += MB * k * dx; pvy += MB * k * dy;
        dx = cx - px; dy = cy - py; r2 = dx * dx + dy * dy; if (r2 < 0.0004) alive = false;
        k = DT / ((r2 + 0.00002) * Math.sqrt(r2 + 0.00002)); pvx += MC * k * dx; pvy += MC * k * dy;
        px += pvx * DT; py += pvy * DT;
        if (px * px + py * py > 36) alive = false;
      }
      ax += avx * DT; ay += avy * DT; bx += bvx * DT; by += bvy * DT; cx += cvx * DT; cy += cvy * DT;
    }
    rows.push(enc(ax) + enc(ay) + enc(avx) + enc(avy) + enc(bx) + enc(by) + enc(bvx) + enc(bvy) + enc(cx) + enc(cy) + enc(cvx) + enc(cvy)
      + enc(px) + enc(py) + enc(pvx) + enc(pvy) + (alive ? "!" : " "));
  }
  return rows.join("");
}
