const S = chrome.storage.local;
const $ = (id) => document.getElementById(id);
let flows = [], profiles = [];
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const save = () => S.set({ flows, profiles });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (v) => JSON.parse(JSON.stringify(v));
const describe = (s) => {
  const l = s.locator || {};
  const n = l.labelText || l.text || l.ariaLabel || l.placeholder || l.name || l.id || l.tag || '';
  return ({ type: 'Fill', select: 'Select', check: s.checked === false ? 'Uncheck' : 'Check', click: 'Click', key: 'Press Enter in',
    captchaPause: 'Captcha pause', manualPause: 'Manual pause', navigate: 'Navigate', wait: 'Wait' }[s.type] || s.type) + ' ' + (s.locator ? n : '');
};
const stepDefaults = (type) => {
  const base = { id: uid('s'), type, timeoutMs: 8000 };
  if (['type', 'select'].includes(type)) base.value = { mode: 'literal', value: '', text: '' };
  if (['type', 'select', 'check', 'click', 'key'].includes(type)) base.locator = { tag: 'input' };
  if (type === 'check') base.checked = true;
  if (type === 'key') base.key = 'Enter';
  if (type === 'navigate') base.url = '';
  if (type === 'wait') base.delayMs = 1000;
  if (['captchaPause', 'manualPause'].includes(type)) base.locator = null;
  return base;
};
const typeOptions = ['type', 'select', 'check', 'click', 'key', 'manualPause', 'captchaPause', 'navigate', 'wait'];

function renderProfiles() {
  const box = $('profiles');
  box.innerHTML = '';
  profiles.forEach((p) => {
    const c = document.createElement('div'); c.className = 'card';
    const rows = Object.entries(p.fields || {}).map(([k, v]) =>
      `<tr><td class="k"><code>${esc(k)}</code></td><td><input data-k="${esc(k)}" value="${esc(v)}"></td><td><button class="g" data-del="${esc(k)}">✕</button></td></tr>`).join('');
    c.innerHTML = `<div class="row"><input class="pn" value="${esc(p.name)}"><button class="d" data-rm>Delete profile</button></div>
      <table>${rows}</table><div class="add-row"><input class="nk" placeholder="key, e.g. pilgrim1.name"><input class="nv" placeholder="value"><button data-add>Add</button></div>`;
    c.querySelector('.pn').onchange = (e) => { p.name = e.target.value; save(); };
    c.querySelectorAll('input[data-k]').forEach((i) => (i.onchange = () => { p.fields[i.dataset.k] = i.value; save(); }));
    c.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { delete p.fields[b.dataset.del]; save(); renderProfiles(); renderFlows(); }));
    c.querySelector('[data-add]').onclick = () => { const k = c.querySelector('.nk').value.trim(); if (!k) return; p.fields[k] = c.querySelector('.nv').value; save(); renderProfiles(); renderFlows(); };
    c.querySelector('[data-rm]').onclick = () => { if (confirm('Delete this profile?')) { profiles = profiles.filter((x) => x !== p); save(); renderProfiles(); renderFlows(); } };
    box.appendChild(c);
  });
}

function locatorEditor(s) {
  if (!s.locator) return '';
  const l = s.locator || {};
  return `<details class="details" open><summary>Element locator</summary><div class="grid locator-grid">
    ${['tag', 'id', 'name', 'labelText', 'ariaLabel', 'placeholder', 'text', 'css', 'xpath'].map((k) => `<label>${k}<input data-locator="${k}" value="${esc(l[k])}" placeholder="optional"></label>`).join('')}
  </div></details>`;
}

function valueEditor(s, keys) {
  if (!['type', 'select'].includes(s.type)) return '';
  const v = s.value || { mode: 'literal', value: '' };
  const options = keys.map((k) => `<option value="${esc(k)}" ${v.mode === 'profile' && v.key === k ? 'selected' : ''}>Profile: ${esc(k)}</option>`).join('');
  return `<div class="grid value-grid"><label>Value mode<select data-value-mode><option value="literal" ${v.mode !== 'profile' && v.mode !== 'ask' ? 'selected' : ''}>Fixed value</option><option value="profile" ${v.mode === 'profile' ? 'selected' : ''}>Profile field</option><option value="ask" ${v.mode === 'ask' ? 'selected' : ''}>Ask at run time</option></select></label>
    <label data-value-literal>Value<input data-value="value" value="${esc(v.value)}"></label>
    <label data-value-profile>Profile field<select data-value="key"><option value="">Choose a profile field</option>${options}</select></label>
    ${s.type === 'select' ? `<label data-value-select-text>Option text<input data-value="text" value="${esc(v.text)}"></label>` : ''}</div>`;
}

