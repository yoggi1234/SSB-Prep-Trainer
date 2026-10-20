#!/usr/bin/env python3
"""Build data/lecturettes.json - the lecturette catalogue the app ships.

Inputs (all in data/):
  lectures.json            12 hand-written lecturettes with verified-style facts
  lecturettes.part*.json   drafted spoken scripts (may repeat an id)
  lecturette-topics.json   137 categorised SSB topics, the master list

Output: data/lecturettes.json, one entry per topic, in this order:
  1. hand-written entries (rich: meaning/history, pros/cons, facts)
  2. drafted scripts that have no hand-written entry
  3. outline-only topics - a speaking scaffold, no invented content

Nothing here invents facts. A drafted script keeps the empty fact/statistic
fields it came with, and the app fetches current points from the news feed at
run time. An outline topic carries only questions to answer aloud.

Run: python tools/build-lecturettes.py
"""
import glob
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')


def load(name):
    with open(os.path.join(DATA, name), encoding='utf-8') as fh:
        return json.load(fh)


def clean(text):
    """Normalise the typographic characters the drafting model liked."""
    s = str(text or '')
    s = s.replace('\u2011', '-').replace('\u2010', '-').replace('\u2013', '-').replace('\u2014', '-')
    s = s.replace('\u2019', "'").replace('\u2018', "'")
    s = s.replace('\u201c', '"').replace('\u201d', '"')
    s = s.replace('\u00a0', ' ')
    s = re.sub(r'\s+', ' ', s).strip()
    return s


STOP = set(
    'the a an of in on for and or to with at by from as is are was were be been its it this that '
    'these those india indian into over under about their our my your his her not no do does did '
    'has have had can could should would will may might must than then them they we you'.split()
)


def keywords_for(topic, category):
    words = [w for w in re.findall(r"[A-Za-z][A-Za-z'-]+", topic.lower()) if w not in STOP and len(w) > 3]
    out = []
    for w in words:
        if w not in out:
            out.append(w)
    for w in re.findall(r"[A-Za-z][A-Za-z'-]+", category.lower()):
        if w not in STOP and len(w) > 3 and w not in out:
            out.append(w)
    return out[:6]


