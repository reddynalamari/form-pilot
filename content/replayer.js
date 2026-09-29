// Step executor. Persists progress in storage.run so replay survives page loads.
// Ownership: whichever page loaded last claims run.owner; older page instances stop themselves.
(() => {
  const FA = window.FA;
  const S = chrome.storage.local;
  const ME = Math.random().toString(36).slice(2);
  let navigating = false, pauseReq = false, looping = false;
  let searchTimer = null, autoTimer = null;
  addEventListener('beforeunload', () => (navigating = true));
  addEventListener('pageshow', () => (navigating = false));

  const getRun = async () => (await S.get('run')).run;
  async function patch(p, claim) {
    const run = await getRun();
    if (!run || (!claim && run.owner !== ME)) return null;
    Object.assign(run, p);
    await S.set({ run });
    return run;
  }
  async function load() {
    const { flows = [], profiles = [], run } = await S.get(['flows', 'profiles', 'run']);
    return { run, flow: flows.find((f) => run && f.id === run.flowId), profile: profiles.find((p) => run && p.id === run.profileId) };
  }

  function clearAuto() { if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; } }
  function clearSearch() { if (searchTimer) { clearInterval(searchTimer); searchTimer = null; } }

  async function exec(step, profile, idx, flow) {
    if (step.type === 'navigate') {
      if (!step.url) return { error: 'Navigation step has no URL' };
      await patch({ stepIndex: idx + 1 });
      location.href = step.url;
      return 'navigated';
    }
    if (step.type === 'wait') {
      await FA.sleep(Math.max(0, Number(step.delayMs) || 0));
      return 'ok';
    }
    if (step.type === 'captchaPause') {
      const c = await FA.waitFor(() => FA.findCaptcha() || FA.findCaptchaInput(), 2500);
      if (c) { c.scrollIntoView({ block: 'center' }); FA.highlight(c); }
      const inp = FA.findCaptchaInput();
      if (inp) inp.focus();
      return { pause: 'paused-captcha' };
    }
    if (step.type === 'manualPause') return { pause: 'paused-manual', msg: 'Paused here, as recorded. Press Resume to continue.' };

    const timeoutMs = step.timeoutMs || FA.settings.get().searchTimeoutMs;
    const baseTitle = `Step ${idx + 1} of ${flow.steps.length}`;
    const baseSub = FA.describe(step);
    // Live progress instead of a silent wait, so a slow-to-appear element doesn't look stuck.
    const t0 = Date.now();
    clearSearch();
    searchTimer = setInterval(() => {
      FA.overlay.set({
        title: baseTitle,
        sub: `${baseSub} — looking… (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
        buttons: [['Pause', () => (pauseReq = true)], ['Stop', stop]],
      });
    }, 300);
    const found = await FA.waitFor(() => { const r = FA.resolve(step.locator); return r.el ? r : null; }, timeoutMs);
    clearSearch();
    if (!found) return { error: 'Element not found. Strategies tried: ' + FA.resolve(step.locator).tried.join(', ') };
    const el = found.el;
    el.scrollIntoView({ block: 'center' });
    await FA.waitStable(el);
    const v = step.value || {};
    const val = v.mode === 'profile' ? (profile && profile.fields || {})[v.key] : v.value;

    switch (step.type) {
      case 'type': {
        if (v.mode === 'ask') {
          FA.highlight(el); el.focus();
          return { pause: 'paused-manual', msg: `Type "${FA.describe(step).replace(/^Fill /, '')}" yourself, then press Resume.` };
        }
        if (val == null) return { error: v.mode === 'profile' ? `Profile has no value for "${v.key}"` : 'No value stored for this step' };
        let ok = await FA.setText(el, String(val));
        if (!ok) { await FA.sleep(150); ok = await FA.setText(el, String(val)); }
        return ok ? 'ok' : { error: 'The value did not stick in the field' };
      }
      case 'select': {
        if (val == null) return { error: 'No value for this dropdown' };
        return FA.setSelect(el, String(val), v.mode === 'profile' ? String(val) : v.text) ? 'ok' : { error: `Option "${val}" not found in dropdown` };
      }
      case 'check':
        return (await FA.setChecked(el, step.checked !== false)) ? 'ok' : { error: 'Could not change checkbox/radio state' };
      case 'click':
      case 'key':
        await patch({ stepIndex: idx + 1 });
        if (step.type === 'click') FA.click(el); else FA.pressEnter(el);
        await FA.sleep(350);
        return navigating ? 'navigated' : 'advanced';
    }
    return { error: 'Unknown step type: ' + step.type };
  }

  async function loop() {
    if (looping) return;
    looping = true;
    try {
      for (;;) {
        const { run, flow, profile } = await load();
        if (!run || run.owner !== ME || run.status !== 'running') return;
        if (!flow) { await patch({ status: 'paused-error', lastError: 'This flow no longer exists.' }); return render(); }
        if (run.stepIndex >= flow.steps.length) { await patch({ status: 'done' }); return render(); }
        if (pauseReq) { pauseReq = false; await patch({ status: 'paused-manual', note: 'Paused by you. Press Resume to continue.' }); return render(); }
        const idx = run.stepIndex, step = flow.steps[idx];
        FA.overlay.set({ title: `Step ${idx + 1} of ${flow.steps.length}`, sub: FA.describe(step), buttons: [['Pause', () => (pauseReq = true)], ['Stop', stop]] });
        let res;
        try { res = await exec(step, profile, idx, flow); } catch (e) { res = { error: String(e) }; }
        finally { clearSearch(); }
        if (res === 'navigated') return;
        const cur = await getRun();
        if (!cur || cur.owner !== ME) return;
        if (res && res.error) { await patch({ status: 'paused-error', lastError: res.error }); return render(); }
        if (res && res.pause) { await patch({ status: res.pause, stepIndex: idx + 1, note: res.msg || null }); return render(); }
        if (res === 'ok') await patch({ stepIndex: idx + 1 });
      }
    } finally { looping = false; }
  }

  async function resume() { clearAuto(); await patch({ status: 'running', lastError: null, note: null, owner: ME }, true); loop(); }
  async function skip() {
    clearAuto();
    const r = await getRun();
    if (!r) return;
    await patch({ status: 'running', stepIndex: r.stepIndex + 1, lastError: null, owner: ME }, true);
    loop();
  }
  async function stop() { clearAuto(); clearSearch(); await S.remove('run'); FA.overlay.hide(); }

  async function render() {
    clearAuto();
    const { run, flow } = await load();
    if (!run) return FA.overlay.hide();
    const n = flow ? flow.steps.length : 0, i = run.stepIndex;
    const R = ['Retry', resume], RE = ['Resume', resume], X = ['Stop', stop];
    const st = FA.settings.get();
    // On a pause or a failed step, auto-continue after a countdown unless the user acts first.
    // Configurable in Options: the delay (0 = continue immediately) and whether it's on at all.
    const armAuto = (fn) => { if (st.autoAdvanceEnabled) autoTimer = setTimeout(fn, Math.max(0, st.autoAdvanceMs)); };
    const countdownFor = (label) => (st.autoAdvanceEnabled ? { ms: Math.max(0, st.autoAdvanceMs), label } : null);

    switch (run.status) {
      case 'paused-captcha':
        return FA.overlay.set({ title: '⏸ Solve the captcha', tone: 'warn', sub: 'Then press Resume. Form Pilot never reads or solves it.', buttons: [RE, X] });
      case 'paused-manual':
        return FA.overlay.set({ title: '⏸ Paused', tone: 'warn', sub: run.note || 'Press Resume to continue.', buttons: [RE, X] });
      case 'paused-error': {
        const onTimeout = st.autoAdvanceAction === 'retry' ? resume : skip;
        armAuto(onTimeout);
        return FA.overlay.set({
          title: `⚠ Step ${i + 1} failed`, tone: 'err', sub: run.lastError || '',
          buttons: [R, ['Skip step', skip], X],
          countdown: countdownFor(st.autoAdvanceAction === 'retry' ? 'Retrying' : 'Skipping'),
        });
      }
      case 'done':
        return FA.overlay.set({ title: '✓ Finished', sub: `${n} steps done. Review the form before you submit.`, buttons: [['Close', stop]] });
    }
  }

  FA.replay = {
    async init(run) {
      await FA.settings.ready;
      if (run.status === 'running') { await patch({ owner: ME }, true); loop(); } else render();
    },
  };
})();
