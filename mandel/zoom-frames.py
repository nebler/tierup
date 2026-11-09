# zoom/NNNN.bin (uint16 iterations, size x size) -> zoom/NNNN.png with a cyclic palette (in-set = black)
import json, math, struct, subprocess, sys, glob, os
d = os.path.dirname(os.path.abspath(__file__)) + "/zoom/"
meta = json.load(open(d + "frames.json")); N = meta["size"]
stops = [(4, 6, 30), (20, 60, 170), (60, 140, 255), (255, 175, 70), (255, 240, 210), (120, 60, 20), (4, 6, 30)]
pal = []
for k in range(256):
    x = k / 256 * (len(stops) - 1); a = int(x); f = x - a
    pal.append(bytes(int(stops[a][j] + (stops[a + 1][j] - stops[a][j]) * f) for j in range(3)))
for f in meta["frames"]:
    name = d + "%04d" % f["i"]
    it = struct.unpack("<%dH" % (N * N), open(name + ".bin", "rb").read())
    mx = 120 + math.floor(f["z"] * 30)
    buf = bytearray()
    for i in it:
        buf += b"\x00\x00\x00" if i >= mx else pal[int(math.sqrt(i) * 22) % 256]
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{N}x{N}", "-i", "-", name + ".png"], input=bytes(buf), check=True)
print(len(meta["frames"]), "frames")
