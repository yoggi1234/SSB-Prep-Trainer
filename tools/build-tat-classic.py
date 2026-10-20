#!/usr/bin/env python
"""Build the classic TAT picture set.

    python tools/build-tat-classic.py --pdf <file.pdf> --folder <dir> [--out data/tat-classic]

Reads every picture inside the PDF plus every picture file in the folder,
normalises each to a JPEG at most 1000 px on the long side, and drops
near-duplicates by dHash (so the same plate arriving twice, once from the PDF
and once from the folder, is stored only once).

Every record keeps where it came from. The set is user-supplied practice
material: check the rights before redistributing it.
"""
import argparse
import hashlib
import io
import json
import os

from PIL import Image

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    PdfReader = None

EXTS = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tif', '.tiff'}
MAX_SIDE = 1000
QUALITY = 85
HAMMING = 6


def dhash(img):
    small = img.convert('L').resize((9, 8), Image.LANCZOS)
    px = list(small.getdata())
    bits = 0
    for row in range(8):
        for col in range(8):
            left = px[row * 9 + col]
            right = px[row * 9 + col + 1]
            bits = (bits << 1) | (1 if left > right else 0)
    return bits


def distance(a, b):
    return bin(a ^ b).count('1')


def read_pdf(path):
    out = []
    if not PdfReader:
        print('  ! pypdf missing: skipping the PDF')
        return out
    reader = PdfReader(path)
    for page_no, page in enumerate(reader.pages, 1):
        try:
            images = list(page.images)
        except Exception as err:  # a broken page must not stop the build
            print('  ! page', page_no, err)
            continue
        for i, im in enumerate(images, 1):
            try:
                picture = Image.open(io.BytesIO(im.data))
                picture.load()
            except Exception as err:
                print('  ! page', page_no, 'image', i, err)
                continue
            out.append({
                'source': 'CarePatron TAT PDF',
                'title': 'Classic TAT plate %d' % (len(out) + 1),
                'image': picture,
                'origin': '%s#page=%d&image=%d' % (os.path.basename(path), page_no, i),
            })
    return out


def read_folder(path):
    out = []
    for name in sorted(os.listdir(path)):
        full = os.path.join(path, name)
        if not os.path.isfile(full) or os.path.splitext(name)[1].lower() not in EXTS:
            continue
        try:
            picture = Image.open(full)
            picture.load()
        except Exception as err:
            print('  !', name, err)
            continue
        out.append({
            'source': 'Your TAT folder',
            'title': os.path.splitext(name)[0][:80],
            'image': picture,
            'origin': name,
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pdf')
    ap.add_argument('--folder')
    ap.add_argument('--out', default=os.path.join('data', 'tat-classic'))
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    items = []
    if args.pdf:
        items += read_pdf(args.pdf)
    if args.folder:
        items += read_folder(args.folder)

    kept = []
    hashes = []
    for item in items:
        img = item['image']
        if img.width < 120 or img.height < 120:
            print('  - skip tiny', item['origin'], img.size)
            continue
        img = img.convert('RGB')
        img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
        h = dhash(img)
        if any(distance(h, other) <= HAMMING for other in hashes):
            print('  - duplicate', item['origin'])
            continue
        hashes.append(h)
        buf = io.BytesIO()
        img.save(buf, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
        data = buf.getvalue()
        sha = hashlib.sha256(data).hexdigest()
        name = 'classic-%03d.jpg' % (len(kept) + 1)
        with open(os.path.join(args.out, name), 'wb') as fh:
            fh.write(data)
        kept.append({
            'id': 'classic-%03d' % len(kept),
            'file': name,
            'title': item['title'],
            'source': item['source'],
            'origin': item['origin'],
            'license': 'User-supplied practice picture. Check rights before redistributing.',
            'sha256': sha,
            'width': img.width,
            'height': img.height,
            'bytes': len(data),
        })

    manifest = os.path.join(os.path.dirname(args.out.rstrip('\\/')), 'tat-classic.json')
    with open(manifest, 'w', encoding='utf-8') as fh:
        json.dump(kept, fh, indent=1, ensure_ascii=False)
    print('kept %d of %d pictures -> %s' % (len(kept), len(items), args.out))
    print('manifest ->', manifest)


if __name__ == '__main__':
    main()
