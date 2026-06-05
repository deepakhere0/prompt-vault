// Thin wrapper around chrome.storage.local — swap this for cloud sync in a future phase.

const Storage = (() => {
  const KEY = 'prompts';

  async function getAll() {
    return new Promise((resolve) => {
      chrome.storage.local.get([KEY], (result) => {
        resolve(result[KEY] || []);
      });
    });
  }

  async function saveAll(prompts) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [KEY]: prompts }, resolve);
    });
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

  return { getAll, saveAll, getById, add, update, remove, makeId };
})();
