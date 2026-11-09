// One frame of a Mandelbrot zoom. input: "z,size" (z = zoom depth, 0 = whole set) -> two ASCII chars per pixel (iterations).
export function run(input: string): string {
  const parts = input.split(",");
  const z = Number(parts[0]), n = Number(parts[1]);
  const MAX = 120 + Math.floor(z * 30);
  const CX = -0.743643887037151, CY = 0.13182590420533;
  const span = 3.2 * Math.pow(0.5, z);
  const rows: string[] = [];
  for (let py = 0; py < n; py++) {
    let line = "";
    const cy = CY - span / 2 + (span * py) / n;
    for (let px = 0; px < n; px++) {
      const cx = CX - span / 2 + (span * px) / n;
      let zx = 0, zy = 0, i = 0;
      while (i < MAX && zx * zx + zy * zy < 4) {
        const t = zx * zx - zy * zy + cx;
        zy = 2 * zx * zy + cy;
        zx = t;
        i++;
      }
      line += String.fromCharCode(32 + (i % 90)) + String.fromCharCode(32 + Math.floor(i / 90));
    }
    rows.push(line);
  }
  return rows.join("");
}
