'use strict';

/*
 * Curated SSB lecturette topics.
 *
 * Every entry is authored so the app can lay it straight into the three-minute
 * pattern: 30 seconds of intro (meaning, history, origin), two minutes of body
 * (present state, parallel analysis, advantages, disadvantages, fact, figure,
 * impact) and 30 seconds of conclusion (future, challenges, precautions,
 * personal opinion).
 *
 * Figures are ordinary, publicly reported numbers. Anything that moves fast is
 * marked "reported" and the app reminds the candidate to check the latest value
 * before quoting it at a board.
 *
 * The generated output is data/lectures.json - see tools/build-lectures.js.
 */

module.exports = [
  {
    id: 'ai-in-warfare',
    topic: 'Use of Artificial Intelligence in Modern Warfare',
    theme: 'Defence and Security',
    boards: ['Prayagraj (Allahabad)', 'Bhopal', 'Bangalore'],
    evidence: 'coaching compilation, 2025-26',
    sources: ['https://ncaacademy.com/ssb-lecturette-topics-2026-150-topics-with-tips/'],
    keywords: ['speed', 'accuracy', 'accountability'],
    intro: {
      meaning:
        'Artificial intelligence means teaching a machine to do work that normally needs a human mind - recognising a face, reading a map, choosing a target. In war it is the machine that watches, decides faster and acts on our behalf.',
      history:
        'The idea is old. It began in the 1950s with code-breaking and early missile defence. It stayed slow for sixty years. Then cheap computing power and deep learning arrived after 2012, and machines suddenly began to see and sort better than people.',
      origin:
        'The push came from two plain problems. War now produces more information than any team of analysts can read, and an enemy who decides first usually wins. Drones alone send back more video than humans can ever watch.'
    },
    body: {
      present:
        'Today AI watches surveillance feeds, identifies targets, flies drone swarms, defends networks and moves supplies. The war in Ukraine is the first big live test: AI-assisted targeting and drones that navigate without a pilot. India has a Defence AI Council and is building AI into surveillance and cyber defence.',
      parallels:
        'Every age has had one invention that rewrote war - gunpowder, the tank, the aircraft, the atom bomb. Each one first looked like a tool and then demanded new rules. AI is travelling the same road, only faster.',
      advantages: [
        'Decisions in seconds instead of hours.',
        'Fewer soldiers placed in physical danger.',
        'Huge amounts of data used instead of wasted.',
        'Cheaper, more accurate precision strikes.'
      ],
      disadvantages: [
        'A wrong decision with no human in the loop can kill the wrong people.',
        'A machine can be fooled - decoys and spoofing mislead it.',
        'Nobody can be held responsible when a machine kills.',
        'It starts an arms race between countries.'
      ],
      impact:
        'Wars become quicker and less human. A country with good AI pulls far ahead of one without it. And the rules that should control it do not exist yet.'
    },
    conclusion: {
      future:
        'AI will spread from the headquarters down to the individual soldier - helmets that see in the dark, rifles that help aim, and machines that suggest a plan. India must build its own, or buy dependence.',
      challenges: [
        'No global treaty controls military AI.',
        'Most of the technology is dual-use, so it is hard to restrict.',
        'Machines fail in ways we cannot always predict.'
      ],
      precautions: [
        'Keep a human decision-maker on every lethal action.',
        'Test and certify systems before they are deployed.',
        'Protect the data and networks that feed the AI.',
        'Train our people to run and question the machine.'
      ],
      opinion:
        'I believe AI should assist the soldier, never replace his judgement. A machine may choose the target, but a human must own the decision.'
    },
    fact: 'AI can scan and classify battlefield imagery in seconds - work that would take an analyst team many hours.',
    statistic: 'The number of countries fielding military drones and AI-enabled systems has grown from a handful to many dozens (reported).',
    quote: {
      text: 'The pace of change in warfare is set by technology; the direction must be set by judgement.',
      who: 'A widely used summary of modern doctrinal thinking'
    },
    facts: [
      { label: 'First live large-scale test', value: 'The Russia-Ukraine war, from 2022' },
      { label: "India's institutional step", value: 'Defence AI Council set up in 2018, with a task force before it' },
      { label: 'Weak point', value: 'Data - an AI is only as good as the information it is fed' },
      { label: 'Safeguard', value: 'Human-in-the-loop is the standard India has spoken of publicly' }
    ]
  },
  {
    id: 'agnipath',
    topic: 'Agnipath Scheme and the Future of India\'s Armed Forces',
    theme: 'Defence and Security',
    boards: ['Prayagraj (Allahabad)', 'Kapurthala', 'Varanasi'],
    evidence: 'coaching compilation, 2025-26',
    sources: ['https://ncaacademy.com/ssb-lecturette-topics-2026-150-topics-with-tips/'],
    keywords: ['youth', 'training', 'transition'],
    intro: {
      meaning:
        'Agnipath is the scheme under which young Indians join the armed forces for four years as Agniveers. After four years, about one in four is retained permanently; the rest return to civilian life with a certificate and a savings fund.',
      history:
        'India\'s armed forces have always carried a large pension bill and an ageing profile. Older committees argued for a younger, leaner force. Agnipath was announced in June 2022 as the answer to both.',
      origin:
        'It came from three pressures - a pension bill growing faster than the budget, a force where the average age was rising every year, and the wish to bring technically trained youth into the services for shorter, sharper service.'
    },
    body: {
      present:
        'Three services recruit Agniveers on four-year terms. Roughly a quarter are retained. Those who leave get a Seva Nidhi package, a skill certificate and preference in some government recruitment. The scheme was reviewed after early criticism and rules were eased for those leaving.',
      parallels:
        'Short-service or national service models are not new - Israel, South Korea and Singapore all use them. India is trying the idea in a volunteer force, which is the harder version.',
      advantages: [
        'A younger, fitter fighting force.',
        'A pension bill that does not swallow the defence budget.',
        'Trained, disciplined youth returning to the country.',
        'Faster technical induction in a digital force.'
      ],
      disadvantages: [
        'Losing skilled soldiers after four years costs experience.',
        'Uncertainty for the families of Agniveers.',
        'A pool of trained, unemployed youth is a security concern if handled badly.',
        'Nearly three-fourths leaving can hurt unit cohesion.'
      ],
      impact:
        'It touches the pocket of the defence budget, the age profile of the army, and the aspirations of lakhs of young Indians every year.'
    },
    conclusion: {
      future:
        'If the scheme settles, India will have a younger force and a larger reserve of trained citizens. It may also become the model for a wider national service debate.',
      challenges: [
        'Making the four years genuinely useful for those who leave.',
        'Keeping the services attractive to the best youth.',
        'Protecting unit spirit when a third of a unit changes every year.'
      ],
      precautions: [
        'Guarantee clear, timely information to every recruit.',
        'Keep the retention test fair and transparent.',
        'Build real civil-sector pathways for those not retained.',
        'Watch the effect on discipline and cohesion before expanding.'
      ],
      opinion:
        'I support a younger force, but the scheme will be judged less by those who stay and more by how the country treats those who leave.'
    },
    fact: 'Agniveers receive a Seva Nidhi package made up of their own contribution and a matching government contribution on exit.',
    statistic: 'Roughly one in four Agniveers is retained beyond the four-year term (reported).',
    quote: {
      text: 'The health of a scheme lies in how it treats the people it does not select.',
      who: 'A common argument in the debate on Agnipath'
    },
    facts: [
      { label: 'Announced', value: 'June 2022' },
      { label: 'Term', value: 'Four years of service' },
      { label: 'Retention', value: 'About 25 per cent, selected through a test' },
      { label: 'Contribution', value: 'Recruits contribute from their own pay; government matches it on exit' }
    ]
  },
  {
    id: 'women-in-armed-forces',
    topic: 'Women in the Armed Forces and Combat Roles',
    theme: 'Defence and Security',
    boards: ['Bangalore', 'Dehradun', 'Prayagraj (Allahabad)'],
    evidence: 'coaching compilation, 2025-26',
    sources: ['https://www.flizzindia.com/ssb/latest-lecturette-topics-for-ssb-interview/'],
    keywords: ['merit', 'opportunity', 'integration'],
    intro: {
      meaning:
        'This topic is about how far women should serve in India\'s armed forces - in support roles only, or in the same frontline roles as men. It is a question of merit, of law, and of what a fighting unit can sustain.',
      history:
        'Women have served in the medical services since the 1940s. Officers entered other branches later. For decades they were held on short-service commissions without the permanent commission given to men.',
      origin:
        'Change came from the courts and from a shortage of talent. In 2020 and 2021 the Supreme Court ordered permanent commission for women officers, and allowed women to enter the National Defence Academy. The services then had to adjust.'
    },
    body: {
      present:
        'Women now hold permanent commissions in the Army, Navy and Air Force and in several branches. Women cadets train at the NDA. Fighter pilots, warship and armoured roles have opened in stages, and the services decide each role on operational fitness standards.',
      parallels:
        'Israel has long used women in combat-support and, in some units, combat roles. The United States opened all combat roles to women in 2015. Both found the real test is not permission but standards and retention.',
      advantages: [
        'The force draws on the whole talent pool instead of half.',
        'It reflects the society the military defends.',
        'Women officers visibly strengthen confidence in the institution.',
        'Different experience improves problem-solving in units.'
      ],
      disadvantages: [
        'Uniform physical standards are hard to keep fair for both.',
        'Some units face practical issues of accommodation and privacy.',
        'Social resistance, especially in some forward areas, is real.',
        'Handled badly, haste can create resentment inside units.'
      ],
      impact:
        'It changes the shape of the officer cadre and the reputation of the armed forces as an institution open to merit.'
    },
    conclusion: {
      future:
        'More branches will open as standards are tested. The NDA entry means a generation of women officers with the same training path as men.',
      challenges: [
        'Designing standards that are fair and still operationally honest.',
        'Solving accommodation, privacy and posting issues at forward locations.',
        'Building acceptance across the whole chain of command.'
      ],
      precautions: [
        'Keep one common operational standard, not a separate one.',
        'Provide the infrastructure before opening a role.',
        'Address grievances quickly, so no one carries a silent score.',
        'Judge every case on merit and record the reason.'
      ],
      opinion:
        'I would open every role where a woman can meet the same operational standard. Equal standards are the fairest way to answer the debate.'
    },
    fact: 'The Supreme Court\'s 2021 judgment on women officers directed permanent commission for eligible women officers in the Army.',
    statistic: 'Women officers in the Indian Army number in the thousands after permanent commission was granted (reported).',
    quote: {
      text: 'Open every door that can be opened on merit, and make the standard the same for all.',
      who: 'A common formulation in the debate'
    },
    facts: [
      { label: 'Medical services', value: 'Women have served since the 1940s' },
      { label: 'Key legal step', value: 'Supreme Court rulings in 2020 and 2021 on permanent commission' },
      { label: 'NDA entry', value: 'Opened to women cadets from 2021' },
      { label: 'Current principle', value: 'Roles are opened in stages by operational standards, not by quota' }
    ]
  },
  {
    id: 'atmanirbhar-defence',
    topic: 'Atmanirbhar Bharat in Defence Production',
    theme: 'Defence and Security',
    boards: ['Prayagraj (Allahabad)', 'Bhopal', 'Kapurthala'],
    evidence: 'coaching compilation, 2025-26',
    sources: ['https://www.centuriondefenceacademy.com/latest-lecturette-topics-for-ssb-2025-with-answers/'],
    keywords: ['self-reliance', 'industry', 'exports'],
    intro: {
      meaning:
        'Atmanirbhar Bharat in defence means making in India the weapons we buy - from rifles to fighter aircraft - instead of importing them. Self-reliance here does not mean closing the door; it means depending on ourselves for the essentials.',
      history:
        'India has had public sector defence factories since independence. For decades the accent was on licence production. The shift to design and export came after 2014 through new procurement policy and a list of items banned for import.',
      origin:
        'Two worries drove it. India was among the largest arms importers in the world, and suppliers could delay or deny spares when it mattered - a lesson learned in the 1999 Kargil conflict and again during supply crises.'
    },
    body: {
      present:
        'A negative import list keeps growing. Procurement rules now prefer local content. Ordnance factories were merged into a single corporation to cut delays. Private firms build engines, radars, drones and ammunition, and defence exports have risen sharply, crossing well over twenty thousand crore rupees a year.',
      parallels:
        'China built its defence industry over three decades by first copying and then designing. South Korea moved from assembly to export in about twenty years. India is trying the same climb with a democratic, open economy.',
      advantages: [
        'Spares and ammunition available when they are needed.',
        'Foreign exchange saved and jobs created at home.',
        'Design skill stays inside the country.',
        'Exports earn money and build influence.'
      ],
      disadvantages: [
        'Local production often costs more at the start.',
        'Quality and delivery have historically slipped.',
        'Public sector monopoly can slow innovation.',
        'Too much protection can hide inefficiency.'
      ],
      impact:
        'It decides how free India is in a crisis, and whether defence becomes an engine of industry or a drain on the budget.'
    },
    conclusion: {
      future:
        'The next stage is exporting complete systems and joining global supply chains, not just components. Engines and sensors remain the hardest gaps to close.',
      challenges: [
        'Mastering engines, semiconductors and high-grade materials.',
        'Delivering on time so the services keep faith.',
        'Balancing self-reliance with the urgent need to buy proven equipment.'
      ],
      precautions: [
        'Hold deadlines and quality to the same standard for public and private firms.',
        'Do not protect what can compete; protect only what must be built.',
        'Invest in design talent and testing facilities.',
        'Keep a fallback supplier for critical spares.'
      ],
      opinion:
        'Self-reliance is the right goal, but it must be earned by delivery. Protecting a slow factory is not the same as building a strong one.'
    },
    fact: 'India now maintains a list of defence items that will not be imported, and buys them only from Indian firms.',
    statistic: 'Defence exports crossed twenty thousand crore rupees in a single financial year in the mid-2020s (reported).',
    quote: {
      text: 'A nation that cannot arm itself cannot decide its own fate.',
      who: 'A summary of the self-reliance argument'
    },
    facts: [
      { label: 'Policy shift', value: 'Negative import list and higher local-content preference in procurement' },
      { label: 'Industrial change', value: 'Ordnance factories merged into a single corporation' },
      { label: 'Export trend', value: 'Two decades ago exports were negligible; today they are in the tens of thousands of crores' },
      { label: 'Hardest gaps', value: 'Jet engines, semiconductors, advanced sensors' }
    ]
  },
  {
    id: 'cyber-warfare',
    topic: 'Cyber Warfare and India\'s Cyber Security',
    theme: 'Defence and Security',
    boards: ['Bangalore', 'Varanasi', 'Prayagraj (Allahabad)'],
    evidence: 'coaching compilation, 2025-26',
    sources: ['https://ncaacademy.com/ssb-lecturette-topics-2026-150-topics-with-tips/'],
    keywords: ['invisible', 'attribution', 'resilience'],
    intro: {
      meaning:
        'Cyber warfare is attacking another country through computers - bank systems, power grids, railways, hospitals or defence networks - instead of through soldiers. The weapon is code and the battlefield is invisible.',
      history:
        'It grew with the internet. A worm called Stuxnet, discovered in 2010, damaged centrifuges in Iran without a single shot. Since then almost every major conflict has had a cyber front running beside the physical one.',
      origin:
        'It became attractive because it is cheap and deniable. A small group can cause damage a battalion cannot, and the attacker can hide behind many borders, which makes blame difficult.'
    },
    body: {
      present:
        'India faces continuous attempts on government, financial and defence networks. CERT-In handles incidents and NCIIPC protects critical infrastructure. Power, rail, banking and telecom are the most exposed. Ransomware is the commonest attack, and state-linked groups target strategic data.',
      parallels:
        'It is like sea power and air power in earlier centuries - a new domain that first sits beside the old ones, then decides outcomes. Defence in cyber is closer to public health than to a border wall: you cannot block everything, so you detect early and recover fast.',
      advantages: [
        'Costs far less than a weapon system.',
        'No soldiers put at risk.',
        'Can be aimed precisely and stopped quickly.',
        'Useful for intelligence as well as attack.'
      ],
      disadvantages: [
        'Hard to know who attacked you.',
        'Damage can spill onto hospitals and civilians.',
        'No accepted rules, so escalation is easy and accidental.',
        'It can cripple daily life without a single explosion.'
      ],
      impact:
        'A country can be slowed down without being fired upon, and public confidence in the state depends on keeping the lights and banks running.'
    },
    conclusion: {
      future:
        'Attacks will increasingly target data and supply chains rather than networks alone. India is building a cyber command structure and a national cyber security strategy.',
      challenges: [
        'Attribution - proving who did it.',
        'A shortage of trained cyber professionals.',
        'Critical infrastructure owned by many different agencies.'
      ],
      precautions: [
        'Report every incident quickly; delay is the real enemy.',
        'Keep offline backups of critical systems.',
        'Train ordinary users - most intrusions begin with a click.',
        'Build a joint military-civil cyber command.'
      ],
      opinion:
        'Cyber defence should be treated like air defence - always alert, always funded, and never treated as a technical matter alone.'
    },
    fact: 'Ransomware - locking a system and demanding payment - is the most common serious cyber attack faced by Indian organisations.',
    statistic: 'CERT-In reports a very large and rising number of security incidents every year, running into lakhs (reported).',
    quote: {
      text: 'There are only two kinds of organisations - those that know they have been attacked, and those that do not.',
      who: 'A widely quoted saying in the security industry'
    },
    facts: [
      { label: 'Civilian agency', value: 'CERT-In, the national computer emergency response team' },
      { label: 'Critical infrastructure', value: 'NCIIPC - power, rail, banking, telecom, defence' },
      { label: 'Famous early case', value: 'Stuxnet, found in 2010, damaged centrifuge systems in Iran' },
      { label: 'Weakest link', value: 'People - phishing and simple human error' }
    ]
  },
  {
    id: 'india-china-border',
    topic: 'The India-China Border Dispute',
    theme: 'International Relations',
    boards: ['Prayagraj (Allahabad)', 'Dehradun', 'Bhopal'],
    evidence: 'coaching compilation, 2025-26',
    sources: ['https://ncaacademy.com/ssb-lecturette-topics-2026-150-topics-with-tips/'],
    keywords: ['patience', 'posture', 'negotiation'],
    intro: {
      meaning:
        'This is the long-running dispute over where exactly the boundary lies along the Himalayas. There are two main sectors - the western Ladakh area and the eastern sector - and no agreed line in either.',
      history:
        'The line was never formally settled. British-drawn lines were rejected by China. India and China fought a border war in October 1962. Since then the sides have followed agreements to keep the peace, until that broke down.',
      origin:
        'The dispute exists because the two countries inherited an unmarked frontier across very high mountains. Each side patrols up to what it considers its line, so small differences of view become physical face-offs.'
    },
    body: {
      present:
        'In June 2020 a violent clash at Galwan in Ladakh killed twenty Indian soldiers - the first deaths in decades. Talks and disengagement followed in stages, with patrolling arrangements agreed in 2024. Trade continues even while the border remains tense and infrastructure is built on both sides.',
      parallels:
        'It resembles long-standing rivalries between neighbours where war is unacceptable but trust is absent - the two Koreas, or Turkey and Greece. The answer everywhere is contact plus deterrence.',
      advantages: [
        'Of a firm posture: it protects territory and villages.',
        'Of dialogue: it keeps trade and the border quiet.',
        'Real infrastructure means forces and supplies arrive on time.',
        'Diplomacy prevents small incidents becoming a war.'
      ],
      disadvantages: [
        'Deep trade dependence can be used as leverage.',
        'A long standoff exhausts troops and money.',
        'Small miscalculations can spiral.',
        'Domestic opinion pushes both governments towards stubbornness.'
      ],
      impact:
        'It shapes where India spends its defence budget, how it plans infrastructure, and how it positions itself with other powers such as the United States and Japan.'
    },
    conclusion: {
      future:
        'Negotiation will continue sector by sector, while both sides build roads and posts. A full boundary settlement looks distant; managing the line calmly is the realistic aim.',
      challenges: [
        'Trust, once broken at Galwan, is slow to return.',
        'Very high altitude terrain favours whoever has prepared better.',
        'Both countries are rising powers with growing interests.'
      ],
      precautions: [
        'Keep talking at every level, especially military-to-military.',
        'Strengthen border infrastructure and air support.',
        'Reduce reliance where dependence can be turned into leverage.',
        'Brief the public honestly, without raising war fever.'
      ],
      opinion:
        'Posture and patience are not opposites. India must be strong enough on the ground that talking remains a choice, not a concession.'
    },
    fact: 'The 1962 war ended in a Chinese advance, and the line has remained unsettled since; four decades saw no firing until 2020.',
    statistic: 'The Galwan clash of June 2020 killed twenty Indian soldiers - the first fatalities on that border in 45 years.',
    quote: {
      text: 'Peace on the border is the foundation of the relationship.',
      who: 'A phrase used in Indian statements on the dispute'
    },
    facts: [
      { label: 'Sectors', value: 'Western (Ladakh) and eastern (Arunachal) are the main ones' },
      { label: '1962', value: 'Border war; boundary still unsettled' },
      { label: '2020', value: 'Galwan clash, 20 Indian soldiers killed' },
      { label: '2024', value: 'Patrolling arrangements agreed and disengagement completed in stages' }
    ]
  },
  {
    id: 'quad',
    topic: 'The Quad and the Indo-Pacific',
    theme: 'International Relations',
    boards: ['Bangalore', 'Prayagraj (Allahabad)', 'Dehradun'],
    evidence: 'coaching compilation, 2025-26',
    sources: ['https://www.flizzindia.com/ssb/latest-lecturette-topics-for-ssb-interview/'],
    keywords: ['partnership', 'maritime', 'rules'],
    intro: {
      meaning:
        'The Quad is a grouping of four countries - India, the United States, Japan and Australia - who meet to keep the Indo-Pacific open, secure and rules-based. It is not a military alliance and has no treaty obligation.',
      history:
        'The four worked together after the 2004 tsunami on disaster relief. The group was revived at senior-official level in 2017 and rose to leaders\' summits from 2021, partly in response to China\'s growing presence in the region.',
      origin:
        'It grew from two changes: China\'s rise and its activity at sea, and the realisation that no single country could keep the sea lanes open alone. The Pacific and Indian Oceans were being treated as one continuous theatre.'
    },
    body: {
      present:
        'Quad leaders meet yearly on vaccines, infrastructure, maritime awareness, technology and disaster response. India hosts a maritime information sharing arrangement. The group works through working groups, not a secretariat, and any member can veto a step.',
      parallels:
        'It is more like ASEAN or the G-20 than like NATO - a platform for cooperation rather than a defence pact. Its strength is low cost; its weakness is the same thing - no binding promise.',
      advantages: [
        'Keeps India at the centre of Indo-Pacific decisions instead of watching from outside.',
        'Shares the cost of maritime surveillance.',
        'No formal obligation, so India keeps its strategic autonomy.',
        'Useful in non-military areas - vaccines, technology, disaster relief.'
      ],
      disadvantages: [
        'Being seen as an anti-China bloc could invite China\'s anger.',
        'Without a binding promise, it may not deter anyone.',
        'Different members have different interests; unity is fragile.',
        'It risks complicating India\'s other friendships and its Russia link.'
      ],
      impact:
        'It changes how India positions itself - from a strictly non-aligned voice to a leading player in a like-minded group, while still avoiding a formal alliance.'
    },
    conclusion: {
      future:
        'Expect more joint maritime awareness, undersea cable security and technology cooperation. Membership may widen to a Quad-plus format with other partners.',
      challenges: [
        'Keeping the group useful to all four with different priorities.',
        'Avoiding a false sense of collective defence.',
        'Managing China\'s reaction without losing gains.'
      ],
      precautions: [
        'Keep the aims clear and non-military on the record.',
        'Deliver concrete projects so the group does not look like talk.',
        'Protect strategic autonomy by keeping other relations distinct from it.',
        'Do not let any single member set the group\'s agenda.'
      ],
      opinion:
        'The Quad suits India precisely because it promises little and delivers cooperation. I would keep it loose, and judge it by projects finished, not statements signed.'
    },
    fact: 'The group was founded from practical cooperation after the 2004 Indian Ocean tsunami before becoming a strategic platform.',
    statistic: 'Quad leaders have met every year since their first summit in 2021 (reported).',
    quote: {
      text: 'The Quad is not a club of like-minded nations alone; it is a platform where each member brings what it can.',
      who: 'A common framing in commentary on the group'
    },
    facts: [
      { label: 'Members', value: 'India, United States, Japan, Australia' },
      { label: 'Revived at senior level', value: '2017; leaders\' summits from 2021' },
      { label: 'Nature', value: 'Not a military alliance - no treaty, no secretariat' },
      { label: 'India\'s interest', value: 'Indo-Pacific stability without a formal alliance' }
    ]
  },
  {
    id: 'unsc-seat',
    topic: 'India and a Permanent Seat in the UN Security Council',
    theme: 'International Relations',
    boards: ['Bangalore', 'Varanasi'],
    evidence: 'coaching compilation, 2025-26',
    sources: ['https://ncaacademy.com/ssb-lecturette-topics-2026-150-topics-with-tips/'],
    keywords: ['representation', 'reform', 'responsibility'],
    intro: {
      meaning:
        'This topic asks whether India should hold a permanent seat in the UN Security Council - the five-member body whose permanent members can block any resolution.',
      history:
        'The United Nations was formed in 1945, when India was still a colony. The five permanent members were the victorious powers of the Second World War. The world has changed completely since, but the table has not.',
      origin:
        'India has argued for reform since the 1990s. The reason is simple arithmetic: a body that decides on peace and war has no permanent voice from a country of over a billion people, or from Africa, or from Latin America.'
    },
    body: {
      present:
        'India is part of the G4 group - with Brazil, Germany and Japan - which seeks permanent seats for itself. India has been elected as a non-permanent member eight times, most recently for 2021-22, and has pressed reform in the General Assembly.',
      parallels:
        'Reforming a body that only its own members can reform is like asking a committee to vote itself a smaller say. Similar reform debates elsewhere - the IMF quotas and the World Bank - stalled for decades for the same reason.',
      advantages: [
        'A permanent voice on decisions that affect India\'s security.',
        'It would reflect the world as it is today, not 1945.',
        'Veto power would prevent resolutions being turned into pressure on India.',
        'It raises the country\'s standing and its ability to represent the global south.'
      ],
      disadvantages: [
        'Progress depends on the very powers who would lose relative weight.',
        'Pakistan and some others actively oppose India\'s candidature.',
        'Expanding the council can make it more deadlocked, not less.',
        'A permanent seat brings expectations and duties India must fund.'
      ],
      impact:
        'It shapes how far India can protect its interests in international law, sanctions and peacekeeping, and whether the UN remains a credible body.'
    },
    conclusion: {
      future:
        'Reform is more likely to move through slow, incremental steps - better working methods first, then expansion. India will keep building the case with a larger coalition.',
      challenges: [
        'The veto itself makes any change to the charter very hard.',
        'Competition between rival candidates such as Pakistan, Italy and South Korea.',
        'Keeping a coalition of the like-minded together over decades.'
      ],
      precautions: [
        'Keep building wide support, especially with African nations.',
        'Do not make the demand look like a bilateral fight with Pakistan.',
        'Keep demonstrating the contribution - India is among the largest troop contributors.',
        'Push for interim improvements while working for the full reform.'
      ],
      opinion:
        'India\'s claim rests on logic, not sentiment, and logic takes time. Still, a council without the world\'s largest democracy cannot pretend to speak for everyone.'
    },
    fact: 'India has been elected a non-permanent member of the Security Council eight times and has served in the UN peacekeeping force since the 1950s.',
    statistic: 'The Security Council has had the same five permanent members since 1945 (reported).',
    quote: {
      text: 'Reform is not a favour to India; it is a correction the institution owes the world.',
      who: 'A summary of India\'s long position on council reform'
    },
    facts: [
      { label: 'G4 group', value: 'India, Brazil, Germany, Japan' },
      { label: 'Permanent members', value: 'China, France, Russia, United Kingdom, United States' },
      { label: 'Non-permanent elected terms', value: 'Eight so far, most recently 2021-22' },
      { label: 'Main obstacle', value: 'Charter change requires the existing permanent members\' agreement' }
    ]
  },
  {
    id: 'russia-ukraine-india',
    topic: 'The Russia-Ukraine War and India\'s Position',
    theme: 'International Relations',
    boards: ['Prayagraj (Allahabad)', 'Bhopal', 'Bangalore'],
    evidence: 'coaching compilation, 2025-26',
    sources: ['https://www.centuriondefenceacademy.com/latest-lecturette-topics-for-ssb-2025-with-answers/'],
    keywords: ['autonomy', 'energy', 'balance'],
    intro: {
      meaning:
        'This topic is about how India has handled the war between Russia and Ukraine, buying Russian oil and keeping talks open with both sides while refusing to condemn Russia outright.',
      history:
        'Russia has been India\'s main arms supplier and a diplomatic friend for decades. Ukraine has also been a partner, supplying tank engines and aircraft components. The war began in February 2022 and changed the map of alliances in Europe.',
      origin:
        'India\'s position follows its oldest foreign policy rule - strategic autonomy, meaning no one else decides our friends for us. Cheap oil, reliable spares and a long relationship all pointed the same way.'
    },
    body: {
      present:
        'India has not condemned Russia\'s action, abstained on several UN votes, and bought discounted Russian crude at a scale that made it a major buyer. At the same time it sent humanitarian aid to Ukraine and kept urging dialogue. Western pressure has been steady but not punitive.',
      parallels:
        'It resembles India\'s position during the Cold War - non-alignment, meaning we trade with everyone and join no bloc. It also resembles how Turkey and some Gulf states balanced between the two sides in the same war.',
      advantages: [
        'Cheaper oil protected Indian consumers from a price shock.',
        'Spare parts and weapons from Russia keep flowing.',
        'India keeps a channel of communication with both sides and can be a peace broker.',
        'Strategic autonomy is demonstrated in practice, not just in speeches.'
      ],
      disadvantages: [
        'Relations with the United States and Europe can suffer.',
        'Dependence on Russian weapons is a strategic weak spot.',
        'Payment routes and shipping insurance become constant problems.',
        'India\'s silence is questioned by partners who value clear positions.'
      ],
      impact:
        'It has pushed India to diversify its suppliers, to pay in rupees and other currencies, and to be taken more seriously as a voice that can talk to both camps.'
    },
    conclusion: {
      future:
        'India will keep buying where it is cheap and safe, while steadily shifting purchases to the United States, France, Israel and home-built systems.',
      challenges: [
        'Reducing weapons dependence on a single supplier without gaps.',
        'Managing sanctions and payment rules that change often.',
        'Balancing ties with Russia against ties with Europe and America.'
      ],
      precautions: [
        'Diversify suppliers deliberately and quickly.',
        'Keep humanitarian help visible and separate from the politics.',
        'Protect Indian shipping and payment channels with clear legal cover.',
        'State India\'s principles plainly so silence is not read as support.'
      ],
      opinion:
        'India acted in its own interest, which is legitimate. But autonomy is only credible if we also reduce the dependence that forces the choice.'
    },
    fact: 'India has abstained on several United Nations resolutions concerning the war and has called repeatedly for dialogue and a negotiated end.',
    statistic: 'India\'s imports of Russian crude rose sharply after 2022, making Russia one of its largest suppliers (reported).',
    quote: {
      text: 'This is not an era of war.',
      who: 'Prime Minister Narendra Modi, said to President Putin in 2022'
    },
    facts: [
      { label: 'War began', value: 'February 2022' },
      { label: 'India\'s stated aim', value: 'Dialogue and diplomacy; no condemnation of Russia' },
      { label: 'Economic effect', value: 'Discounted crude became a large share of India\'s oil imports' },
      { label: 'Long-term risk', value: 'Heavy reliance on one country for spare parts and major platforms' }
    ]
  },
  {
    id: 'space-programme',
    topic: 'India\'s Space Programme and Chandrayaan',
    theme: 'Science and Technology',
    boards: ['Bangalore', 'Dehradun', 'Varanasi'],
    evidence: 'coaching compilation, 2025-26',
    sources: ['https://www.flizzindia.com/ssb/latest-lecturette-topics-for-ssb-interview/'],
    keywords: ['low cost', 'precision', 'ambition'],
    intro: {
      meaning:
        'India\'s space programme builds satellites and launch vehicles that help with weather, telecommunication, navigation and defence - and it does so at a cost that surprises the world.',
      history:
        'It began in 1962 with a small national committee and had its first rocket carried on a bicycle. The first satellite went up in 1975 with foreign help. India sent Chandrayaan-1 to the Moon in 2008 and reached Mars in 2014 on its first attempt.',
      origin:
        'The driving idea was that a poor country cannot waste money, so space must pay for itself. Satellites were built first for weather warnings and television, which is why the programme was practical from the start.'
    },
    body: {
      present:
        'Chandrayaan-3 landed near the Moon\'s south pole in August 2023, a region no one had reached before. India has orbited Mars, runs a regional navigation network, and launches foreign satellites commercially. Gaganyaan, the human spaceflight programme, is in preparation.',
      parallels:
        'India\'s path resembles Japan\'s and Europe\'s - using space for development first and prestige second. It has avoided the expensive rivalry of the superpower space race, and that thrift is now its advantage.',
      advantages: [
        'Weather and cyclone warnings save thousands of lives.',
        'Low-cost launches win commercial business.',
        'Navigation and communication help defence and farming alike.',
        'It creates engineering skill and national confidence.'
      ],
      disadvantages: [
        'Budget is still small compared with major space powers.',
        'Private industry participation began late.',
        'Brain drain takes trained talent abroad.',
        'Space debris and crowding in orbit are growing risks.'
      ],
      impact:
        'It proved a developing country can do frontier science cheaply, and it made space a matter of national pride and practical daily use.'
    },
    conclusion: {
      future:
        'Gaganyaan will put Indians in orbit. Expect more private launches, a space station plan and deeper lunar work. Space is now a commercial and military domain too.',
      challenges: [
        'Funding a human programme while doing everything else.',
        'Building a private space industry that competes globally.',
        'Protecting satellites from attack and from debris.'
      ],
      precautions: [
        'Keep the programme cost-conscious - that is its strength.',
        'Bring private firms in as partners, not just suppliers.',
        'Invest in space situational awareness and debris tracking.',
        'Treat space assets as critical infrastructure for defence.'
      ],
      opinion:
        'The space programme shows the best of India - ambition held to a tight budget. Its real value is not the flag on the Moon but the weather warning that reaches a farmer in time.'
    },
    fact: 'Chandrayaan-3\'s lander touched down near the Moon\'s south pole on 23 August 2023, a region never reached before.',
    statistic: 'India reached Mars orbit on its first attempt in 2014, at a cost widely reported as less than many feature films (reported).',
    quote: {
      text: 'We have achieved what no one else has. India is on the Moon.',
      who: 'ISRO leadership on the Chandrayaan-3 landing, 2023'
    },
    facts: [
      { label: 'Programme began', value: '1962; first satellite launched in 1975' },
      { label: 'Moon', value: 'Chandrayaan-1 in 2008; Chandrayaan-3 landed in 2023' },
      { label: 'Mars', value: 'Mangalyaan reached orbit in 2014, first attempt' },
      { label: 'Next big step', value: 'Gaganyaan, the human spaceflight programme' }
    ]
  },
  {
    id: 'digital-india',
    topic: 'Digital India and the Cashless Economy',
    theme: 'Science and Technology',
    boards: ['Bangalore', 'Bhopal', 'Varanasi'],
    evidence: 'coaching compilation, 2025-26',
    sources: ['https://www.adda247.com/defence-jobs/latest-topics-for-lecturette-in-ssb-interview/'],
    keywords: ['access', 'inclusion', 'trust'],
    intro: {
      meaning:
        'Digital India means government services, payments and records moving to the internet so that a citizen can use them from a phone. The cashless part is about paying by phone instead of notes.',
      history:
        'The programme was launched in July 2015. Aadhaar had already given millions a digital identity. After the currency change of 2016, digital payments jumped, and the Unified Payments Interface made transfers instant and free.',
      origin:
        'Two problems drove it - long queues for simple services, and millions of people outside the banking system. A cheap phone and a cheap data plan made the solution possible.'
    },
    body: {
      present:
        'UPI carries billions of transactions a month and is used for everything from vegetables to salaries. Aadhaar-linked payments reach welfare beneficiaries directly, cutting out middlemen. Government forms, land records and certificates are online in many states, and internet data is among the cheapest in the world.',
      parallels:
        'It resembles how mobile phones bypassed landlines in India - leapfrogging an old system rather than repairing it. Kenya\'s M-Pesa showed the same pattern at a smaller scale.',
      advantages: [
        'Money reaches the right person without a middleman.',
        'Small businesses accept payment with no card machine.',
        'Services cost less to run and take minutes instead of days.',
        'Records are easier to keep and harder to lose.'
      ],
      disadvantages: [
        'People without a smartphone or signal are left out.',
        'Fraud, phishing and OTP theft are growing fast.',
        'Personal data is concentrated and its protection has been weak.',
        'A network failure can stop payments and services completely.'
      ],
      impact:
        'It has changed how ordinary Indians earn, pay and claim benefits, and made digital access a part of daily life rather than a luxury.'
    },
    conclusion: {
      future:
        'Expect offline payment modes, more open networks, and a stronger push on data protection. Digital identity will expand into more services.',
      challenges: [
        'Bridging the gap for those who cannot use a phone.',
        'Stopping fraud before people lose faith in the system.',
        'Protecting privacy while keeping services convenient.'
      ],
      precautions: [
        'Keep a paper or offline option for essential services.',
        'Teach digital safety in schools and villages.',
        'Enforce data protection law firmly.',
        'Build backups so one outage does not stop payments.'
      ],
      opinion:
        'Digital India has done real good in reaching the poor directly. But a system that only works with a phone and a signal must always keep a door open for those without one.'
    },
    fact: 'Aadhaar-linked transfers let welfare money reach beneficiaries directly, removing layers of middlemen.',
    statistic: 'UPI now handles billions of transactions every month in India (reported).',
    quote: {
      text: 'Technology should reach the last person in the line, not just the first.',
      who: 'A phrase often used about digital inclusion in India'
    },
    facts: [
      { label: 'Launched', value: 'Digital India, July 2015' },
      { label: 'Payment backbone', value: 'UPI - instant, free, built by NPCI' },
      { label: 'Identity layer', value: 'Aadhaar, used to link benefits and payments' },
      { label: 'Weak points', value: 'Fraud, exclusion, data protection, network outages' }
    ]
  },
  {
    id: 'semiconductor-mission',
    topic: 'Semiconductor Manufacturing in India',
    theme: 'Science and Technology',
    boards: ['Bangalore', 'Bhopal'],
    evidence: 'coaching compilation, 2025-26',
    sources: ['https://ncaacademy.com/ssb-lecturette-topics-2026-150-topics-with-tips/'],
    keywords: ['chips', 'supply chain', 'self-reliance'],
    intro: {
      meaning:
        'A semiconductor is the tiny chip inside every phone, car, missile and hospital machine. This topic is about India\'s attempt to make those chips at home instead of importing all of them.',
      history:
        'India tried semiconductor fabrication in the 1980s and the attempt failed on cost and technology. For nearly three decades the country designed chips for others but made almost none. The shortage during the pandemic showed how dangerous that was.',
      origin:
        'Two shocks drove the new push - the global chip shortage of 2020-21, which stopped car factories, and the realisation that a chip supply cut by others could stop India\'s economy and defence production.'
    },
    body: {
      present:
        'The India Semiconductor Mission was launched with a large outlay. Several fabrication and assembly plants have been announced, including in Gujarat and Assam, along with a design-linked incentive scheme. India still imports the great majority of its chips, and the first plants are only beginning production.',
      parallels:
        'China spent decades building chip capacity with heavy state support. Taiwan and South Korea built world leadership from a narrow base over thirty years. There is no shortcut - this is a ten-year climb, not a two-year project.',
      advantages: [
        'Supply security for defence, telecom and vehicles.',
        'High-value jobs and a skilled technical workforce.',
        'A base for export and for attracting global firms.',
        'Reduces a major import dependence.'
      ],
      disadvantages: [
        'Fabrication plants need enormous capital and huge amounts of water and power.',
        'The technology changes every two years, so investment ages quickly.',
        'Shortage of trained engineers for advanced fabrication.',
        'Risk that incentives attract assembly only, not real chip-making.
      ],
      impact:
        'It decides whether India can build the electronics its armed forces and economy need without waiting on another country\'s decision.'
    },
    conclusion: {
      future:
        'Expect assembly and testing plants first, then older-node fabrication, then a slow move up. Real self-reliance in the most advanced chips is much further away.',
      challenges: [
        'Water, power and land for large fabs.',
        'Building a deep pool of skilled engineers.',
        'Staying competitive as global technology moves on.'
      ],
      precautions: [
        'Judge results by chips produced, not by agreements signed.',
        'Invest in training alongside the factories.',
        'Secure the water and power supply before promising a plant.',
        'Keep design capability strong - it is our real present advantage.'
      ],
      opinion:
        'India should chase this, but honestly. Becoming a chip power is a twenty-year climb; calling a packaging plant a semiconductor revolution will not make it one.'
    },
    fact: 'India has designed chips for global firms for decades but has made very few of its own.',
    statistic: 'The India Semiconductor Mission was announced with an outlay reported at around seventy-six thousand crore rupees (reported).',
    quote: {
      text: 'A chip is now what oil was to the last century - the thing everyone needs and few control.',
      who: 'A common summary of why semiconductors matter strategically'
    },
    facts: [
      { label: 'Mission launched', value: '2021, with a large multi-year outlay' },
      { label: 'First attempt', value: '1980s fabrication effort, which did not survive' },
      { label: 'Why now', value: 'The 2020-21 global chip shortage hit vehicle and electronics production' },
      { label: 'Stages', value: 'Design, fabrication, assembly and testing - the last two come first' }
    ]
  },
  {
    id: 'uniform-civil-code',
    topic: 'Uniform Civil Code',
    theme: 'Social and Governance',
    boards: ['Bhopal', 'Varanasi', 'Prayagraj (Allahabad)'],
    evidence: 'coaching compilation, 2025-26',
    sources: ['https://www.centuriondefenceacademy.com/latest-lecturette-topics-for-ssb-2025-with-answers/'],
    keywords: ['equality', 'consent', 'custom'],
    intro: {
      meaning:
        'A Uniform Civil Code means one set of laws on marriage, divorce, inheritance and adoption for every citizen, instead of different personal laws for different communities.',
      history:
        'The idea was debated in the Constituent Assembly and placed in the Constitution as a directive principle - a goal for the state, not an enforceable right on day one. Goa has had a common civil code since Portuguese times.',
      origin:
        'It grew from the argument that a modern republic should not apply different rules to citizens based on religion, especially where those rules affect women\'s rights such as consent, maintenance and inheritance.'
    },
    body: {
      present:
        'Uttarakhand became the first state to bring a Uniform Civil Code into force, in 2025, and a central law commission has examined the question. Other states have announced committees. Personal laws still govern most citizens, and the debate remains politically charged.',
      parallels:
        'Most modern states have one civil law for all citizens - France, Germany and the United States among them. What makes India different is that personal law here is tied to religious identity, so reform touches belief as well as law.',
      advantages: [
        'One law for all citizens, so equality before the law is real.',
        'Stronger protection for women on marriage, maintenance and inheritance.',
        'Ends contradictions where different courts give different answers.',
        'Simplifies administration and reduces litigation.'
      ],
      disadvantages: [
        'Can be seen as interference in religious practice.',
        'Risks hurting minority trust if done without consent.',
        'Custom and tribal practice vary widely and need care.',
        'Politically it can be used to divide rather than to reform.'
      ],
      impact:
        'It would change the daily legal life of every family in matters of marriage, property and children - the most personal part of the law.'
    },
    conclusion: {
      future:
        'Change will come state by state and issue by issue rather than as one sweeping law. Reform of marriage age, maintenance and inheritance may move first.',
      challenges: [
        'Carrying minorities along instead of imposing.',
        'Protecting tribal custom, which the Constitution itself safeguards.',
        'Separating genuine reform from electoral advantage.'
      ],
      precautions: [
        'Consult widely and publish the draft for public comment.',
        'Keep the focus on rights, especially of women and children.',
        'Exempt or protect tribal custom as the Constitution intends.',
        'Do not use the reform as a weapon between communities.'
      ],
      opinion:
        'Equality before the law is a fair aim and women\'s rights should not wait on custom. But a law this personal must be built by agreement; imposed, it will be resisted and reversed.'
    },
    fact: 'A uniform civil code is a directive principle in the Constitution - a goal the state is meant to work towards, not a right enforceable in court.',
    statistic: 'Uttarakhand became the first state to implement a uniform civil code, in 2025 (reported).',
    quote: {
      text: 'The state should not tell a citizen what to believe; it must still be able to tell every citizen what the law is.',
      who: 'A summary of the reform argument'
    },
    facts: [
      { label: 'Constitutional place', value: 'Directive Principle, Article 44' },
      { label: 'Existing common code', value: 'Goa, in force since Portuguese rule' },
      { label: 'First state to implement', value: 'Uttarakhand, 2025' },
      { label: 'Hardest parts', value: 'Minority consent and protection of tribal custom' }
    ]
  },
  {
    id: 'nep-2020',
    topic: 'National Education Policy 2020',
    theme: 'Social and Governance',
    boards: ['Varanasi', 'Bhopal', 'Dehradun'],
    evidence: 'coaching compilation, 2025-26',
    sources: ['https://www.centuriondefenceacademy.com/latest-lecturette-topics-for-ssb-2025-with-answers/'],
    keywords: ['foundation', 'flexibility', 'skills'],
    intro: {
      meaning:
        'The National Education Policy 2020 is the framework that reshaped schooling and higher education in India - from the class structure children follow to the way colleges are accredited.',
      history:
        'It replaced a policy from 1986, which had itself been reviewed in 1992. The new policy was drafted by a committee led by a former ISRO chief and approved in July 2020, after the widest public consultation in this field.',
      origin:
        'It came from three failures - children learning by rote and forgetting basics, a very high dropout rate in the early years, and graduates without skills for employment.'
    },
    body: {
      present:
        'Schools now follow a 5+3+3+4 structure, with three years of pre-school counted as part of the foundation stage. Board exams are being redesigned, mother tongue is the medium for early years, and higher education allows multiple entry and exit with a credit bank. Implementation is uneven across states.',
      parallels:
        'It resembles Finland\'s focus on early foundations and Singapore\'s shift away from rote examination. Both took a decade or more to show results, which is a warning against expecting quick change.',
      advantages: [
        'Focus on the early years, where learning gaps begin.',
        'Flexibility - students can exit and return to study.',
        'Vocational skill given equal standing with degrees.',
        'Moves away from marks alone towards real competence.'
      ],
      disadvantages: [
        'States and private schools have limited capacity to deliver it.',
        'Mother-tongue teaching can clash with mobility of families.',
        'Teacher training is the weakest link and the hardest to fix.',
        'Coding and technology push may deepen the rural-urban gap.'
      ],
      impact:
        'It decides what a generation of Indians learns, and therefore what the country\'s workforce and armed forces can be built from.'
    },
    conclusion: {
      future:
        'The next decade is about implementation - teacher training, assessment reform and funding. The policy\'s success will be judged in classrooms, not in documents.',
      challenges: [
        'Training lakhs of teachers to teach differently.',
        'Uneven state capacity and funding.',
        'Resistance to changing examination culture.'
      ],
      precautions: [
        'Invest first in teachers, before new structures.',
        'Pilot changes and measure learning, not enrolment.',
        'Protect students in remote areas from being left behind.',
        'Keep assessment honest, or the old rote system returns.'
      ],
      opinion:
        'The policy diagnoses the disease correctly - rote learning and weak foundations. Its fate depends on teachers, and no policy has ever trained enough of them fast enough.'
    },
    fact: 'The policy replaced the National Policy on Education of 1986 and was approved in July 2020 after a large public consultation.',
    statistic: 'The school structure changed to 5+3+3+4, bringing three years of pre-school into the formal framework (reported).',
    quote: {
      text: 'Education must build character and capability, not just certificates.',
      who: 'The stated aim of the 2020 policy'
    },
    facts: [
      { label: 'Approved', value: 'July 2020; first policy since 1986' },
      { label: 'School structure', value: '5+3+3+4, counting pre-school' },
      { label: 'Higher education', value: 'Multiple entry and exit, academic credit bank' },
      { label: 'Biggest risk', value: 'Teacher training and uneven state capacity' }
    ]
  },
  {
    id: 'mental-health-forces',
    topic: 'Mental Health in the Armed Forces',
    theme: 'Social and Governance',
    boards: ['Dehradun', 'Bangalore'],
    evidence: 'coaching compilation, 2025-26',
    sources: ['https://www.flizzindia.com/ssb/latest-lecturette-topics-for-ssb-interview/'],
    keywords: ['stress', 'support', 'stigma'],
    intro: {
      meaning:
        'This topic is about the mental strain carried by service personnel - from long separations, hard postings and danger - and whether the system helps them carry it.',
      history:
        'Armies have long recognised battle fatigue and shell shock, though for decades it was treated as a weakness rather than an injury. Modern armies now treat psychological injury as a medical condition needing care.',
      origin:
        'Attention grew as counter-insurgency duty stretched forces, and as reports of stress-related deaths and suicides were raised in Parliament. Families and veterans pushed the issue into public view.'
    },
    body: {
      present:
        'The services run counselling, stress-management and yoga programmes, post stress counsellors in formations, and have helplines. Reports of suicide and stress-related incidents among personnel are still raised in Parliament. Veterans\' mental health and family counselling remain the weakest areas.',
      parallels:
        'The United States and Britain took decades to normalise mental health care in uniform, and both now train leaders to spot early signs. India is on the same road, roughly where they were a generation ago.',
      advantages: [
        'Early help keeps trained soldiers in service instead of losing them.',
        'Reduces suicides and stress-related incidents.',
        'Steadier units - a soldier in distress affects his comrades.',
        'Families cope better when the system supports them too.'
      ],
      disadvantages: [
        'Stigma - asking for help can look like weakness.',
        'Psychiatrists and counsellors are in short supply.',
        'Confidentiality is hard in a close-knit unit.',
        'Reporting suffers when it may affect a soldier\'s career.'
      ],
      impact:
        'It decides whether the armed forces keep their trained people and whether the men and women who serve are respected in their hardest moments.'
    },
    conclusion: {
      future:
        'Expect routine screening, more counsellors, and training for junior leaders to spot trouble early. Tele-counselling can reach remote postings.',
      challenges: [
        'Removing the stigma, which is cultural, not administrative.',
        'Getting enough trained mental health professionals.',
        'Keeping help confidential in a small unit.'
      ],
      precautions: [
        'Treat mental injury as an injury, not an indiscipline case.',
        'Protect confidentiality strictly and be seen to do so.',
        'Provide help to families and veterans, not only serving personnel.',
        'Train junior leaders and buddies to notice changes early.'
      ],
      opinion:
        'A soldier is asked to carry a rifle; nobody should ask him to carry that and keep silent about his mind. Seeking help must never be treated as a career failure.'
    },
    fact: 'The services run stress-management programmes and post counsellors in formations, and stress-related deaths have been raised in Parliament.',
    statistic: 'Mental health professionals remain scarce across India, and the armed forces share that shortage (reported).',
    quote: {
      text: 'It is not the load that breaks a man down; it is the way he carries it.',
      who: 'A saying often quoted in stress-management literature'
    },
    facts: [
      { label: 'Recognised as', value: 'A medical condition, not a weakness or an offence' },
      { label: 'Existing measures', value: 'Counsellors in formations, stress management, yoga, helplines' },
      { label: 'Weakest areas', value: 'Veterans and families' },
      { label: 'Biggest barrier', value: 'Stigma and fear of career damage' }
    ]
  },
  {
    id: 'climate-national-security',
    topic: 'Climate Change and National Security',
    theme: 'Environment',
    boards: ['Bangalore', 'Dehradun', 'Varanasi'],
    evidence: 'coaching compilation, 2025-26',
    sources: ['https://www.thetargetclasses.com/ssb/lecturette-topics-for-ssb-interview/'],
    keywords: ['security', 'resilience', 'resources'],
    intro: {
      meaning:
        'This topic is about how a changing climate becomes a security problem - through floods, drought, migration and fights over water and food, long before any army is involved.',
      history:
        'Climate science matured over the last fifty years. Security planners came late to it, starting in the 2000s when militaries began planning for disasters and for resource conflicts rather than only for wars.',
      origin:
        'Attention grew when disasters began to displace millions and when melting Arctic ice opened new sea routes and new competition. A threat that has no enemy and no border needed a new kind of planning.'
    },
    body: {
      present:
        'India\'s armed forces are called out for floods and cyclones every year, so disaster relief is now a standing task. India has committed to net zero by 2070 and to large non-fossil electricity capacity by 2030. Coastal bases, Himalayan posts and border infrastructure are all exposed to a harsher climate.',
      parallels:
        'It resembles water and river disputes in older history - the fight is over resources, not ideology. It is closer to a slow siege than to a battle: the pressure builds and rarely announces itself.',
      advantages: [
        'Renewable energy cuts fuel convoys and dependence on imported oil.',
        'Disaster response earns India goodwill and regional influence.',
        'Early warning saves lives and protects bases.',
        'Leadership on climate adds weight to India\'s global voice.'
      ],
      disadvantages: [
        'Disaster relief ties down troops already committed to borders.',
        'Coastal and Himalayan infrastructure faces heavy damage risk.',
        'Water and crop failure can drive migration and unrest.',
        'Harsh targets can be costly for a developing economy.'
      ],
      impact:
        'It changes what the armed forces are for - more disaster relief, more infrastructure protection, and planning for scarcity rather than only for war.'
    },
    conclusion: {
      future:
        'Expect greener military logistics, solar-powered posts, and closer coordination between the armed forces and disaster agencies. Himalayan glacier monitoring will matter more each year.',
      challenges: [
        'Funding adaptation while also modernising equipment.',
        'Protecting bases in areas becoming more hazardous.',
        'Cooperating on shared rivers with neighbouring states.'
      ],
      precautions: [
        'Treat climate risk as a defence planning input, not a side issue.',
        'Build resilience into every new base and road.',
        'Strengthen early warning systems and drills.',
        'Keep commitments realistic and tied to available finance.'
      ],
      opinion:
        'For India, climate change is not only an environmental subject; it is a security one. The floods that send troops into rescue are as much a threat as a hostile border.'
    },
    fact: 'India\'s armed forces are deployed for flood and cyclone relief almost every year, making disaster response a standing operational role.',
    statistic: 'India has committed to net zero emissions by 2070 and to a large share of non-fossil electricity capacity by 2030 (reported).',
    quote: {
      text: 'There is no enemy who signs a ceasefire with a changing climate.',
      who: 'A common framing in military climate literature'
    },
    facts: [
      { label: 'India\'s target', value: 'Net zero by 2070' },
      { label: 'Routine military role', value: 'Flood and cyclone relief, nearly every year' },
      { label: 'Exposed assets', value: 'Coastal naval bases and Himalayan posts' },
      { label: 'Second-order risk', value: 'Migration and unrest driven by water and crop failure' }
    ]
  },
  {
    id: 'water-crisis',
    topic: 'India\'s Water Crisis',
    theme: 'Environment',
    boards: ['Bhopal', 'Varanasi'],
    evidence: 'coaching compilation, 2025-26',
    sources: ['https://www.thetargetclasses.com/ssb/lecturette-topics-for-ssb-interview/'],
    keywords: ['scarcity', 'conservation', 'sharing'],
    intro: {
      meaning:
        'India has more people than it has usable water. This topic is about why that gap keeps widening and what can be done about it.',
      history:
        'India\'s traditional systems - tanks, stepwells and canal networks - were built over centuries to store monsoon water. Many were neglected after tube wells made pumping easy, and groundwater use exploded.',
      origin:
        'The crisis grew from three changes together - a rising population, farming that grows thirsty crops, and cheap pumps that let anyone pull water from below the ground faster than rain refills it.'
    },
    body: {
      present:
        'Groundwater levels have fallen sharply in the north-west and parts of the south. Several cities run short every summer. Rivers are polluted, and storage capacity per person is low. Government schemes for irrigation, river cleaning and groundwater recharge are running, but demand still outpaces supply.',
      parallels:
        'It resembles the dust bowl in the United States in the 1930s, where farming practice outran the water available. Israel solved a similar scarcity by mixing drip irrigation, reuse and desalination - technology plus discipline.',
      advantages: [
        'Efficient irrigation saves water and money for farmers.',
        'Rainwater harvesting and recharge raise levels cheaply.',
        'Reuse of treated water frees fresh water for drinking.',
        'Protecting rivers improves health as well as supply.'
      ],
      disadvantages: [
        'Free or cheap power encourages wasteful pumping.',
        'Inter-state river disputes slow any plan down.',
        'Water-hungry crops are profitable and politically protected.',
        'Pollution makes the water we have unusable.'
      ],
      impact:
        'Water shortage affects food production, city life, industry and even migration - and can turn into conflict between states and between farmers and towns.'
    },
    conclusion: {
      future:
        'Expect stronger rules on groundwater, more reuse of treated water, and pricing that reflects the real cost. Technology alone will not solve a problem of management.',
      challenges: [
        'Changing what farmers grow when the market rewards water-hungry crops.',
        'Settling river disputes between states.',
        'Funding storage and treatment systems.'
      ],
      precautions: [
        'Measure and meter extraction instead of leaving it invisible.',
        'Reward recharge and efficient irrigation, not more pumping.',
        'Treat and reuse water in industry and cities.',
        'Settle river sharing through courts and negotiation, not by force.'
      ],
      opinion:
        'The crisis is not of scarcity alone but of management. We have the rain; what we lack is the discipline to store it and the fairness to share it.'
    },
    fact: 'India supports about eighteen per cent of the world\'s population with only about four per cent of its fresh water.',
    statistic: 'Groundwater levels have fallen sharply in the north-west, where a very large share of India\'s grain is grown (reported).',
    quote: {
      text: 'We never know the worth of water till the well is dry.',
      who: 'Thomas Fuller, quoted widely in water conservation work'
    },
    facts: [
      { label: 'Share of world population', value: 'About 18 per cent' },
      { label: 'Share of world fresh water', value: 'About 4 per cent' },
      { label: 'Main pressure', value: 'Groundwater pumping for irrigation' },
      { label: 'Traditional answer', value: 'Tanks, stepwells and rainwater recharge' }
    ]
  },
  // __APPEND__
];
