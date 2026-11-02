/* V/MESH · effects: embers, fireworks, dominoes, radio sounds, decrypt text, haptics */
(function () {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  /* ── Embers: crimson sparks drifting upward ── */
  const embers = (() => {
    const cv = document.getElementById('fxEmbers');
    const ctx = cv.getContext('2d');
    let W = 0, H = 0, parts = [], running = true, boost = 0;
    function size() {
      W = cv.width = innerWidth * DPR; H = cv.height = innerHeight * DPR;
      const n = reduce ? 0 : Math.round(Math.min(70, (innerWidth * innerHeight) / 14000));
      parts = Array.from({ length: n }, () => spawn(true));
    }
    function spawn(any) {
      return {
        x: Math.random() * W, y: any ? Math.random() * H : H + 10,
        r: (Math.random() * 1.8 + .4) * DPR, vy: -(Math.random() * .5 + .15) * DPR, vx: (Math.random() - .5) * .25 * DPR,
        a: Math.random() * .6 + .2, t: Math.random() * 6.28, hue: Math.random() < .8 ? 352 : 18
      };
    }
    function tick() {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      const sp = 1 + boost;
      for (const p of parts) {
        p.t += .02; p.y += p.vy * sp; p.x += p.vx + Math.sin(p.t) * .25 * DPR;
        if (p.y < -10) Object.assign(p, spawn(false));
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        g.addColorStop(0, `hsla(${p.hue},100%,62%,${p.a})`);
        g.addColorStop(1, `hsla(${p.hue},100%,50%,0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4, 0, 6.29); ctx.fill();
      }
      boost *= .97;
      requestAnimationFrame(tick);
    }
    addEventListener('resize', size);
    document.addEventListener('visibilitychange', () => {
      running = !document.hidden;
      if (running) requestAnimationFrame(tick);
    });
    size(); requestAnimationFrame(tick);
    return { gust(v) { boost = Math.max(boost, v || 4); } };
  })();

  /* ── Fireworks: the finale ── */
  const fireworks = (() => {
    const cv = document.getElementById('fxFireworks');
    const ctx = cv.getContext('2d');
    let W, H, sparks = [], rockets = [], raf = 0;
    function size() { W = cv.width = innerWidth * DPR; H = cv.height = innerHeight * DPR; }
    addEventListener('resize', size); size();
    const PAL = [[255, 45, 72], [255, 122, 69], [243, 237, 226], [201, 164, 92], [255, 200, 120]];
    function explode(x, y, col, n) {
      const c = col || PAL[Math.floor(Math.random() * PAL.length)];
      const N = n || 90;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2 + Math.random() * .2, s = (Math.random() * 3.2 + 1.2) * DPR;
        sparks.push({ x, y, px: x, py: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, d: Math.random() * .012 + .008, c });
      }
      // a ring of gold crackle
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * 6.28, s = Math.random() * 1.2 * DPR;
        sparks.push({ x, y, px: x, py: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, d: .02, c: [255, 220, 150], tw: true });
      }
    }
    function launch(tx, ty) {
      rockets.push({ x: tx + (Math.random() - .5) * 60 * DPR, y: H + 10, tx, ty, px: 0, py: 0 });
      loop();
    }
    function step() {
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      rockets = rockets.filter((r) => {
        r.px = r.x; r.py = r.y;
        r.x += (r.tx - r.x) * .08; r.y += (r.ty - r.y) * .08;
        ctx.strokeStyle = 'rgba(255,200,160,.9)'; ctx.lineWidth = 2 * DPR;
        ctx.beginPath(); ctx.moveTo(r.px, r.py + 18 * DPR); ctx.lineTo(r.x, r.y); ctx.stroke();
        if (Math.abs(r.y - r.ty) < 6 * DPR) { explode(r.x, r.y); sound.boom(); return false; }
        return true;
      });
      sparks = sparks.filter((p) => {
        p.px = p.x; p.py = p.y;
        p.vx *= .985; p.vy = p.vy * .985 + .045 * DPR;
        p.x += p.vx; p.y += p.vy; p.life -= p.d;
        const a = p.tw ? (Math.random() > .5 ? p.life : 0) : p.life;
        ctx.strokeStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${a})`;
        ctx.lineWidth = 1.6 * DPR;
        ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); ctx.stroke();
        return p.life > 0;
      });
      if (sparks.length || rockets.length) raf = requestAnimationFrame(step);
      else { raf = 0; ctx.clearRect(0, 0, W, H); }
    }
    function loop() { if (!raf) raf = requestAnimationFrame(step); }
    function finale(count) {
      if (reduce) return;
      const n = count || 6;
      for (let i = 0; i < n; i++) {
        setTimeout(() => launch(W * (.2 + Math.random() * .6), H * (.18 + Math.random() * .3)), i * 260);
      }
    }
    function burstAt(el, n) {
      if (reduce) return;
      const r = el.getBoundingClientRect();
      explode((r.left + r.width / 2) * DPR, (r.top + r.height / 2) * DPR, null, n || 50);
      loop();
    }
    return { finale, burstAt };
  })();

  /* ── Dominoes falling in a V formation ── */
  function dominoes(count) {
    const n = count || 22;
    const wrap = document.createElement('div');
    wrap.className = 'dominoes';
    const floor = document.createElement('div');
    floor.className = 'floor';
    wrap.appendChild(floor);
    const half = Math.floor(n / 2);
    // left arm top-left → bottom point, right arm bottom point → top-right
    const P0 = [30, 20], P1 = [120, 140], P2 = [214, 4];
    for (let i = 0; i < n; i++) {
      const left = i < half;
      const t = left ? i / half : (i - half) / (n - half - 1 || 1);
      const A = left ? P0 : P1, B = left ? P1 : P2;
      const x = A[0] + (B[0] - A[0]) * t, y = A[1] + (B[1] - A[1]) * t;
      const ang = Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI + 90;
      const d = document.createElement('i');
      d.className = 'dom' + (i === half ? ' r' : '');
      d.style.setProperty('--x', x + 'px');
      d.style.setProperty('--y', y + 'px');
      d.style.setProperty('--a', ang + 'deg');
      d.style.setProperty('--d', (i * 0.07) + 's');
      floor.appendChild(d);
    }
    return wrap;
  }

  /* ── Radio sounds (WebAudio, synthesized) ── */
  const sound = (() => {
    let ctx = null, on = true;
    try { on = localStorage.getItem('vmesh.sound') !== '0'; } catch (e) { /* storage blocked */ }
    function ac() {
      if (!ctx) {
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        ctx = new C();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(freq, dur, type, vol, when) {
      if (!on) return;
      const a = ac(); if (!a) return;
      const t = a.currentTime + (when || 0);
      const o = a.createOscillator(), g = a.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol || .08, t + .01);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g).connect(a.destination);
      o.start(t); o.stop(t + dur + .02);
    }
    function noise(dur, vol, freq, when) {
      if (!on) return;
      const a = ac(); if (!a) return;
      const t = a.currentTime + (when || 0);
      const len = Math.floor(a.sampleRate * dur);
      const buf = a.createBuffer(1, len, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = a.createBufferSource(); src.buffer = buf;
      const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 1800; f.Q.value = .8;
      const g = a.createGain(); g.gain.value = vol || .06;
      src.connect(f).connect(g).connect(a.destination);
      src.start(t);
    }
    return {
      get on() { return on; },
      set(v) { on = !!v; try { localStorage.setItem('vmesh.sound', on ? '1' : '0'); } catch (e) { /* ignore */ } },
      unlock() { ac(); },
      click() { tone(1400, .04, 'square', .025); },
      roger() { noise(.09, .05, 2400); tone(1250, .07, 'square', .04, .08); tone(1650, .09, 'square', .04, .15); },
      squelch() { noise(.18, .07, 1600); tone(920, .05, 'sine', .03, .17); },
      chime() { [523, 659, 784, 1047].forEach((f, i) => tone(f, .5, 'sine', .06, i * .09)); },
      knock() { tone(180, .09, 'triangle', .18); tone(160, .09, 'triangle', .18, .16); },
      deny() { tone(220, .22, 'sawtooth', .05); tone(165, .3, 'sawtooth', .05, .2); },
      alarm() { for (let i = 0; i < 4; i++) { tone(880, .14, 'square', .045, i * .3); tone(660, .14, 'square', .045, i * .3 + .15); } },
      boom() { noise(.5, .08, 220); },
      tick() { tone(2000, .015, 'square', .015); }
    };
  })();

  /* ── Decrypt / scramble text ── */
  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@$*+=<>/\\';
  function scramble(el, text, opts) {
    const o = Object.assign({ duration: 700 }, opts);
    if (reduce || text.length > 220) { el.textContent = text; return; }
    const start = performance.now();
    const chars = Array.from(text);
    function frame(now) {
      const p = Math.min(1, (now - start) / o.duration);
      const reveal = Math.floor(p * chars.length);
      let out = '';
      for (let i = 0; i < chars.length; i++) {
        if (i < reveal || chars[i] === ' ' || chars[i] === '\n') out += chars[i];
        else out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
      if (p < 1) requestAnimationFrame(frame);
      else el.textContent = text;
    }
    requestAnimationFrame(frame);
  }

  function haptic(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* not allowed */ } }

  function alarm() {
    const a = document.getElementById('alarm');
    a.classList.remove('on'); void a.offsetWidth; a.classList.add('on');
    document.body.classList.remove('quake'); void document.body.offsetWidth; document.body.classList.add('quake');
    setTimeout(() => document.body.classList.remove('quake'), 600);
    sound.alarm(); haptic([120, 60, 120, 60, 240]);
  }

  /* Pointer-follow glow for cards */
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest && e.target.closest('.method');
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', ((e.clientX - r.left) / r.width) * 100 + '%');
    card.style.setProperty('--my', ((e.clientY - r.top) / r.height) * 100 + '%');
  }, { passive: true });

  window.VM = window.VM || {};
  VM.fx = { embers, fireworks, dominoes, sound, scramble, haptic, alarm, reduce };
})();
