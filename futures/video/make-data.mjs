// futures/run.json (the recorded run) -> futures/video/futures-data.js (what futures.html replays)
import { readFileSync, writeFileSync } from "node:fs";
const here = new URL(".", import.meta.url).pathname, m = JSON.parse(readFileSync(here + "../run.json", "utf8"));
writeFileSync(here + "futures-data.js", "window.H=" + JSON.stringify({ compileStarted: m.compileStarted, compileSecs: m.compileSecs, swapAt: m.swapAt, speedup: m.speedup,
  identical: m.identical, checked: m.checked, wasmKB: m.wasmKB, src: readFileSync(here + "../future.ts", "utf8"), futures: m.futures }) + ";");