# The scaffold. Each line is a thing to say, not a claim about the world.
CUES = {
    'Defence & Security': {
        'meaning': 'Define {t} in one sentence: what it is, and who it protects.',
        'history': 'Two lines of background: when it started and what changed it.',
        'origin': 'Why it is being discussed now, or why the board picked it.',
        'present': 'Present state: what exists today, and where it still falls short.',
        'parallels': 'Compare it with one other country or one earlier programme.',
        'advantages': ['It strengthens national security and reduces dependence.',
                       'It builds domestic industry, skills and jobs.',
                       'It improves speed of decision and response.'],
        'disadvantages': ['It is expensive, and results take years.',
                          'Technology risk and supply-chain gaps remain.',
                          'Other urgent needs compete for the same money.'],
        'impact': 'Close with the impact on India: security, economy, or the soldier on the ground.',
        'future': 'What may change in the next ten years.',
        'challenges': ['Money and long delivery timelines.', 'Technology and talent gaps.', 'Coordination between agencies and industry.'],
        'precautions': ['Independent audit of spending and outcomes.', 'Protect critical data and supply chains.', 'Plan for the human cost of change.'],
        'opinion': 'Give one clear opinion, then the reason behind it.',
    },
    'International Relations': {
        'meaning': 'Define {t} and say which countries are involved.',
        'history': 'Two lines: when the relationship or dispute began.',
        'origin': 'Why it matters to India at this moment.',
        'present': 'Present status: agreements, trade, disputes or recent visits.',
        'parallels': 'Compare it with one other bilateral relationship India manages.',
        'advantages': ['Trade, technology and market access.',
                       'Strategic balance and diplomatic options.',
                       'People-to-people and cultural links.'],
        'disadvantages': ['Dependence on one partner.', 'Unresolved disputes limit trust.', 'Domestic politics can undo progress.'],
        'impact': 'Say what it means for India: security, trade, or standing in the world.',
        'future': 'What the next few years may bring.',
        'challenges': ['Border and sovereignty questions.', 'Trade imbalance.', 'Pressure from other powers.'],
        'precautions': ['Keep channels of talk open.', 'Diversify partners and supply chains.', 'Separate economics from security where possible.'],
        'opinion': 'End with your own balanced view of the relationship.',
    },
    'Economy & Business': {
        'meaning': 'Define {t} in plain words and give one everyday example.',
        'history': 'Two lines: when the policy, sector or idea began in India.',
        'origin': 'The problem it was meant to solve.',
        'present': 'Present state: size, growth, and who it affects.',
        'parallels': 'Compare it with one other sector, state or country.',
        'advantages': ['Jobs and income.', 'Efficiency and lower prices.', 'Revenue for public services.'],
        'disadvantages': ['Uneven gain between rich and poor regions.', 'Pressure on workers or the environment.', 'Short-term pain before long-term gain.'],
        'impact': 'State the effect on India: growth, employment, or prices.',
        'future': 'Where the trend is heading.',
        'challenges': ['Access and affordability.', 'Regulation keeping pace with change.', 'Skills and infrastructure.'],
        'precautions': ['Protect the worker during transition.', 'Make rules simple and predictable.', 'Measure outcomes, not just spending.'],
        'opinion': 'Give a clear, practical opinion to close.',
    },
    'Science & Technology': {
        'meaning': 'Define {t} in simple words, without jargon.',
        'history': 'Two lines: when it appeared and how fast it grew.',
        'origin': 'The need or discovery that started it.',
        'present': 'Present use: where it is already working in India.',
        'parallels': 'Compare it with the technology it replaced.',
        'advantages': ['Speed, scale and accuracy.', 'New services and jobs.', 'Better access in remote areas.'],
        'disadvantages': ['Cost of adoption.', 'Privacy and security risk.', 'A gap between those who have it and those who do not.'],
        'impact': 'Say what it changes for India: economy, security, or daily life.',
        'future': 'What the next version or next five years may look like.',
        'challenges': ['Affordable access.', 'Skilled people.', 'Clear, fair rules.'],
        'precautions': ['Protect personal data.', 'Keep a human check on automated decisions.', 'Train people before deploying.'],
        'opinion': 'End with your own judgement on its value to India.',
    },
    'Environment & Geography': {
        'meaning': 'Define {t} and say where it is seen.',
        'history': 'Two lines: how the situation developed.',
        'origin': 'The human activity or natural cause behind it.',
        'present': 'Present status: the numbers or events you remember.',
        'parallels': 'Compare it with one other region or one earlier episode.',
        'advantages': ['Any gain for people or the economy.', 'Cost saved over the long term.', 'Health and livelihood benefits.'],
        'disadvantages': ['Loss of land, water or forest.', 'Cost to farmers and the poor.', 'Slow, uncertain results.'],
        'impact': 'Say what it means for India: food, water, health or security.',
        'future': 'What may happen if nothing changes.',
        'challenges': ['Money and coordination.', 'Habits that are hard to change.', 'Balancing growth with protection.'],
        'precautions': ['Plan before, not after, the damage.', 'Involve local communities.', 'Enforce the rules that already exist.'],
        'opinion': 'Close with a practical opinion.',
    },
    'Polity & Governance': {
        'meaning': 'Define {t}: what it is and who it applies to.',
        'history': 'Two lines: the law, debate or event it comes from.',
        'origin': 'The problem it was created to solve.',
        'present': 'Present state: how it works today, and the criticism it faces.',
        'parallels': 'Compare it with one other law, scheme or country.',
        'advantages': ['Fairness and clear rules.', 'Accountability of those in power.', 'Protection for the weaker section.'],
        'disadvantages': ['Slow implementation.', 'Political misuse.', 'Cost and complexity for ordinary people.'],
        'impact': 'State the effect on citizens and on trust in institutions.',
        'future': 'What reform may come next.',
        'challenges': ['Implementation on the ground.', 'Awareness among people.', 'Political consensus.'],
        'precautions': ['Independent review.', 'Simple procedures.', 'Public information in local languages.'],
        'opinion': 'End with a balanced opinion in one or two sentences.',
    },
    'Society & Culture': {
        'meaning': 'Define {t} as people experience it, with one example.',
        'history': 'Two lines: how attitudes or practice changed over time.',
        'origin': 'The custom, belief or pressure that keeps it alive.',
        'present': 'Present picture: what is changing, and what is not.',
        'parallels': 'Compare the city with the village, or India with one other country.',
        'advantages': ['What it adds to family or community life.', 'Freedom of choice.', 'A wider view of other people.'],
        'disadvantages': ['Pressure on those who differ.', 'Confusion between generations.', 'Weak protection for the vulnerable.'],
        'impact': 'Say what it means for Indian society and the young.',
        'future': 'Which way the trend is likely to go.',
        'challenges': ['Attitudes take time to change.', 'Law and custom often disagree.', 'The poor feel change first and worst.'],
        'precautions': ['Respect, not judgement.', 'Education and open talk.', 'Protection for women and children.'],
        'opinion': 'Give your own balanced view at the end.',
    },
    'Sports & Media': {
        'meaning': 'Define {t} and say who follows it.',
        'history': 'Two lines: how it began and grew.',
        'origin': 'Why it draws attention now.',
        'present': 'Present state: reach, money and the problems inside it.',
        'parallels': 'Compare it with one other sport or medium.',
        'advantages': ['Careers, fitness and national pride.', 'Information and entertainment.', 'Money and infrastructure.'],
        'disadvantages': ['Commercial pressure.', 'Bad behaviour or false information.', 'Neglect of other sports or issues.'],
        'impact': 'Say what it does to Indian youth and public attention.',
        'future': 'What may change in the next few years.',
        'challenges': ['Fair play and integrity.', 'Money at the grassroots.', 'Balance with studies or work.'],
        'precautions': ['Strong, honest regulation.', 'Support at the school level.', 'Teach people to question what they see.'],
        'opinion': 'Close with your own view.',
    },
    'Education & Youth': {
        'meaning': 'Define {t} and say who it serves.',
        'history': 'Two lines: the policy or change behind it.',
        'origin': 'The gap it was meant to fill.',
        'present': 'Present state: what works and what does not.',
        'parallels': 'Compare a government and a private option, or two states.',
        'advantages': ['Skills and employability.', 'Social mobility.', 'A more informed citizen.'],
        'disadvantages': ['Cost and access.', 'Quality varies widely.', 'Mismatch with jobs.'],
        'impact': 'State the effect on India: youth, jobs, or national capability.',
        'future': 'What the next decade may demand.',
        'challenges': ['Teacher quality.', 'Affordability.', 'Keeping up with technology.'],
        'precautions': ['Focus on fundamentals.', 'Train teachers.', 'Measure learning, not just enrolment.'],
        'opinion': 'End with a clear opinion on what should change.',
    },
    'Personal & Reflective': {
        'meaning': 'Open with a short, honest definition or memory of {t}.',
        'history': 'Two lines: how this has changed for you over the years.',
        'origin': 'The person or moment that shaped it.',
        'present': 'Present picture: what it means to you today.',
        'parallels': 'Compare your view with what most people assume.',
        'advantages': ['What it gave you.', 'What you learned.', 'How it steadied you.'],
        'disadvantages': ['What it cost you.', 'A mistake you made.', 'What you would do differently.'],
        'impact': 'Say what it changed in your outlook or choices.',
        'future': 'What you intend to do about it.',
        'challenges': ['Pressure to conform.', 'Fear of failure.', 'Time and priorities.'],
        'precautions': ['Keep it honest, not dramatic.', 'One example is enough.', 'End on what you will do.'],
        'opinion': 'Close with the belief you actually hold.',
    },
}


