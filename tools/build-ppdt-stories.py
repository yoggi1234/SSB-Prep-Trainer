"""Writes data/ppdt-stories.json: for every PPDT picture (data/ppdt.json) and classic TAT plate
(data/tat-classic.json), what the picture shows and five model PPDT stories, one per officer-like
quality angle. Uses a vision model through the local Ollama app (free cloud models need
`ollama signin`). Resumable: pictures already in the file are skipped, and progress is saved as it goes.

Run: python tools/build-ppdt-stories.py [--model gemma4:31b-cloud] [--parallel 4]
"""
import argparse
import base64
import json
import os
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
OUT = os.path.join(DATA, 'ppdt-stories.json')

# The PPDT format: perception (characters, age, sex, mood, action) then a Problem -> Action -> Outcome
# story with a named hero, past tense, realistic positive end (sources: SSBCrack, PW, OliveGreens).
PROMPT = open(os.path.join(DATA, 'ppdt-prompt.txt'), encoding='utf-8').read()
TYPES = ['Leadership', 'Social responsibility', 'Courage in a crisis', 'Initiative and achievement', 'Teamwork']


def pictures():
    out = []
    for name, folder in (('ppdt.json', 'ppdt'), ('tat-classic.json', 'tat-classic')):
        for rec in json.load(open(os.path.join(DATA, name), encoding='utf-8')):
            path = os.path.join(DATA, folder, rec['file'])
            if os.path.exists(path):
                out.append((rec['id'], path))
    return out


def ask(model, path):
    img = base64.b64encode(open(path, 'rb').read()).decode()
    body = {'model': model, 'stream': False, 'format': 'json', 'think': False, 'options': {'temperature': 0.4},
            'messages': [{'role': 'user', 'content': PROMPT, 'images': [img]}]}
    req = urllib.request.Request('http://localhost:11434/api/chat', data=json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json'})
    for wait in (5, 20, 60, 0):
        try:
            d = json.loads(json.load(urllib.request.urlopen(req, timeout=300))['message']['content'])
            stories = d.get('stories') or []
            ok = len(stories) == 5 and all(len((s.get('story') or '').split()) >= 70 for s in stories)
            if ok and d.get('perception'):
                for s, t in zip(stories, TYPES):
                    s['type'] = t
                return d
        except Exception:
            pass
        if wait:
            time.sleep(wait)
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default='gemma4:31b-cloud')
    ap.add_argument('--parallel', type=int, default=4)
    a = ap.parse_args()
    done = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}
    todo = [(i, p) for i, p in pictures() if i not in done]
    lock = threading.Lock()
    print(f'{len(done)} done, {len(todo)} to write with {a.model}')

    def job(item):
        pid, path = item
        res = ask(a.model, path)
        with lock:
            if res:
                done[pid] = {'perception': res['perception'], 'stories': res['stories'], 'model': a.model}
                tmp = OUT + '.tmp'
                json.dump(done, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
                os.replace(tmp, OUT)
            print(('ok   ' if res else 'FAIL ') + pid, len(done), flush=True)

    with ThreadPoolExecutor(a.parallel) as ex:
        list(ex.map(job, todo))
    print('finished:', len(done), 'pictures with stories')


if __name__ == '__main__':
    main()
