// User-adjustable behavior, persisted in chrome.storage.local under "settings".
// Cached synchronously after `ready` resolves so replayer/overlay can read without awaiting each time.
(() => {
  const FA = window.FA;
  const S = chrome.storage.local;

  const DEFAULTS = {
    searchTimeoutMs: 5000,     // how long to look for a step's element before reporting it failed
    autoAdvanceEnabled: true,  // if true, an error/pause auto-continues instead of waiting forever
    autoAdvanceMs: 2500,       // how long to wait before auto-continuing (0 = continue immediately)
    autoAdvanceAction: 'skip', // 'skip' the failed step, or 'retry' it, when auto-continuing
    overlayPos: null,          // {top,left} in px from a drag; null = default bottom-right corner
  };

  let cur = { ...DEFAULTS };
  const ready = S.get('settings').then(({ settings }) => {
    cur = { ...DEFAULTS, ...(settings || {}) };
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) cur = { ...DEFAULTS, ...(changes.settings.newValue || {}) };
  });

  FA.settings = {
    ready,
    DEFAULTS,
    get: () => cur,
    async set(patch) {
      cur = { ...cur, ...patch };
      await S.set({ settings: cur });
      return cur;
    },
  };
})();
