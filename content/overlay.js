// In-page status bar inside a Shadow DOM so the site's CSS can't touch it.
// Draggable anywhere on screen; position is remembered via FA.settings.
(() => {
  const FA = window.FA;
  let host, bar, cdTimer;

  function applyPos() {
    const p = FA.settings.get().overlayPos;
    if (p) {
      host.style.left = p.left + 'px';
      host.style.top = p.top + 'px';
      host.style.right = 'auto';
      host.style.bottom = 'auto';
    } else {
      host.style.right = '16px';
      host.style.bottom = '16px';
      host.style.left = 'auto';
      host.style.top = 'auto';
    }
  }

  function ensure() {
    if (host && host.isConnected) return;
    host = document.createElement('div');
    host.id = 'fa-overlay-host';
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;';
    applyPos();
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      .bar{font:13px/1.4 system-ui,sans-serif;background:#12222b;color:#eef3f5;border-radius:10px;padding:12px 14px;width:290px;box-shadow:0 8px 28px rgba(0,0,0,.35);border-left:5px solid #2f9e8f;cursor:grab;touch-action:none}
      .bar.warn{border-left-color:#f59e0b}.bar.err{border-left-color:#e5484d}.bar.rec{border-left-color:#e5484d}
      .bar.dragging{cursor:grabbing;opacity:.92}
      .t{font-weight:650;font-size:14px;user-select:none}.s{margin-top:3px;color:#b7c6cc;word-break:break-word}
      .cd{margin-top:6px;font-size:11px;color:#8fa4ac;min-height:14px}
      .b{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
      button{font:inherit;font-weight:600;border:0;border-radius:6px;padding:6px 11px;cursor:pointer;background:#2f9e8f;color:#fff}
      button.g{background:#2b3f4a;color:#dbe6ea}button:focus-visible{outline:2px solid #fff;outline-offset:2px}
    </style><div class="bar"><div class="t"></div><div class="s"></div><div class="cd"></div><div class="b"></div></div>`;
    bar = root.querySelector('.bar');
    document.documentElement.appendChild(host);

    // Drag anywhere on the bar (except buttons) to reposition; saved on release.
    let dragging = false, dx = 0, dy = 0;
    bar.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      dragging = true;
      bar.classList.add('dragging');
      const r = host.getBoundingClientRect();
      dx = e.clientX - r.left;
      dy = e.clientY - r.top;
      e.preventDefault();
    });
    addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const w = host.offsetWidth || 290, h = host.offsetHeight || 80;
      const left = Math.min(Math.max(0, e.clientX - dx), innerWidth - w);
      const top = Math.min(Math.max(0, e.clientY - dy), innerHeight - h);
      host.style.left = left + 'px';
      host.style.top = top + 'px';
      host.style.right = 'auto';
      host.style.bottom = 'auto';
    });
    addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      bar.classList.remove('dragging');
      const r = host.getBoundingClientRect();
      FA.settings.set({ overlayPos: { top: Math.round(r.top), left: Math.round(r.left) } });
    });
  }

  FA.overlay = {
    // countdown: optional { ms, label } — shows a live "Label in N.Ns…" line, e.g. label:"Skipping"
    set({ title, sub = '', tone = '', buttons = [], countdown = null }) {
      ensure();
      clearInterval(cdTimer);
      bar.className = 'bar ' + tone;
      bar.children[0].textContent = title;
      bar.children[1].textContent = sub;
      bar.children[2].textContent = '';
      bar.children[3].innerHTML = '';
      buttons.forEach(([label, fn, ghost], i) => {
        const b = document.createElement('button');
        b.textContent = label;
        if (ghost !== false && i > 0) b.className = 'g';
        b.onclick = fn;
        bar.children[3].appendChild(b);
      });
      if (countdown && countdown.ms > 0) {
        const end = Date.now() + countdown.ms;
        const cdEl = bar.children[2];
        const tick = () => {
          const left = end - Date.now();
          if (left <= 0) { cdEl.textContent = ''; clearInterval(cdTimer); return; }
          cdEl.textContent = `${countdown.label} in ${(left / 1000).toFixed(1)}s…`;
        };
        tick();
        cdTimer = setInterval(tick, 100);
      }
    },
    hide() {
      clearInterval(cdTimer);
      if (host) host.remove();
      host = null;
    },
  };
})();
