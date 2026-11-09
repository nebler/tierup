// One image row of the Mandelbrot set (a zoom into "seahorse valley").
// input: "row,width,height" -> two ASCII chars per pixel encoding the iteration count.
export function run(input: string): string {
  const parts = input.split(",");
  const row = Number(parts[0]), w = Number(parts[1]), h = Number(parts[2]);
  const MAX = 1200, CX = -0.7453, CY = 0.1127, SPAN = 0.0065;
  const cy = CY - SPAN / 2 + (SPAN * row) / h;
  let out = "";
  for (let x = 0; x < w; x++) {
    const cx = CX - SPAN / 2 + (SPAN * x) / w;
    let zx = 0, zy = 0, i = 0;
    while (i < MAX && zx * zx + zy * zy < 4) {
      const t = zx * zx - zy * zy + cx;
      zy = 2 * zx * zy + cy;
      zx = t;
      i++;
    }
    out += String.fromCharCode(32 + (i % 90)) + String.fromCharCode(32 + Math.floor(i / 90));
  }
  return out;
}
