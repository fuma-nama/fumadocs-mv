# Approximate photosensitive-flash check (after ITU-R BT.1702 / Harding): per pixel, a transition is a monotonic
# swing of >= 10 % of max relative luminance where the darker side is < 0.8; a red transition is a swing of
# saturated-red level (R - G - B, linear, where R/(R+G+B) >= 0.8) >= 0.0625. A frame is a general (red) flash
# transition when >= 25 % of the frame transitions at once. Two opposing transitions make one flash; more than
# 3 flashes in any 1 s window fails.
# usage: ../music/.venv/bin/python -I render/flashcheck.py <video> <out_prefix> [--from s --to s]
import sys, json, subprocess
import numpy as np

video, prefix = sys.argv[1], sys.argv[2]
opts = dict(zip(sys.argv[3::2], sys.argv[4::2]))
W, H, FPS = 192, 108, 60.0
span = (['-ss', opts['--from']] if '--from' in opts else []) + (['-to', opts['--to']] if '--to' in opts else [])
cmd = ['/opt/homebrew/bin/ffmpeg', '-v', 'error', *span, '-i', video, '-vf', f'fps=60,scale={W}:{H}:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
size = W * H * 3

def lin(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

class Tracker:
    def __init__(self, thr, dark_limit):
        self.thr, self.dark = thr, dark_limit
        self.lo = self.hi = None
    def step(self, v):
        if self.lo is None:
            self.lo = v.copy(); self.hi = v.copy()
            return np.zeros(v.shape, bool), np.zeros(v.shape, bool)
        self.lo = np.minimum(self.lo, v); self.hi = np.maximum(self.hi, v)
        rise = (v - self.lo >= self.thr) & (self.lo < self.dark)
        fall = (self.hi - v >= self.thr) & (v < self.dark)
        ev = rise | fall
        self.lo[ev] = v[ev]; self.hi[ev] = v[ev]
        return rise, fall

gen, red = Tracker(0.10, 0.8), Tracker(0.0625, 9.0)
rows = []
while True:
    buf = p.stdout.read(size)
    if len(buf) < size:
        break
    a = lin(np.frombuffer(buf, dtype=np.uint8).reshape(H, W, 3).astype(np.float32))
    L = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    s = a.sum(-1) + 1e-6
    rlev = np.where(a[..., 0] / s >= 0.8, np.clip(a[..., 0] - a[..., 1] - a[..., 2], 0, None), 0.0)
    gr, gf = gen.step(L)
    rr, rf = red.step(rlev)
    rows.append((gr.mean(), gf.mean(), rr.mean(), rf.mean()))

R = np.array(rows)
n = len(R)
t0 = float(opts.get('--from', 0))
def events(cr, cf):
    ev = []
    for i in range(n):
        if cr[i] >= 0.25: ev.append((i, +1))
        if cf[i] >= 0.25: ev.append((i, -1))
    return ev
def flashes(ev):
    # count opposing pairs in any 60-frame window
    worst, worst_at = 0, None
    for k, (i, d) in enumerate(ev):
        win = [e for e in ev if i <= e[0] < i + 60]
        changes = sum(1 for a_, b_ in zip(win, win[1:]) if a_[1] != b_[1])
        fl = (changes + 1) // 2 if len(win) > 1 else 0
        if fl > worst:
            worst, worst_at = fl, i
    return worst, worst_at
gev, rev = events(R[:, 0], R[:, 1]), events(R[:, 2], R[:, 3])
gw, gat = flashes(gev)
rw, rat = flashes(rev)
fails = []
for name, ev in (('general', gev), ('red', rev)):
    for k, (i, d) in enumerate(ev):
        win = [e for e in ev if i <= e[0] < i + 60]
        changes = sum(1 for a_, b_ in zip(win, win[1:]) if a_[1] != b_[1])
        if (changes + 1) // 2 > 3:
            fails.append((name, t0 + i / FPS, t0 + win[-1][0] / FPS, (changes + 1) // 2))
merged = []
for f in fails:
    if merged and merged[-1][0] == f[0] and f[1] <= merged[-1][2] + 0.05:
        merged[-1] = (f[0], merged[-1][1], max(merged[-1][2], f[2]), max(merged[-1][3], f[3]))
    else:
        merged.append(f)
with open(prefix + '.md', 'w') as fo:
    fo.write(f'# Flash check: {video}\n\n{n} frames. Large-area (>= 25 %) transitions: general {len(gev)}, red {len(rev)}.\n')
    fo.write(f'Worst 1 s window: general {gw} flashes at {t0 + (gat or 0) / FPS:.2f} s; red {rw} flashes at {t0 + (rat or 0) / FPS:.2f} s.\n\n')
    fo.write('## Windows over 3 flashes/s\n\n' + ('\n'.join(f'- {k}: {a_:.2f}–{b_:.2f} s, up to {c} flashes in 1 s' for k, a_, b_, c in merged) or 'none') + '\n\n')
    fo.write('## Large-area transitions\n\n' + '\n'.join(f'- {t0 + i / FPS:.3f} s {"up" if d > 0 else "down"} ({100 * (R[i, 0] if d > 0 else R[i, 1]):.0f} %)' for i, d in gev) + '\n')
print(f'general worst {gw}/s at {t0 + (gat or 0) / FPS:.2f}; red worst {rw}/s; {len(merged)} failing windows -> {prefix}.md')
