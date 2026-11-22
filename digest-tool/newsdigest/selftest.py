"""Checks for the repeat filter, full forms and timeline. Run: python -m newsdigest.selftest"""
from . import draft as D
from . import timeline
from .writer import Writer


def main():
    seen = D.Seen(["Cabinet approves scheme to make India a container manufacturing hub"])
    assert seen.story_state("Cabinet approves scheme to make India a container manufacturing hub") == "same"
    assert seen.story_state("Cabinet approves scheme making India a container manufacturing hub") == "same"
    assert seen.story_state("Cabinet approves Rs 1,856 crore scheme to make India a container manufacturing hub") == "update"
    assert seen.story_state("Navy commissions a new frigate at Mumbai") == "new"

    page = {"headline": "H", "paragraph": "Old sentence about the container scheme approved today. A brand new thing happened in Goa.",
            "key_points": ["Cabinet approves scheme to make India a container manufacturing hub (PIB)", "Fresh point on Goa ports"],
            "also": [], "benefit": [], "advanced": [], "flow": {"steps": []}}
    D.drop_repeats(page, D.Seen(["Old sentence about the container scheme approved today.",
                                 "Cabinet approves scheme to make India a container manufacturing hub"]))
    assert page["paragraph"] == "A brand new thing happened in Goa."
    assert page["key_points"] == ["Fresh point on Goa ports"]

    w = Writer.__new__(Writer)
    w.news_abbr, w.glossary = {}, {"CEA": {"full": "Chief Economic Adviser", "does": ""}, "PM": {"full": "Prime Minister", "does": ""},
                                   "Kremlin": {"full": "Kremlin", "does": "Russia's government"}}
    w.learn_full_forms("The Election Commission began the Special Intensive Revision (SIR) of rolls. "
                       "The Reserve Bank of India (RBI) held rates. NSA (Just Some Words) is wrong.")
    assert w.news_abbr["SIR"] == "Special Intensive Revision" and w.news_abbr["RBI"] == "Reserve Bank of India"
    assert "NSA" not in w.news_abbr
    got = [f["abbr"] for f in w.full_forms_for("PM and CEA Nageswaran on SIR; UN and ZZZ too, Kremlin says")]
    assert got == ["CEA", "SIR"], got

    from . import render
    long = " ".join("Sentence number %d says something about the news today." % i for i in range(40))
    assert 0 < len(render.five_lines(long, "Helvetica", 9.5, 530)) <= 5
    assert render.five_lines(long, "Helvetica", 9.5, 530)[-1].endswith(".")
    twice = "New rules to regulate volatile airfares to be published, Centre tells SC New rules to regulate volatile airfares to be published, Centre tells SC The court heard it."
    assert " ".join(render.five_lines(twice, "Helvetica", 9.5, 900)).count("New rules") == 1
    got = render.articles({"headline": "Lead", "paragraph": "x", "flow": {}, "stories": [{"title": "Lead", "link": "https://a.example/1"}, {"title": "Second one", "para": "y", "link": "javascript:alert(1)"}]})
    assert got[0]["link"] == "https://a.example/1" and got[1] == {"title": "Second one", "para": "y", "link": ""}, got
    forms = render.forms_for({"full_forms": [{"abbr": "SIR", "full": "Special Intensive Revision"}, {"abbr": "CEA", "full": "Chief Economic Adviser"}]}, "SIR dates change")
    assert [f["abbr"] for f in forms] == ["SIR"]

    w.llm_ok = True
    w.llm = lambda prompt, n: ("1: The Cabinet backs shipbuilding in Gujarat for new yards. This costs 999 crore. It should help Indian trade grow faster. "
                               "This is a significant development for the whole country.")
    w._clean_llm = Writer._clean_llm
    c = {"title": "Cabinet backs shipbuilding in Gujarat", "items": [{"title": "x"}], "summary": ""}
    w.explain_headlines([c])
    assert c["summary"] == "The Cabinet backs shipbuilding in Gujarat for new yards. (AI summary from the headlines, verify)", c["summary"]
    assert Writer.story_para(c) == c["summary"]

    a = "Cabinet Approves Rs 1,856 Crore Scheme to Make India a Global Container Manufacturing Hub"
    b = "Cabinet approves Rs 100 billion scheme to boost container manufacturing"
    assert timeline.same_story(a, b)
    assert not timeline.same_story(a, "Cabinet approves new railway line in Odisha")
    assert not timeline.same_story("Iran's New Defence Minister Has 42 Years Of Experience",
                                   "Defence Minister Rajnath Singh meets Tajikistan counterpart")
    common = set()
    ship = "Defence Ministry signs Rs 53,866 crore deal for 8 next generation corvettes for the Navy"
    assert timeline.same_event(("Defence Ministry signs agreements worth over Rs 54k crore to buy 8 next generation corvettes", ship),
                               ("Defence ministry signs Rs 53,866 crore contracts for eight next-generation corvettes", ship), common)
    assert not timeline.same_event(("Pakistan penalised for slow over-rate in final against Sri Lanka", "The ICC fined Pakistan for a slow over-rate."),
                                   ("Pakistan match India's 24-year-old world record after tri-series final", "Pakistan equalled a batting record."), common)
    threads = []
    day = lambda d, h: {"date": d, "pages": [{"name": "Economic", "headline": h, "paragraph": "x", "stories": [{"title": h, "sources": ["PIB"]}]}]}
    timeline.add_edition(threads, day("2026-10-29", a))
    timeline.add_edition(threads, day("2026-10-31", b))
    timeline.add_edition(threads, day("2026-10-31", b))  # the same day built twice must not double
    assert len(threads) == 1 and [e["date"] for e in threads[0]["events"]] == ["2026-10-29", "2026-10-31"]
    print("selftest ok")


if __name__ == "__main__":
    main()
