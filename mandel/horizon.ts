// One frame of a fly-down onto the Mandelbrot "horizon": the main cardioid's edge at the golden-mean angle,
// rotated so the edge lies flat like a planet rim seen from orbit.
// input: "z,w,h" (z = zoom depth in octaves) -> two ASCII chars per pixel: smooth escape value * 8 (0 = inside the set).
function log2(r: number): number {
  let e = 0;
  while (r >= 2) { r = r / 2; e++; }
  const m = r - 1;
  return e + m * (1.4425 - m * (0.7 - m * 0.26)); // only + - * / so every runtime rounds identically
}
// 0.5^z using only + - * / (exactly rounded everywhere, unlike Math.pow)
function halfPow(z: number): number {
  let n = Math.floor(z), f = z - n, r = 1;
  while (n > 0) { r = r / 2; n--; }
  const x = -f * 0.6931471805599453;
  let term = 1, sum = 1;
  for (let k = 1; k < 24; k++) { term = (term * x) / k; sum = sum + term; }
  return r * sum;
}
export function run(input: string): string {
  const parts = input.split(",");
  const z = Number(parts[0]), w = Number(parts[1]), h = Number(parts[2]);
  // edge point at the golden-mean angle and its outward normal (precomputed: sin/cos/pow are not bit-identical across runtimes)
  const px0 = -0.3905408702184, py0 = -0.5867879073469687, nx = -0.44247098154632597, ny = -0.8967828223652764;
  const span = 2.4 * halfPow(z), MAX = 200;
  const ox = px0 + nx * span * 0.1, oy = py0 + ny * span * 0.1;
  const rows: string[] = [];
  for (let py = 0; py < h; py++) {
    let line = "";
    const sy = (py / h - 0.5) * span * (h / w);
    for (let qx = 0; qx < w; qx++) {
      const sx = (qx / w - 0.5) * span;
      const cx = ox - ny * sx - nx * sy, cy = oy + nx * sx - ny * sy;
      const q = (cx - 0.25) * (cx - 0.25) + cy * cy;
      let v = 0;
      if (q * (q + (cx - 0.25)) > 0.25 * cy * cy) {
        let x = 0, y = 0, i = 0;
        while (i < MAX && x * x + y * y < 256) { const t = x * x - y * y + cx; y = 2 * x * y + cy; x = t; i++; }
        if (i < MAX) v = Math.max(1, Math.floor((i + 1 - log2(log2(x * x + y * y) / 2)) * 8));
      }
      line += String.fromCharCode(32 + (v % 90)) + String.fromCharCode(32 + Math.floor(v / 90));
    }
    rows.push(line);
  }
  return rows.join("");
}
