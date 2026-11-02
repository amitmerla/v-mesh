/* V/MESH · tooltips + spoken walk-through tour */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const fx = () => VM.fx;

  /* ───────── Tooltips ─────────
     Registry: selector → [kicker, title, hint]. Dynamic nodes may carry data-tip="kicker|title|hint". */
  const REG = [];
  const tipEl = document.createElement('div');
  tipEl.className = 'tip';
  tipEl.setAttribute('role', 'tooltip');
  document.body.appendChild(tipEl);
  let tipTimer = 0, tipFor = null, suppressClick = false;

  function register(map) { Object.keys(map).forEach((sel) => REG.push([sel, map[sel]])); }
  function lookup(el) {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.dataset && n.dataset.tip) {
        const p = n.dataset.tip.split('|');
        return { node: n, k: p.length > 2 ? p[0] : 'Tip', t: p.length > 2 ? p[1] : p[0], h: p.length > 2 ? p[2] : (p[1] || '') };
      }
      for (const [sel, v] of REG) {
        try { if (n.matches(sel)) return { node: n, k: v[0], t: v[1], h: v[2] }; } catch (e) { /* bad selector */ }
      }
    }
    return null;
  }
  function show(info) {
    tipEl.innerHTML = `<span class="tk"></span><span class="tt"></span><span class="th"></span>`;
    tipEl.children[0].textContent = info.k;
    tipEl.children[1].textContent = info.t;
    tipEl.children[2].textContent = info.h;
    const r = info.node.getBoundingClientRect();
    tipEl.style.left = '0px'; tipEl.style.top = '0px';
    tipEl.classList.add('on');
    const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    let x = r.left + r.width / 2 - tw / 2;
    x = Math.max(12, Math.min(innerWidth - tw - 12, x));
    let y = r.bottom + 12;
    if (y + th > innerHeight - 12) y = r.top - th - 12;
    if (y < 12) y = 12;
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  }
  function hide() { clearTimeout(tipTimer); tipFor = null; tipEl.classList.remove('on'); }

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse' || tour.active) return;
    const info = lookup(e.target);
    if (!info) { hide(); return; }
    if (info.node === tipFor) return;
    clearTimeout(tipTimer);
    tipFor = info.node;
    tipTimer = setTimeout(() => show(info), 380);
  });
  document.addEventListener('pointerdown', (e) => {
    hide();
    if (e.pointerType === 'mouse' || tour.active) return;
    const info = lookup(e.target);
    if (!info) return;
    const sx = e.clientX, sy = e.clientY;
    tipTimer = setTimeout(() => { show(info); fx().haptic(12); suppressClick = true; }, 480);
    const cancel = (ev) => {
      if (ev.type === 'pointermove' && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 10) return;
      clearTimeout(tipTimer);
      removeEventListener('pointermove', cancel); removeEventListener('pointerup', cancel); removeEventListener('pointercancel', cancel);
      if (ev.type !== 'pointermove' && suppressClick) setTimeout(hide, 1800);
    };
    addEventListener('pointermove', cancel); addEventListener('pointerup', cancel); addEventListener('pointercancel', cancel);
  }, { passive: true });
  document.addEventListener('click', (e) => {
    if (suppressClick) { suppressClick = false; e.preventDefault(); e.stopPropagation(); }
  }, true);
  document.addEventListener('contextmenu', (e) => { if (lookup(e.target) && e.target.tagName !== 'INPUT') e.preventDefault(); });
  addEventListener('scroll', hide, true);

  /* ───────── Voice ───────── */
  const voice = {
    on: true, list: [], chosen: null,
    init() {
      try { this.on = localStorage.getItem('vmesh.voice') !== '0'; } catch (e) { /* ignore */ }
      if (!('speechSynthesis' in window)) { this.on = false; return; }
      const load = () => {
        this.list = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
        let saved = null;
        try { saved = localStorage.getItem('vmesh.voiceName'); } catch (e) { /* ignore */ }
        this.chosen = this.list.find((v) => v.name === saved) || this.best();
      };
      load();
      speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', load);
    },
    best() {
      const score = (v) => {
        let s = 0;
        if (/premium|enhanced|natural|neural/i.test(v.name)) s += 10;
        if (/en-GB/i.test(v.lang)) s += 6; // a British narrator, naturally
        if (/daniel|arthur|oliver|george|google uk english male/i.test(v.name)) s += 4;
        if (/en-US/i.test(v.lang)) s += 2;
        if (v.localService) s += 1;
        return s;
      };
      return this.list.slice().sort((a, b) => score(b) - score(a))[0] || null;
    },
    set(on) { this.on = on; try { localStorage.setItem('vmesh.voice', on ? '1' : '0'); } catch (e) { /* ignore */ } if (!on) this.stop(); },
    stop() { if ('speechSynthesis' in window) speechSynthesis.cancel(); },
    speak(text, onWord, onEnd) {
      if (!this.on || !('speechSynthesis' in window)) { onEnd && setTimeout(onEnd, 0); return () => {}; }
      this.stop();
      const u = new SpeechSynthesisUtterance(text);
      if (this.chosen) u.voice = this.chosen;
      u.rate = 1; u.pitch = .95;
      let gotBoundary = false, timer = 0, ended = false;
      const words = [];
      text.replace(/\S+/g, (w, i) => { words.push(i); return w; });
      u.onboundary = (e) => {
        if (e.name && e.name !== 'word') return;
        gotBoundary = true;
        let idx = 0;
        for (let i = 0; i < words.length; i++) if (words[i] <= e.charIndex) idx = i;
        onWord && onWord(idx);
      };
      const end = () => { if (ended) return; ended = true; clearInterval(timer); onWord && onWord(-1); onEnd && onEnd(); };
      u.onend = end; u.onerror = end;
      u.onstart = () => {
        // Natural voices often skip boundary events: fall back to a timing estimate.
        setTimeout(() => {
          if (gotBoundary || ended) return;
          let i = 0;
          const per = 60000 / 175;
          onWord && onWord(0);
          timer = setInterval(() => { i++; if (i >= words.length) { clearInterval(timer); return; } onWord && onWord(i); }, per);
        }, 650);
      };
      speechSynthesis.speak(u);
      // Never hang if the engine silently drops the utterance.
      const guard = setTimeout(() => { if (!ended && !speechSynthesis.speaking) end(); }, 2500);
      return () => { clearTimeout(guard); ended = true; clearInterval(timer); this.stop(); };
    }
  };
  voice.init();

  /* ───────── Tour ───────── */
  const tour = {
    active: false, steps: [], i: 0, els: null, cancelSpeech: null, autoT: 0,
    start(steps) {
      this.steps = steps.filter(Boolean);
      if (!this.steps.length) return;
      this.stop(true);
      this.active = true; this.i = 0;
      hide();
      const veil = document.createElement('div'); veil.className = 'tour-veil';
      const hole = document.createElement('div'); hole.className = 'tour-hole';
      const card = document.createElement('div'); card.className = 'tour-card';
      veil.addEventListener('click', () => this.next());
      document.body.append(veil, hole, card);
      this.els = { veil, hole, card };
      addEventListener('resize', this._re = () => this.place());
      addEventListener('keydown', this._key = (e) => {
        if (e.key === 'Escape') this.stop();
        else if (e.key === 'ArrowRight' || e.key === 'Enter') this.next();
        else if (e.key === 'ArrowLeft') this.prev();
      });
      this.render();
    },
    target() {
      const st = this.steps[this.i];
      if (!st.sel) return null;
      const el = $(st.sel);
      return el && el.getClientRects().length ? el : null;
    },
    render() {
      clearTimeout(this.autoT);
      if (this.cancelSpeech) this.cancelSpeech();
      const st = this.steps[this.i];
      if (st.before) { try { st.before(); } catch (e) { /* step setup is best effort */ } }
      const { card } = this.els;
      const el = this.target();
      if (el) el.scrollIntoView({ block: 'center', behavior: fx().reduce ? 'auto' : 'smooth' });
      const words = st.d.split(/(\s+)/).map((w) => (/\s+/.test(w) ? w : `<span class="w">${w.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</span>`)).join('');
      const opts = voice.list.map((v) => `<option value="${v.name.replace(/"/g, '&quot;')}" ${voice.chosen && voice.chosen.name === v.name ? 'selected' : ''}>${v.name.replace(/</g, '')}</option>`).join('');
      card.innerHTML = `
        <div class="tc-k"><span>${st.k || 'Walk-through'}</span><span>${this.i + 1} / ${this.steps.length}</span></div>
        <h4></h4>
        <p>${words}</p>
        <div class="tc-acts">
          <button class="icon-btn tc-voice ${voice.on ? '' : 'off'}" aria-label="Narration"><svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path class="wave" d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/></svg></button>
          ${voice.list.length ? `<select class="tc-pick" aria-label="Narrator voice">${opts}</select>` : ''}
          <div class="grow"></div>
          <div class="tc-dots">${this.steps.map((_, j) => `<i class="${j === this.i ? 'on' : ''}"></i>`).join('')}</div>
        </div>
        <div class="tc-acts" style="margin-top:12px">
          <button class="ghost sm tc-skip">Close</button>
          <div class="grow"></div>
          ${this.i > 0 ? '<button class="ghost sm tc-prev">Back</button>' : ''}
          <button class="cta sm tc-next">${this.i === this.steps.length - 1 ? 'Done' : 'Next'}</button>
        </div>`;
      card.querySelector('h4').textContent = st.t;
      card.querySelector('.tc-next').onclick = (e) => { e.stopPropagation(); this.next(); };
      card.querySelector('.tc-skip').onclick = () => this.stop();
      const pv = card.querySelector('.tc-prev'); if (pv) pv.onclick = () => this.prev();
      card.querySelector('.tc-voice').onclick = (e) => {
        voice.set(!voice.on);
        e.currentTarget.classList.toggle('off', !voice.on);
        if (voice.on) this.render();
      };
      const pick = card.querySelector('.tc-pick');
      if (pick) pick.onchange = () => {
        voice.chosen = voice.list.find((v) => v.name === pick.value) || voice.chosen;
        try { localStorage.setItem('vmesh.voiceName', pick.value); } catch (e) { /* ignore */ }
        this.render();
      };
      card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
      setTimeout(() => this.place(), el ? 350 : 0);
      this.place();
      const spans = card.querySelectorAll('p .w');
      this.cancelSpeech = voice.speak(st.d, (idx) => {
        spans.forEach((s, j) => s.classList.toggle('on', j === idx));
      }, () => {
        if (this.active && voice.on && this.steps[this.i] === st) this.autoT = setTimeout(() => this.next(), 1100);
      });
    },
    place() {
      if (!this.active) return;
      const { hole, card } = this.els;
      const el = this.target();
      const pad = 10;
      const cw = card.offsetWidth, ch = card.offsetHeight;
      if (!el) {
        Object.assign(hole.style, { left: innerWidth / 2 + 'px', top: innerHeight / 2 + 'px', width: '0px', height: '0px' });
        card.style.left = (innerWidth - cw) / 2 + 'px';
        card.style.top = Math.max(20, (innerHeight - ch) / 2) + 'px';
        return;
      }
      const r = el.getBoundingClientRect();
      Object.assign(hole.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
      let x = Math.max(12, Math.min(innerWidth - cw - 12, r.left + r.width / 2 - cw / 2));
      let y = r.bottom + pad + 14;
      if (y + ch > innerHeight - 12) y = r.top - pad - 14 - ch;
      if (y < 12) y = Math.max(12, innerHeight - ch - 16);
      card.style.left = x + 'px'; card.style.top = y + 'px';
    },
    next() { if (this.i < this.steps.length - 1) { this.i++; fx().sound.tick(); this.render(); } else this.stop(); },
    prev() { if (this.i > 0) { this.i--; this.render(); } },
    stop(silent) {
      clearTimeout(this.autoT);
      if (this.cancelSpeech) this.cancelSpeech();
      this.cancelSpeech = null;
      if (this.els) Object.values(this.els).forEach((n) => n.remove());
      this.els = null;
      if (this._re) removeEventListener('resize', this._re);
      if (this._key) removeEventListener('keydown', this._key);
      const was = this.active;
      this.active = false;
      if (was && !silent && this.onEnd) this.onEnd();
    }
  };

  window.VM = window.VM || {};
  VM.help = { register, tour, voice, hideTip: hide };
})();