def outline_entry(topic):
    """A scaffold for a topic with no drafted script: prompts, never claims."""
    cat = topic.get('category') or 'Society & Culture'
    cues = CUES.get(cat, CUES['Society & Culture'])
    title = clean(topic.get('title'))
    return {
        'id': topic['id'],
        'topic': title,
        'theme': cat,
        'category': cat,
        'boards': topic.get('boards') or [],
        'query': topic.get('query') or title,
        'outline': True,
        'source': 'outline',
        'intro': {
            'meaning': cues['meaning'].format(t=title),
            'history': cues['history'],
            'origin': cues['origin'],
        },
        'body': {
            'present': cues['present'],
            'parallels': cues['parallels'],
            'advantages': list(cues['advantages']),
            'disadvantages': list(cues['disadvantages']),
            'impact': cues['impact'],
        },
        'conclusion': {
            'future': cues['future'],
            'challenges': list(cues['challenges']),
            'precautions': list(cues['precautions']),
            'opinion': cues['opinion'],
        },
        'fact': '',
        'statistic': '',
        'quote': {'text': '', 'who': ''},
        'facts': [],
        'keywords': keywords_for(title, cat),
    }


def from_script(rec):
    """Turn a drafted spoken script into the app's lecturette shape.

    The script stays whole under `speech` so the run screen can show what was
    drafted; the outline fields point at the same paragraphs so the phase cues
    still make sense. No facts are added - the drafting model supplied none.
    """
    speech = rec.get('speech') or {}
    intro = [clean(p) for p in speech.get('intro') or [] if clean(p)]
    body = [clean(p) for p in speech.get('body') or [] if clean(p)]
    concl = [clean(p) for p in speech.get('conclusion') or [] if clean(p)]
    topic = clean(rec.get('title'))
    cat = rec.get('category') or 'Society & Culture'
    return {
        'id': rec['id'],
        'topic': topic,
        'theme': cat,
        'category': cat,
        'boards': rec.get('boards') or [],
        'query': rec.get('query') or topic,
        'outline': False,
        'source': 'draft',
        'speech': {'intro': intro, 'body': body, 'conclusion': concl},
        'intro': {
            'meaning': intro[0] if intro else '',
            'history': '',
            'origin': intro[1] if len(intro) > 1 else '',
        },
        'body': {
            'present': body[0] if body else '',
            'parallels': body[1] if len(body) > 1 else '',
            'advantages': [],
            'disadvantages': [],
            'impact': body[2] if len(body) > 2 else '',
        },
        'conclusion': {
            'future': concl[0] if concl else '',
            'challenges': [],
            'precautions': [],
            'opinion': concl[1] if len(concl) > 1 else '',
        },
        # No figure, quote or fact: the app must not imply one was checked.
        'fact': '',
        'statistic': '',
        'quote': {'text': '', 'who': ''},
        'facts': [],
        'keywords': [clean(k) for k in rec.get('keywords') or []][:7],
        'opening': clean(rec.get('opening')),
        'closing': clean(rec.get('closing')),
        'words': rec.get('words') or 0,
    }


