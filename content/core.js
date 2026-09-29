// Shared helpers: locator builder + resolver, waiters, field setters. Exposed as window.FA.
(() => {
  if (window.FA) return;
  const FA = (window.FA = {});
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  FA.norm = norm;
  FA.sleep = sleep;

  const stableId = (id) => !!id && !/\d{4,}|[0-9a-f]{8,}|^:/i.test(id);

  FA.isVisible = (el) => {
    if (!el || !el.isConnected || !el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const isToggle = (el) => el.tagName === 'INPUT' && /^(checkbox|radio)$/.test(el.type);
  const usable = (el) => FA.isVisible(el) || (isToggle(el) && el.labels && [...el.labels].some(FA.isVisible));
  const isField = (el) => /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !/^(button|submit|reset|image)$/.test(el.type || '');
  const textOf = (el) => norm(el.innerText || el.value || el.getAttribute('title') || '').slice(0, 60);

  function nearText(el) {
    let p = el;
    for (let i = 0; i < 3 && p; i++, p = p.parentElement) {
      const s = p.previousElementSibling;
      if (s) { const t = s.textContent.trim(); if (t && t.length < 60) return t; }
    }
    return '';
  }
  FA.labelText = (el) => {
    let t = '';
    if (el.labels && el.labels.length) t = el.labels[0].innerText || el.labels[0].textContent;
    if (!t) {
      const lb = el.getAttribute('aria-labelledby');
      if (lb) t = lb.split(/\s+/).map((i) => (document.getElementById(i) || {}).textContent || '').join(' ');
    }
    if (!t) { const l = el.closest('label'); if (l) t = l.textContent; }
    if (!t) t = el.getAttribute('aria-label') || nearText(el);
    return t.replace(/[*:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  };

  FA.cssPath = (el) => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.body && parts.length < 8; n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (stableId(n.id)) { parts.unshift(s + '#' + CSS.escape(n.id)); break; }
      const nm = n.getAttribute('name');
      if (nm) s += `[name="${nm.replace(/"/g, '\\"')}"]`;
      else if (n.parentElement) {
        const sib = [...n.parentElement.children].filter((c) => c.tagName === n.tagName);
        if (sib.length > 1) s += `:nth-of-type(${sib.indexOf(n) + 1})`;
      }
      parts.unshift(s);
    }
    return parts.join(' > ');
  };
  FA.xpath = (el) => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      let i = 1;
      for (let s = n.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === n.tagName) i++;
      parts.unshift(n.tagName.toLowerCase() + '[' + i + ']');
    }
    return '/' + parts.join('/');
  };

  FA.buildLocator = (el) => {
    const field = isField(el);
    return {
      tag: el.tagName.toLowerCase(),
      inputType: el.type || null,
      id: stableId(el.id) ? el.id : null,
      name: el.getAttribute('name'),
      ariaLabel: el.getAttribute('aria-label'),
      labelText: field ? FA.labelText(el) || null : null,
      placeholder: el.getAttribute('placeholder'),
      value: isToggle(el) ? el.getAttribute('value') : null,
      text: field ? null : textOf(el) || null,
      css: FA.cssPath(el),
      xpath: FA.xpath(el),
    };
  };

  FA.resolve = (loc) => {
    const tried = [], votes = new Map();
    const pool = [...document.querySelectorAll(loc.tag)];
    const vOk = (e) => !loc.value || e.getAttribute('value') === loc.value;
    const vote = (name, w, list) => {
      const l = [...new Set(list)].filter(usable);
      tried.push(name + ':' + l.length);
      if (l.length === 1) votes.set(l[0], (votes.get(l[0]) || 0) + w);
    };
    if (loc.id) vote('id', 5, [document.getElementById(loc.id)].filter((e) => e && e.tagName.toLowerCase() === loc.tag));
    if (loc.name) vote('name', 4, pool.filter((e) => e.getAttribute('name') === loc.name && vOk(e)));
    const ln = norm(loc.labelText);
    if (ln) vote('label', 4, pool.filter((e) => norm(FA.labelText(e)) === ln && vOk(e)));
    if (loc.ariaLabel) vote('aria', 3, pool.filter((e) => e.getAttribute('aria-label') === loc.ariaLabel && vOk(e)));
    if (loc.placeholder) vote('placeholder', 3, pool.filter((e) => e.getAttribute('placeholder') === loc.placeholder));
    if (loc.text) vote('text', 4, pool.filter((e) => textOf(e) === loc.text));
    if (loc.css) { try { vote('css', 2, [...document.querySelectorAll(loc.css)]); } catch { tried.push('css:err'); } }
    if (loc.xpath) {
      try {
        const r = document.evaluate(loc.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        vote('xpath', 2, r ? [r] : []);
      } catch { tried.push('xpath:err'); }
    }
    const fz = ln || loc.text;
    if (fz) {
      vote('fuzzy', 1, pool.filter((e) => {
        const t = ln ? norm(FA.labelText(e)) : textOf(e);
        return t && (t.includes(fz) || fz.includes(t)) && vOk(e) && (!ln || e.type === loc.inputType);
      }));
    }
    const ranked = [...votes].sort((a, b) => b[1] - a[1]);
    if (!ranked.length || ranked[0][1] < 2 || (ranked[1] && ranked[1][1] === ranked[0][1])) return { el: null, tried };
    return { el: ranked[0][0], score: ranked[0][1], tried };
  };

  FA.waitFor = (fn, timeout = 8000) =>
    new Promise((res) => {
      let done = false, obs, iv, to;
      const finish = (v) => { if (done) return; done = true; obs.disconnect(); clearInterval(iv); clearTimeout(to); res(v); };
      const check = () => { let v; try { v = fn(); } catch { /* keep waiting */ } if (v) finish(v); };
      obs = new MutationObserver(check);
      obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      iv = setInterval(check, 250);
      to = setTimeout(() => finish(null), timeout);
      check();
    });
  FA.waitStable = async (el) => {
    let last = null;
    for (let i = 0; i < 20; i++) {
      const r = el.getBoundingClientRect();
      const k = [r.x, r.y, r.width, r.height].map(Math.round).join();
      if (k === last) return;
      last = k;
      await sleep(50);
    }
  };

  const fire = (el, t) => el.dispatchEvent(new Event(t, { bubbles: true }));
  function nativeSet(el, v) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, 'value');
    if (d && d.set) d.set.call(el, v); else el.value = v;
  }
  const alnum = (s) => String(s).replace(/[^a-z0-9]/gi, '').toLowerCase();
  FA.setText = async (el, v) => {
    el.focus();
    nativeSet(el, v);
    fire(el, 'input'); fire(el, 'change');
    el.blur();
    return el.value === v || alnum(el.value) === alnum(v);
  };
  FA.setSelect = (el, value, text) => {
    const o = [...el.options].find((o) => o.value === value) || [...el.options].find((o) => norm(o.text) === norm(text || value));
    if (!o) return false;
    el.focus(); nativeSet(el, o.value); o.selected = true;
    fire(el, 'input'); fire(el, 'change');
    return el.value === o.value;
  };
  FA.setChecked = async (el, want) => {
    if (el.checked === want) return true;
    let target = el;
    if (!FA.isVisible(el)) target = (el.labels && [...el.labels].find(FA.isVisible)) || el;
    target.click();
    await sleep(30);
    return el.checked === want;
  };
  FA.click = (el) => {
    el.scrollIntoView({ block: 'center' });
    const o = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.click();
  };
  FA.pressEnter = (el) => {
    el.focus();
    const ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true });
    if (el.dispatchEvent(ev) && el.form) el.form.requestSubmit();
  };
  FA.highlight = (el) => {
    const prev = el.style.outline;
    el.style.outline = '3px solid #f59e0b';
    setTimeout(() => (el.style.outline = prev), 3000);
  };

  // captcha detection (never solved, only detected)
  FA.findCaptcha = () => {
    const sels = ['iframe[src*="recaptcha"]', 'iframe[src*="hcaptcha"]', 'iframe[src*="turnstile"]', 'iframe[src*="challenges.cloudflare"]',
      '.g-recaptcha', '.h-captcha', '.cf-turnstile', 'img[id*="captcha" i]', 'img[src*="captcha" i]', 'img[alt*="captcha" i]'];
    for (const s of sels) { const e = document.querySelector(s); if (e && FA.isVisible(e)) return e; }
    return null;
  };
  FA.findCaptchaInput = () =>
    [...document.querySelectorAll('input')].find((i) => /captcha/i.test(i.name + i.id + (i.placeholder || '')) && FA.isVisible(i)) || null;

  FA.describe = (s) => {
    const l = s.locator || {};
    const n = l.labelText || l.text || l.ariaLabel || l.placeholder || l.name || l.id || l.tag || '';
    const verb = { type: 'Fill', select: 'Select', check: s.checked === false ? 'Uncheck' : 'Check', click: 'Click', key: 'Press ' + (s.key || '') }[s.type];
    if (s.type === 'captchaPause') return 'Captcha pause';
    if (s.type === 'manualPause') return 'Manual pause';
    return `${verb || s.type} ${n}`.trim();
  };
})();
