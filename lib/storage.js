// Thin wrapper around chrome.storage.local — swap this for cloud sync in a future phase.

const Storage = (() => {
  const KEY = 'prompts';

  function contextAlive() { try { return !!chrome.runtime?.id; } catch { return false; } }

  async function getAll() {
    if (!contextAlive()) return [];
    try {
      const result = await chrome.storage.local.get([KEY]);
      return result[KEY] || [];
    } catch { return []; }
  }

  async function saveAll(prompts) {
    if (!contextAlive()) return;
    try { await chrome.storage.local.set({ [KEY]: prompts }); } catch {}
  }

  async function getById(id) {
    const all = await getAll();
    return all.find((p) => p.id === id) || null;
  }

  async function add(prompt) {
    const all = await getAll();
    all.unshift(prompt);
    await saveAll(all);
    return prompt;
  }

  async function update(id, changes) {
    const all = await getAll();
    const idx = all.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...changes };
    await saveAll(all);
    return all[idx];
  }

  async function remove(id) {
    const all = await getAll();
    await saveAll(all.filter((p) => p.id !== id));
  }

  function makeId() {
    return 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  }

  async function getLibrary() {
    if (!contextAlive()) return [];
    try {
      const result = await chrome.storage.local.get(['__pv_library']);
      return result['__pv_library'] || [];
    } catch { return []; }
  }

  return { getAll, saveAll, getById, add, update, remove, makeId, getLibrary };
})();
