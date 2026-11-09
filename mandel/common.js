// Deterministic timeline helpers: everything is a pure function of t (seconds).
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));           // 0..1 progress of t through [a,b]
const ease = (x) => 1 - Math.pow(1 - x, 3);                    // easeOutCubic
const inOut = (x) => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const $ = (s) => document.querySelector(s);
const fade = (el, o, dy = 0) => { el.style.opacity = o; el.style.transform = `translateY(${(1 - o) * dy}px)`; };
// typed text: show first n chars of s at progress p
const typed = (s, p) => s.slice(0, Math.round(s.length * clamp(p)));
// pick the caption whose start time is the latest <= t, crossfading over 0.25s
function captions(el, list, t) {
  let i = -1; list.forEach((c, k) => { if (t >= c[0]) i = k; });
  if (i < 0) { el.style.opacity = 0; return; }
  el.innerHTML = list[i][1];
  const inP = ease(seg(t, list[i][0], list[i][0] + .3));
  const next = list[i + 1]; const outP = next ? 1 - seg(t, next[0] - .2, next[0]) : 1;
  fade(el, Math.min(inP, outP), 18);
}
