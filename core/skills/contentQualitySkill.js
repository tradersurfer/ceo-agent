/**
 * QRG-aligned content quality detector. Scores a block of text against
 * signals drawn from Google's September 11, 2025 Quality Rater Guidelines:
 * §4.6.5 scaled content abuse, §4.6.6 lowest-rating triggers (copied/
 * paraphrased/AI-generated content), and §4.6 filler content. This is
 * advisory only — it surfaces signals for a human or another skill to act
 * on, and does not itself render a "this is AI-generated" verdict.
 *
 * ============================================================================
 * ATTRIBUTION BLOCK 1 OF 2 — claude-seo code (MIT)
 * ============================================================================
 * Ported to JavaScript from the "seo-content" skill's
 * `scripts/content_quality.py` in AgriciDaniel/claude-seo (skills/seo-content/
 * SKILL.md declares `license: MIT`, `metadata.author: AgriciDaniel`,
 * `metadata.version: "2.2.4"`).
 * Source: https://github.com/AgriciDaniel/claude-seo/blob/main/scripts/content_quality.py
 *
 * MIT License
 * Copyright (c) 2026 agricidaniel
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 * This file is a derivative work: the tokenization, phrase-hit counting,
 * entity/number density, bigram-repetition, and composite-scoring logic
 * below is reimplemented in JavaScript from the original Python (stdlib-
 * only: argparse/json/re/sys/collections/pathlib/typing — no network, no
 * external package). The original CLI's argparse/file/stdin layer is
 * replaced with direct string input matching this project's skill-handler
 * contract; the scoring algorithm itself is otherwise unchanged.
 *
 * ============================================================================
 * ATTRIBUTION BLOCK 2 OF 2 — AI-pattern wordlist data (CC BY-SA 4.0)
 * ============================================================================
 * This block covers ONLY the AI_PATTERNS wordlist below — a distinct,
 * separately-licensed data source from the MIT-licensed code above. Per the
 * original file's own docstring: "The AI-pattern list draws from the
 * Wikipedia 'AI Cleanup' project's catalogue of LLM-typical phrasings
 * (CC BY-SA 4.0). The same list is used by ivankuznetsov/claude-seo (MIT)
 * and we cite both upstreams in the comment block."
 *
 * Source (Wikipedia, CC BY-SA 4.0): https://en.wikipedia.org/wiki/Wikipedia:WikiProject_AI_Cleanup
 * License text: https://creativecommons.org/licenses/by-sa/4.0/
 * Also used by (MIT): https://github.com/ivankuznetsov/claude-seo
 *
 * CC BY-SA 4.0 requires attribution and share-alike: if this wordlist (or a
 * work built substantially from it) is redistributed or adapted further,
 * that redistribution must itself carry the same CC BY-SA 4.0 terms and
 * credit the Wikipedia AI Cleanup project, independent of whatever license
 * covers the surrounding code. Kept as a separate, unmodified array so this
 * obligation stays scoped to the data, not smeared across the whole file.
 * The FILLER_PHRASES list below is a distinct data source (original to
 * claude-seo, MIT) and does not carry this obligation.
 * ============================================================================
 */

// Padding/filler phrases QRG §4.6 flags as "little-to-no value". MIT
// (claude-seo, see attribution block 1 above) — not part of the CC BY-SA
// wordlist below.
const FILLER_PHRASES = Object.freeze([
  "it's important to note that",
  "in this article, we'll explore",
  'in this article we will explore',
  "in today's fast-paced world",
  "in today's digital age",
  "in today's competitive landscape",
  'needless to say',
  'at the end of the day',
  'when it comes to',
  'when all is said and done',
  'in the realm of',
  'in the world of',
  'the bottom line is',
  'without further ado',
  'first and foremost',
  'last but not least',
  "for what it's worth",
  'it goes without saying',
  'as we all know',
  'the truth is that',
  'the fact of the matter is',
  'more often than not',
  "let's dive in",
  "let's dive into",
  "let's take a closer look",
  "let's take a deeper look",
]);

// LLM-typical phrasings — CC BY-SA 4.0, Wikipedia AI Cleanup project.
// See attribution block 2 above. Do not add phrases here without the same
// corpus-evidence standard the original curators applied; this array
// carries a share-alike obligation independent of this file's own code.
const AI_PATTERNS = Object.freeze([
  'delve into',
  'delve deeper into',
  'in the ever-evolving',
  'ever-evolving landscape',
  'ever-changing landscape',
  'in the dynamic landscape',
  'navigating the',
  'navigate the complexities',
  'tapestry of',
  'rich tapestry',
  'intricate tapestry',
  'embark on a journey',
  'embarking on this',
  'a testament to',
  'a beacon of',
  'the cornerstone of',
  'a cornerstone of',
  'at the heart of',
  'at its core',
  'in essence,',
  'in conclusion,',
  'ultimately,',
  'moreover,',
  'furthermore,',
  "however, it's worth noting",
  "it's worth noting that",
  'by leveraging',
  'leverage the power of',
  'leveraging the power of',
  'harness the power of',
  'unlock the potential',
  'unlock the full potential',
  'the realm of possibilities',
  'open up a world of',
  'a world of possibilities',
  'elevate your',
  'transform your',
  'revolutionize the way',
  'game-changer',
  'game-changing',
  'cutting-edge',
  'state-of-the-art',
  'in summary,',
  'to summarize,',
  'to put it simply,',
  'in a nutshell,',
]);

