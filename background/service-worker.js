// Service worker: owns start/stop transitions. Holds NO state in memory (it can be killed any time);
// everything lives in chrome.storage.local: flows, profiles, rec (active recording), run (active replay).
const S = chrome.storage.local;
const FILES = ['content/core.js', 'content/overlay.js', 'content/recorder.js', 'content/replayer.js', 'content/main.js'];

async function ensureContent(tabId) {
  try { await chrome.tabs.sendMessage(tabId, { type: 'ping' }); }
  catch { await chrome.scripting.executeScript({ target: { tabId }, files: FILES }); }
}
async function sync(tabId) {
  try { await ensureContent(tabId); await chrome.tabs.sendMessage(tabId, { type: 'sync' }); } catch (e) { /* restricted page */ }
}
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

async function stopRecording() {
  const { rec, flows = [] } = await S.get(['rec', 'flows']);
  if (!rec) return { ok: true };
  if (rec.steps.length) {
    flows.push({ id: uid('f'), name: rec.name || 'Untitled flow', startUrl: rec.startUrl, steps: rec.steps, createdAt: Date.now() });
    await S.set({ flows });
  }
  await S.remove('rec');
  await sync(rec.tabId);
  return { ok: true, saved: rec.steps.length };
}

const handlers = {
  async startRecording({ tabId, name }) {
    const tab = await chrome.tabs.get(tabId);
    await S.remove('run');
    await S.set({ rec: { tabId, name, startUrl: tab.url, steps: [] } });
    await sync(tabId);
    return { ok: true };
  },
  stopRecording,
  async startRun({ flowId, profileId, tabId }) {
    const { flows = [] } = await S.get('flows');
    const flow = flows.find((f) => f.id === flowId);
    if (!flow) return { ok: false, error: 'Flow not found' };
    await S.remove('rec');
    await S.set({ run: { runId: uid('r'), flowId, profileId: profileId || null, tabId, stepIndex: 0, status: 'running', owner: null } });
    const tab = await chrome.tabs.get(tabId);
    if (tab.url === flow.startUrl) await chrome.tabs.reload(tabId);
    else await chrome.tabs.update(tabId, { url: flow.startUrl });
    return { ok: true };
  },
  async stopRun() {
    const { run } = await S.get('run');
    await S.remove('run');
    if (run) await sync(run.tabId);
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'whoami') { sendResponse(sender.tab ? sender.tab.id : null); return; }
  const h = handlers[msg.type];
  if (!h) return;
  h({ ...msg, tabId: msg.tabId ?? (sender.tab && sender.tab.id) }).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});
