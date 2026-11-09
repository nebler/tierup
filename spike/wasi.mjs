// Loads a scriptc wasm32-wasi reactor in Node's own WebAssembly and exposes fn(string) -> string.
// WASI is stubbed deny-by-default: no files, no env, no network; only a clock and randomness.
import { readFileSync } from "node:fs";
import { randomFillSync } from "node:crypto";

export async function loadReactor(path, prefix, exportName) {
  const module = await WebAssembly.compile(readFileSync(path));
  let mem;
  const view = () => new DataView(mem.buffer);
  const wasi = {
    environ_sizes_get: (a, b) => { view().setUint32(a, 0, true); view().setUint32(b, 0, true); return 0; },
    environ_get: () => 0,
    args_sizes_get: (a, b) => { view().setUint32(a, 0, true); view().setUint32(b, 0, true); return 0; },
    args_get: () => 0,
    fd_prestat_get: () => 8,            // EBADF: no preopened directories
    fd_prestat_dir_name: () => 8,
    clock_time_get: (_id, _prec, out) => { view().setBigUint64(out, process.hrtime.bigint(), true); return 0; },
    random_get: (p, n) => { randomFillSync(new Uint8Array(mem.buffer, p, n)); return 0; },
    fd_write: (fd, iovs, n, written) => {
      let total = 0;
      for (let i = 0; i < n; i++) {
        const p = view().getUint32(iovs + i * 8, true), l = view().getUint32(iovs + i * 8 + 4, true);
        if (fd === 2) process.stderr.write(Buffer.from(mem.buffer, p, l));
        total += l;
      }
      view().setUint32(written, total, true); return 0;
    },
    proc_exit: (code) => { throw new Error("wasm proc_exit " + code); },
  };
  const imports = {};
  for (const imp of WebAssembly.Module.imports(module)) {
    imports[imp.module] ??= {};
    if (imp.module === "wasi_snapshot_preview1") imports[imp.module][imp.name] = wasi[imp.name] ?? (() => 52); // ENOSYS
    else if (imp.module === "scriptc" && imp.name === "panic") imports[imp.module][imp.name] = (p, l) => { throw new Error("wasm panic: " + Buffer.from(mem.buffer, p, l).toString()); };
    else imports[imp.module][imp.name] = () => { throw new Error(`unexpected import ${imp.module}.${imp.name}`); };
  }
  const inst = await WebAssembly.instantiate(module, imports);
  const x = inst.exports;
  mem = x.memory;
  x._initialize?.();
  x[prefix + "init"]();
  const enc = new TextEncoder(), dec = new TextDecoder();
  const slots = x.scriptc_alloc(8);
  return (input) => {
    const bytes = enc.encode(input);
    const p = x.scriptc_alloc(bytes.length);
    new Uint8Array(mem.buffer, p, bytes.length).set(bytes);
    x[prefix + exportName](p, bytes.length, slots, slots + 4);
    x.scriptc_free(p);
    const op = view().getUint32(slots, true), ol = view().getUint32(slots + 4, true);
    return dec.decode(new Uint8Array(mem.buffer, op, ol).slice());
  };
}
