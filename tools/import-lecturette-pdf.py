#!/usr/bin/env python3
"""Import the user's LECTURETTE TOPICS.pdf into data/lecturette-topics-extra.json.

The PDF is three bands (Above average / Average / Below average) laid out in two
columns. Text extraction is positional, so a title can wrap onto the next line
and two topics can share one line. This reads the layout form of the text, keeps
the band each topic came from, and gives every topic a theme so the app's theme
filter can group it.

Only titles are imported. No facts, figures or claims are invented here - the
app builds an outline for each topic and fills it from the news panel.

Usage:
  python tools/import-lecturette-pdf.py "C:/path/to/LECTURETTE TOPICS.pdf"
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
OUT = os.path.join(DATA, 'lecturette-topics-extra.json')

BANDS = {'ABOVE AVERAGE': 'above', 'AVERAGE': 'average', 'BELOW AVERAGE': 'below'}

# First match wins, so the more specific themes come first.
THEMES = [
    ('Defence & Security', [
        'defence', 'defense', 'army', 'navy', 'air force', 'military', 'war', 'warship', 'weapon',
        'missile', 'nuclear', 'siachen', 'afspa', 'drdo', 'mtcr', 'nato', 'terror', 'isis',
        'insurgen', 'chemical warfare', 'space warfare', 'security council', 'unsc', 'nsg',
        'border', 'coast line', 'coastline', 'national security', 'arms', 'radical',
    ]),
    ('Science & Technology', [
        'technology', 'nano', 'robot', 'artificial intelligence', 'cyber', 'data security',
        'computer', 'hacking', 'crypto', 'mobile', '4g', 'ios', 'android', 'fibre', 'space',
        'satellite', 'virtual reality', 'stem cell', 'genetic', 'gene', 'search engine', 'digi',
        'smartphone', 'internet', 'net banking', 'online', 'science', 'cloning', 'clon',
        'biotech', 'e-waste',
    ]),
    ('Environment & Geography', [
        'pollution', 'climate', 'global warming', 'green house', 'greenhouse', 'forest',
        'weather', 'water', 'river', 'ganga', 'glacier', 'ocean', 'energy', 'oil spill',
        'deforestation', 'national park', 'rain', 'monsoon', 'disaster', 'earthquake',
        'cyclone', 'wildlife', 'kaveri', 'environment', 'agricultur', 'farmer', 'food adulter',
    ]),
    ('International Relations', [
        'wto', 'brics', 'saarc', 'asean', 'european union', 'foreign', 'diplomac', 'united nations',
        'india-', 'india &', 'indo', 'china', 'pakistan', 'bangladesh', 'israel', 'bhutan',
        'taiwan', 'west asia', 'world', 'unipolar', 'global planning', 'peace keeping',
        'un ', 'world trade',
    ]),
    ('Economy & Business', [
        'econom', 'tax', 'gst', 'fdi', 'trade', 'export', 'bank', 'finance', 'fiscal', 'budget',
        'market', 'industry', 'industries', 'business', 'start-up', 'startup', 'e-commerce',
        'msp', 'subsid', 'inflation', 'sez', 'economic zone', 'rupee', 'dollar', 'invest',
        'money', 'mall', 'outsourcing', 'skill development', 'unemploy', 'insurance',
        'real estate', 'capitalism', 'small scale', 'gdp', 'wage', 'mineral', 'poverty',
        'rich / poor', 'shopping',
    ]),
    ('Polity & Governance', [
        'parliament', 'lok sabha', 'rajya sabha', 'judiciary', 'constitution', 'supreme court',
        'cag', 'rti', 'lok pal', 'lokpal', 'article', 'election', 'politic', 'governance',
        'minister', 'ministry', 'bill', ' act', 'policy', 'reservation', 'democracy',
        'opposition', 'ngo', 'bureaucr', 'vote', 'centre and state', 'citizenship', 'judicial',
        'human right', 'corruption', 'niti',
    ]),
    ('Education & Youth', [
        'education', 'school', 'universit', 'college', 'exam', 'student', 'teacher', 'gurukul',
        'literacy', 'youth', 'value education', 'library', 'adult education',
    ]),
    ('Sports & Media', [
        'cricket', 'hockey', 'olympic', 'sport', 'media', 'cinema', 'advertis', 'journalism',
        'television', 't20', 'actor', 'bollywood', 'censor', 'social networking', 'youtube',
    ]),
    ('Personal & Reflective', [
        'my ', 'favourite', 'favorite', 'ambition', 'achievement', 'role model', 'time',
        'parenting', 'family', 'multitasking', 'dress code', 'habit',
    ]),
]


def theme_for(title):
    low = ' ' + title.lower() + ' '
    for theme, words in THEMES:
        for w in words:
            if w in low:
                return theme
    return 'Society & Culture'


def slug(text, band, number):
    base = re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')
    base = re.sub(r'-{2,}', '-', base)[:60].strip('-')
    return (base or 'topic') + '-' + (band or 'topic') + str(number)


def extract(pdf_path):
    txt = subprocess.run(
        ['pdftotext', '-layout', pdf_path, '-'],
        capture_output=True, check=True,
    ).stdout.decode('utf-8', 'replace')

    band = None
    rows = []          # (band, number, title)
    last_index = None

    for raw in txt.splitlines():
        line = raw.replace('\u00ad', '').rstrip()
        if not line.strip():
            continue
        stripped = line.strip()
        upper = stripped.upper()
        # "ABOVE AVERAGE" shares its line with the right-column topic, so the
        # heading is blanked out in place and the rest of the line still parses.
        for name, key in BANDS.items():
            if upper.startswith(name):
                band = key
                line = re.sub(re.escape(name), ' ' * len(name), line, count=1, flags=re.I)
                stripped = line.strip()
                upper = stripped.upper()
                break
        if 'LECTURETTE TOPIC' in upper or not stripped:
            continue

        # Every number that starts a topic column: at the line start, or after
        # two or more spaces. A number inside a title ("370 Article") has a
        # single space before it, so it is not treated as a column start.
        marks = []
        for m in re.finditer(r'(\d{1,3})\s+', line):
            before = line[:m.start()]
            if m.start() == 0 or before.endswith('  '):
                marks.append((m.start(), m.end(), int(m.group(1))))
        if marks:
            for i, (start, end, num) in enumerate(marks):
                stop = marks[i + 1][0] if i + 1 < len(marks) else len(line)
                title = ' '.join(line[end:stop].split())
                if not title:
                    continue
                rows.append((band, num, title))
                last_index = len(rows) - 1
            continue

        # A line with no column number: either a wrapped title, or the tail of
        # the topic just read. Append rather than create a new topic.
        if last_index is None:
            continue
        prev = rows[last_index]
        rows[last_index] = (prev[0], prev[1], (prev[2] + ' ' + stripped).strip())

    return rows


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    pdf = sys.argv[1]
    rows = extract(pdf)

    seen = set()
    out = []
    for band, num, title in rows:
        title = re.sub(r'\s+', ' ', title).strip(' .')
        key = re.sub(r'[^a-z0-9]', '', title.lower())
        if not key or key in seen:
            continue
        seen.add(key)
        out.append({
            'id': slug(title, band, num),
            'title': title,
            'category': theme_for(title),
            'band': band,
            'boards': [],
            'query': title + ' India',
            'addedOn': '2026-10-20',
        })

    with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
        fh.write('\n')

    counts = {}
    for t in out:
        counts[t['category']] = counts.get(t['category'], 0) + 1
    print('read', len(rows), 'rows ->', len(out), 'unique topics ->', os.path.relpath(OUT, ROOT))
    for k in sorted(counts):
        print('  %-24s %d' % (k, counts[k]))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
