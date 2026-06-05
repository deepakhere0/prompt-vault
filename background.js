// background.js — service worker
// Handles: first-install seed, context-menu "Save selection", badge feedback.

const SEED_PROMPTS = [
  {
    id: 'seed-seo',
    title: 'SEO Blog Outline',
    shortcut: '/seo',
    category: 'Marketing',
    body: 'You are an expert SEO strategist. Write a detailed blog post outline for the topic: [Topic].\n\nInclude:\n- An H1 title\n- 6–9 H2 section headings\n- 3–5 related long-tail keyword suggestions\n- A meta description under 155 characters\n- A clear CTA at the end\n\nTone: [Tone]\nTarget Audience: [Audience]',
    createdAt: 0,
  },
  {
    id: 'seed-coldemail',
    title: 'Cold Email (PAS)',
    shortcut: '/coldemail',
    category: 'Sales',
    body: 'Write a cold outreach email using the PAS (Problem–Agitate–Solution) framework.\n\nRecipient role: [Recipient role]\nWhat I offer: [What I offer]\nCore problem: [Problem]\n\nRequirements: subject line under 6 words, email body under 120 words, one clear CTA, conversational and human tone. No buzzwords.',
    createdAt: 0,
  },
  {
    id: 'seed-blog',
    title: 'Blog Post',
    shortcut: '/blog',
    category: 'Marketing',
    body: 'Write a 900–1100 word blog post on: [Topic]\n\nFormat:\n- Start with a one-line TL;DR\n- Use descriptive subheadings\n- Include 2–3 concrete examples\n- End with a clear takeaway/conclusion\n\nVoice/Tone: [Tone]',
    createdAt: 0,
  },
  {
    id: 'seed-eli5',
    title: 'Explain Like I\'m 5',
    shortcut: '/eli5',
    category: 'Learning',
    body: 'Explain [Concept] to a smart 12-year-old.\n\nRules:\n- Use one everyday analogy\n- Zero jargon (if you must use a technical term, define it immediately)\n- End with a single sentence: "Why it matters: …"',
    createdAt: 0,
  },
  {
    id: 'seed-debug',
    title: 'Debug Helper',
    shortcut: '/debug',
    category: 'Coding',
    body: 'You are a senior engineer. Help me debug this issue in [Stack].\n\nProvide:\n1. Root cause in one sentence\n2. The corrected code (with the minimal diff needed)\n3. A brief explanation of why the original code was wrong and what the fix does\n\nDo not add unrelated refactors.',
    createdAt: 0,
  },
];

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const existing = await storageGet('prompts');
    if (!existing || existing.length === 0) {
      await storageSet('prompts', SEED_PROMPTS);
    }
  }

  // removeAll first so extension updates don't throw a duplicate-ID error.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'save-to-vault',
      title: 'Save selection to Prompt Vault',
      contexts: ['selection'],
    });
  });
});

// Re-register context menu on startup (service workers can be killed and restarted).
chrome.runtime.onStartup.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'save-to-vault',
      title: 'Save selection to Prompt Vault',
      contexts: ['selection'],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'save-to-vault') return;

  const selection = (info.selectionText || '').trim();
  if (!selection) return; // nothing meaningful to save

  const title = selection.slice(0, 40) + (selection.length > 40 ? '…' : '');

  const prompt = {
    id: 'p-' + Date.now(),
    title,
    shortcut: '',
    category: 'Saved',
    body: selection,
    createdAt: Date.now(),
  };

  const existing = (await storageGet('prompts')) || [];
  existing.unshift(prompt);
  await storageSet('prompts', existing);

  // Badge feedback: show "+1" for ~1.8s.
  chrome.action.setBadgeText({ text: '+1' });
  chrome.action.setBadgeBackgroundColor({ color: '#3a7a67' }); // dark enough for Chrome's white badge text
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 1800);
});

// Minimal storage helpers for the service worker (can't share lib/storage.js module directly).
function storageGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => resolve(result[key] || null));
  });
}

function storageSet(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}
