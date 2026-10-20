'use strict';

/*
 * Builds the lecturette topic database.
 * Generates data/lectures.json from the authored topics in tools/lecture-topics.js.
 *
 *   node tools/build-lectures.js
 *
 * The generated output is data/lectures.json
 */

const path = require('path');
const ROOT = path.join(__dirname, '..');

const TAT = require('./lecture-topics');

function buildLecture(topic) {
  const intro = topic.intro;
  const body = topic.body;
  const conclusion = topic.conclusion;

  // Build the full lecture structure following the 3-min pattern:
  // Intro 30 sec -> Body 2 min -> Conclusion 30 sec
  const lecture = {
    id: topic.id,
    topic: topic.topic,
    theme: topic.theme,

    // Intro (30 seconds)
    intro: {
      meaning: intro.meaning,
      history: intro.history,
      origin: intro.origin
    },

    // Body (2 minutes)
    body: {
      present: body.present,
      parallels: body.parallels,
      advantages: body.advantages || [],
      disadvantages: body.disadvantages || [],
      impact: body.impact
    },

    // Conclusion (30 seconds)
    conclusion: {
      future: conclusion.future,
      challenges: conclusion.challenges || [],
      precautions: conclusion.precautions || [],
      opinion: conclusion.opinion
    },

    // Facts and supporting data
    fact: topic.fact,
    statistic: topic.statistic,
    quote: topic.quote,
    facts: topic.facts || [],

    // Metadata
    sources: topic.sources || [],
    keywords: topic.keywords || [],
    boards: topic.boards || []
  };

  return lecture;
}

function generate() {
  const lectures = TAT.map(buildLecture);
  const outPath = path.join(ROOT, 'data', 'lectures.json');

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(lectures, null, 2), 'utf8');
  console.log('Generated ' + lectures.length + ' lecture topics to ' + outPath);
}

const fs = require('fs');
generate();