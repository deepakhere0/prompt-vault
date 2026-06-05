// lib/optimizer.js — Prompt Optimizer v3.
// Assembles meta-prompts from independently tunable parts.
// Mode A (built):  inject assembled prompt into host chat; model handles both stages.
// Mode B seam (NOT built yet): see bottom comment for the BYOK API hook.

const Optimizer = (() => {
  'use strict';

  // ── Part 1 — PERSONAS ────────────────────────────────────────────────────
  // Maps intent key → expert persona opening line. Tune freely.
  const PERSONAS = {
    coding:   'You are a principal software architect and senior engineer.',
    research: 'You are a meticulous research expert and rigorous analyst.',
    business: 'You are a seasoned startup advisor and business strategist.',
    writing:  'You are an award-winning copywriter and sharp editor.',
    student:  'You are an expert teacher who explains clearly and builds understanding step by step.',
    goal:     'You are a strategic planning expert who turns vague goals into concrete, sequenced execution plans.',
    general:  'You are a top-tier domain expert in the subject of the request.',
  };

  // ── Part 2 — LEVELS ──────────────────────────────────────────────────────
  // Controls optimization strength. Tune freely.
  const LEVELS = {
    light:
      "Lightly clean and clarify the request. Stay close to the user's wording; " +
      "add only what's needed for clarity.",
    standard:
      'Rewrite into a clear, well-structured prompt with an explicit role, the needed ' +
      'context, and a sensible output format.',
    expert:
      'Produce a maximally rigorous prompt: explicit expert role, full context expansion, ' +
      'stated assumptions, constraints, edge cases, a structured output format, and ' +
      'directives for depth and concrete examples.',
  };

  // Used instead of a LEVEL when mode is 'goal'.
  const GOAL_EXPANSION_DIRECTIVE =
    "Expand the user's vague goal into a structured plan. Cover: " +
    'the clarified objective and definition of success; ' +
    'the skills and resources required (and gaps); ' +
    'a realistic timeline with phases and milestones; ' +
    'the main risks and how to mitigate them; ' +
    'and the recommended first concrete actions. State assumptions explicitly.';

  // ── Part 3 — CUSTOM INSTRUCTIONS ─────────────────────────────────────────
  // Appended verbatim when non-empty (user-managed, stored locally).
  // Accessed in buildPrompt — no constant needed here.

  // ── Part 4 — OUTPUT_SPEC ─────────────────────────────────────────────────
  // Language note: the In-Depth Answer mirrors the user's input language by default.
  // To force English for both sections, change the last sentence of this constant.
  const OUTPUT_SPEC =
    '\nOutput exactly two sections:\n\n' +
    '**🔧 Optimized Prompt**\n' +
    '<the high-end English prompt>\n\n' +
    '**📘 In-Depth Answer**\n' +
    '<the comprehensive expert answer>\n\n' +
    "Write the Optimized Prompt in English. Write the In-Depth Answer in the same language as the user's request.";

  // ── Intent keyword classifier (local, no network) ─────────────────────────
  // Tune these lists to shift detection behaviour without touching any other code.
  const INTENT_KEYWORDS = {
    coding:   ['code','function','bug','error','api','python','javascript','typescript','sql','deploy','regex','stack trace','github','git','debug','refactor','compile','algorithm','database','backend','frontend','react','node','docker','kubernetes','aws','linux','terminal','cli','script'],
    research: ['research','study','sources','evidence','analyze','literature','survey','paper','academic','citation','findings','methodology','hypothesis','statistics','scholarly'],
    business: ['startup','revenue','market','pricing','customers','business plan','go-to-market','investors','fundraising','saas','monetize','competitive','mvp','growth','churn','cac','ltv','runway','pitch deck'],
    writing:  ['write','blog','essay','article','story','copy','email','post','script','content','newsletter','headline','caption','tweet','draft','edit','rewrite','tone','voice','narrative'],
    student:  ['explain','learn','homework','assignment','teach me','what is','how does','understand','concept','exam','quiz','textbook','course','lecture','beginner'],
    goal:     ['i want to build','i want to start','i want to launch','i want to create','i want to become','my goal','how do i become','how do i start','life goal','career goal','i am trying to'],
  };

  function detectIntent(text) {
    const lower = (text || '').toLowerCase();
    const scores = {};
    for (const [intent, kws] of Object.entries(INTENT_KEYWORDS)) {
      scores[intent] = kws.filter(kw => lower.includes(kw)).length;
    }
    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return (best && best[1] > 0) ? best[0] : 'general';
  }

  // ── Default profiles ──────────────────────────────────────────────────────
  const DEFAULT_PROFILES = [
    { id: 'profile-dev',     name: 'Developer', mode: 'coding',   level: 'expert',   customInstructions: '' },
    { id: 'profile-founder', name: 'Founder',   mode: 'business', level: 'expert',   customInstructions: '' },
    { id: 'profile-student', name: 'Student',   mode: 'student',  level: 'standard', customInstructions: '' },
  ];
  const DEFAULT_PROFILE_IDS = new Set(DEFAULT_PROFILES.map(p => p.id));

  // ── Meta-prompt assembler ─────────────────────────────────────────────────
  // finalPrompt = PERSONA[intent] + levelDirective + customInstructions + OUTPUT_SPEC + userText
  //
  // Mode B seam (DO NOT build yet):
  //   A future `optimizeViaAPI()` would use PERSONAS[intent] as a system prompt and
  //   LEVELS[level] as an instruction, call an LLM with rawText, and return
  //   { originalText, optimizedPrompt } so the UI can show a diff + copy button.
  //   Keep buildPrompt() as-is; the API path simply uses these parts differently.
  function buildPrompt({ rawText, mode, level, customInstructions }) {
    const intent         = (mode === 'auto') ? detectIntent(rawText) : mode;
    const persona        = PERSONAS[intent] || PERSONAS.general;
    const isGoal         = mode === 'goal' || (mode === 'auto' && intent === 'goal');
    const levelDirective = isGoal ? GOAL_EXPANSION_DIRECTIVE : (LEVELS[level] || LEVELS.standard);
    const custom         = (customInstructions || '').trim();

    return [
      persona,
      '',
      levelDirective,
      ...(custom ? ['', 'Additional instructions: ' + custom] : []),
      OUTPUT_SPEC,
      '',
      'USER REQUEST:',
      '"""',
      rawText,
      '"""',
    ].join('\n');
  }

  // Returns { mode: 'A', payload, detectedIntent }
  async function optimize(rawText, opts = {}) {
    const { mode = 'auto', level = 'standard', customInstructions = '' } = opts;
    const detectedIntent = (mode === 'auto') ? detectIntent(rawText) : mode;
    const payload        = buildPrompt({ rawText, mode, level, customInstructions });
    return { mode: 'A', payload, detectedIntent };
  }

  return {
    PERSONAS, LEVELS, GOAL_EXPANSION_DIRECTIVE, OUTPUT_SPEC,
    INTENT_KEYWORDS, DEFAULT_PROFILES, DEFAULT_PROFILE_IDS,
    detectIntent, buildPrompt, optimize,
  };
})();
