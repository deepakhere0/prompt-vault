// content.js — shortcut injection + floating ⚡ panel + variable modal

(function () {
  'use strict';

  if (window.__promptVaultLoaded) return;
  window.__promptVaultLoaded = true;

  // ── Constants ─────────────────────────────────────────────────────────────

  const PV_HOST_ID      = '__pv-host';
  const BTN_Y_STORE_KEY = '__pv_btn_y_pct';
  const DEFAULT_Y_PCT   = 72;

  // ── State ─────────────────────────────────────────────────────────────────

  let lastActiveInput = null;  // last focused chat input — target for panel inserts
  let pvShadow        = null;
  let pvBtnEl         = null;
  let pvOptBtnEl      = null;
  let pvPanelEl       = null;
  let panelOpen       = false;
  let panelCategory   = 'All';
  let dragState       = null;
  let activeModal     = null;

  // ── Input type detection ──────────────────────────────────────────────────

  function isTextareaEl(el) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName === 'INPUT') {
      const skip = ['checkbox','radio','submit','button','reset','file','image','range','color','hidden'];
      return !skip.includes((el.type || '').toLowerCase());
    }
    return false;
  }

  function isContentEditableEl(el) {
    return !!(el && el.isContentEditable);
  }

  function isOurElement(el) {
    return !!(el && el.closest && el.closest('#' + PV_HOST_ID));
  }

  // Track last focused chat input so panel inserts know where to go.
  document.addEventListener('focusin', (e) => {
    if ((isTextareaEl(e.target) || isContentEditableEl(e.target)) && !isOurElement(e.target)) {
      lastActiveInput = e.target;
    }
  }, true);

  // ── Read text before the caret ────────────────────────────────────────────

  function getTextBeforeCaret(el) {
    if (isTextareaEl(el)) {
      return el.value.substring(0, el.selectionStart);
    }
    if (isContentEditableEl(el)) {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return '';
      const range = sel.getRangeAt(0);
      const node  = range.endContainer;
      if (node.nodeType !== Node.TEXT_NODE) return '';
      return node.textContent.substring(0, range.endOffset);
    }
    return '';
  }

  function extractToken(textBefore) {
    const m = textBefore.match(/(\/\S+)$/);
    return m ? m[1] : null;
  }

  // ── Replace a token in the active input ──────────────────────────────────

  function replaceTokenTextarea(el, token, replacement) {
    const caretPos  = el.selectionStart;
    const val       = el.value;
    const tokenStart = caretPos - token.length;
    if (tokenStart < 0 || val.substring(tokenStart, caretPos) !== token) return false;

    const newVal = val.substring(0, tokenStart) + replacement + val.substring(caretPos);
    const desc   = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value') ||
                   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (desc && desc.set) desc.set.call(el, newVal);
    else el.value = newVal;

    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    const newPos = tokenStart + replacement.length;
    el.setSelectionRange(newPos, newPos);
    return true;
  }

  function replaceTokenContenteditable(token, replacement) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range      = sel.getRangeAt(0);
    const node       = range.endContainer;
    if (node.nodeType !== Node.TEXT_NODE) return false;
    const caretOffset = range.endOffset;
    const tokenStart  = caretOffset - token.length;
    if (tokenStart < 0 || node.textContent.substring(tokenStart, caretOffset) !== token) return false;

    const tokenRange = document.createRange();
    tokenRange.setStart(node, tokenStart);
    tokenRange.setEnd(node, caretOffset);
    sel.removeAllRanges();
    sel.addRange(tokenRange);
    return insertTextCE(replacement);
  }

  // Insert multi-line text into a contenteditable correctly.
  // execCommand('insertText') with '\n' can flatten paragraphs in ProseMirror
  // editors (Claude, ChatGPT). Using insertParagraph between lines preserves
  // block structure as the editor expects it.
  function insertTextCE(text) {
    const lines = text.split('\n');
    if (!document.execCommand('insertText', false, lines[0])) return false;
    for (let i = 1; i < lines.length; i++) {
      document.execCommand('insertParagraph');
      if (lines[i] !== '') document.execCommand('insertText', false, lines[i]);
    }
    return true;
  }

  // ── Insert at caret (panel path — no token to replace) ───────────────────

  function insertAtCaret(el, text) {
    if (!el) return;
    el.focus();
    if (isTextareaEl(el)) {
      const start  = el.selectionStart;
      const val    = el.value;
      const newVal = val.substring(0, start) + text + val.substring(el.selectionEnd);
      const desc   = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value') ||
                     Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      if (desc && desc.set) desc.set.call(el, newVal);
      else el.value = newVal;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    } else if (isContentEditableEl(el)) {
      insertTextCE(text);
    }
  }

  // Token-replace path (shortcut injection).
  function inject(el, token, text) {
    if (isTextareaEl(el))          replaceTokenTextarea(el, token, text);
    else if (isContentEditableEl(el)) replaceTokenContenteditable(token, text);
  }

  // ── Variables ─────────────────────────────────────────────────────────────

  function extractVariables(body) {
    const seen = new Set(), vars = [];
    const re = /\[([^\]]+)\]/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      if (!seen.has(m[1])) { seen.add(m[1]); vars.push(m[1]); }
    }
    return vars;
  }

  function substituteVariables(body, values) {
    return body.replace(/\[([^\]]+)\]/g, (_, name) => {
      const v = values[name];
      return v && v.trim() ? v.trim() : `[${name}]`;
    });
  }

  // ── Variable modal ────────────────────────────────────────────────────────
  // onInsert(finalText) — optional. If omitted, calls inject(el, token, finalText).

  function showVariableModal(el, token, body, vars, onInsert) {
    closeVariableModal();

    const host = document.createElement('div');
    host.id = '__pv-var-modal';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';

    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        .overlay {
          position:fixed; inset:0;
          background:rgba(0,0,0,0.62);
          display:flex; align-items:center; justify-content:center;
          pointer-events:all;
          font-family:system-ui,-apple-system,sans-serif;
        }
        .modal {
          background:#1c1c24; border:1px solid #2e2e3a; border-radius:14px;
          padding:24px; min-width:320px; max-width:460px; width:90vw;
          color:#e8e8f0; display:flex; flex-direction:column; gap:13px;
        }
        h3 { font-size:0.95rem; font-weight:700; color:#7cf7d4; margin:0; }
        label { display:flex; flex-direction:column; gap:4px; font-size:0.78rem; color:#7878a0; }
        input {
          background:#121217; border:1px solid #2e2e3a; border-radius:6px;
          color:#e8e8f0; font-size:0.88rem; padding:8px 10px; outline:none;
          transition:border-color 150ms;
        }
        input:focus { border-color:#3a7a67; }
        input::placeholder { color:#7878a0; }
        .actions { display:flex; justify-content:flex-end; gap:8px; margin-top:4px; }
        .btn-p {
          background:#7cf7d4; color:#0d1614; border:none; border-radius:6px;
          padding:8px 18px; font-weight:600; font-size:0.85rem; cursor:pointer;
        }
        .btn-g {
          background:transparent; color:#7878a0; border:1px solid #2e2e3a;
          border-radius:6px; padding:7px 14px; font-size:0.85rem; cursor:pointer;
        }
        .btn-p:hover { opacity:0.85; }
        .btn-g:hover { border-color:#3a7a67; color:#e8e8f0; }
      </style>
      <div class="overlay" id="ov">
        <div class="modal" role="dialog" aria-modal="true">
          <h3>Fill in variables</h3>
          <div id="fields"></div>
          <div class="actions">
            <button class="btn-g" id="cancel">Cancel</button>
            <button class="btn-p" id="insert">Insert</button>
          </div>
        </div>
      </div>`;

    const inputs = [];
    const fieldsEl = shadow.getElementById('fields');
    for (const v of vars) {
      const lbl = document.createElement('label');
      lbl.textContent = v;
      const inp = document.createElement('input');
      inp.type = 'text'; inp.placeholder = v; inp.dataset.v = v;
      lbl.appendChild(inp); fieldsEl.appendChild(lbl); inputs.push(inp);
    }

    function doInsert() {
      const vals = {};
      inputs.forEach((i) => { vals[i.dataset.v] = i.value; });
      const finalText = substituteVariables(body, vals);
      closeVariableModal();
      el.focus();
      if (typeof onInsert === 'function') onInsert(finalText);
      else inject(el, token, finalText);
    }

    shadow.getElementById('insert').addEventListener('click', doInsert);
    shadow.getElementById('cancel').addEventListener('click', closeVariableModal);
    shadow.getElementById('ov').addEventListener('click', (e) => {
      if (e.target === shadow.getElementById('ov')) closeVariableModal();
    });

    shadow.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeVariableModal(); }
      if (e.key === 'Enter') {
        e.preventDefault();
        // e.target is reliable inside a shadow root listener (no retargeting).
        const idx = inputs.indexOf(e.target);
        if (idx >= 0 && idx < inputs.length - 1) inputs[idx + 1].focus();
        else doInsert();
      }
    });

    document.body.appendChild(host);
    activeModal = host;
    requestAnimationFrame(() => { if (inputs[0]) inputs[0].focus(); });
  }

  function closeVariableModal() {
    if (activeModal) { activeModal.remove(); activeModal = null; }
  }

  // ── Shortcut keydown handler ──────────────────────────────────────────────

  async function onKeydown(e) {
    if (e.key !== ' ' && e.key !== 'Tab') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const el = document.activeElement;
    if (!isTextareaEl(el) && !isContentEditableEl(el)) return;
    if (isOurElement(el)) return;

    const token = extractToken(getTextBeforeCaret(el));
    if (!token) return;

    // Prevent default NOW — synchronously — before any await. If we wait until
    // after Storage.getAll() resolves, the browser has already processed Tab's
    // default action (moving focus) and Space's (inserting a character).
    // If no shortcut matches, we restore the trigger character manually.
    e.preventDefault();

    const prompts = await Storage.getAll();

    // Guard: element may have been removed during the async storage read.
    if (!document.contains(el)) return;

    const match = prompts.find(
      (p) => p.shortcut && p.shortcut.toLowerCase() === token.toLowerCase()
    );
    if (!match) {
      // No matching shortcut — put the trigger character back so the user's
      // text is unchanged. For Tab we swallow silently (typing /token + Tab
      // is shortcut-like intent; losing a Tab stop is acceptable).
      if (e.key === ' ') restoreTriggerChar(el, ' ');
      return;
    }

    const vars = extractVariables(match.body);
    if (vars.length > 0) showVariableModal(el, token, match.body, vars);
    else inject(el, token, match.body);
  }

  // Manually insert a character the browser would have inserted had we not
  // called preventDefault() — needed because we prevent early (before the async gap).
  function restoreTriggerChar(el, char) {
    if (isTextareaEl(el)) {
      const start  = el.selectionStart;
      const val    = el.value;
      const newVal = val.substring(0, start) + char + val.substring(el.selectionEnd);
      const desc   = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value') ||
                     Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      if (desc && desc.set) desc.set.call(el, newVal);
      else el.value = newVal;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.setSelectionRange(start + 1, start + 1);
    } else if (isContentEditableEl(el)) {
      document.execCommand('insertText', false, char);
    }
  }

  document.addEventListener('keydown', onKeydown, true);

  // ── Floating UI ───────────────────────────────────────────────────────────

  const PANEL_CSS = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    .btn {
      position: absolute; right: 16px;
      width: 44px; height: 44px;
      background: #1c1c24; border: 1.5px solid #2e2e3a; border-radius: 13px;
      cursor: grab; pointer-events: all;
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; line-height: 1;
      box-shadow: 0 4px 20px rgba(0,0,0,0.55);
      transition: border-color 150ms, box-shadow 150ms, transform 100ms;
      user-select: none; -webkit-user-select: none;
      touch-action: none;
    }
    .btn:hover {
      border-color: #7cf7d4;
      box-shadow: 0 4px 28px rgba(124,247,212,0.22);
      transform: scale(1.06);
    }
    .btn.dragging { cursor: grabbing; transform: scale(1.09); }

    .opt-btn { cursor: pointer; font-size: 20px; }
    .opt-btn:hover {
      border-color: #7cf7d4;
      box-shadow: 0 4px 28px rgba(124,247,212,0.22);
      transform: scale(1.06);
    }

    .pv-toast {
      position: absolute; right: 68px;
      background: #1c1c24; border: 1px solid #2e2e3a; border-radius: 8px;
      padding: 7px 12px; font-size: 0.8rem; color: #e8e8f0;
      white-space: nowrap; pointer-events: none;
      font-family: system-ui,-apple-system,sans-serif;
      opacity: 1; transition: opacity 280ms;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    }
    .pv-toast-warn { border-color: #f97c7c; color: #f97c7c; }

    .panel {
      position: absolute; right: 68px;
      width: 320px; max-height: 460px;
      background: #1c1c24; border: 1px solid #2e2e3a; border-radius: 14px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.65);
      display: flex; flex-direction: column; overflow: hidden;
      pointer-events: all;
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      color: #e8e8f0;
      opacity: 1; transform: scale(1) translateX(0);
      transform-origin: right center;
      transition: opacity 140ms, transform 140ms;
    }
    .panel.hidden {
      opacity: 0; transform: scale(0.96) translateX(6px);
      pointer-events: none;
    }

    .ph {
      padding: 11px 14px 9px;
      border-bottom: 1px solid #2e2e3a;
      flex-shrink: 0;
    }
    .ph-title {
      font-size: 0.78rem; font-weight: 700; letter-spacing: 0.04em;
      color: #7cf7d4; text-transform: uppercase; margin-bottom: 8px;
    }
    .search {
      width: 100%; background: #121217;
      border: 1px solid #2e2e3a; border-radius: 6px;
      color: #e8e8f0; font-size: 0.85rem;
      padding: 6px 10px; outline: none;
      transition: border-color 150ms; font-family: inherit;
    }
    .search:focus { border-color: #3a7a67; }
    .search::placeholder { color: #7878a0; }

    .chips {
      display: flex; flex-wrap: wrap; gap: 5px;
      padding: 7px 14px 6px;
      border-bottom: 1px solid #2e2e3a; flex-shrink: 0;
    }
    .chip {
      padding: 2px 9px; border-radius: 99px; font-size: 0.7rem;
      background: #1c1c24; border: 1px solid #2e2e3a; color: #7878a0;
      cursor: pointer; transition: all 120ms; white-space: nowrap;
      font-family: inherit;
    }
    .chip:hover { border-color: #3a7a67; color: #e8e8f0; }
    .chip.active { background: #1a3a31; border-color: #7cf7d4; color: #7cf7d4; }

    .list { overflow-y: auto; flex: 1; padding: 5px 8px 8px; }
    .list::-webkit-scrollbar { width: 4px; }
    .list::-webkit-scrollbar-track { background: transparent; }
    .list::-webkit-scrollbar-thumb { background: #2e2e3a; border-radius: 2px; }

    .item {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 9px; border-radius: 8px; cursor: pointer;
      transition: background 100ms;
    }
    .item:hover { background: #25252f; }
    .item-body { flex: 1; min-width: 0; }
    .item-title {
      font-size: 0.85rem; font-weight: 500;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .item-meta { display: flex; gap: 5px; margin-top: 3px; align-items: center; }
    .sc {
      background: #1a3a31; color: #7cf7d4; border-radius: 4px;
      font-size: 0.68rem; font-family: monospace; padding: 1px 5px;
    }
    .cat { color: #7878a0; font-size: 0.68rem; }

    .empty {
      text-align: center; color: #7878a0; font-size: 0.82rem;
      padding: 28px 12px;
    }
  `;

  function escHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Build & mount ─────────────────────────────────────────────────────────

  async function initFloatingUI() {
    if (document.getElementById(PV_HOST_ID)) return;

    const savedPct = await getSavedBtnYPct();

    const host = document.createElement('div');
    host.id = PV_HOST_ID;
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646;';

    pvShadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    pvShadow.appendChild(style);

    // Button
    pvBtnEl = document.createElement('button');
    pvBtnEl.className = 'btn';
    pvBtnEl.id = 'pv-btn';
    pvBtnEl.title = 'Prompt Vault';
    pvBtnEl.textContent = '⚡';
    pvShadow.appendChild(pvBtnEl);

    pvOptBtnEl = document.createElement('button');
    pvOptBtnEl.className = 'btn opt-btn';
    pvOptBtnEl.id = 'opt-btn';
    pvOptBtnEl.title = 'Optimize prompt ✨';
    pvOptBtnEl.textContent = '✨';
    pvShadow.appendChild(pvOptBtnEl);

    // Panel
    pvPanelEl = document.createElement('div');
    pvPanelEl.className = 'panel hidden';
    pvPanelEl.id = 'pv-panel';
    pvPanelEl.innerHTML = `
      <div class="ph">
        <div class="ph-title">⚡ Prompt Vault</div>
        <input class="search" id="pv-search" type="search" placeholder="Search prompts…" autocomplete="off" spellcheck="false" />
      </div>
      <div class="chips" id="pv-chips"></div>
      <div class="list"  id="pv-list"></div>
    `;
    pvShadow.appendChild(pvPanelEl);

    document.body.appendChild(host);

    // Position button
    setBtnTopFromPct(savedPct);

    // Events
    pvBtnEl.addEventListener('click', onBtnClick);
    pvBtnEl.addEventListener('mousedown', onDragStart);
    pvOptBtnEl.addEventListener('click', onOptimizeClick);
    pvShadow.getElementById('pv-search').addEventListener('input', refreshList);
    document.addEventListener('mousedown', onOutsideMousedown, true);
    pvShadow.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); closePanel(); }
    });
  }

  // ── Button position helpers ───────────────────────────────────────────────

  function setBtnTopFromPct(pct) {
    const top = clampTop(Math.round((pct / 100) * window.innerHeight));
    pvBtnEl.style.top    = top + 'px';
    if (pvOptBtnEl) pvOptBtnEl.style.top = (top + 50) + 'px'; // 44px + 6px gap
    repositionPanel();
  }

  function clampTop(top) {
    // Leave room for both buttons: 44 (⚡) + 6 (gap) + 44 (✨) + 8 (margin) = 102
    return Math.max(8, Math.min(window.innerHeight - 102, top));
  }

  function repositionPanel() {
    if (!pvPanelEl || !pvBtnEl) return;
    const btnTop   = parseInt(pvBtnEl.style.top || '0', 10);
    const groupMid = btnTop + 47; // mid of the two-button group (44+6+44)/2
    const panelH   = 460;
    let top = groupMid - panelH / 2;
    top = Math.max(8, Math.min(window.innerHeight - panelH - 8, top));
    pvPanelEl.style.top = top + 'px';
  }

  // ── Drag ──────────────────────────────────────────────────────────────────

  function onBtnClick() {
    if (dragState && dragState.moved) return;
    panelOpen ? closePanel() : openPanel();
  }

  function onDragStart(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    dragState = {
      startY:   e.clientY,
      startTop: parseInt(pvBtnEl.style.top || '0', 10),
      moved:    false,
    };
    pvBtnEl.classList.add('dragging');
    window.addEventListener('mousemove', onDragMove, true);
    window.addEventListener('mouseup',   onDragEnd,  true);
  }

  function onDragMove(e) {
    if (!dragState) return;
    const dy = e.clientY - dragState.startY;
    if (Math.abs(dy) > 4) dragState.moved = true;
    const newTop = clampTop(dragState.startTop + dy);
    pvBtnEl.style.top    = newTop + 'px';
    if (pvOptBtnEl) pvOptBtnEl.style.top = (newTop + 50) + 'px';
    repositionPanel();
  }

  function onDragEnd() {
    if (!dragState) return;
    pvBtnEl.classList.remove('dragging');
    window.removeEventListener('mousemove', onDragMove, true);
    window.removeEventListener('mouseup',   onDragEnd,  true);
    if (dragState.moved) {
      const top = parseInt(pvBtnEl.style.top || '0', 10);
      const pct = (top / window.innerHeight) * 100;
      saveBtnYPct(pct);
    }
    setTimeout(() => { dragState = null; }, 60);
  }

  // ── Panel open / close ────────────────────────────────────────────────────

  async function openPanel() {
    panelOpen = true;
    panelCategory = 'All';
    pvPanelEl.classList.remove('hidden');
    repositionPanel();
    pvShadow.getElementById('pv-search').value = '';
    await renderPanelContents();
    setTimeout(() => pvShadow.getElementById('pv-search').focus(), 40);
  }

  function closePanel() {
    panelOpen = false;
    pvPanelEl.classList.add('hidden');
  }

  function onOutsideMousedown(e) {
    if (!panelOpen) return;
    const inHost = e.composedPath().some((n) => n && n.id === PV_HOST_ID);
    if (!inHost) closePanel();
  }

  // ── Panel rendering ───────────────────────────────────────────────────────

  async function renderPanelContents() {
    const prompts = await Storage.getAll();
    renderChips(prompts);
    renderItems(prompts);
  }

  function renderChips(prompts) {
    const el   = pvShadow.getElementById('pv-chips');
    const cats = ['All', ...new Set(prompts.map((p) => p.category).filter(Boolean))];
    el.innerHTML = '';
    for (const cat of cats) {
      const btn = document.createElement('button');
      btn.className = 'chip' + (cat === panelCategory ? ' active' : '');
      btn.textContent = cat;
      btn.addEventListener('click', () => {
        panelCategory = cat;
        renderPanelContents();
      });
      el.appendChild(btn);
    }
  }

  async function refreshList() {
    const prompts = await Storage.getAll();
    renderItems(prompts);
  }

  function renderItems(prompts) {
    const listEl = pvShadow.getElementById('pv-list');
    const q      = (pvShadow.getElementById('pv-search').value || '').toLowerCase().trim();

    const filtered = prompts.filter((p) => {
      const matchCat = panelCategory === 'All' || p.category === panelCategory;
      const matchQ   = !q ||
        p.title.toLowerCase().includes(q) ||
        (p.shortcut || '').toLowerCase().includes(q) ||
        p.body.toLowerCase().includes(q);
      return matchCat && matchQ;
    });

    listEl.innerHTML = '';

    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="empty">No prompts found.</div>`;
      return;
    }

    for (const p of filtered) {
      const item = document.createElement('div');
      item.className = 'item';
      item.innerHTML = `
        <div class="item-body">
          <div class="item-title">${escHtml(p.title)}</div>
          <div class="item-meta">
            ${p.shortcut ? `<span class="sc">${escHtml(p.shortcut)}</span>` : ''}
            ${p.category ? `<span class="cat">${escHtml(p.category)}</span>` : ''}
          </div>
        </div>`;
      item.addEventListener('click', () => onItemClick(p));
      listEl.appendChild(item);
    }
  }

  // ── Panel insert ──────────────────────────────────────────────────────────

  function onItemClick(prompt) {
    closePanel();

    const el = lastActiveInput || findChatInput();
    if (!el) return;

    const vars = extractVariables(prompt.body);
    if (vars.length > 0) {
      showVariableModal(el, null, prompt.body, vars, (finalText) => insertAtCaret(el, finalText));
    } else {
      insertAtCaret(el, prompt.body);
    }
  }

  function findChatInput() {
    for (const sel of ['textarea', '[contenteditable="true"]', '[role="textbox"]']) {
      const el = document.querySelector(sel);
      if (el && (el.offsetWidth > 0 || el.offsetHeight > 0)) return el;
    }
    return null;
  }

  // ── Position persistence ──────────────────────────────────────────────────

  function getSavedBtnYPct() {
    return new Promise((resolve) => {
      chrome.storage.local.get([BTN_Y_STORE_KEY], (r) => {
        resolve(typeof r[BTN_Y_STORE_KEY] === 'number' ? r[BTN_Y_STORE_KEY] : DEFAULT_Y_PCT);
      });
    });
  }

  function saveBtnYPct(pct) {
    chrome.storage.local.set({ [BTN_Y_STORE_KEY]: pct });
  }

  // ── Prompt Optimizer ─────────────────────────────────────────────────────

  function readCurrentInput(el) {
    if (isTextareaEl(el))        return el.value;
    if (isContentEditableEl(el)) return el.innerText || el.textContent || '';
    return '';
  }

  // Replace the entire content of the input (reuses native-setter + insertTextCE helpers).
  function replaceAllContent(el, text) {
    el.focus();
    if (isTextareaEl(el)) {
      el.setSelectionRange(0, el.value.length);
      const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value') ||
                   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      if (desc && desc.set) desc.set.call(el, text);
      else el.value = text;
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.setSelectionRange(text.length, text.length);
    } else if (isContentEditableEl(el)) {
      document.execCommand('selectAll');
      insertTextCE(text); // reuses multi-line paragraph helper
    }
  }

  // Best-effort auto-send: tries common submit button selectors across all five sites.
  function autoSendInput(el) {
    const selectors = [
      '[data-testid="send-button"]',   // ChatGPT
      'button[aria-label*="Send"]',    // Claude
      'button[aria-label*="send"]',    // Gemini (lowercase)
      'button[type="submit"]',
    ];
    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn && !btn.disabled) { btn.click(); return; }
    }
    // Fallback: synthetic Enter key
    el.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true,
    }));
  }

  // Floating toast inside the shadow DOM (not the popup's toast — different context).
  function showPvToast(msg, type = '') {
    if (!pvShadow) return;
    const existing = pvShadow.getElementById('pv-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'pv-toast';
    toast.className = 'pv-toast' + (type ? ' pv-toast-' + type : '');
    toast.textContent = msg;

    const btnTop = parseInt((pvBtnEl && pvBtnEl.style.top) || '200', 10);
    toast.style.top = Math.max(8, btnTop + 10) + 'px';

    pvShadow.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
    }, 2400);
  }

  async function onOptimizeClick() {
    const el = lastActiveInput || findChatInput();
    if (!el) { showPvToast('Click the chat input first.', 'warn'); return; }

    const raw = readCurrentInput(el).trim();
    if (!raw) { showPvToast('Type something to optimize first.', 'warn'); return; }

    // Double-wrap guard — the meta-prompt's first line is unique enough.
    if (raw.startsWith(Optimizer.META_PROMPT.split('\n')[0])) {
      showPvToast('Already optimized.', 'warn');
      return;
    }

    const { payload } = await Optimizer.optimize(raw);
    replaceAllContent(el, payload);

    // Honour the "Auto-send after optimize" popup toggle.
    chrome.storage.local.get(['__pv_autosend'], (r) => {
      if (r['__pv_autosend']) autoSendInput(el);
    });
  }

  // ── SPA resilience ────────────────────────────────────────────────────────

  function startObserver() {
    const obs = new MutationObserver(() => {
      if (!document.getElementById(PV_HOST_ID)) {
        // Our element was removed by a SPA navigation — re-mount.
        pvShadow = pvBtnEl = pvOptBtnEl = pvPanelEl = null;
        panelOpen = false;
        initFloatingUI();
      }
    });
    obs.observe(document.body, { childList: true });
  }

  // ── Boot ──────────────────────────────────────────────────────────────────

  if (document.body) {
    initFloatingUI();
    startObserver();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      initFloatingUI();
      startObserver();
    });
  }

})();
