const S = chrome.storage.local;
const $ = (id) => document.getElementById(id);
const msg = (t) => ($('msg').textContent = t || '');

async function activeTab() {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t;
}
async function send(m) {
  const r = await chrome.runtime.sendMessage(m);
  if (r && r.ok === false) msg(r.error);
  return r;
}

async function render() {
  const { flows = [], profiles = [], rec, run } = await S.get(['flows', 'profiles', 'rec', 'run']);
  const sec = $('recSec');
  sec.innerHTML = '';
  if (rec) {
    sec.innerHTML = `<h2>Recording</h2><div class="muted">${rec.steps.length} steps captured on the page.</div><br>`;
    const b = document.createElement('button');
    b.textContent = 'Stop & save';
    b.onclick = async () => { await send({ type: 'stopRecording' }); render(); };
    sec.appendChild(b);
  } else {
    sec.innerHTML = '<h2>New recording</h2><input id="name" placeholder="Flow name, e.g. Darshan booking">';
    const b = document.createElement('button');
    b.textContent = '● Record';
    b.className = 'rec';
    b.onclick = async () => {
      const t = await activeTab();
      if (!t || !/^https?:/.test(t.url || '')) return msg('Open a normal website tab first.');
      await send({ type: 'startRecording', tabId: t.id, name: $('name').value.trim() });
      window.close();
    };
    sec.appendChild(b);
  }

  const ps = $('profile');
  ps.innerHTML = '<option value="">No profile (use recorded values)</option>' + profiles.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
  if (run && run.profileId) ps.value = run.profileId;

  const box = $('flows');
  box.innerHTML = flows.length ? '' : '<div class="muted">Nothing recorded yet.</div>';
  flows.forEach((f) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<span title="${f.name}">${f.name} <small class="muted">(${f.steps.length})</small></span>`;
    const b = document.createElement('button');
    b.textContent = '▶ Run';
    b.onclick = async () => {
      const t = await activeTab();
      if (!t) return;
      await send({ type: 'startRun', flowId: f.id, profileId: ps.value || null, tabId: t.id });
      window.close();
    };
    row.appendChild(b);
    box.appendChild(row);
  });
}
$('opts').onclick = () => chrome.runtime.openOptionsPage();
render();
