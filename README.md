# tierup

Code-mode sandboxes run the code an agent writes in an interpreter (QuickJS or djs in wasm), because it's safe. It's also 10–100× slower than compiled code. `tierup` starts the agent's code in QuickJS right away, compiles the same source to wasm with [scriptc](https://github.com/vercel-labs/scriptc) in the background, checks that both tiers return the same output, and swaps tiers mid-run.

![Two lanes of 240 batches: QuickJS only takes 20.8 s; tier-up compiles in 0.8 s, swaps, and finishes in 1.6 s with identical output](video/out/tierup.gif)

| Same model-written `run()`, 400×400 fuzzy reconciliation per call | ms per call |
|---|---:|
| QuickJS (quickjs-emscripten 0.31), what code-mode sandboxes use | 98.2 |
| scriptc 0.4.10 → wasm, in Node's WebAssembly, no WASI access | 4.5 |
| Node 24 V8 JIT, unsandboxed, for reference | 3.6 |

End to end, 240 batches (96,000 bank lines): **20.8 s interpreted only → 1.6 s with tier-up**, output identical on all 240 batches (`node verify.mjs`).

## Run it

```sh
npm install --ignore-scripts && npm rebuild scriptc
# scriptc's wasm runtime pack: npm i @scriptc/runtime-wasm32-wasi@0.4.10 somewhere and point SCRIPTC_RUNTIME_PACK at it
node tierup.mjs                      # the model writes run() from task.md, then the run starts
node tierup.mjs --cached             # reuse the last model-written run()
node tierup.mjs --cached --interpret-only
node verify.mjs                      # every batch on both tiers, outputs must match
node video/render.mjs                # re-render the video from work/*.json recordings
```

API key: `ANTHROPIC_API_KEY`, `ANTHROPIC_API_KEY_FILE`, or the macOS Keychain item `bee-anthropic`.

## How it works

1. `task.md` asks the model for one TypeScript file exporting `run(input: string): string`, with a few constraints so an ahead-of-time compiler accepts it (declared interfaces, no `any`, no classes).
2. The code starts immediately in a QuickJS context that has nothing but the script.
3. `scriptc build --lib` compiles the same file to a wasm32-wasi reactor. If scriptc rejects it, the errors go back to the model once; if it still fails, the run stays interpreted.
4. The reactor is loaded in Node's WebAssembly with WASI stubbed deny-by-default (`spike/wasi.mjs`): no files, no environment, no network, only a clock and randomness.
5. The next batch runs on both tiers. Only identical output swaps the tier.

## Limits

- It only pays off when the code runs long enough or often enough. Compiling took 0.7–1.0 s here with scriptc's caches warm; a cold first build took about 4.7 s. A one-shot script that runs for 50 ms should stay interpreted.
- scriptc compiles a subset of TypeScript. The task prompt steers the model into it; this run needed no fix-up round, but other code may.
- One machine (Apple M4 Pro, load average around 6 during recording), one workload. CPU-heavy loops are the best case for compilation; I/O-bound scripts that mostly wait on tool calls gain little.
- The tier check compares one batch before swapping. `verify.mjs` compares all of them after the fact.