function renderStep(s, i, f, keys) {
  const c = document.createElement('div'); c.className = 'step-card';
  c.innerHTML = `<div class="step-head"><strong>${i + 1}. ${esc(describe(s))}</strong><div class="step-actions"><button class="g" data-up title="Move up">↑</button><button class="g" data-down title="Move down">↓</button><button class="g" data-duplicate>Duplicate</button><button class="g" data-insert>Insert after</button><button class="g" data-remove title="Delete step">✕</button></div></div>
    <div class="grid step-grid"><label>Step type<select data-type>${typeOptions.map((t) => `<option value="${t}" ${s.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label>Timeout (ms)<input data-step="timeoutMs" type="number" min="0" step="250" value="${esc(s.timeoutMs ?? 8000)}"></label>
    ${s.type === 'navigate' ? `<label class="wide">Website URL<input data-step="url" type="url" value="${esc(s.url)}" placeholder="https://example.com/path"></label>` : ''}
    ${s.type === 'wait' ? `<label>Delay (ms)<input data-step="delayMs" type="number" min="0" step="100" value="${esc(s.delayMs ?? 1000)}"></label>` : ''}
    ${s.type === 'check' ? `<label>Checked<select data-step="checked"><option value="true" ${s.checked !== false ? 'selected' : ''}>Yes</option><option value="false" ${s.checked === false ? 'selected' : ''}>No</option></select></label>` : ''}
    ${s.type === 'key' ? `<label>Key<input data-step="key" value="${esc(s.key || 'Enter')}"></label>` : ''}</div>
    ${valueEditor(s, keys)}${locatorEditor(s)}<div class="muted step-id">ID: ${esc(s.id || 'none')}</div>`;
  const rerender = () => { save(); renderFlows(); };
  c.querySelector('[data-type]').onchange = (e) => { const next = stepDefaults(e.target.value); Object.assign(next, { id: s.id, timeoutMs: s.timeoutMs }); Object.assign(s, next); rerender(); };
  c.querySelectorAll('[data-step]').forEach((el) => el.onchange = () => { s[el.dataset.step] = el.dataset.step === 'checked' ? el.value === 'true' : (el.type === 'number' ? +el.value : el.value); rerender(); });
  c.querySelectorAll('[data-locator]').forEach((el) => el.onchange = () => { s.locator[el.dataset.locator] = el.value || null; rerender(); });
  const mode = c.querySelector('[data-value-mode]');
  const syncValue = () => { const m = mode && mode.value; if (!m) return; s.value = m === 'ask' ? { mode: 'ask' } : m === 'profile' ? { mode: 'profile', key: c.querySelector('[data-value="key"]').value } : { mode: 'literal', value: c.querySelector('[data-value="value"]').value, text: c.querySelector('[data-value="text"]')?.value || s.value?.text || '' }; rerender(); };
  if (mode) { mode.onchange = syncValue; c.querySelectorAll('[data-value]').forEach((el) => el.onchange = syncValue); }
  c.querySelector('[data-up]').onclick = () => { if (i) { [f.steps[i - 1], f.steps[i]] = [f.steps[i], f.steps[i - 1]]; rerender(); } };
  c.querySelector('[data-down]').onclick = () => { if (i < f.steps.length - 1) { [f.steps[i + 1], f.steps[i]] = [f.steps[i], f.steps[i + 1]]; rerender(); } };
  c.querySelector('[data-duplicate]').onclick = () => { const copy = clone(s); copy.id = uid('s'); f.steps.splice(i + 1, 0, copy); rerender(); };
  c.querySelector('[data-insert]').onclick = () => { f.steps.splice(i + 1, 0, stepDefaults('manualPause')); rerender(); };
  c.querySelector('[data-remove]').onclick = () => { f.steps.splice(i, 1); rerender(); };
  return c;
}

function renderFlows() {
  const box = $('flows'); box.innerHTML = flows.length ? '' : '<p class="muted">No flows yet. Record one from the toolbar popup.</p>';
  const keys = [...new Set(profiles.flatMap((p) => Object.keys(p.fields || {})))];
  flows.forEach((f) => {
    const c = document.createElement('section'); c.className = 'card flow-card';
    c.innerHTML = `<div class="flow-head"><input class="fn" value="${esc(f.name)}" placeholder="Flow name"><button class="g" data-export>Export JSON</button><button class="d" data-rm>Delete</button></div>
      <label class="wide flow-url">Start website URL<input class="fu" type="url" value="${esc(f.startUrl)}" placeholder="https://example.com/"></label><div class="muted">Edit each step below. Changes save automatically.</div><div class="steps"></div><div class="flow-actions"><button data-add-step>Add step</button><button class="g" data-add-pause>Add manual pause</button></div>`;
    c.querySelector('.fn').onchange = (e) => { f.name = e.target.value; save(); };
    c.querySelector('.fu').onchange = (e) => { f.startUrl = e.target.value; save(); };
    const steps = c.querySelector('.steps'); (f.steps || []).forEach((s, i) => steps.appendChild(renderStep(s, i, f, keys)));
    c.querySelector('[data-add-step]').onclick = () => { f.steps.push(stepDefaults('click')); save(); renderFlows(); };
    c.querySelector('[data-add-pause]').onclick = () => { f.steps.push(stepDefaults('manualPause')); save(); renderFlows(); };
    c.querySelector('[data-rm]').onclick = () => { if (confirm('Delete this flow?')) { flows = flows.filter((x) => x !== f); save(); renderFlows(); } };
    c.querySelector('[data-export]').onclick = () => { const clean = clone(f); clean.steps.forEach((s) => { if (s.value?.mode === 'literal') s.value.value = ''; }); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' })); a.download = (f.name || 'flow').replace(/\W+/g, '_') + '.json'; a.click(); URL.revokeObjectURL(a.href); };
    box.appendChild(c);
  });
}

$('addProfile').onclick = () => { profiles.push({ id: uid('p'), name: 'New profile', fields: {} }); save(); renderProfiles(); };
const normalizeImportedFlow = (raw) => {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.steps)) throw new Error('JSON must contain a steps array');
  return { ...raw, id: uid('f'), name: raw.name || 'Imported flow', startUrl: raw.startUrl || '', steps: raw.steps.map((s) => ({ ...s, id: s.id || uid('s') })) };
};
$('addFlow').onclick = () => { flows.unshift({ id: uid('f'), name: 'New flow', startUrl: 'https://', steps: [], createdAt: Date.now() }); save(); renderFlows(); };
$('importFlow').onclick = () => $('flowFile').click();
$('flowFile').onchange = async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try { flows.unshift(normalizeImportedFlow(JSON.parse(await file.text()))); save(); renderFlows(); }
  catch (err) { alert(`Could not import flow: ${err.message}`); }
  e.target.value = '';
};
S.get(['flows', 'profiles']).then((d) => { flows = d.flows || []; profiles = d.profiles || []; flows.forEach((f) => { f.steps = f.steps || []; }); renderProfiles(); renderFlows(); });

const SETTINGS_DEFAULTS = { searchTimeoutMs: 5000, autoAdvanceEnabled: true, autoAdvanceMs: 2500, autoAdvanceAction: 'skip', overlayPos: null };
let settings = { ...SETTINGS_DEFAULTS };
const saveSettings = () => S.set({ settings });
function renderSettings() { $('searchTimeoutMs').value = settings.searchTimeoutMs; $('autoAdvanceEnabled').checked = !!settings.autoAdvanceEnabled; $('autoAdvanceMs').value = settings.autoAdvanceMs; $('autoAdvanceAction').value = settings.autoAdvanceAction; }
$('searchTimeoutMs').onchange = (e) => { settings.searchTimeoutMs = Math.max(500, +e.target.value || SETTINGS_DEFAULTS.searchTimeoutMs); renderSettings(); saveSettings(); };
$('autoAdvanceEnabled').onchange = (e) => { settings.autoAdvanceEnabled = e.target.checked; saveSettings(); };
$('autoAdvanceMs').onchange = (e) => { settings.autoAdvanceMs = Math.max(0, +e.target.value || 0); renderSettings(); saveSettings(); };
$('autoAdvanceAction').onchange = (e) => { settings.autoAdvanceAction = e.target.value; saveSettings(); };
$('resetPos').onclick = () => { settings.overlayPos = null; saveSettings(); };
S.get('settings').then((d) => { settings = { ...SETTINGS_DEFAULTS, ...(d.settings || {}) }; renderSettings(); });
