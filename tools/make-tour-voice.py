"""Makes the guided tour's voice clips, src/renderer/tour/<id>.mp3, from
tools/tour-voice.json with a free Microsoft Edge neural voice (edge-tts).
Only the script text is sent to the speech service.

The voice is the tutorial video's: hi-IN-SwaraNeural, which reads Hindi in
Devanagari and English words in Latin letters naturally, so each line keeps
English terms (TAT, Settings, API key) in English.

usage: python tools/make-tour-voice.py            (makes clips that are missing)
       python tools/make-tour-voice.py --force    (makes every clip again)
       python tools/make-tour-voice.py --only id1,id2
"""
import asyncio
import json
import os
import sys

import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, 'tools', 'tour-voice.json')
OUT = os.path.join(ROOT, 'src', 'renderer', 'tour')
VOICE = 'hi-IN-SwaraNeural'
RATE = '+8%'


async def make(step, force):
    path = os.path.join(OUT, step['id'] + '.mp3')
    if os.path.exists(path) and not force:
        return 'kept'
    tmp = path + '.part'
    await edge_tts.Communicate(step['say'], VOICE, rate=RATE).save(tmp)
    os.replace(tmp, path)
    return 'made'


async def main():
    force = '--force' in sys.argv
    only = None
    if '--only' in sys.argv:
        only = set(sys.argv[sys.argv.index('--only') + 1].split(','))
    with open(SCRIPT, encoding='utf-8') as f:
        steps = json.load(f)
    os.makedirs(OUT, exist_ok=True)
    wanted = {s['id'] for s in steps}
    for name in os.listdir(OUT):
        if name.endswith('.mp3') and name[:-4] not in wanted:
            os.remove(os.path.join(OUT, name))
            print('removed', name)
    total = 0
    for step in steps:
        if only and step['id'] not in only:
            continue
        for attempt in range(3):
            try:
                what = await make(step, force or bool(only))
                break
            except Exception as err:  # the speech service can drop a request; try again
                what = 'failed: %s' % err
        size = os.path.getsize(os.path.join(OUT, step['id'] + '.mp3')) if what in ('made', 'kept') else 0
        total += size
        print('%-14s %-6s %6d bytes' % (step['id'], what, size))
    print('total', total, 'bytes')


asyncio.run(main())
