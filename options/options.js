const S = chrome.storage.local;
const $ = (id) => document.getElementById(id);
let flows = [], profiles = [];
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const save = () => S.set({ flows, profiles });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const describe = (s) => {
  const l = s.locator || {};
  const n = l.labelText || l.text || l.ariaLabel || l.placeholder || l.name || l.id || l.tag || '';
  return ({ type: 'Fill', select: 'Select', check: s.checked === false ? 'Uncheck' : 'Check', click: 'Click', key: 'Press Enter in',
    captchaPause: 'Captcha pause', manualPause: 'Manual pause' }[s.type] || s.type) + ' ' + (s.locator ? n : '');
};

function renderProfiles() {
  const box = $('profiles');
  box.innerHTML = '';
  profiles.forEach((p) => {
    const c = document.createElement('div');
    c.className = 'card';
    const rows = Object.entries(p.fields).map(([k, v]) =>
      `<tr><td class="k"><code>${esc(k)}</code></td><td><input data-k="${esc(k)}" value="${esc(v)}" style="width:95%"></td><td><button class="g" data-del="${esc(k)}">✕</button></td></tr>`).join('');
    c.innerHTML = `<div style="display:flex;justify-content:space-between;gap:8px"><input class="pn" value="${esc(p.name)}"><button class="d" data-rm>Delete profile</button></div>
      <table>${rows}</table>
      <div style="margin-top:8px"><input class="nk" placeholder="key, e.g. pilgrim1.name"> <input class="nv" placeholder="value"> <button data-add>Add</button></div>`;
    c.querySelector('.pn').onchange = (e) => { p.name = e.target.value; save(); };
    c.querySelectorAll('input[data-k]').forEach((i) => (i.onchange = () => { p.fields[i.dataset.k] = i.value; save(); }));
    c.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { delete p.fields[b.dataset.del]; save(); renderProfiles(); renderFlows(); }));
    c.querySelector('[data-add]').onclick = () => {
      const k = c.querySelector('.nk').value.trim();
      if (!k) return;
      p.fields[k] = c.querySelector('.nv').value;
      save(); renderProfiles(); renderFlows();
    };
    c.querySelector('[data-rm]').onclick = () => { if (confirm('Delete this profile?')) { profiles = profiles.filter((x) => x !== p); save(); renderProfiles(); renderFlows(); } };
    box.appendChild(c);
  });
}

function renderFlows() {
  const box = $('flows');
  box.innerHTML = flows.length ? '' : '<p class="muted">No flows yet. Record one from the toolbar popup.</p>';
  const keys = [...new Set(profiles.flatMap((p) => Object.keys(p.fields)))];
  flows.forEach((f) => {
    const c = document.createElement('div');
    c.className = 'card';
    const rows = f.steps.map((s, i) => {
      let val = '';
      const v = s.value;
      if (s.type === 'type' || s.type === 'select') {
        if (v && v.mode === 'ask') val = '<em class="muted">asks you at run time</em>';
        else {
          const cur = v && v.mode === 'profile' ? v.key : '';
          val = `<select data-i="${i}"><option value="">Fixed: ${esc(v && v.value)}</option>${keys.map((k) => `<option value="${esc(k)}" ${k === cur ? 'selected' : ''}>Profile: ${esc(k)}</option>`).join('')}</select>`;
        }
      }
      return `<tr><td>${i + 1}</td><td>${esc(describe(s))}</td><td>${val}</td><td><button class="g" data-x="${i}">✕</button></td></tr>`;
    }).join('');
    c.innerHTML = `<div style="display:flex;justify-content:space-between;gap:8px"><input class="fn" value="${esc(f.name)}" style="flex:1"><button class="g" data-exp>Export JSON</button><button class="d" data-rm>Delete</button></div>
      <div class="muted">${esc(f.startUrl)}</div><table><tr><th>#</th><th>Step</th><th>Value</th><th></th></tr>${rows}</table>`;
    c.querySelector('.fn').onchange = (e) => { f.name = e.target.value; save(); };
    c.querySelectorAll('select[data-i]').forEach((sel) => (sel.onchange = () => {
      const s = f.steps[+sel.dataset.i];
      if (sel.value) s.value = { mode: 'profile', key: sel.value, text: s.value && s.value.text };
      else s.value = { mode: 'literal', value: (s.value && s.value.value) ?? '', text: s.value && s.value.text };
      save();
    }));
    c.querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => { f.steps.splice(+b.dataset.x, 1); save(); renderFlows(); }));
    c.querySelector('[data-rm]').onclick = () => { if (confirm('Delete this flow?')) { flows = flows.filter((x) => x !== f); save(); renderFlows(); } };
    c.querySelector('[data-exp]').onclick = () => {
      // exports steps with typed values stripped, so personal data isn't shared by accident
      const clean = JSON.parse(JSON.stringify(f));
      clean.steps.forEach((s) => { if (s.value && s.value.mode === 'literal') s.value.value = ''; });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' }));
      a.download = f.name.replace(/\W+/g, '_') + '.json';
      a.click();
    };
    box.appendChild(c);
  });
}

$('addProfile').onclick = () => { profiles.push({ id: uid('p'), name: 'New profile', fields: {} }); save(); renderProfiles(); };
S.get(['flows', 'profiles']).then((d) => { flows = d.flows || []; profiles = d.profiles || []; renderProfiles(); renderFlows(); });

// --- Settings ---
const SETTINGS_DEFAULTS = {
  searchTimeoutMs: 5000,
  autoAdvanceEnabled: true,
  autoAdvanceMs: 2500,
  autoAdvanceAction: 'skip',
  overlayPos: null,
};
let settings = { ...SETTINGS_DEFAULTS };
const saveSettings = () => S.set({ settings });

function renderSettings() {
  $('searchTimeoutMs').value = settings.searchTimeoutMs;
  $('autoAdvanceEnabled').checked = !!settings.autoAdvanceEnabled;
  $('autoAdvanceMs').value = settings.autoAdvanceMs;
  $('autoAdvanceAction').value = settings.autoAdvanceAction;
}
$('searchTimeoutMs').onchange = (e) => { settings.searchTimeoutMs = Math.max(500, +e.target.value || SETTINGS_DEFAULTS.searchTimeoutMs); renderSettings(); saveSettings(); };
$('autoAdvanceEnabled').onchange = (e) => { settings.autoAdvanceEnabled = e.target.checked; saveSettings(); };
$('autoAdvanceMs').onchange = (e) => { settings.autoAdvanceMs = Math.max(0, +e.target.value || 0); renderSettings(); saveSettings(); };
$('autoAdvanceAction').onchange = (e) => { settings.autoAdvanceAction = e.target.value; saveSettings(); };
$('resetPos').onclick = () => { settings.overlayPos = null; saveSettings(); };

S.get('settings').then((d) => { settings = { ...SETTINGS_DEFAULTS, ...(d.settings || {}) }; renderSettings(); });
