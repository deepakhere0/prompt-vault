// lib/optimizer.js — Prompt Optimizer module.
// All logic lives here so the button handler in content.js stays mode-agnostic.
// Mode A (built): wrap raw text in META_PROMPT for the host model to process.
// Mode B (future BYOK): call a provider API, return only the optimized prompt.

const Optimizer = (() => {
  'use strict';

  // ── Enhanced meta-prompt ─────────────────────────────────────────────────
  // Tune this constant to change optimizer quality. Nothing else needs editing.
  //
  // Language note: the In-Depth Answer is written in the USER REQUEST's language
  // by default (so a Hindi request gets a Hindi answer). To force English for
  // the answer too, change the line below that reads
  //   "Write the In-Depth Answer in the same language as the USER REQUEST."
  // to
  //   "Write the In-Depth Answer in English."
  const META_PROMPT =
`You will act in two stages within a single response: first as an elite prompt
engineer, then as a world-class domain expert.

The text under "USER REQUEST" is a raw request. It may be messy, vague,
incomplete, or written in another language. Do not point out that it is messy —
just elevate it.

STAGE 1 — Engineer the prompt:
Infer the user's true goal and the deepest underlying need behind their words.
Construct ONE high-end, professional English prompt engineered to pull the most
thorough and insightful possible answer from an expert AI. A high-end prompt:
- assigns a specific, qualified expert persona,
- states the objective and what an ideal answer must achieve,
- supplies the relevant context, scope, audience, and constraints,
- demands depth: reasoning, concrete examples, trade-offs, pitfalls, edge cases,
  and step-by-step actionable detail,
- where details are missing, directs that reasonable assumptions be stated
  rather than questions be asked.

STAGE 2 — Deliver the expert answer:
Adopt that persona and answer the engineered prompt yourself at the highest
level of depth and quality you are capable of. Be comprehensive, specific, and
genuinely insightful. Include concrete examples, important nuances, and valuable
adjacent points the user did not think to ask for. Explicitly state any
assumptions. Maximize real usefulness and informational depth; never be
shallow, generic, or padded.

OUTPUT FORMAT — use exactly these two sections:

**🔧 Optimized Prompt**
<the high-end English prompt from Stage 1>

**📘 In-Depth Answer**
<the comprehensive expert answer from Stage 2>

Write the Optimized Prompt in English. Write the In-Depth Answer in the same
language as the USER REQUEST. If the request is genuinely impossible to answer
usefully even with assumptions, instead ask up to three sharp clarifying
questions — and only then.

USER REQUEST:
"""
{{USER_TEXT}}
"""`;

  // Returns { mode, payload } — payload is the text to inject (Mode A)
  // or the optimized-prompt-only text to display for review (Mode B).
  async function optimize(rawText) {
    // ── Mode switch ──────────────────────────────────────────────────────────
    // When Mode B is added: read a setting here, branch, call provider API.
    // The button handler in content.js receives { mode, payload } and must
    // work regardless of which mode produced the result.

    // Mode A — host-model injection (no API key, no backend).
    const payload = META_PROMPT.replace('{{USER_TEXT}}', rawText);
    return { mode: 'A', payload };
  }

  return { META_PROMPT, optimize };
})();
