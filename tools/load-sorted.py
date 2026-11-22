#!/usr/bin/env python3
"""Replaces the app's practice data with the owner's sorted files. Nothing else is kept.

  python tools/load-sorted.py D:/apk/SSB-Data/new "C:/.../Master Reference Guide.pdf"

From the folder: every .xlsx with a Word or WAT column (WAT), the first sheet with a Situation column (SRT),
and "PPDT pictures/" (used by both PPDT and TAT). From the PDF: the lecture topics, which carry no script.
Run the script's own check first: python tools/load-sorted.py test
"""
import glob
import json
import os
import random
import re
import shutil
import sys
import zipfile
from xml.etree import ElementTree as ET

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DATA = os.path.join(ROOT, "data")
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
SET_SIZE = 60
REMOVE = ["dictionary.json", "dictionary-meta.json", "lectures.json", "lecturette-topics.json", "lecturette-topics-extra.json",
          "lecturettes.part0.json", "lecturettes.part1.json", "lecturettes.part2.json"]


def first_sheet(path):
    """Rows of the first sheet, each a {column letter: text} dict."""
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            shared = ["".join(t.text or "" for t in si.iter(NS + "t")) for si in ET.fromstring(z.read("xl/sharedStrings.xml"))]
        rows = []
        for row in ET.fromstring(z.read("xl/worksheets/sheet1.xml")).iter(NS + "row"):
            cells = {}
            for c in row.iter(NS + "c"):
                v = c.find(NS + "v")
                text = shared[int(v.text)] if c.get("t") == "s" and v is not None else "".join(t.text or "" for t in c.iter(NS + "t")) or (v.text if v is not None else "")
                cells[re.match(r"[A-Z]+", c.get("r")).group()] = str(text).strip()
            if any(cells.values()):
                rows.append(cells)
    return rows


def column(path, heading):
    """The cells under the first heading that matches; [] when the sheet has no such column."""
    rows = first_sheet(path)
    col = next((k for k, v in rows[0].items() if re.search(heading, v, re.I)), None) if rows else None
    return [r[col] for r in rows[1:] if r.get(col)] if col else []


def unique(items):
    seen, out = set(), []
    for x in items:
        k = re.sub(r"\s+", " ", x).lower()
        if k not in seen:
            seen.add(k)
            out.append(re.sub(r"\s+", " ", x))
    return out


def pdf_topics(path):
    """'1. INTERNATIONAL AFFAIRS' opens a category; '1. Title' then its description until the next title."""
    import pymupdf
    lines = [l.strip() for page in pymupdf.open(path) for l in page.get_text().splitlines() if l.strip()]
    start = next(i for i, l in enumerate(lines) if re.fullmatch(r"1\. [A-Z][A-Z \-]+", l))
    topics, cat, cur = [], "", None
    for l in lines[start:]:
        m = re.fullmatch(r"\d+\. ([A-Z][A-Z \-]+)", l)
        if m:
            cat, cur = m.group(1).title().replace("-Related", "-Related"), None
            continue
        if re.fullmatch(r"\d+ Topics", l):
            continue
        m = re.fullmatch(r"\d+\. (.+)", l)
        if m:
            cur = {"topic": m.group(1), "category": cat, "about": ""}
            topics.append(cur)
        elif cur:
            cur["about"] = (cur["about"] + " " + l).strip()
    return topics


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def save(name, value):
    with open(os.path.join(DATA, name), "w", encoding="utf-8") as f:
        json.dump(value, f, indent=2, ensure_ascii=False)


def sets(prefix, label, key, items):
    return [{"id": f"{prefix}-{i // SET_SIZE + 1}", "name": f"{label} set {i // SET_SIZE + 1}", key: items[i:i + SET_SIZE]}
            for i in range(0, len(items), SET_SIZE)]


def load(folder, pdf):
    words, situations = [], []
    for path in sorted(glob.glob(os.path.join(folder, "*.xlsx"))):
        found_srt = column(path, r"situation|\bsrt\b")
        found_wat = [] if found_srt else column(path, r"^(word|wat\b)")
        situations += found_srt
        words += found_wat
        print(os.path.basename(path), "WAT", len(found_wat), "SRT", len(found_srt))
    words, situations = unique(words), unique(situations)
    topics = pdf_topics(pdf)
    pics_dir = os.path.join(folder, "PPDT pictures")
    files = sorted(f for f in os.listdir(pics_dir) if re.search(r"\.(jpe?g|png)$", f, re.I))
    assert words and situations and files and len(topics) == 65, (len(words), len(situations), len(files), len(topics))

    rng = random.Random(1)  # the written order put near-identical items together; the built-in sets are mixed once
    rng.shuffle(words)
    rng.shuffle(situations)
    for name, key, value in (("wat.json", "words", sets("wat", "WAT", "words", words)),
                             ("srt.json", "situations", sets("srt", "SRT", "situations", situations)),
                             ("tat.json", "scenes", [])):
        with open(os.path.join(DATA, name), encoding="utf-8") as f:
            pack = json.load(f)
        pack["sets"] = value
        save(name, pack)
    save("lecturettes.json", [{"id": slug(t["topic"]), "topic": t["topic"], "category": t["category"], "theme": t["category"],
                               "about": t["about"], "boards": [], "source": "topic",
                               "query": t["topic"] + ("" if "india" in t["topic"].lower() else " India")} for t in topics])
    shutil.rmtree(os.path.join(DATA, "ppdt"), ignore_errors=True)
    os.makedirs(os.path.join(DATA, "ppdt"))
    for f in files:
        shutil.copy2(os.path.join(pics_dir, f), os.path.join(DATA, "ppdt", f))
    save("ppdt.json", [{"id": os.path.splitext(f)[0], "file": f, "title": "Practice picture", "source": "Owner's sorted set",
                        "license": "User-supplied practice picture. Check rights before redistributing."} for f in files])
    for name in ("tat-classic.json", "tat-images.json"):
        save(name, [])
    for name in REMOVE:
        p = os.path.join(DATA, name)
        if os.path.exists(p):
            os.remove(p)
    print(f"WAT {len(words)}, SRT {len(situations)}, pictures {len(files)}, lecture topics {len(topics)}")


if __name__ == "__main__":
    if sys.argv[1:] == ["test"]:
        assert unique(["Duty ", "duty", "Hope"]) == ["Duty", "Hope"]
        assert slug("India's Role, Now") == "india-s-role-now"
        assert len(sets("wat", "WAT", "words", list("x" * 125))) == 3
        print("load-sorted test ok")
    elif len(sys.argv) == 3:
        load(sys.argv[1], sys.argv[2])
    else:
        raise SystemExit(__doc__)
