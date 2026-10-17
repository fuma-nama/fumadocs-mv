"""Drive an interactive CLI in a pseudo-terminal and record its raw output.

usage: python3 ptyrun.py <script.json> <out.jsonl>
script.json: {"cmd": [...], "cwd": "...", "cols": 100, "rows": 32, "env": {...},
              "steps": [{"wait": "regex", "send": "keys", "label": "...", "delay": 0.4}]}
Each recorded line: {"t": seconds, "type": "out"|"in"|"mark", "data": str}
"""
import json, os, pty, re, select, sys, time, signal, fcntl, termios, struct

spec = json.load(open(sys.argv[1]))
if 'cwd' in spec:
    spec['cwd'] = spec['cwd'].replace('$WORKDIR', os.environ.get('WORKDIR', '.'))
out = open(sys.argv[2], 'w')
cols, rows = spec.get('cols', 100), spec.get('rows', 32)
env = dict(os.environ)
env.update({'TERM': 'xterm-256color', 'COLUMNS': str(cols), 'LINES': str(rows), 'FORCE_COLOR': '1', 'CI': ''})
env.pop('CI', None)
env.update(spec.get('env', {}))

pid, fd = pty.fork()
if pid == 0:
    os.chdir(spec.get('cwd', '.'))
    os.execvpe(spec['cmd'][0], spec['cmd'], env)

fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
t0 = time.time()
buf = ''

def rec(kind, data):
    out.write(json.dumps({'t': round(time.time() - t0, 3), 'type': kind, 'data': data}) + '\n')
    out.flush()

def pump(timeout):
    global buf
    end = time.time() + timeout
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.05)
        if fd in r:
            try:
                chunk = os.read(fd, 65536)
            except OSError:
                return False
            if not chunk:
                return False
            s = chunk.decode('utf-8', 'replace')
            buf += s
            rec('out', s)
    return True

def strip(s):
    return re.sub(r'\x1b\[[0-9;?]*[ -/]*[@-~]', '', s)

alive = True
for step in spec['steps']:
    if 'wait' in step:
        pat = re.compile(step['wait'])
        deadline = time.time() + step.get('timeout', 120)
        while not pat.search(strip(buf)) and time.time() < deadline and alive:
            alive = pump(0.2)
        if not pat.search(strip(buf)):
            rec('mark', 'TIMEOUT waiting for ' + step['wait'])
            print('timeout waiting for', step['wait'], file=sys.stderr)
            break
    alive = pump(step.get('settle', 0.6))
    rec('mark', step.get('label', ''))
    buf = ''
    if 'send' in step:
        for key in step['send'] if isinstance(step['send'], list) else [step['send']]:
            os.write(fd, key.encode())
            rec('in', key)
            pump(step.get('delay', 0.35))

# drain until exit
deadline = time.time() + spec.get('tail', 30)
while alive and time.time() < deadline:
    alive = pump(0.5)
try:
    os.kill(pid, signal.SIGTERM)
except Exception:
    pass
rec('mark', 'END')
