"""The news timeline: every story gets a thread, and a later story about the same thing is appended
under it as a follow-up. Kept in timeline/timeline.json; timeline/dashboard.html is the screen for it."""
import json
import os
import re

from . import util
from .config import load_json, save_json

DASHBOARD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dashboard.html")
# words that appear in stories of every kind, so sharing them says nothing about being the same story
GENERIC = set("""government minister ministers court supreme high state states centre chief prime president
report reports news today year years day days week month first second last big major people world country
countries national global plan plans talks meeting meet set make makes made move calls call seeks amid
crore lakh billion million percent rise rises fall falls market markets stock stocks sensex nifty ends
election elections party congress bjp modi trump pakistan china russia ukraine bangladesh nepal delhi
approves approved announces announced launches launch launched scheme boost""".split())


FOLLOW_UP_DAYS = 21  # a story silent for longer than this starts a new thread


def _keys(title):
    return {t for t in util.tokens(title) if t not in GENERIC and not t.isdigit()}


def same_story(a, b, common=()):
    """One thread when the headlines share two rare words, or three telling ones, and most of the shorter one.
    `common` holds the words that turn up in many of the stories on file, whatever they are about."""
    ka, kb = _keys(a), _keys(b)
    shared = ka & kb
    return (len(shared - set(common)) >= 2 and len(shared) >= 2 or len(shared) >= 4) and len(shared) / max(1, min(len(ka), len(kb))) >= 0.5


def same_event(a, b, common):
    """Two stories of one edition about one event: same_story, and either two rare words in
    the headlines or most of the opening of their articles in common. `a`, `b` are (title, text)."""
    if not same_story(a[0], b[0], common):
        return False
    if len((_keys(a[0]) & _keys(b[0])) - set(common)) >= 2:
        return True
    return bool(a[1] and b[1]) and util.similarity(a[0] + " " + a[1][:400], b[0] + " " + b[1][:400]) >= 0.4


def common_words(threads, titles):
    """Words in more than 0.5% of all headlines (at least 5), which say little about which story this is."""
    count = {}
    all_titles = [e["headline"] for t in threads for e in t["events"]] + list(titles)
    for h in all_titles:
        for w in _keys(h):
            count[w] = count.get(w, 0) + 1
    return {w for w, n in count.items() if n > max(5, len(all_titles) * 0.005)}


def _days(a, b):
    return abs((util.parse_date(a) - util.parse_date(b)).days)


def _events(draft):
    """(section, headline, what it said, sources, link) for each story on the pages of one edition."""
    for p in draft.get("pages", []):
        section = p.get("section") or p["name"].split(":")[0].replace(" (continued)", "")
        stories = p.get("stories") or []
        if not stories:
            continue
        lead = stories[0]
        yield section, p["headline"], p.get("paragraph", ""), lead.get("sources", []), lead.get("link", "")
        cards = {str(s).partition("\n")[0]: str(s).partition("\n")[2] for s in (p.get("flow") or {}).get("steps", [])}
        for s in stories[1:]:
            title = util.strip_source_suffix(s["title"])
            yield section, title, cards.get(title, ""), s.get("sources", []), s.get("link", "")


def add_edition(threads, draft):
    """Append one edition. An edition already in the file is replaced, so rebuilding a day cannot double it."""
    date = draft["date"]
    for t in threads:
        t["events"] = [e for e in t["events"] if e["date"] != date]
    threads[:] = [t for t in threads if t["events"]]
    stories = list(_events(draft))
    common = common_words(threads, [s[1] for s in stories])
    for section, title, text, sources, link in stories:
        if re.match(r"No major story", title):
            continue
        event = {"date": date, "headline": title, "text": text, "sources": sources, "link": link}
        hit = next((t for t in reversed(threads) if _days(t["events"][-1]["date"], date) <= FOLLOW_UP_DAYS
                    and any(same_story(title, e["headline"], common) for e in t["events"][-3:])), None)
        if hit:
            if not any(e["date"] == date and same_story(title, e["headline"], common) for e in hit["events"]):
                hit["events"].append(event)
        else:
            threads.append({"id": f"{date}-{len(threads)}", "section": section, "title": title, "events": [event]})
    return threads


def _paths(cfg):
    return os.path.join(cfg["paths"]["timeline"], "timeline.json"), os.path.join(cfg["paths"]["timeline"], "dashboard.html")


def write_dashboard(cfg, threads):
    """The screen is one self-contained file, so it opens from the folder with no server and no internet."""
    with open(DASHBOARD, encoding="utf-8") as f:
        page = f.read()
    data = json.dumps(threads, ensure_ascii=False).replace("</", "<\\/")
    with open(_paths(cfg)[1], "w", encoding="utf-8") as f:
        f.write(page.replace("/*TIMELINE*/[]", data))


def record(cfg, draft):
    path = _paths(cfg)[0]
    threads = load_json(path, {"threads": []})["threads"]
    add_edition(threads, draft)
    save_json(path, {"threads": threads})
    write_dashboard(cfg, threads)
    return threads


def rebuild(cfg):
    """Start again from every draft in drafts/, oldest first."""
    threads = []
    folder = cfg["paths"]["drafts"]
    for name in sorted(os.listdir(folder)):
        if name.endswith(".json"):
            add_edition(threads, load_json(os.path.join(folder, name)))
    save_json(_paths(cfg)[0], {"threads": threads})
    write_dashboard(cfg, threads)
    return threads