const TOKEN_RE = /[A-Za-z][A-Za-z'-]*/g;
const NUMBER_RE = /\b\d+(?:[.,]\d+)?(?:%|st|nd|rd|th)?\b/g;
const ENTITY_RE = /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;

function countPhraseHits(text, patterns) {
  const lowered = text.toLowerCase();
  return patterns.filter(phrase => lowered.includes(phrase));
}

function repetitionScore(tokens) {
  if (tokens.length < 4) return 0;
  const counts = new Map();
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const bigram = `${tokens[i]} ${tokens[i + 1]}`;
    counts.set(bigram, (counts.get(bigram) || 0) + 1);
  }
  let repeated = 0;
  for (const count of counts.values()) if (count > 1) repeated += 1;
  return repeated / Math.max(1, counts.size);
}

function analyse(text) {
  if (!text || !text.trim()) {
    return {
      fillerScore: 0,
      aiPatternScore: 0,
      informationDensity: 0,
      repetitionScore: 0,
      overallQuality: 0,
      flags: ['empty-input'],
      matches: { filler: [], aiPatterns: [] },
      tokens: 0,
      uniqueTokens: 0,
    };
  }

  const tokens = (text.match(TOKEN_RE) || []).map(t => t.toLowerCase());
  const nTokens = tokens.length;
  const unique = new Set(tokens).size;

  const fillerHits = countPhraseHits(text, FILLER_PHRASES);
  const aiHits = countPhraseHits(text, AI_PATTERNS);

  const entities = (text.match(ENTITY_RE) || []).length;
  const numbers = (text.match(NUMBER_RE) || []).length;
  const densityPer100 = ((entities + numbers) * 100.0) / Math.max(1, nTokens);
  const informationDensity = Math.min(1.0, densityPer100 / 10.0);

  const rep = repetitionScore(tokens);
  const repScore = Math.round(rep * 100);

  const scale = Math.max(1.0, nTokens / 1000.0);
  const fillerPerKt = fillerHits.length / scale;
  const aiPerKt = aiHits.length / scale;

  const fillerScore = Math.min(100, Math.round(fillerPerKt * 25));
  const aiPatternScore = Math.min(100, Math.round(aiPerKt * 15));

  const flags = [];
  if (fillerScore >= 50) flags.push('filler');
  if (aiPatternScore >= 40) flags.push('ai-patterns');
  if (informationDensity < 0.20) flags.push('low-density');
  if (repScore >= 30) flags.push('repetitive');
  if (nTokens < 300) flags.push('thin-content');

  const overall = (
    (100 - fillerScore) * 0.25
    + (100 - aiPatternScore) * 0.25
    + informationDensity * 100 * 0.25
    + (100 - repScore) * 0.15
    + Math.min(100, nTokens / 10.0) * 0.10
  );

  return {
    fillerScore,
    aiPatternScore,
    informationDensity: Math.round(informationDensity * 1000) / 1000,
    repetitionScore: repScore,
    overallQuality: Math.round(overall),
    flags,
    matches: { filler: fillerHits, aiPatterns: aiHits },
    tokens: nTokens,
    uniqueTokens: unique,
  };
}

const CONTENT_QUALITY_PERMISSION = Object.freeze({ requiresAgentAssignment: true });

/**
 * Registers the content_quality_analysis skill onto a SkillRegistry.
 * @param {import('../SkillRegistry').SkillRegistry} registry
 */
function registerContentQualitySkill(registry) {
  registry.register('content_quality_analysis', {
    capability: 'marketing_content_quality',
    description: 'Scores text for filler, AI-typical phrasing, information density, and repetition (QRG-aligned, advisory only).',
    inputSchema: {
      text: { type: 'string', required: true },
      threshold: { type: 'number', required: false },
    },
    outputSchema: {
      fillerScore: { type: 'number', required: true },
      aiPatternScore: { type: 'number', required: true },
      informationDensity: { type: 'number', required: true },
      repetitionScore: { type: 'number', required: true },
      overallQuality: { type: 'number', required: true },
      flags: { type: 'array', required: true },
      matches: { type: 'object', required: true },
      tokens: { type: 'number', required: true },
      uniqueTokens: { type: 'number', required: true },
      passesThreshold: { type: 'boolean', required: true },
    },
    permissions: CONTENT_QUALITY_PERMISSION,
    handler: async ({ text, threshold = 60 }) => {
      const result = analyse(text);
      return { ...result, passesThreshold: result.overallQuality >= threshold };
    },
  });
  return registry;
}

module.exports = {
  registerContentQualitySkill,
  CONTENT_QUALITY_PERMISSION,
  analyse,
  FILLER_PHRASES,
  AI_PATTERNS,
};
