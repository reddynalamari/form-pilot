// Captures meaningful actions (fill / select / check / click / Enter) and appends them to storage.rec.
(() => {
  const FA = window.FA;
  const S = chrome.storage.local;
  const SENSITIVE = /pass|otp|cvv|cvc|card|\bpin\b|secret|token/i;
  const CLICKABLE = 'a,button,[role=button],[role=option],[role=menuitem],[role=tab],li,summary,input[type=submit],input[type=button],input[type=image]';
  let active = false, queue = Promise.resolve(), lastType = null, last = { el: null, val: null };

  const fromOverlay = (e) => e.target && e.target.id === 'fa-overlay-host';
  const info = (el) => [el.name, el.id, el.getAttribute('autocomplete'), el.placeholder, FA.labelText(el)].join(' ');

  function addStep(step) {
    step.id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    step.timeoutMs = 8000;
    lastType = step.type;
    queue = queue.then(async () => {
      const { rec } = await S.get('rec');
      if (!rec) return;
      rec.steps.push(step);
      await S.set({ rec });
      render(rec.steps.length);
    });
    return queue;
  }
  function addCaptcha() { if (lastType !== 'captchaPause') addStep({ type: 'captchaPause', locator: null }); }

  function recordField(el) {
    if (!/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
    const t = (el.type || '').toLowerCase();
    if (['button', 'submit', 'reset', 'image', 'file', 'hidden'].includes(t)) return;
    if (el.tagName === 'INPUT' && /captcha/i.test(info(el))) return addCaptcha();
    const locator = FA.buildLocator(el);
    if (t === 'checkbox' || t === 'radio') return addStep({ type: 'check', locator, checked: el.checked });
    if (el.tagName === 'SELECT') {
      const o = el.options[el.selectedIndex];
      return addStep({ type: 'select', locator, value: { mode: 'literal', value: el.value, text: o ? o.text.trim() : '' } });
    }
    if (last.el === el && last.val === el.value) return;
    last = { el, val: el.value };
    const sens = t === 'password' || SENSITIVE.test(info(el));
    addStep({ type: 'type', locator, sensitive: sens, value: sens ? { mode: 'ask' } : { mode: 'literal', value: el.value } });
  }

  const onChange = (e) => { if (!fromOverlay(e) && e.isTrusted) recordField(e.target); };
  function pointerAncestor(el) {
    let n = el, d = 0;
    if (getComputedStyle(n).cursor !== 'pointer') return null;
    while (n.parentElement && d++ < 4 && getComputedStyle(n.parentElement).cursor === 'pointer') n = n.parentElement;
    return n;
  }
  function onClick(e) {
    if (fromOverlay(e) || !e.isTrusted || !(e.target instanceof Element)) return;
    const ft = e.target.closest('input,select,textarea,label,option');
    if (ft && !ft.matches('input[type=submit],input[type=button],input[type=image]')) return;
    const t = e.target.closest(CLICKABLE) || pointerAncestor(e.target);
    if (t) addStep({ type: 'click', locator: FA.buildLocator(t) });
  }
  function onKey(e) {
    if (fromOverlay(e) || !e.isTrusted || e.key !== 'Enter') return;
    const el = e.target;
    if (el.tagName !== 'INPUT' || /checkbox|radio|submit|button|image/.test(el.type)) return;
    recordField(el);
    if (!/captcha/i.test(info(el))) addStep({ type: 'key', key: 'Enter', locator: FA.buildLocator(el) });
  }
  function onBlur() {
    setTimeout(() => {
      const a = document.activeElement;
      if (a && a.tagName === 'IFRAME' && /recaptcha|hcaptcha|turnstile|challenges\.cloudflare/i.test(a.src)) addCaptcha();
    }, 0);
  }

  function render(n) {
    FA.overlay.set({
      title: '● Recording', tone: 'rec', sub: `${n} step${n === 1 ? '' : 's'} captured. Use the page normally.`,
      buttons: [
        ['Stop & save', () => chrome.runtime.sendMessage({ type: 'stopRecording' })],
        ['Add pause', () => addStep({ type: 'manualPause', locator: null })],
      ],
    });
  }

  FA.rec = {
    start(n = 0) {
      if (!active) {
        active = true;
        document.addEventListener('change', onChange, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('blur', onBlur);
      }
      render(n);
    },
    stop() {
      if (!active) return;
      active = false;
      document.removeEventListener('change', onChange, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onBlur);
    },
  };
})();