def target_distance(n):
    """Drafted scripts should sit in the 350-420 word speaking window."""
    return 0 if 350 <= n <= 420 else min(abs(n - 350), abs(n - 420))


def title_key(title):
    """Comparison key: "Nano technology" and "Nano Technology." are one topic."""
    return re.sub(r'[^a-z0-9]', '', str(title or '').lower())


def load_topics():
    """The hand-filed catalogue plus the user's imported PDF list.

    The PDF list is second: where a title already exists it is skipped, so the
    curated entry (with its theme and any script) is the one that survives.
    """
    topics = load('lecturette-topics.json')
    try:
        extra = load('lecturette-topics-extra.json')
    except FileNotFoundError:
        extra = []
    seen = {title_key(t.get('title')) for t in topics}
    for t in extra:
        k = title_key(t.get('title'))
        if not k or k in seen:
            continue
        seen.add(k)
        topics.append({
            'id': t['id'],
            'title': t['title'],
            'category': t.get('category') or 'Society & Culture',
            'boards': t.get('boards') or [],
            'query': t.get('query') or (t['title'] + ' India'),
            'band': t.get('band') or '',
        })
    return topics


def main():
    curated = load('lectures.json')
    topics = load_topics()
    topic_by_id = {t['id']: t for t in topics}

    # The three parallel drafting runs overlap; keep the best-ranked copy only.
    drafts = {}
    for part in sorted(glob.glob(os.path.join(DATA, 'lecturettes.part*.json'))):
        for rec in load(os.path.basename(part)):
            prev = drafts.get(rec['id'])
            if prev is None or target_distance(rec.get('words') or 0) < target_distance(prev.get('words') or 0):
                drafts[rec['id']] = rec

    out = []
    seen = set()

    # Hand-written entries use "Defence and Security"; the catalogue uses "&"
    # so the filter list has one label per theme rather than two close ones.
    theme_map = {
        'Defence and Security': 'Defence & Security',
        'Science and Technology': 'Science & Technology',
        'Economy and Business': 'Economy & Business',
        'Polity and Governance': 'Polity & Governance',
        'Society and Culture': 'Society & Culture',
        'Environment and Geography': 'Environment & Geography',
        'Education and Youth': 'Education & Youth',
        'Sports and Media': 'Sports & Media',
    }

    for rec in curated:
        entry = dict(rec)
        theme = theme_map.get(entry.get('theme') or '', entry.get('theme') or '')
        entry['theme'] = theme
        entry['category'] = theme
        entry.setdefault('query', entry.get('topic') or '')
        entry['source'] = 'curated'
        entry['outline'] = False
        if not entry.get('keywords'):
            entry['keywords'] = keywords_for(entry.get('topic') or '', theme)
        out.append(entry)
        seen.add(entry['id'])

    for tid, rec in drafts.items():
        if tid in seen:
            continue
        out.append(from_script(rec))
        seen.add(tid)

    have_titles = {title_key(e.get('topic')) for e in out}
    for t in topics:
        if t['id'] in seen or title_key(t['title']) in have_titles:
            continue
        entry = outline_entry(t)
        if t.get('band'):
            entry['band'] = t['band']
        out.append(entry)
        seen.add(t['id'])
        have_titles.add(title_key(t['title']))

    # Every topic in the master list must appear exactly once, in a stable order.
    out.sort(key=lambda e: e['topic'].lower())

    path = os.path.join(DATA, 'lecturettes.json')
    with open(path, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
        fh.write('\n')

    counts = {}
    for e in out:
        counts[e['source']] = counts.get(e['source'], 0) + 1
    missing = [t['id'] for t in topics if t['id'] not in {e['id'] for e in out}]
    print('wrote', path)
    print('entries', len(out), counts)
    print('master topics covered', len(topics) - len(missing), 'of', len(topics))
    if missing:
        print('MISSING', missing)


if __name__ == '__main__':
    main()
