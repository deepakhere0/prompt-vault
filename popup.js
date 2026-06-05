// popup.js — full CRUD dashboard + bundled library browser.

(async function () {
  'use strict';

  const PAGE_SIZE = 25;

  // ── State ──────────────────────────────────────────────────────────────────
  let prompts        = [];   // user's personal prompts  (editable)
  let libraryPrompts = [];   // bundled library           (read-only)
  let activeSource   = 'All';  // 'All' | 'Library' | 'Mine'
  let activeCategory = 'All';
  let searchQuery    = '';
  let editingId      = null;
  let renderCount    = PAGE_SIZE;
  let searchTimer    = null;

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const promptList     = document.getElementById('prompt-list');
  const sourceChipsEl  = document.getElementById('source-chips');
  const categoryChips  = document.getElementById('category-chips');
  const searchInput    = document.getElementById('search');
  const btnAdd         = document.getElementById('btn-add');
  const btnImport      = document.getElementById('btn-import');
  const btnExport      = document.getElementById('btn-export');
  const importFile     = document.getElementById('import-file');
  const autoSendToggle = document.getElementById('opt-autosend');
  const modalOverlay   = document.getElementById('modal-overlay');
  const modalTitle     = document.getElementById('modal-title');
  const fTitle         = document.getElementById('f-title');
  const fShortcut      = document.getElementById('f-shortcut');
  const fCategory      = document.getElementById('f-category');
  const fBody          = document.getElementById('f-body');
  const modalError     = document.getElementById('modal-error');
  const modalCancel    = document.getElementById('modal-cancel');
  const modalSave      = document.getElementById('modal-save');
  const categoryDL     = document.getElementById('category-list');

  // ── Boot ───────────────────────────────────────────────────────────────────
  [prompts, libraryPrompts] = await Promise.all([
    Storage.getAll(),
    Storage.getLibrary(),
  ]);
  render();

  chrome.storage.local.get(['__pv_autosend'], (r) => {
    autoSendToggle.checked = !!r['__pv_autosend'];
  });
  autoSendToggle.addEventListener('change', () => {
    chrome.storage.local.set({ '__pv_autosend': autoSendToggle.checked });
  });

  // ── Event listeners ────────────────────────────────────────────────────────
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = searchInput.value.toLowerCase().trim();
      renderCount = PAGE_SIZE;
      render();
    }, 150);
  });

  btnAdd.addEventListener('click', () => openModal(null));
  modalCancel.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
  modalSave.addEventListener('click', savePrompt);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Enter' && !modalOverlay.classList.contains('hidden')) {
      if (document.activeElement !== fBody) savePrompt();
    }
  });

  fShortcut.addEventListener('blur', () => {
    const v = fShortcut.value.trim();
    if (v && !v.startsWith('/')) fShortcut.value = '/' + v;
  });

  btnExport.addEventListener('click', exportJSON);
  btnImport.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', importJSON);

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Merge both pools, tagging each item with its source.
  function allTagged() {
    return [
      ...prompts.map(p        => ({ ...p, _src: 'mine' })),
      ...libraryPrompts.map(p => ({ ...p, _src: 'lib'  })),
    ];
  }

  // Return items matching the active source + category + search filters.
  function filtered() {
    return allTagged().filter(p => {
      if (activeSource === 'Library' && p._src !== 'lib')  return false;
      if (activeSource === 'Mine'    && p._src !== 'mine') return false;
      if (activeCategory !== 'All'   && p.category !== activeCategory) return false;
      if (!searchQuery) return true;
      const q = searchQuery;
      return p.title.toLowerCase().includes(q) ||
             p.body.toLowerCase().includes(q)  ||
             (p.category || '').toLowerCase().includes(q);
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function render() {
    renderSourceChips();
    renderCategoryChips();
    renderList();
    renderCategoryDatalist();
  }

  function renderSourceChips() {
    sourceChipsEl.innerHTML = '';
    const sources = [
      { key: 'All',     label: `All (${prompts.length + libraryPrompts.length})` },
      { key: 'Mine',    label: `My Prompts (${prompts.length})` },
      { key: 'Library', label: `Library (${libraryPrompts.length})` },
    ];
    for (const s of sources) {
      const btn = document.createElement('button');
      btn.className = 'chip' + (s.key === activeSource ? ' active' : '');
      btn.textContent = s.label;
      btn.addEventListener('click', () => {
        activeSource = s.key;
        activeCategory = 'All';
        renderCount = PAGE_SIZE;
        render();
      });
      sourceChipsEl.appendChild(btn);
    }
  }

  function renderCategoryChips() {
    // Build categories from the currently-visible source pool.
    const pool = allTagged().filter(p =>
      (activeSource === 'All')     ||
      (activeSource === 'Library'  && p._src === 'lib')  ||
      (activeSource === 'Mine'     && p._src === 'mine')
    );
    const cats = new Set(pool.map(p => p.category).filter(Boolean));
    if (activeCategory !== 'All' && !cats.has(activeCategory)) activeCategory = 'All';

    categoryChips.innerHTML = '';
    for (const cat of ['All', ...[...cats].sort()]) {
      const btn = document.createElement('button');
      btn.className = 'chip' + (cat === activeCategory ? ' active' : '');
      btn.textContent = cat;
      btn.addEventListener('click', () => {
        activeCategory = cat;
        renderCount = PAGE_SIZE;
        renderList();
      });
      categoryChips.appendChild(btn);
    }
  }

  function renderList() {
    promptList.innerHTML = '';
    const list = filtered();

    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = (prompts.length + libraryPrompts.length) === 0
        ? 'No prompts yet. Click "+ New Prompt" to get started.'
        : 'No prompts match your search.';
      promptList.appendChild(empty);
      return;
    }

    const visible = list.slice(0, renderCount);
    for (const p of visible) {
      promptList.appendChild(p._src === 'lib' ? buildLibCard(p) : buildMineCard(p));
    }

    if (list.length > renderCount) {
      const row = document.createElement('div');
      row.className = 'load-more-row';
      const btn = document.createElement('button');
      btn.className = 'btn-ghost load-more-btn';
      const remaining = list.length - renderCount;
      btn.textContent = `Show ${Math.min(PAGE_SIZE, remaining)} more  (${remaining} remaining)`;
      btn.addEventListener('click', () => { renderCount += PAGE_SIZE; renderList(); });
      row.appendChild(btn);
      promptList.appendChild(row);
    }
  }

  function renderCategoryDatalist() {
    categoryDL.innerHTML = '';
    for (const c of new Set(prompts.map(p => p.category).filter(Boolean))) {
      const opt = document.createElement('option');
      opt.value = c;
      categoryDL.appendChild(opt);
    }
  }

  // ── Card builders ──────────────────────────────────────────────────────────
  function buildPreview(body) {
    const el = document.createElement('div');
    el.className = 'card-preview';
    el.textContent = body.replace(/\n+/g, ' ').substring(0, 88) + (body.length > 88 ? '…' : '');
    return el;
  }

  function buildMeta(p) {
    const meta = document.createElement('div');
    meta.className = 'card-meta';
    if (p.shortcut) {
      const sb = document.createElement('span');
      sb.className = 'shortcut-badge'; sb.textContent = p.shortcut;
      meta.appendChild(sb);
    }
    if (p.category) {
      const cb = document.createElement('span');
      cb.className = 'cat-badge'; cb.textContent = p.category;
      meta.appendChild(cb);
    }
    return meta;
  }

  function buildMineCard(p) {
    const card = document.createElement('div');
    card.className = 'prompt-card';

    const body = document.createElement('div');
    body.className = 'card-body';

    const title = document.createElement('div');
    title.className = 'card-title'; title.textContent = p.title;

    body.appendChild(title);
    body.appendChild(buildPreview(p.body));
    body.appendChild(buildMeta(p));

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const insertBtn = makeIconBtn('↩', 'Insert into chat', () => insertFromPopup(p.body));
    const editBtn   = makeIconBtn('✏️', 'Edit', () => openModal(p));
    const delBtn    = makeIconBtn('🗑️', 'Delete', null, 'danger');

    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (delBtn.dataset.confirming) {
        deletePrompt(p.id);
      } else {
        delBtn.dataset.confirming = '1';
        delBtn.className = 'btn-icon confirming';
        delBtn.textContent = 'Sure?';
        setTimeout(() => {
          if (delBtn.dataset.confirming) {
            delete delBtn.dataset.confirming;
            delBtn.className = 'btn-icon danger';
            delBtn.textContent = '🗑️';
          }
        }, 3000);
      }
    });

    actions.appendChild(insertBtn);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    card.appendChild(body);
    card.appendChild(actions);
    return card;
  }

  function buildLibCard(p) {
    const card = document.createElement('div');
    card.className = 'prompt-card library-card';

    const body = document.createElement('div');
    body.className = 'card-body';

    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;align-items:center;gap:6px;min-width:0;';

    const title = document.createElement('div');
    title.className = 'card-title'; title.textContent = p.title;

    const badge = document.createElement('span');
    badge.className = 'lib-badge'; badge.textContent = 'Library';

    titleRow.appendChild(title);
    titleRow.appendChild(badge);

    body.appendChild(titleRow);
    body.appendChild(buildPreview(p.body));
    body.appendChild(buildMeta(p));

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const insertBtn = makeIconBtn('↩', 'Insert into chat', () => insertFromPopup(p.body));
    const saveBtn   = makeIconBtn('＋', 'Save to My Prompts', () => saveToMine(p), 'save-btn');

    actions.appendChild(insertBtn);
    actions.appendChild(saveBtn);
    card.appendChild(body);
    card.appendChild(actions);
    return card;
  }

  function makeIconBtn(text, title, onClick, extraClass = '') {
    const btn = document.createElement('button');
    btn.className = 'btn-icon' + (extraClass ? ' ' + extraClass : '');
    btn.title = title;
    btn.textContent = text;
    if (onClick) btn.addEventListener('click', onClick);
    return btn;
  }

  // ── Insert from popup via content-script message ───────────────────────────
  async function insertFromPopup(body) {
    let tab;
    try {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    } catch {
      showToast('Cannot access the active tab.', 'error'); return;
    }
    if (!tab) { showToast('No active tab.', 'error'); return; }
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'PV_INSERT', body });
      if (res?.ok) window.close();
      else showToast('Open a supported AI chat site first.', 'error');
    } catch {
      showToast('Open a supported AI chat site first.', 'error');
    }
  }

  // ── Save library item to personal prompts ──────────────────────────────────
  async function saveToMine(libPrompt) {
    const dupe = prompts.some(p => p.title.toLowerCase() === libPrompt.title.toLowerCase());
    if (dupe) { showToast(`"${libPrompt.title}" is already in My Prompts.`); return; }

    const copy = {
      id:        Storage.makeId(),
      title:     libPrompt.title,
      shortcut:  '',
      category:  libPrompt.category,
      body:      libPrompt.body,
      createdAt: Date.now(),
    };
    await Storage.add(copy);
    prompts = await Storage.getAll();
    render();
    showToast(`Saved to My Prompts — add a shortcut to use it instantly.`, 'ok');
  }

  // ── Modal ──────────────────────────────────────────────────────────────────
  function openModal(prompt) {
    editingId = prompt ? prompt.id : null;
    modalTitle.textContent = prompt ? 'Edit Prompt' : 'New Prompt';
    fTitle.value    = prompt?.title    ?? '';
    fShortcut.value = prompt?.shortcut ?? '';
    fCategory.value = prompt?.category ?? '';
    fBody.value     = prompt?.body     ?? '';
    hideError();
    modalOverlay.classList.remove('hidden');
    fTitle.focus();
  }

  function closeModal() {
    modalOverlay.classList.add('hidden');
    editingId = null;
  }

  function showError(msg) { modalError.textContent = msg; modalError.classList.remove('hidden'); }
  function hideError()    { modalError.textContent = ''; modalError.classList.add('hidden'); }

  // ── CRUD ───────────────────────────────────────────────────────────────────
  async function savePrompt() {
    const title    = fTitle.value.trim();
    const shortcut = fShortcut.value.trim();
    const category = fCategory.value.trim();
    const body     = fBody.value.trim();

    if (!title) { showError('Title is required.'); fTitle.focus(); return; }
    if (!body)  { showError('Body is required.');  fBody.focus();  return; }

    if (shortcut && !shortcut.startsWith('/')) {
      showError('Shortcut must start with "/".'); fShortcut.focus(); return;
    }
    if (shortcut) {
      const collision = prompts.find(
        p => p.shortcut.toLowerCase() === shortcut.toLowerCase() && p.id !== editingId
      );
      if (collision) {
        showError(`"${shortcut}" is already used by "${collision.title}".`);
        fShortcut.focus(); return;
      }
    }

    if (editingId) {
      await Storage.update(editingId, { title, shortcut, category, body });
    } else {
      await Storage.add({ id: Storage.makeId(), title, shortcut, category, body, createdAt: Date.now() });
    }
    prompts = await Storage.getAll();
    render();
    closeModal();
  }

  async function deletePrompt(id) {
    await Storage.remove(id);
    prompts = await Storage.getAll();
    render();
    showToast('Prompt deleted.');
  }

  // ── Import / Export ────────────────────────────────────────────────────────
  function exportJSON() {
    const blob = new Blob([JSON.stringify(prompts, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'prompt-vault-export.json'; a.click();
    URL.revokeObjectURL(url);
  }

  async function importJSON(e) {
    const file = e.target.files[0];
    if (!file) return;
    importFile.value = '';
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data)) throw new Error('Expected a JSON array.');
      for (const item of data) {
        if (typeof item.id !== 'string' || typeof item.title !== 'string' || typeof item.body !== 'string')
          throw new Error('Invalid prompt shape — each item needs id, title, and body.');
      }
      const existing    = await Storage.getAll();
      const existingIds = new Set(existing.map(p => p.id));
      const toAdd       = data.filter(p => !existingIds.has(p.id));
      await Storage.saveAll([...toAdd, ...existing]);
      prompts = await Storage.getAll();
      render();
      showToast(
        `Imported ${toAdd.length} prompt(s)` +
        (data.length - toAdd.length ? `, ${data.length - toAdd.length} duplicate(s) skipped.` : '.'),
        'ok'
      );
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error');
    }
  }

  // ── Toast ──────────────────────────────────────────────────────────────────
  function showToast(msg, type = '') {
    const t = document.createElement('div');
    t.className = 'toast' + (type ? ' toast-' + type : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => {
      t.classList.add('toast-out');
      setTimeout(() => t.remove(), 260);
    }, 2400);
  }
})();
