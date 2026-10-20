#!/usr/bin/env python3
"""Generate the premade lecturette library with a local/cloud Ollama model.

The model is told to avoid invented numbers, dates, schemes and quotations, so
the speeches stay safe to rehearse. Current facts live in the separate
lecturette-data strip, which is refreshed from real news headlines.

Usage:
  python tools/gen-lecturettes.py --model gpt-oss:20b-cloud
  python tools/gen-lecturettes.py --only division-of-states --force
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG = os.path.join(ROOT, "data", "lecturette-topics.json")
OUT = os.path.join(ROOT, "data", "lecturettes.json")
API = "http://127.0.0.1:11434/api/generate"

PROMPT = """You are an SSB (Services Selection Board) lecturette coach.
Write a 3-minute lecturette in simple, natural, everyday English for an SSB candidate.
It will be read aloud, so keep short sentences and a confident spoken rhythm.

Topic: {title}
Category: {category}

Structure and length:
- Introduction: about 70 words. A natural greeting, what the topic means, and a brief background.
- Body: about 200 words. Present situation, the main points, both sides where relevant,
  the Indian context, and one practical step. Adapt to the topic; do not force irrelevant points.
- Conclusion: about 70 words. Summary, future, challenges, precautions, a clear personal
  opinion, and one strong closing sentence.

Hard rules:
- Total 330 to 380 words. Never exceed 400 words.
- Do NOT invent or state statistics, numbers, dates, scheme names, case names, names of
  people, or quotations. Use only general, well-established knowledge. No digits at all.
- No markdown, no headings inside the text, no bullet points in the paragraphs.
- Do not sound like an essay. Sound like a candidate speaking to assessors.

Return ONLY valid JSON with this shape:
{{"intro": ["paragraph", "paragraph"],
  "body": ["paragraph", "paragraph", "paragraph"],
  "conclusion": ["paragraph", "paragraph"],
  "keywords": ["five", "to", "seven", "short", "cues"],
  "opening": "one strong opening sentence",
  "closing": "one strong closing sentence"}}
"""


def words(text):
    return len(re.findall(r"[A-Za-z']+", text))


def ask(model, prompt, timeout=240):
    body = json.dumps({"model": model, "prompt": prompt, "stream": False}).encode("utf-8")
    req = urllib.request.Request(API, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        data = json.loads(res.read().decode("utf-8"))
    return data.get("response", "")


def parse_json(text):
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("no JSON object")
    return json.loads(text[start : end + 1])


def validate(obj):
    for key, lo, hi in (("intro", 1, 3), ("body", 2, 5), ("conclusion", 1, 3)):
        if not isinstance(obj.get(key), list) or not (lo <= len(obj[key]) <= hi):
            raise ValueError(key + " paragraphs")
        for p in obj[key]:
            if not isinstance(p, str) or len(p) < 40:
                raise ValueError(key + " paragraph too short")
    kws = obj.get("keywords")
    if not isinstance(kws, list) or not (4 <= len(kws) <= 8):
        raise ValueError("keywords")
    total = words(" ".join(obj["intro"] + obj["body"] + obj["conclusion"]))
    if not (320 <= total <= 420):
        raise ValueError("word count " + str(total))
    joined = " ".join(obj["intro"] + obj["body"] + obj["conclusion"])
    digits = re.findall(r"\d", joined)
    if digits:
        raise ValueError("contains digits: " + "".join(digits[:8]))
    for bad in ("```", "http://", "https://", "**"):
        if bad in joined:
            raise ValueError("contains " + bad)
    for k in ("opening", "closing"):
        if not isinstance(obj.get(k), str) or len(obj[k]) < 20:
            raise ValueError(k)
    return total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="gpt-oss:20b-cloud")
    ap.add_argument("--only", default="")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--shard", type=int, default=0)
    ap.add_argument("--of", type=int, default=1)
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()

    catalog = json.load(open(CATALOG, encoding="utf-8"))
    existing = {}
    if os.path.exists(OUT):
        for row in json.load(open(OUT, encoding="utf-8")):
            existing[row["id"]] = row

    todo = [t for t in catalog if args.force or t["id"] not in existing]
    if args.only:
        todo = [t for t in todo if t["id"] == args.only]
    if args.of > 1:
        todo = [t for i, t in enumerate(todo) if i % args.of == args.shard]
    if args.limit:
        todo = todo[: args.limit]

    print(f"{len(catalog)} topics, {len(existing)} done, {len(todo)} to write", flush=True)
    for n, topic in enumerate(todo, 1):
        prompt = PROMPT.format(title=topic["title"], category=topic["category"])
        ok = False
        for attempt in range(1, 3):
            try:
                raw = ask(args.model, prompt)
                obj = parse_json(raw)
                total = validate(obj)
                row = {
                    "id": topic["id"],
                    "title": topic["title"],
                    "category": topic["category"],
                    "boards": topic.get("boards", []),
                    "query": topic.get("query", ""),
                    "speech": {k: obj[k] for k in ("intro", "body", "conclusion")},
                    "keywords": obj["keywords"],
                    "opening": obj["opening"],
                    "closing": obj["closing"],
                    "words": total,
                }
                existing[topic["id"]] = row
                ok = True
                break
            except Exception as exc:
                print(f"  retry {attempt}: {topic['id']}: {exc}", flush=True)
                time.sleep(1)
        if not ok:
            print(f"FAILED {topic['id']}", flush=True)
            continue
        ordered = [existing[t["id"]] for t in catalog if t["id"] in existing]
        tmp = args.out + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(ordered, fh, ensure_ascii=False, indent=1)
        os.replace(tmp, args.out)
        print(f"[{n}/{len(todo)}] {topic['id']} {total}w", flush=True)
    print("done:", len(existing), "lecturettes", flush=True)


if __name__ == "__main__":
    main()
