"""Build plates/out/cli/transcript.json from recorded sessions.

usage: python3 capture/cli/build-transcript.py <workdir>
<workdir> holds <id>.jsonl (ptyrun.py) and <id>.frames.json (replay.mjs) for create-app, customize, add,
and my-docs/ (the generated project, for the list of ejected files).
"""
import json, os, sys

work = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(here, '..', '..', '..', 'out', 'cli'))
os.makedirs(os.path.join(OUT, 'raw'), exist_ok=True)

sessions = [
    ('create-app', 'npm create fumadocs-app', 'npm create fumadocs-app@latest', 'in an empty directory: answered npm\'s own "Ok to proceed? (y)" with y, typed the project name "my-docs", accepted every default, installed with npm. `pnpm create fumadocs-app` shows the same prompts (only "detected as pnpm" and "pnpm dev" differ).'),
    ('customize', 'npx @fumadocs/cli customize', 'npx --yes @fumadocs/cli customize', 'in the generated my-docs (Next.js, base-ui): moved the selection down to Spacious Layout and back up, chose Docs Layout; walked the parts list down and back, chose All; confirmed installing dependencies with npm.'),
    ('add', 'npx @fumadocs/cli add', 'npx --yes @fumadocs/cli add', 'typed "ban" in the search, Tab-selected "ui - banner", deleted the search, typed "tab", moved down, Tab-selected "ui - tabs", Enter.'),
]
keymap = {'\r': 'Enter', '\t': 'Tab', ' ': 'Space', '\u001b[B': 'ArrowDown', '\u001b[A': 'ArrowUp', '\u007f': 'Backspace'}


def trim(lines):
    idx = next((i for i, l in enumerate(lines) if l['text'].startswith('┌')), None)
    if idx is None:
        idx = next((i for i, l in enumerate(lines) if l['text'].startswith('│') or l['text'].startswith('◇')), len(lines))
    return lines[idx:], [l['text'] for l in lines[:idx] if l['text']]


result = {
    'about': 'Real recordings of the Fumadocs CLIs, run in a pseudo-terminal (100 columns, TERM=xterm-256color, FORCE_COLOR=1) and replayed through @xterm/headless. Every step is the exact screen at that moment (text = plain lines, lines = styled spans). The CLI output starts at the first "┌" line; anything above it (npm/pnpm notices) is in step.preamble. keysAfter = keys pressed right after that screen. Raw ANSI streams with timestamps: cli/raw/<id>.jsonl ({t, type: out|in|mark, data}).',
    'colors': 'ANSI palette names as emitted by @clack/prompts + picocolors: cyan = rail and symbol of the active prompt, green = ◇ answered / ● focused / ◼ checked, brightBlack = rails of finished prompts and the intro ┌, dim = unfocused options, hints and help line, bold/inverse where noted. Map them to your terminal palette.',
    'symbols': {
        '◆': 'active prompt (cyan)', '◇': 'answered prompt or finished task (green)', '●': 'focused radio option (green); also log.info bullet (blue)', '○': 'unfocused radio option (dim)',
        '◻': 'unchecked multiselect option (dim)', '◼': 'checked multiselect option (green)', '┌': 'intro (brightBlack)', '│': 'rail: cyan while the prompt is active, brightBlack after',
        '└': 'end of the active prompt (cyan) / outro (brightBlack)', '█': 'text cursor (inverse block) in a text input', '_': 'empty search cursor in the add prompt', '◒◐◓◑': 'spinner frames while a task runs',
    },
    'versions': {'create-fumadocs-app': '16.2.18', '@fumadocs/cli': '1.7.5'},
    'sessions': [],
}
for sid, typed, actual, how in sessions:
    d = json.load(open(os.path.join(work, f'{sid}.frames.json')))
    raw = [json.loads(l) for l in open(os.path.join(work, f'{sid}.jsonl'))]
    inputs = [e for e in raw if e['type'] == 'in']
    frames = [f for f in d['frames'] if not f['label'].startswith('TIMEOUT') and f['label'] != 'start']
    steps, prev = [], None
    for i, f in enumerate(frames):
        lines, pre = trim(f['lines'])
        text = [l['text'] for l in lines]
        if f.get('auto') and (not text or text == prev):
            continue
        nxt = frames[i + 1]['t'] if i + 1 < len(frames) else 1e9
        keys = [keymap.get(e['data'], e['data']) for e in inputs if f['t'] <= e['t'] < nxt]
        steps.append({'label': f['label'], 't': f['t'], 'keysAfter': keys, 'preamble': pre or None, 'text': text, 'lines': [l['spans'] for l in lines]})
        prev = text
    entry = {'id': sid, 'typed': typed, 'ran': actual, 'how': how, 'cols': d['cols'], 'raw': f'cli/raw/{sid}.jsonl', 'steps': steps}
    if sid == 'customize':
        base = os.path.join(work, 'my-docs')
        files = []
        for root, _, names in os.walk(os.path.join(base, 'layouts')):
            files += [os.path.relpath(os.path.join(root, n), base) for n in names]
        entry['ejectedFiles'] = sorted(files)
    result['sessions'].append(entry)
    with open(os.path.join(work, f'{sid}.jsonl')) as src, open(os.path.join(OUT, 'raw', f'{sid}.jsonl'), 'w') as dst:
        dst.write(src.read())

tmp = os.path.join(OUT, 'transcript.json.tmp')
json.dump(result, open(tmp, 'w'), ensure_ascii=False, indent=1)
os.replace(tmp, os.path.join(OUT, 'transcript.json'))
print('wrote', os.path.join(OUT, 'transcript.json'), [(s['id'], len(s['steps'])) for s in result['sessions']])
