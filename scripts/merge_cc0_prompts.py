#!/usr/bin/env python3
"""
merge_cc0_prompts.py
Transforms the prompts.chat (fka/awesome-chatgpt-prompts) CC0 dataset into the
Prompt Vault schema and merges it into data/prompt-library.json, de-duplicated.

Source license: CC0 1.0 Universal (public domain) — free to copy/modify/use
commercially, no attribution required. Do NOT add jailbreak/scraped/paid sets.

Usage (run from extension root):
  curl -sSL -o prompts_chat.csv \
    https://raw.githubusercontent.com/f/awesome-chatgpt-prompts/main/prompts.csv
  python3 scripts/merge_cc0_prompts.py
"""
import csv, json, re, time, os, sys
csv.field_size_limit(10_000_000)

# Paths relative to the extension root (run from there, not from scripts/).
ROOT     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIB_PATH = os.path.join(ROOT, "data", "prompt-library.json")
CSV_PATH = os.path.join(ROOT, "prompts_chat.csv")
OUT_PATH = LIB_PATH   # overwrite in place

if not os.path.exists(CSV_PATH):
    sys.exit(
        f"ERROR: {CSV_PATH} not found.\n"
        "Download it first:\n"
        "  curl -sSL -o prompts_chat.csv \\\n"
        "    https://raw.githubusercontent.com/f/awesome-chatgpt-prompts/main/prompts.csv"
    )

# --- our category taxonomy + extras for persona/utility prompts ---
CATEGORY_RULES = [
    ("Coding & Engineering",    ["developer","code","programmer","terminal","python","javascript","sql","regex","linux","git","api","debug","software","engineer","compiler","interpreter","devops","stackoverflow","css","html","php"]),
    ("Writing & Content",       ["write","writer","essay","story","poet","novel","author","screenwriter","copywrit","article","blog","editor","proofread","ghostwriter","title generator","plagiarism"]),
    ("Marketing & Growth",      ["marketing","advertis","brand","growth","social media influencer","content marketing"]),
    ("SEO",                     ["seo","search engine"]),
    ("Sales & Outreach",        ["sales","salesperson","recruiter","negotiat","cold email"]),
    ("Career & Job Search",     ["interviewer","resume","career","cover letter","job","hr ","human resources"]),
    ("Learning & Research",     ["teacher","tutor","instructor","educator","explain","professor","lecturer","study","language","translator","etymolog","dictionary","research","scientist","mathematician","philosoph","historian"]),
    ("Productivity & Thinking", ["coach","mentor","life coach","productivity","decision","advisor","motivat","assistant","planner"]),
    ("Business & Finance",      ["financ","accountant","investment","economist","startup","business","entrepreneur","stock","tax","budget"]),
    ("Communication & Email",   ["email","spoken","communicat","customer support","chat","speech"]),
    ("Product & Strategy",      ["product manager","strategy","consultant","analyst"]),
    ("Data & Analysis",         ["data scientist","data analyst","statistic","analytics","spreadsheet","excel"]),
    ("Design & UX",             ["ux","ui","designer","prompt generator for midjourney","logo","graphic"]),
    ("Health & Wellness",       ["doctor","dentist","therapist","psycholog","nutrition","personal trainer","fitness","mental health","yoga"]),
    ("Travel & Lifestyle",      ["travel guide","chef","recipe","sommelier","florist","interior decorator","real estate","car ","fashion"]),
    ("Entertainment & Roleplay",["act as a character","storyteller","stand-up","comedian","rapper","composer","musician","movie","game","dungeon","magician","santa","fictional","roleplay","pet"]),
]
DEFAULT_CATEGORY = "Roleplay & Personas"

def categorize(act, body):
    hay = (act + " " + body).lower()
    for cat, kws in CATEGORY_RULES:
        for kw in kws:
            if kw in hay:
                return cat
    return DEFAULT_CATEGORY

def norm(s):
    return re.sub(r'[^a-z0-9]', '', (s or "").lower())

def dedupe_key(title, body):
    return (norm(title), norm(body)[:60])

# --- load existing curated library ---
with open(LIB_PATH, encoding="utf-8") as f:
    existing = json.load(f)
seen = {dedupe_key(p["title"], p["body"]) for p in existing}

# --- read CC0 csv ---
added, skipped_dup, skipped_img, skipped_empty = [], 0, 0, 0
now = int(time.time() * 1000)
idx = 0
with open(CSV_PATH, encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        act   = (row.get("act")    or "").strip()
        body  = (row.get("prompt") or "").strip()
        ptype = (row.get("type")   or "TEXT").strip().upper()
        if ptype == "IMAGE":          # skip image-gen prompts; this is a chat vault
            skipped_img += 1; continue
        if not act or not body:
            skipped_empty += 1; continue
        k = dedupe_key(act, body)
        if k in seen:
            skipped_dup += 1; continue
        seen.add(k)
        idx += 1
        added.append({
            "id":        f"lib-cc0-{idx:04d}",
            "title":     act,
            "shortcut":  "",          # browse/search-only; save to My Prompts to assign a shortcut
            "category":  categorize(act, body),
            "body":      body,
            "createdAt": now,
        })

merged = existing + added
with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(merged, f, ensure_ascii=False, indent=2)

# --- report ---
from collections import Counter
print(f"existing curated : {len(existing)}")
print(f"CC0 added        : {len(added)}")
print(f"  skipped dup    : {skipped_dup}")
print(f"  skipped image  : {skipped_img}")
print(f"  skipped empty  : {skipped_empty}")
print(f"TOTAL merged     : {len(merged)}")
print(f"output size      : {round(os.path.getsize(OUT_PATH)/1024, 1)} KB")
print("category breakdown:")
for cat, n in Counter(p["category"] for p in merged).most_common():
    print(f"  {cat}: {n}")
