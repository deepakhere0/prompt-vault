# Prompt Vault ⚡

Turn saved prompts into typed shortcuts inside AI chat sites. Type `/seo` and the full prompt lands in the chat box — variables, formatting, and all.

## What's inside

- **My Prompts** — your personal, fully editable prompts with `/shortcuts`
- **Library** — 50 curated, ready-to-use prompts across 13 categories (read-only baseline)

Browse and search both from the popup and the in-page ⚡ panel. To turn a library prompt into a shortcut: click **＋ Save to My Prompts**, open the popup, edit it, and assign a `/shortcut`. Shortcut detection only runs against My Prompts — the library never interferes with typed shortcuts.

## Supported sites

| Site | Shortcut injection | Floating panel |
|---|---|---|
| chatgpt.com | ✓ | ✓ |
| chat.openai.com | ✓ | ✓ |
| claude.ai | ✓ | ✓ |
| gemini.google.com | ✓ | ✓ |
| perplexity.ai | ✓ | ✓ |

---

## Install

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked** → select the `vault-extension` folder
4. The ⚡ icon appears in your toolbar

---

## Features

### 1 — Shortcut injection

Type a shortcut followed by **Space** or **Tab** in any chat input. The shortcut is replaced with the full prompt body.

```
/seo       → full SEO outline prompt (with variable modal)
/eli5      → explain like I'm 5 prompt
/debug     → debug helper prompt
```

- Works in both `<textarea>` (some sites) and rich `contenteditable` editors (ChatGPT, Claude, Gemini)
- Case-insensitive: `/SEO` matches `/seo`
- Only triggers when the shortcut is the last word before the cursor — safe to type mid-sentence
- **Never intercepts Enter** — your message won't send accidentally

### 2 — Floating ⚡ panel

A small ⚡ button floats on the right side of supported pages.

- **Click** to open a panel with all your prompts
- **Search** across title, shortcut, and body text
- **Filter** by category using the chip row
- **Click any prompt** to insert it at the cursor position
- **Drag** the button up/down to reposition it — position is remembered
- **Esc** closes the panel

### 3 — Save from anywhere

Select any text on any web page → right-click → **Save selection to Prompt Vault**.

- Saves with the first 40 characters as the title, category `Saved`, no shortcut
- The toolbar badge shows **+1** briefly to confirm
- Assign a shortcut later via the popup dashboard

### 4 — Dynamic variables

Write `[Variable Name]` anywhere in a prompt body. When the prompt is triggered (by shortcut or panel click), a modal appears with one input per unique variable.

```
Write a blog post about [Topic] in a [Tone] voice.
```

- Same variable name appearing multiple times → filled once, substituted everywhere
- Press **Tab** / **Enter** to advance through fields; **Enter** on the last field submits
- **Esc** cancels — your original text is untouched
- Leaving a field empty keeps the `[Variable Name]` literal in the inserted text

### 5 — Prompt Optimizer ✨

A ✨ button appears below the ⚡ launcher on all supported sites.

**How it works (Mode A — no API key needed):**
1. Type a messy, vague, or non-English request into the chat box
2. Click ✨ — the extension wraps your text in a two-stage meta-prompt and replaces the input
3. Press Enter — the AI runs both stages and returns the two-section response

**The model runs two stages in one turn:**
- **Stage 1 (Prompt Engineer):** Infers your true goal, assigns a qualified expert persona, and constructs a high-end English prompt with explicit role, objective, context, constraints, and a demand for depth (examples, trade-offs, edge cases, actionable detail)
- **Stage 2 (Domain Expert):** Adopts that persona and answers at the highest quality it can — comprehensive, specific, with nuances and adjacent insights you didn't think to ask for

**Output format — always two sections:**

```
🔧 Optimized Prompt
<the high-end English prompt>

📘 In-Depth Answer
<the comprehensive expert answer>
```

**Language behaviour:** The `🔧 Optimized Prompt` is always in English. The `📘 In-Depth Answer` is written in the **same language as your request** — so a Hindi request gets a Hindi in-depth answer. To change this, edit the one marked line in `lib/optimizer.js`.

**Save the result:** Select the `🔧 Optimized Prompt` block → right-click → **Save selection to Prompt Vault** → assign a shortcut. That's the optimize → vault loop: clean a rough idea once, reuse the polished version as a shortcut forever.

**Empty input** → toast notification, no injection.  
**Double-wrap guard** → if the input already contains the meta-prompt, shows "Already optimized." toast.

**Auto-send after Optimize** (popup settings toggle, default OFF): when enabled, the extension automatically presses send after injecting the wrapped prompt.

> *BYOK mode (bring-your-own API key) is planned for a future release. The optimizer module (`lib/optimizer.js`) is already structured for the mode switch.*

### 6 — Popup management dashboard

Click the ⚡ toolbar icon to open the full dashboard.

| Action | How |
|---|---|
| Add a prompt | **+ New Prompt** button |
| Edit a prompt | Hover a card → ✏️ |
| Delete a prompt | Hover → 🗑️ → **Sure?** (2-step confirm) |
| Search | Search box at the top |
| Filter by category | Category chips below the search |
| Export all prompts | **Export JSON** in the footer |
| Import prompts | **Import JSON** in the footer |

**Shortcut rules:** must start with `/`, no spaces. Duplicates are blocked with a warning. If you forget the `/`, it's added automatically on blur.

### 6 — Import / Export

- **Export** saves all prompts as `prompt-vault-export.json`
- **Import** merges a JSON file into your vault — prompts with the same `id` are skipped to avoid duplicates
- JSON shape: array of `{ id, title, shortcut, category, body, createdAt }`

---

## Default prompts

Seeded on first install only — never overwrites existing data.

| Shortcut | Title | Category | Variables |
|---|---|---|---|
| `/seo` | SEO Blog Outline | Marketing | `[Topic]`, `[Tone]`, `[Audience]` |
| `/coldemail` | Cold Email (PAS) | Sales | `[Recipient role]`, `[What I offer]`, `[Problem]` |
| `/blog` | Blog Post | Marketing | `[Topic]`, `[Tone]` |
| `/eli5` | Explain Like I'm 5 | Learning | `[Concept]` |
| `/debug` | Debug Helper | Coding | `[Stack]` |

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| Space / Tab | Trigger shortcut injection |
| Tab / Enter | Advance to next variable field |
| Enter (last field) | Submit variable modal |
| Esc | Cancel modal / close panel |

---

## Privacy & data

- All prompts are stored locally in `chrome.storage.local`
- No account, no backend, no analytics, no network calls from injected scripts
- Uninstalling the extension clears all stored data automatically

---

## Troubleshooting

**Shortcut not triggering**
- Make sure the shortcut starts with `/` (check in the popup dashboard)
- Click inside the chat input first, then type the shortcut
- Try reloading the page after installing/updating the extension

**⚡ button not appearing**
- The button only shows on the five supported sites listed above
- Try a hard reload (`Cmd+Shift+R` / `Ctrl+Shift+R`)
- Check `chrome://extensions` to confirm the extension is enabled

**Panel inserts into the wrong place**
- Click inside the chat input box first, then open the panel — the last focused input is remembered

**After a Chrome update the extension stops working**
- Go to `chrome://extensions` and click the refresh icon on the Prompt Vault card

**Context menu item missing**
- Go to `chrome://extensions`, click the refresh icon on Prompt Vault, then reload the page

---

*Future roadmap (not in this build): cloud sync, team sharing, usage analytics.*
