// popup.js — full CRUD dashboard for Prompt Vault.

(async function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let prompts = [];
  let activeCategory = 'All';
  let searchQuery = '';
  let editingId = null;

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const promptList     = document.getElementById('prompt-list');
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
  prompts = await Storage.getAll();
  render();

  // Load / save the auto-send setting (stored outside the prompts array).
  chrome.storage.local.get(['__pv_autosend'], (r) => {
    autoSendToggle.checked = !!r['__pv_autosend'];
  });
  autoSendToggle.addEventListener('change', () => {
    chrome.storage.local.set({ '__pv_autosend': autoSendToggle.checked });
  });

  // ── Event listeners ────────────────────────────────────────────────────────
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.toLowerCase();
    render();
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

  btnExport.addEventListener('click', exportJSON);
  btnImport.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', importJSON);

  // Auto-prepend "/" if the user forgets it
  fShortcut.addEventListener('blur', () => {
    const v = fShortcut.value.trim();
    if (v && !v.startsWith('/')) fShortcut.value = '/' + v;
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  function render() {
    // If the active category was removed (e.g. last prompt in it deleted), reset.
    if (activeCategory !== 'All' && !prompts.some((p) => p.category === activeCategory)) {
      activeCategory = 'All';
    }
    renderChips();
    renderList();
    renderCategoryDatalist();
  }

  function categories() {
    const cats = ['All', ...new Set(prompts.map((p) => p.category).filter(Boolean))];
    return cats;
  }

  function renderChips() {
    categoryChips.innerHTML = '';
    for (const cat of categories()) {
      const btn = document.createElement('button');
      btn.className = 'chip' + (cat === activeCategory ? ' active' : '');
      btn.textContent = cat;
      btn.addEventListener('click', () => {
        activeCategory = cat;
        render();
      });
      categoryChips.appendChild(btn);
    }
  }

  function filtered() {
    return prompts.filter((p) => {
      const matchCat = activeCategory === 'All' || p.category === activeCategory;
      const matchQ =
        !searchQuery ||
        p.title.toLowerCase().includes(searchQuery) ||
        p.shortcut.toLowerCase().includes(searchQuery) ||
        p.body.toLowerCase().includes(searchQuery);
      return matchCat && matchQ;
    });
  }

  function renderList() {
    promptList.innerHTML = '';
    const list = filtered();

    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = prompts.length === 0
        ? 'No prompts yet. Click "+ New Prompt" to get started.'
        : 'No prompts match your search.';
      promptList.appendChild(empty);
      return;
    }

    for (const p of list) {
      promptList.appendChild(buildCard(p));
    }
  }

  function renderCategoryDatalist() {
    categoryDL.innerHTML = '';
    const cats = new Set(prompts.map((p) => p.category).filter(Boolean));
    for (const c of cats) {
      const opt = document.createElement('option');
      opt.value = c;
      categoryDL.appendChild(opt);
    }
  }

  function buildCard(p) {
    const card = document.createElement('div');
    card.className = 'prompt-card';

    const body = document.createElement('div');
    body.className = 'card-body';

    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = p.title;

    const preview = document.createElement('div');
    preview.className = 'card-preview';
    preview.textContent = p.body.replace(/\n+/g, ' ').substring(0, 88) + (p.body.length > 88 ? '…' : '');

    const meta = document.createElement('div');
    meta.className = 'card-meta';

    if (p.shortcut) {
      const sb = document.createElement('span');
      sb.className = 'shortcut-badge';
      sb.textContent = p.shortcut;
      meta.appendChild(sb);
    }

    if (p.category) {
      const cb = document.createElement('span');
      cb.className = 'cat-badge';
      cb.textContent = p.category;
      meta.appendChild(cb);
    }

    body.appendChild(title);
    body.appendChild(preview);
    body.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-icon';
    editBtn.title = 'Edit';
    editBtn.textContent = '✏️';
    editBtn.addEventListener('click', () => openModal(p));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon danger';
    delBtn.title = 'Delete';
    delBtn.textContent = '🗑️';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (delBtn.dataset.confirming) {
        deletePrompt(p.id);
      } else {
        delBtn.dataset.confirming = '1';
        delBtn.className = 'btn-icon confirming';
        delBtn.textContent = 'Sure?';
        // Auto-reset after 3 s if user changes their mind
        setTimeout(() => {
          if (delBtn.dataset.confirming) {
            delete delBtn.dataset.confirming;
            delBtn.className = 'btn-icon danger';
            delBtn.textContent = '🗑️';
          }
        }, 3000);
      }
    });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    card.appendChild(body);
    card.appendChild(actions);
    return card;
  }

  // ── Modal ──────────────────────────────────────────────────────────────────
  function openModal(prompt) {
    editingId = prompt ? prompt.id : null;
    modalTitle.textContent = prompt ? 'Edit Prompt' : 'New Prompt';
    fTitle.value    = prompt ? prompt.title    : '';
    fShortcut.value = prompt ? prompt.shortcut : '';
    fCategory.value = prompt ? prompt.category : '';
    fBody.value     = prompt ? prompt.body     : '';
    hideError();
    modalOverlay.classList.remove('hidden');
    fTitle.focus();
  }

  function closeModal() {
    modalOverlay.classList.add('hidden');
    editingId = null;
  }

  function showError(msg) {
    modalError.textContent = msg;
    modalError.classList.remove('hidden');
  }

  function hideError() {
    modalError.textContent = '';
    modalError.classList.add('hidden');
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────
  async function savePrompt() {
    const title    = fTitle.value.trim();
    const shortcut = fShortcut.value.trim();
    const category = fCategory.value.trim();
    const body     = fBody.value.trim();

    if (!title) { showError('Title is required.'); fTitle.focus(); return; }
    if (!body)  { showError('Body is required.');  fBody.focus();  return; }

    if (shortcut && !shortcut.startsWith('/')) {
      showError('Shortcut must start with "/".');
      fShortcut.focus();
      return;
    }

    if (shortcut) {
      const collision = prompts.find(
        (p) => p.shortcut.toLowerCase() === shortcut.toLowerCase() && p.id !== editingId
      );
      if (collision) {
        showError(`Shortcut "${shortcut}" is already used by "${collision.title}".`);
        fShortcut.focus();
        return;
      }
    }

    if (editingId) {
      await Storage.update(editingId, { title, shortcut, category, body });
    } else {
      await Storage.add({
        id: Storage.makeId(),
        title,
        shortcut,
        category,
        body,
        createdAt: Date.now(),
      });
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
    const data = JSON.stringify(prompts, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'prompt-vault-export.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJSON(e) {
    const file = e.target.files[0];
    if (!file) return;
    importFile.value = '';

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!Array.isArray(data)) throw new Error('Expected a JSON array.');

      // Basic shape check.
      for (const item of data) {
        if (typeof item.id !== 'string' || typeof item.title !== 'string' || typeof item.body !== 'string') {
          throw new Error('Invalid prompt shape — each item needs id, title, and body.');
        }
      }

      const existing = await Storage.getAll();
      const existingIds = new Set(existing.map((p) => p.id));

      // Merge: skip duplicates by id, prepend new ones.
      const toAdd = data.filter((p) => !existingIds.has(p.id));
      await Storage.saveAll([...toAdd, ...existing]);
      prompts = await Storage.getAll();
      render();
      showToast(`Imported ${toAdd.length} prompt(s)` +
        (data.length - toAdd.length ? `, ${data.length - toAdd.length} duplicate(s) skipped.` : '.'), 'ok');
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error');
    }
  }
  // ── Toast ─────────────────────────────────────────────────────────────────
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
