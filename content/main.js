// Decides on every page load: idle, recording, or replaying.
(() => {
  const FA = window.FA;
  if (window.__faMain) return;
  window.__faMain = true;

  async function init() {
    const tabId = await chrome.runtime.sendMessage({ type: 'whoami' });
    const { rec, run } = await chrome.storage.local.get(['rec', 'run']);
    if (rec && rec.tabId === tabId) { FA.rec.start(rec.steps.length); return; }
    FA.rec.stop();
    if (run && run.tabId === tabId) { FA.replay.init(run); return; }
    FA.overlay.hide();
  }
  chrome.runtime.onMessage.addListener((m, s, send) => {
    if (m.type === 'ping') send('pong');
    if (m.type === 'sync') init();
  });
  init();
})();
