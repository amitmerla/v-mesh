/* V/MESH · app controller: screens, flows, chat */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const { fx, net, help } = VM;
  const C = VM.crypto;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ini = (n) => (Array.from(String(n || '?').trim())[0] || '?').toUpperCase();
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cssId = (id) => (window.CSS && CSS.escape ? CSS.escape(id) : String(id).replace(/"/g, ''));
  const time = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const SCREENS = ['intro', 'name', 'link', 'role', 'lobby', 'test', 'chat'];
  const COLORS = ['#e8173a', '#ff7a45', '#c9a45c', '#f3ede2', '#7cc7ff', '#a78bfa', '#5ee08f'];
  const ADJ = ['Crimson', 'Silent', 'Velvet', 'Ember', 'Midnight', 'Gilded', 'Hollow', 'Scarlet', 'Iron', 'Quiet', 'Fifth'];
  const NOUN = ['Rose', 'Domino', 'Lantern', 'Raven', 'Courier', 'Fox', 'Sparrow', 'Mask', 'Rider', 'Echo', 'Night'];
  const NAME_IDEAS = ['Rose Courier', 'Domino Nine', 'Night Lantern', 'Ember Fox', 'Velvet Echo', 'Fifth Rider'];
  const BOT_NAMES = ['Rose Courier', 'Domino Nine', 'Night Lantern', 'Ember Fox', 'Velvet Echo'];
  const BOT_COLORS = ['#ff7a45', '#7cc7ff', '#a78bfa', '#5ee08f'];
  const BOT_LINES = [
    'Copy that. Holding at the gallery.', 'Signal is clean on my end.', 'No bars here either. And yet, here we are.',
    'The dominoes are lined up.', 'Lantern lit. Over.', 'Roses are in position.', 'Quiet on the north stairs.',
    'Heard. Moving in five.', 'Loud and clear.', 'Keep it short, the walls listen.', 'Understood. Going dark after this.',
    'Who brought the fireworks?', 'Still with you.'
  ];
  const BOT_HELLOS = ['Evening, all.', 'In position. Radio check?', 'Made it through the door.', 'Hello from the shadows.'];
  const QUICK = ['COPY THAT', 'OVER', 'RADIO CHECK', 'HOLD POSITION', 'REGROUP AT THE GALLERY', 'ALL CLEAR', 'GO DARK'];
  const CELL_IDEAS = ['Shadow Gallery', 'Fifth Night', 'Rose Cellar', 'Lantern Hall', 'Velvet Room', 'The Old Bailey'];
  const SIM = { cell: 'Shadow Gallery', pass: 'remember remember' };
  const MODES = {
    sim: { label: 'Simulated', kind: 'simulated radio' },
    tabs: { label: 'Same-device tabs', kind: 'local tabs' },
    rtc: { label: 'Wi-Fi / hotspot', kind: 'WebRTC · DTLS' },
    ble: { label: 'Bluetooth', kind: 'Bluetooth' }
  };

  const S = {
    screen: 'intro', name: '', color: COLORS[0], mode: null, role: null,
    cell: '', pass: '', autoAdmit: false, node: null, logs: [], unread: 0,
    timers: [], cleanups: [], bots: [], cells: new Map(), chosenCell: null,
    guestPhase: 'pick', phaseData: {}, pendingOffer: null, answers: [],
    myId: 'n' + C.randHex(5), botClaim: {}, typers: {}, lots: new Map(), intruderN: 0
  };
  try {
    const saved = JSON.parse(localStorage.getItem('vmesh.me') || 'null');
    if (saved) { S.name = saved.name || ''; S.color = COLORS.includes(saved.color) ? saved.color : S.color; }
  } catch (e) { /* storage blocked */ }

  const later = (ms, f) => { const t = setTimeout(f, ms); S.timers.push(t); return t; };
  const every = (ms, f) => { const t = setInterval(f, ms); S.timers.push(t); return t; };
  const myId = () => (S.node ? S.node.id : S.myId);
  const inCell = () => !!S.node && (S.role === 'host' || S.node.state === 'in');
  const roster = () => (!S.node ? [] : S.role === 'host' ? S.node.roster() : S.node.roster || []);
  const chNum = () => String((parseInt(C.sha256Hex((S.cell || 'v').toLowerCase()).slice(0, 4), 16) % 99) + 1).padStart(2, '0');
  const linkLabel = (k) => ({ sim: 'simulated radio', tabs: 'local tab', rtc: 'Wi-Fi peer link' }[k] || k);
  const sasHtml = (sas) => (sas || []).map((x) => `<span><em>${x.e}</em><b>${x.w}</b></span>`).join('');
  const level = (ms) => (ms == null ? 0 : ms < 40 ? 4 : ms < 90 ? 3 : ms < 200 ? 2 : 1);

  /* ───────── Screens ───────── */
  const enter = {};
  function go(name) {
    if (name === S.screen) return;
    help.hideTip();
    const from = $('#scr-' + S.screen), to = $('#scr-' + name);
    from.classList.remove('active');
    $$('.rv', to).forEach((el, i) => el.style.setProperty('--i', Math.min(i, 12)));
    if (name !== 'chat') to.scrollTop = 0;
    to.classList.add('active');
    S.screen = name;
    const idx = SCREENS.indexOf(name);
    $$('#steps i').forEach((d, i) => { d.classList.toggle('done', i < idx); d.classList.toggle('on', i === idx); });
    if (enter[name]) enter[name]();
  }
  function stagger(root) { $$('.rv', root).forEach((el, i) => el.style.setProperty('--i', Math.min(i, 12))); }

  /* ───────── Toasts & sheet ───────── */
  function toast(html, kind, ms) {
    const box = $('#toasts');
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.innerHTML = html;
    box.appendChild(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms || 3200);
  }
  const sheet = {
    onClose: null, tag: null,
    open(html, mount, onClose, tag) {
      this.close(true);
      $('#sheetBody').innerHTML = html;
      this.onClose = onClose || null;
      this.tag = tag || null;
      const w = $('#sheetWrap');
      w.classList.add('open'); w.setAttribute('aria-hidden', 'false');
      $('#sheet').scrollTop = 0;
      $('#sheet').style.transform = '';
      if (mount) mount($('#sheetBody'));
    },
    close() {
      const f = this.onClose;
      this.onClose = null; this.tag = null;
      if (f) { try { f(); } catch (e) { /* ignore */ } }
      const w = $('#sheetWrap');
      w.classList.remove('open'); w.setAttribute('aria-hidden', 'true');
    }
  };
  $('#sheetScrim').onclick = () => sheet.close();
  $('#sheetX').onclick = () => sheet.close();
  (() => { // drag the sheet down to dismiss
    const sh = $('#sheet');
    let y0 = null, dy = 0;
    sh.addEventListener('touchstart', (e) => { if (sh.scrollTop > 0) return; y0 = e.touches[0].clientY; dy = 0; sh.style.transition = 'none'; }, { passive: true });
    sh.addEventListener('touchmove', (e) => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); sh.style.transform = `translateY(${dy}px)`; }, { passive: true });
    sh.addEventListener('touchend', () => {
      if (y0 == null) return;
      sh.style.transition = ''; sh.style.transform = '';
      if (dy > 110) sheet.close();
      y0 = null;
    });
  })();

  /* ───────── Intro ───────── */
  $('#btnStart').onclick = () => {
    fx.sound.unlock(); fx.sound.roger(); fx.embers.gust(6);
    $('#heroMark').classList.add('cut');
    setTimeout(() => { $('#heroMark').classList.remove('cut'); go('name'); }, 420);
  };
  $('#btnWalk').onclick = () => { fx.sound.unlock(); help.tour.start(TOURS.intro()); };
  $('#btnHow').onclick = openHow;
  $('#brand').onclick = () => {
    if (S.node) { toast('You are inside a cell. Leave it from <b>Members</b> first.'); return; }
    go('intro');
  };
  $$('#steps i').forEach((d, i) => {
    d.onclick = () => {
      if (S.node || i >= SCREENS.indexOf(S.screen)) return;
      if (i >= 2 && !S.name) return;
      go(SCREENS[i]);
    };
  });

  /* ───────── Identity ───────── */
  function updateAvatar(pop) {
    const a = $('#avatarPreview');
    a.style.setProperty('--c', S.color);
    a.firstElementChild.textContent = S.name ? ini(S.name) : '?';
    if (pop) { a.classList.remove('pop'); void a.offsetWidth; a.classList.add('pop'); }
    $('#btnName').disabled = !S.name;
    $$('#nameIdeas .chip').forEach((c) => c.classList.toggle('on', c.textContent === S.name));
  }
  function setName(v, pop) { S.name = v.trim().slice(0, 18); $('#inName').value = S.name; updateAvatar(pop); }
  $('#nameIdeas').innerHTML = NAME_IDEAS.map((n) => `<button class="chip" type="button">${esc(n)}</button>`).join('');
  $('#nameIdeas').onclick = (e) => { const c = e.target.closest('.chip'); if (c) { setName(c.textContent, true); fx.sound.click(); } };
  $('#swatches').innerHTML = COLORS.map((c) => `<button class="sw" type="button" style="--c:${c}" data-c="${c}" aria-label="Colour ${c}"></button>`).join('');
  $('#swatches').onclick = (e) => {
    const b = e.target.closest('.sw');
    if (!b) return;
    S.color = b.dataset.c;
    $$('#swatches .sw').forEach((x) => x.classList.toggle('on', x === b));
    updateAvatar(true); fx.sound.click();
  };
  $('#inName').oninput = (e) => { S.name = e.target.value.trim().slice(0, 18); updateAvatar(false); };
  $('#inName').onkeydown = (e) => { if (e.key === 'Enter' && S.name) $('#btnName').click(); };
  $('#btnDice').onclick = () => { setName(pick(ADJ) + ' ' + pick(NOUN), true); fx.sound.click(); };
  $('#btnName').onclick = () => {
    if (!S.name) { $('#fieldName').classList.add('shake'); setTimeout(() => $('#fieldName').classList.remove('shake'), 500); return; }
    try { localStorage.setItem('vmesh.me', JSON.stringify({ name: S.name, color: S.color })); } catch (e) { /* ignore */ }
    fx.sound.click();
    go('link');
  };
  enter.name = () => {
    $('#inName').value = S.name;
    $$('#swatches .sw').forEach((x) => x.classList.toggle('on', x.dataset.c === S.color));
    updateAvatar(false);
  };

  /* ───────── Link method ───────── */
  const IC = {
    rtc: '<svg viewBox="0 0 24 24"><path d="M2 8.5a15 15 0 0 1 20 0"/><path d="M5.5 12a10 10 0 0 1 13 0"/><path d="M9 15.5a5 5 0 0 1 6 0"/><circle cx="12" cy="19" r="1.3"/></svg>',
    tabs: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="13" height="10" rx="2"/><rect x="8" y="9" width="13" height="10" rx="2"/></svg>',
    sim: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.5"/><circle cx="4.5" cy="6" r="1.8"/><circle cx="19.5" cy="6" r="1.8"/><circle cx="12" cy="20.5" r="1.8"/><path d="M6 7l4.2 3.6M18 7l-4.2 3.6M12 14.5v4.2"/></svg>',
    ble: '<svg viewBox="0 0 24 24"><path d="M7 7l10 10-5 4V3l5 4L7 17"/></svg>'
  };
  const METHODS = [
    { id: 'rtc', title: 'Wi-Fi / Hotspot', badge: ['real', 'Real · cross-phone'],
      desc: 'One phone opens a hotspot (no data plan needed on most Androids), the others join it. Phones shake hands by scanning QR codes once, then talk directly over WebRTC: DTLS-encrypted, no server, no internet.',
      tags: ['WebRTC data channel', 'QR handshake', '~30–50 m'] },
    { id: 'tabs', title: 'Same device · tabs', badge: ['real', 'Real · one device'],
      desc: 'Open V/MESH in two or more tabs or windows of this browser. They find each other over a local BroadcastChannel and run the full protocol, so you can test without a second phone.',
      tags: ['Auto-discovery', 'Host election', 'Intruder drill'] },
    { id: 'sim', title: 'Simulated cell', badge: ['demo', 'Demo'],
      desc: 'Three virtual phones and a would-be intruder run the real protocol in memory, with radio-like latency. Ideal for a solo demo.',
      tags: ['Virtual phones', 'Bot replies', 'Forged-key attacks'] },
    { id: 'ble', title: 'Bluetooth', badge: ['native', 'Native app only'],
      desc: 'A web page can scan for Bluetooth gadgets but cannot make a phone advertise itself, so phone-to-phone chat needs a native app (Apple Multipeer, Google Nearby). Probe what this phone supports.',
      tags: ['Web Bluetooth: central only'] }
  ];
  function renderMethods() {
    $('#methods').innerHTML = METHODS.map((m) => `
      <button class="method rv ${m.id === 'ble' ? 'disabled' : ''} ${S.mode === m.id ? 'on' : ''}" data-mode="${m.id}">
        <div class="m-top"><div class="m-ic">${IC[m.id]}</div><b>${m.title}</b><span class="badge ${m.badge[0]}">${m.badge[1]}</span></div>
        <p>${m.desc}</p>
        <div class="m-foot">${m.tags.map((t) => `<span class="tag">${t}</span>`).join('')}</div>
      </button>`).join('');
    stagger($('#scr-link'));
  }
  $('#methods').onclick = (e) => {
    const card = e.target.closest('.method');
    if (!card) return;
    const mode = card.dataset.mode;
    fx.sound.click();
    if (mode === 'ble') { probeBle(); return; }
    if (mode === 'rtc' && !net.rtc.supported) { toast('WebRTC is not available in this browser', 'bad'); return; }
    if (mode === 'tabs' && !net.Air.supported) { toast('BroadcastChannel is not available in this browser', 'bad'); return; }
    S.mode = mode;
    $$('#methods .method').forEach((x) => x.classList.toggle('on', x === card));
    setTimeout(() => go('role'), 380);
  };
  function caps() {
    const md = navigator.mediaDevices;
    return [
      ['WebRTC', !!window.RTCPeerConnection, 'Peer link|WebRTC|Direct, encrypted phone-to-phone data channels over the local network.'],
      ['Tab radio', typeof BroadcastChannel !== 'undefined', 'Local|BroadcastChannel|Lets tabs on this device talk, used by the same-device mode and the QR hand-off.'],
      ['Secure page', window.isSecureContext, 'Context|Secure context|HTTPS or localhost unlocks the camera scanner, clipboard and offline install. Plain http on a LAN still chats.'],
      ['QR scanner', 'BarcodeDetector' in window && !!(md && md.getUserMedia) && window.isSecureContext, 'Camera|Built-in QR scanner|Without it, point the phone\'s own camera app at the code. It opens V/MESH and hands the code over.'],
      ['Code squeeze', typeof CompressionStream !== 'undefined', 'Size|CompressionStream|Deflates connection codes so QR codes stay small and easy to scan.'],
      ['Web Bluetooth', !!navigator.bluetooth, 'Radio|Web Bluetooth|Chrome on Android/desktop can scan for devices, but never advertise as one.'],
      ['Haptics', !!navigator.vibrate, 'Feel|Vibration|Buzzes on knocks, alarms and incoming transmissions (Android).'],
      ['Offline install', 'serviceWorker' in navigator && window.isSecureContext, 'Offline|Service worker|Open once with internet, add to home screen, and V/MESH loads in airplane mode.']
    ].map(([n, ok, tip]) => `<span class="cap ${ok ? 'yes' : 'no'}" data-tip="${esc(tip)}"><i>${ok ? '✓' : '✕'}</i>${n}</span>`).join('');
  }
  enter.link = () => { renderMethods(); $('#caps').innerHTML = caps(); };

  async function probeBle() {
    const has = !!navigator.bluetooth;
    let radio = has ? 'unknown' : 'not exposed';
    if (has && navigator.bluetooth.getAvailability) {
      try { radio = (await navigator.bluetooth.getAvailability()) ? 'available' : 'off or missing'; } catch (e) { /* blocked */ }
    }
    sheet.open(`
      <h3>Bluetooth probe</h3>
      <p>What this browser lets a web page do with Bluetooth, and why chat still needs a native app.</p>
      <div class="cred">
        <div class="cred-row"><span>Web Bluetooth</span><b>${has ? 'Supported' : 'Not supported'}</b></div>
        <div class="cred-row"><span>Radio</span><b>${radio}</b></div>
        <div class="cred-row"><span>Scan nearby</span><b>${has ? 'Yes, with a picker' : 'No'}</b></div>
        <div class="cred-row"><span>Advertise / accept</span><b style="color:var(--red-2)">No (web)</b></div>
      </div>
      <h4>Why this matters</h4>
      <p class="hint" style="font-size:14px">Bluetooth chat needs one phone to <b>advertise</b> (be a peripheral) and another to connect. Browsers only implement the connecting side, and Safari on iPhone has no Web Bluetooth at all. Apple's Multipeer Connectivity and Google's Nearby Connections do both, and blend Bluetooth with Wi-Fi automatically, but only inside native apps.</p>
      ${has ? '<button class="cta wide" data-act="bleScan" style="margin-top:12px">Scan nearby devices</button>' : ''}
      <button class="ghost wide" data-act="pickRtc" style="margin-top:10px">Use Wi-Fi / hotspot instead</button>`, null, null, 'ble');
  }

  /* ───────── Role ───────── */
  function genPass() { return [pick(C.WORDS), pick(C.WORDS), pick(C.WORDS)].join('-').toLowerCase() + '-' + (10 + C.randInt(90)); }
  function updateMeter() {
    const v = $('#inPass').value;
    const bits = C.passStrength(v);
    const pct = Math.min(100, (bits / 72) * 100);
    const [label, col] = !v ? ['', 'var(--red)'] : bits < 28 ? ['Weak', 'var(--red-2)'] : bits < 50 ? ['Fair', 'var(--warn)'] : ['Strong', 'var(--ok)'];
    const m = $('#passMeter');
    m.style.setProperty('--w', pct + '%'); m.style.setProperty('--mc', col);
    m.querySelector('span').textContent = v ? `${label} · ~${bits} bits` : '';
  }
  function resetRole() {
    $$('.role-tile').forEach((t) => t.classList.remove('on', 'suggest'));
    $('#hostPanel').hidden = true; $('#lotsPanel').hidden = true;
  }
  $('#roles').onclick = (e) => {
    const t = e.target.closest('.role-tile');
    if (!t) return;
    fx.sound.click();
    $$('.role-tile').forEach((x) => x.classList.toggle('on', x === t));
    const r = t.dataset.role;
    $('#hostPanel').hidden = r !== 'host';
    $('#lotsPanel').hidden = r !== 'lots';
    if (r === 'host') {
      if (!$('#inCell').value) $('#inCell').value = pick(CELL_IDEAS);
      if (!$('#inPass').value) $('#inPass').value = genPass();
      $('#inAuto').checked = S.autoAdmit;
      updateMeter();
      setTimeout(() => $('#hostPanel').scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    } else if (r === 'guest') {
      startGuest();
    } else if (r === 'lots') {
      openLots();
      setTimeout(() => $('#lotsPanel').scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    }
  };
  $('#inPass').oninput = updateMeter;
  $('#btnGenPass').onclick = () => { $('#inPass').value = genPass(); updateMeter(); fx.sound.click(); };
  $('#inAuto').onchange = (e) => { S.autoAdmit = e.target.checked; };
  $('#btnOpenCell').onclick = () => {
    const cell = $('#inCell').value.trim(), pass = $('#inPass').value;
    if (cell.length < 2) { shakeField($('#inCell').closest('.field')); return; }
    if (pass.length < 4) { shakeField($('#fieldPass')); toast('Use a passphrase of at least 4 characters', 'bad'); return; }
    S.cell = cell; S.pass = pass; S.autoAdmit = $('#inAuto').checked;
    fx.sound.roger();
    startHost();
  };
  function shakeField(f) { if (!f) return; f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); fx.haptic(40); }
  enter.role = () => { stagger($('#scr-role')); };

  /* Draw lots */
  let lotsOff = null;
  function openLots() {
    S.lots = new Map();
    $('#lotNum').textContent = '?';
    $('#lotsList').innerHTML = '';
    $('#btnDraw').disabled = false;
    $('#lotsHint').innerHTML = S.mode === 'tabs'
      ? 'Every open V/MESH tab on this device that presses <b>Draw</b> joins the election automatically.'
      : S.mode === 'sim'
        ? 'The virtual phones will draw too.'
        : 'Everyone draws on their own phone, then reads the number out loud. Highest number hosts; ties draw again.';
    if (S.mode === 'tabs' && !lotsOff) {
      net.Air.init(S.myId);
      lotsOff = net.Air.listen((p, from) => {
        if (p && p.t === 'lot' && S.screen === 'role') { S.lots.set(from, { name: p.name, n: p.n }); renderLots(); }
      });
    }
  }
  function renderLots(final) {
    const arr = [...S.lots.entries()].map(([id, v]) => Object.assign({ id }, v)).sort((a, b) => b.n - a.n);
    $('#lotsList').innerHTML = arr.map((l, i) => `<div class="lot ${final && i === 0 ? 'win' : ''}"><span>${esc(l.name)}${l.id === S.myId ? ' (you)' : ''}</span><b>${l.n}</b></div>`).join('');
    return arr;
  }
  $('#btnDraw').onclick = () => {
    const n = 10 + C.randInt(90);
    const d = $('#dominoBig');
    d.classList.remove('roll'); void d.offsetWidth; d.classList.add('roll');
    $('#btnDraw').disabled = true;
    let spin = 0;
    const iv = setInterval(() => { $('#lotNum').textContent = 10 + C.randInt(90); fx.sound.tick(); if (++spin > 12) clearInterval(iv); }, 80);
    setTimeout(() => {
      clearInterval(iv);
      $('#lotNum').textContent = n;
      fx.sound.knock();
      S.lots.set(S.myId, { name: S.name, n });
      renderLots();
      if (S.mode === 'tabs') net.Air.broadcast({ t: 'lot', name: S.name, n });
      if (S.mode === 'sim') {
        BOT_NAMES.filter((b) => b !== S.name).slice(0, 3).forEach((b, i) => setTimeout(() => {
          S.lots.set('bot' + i, { name: b, n: 10 + C.randInt(90) }); renderLots(); fx.sound.tick();
        }, 450 + i * 380));
      }
      if (S.mode === 'tabs' || S.mode === 'sim') {
        setTimeout(() => {
          const arr = renderLots(true);
          const meWin = arr[0] && arr[0].id === S.myId;
          $('#lotsHint').innerHTML = meWin ? '<b>You drew highest. You hold the key.</b>' : `<b>${esc(arr[0].name)}</b> drew highest and hosts. You join.`;
          (meWin ? $('#tileHost') : $('#tileGuest')).classList.add('suggest');
          fx.sound.chime();
          $('#btnDraw').disabled = false;
          $('#btnDraw span').textContent = 'Draw again';
        }, 3200);
      } else {
        $('#lotsHint').innerHTML = `You drew <b>${n}</b>. Read it out loud. If it's the highest, tap <b>Host a cell</b>; otherwise <b>Join a cell</b>.`;
        $('#btnDraw').disabled = false;
      }
    }, 1200);
  };

  /* ───────── Teardown ───────── */
  function teardown() {
    S.timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
    S.timers = [];
    S.cleanups.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
    S.cleanups = [];
    S.bots.forEach((b) => { try { if (b.destroy) b.destroy(); else b.leave(); } catch (e) { /* ignore */ } });
    S.bots = [];
    if (S.pendingOffer) { S.pendingOffer.close(); S.pendingOffer = null; }
    S.answers.forEach((a) => { try { a.close(); } catch (e) { /* ignore */ } });
    S.answers = [];
    if (S.node) {
      try { if (S.node.destroy) S.node.destroy(); else S.node.leave(); } catch (e) { /* ignore */ }
    }
    net.Air.onIncoming = null;
    S.node = null; S.role = null; S.logs = []; S.cells = new Map(); S.chosenCell = null; S.unread = 0; S.typers = {};
    $('#knockDock').innerHTML = '';
    $('#chatLog').innerHTML = '';
    $('#radarBlips').innerHTML = '';
    msgEls.clear();
    sheet.close();
  }
  function leaveCell() {
    fx.sound.deny();
    teardown();
    resetRole();
    go('role');
  }

  /* ───────── Host ───────── */
  function startHost() {
    teardown();
    S.role = 'host';
    const h = new net.HostNode({ id: S.myId, name: S.name, color: S.color, cell: S.cell, pass: S.pass, autoAdmit: S.autoAdmit });
    S.node = h;
    h.on('knock', () => { fx.sound.knock(); renderRadar(); })
      .on('pending', (s) => { addKnock(s); renderRadar(); fx.haptic([30, 40, 30]); })
      .on('joined', (s) => {
        removeKnock(s.id); renderRadar(); refreshLobby(); fx.sound.chime();
        toast(`<b>${esc(s.name)}</b> is inside the cell`, 'good');
        const b = $(`.blip[data-id="${cssId(s.id)}"]`);
        if (b && S.screen === 'lobby') fx.fireworks.burstAt(b, 50);
      })
      .on('change', () => { syncKnocks(); renderRadar(); refreshLobby(); })
      .on('intruder', (e) => {
        fx.alarm();
        toast(`⚠ <b>Intruder blocked:</b> ${esc(e.name)} ${esc(e.why)}`, 'bad', 4800);
        syncKnocks(); renderRadar(); flashIntruder(e.name);
      })
      .on('blocked', (s) => toast(`⛔ ${esc(s.name)} knocked on a locked door`, 'bad'))
      .on('log', (e) => { S.logs.unshift(e); S.logs = S.logs.slice(0, 60); renderLog(); })
      .on('roster', () => { renderRadar(); refreshLobby(); renderChatHead(); renderMembersSheet(); })
      .on('message', (m) => onMessage(m))
      .on('typing', onTyping)
      .on('rtt', (id, ms) => updateBars(id, ms))
      .on('lock', (v, by) => {
        if (by === 'auto') { fx.alarm(); toast('🔒 <b>Auto-lockdown.</b> Too many bad keys. The door is sealed.', 'bad', 5200); }
        else toast(v ? '🔒 Cell locked' : '🔓 Cell unlocked');
        refreshLobby(); renderMembersSheet(); renderChatHead();
      });

    if (S.mode === 'tabs') {
      net.Air.init(S.myId);
      net.Air.onIncoming = (l) => h.attach(l);
      const beacon = () => net.Air.broadcast({ t: 'beacon', cell: S.cell, hostName: S.name, color: S.color, n: h.members.length + 1, locked: h.locked });
      beacon(); every(1200, beacon);
    }
    if (S.mode === 'sim') simHostWorld(h);
    go('lobby');
    renderHostLobby();
    h._log('ok', `Cell "${S.cell}" opened on ${MODES[S.mode].label}`);
  }

  function simHostWorld(h) {
    const names = BOT_NAMES.filter((n) => n !== S.name);
    const spawn = (i, delay) => later(delay, () => {
      if (S.node !== h) return;
      const g = new net.GuestNode({ id: 'bot' + i + C.randHex(2), name: names[i], color: BOT_COLORS[i], pass: S.pass });
      const [a, b] = net.memPair();
      h.attach(b); g.join(a);
      S.bots.push(g);
      botBrain(g);
      g.on('admitted', () => later(1400 + Math.random() * 1600, () => g.state === 'in' && g.send(pick(BOT_HELLOS))));
    });
    spawn(0, 1600); spawn(1, 4200); spawn(2, 14000);
  }
  function botBrain(node) {
    node.on('message', (m) => {
      if (!m || m.sys || m.from !== myId()) return;
      const claims = S.botClaim[m.id] || 0;
      if (claims >= 2 || (claims === 1 && Math.random() > .3)) return;
      S.botClaim[m.id] = claims + 1;
      const d = 900 + Math.random() * 2200;
      later(d - 700, () => node.typing());
      later(d + 600, () => node.send(pick(BOT_LINES)));
    });
  }
  function releaseIntruder() {
    const h = S.node;
    if (!h || S.role !== 'host') return;
    S.intruderN++;
    const [a, b] = net.memPair();
    h.attach(b);
    if (S.intruderN % 2) {
      const g = new net.GuestNode({ id: 'x' + C.randHex(3), name: 'Fingerman', color: '#555555', pass: 'guess-' + C.randHex(2) });
      g.join(a);
      toast('🕵️ <b>Fingerman</b> is trying a guessed passphrase…');
    } else {
      a.onmessage = (m) => { if (m.t === 'challenge') a.send({ t: 'proof', proof: C.randHex(32) }); };
      a.send({ t: 'knock', id: 'x' + C.randHex(3), name: 'Replay Bot', color: '#555555', n: C.randHex(16) });
      toast('🕵️ <b>Replay Bot</b> is presenting a forged key…');
    }
  }
  function flashIntruder(name) {
    const box = $('#radarBlips');
    const b = document.createElement('div');
    b.className = 'blip bad';
    b.style.setProperty('--x', (20 + Math.random() * 60) + '%');
    b.style.setProperty('--y', (12 + Math.random() * 12) + '%');
    b.style.setProperty('--c', '#ff2d48');
    b.innerHTML = '<i>✕</i><em></em>';
    b.lastChild.textContent = name + ' · blocked';
    box.appendChild(b);
    setTimeout(() => { b.style.transition = 'opacity .6s'; b.style.opacity = '0'; setTimeout(() => b.remove(), 700); }, 2600);
  }

  function addKnock(s) {
    if ($(`.knock[data-id="${cssId(s.id)}"]`)) return;
    const el = document.createElement('div');
    el.className = 'knock';
    el.dataset.id = s.id;
    el.innerHTML = `
      <div class="k-top"><div class="av"></div><div><b></b><span>Passphrase proven · via ${linkLabel(s.link.kind)}</span></div></div>
      <p class="hint" style="margin:10px 0 0">Ask them to read their safety words. They must match:</p>
      <div class="sas sm">${sasHtml(s.sas)}</div>
      <div class="k-acts"><button class="ghost" data-k="deny">Deny</button><button class="cta" data-k="admit">Open the door</button></div>`;
    const av = el.querySelector('.av');
    av.style.setProperty('--c', s.color); av.textContent = ini(s.name);
    el.querySelector('b').textContent = s.name + ' is at the door';
    el.onclick = (e) => {
      const a = e.target.closest('[data-k]');
      if (!a || !S.node) return;
      if (a.dataset.k === 'admit') S.node.admit(s.id); else { S.node.deny(s.id); fx.sound.deny(); }
      removeKnock(s.id);
    };
    $('#knockDock').appendChild(el);
  }
  function removeKnock(id) {
    const el = $(`.knock[data-id="${cssId(id)}"]`);
    if (!el) return;
    el.classList.add('out');
    setTimeout(() => el.remove(), 450);
  }
  function syncKnocks() {
    const ids = new Set(S.node && S.role === 'host' ? S.node.pending.map((s) => s.id) : []);
    $$('.knock').forEach((el) => { if (!ids.has(el.dataset.id)) removeKnock(el.dataset.id); });
  }

  function renderHostLobby() {
    $('#lobbyKicker').textContent = `Step 4 · Host · ${MODES[S.mode].label}`;
    $('#lobbyTitle').innerHTML = `<em>${esc(S.cell)}</em> is open.`;
    $('#lobbySub').textContent = {
      sim: 'Virtual phones are on their way to your door. Approve them, then try the intruder drill.',
      tabs: 'Your cell is beaconing to other V/MESH tabs on this device.',
      rtc: 'Make sure every phone is on your hotspot (or the same Wi-Fi), then add them one by one.'
    }[S.mode];
    $('#lobbyBody').innerHTML = `
      <div class="card rv" id="credCard"><span class="card-k">Your cell</span>
        <div class="cred">
          <div class="cred-row"><span>Cell</span><b>${esc(S.cell)}</b></div>
          <div class="cred-row"><span>Passphrase</span><b class="blur" data-act="reveal" id="passReveal">${esc(S.pass)}</b></div>
          <div class="cred-row"><span>Channel</span><b>CH ${chNum()} · ${MODES[S.mode].kind}</b></div>
        </div>
        <p class="hint">Say the passphrase out loud to the people next to you. It never travels over the air; phones only exchange proofs of it.</p>
      </div>
      ${S.mode === 'rtc' ? `<div class="card rv" id="addCard"><span class="card-k">Bring phones in</span><h3>Add a phone</h3>
        <p>Scan a guest's knock code, then show them your reply. One pair of codes per phone.</p>
        <button class="cta wide" data-act="addPhone" id="btnAddPhone" style="margin-top:14px"><span>Add a phone</span></button></div>` : ''}
      ${S.mode === 'tabs' ? `<div class="card rv" id="addCard"><span class="card-k">Bring tabs in</span><h3>Open another tab</h3>
        <p>In a new tab or window, choose <b>Same device · tabs</b> then <b>Join a cell</b>. Your cell appears on its radar.</p>
        <button class="ghost wide sm" data-act="newTab" style="margin-top:14px">Open V/MESH in a new tab</button></div>` : ''}
      <div class="card rv" id="membersCard"><span class="card-k">In the cell</span><div class="members" id="lobbyMembers"></div></div>
      <div class="card rv" id="defCard"><span class="card-k">Door defences</span>
        <div class="defences" id="defList"></div>
        <label class="toggle" id="lockToggle" style="margin-top:10px"><input type="checkbox" id="inLock"><i></i>
          <div><b>Lock the cell</b><span>Refuse every new knock, even with the right passphrase.</span></div></label>
        <button class="ghost wide sm" data-act="drill" id="btnDrill">Run an intruder drill</button>
      </div>
      <div class="card rv"><span class="card-k">Security log</span><div class="seclog" id="secLog"></div></div>
      <div class="cta-row stack rv">
        <button class="cta wide" data-act="toTest" id="btnLobbyTest"><span>Run signal test</span></button>
        <button class="ghost wide" data-act="toChat" id="btnLobbyChat">Open the channel →</button>
        <button class="link-btn" data-act="leave">Close the cell</button>
      </div>`;
    stagger($('#scr-lobby'));
    $$('#scr-lobby .rv').forEach((el) => { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; });
    refreshLobby(); renderLog(); renderRadar();
  }

  function memberRow(r, opts) {
    const self = r.id === myId();
    const ms = S.role === 'host' ? S.node.rtt[r.id] : r.host ? S.node.rtt : null;
    const sub = r.host ? 'host · relay' : self ? 'you' : (r.kind ? linkLabel(r.kind) : 'guest');
    return `<div class="member" data-id="${esc(r.id)}">
      <div class="av" style="--c:${esc(r.color)}">${esc(ini(r.name))}</div>
      <div class="m-name"><b>${esc(r.name)}${self ? ' (you)' : ''}</b><span>${sub}${ms != null && !self ? ` · ${Math.round(ms)} ms` : ''}</span></div>
      ${self ? '' : `<div class="bars" data-id="${esc(r.id)}" data-l="${level(ms)}"><i></i><i></i><i></i><i></i></div>`}
      ${opts && opts.kick && !self && !r.host ? `<button class="x-btn" data-act="kick" data-id="${esc(r.id)}">Remove</button>` : ''}
    </div>`;
  }
  function defences() {
    const h = S.node;
    const items = [
      [true, 'Passphrase proof', 'never sent over the air. Both sides prove it with an HMAC challenge.'],
      [!S.autoAdmit, 'Host approval', S.autoAdmit ? 'off: correct passphrase is enough.' : 'every phone waits at the door until you open it.'],
      [true, 'Safety words', 'four words both phones compute. If they match in person, no one is in the middle.'],
      [true, 'Auto-lockdown', '3 bad keys within a minute seals the door.'],
      [S.mode === 'rtc', 'Encrypted link', S.mode === 'rtc' ? 'WebRTC DTLS, keys pinned by the QR exchange.' : S.mode === 'tabs' ? 'stays inside this browser.' : 'simulated.'],
      [h && h.locked, 'Locked', h && h.locked ? 'no new phones, whatever they know.' : 'off. New phones may knock.']
    ];
    return items.map(([on, b, t]) => `<div class="def ${on ? '' : 'off'}"><i>${on ? '✓' : '–'}</i><div><b>${b}</b>: ${t}</div></div>`).join('');
  }
  function refreshLobby() {
    const list = $('#lobbyMembers');
    if (list && S.node) {
      const r = roster();
      list.innerHTML = r.map((x) => memberRow(x, { kick: S.role === 'host' })).join('') +
        (S.role === 'host' && r.length < 2 ? '<div class="empty">Nobody inside yet. Knocks will appear at the top of the screen.</div>' : '');
    }
    if ($('#defList')) $('#defList').innerHTML = defences();
    if ($('#inLock') && S.node && S.role === 'host') $('#inLock').checked = S.node.locked;
    const peers = roster().length > 1;
    $$('[data-act="toTest"], [data-act="toChat"]').forEach((b) => b.toggleAttribute('disabled', !peers));
  }
  function renderLog() {
    const html = S.logs.slice(0, 40).map((e) => `<div class="log lv-${e.level}"><time>${time(e.ts)}</time><span>${esc(e.text)}</span></div>`).join('');
    ['#secLog', '#secLogSheet'].forEach((s) => { const el = $(s); if (el) el.innerHTML = html; });
  }
  function updateBars(id, ms) {
    $$(`.bars[data-id="${cssId(id)}"]`).forEach((b) => { b.dataset.l = level(ms); });
    $$(`.member[data-id="${cssId(id)}"] .m-name span`).forEach((s) => { s.textContent = s.textContent.replace(/ · \d+ ms$/, '') + ` · ${Math.round(ms)} ms`; });
    if (S.screen === 'lobby') renderRadar();
  }

  /* ───────── Guest ───────── */
  function startGuest() {
    teardown();
    S.role = 'guest';
    S.guestPhase = 'pick';
    go('lobby');
    renderGuestLobby();
    if (S.mode === 'tabs') {
      net.Air.init(S.myId);
      S.cleanups.push(net.Air.listen((p, from) => {
        if (!p || p.t !== 'beacon') return;
        const fresh = !S.cells.has(from);
        S.cells.set(from, Object.assign({}, p, { seen: Date.now() }));
        if (S.guestPhase === 'pick') { if (fresh) fx.sound.tick(); renderCells(); renderRadar(); }
      }));
      every(1500, () => {
        let changed = false;
        S.cells.forEach((c, k) => { if (Date.now() - c.seen > 4500) { S.cells.delete(k); changed = true; if (S.chosenCell === k) S.chosenCell = null; } });
        if (changed && S.guestPhase === 'pick') { renderCells(); renderRadar(); }
      });
    }
    if (S.mode === 'sim') {
      later(1300, () => {
        S.cells.set('sim', { cell: SIM.cell, hostName: 'V', color: '#e8173a', n: 3, locked: false, seen: Date.now() });
        fx.sound.tick();
        if (S.guestPhase === 'pick') { renderCells(); renderRadar(); }
      });
    }
  }
  function simGuestWorld() {
    const hb = new net.HostNode({ id: 'v-host', name: 'V', color: '#e8173a', cell: SIM.cell, pass: SIM.pass });
    S.bots.push(hb);
    const botIds = new Set();
    hb.on('pending', (s) => { if (botIds.has(s.id)) hb.admit(s.id); else later(2800, () => hb.admit(s.id)); });
    BOT_NAMES.filter((n) => n !== S.name).slice(0, 2).forEach((n, i) => {
      const id = 'bot' + i;
      botIds.add(id);
      const g = new net.GuestNode({ id, name: n, color: BOT_COLORS[i], pass: SIM.pass });
      const [a, b] = net.memPair(() => 1);
      hb.attach(b); g.join(a);
      S.bots.push(g);
      botBrain(g);
    });
    botBrain(hb);
    later(60, () => hb.send('Lantern lit. The gallery is open.'));
    return hb;
  }

  function renderGuestLobby() {
    const ph = S.guestPhase, d = S.phaseData || {};
    $('#lobbyKicker').textContent = `Step 4 · Guest · ${MODES[S.mode].label}`;
    let title = '', sub = '', body = '';
    if (ph === 'pick') {
      title = S.mode === 'rtc' ? 'Knock with a <em>code</em>.' : 'Find a <em>cell</em>.';
      sub = S.mode === 'rtc'
        ? 'Join the host\'s hotspot first. Then create a knock code for the host to scan.'
        : S.mode === 'tabs' ? 'Listening for cells beaconing from other tabs on this device…' : 'Sweeping for nearby cells…';
      body = `
        ${S.mode !== 'rtc' ? '<div class="card rv"><span class="card-k">Cells in range</span><div class="cells" id="cellList"></div></div>' : ''}
        <div class="card rv" id="passCard"><span class="card-k">Prove you belong</span>
          <label class="field" id="fieldGuestPass"><input id="inGuestPass" type="password" maxlength="48" placeholder=" " autocomplete="off" autocapitalize="off" spellcheck="false">
            <span>Passphrase the host told you</span>
            <button class="field-act" type="button" data-act="peek" aria-label="Show passphrase"><svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" style="fill:none;stroke:currentColor"/></svg></button>
          </label>
          ${S.mode === 'sim' ? `<p class="hint">Simulation: the host "V" uses <b class="mono">${SIM.pass}</b>. Try a wrong one first to watch the door slam.</p>` : ''}
          ${S.mode === 'rtc'
            ? '<button class="cta wide" data-act="makeKnock" id="btnMakeKnock"><span>Create knock code</span></button><div id="rtcArea"></div>'
            : `<button class="cta wide" data-act="knock" id="btnKnock" ${S.chosenCell ? '' : 'disabled'}><span>Knock</span></button>`}
        </div>
        <div class="cta-row stack rv"><button class="link-btn" data-act="back">← Choose another role</button></div>`;
    } else if (ph === 'wait') {
      title = 'At the <em>door</em>.';
      sub = 'Hold steady. The host decides who comes in.';
      body = `<div class="card waitbox rv"><div id="domWrap"></div><h3 id="waitMsg">${esc(d.msg || 'Knocking…')}</h3>
        <p>Your passphrase never leaves this phone. Only a one-time proof does.</p>
        <div id="waitSas">${d.sas ? `<p class="hint">Read these to the host. Theirs must match:</p><div class="sas">${sasHtml(d.sas)}</div>` : ''}</div>
        <button class="link-btn" data-act="cancelKnock" style="margin-top:14px">Walk away</button></div>`;
    } else if (ph === 'denied') {
      const why = {
        mismatch: 'Your passphrase does not match this cell\'s key, or this is not the cell you think it is. Nothing about your passphrase was revealed.',
        key: 'The host rejected your proof of the passphrase.',
        host: 'The host chose not to open the door.',
        locked: 'The cell is locked. No new phones are being admitted.'
      }[d.why] || 'The host refused the connection.';
      title = 'The door stays <em>shut</em>.';
      sub = '';
      body = `<div class="card waitbox rv"><div class="stamp">ACCESS DENIED</div><p>${why}</p>
        <button class="cta wide" data-act="retry" style="margin-top:20px"><span>Try again</span></button></div>`;
    } else if (ph === 'in') {
      title = `You're in <em>${esc(S.node.cell)}</em>.`;
      sub = `Hosted by ${esc(S.node.hostName || 'the host')} on ${MODES[S.mode].kind}.`;
      body = `<div class="card waitbox rv"><div class="admit-badge">✓ The door opened</div>
          ${S.node.sasCode ? `<p class="hint">Safety words for this link:</p><div class="sas">${sasHtml(S.node.sasCode)}</div>` : ''}</div>
        <div class="card rv"><span class="card-k">In the cell</span><div class="members" id="lobbyMembers"></div></div>
        <div class="cta-row stack rv">
          <button class="cta wide" data-act="toTest"><span>Run signal test</span></button>
          <button class="ghost wide" data-act="toChat">Open the channel →</button>
          <button class="link-btn" data-act="leave">Leave the cell</button>
        </div>`;
    }
    $('#lobbyTitle').innerHTML = title;
    $('#lobbySub').textContent = sub;
    $('#lobbyBody').innerHTML = body;
    stagger($('#scr-lobby'));
    $$('#lobbyBody .rv').forEach((el) => { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; });
    if (ph === 'wait') $('#domWrap').appendChild(fx.dominoes(22));
    if (ph === 'pick') { renderCells(); if (S.mode === 'sim' || d.pass) { const ip = $('#inGuestPass'); if (ip && d.pass) ip.value = d.pass; } }
    if (ph === 'in') refreshLobby();
    renderRadar();
  }
  function setGuestPhase(ph, data) {
    if (ph === 'wait' && S.guestPhase === 'wait' && S.screen === 'lobby') {
      S.phaseData = Object.assign(S.phaseData || {}, data);
      const m = $('#waitMsg'); if (m) fx.scramble(m, S.phaseData.msg || '', { duration: 500 });
      if (S.phaseData.sas && $('#waitSas') && !$('#waitSas .sas')) $('#waitSas').innerHTML = `<p class="hint">Read these to the host. Theirs must match:</p><div class="sas">${sasHtml(S.phaseData.sas)}</div>`;
      return;
    }
    S.guestPhase = ph;
    S.phaseData = data || {};
    if (S.screen !== 'lobby' && ph !== 'in') go('lobby');
    renderGuestLobby();
  }
  function renderCells() {
    const box = $('#cellList');
    if (!box) return;
    if (!S.cells.size) {
      box.innerHTML = `<div class="empty"><span class="spinner"></span>&nbsp; ${S.mode === 'tabs' ? 'No cells yet. Open another tab and host one.' : 'Scanning…'}</div>`;
      return;
    }
    box.innerHTML = [...S.cells.entries()].map(([k, c]) => `
      <button class="cell-item ${S.chosenCell === k ? 'on' : ''}" data-act="pickCell" data-id="${esc(k)}">
        <div class="c-ic">V</div>
        <div><b>${esc(c.cell)}</b><span>host ${esc(c.hostName)} · ${c.n} inside${c.locked ? ' · 🔒 locked' : ''}</span></div>
      </button>`).join('');
  }
  function chooseCell(id) {
    S.chosenCell = id;
    fx.sound.click();
    renderCells(); renderRadar();
    const k = $('#btnKnock'); if (k) k.disabled = false;
    const ip = $('#inGuestPass'); if (ip) setTimeout(() => ip.focus(), 50);
  }
  function wireGuest(g) {
    g.on('state', (st, sas) => {
      if (st === 'knock') setGuestPhase('wait', { msg: 'Knocking on the door…' });
      if (st === 'proving') setGuestPhase('wait', { msg: 'Proving you know the passphrase…', sas });
      if (st === 'pending') { setGuestPhase('wait', { msg: 'Waiting for the host to open the door', sas }); fx.sound.knock(); }
    })
      .on('admitted', (m) => {
        fx.fireworks.finale(7); fx.sound.chime(); fx.haptic([40, 60, 120]);
        $('#chatLog').innerHTML = ''; msgEls.clear();
        (m.history || []).forEach((x) => onMessage(x, true));
        setGuestPhase('in');
        renderChatHead();
      })
      .on('denied', (why) => {
        fx.sound.deny(); fx.haptic([200, 80, 200]);
        S.node = null;
        setGuestPhase('denied', { why });
        if (why === 'mismatch' || why === 'key') fx.alarm();
      })
      .on('kicked', (why) => {
        toast(why === 'closed' ? 'The host closed the cell' : 'The host removed you from the cell', 'bad', 4800);
        leaveCell();
      })
      .on('lost', () => { toast('Lost the host signal', 'bad', 4800); leaveCell(); })
      .on('message', (m) => onMessage(m))
      .on('ack', onAck)
      .on('typing', onTyping)
      .on('roster', () => { renderRadar(); renderChatHead(); refreshLobby(); renderMembersSheet(); })
      .on('rtt', (id, ms) => { if (id) updateBars(id, ms); });
  }
  function guestKnock() {
    const ip = $('#inGuestPass');
    const pass = ip ? ip.value : '';
    if (!pass) { shakeField($('#fieldGuestPass')); return; }
    if (!S.chosenCell) { toast('Pick a cell on the radar first'); return; }
    fx.sound.roger();
    const g = new net.GuestNode({ id: S.myId, name: S.name, color: S.color, pass });
    S.node = g;
    wireGuest(g);
    if (S.mode === 'tabs') g.join(net.Air.link(S.chosenCell));
    else if (S.mode === 'sim') {
      const hb = simGuestWorld();
      const [a, b] = net.memPair();
      later(120, () => { hb.attach(b); g.join(a); });
      setGuestPhase('wait', { msg: 'Knocking on the door…' });
    }
  }

  /* WebRTC hand-off */
  const codeUrl = (code) => (/^https?:/.test(location.protocol) ? location.origin + location.pathname + '#v=' + code : code);
  function drawQR(canvas, text) {
    try { VM.qr.render(canvas, text); return true; } catch (e) {
      canvas.replaceWith(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'Code too large for a QR. Copy it instead.' }));
      return false;
    }
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); toast('Copied', 'good'); } catch (e) {
      const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Copied', 'good'); } catch (err) { toast('Copy failed: select the text manually', 'bad'); }
      ta.remove();
    }
  }
  async function rtcMakeKnock() {
    const ip = $('#inGuestPass');
    const pass = ip ? ip.value : '';
    if (!pass) { shakeField($('#fieldGuestPass')); return; }
    const area = $('#rtcArea');
    area.innerHTML = '<div class="waitbox"><span class="spinner"></span><p style="margin-top:12px">Gathering local routes…</p></div>';
    $('#btnMakeKnock').disabled = true;
    try {
      if (S.pendingOffer) S.pendingOffer.close();
      const off = await net.rtc.guestOffer();
      S.pendingOffer = off;
      area.innerHTML = `
        <ol class="steps-list" style="margin-top:18px">
          <li><span>The <b>host</b> scans this with <b>Add a phone</b>, or just their camera app.</span></li>
          <li><span>The host shows a reply code. <b>Scan the reply</b> below.</span></li>
          <li><span>Compare safety words; the host opens the door.</span></li>
        </ol>
        <div class="qr-box"><canvas id="qrKnock"></canvas></div>
        <div class="grid2"><button class="cta sm" data-act="scanReply">Scan reply</button><button class="ghost sm" data-act="pasteReply">Paste reply</button></div>
        <button class="link-btn" data-act="copyKnock" style="margin-top:12px">Copy knock code</button>`;
      drawQR($('#qrKnock'), codeUrl(off.code));
      $('#btnMakeKnock').disabled = false;
      $('#btnMakeKnock span').textContent = 'New knock code';
      off.ready.then((link) => {
        if (S.pendingOffer !== off) return;
        S.pendingOffer = null;
        const g = new net.GuestNode({ id: S.myId, name: S.name, color: S.color, pass });
        S.node = g; wireGuest(g); g.join(link);
      });
    } catch (e) {
      area.innerHTML = `<p class="hint">Could not create a code: ${esc(e.message)}</p>`;
      $('#btnMakeKnock').disabled = false;
    }
  }
  async function guestApplyAnswer(code) {
    const off = S.pendingOffer;
    if (!off) return false;
    try {
      await off.accept(code);
      sheet.close();
      fx.sound.roger();
      setGuestPhase('wait', { msg: 'Opening the line…' });
      later(20000, () => {
        if (S.pendingOffer === off) {
          toast('Could not open the line. Are both phones on the same hotspot or Wi-Fi?', 'bad', 6500);
          S.pendingOffer = null; off.close();
          setGuestPhase('pick');
        }
      });
    } catch (e) { toast(esc(e.message), 'bad', 5000); }
    return true;
  }
  function openAddPhone() {
    sheet.open(`
      <h3>Add a phone</h3>
      <p>Over a hotspot, phones introduce themselves with two QR codes. No server is involved.</p>
      <ol class="steps-list">
        <li><span>On the guest phone: <b>Join a cell → Create knock code</b>.</span></li>
        <li><span><b>Scan</b> that knock code here, or point your camera app at it.</span></li>
        <li><span>Show your reply code to the guest. Their knock lands at your door.</span></li>
      </ol>
      <div class="grid2"><button class="cta sm" data-act="scanKnock">Scan knock</button><button class="ghost sm" data-act="pasteKnock">Paste knock</button></div>
      <h4>Hotspot tips</h4>
      <p class="hint" style="font-size:13.5px">Android: Settings → Hotspot works with no SIM data. iPhone Personal Hotspot may require a cellular plan; any travel router without internet works too. Keep phones within ~30 m. If the line won't open, allow the camera once (Chrome then shares real local addresses instead of anonymised ones).</p>`);
  }
  async function hostAcceptOffer(code) {
    if (!S.node || S.role !== 'host') return;
    sheet.open('<h3>Reply to the knock</h3><div class="waitbox"><span class="spinner"></span><p style="margin-top:12px">Crafting a reply…</p></div>');
    try {
      const ans = await net.rtc.hostAnswer(code);
      S.answers.push(ans);
      sheet.open(`<h3>Show this to the guest</h3>
        <p>The guest scans your reply. Their knock will appear at your door in a moment.</p>
        <div class="qr-box"><canvas id="qrReply"></canvas></div>
        <button class="link-btn" data-act="copyReply">Copy reply code</button>`, (b) => {
        drawQR($('#qrReply', b), codeUrl(ans.code));
        b.dataset.code = ans.code;
      }, null, 'reply');
      ans.ready.then((link) => {
        if (!S.node || S.role !== 'host') { link.close(); return; }
        S.node.attach(link);
        if (sheet.tag === 'reply') sheet.close();
        toast('Line open. The guest is knocking…', 'good');
      });
    } catch (e) {
      sheet.open(`<h3>That code didn't work</h3><p>${esc(e.message)}</p><button class="cta wide" data-act="addPhone">Try again</button>`);
    }
  }
  function canScan() { return 'BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext; }
  function openScanner(title, onCode) {
    if (!canScan()) {
      openPaste(title, onCode, 'This browser has no built-in QR scanner here. Point the phone\'s own camera app at the code (it opens V/MESH and hands the code to this tab), or paste the code below.');
      return;
    }
    let stream = null, stop = false;
    const cleanup = () => { stop = true; if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; };
    sheet.open(`<h3>${esc(title)}</h3><p>Point at the other phone's code.</p>
      <div class="scanner"><video playsinline muted autoplay></video><i></i></div>
      <button class="ghost wide sm" data-act="scanToPaste">Paste a code instead</button>`, async (b) => {
      b._onPaste = () => { cleanup(); openPaste(title, onCode); };
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stop) { cleanup(); return; }
        const v = $('video', b);
        v.srcObject = stream;
        await v.play();
        const det = new window.BarcodeDetector({ formats: ['qr_code'] });
        const loop = async () => {
          if (stop) return;
          try {
            const r = await det.detect(v);
            const code = r[0] && net.rtc.extractCode(r[0].rawValue);
            if (code) { fx.sound.roger(); fx.haptic(30); cleanup(); sheet.close(); onCode(code); return; }
          } catch (e) { /* frame not ready */ }
          setTimeout(loop, 200);
        };
        loop();
      } catch (e) {
        const sc = $('.scanner', b);
        if (sc) sc.outerHTML = `<p class="hint">Camera unavailable: ${esc(e.message)}</p>`;
      }
    }, cleanup);
  }
  function openPaste(title, onCode, note) {
    sheet.open(`<h3>${esc(title)}</h3>${note ? `<p>${esc(note)}</p>` : '<p>Paste the code or link from the other phone.</p>'}
      <textarea class="code" id="pasteCode" placeholder="o.z… or https://…#v=…"></textarea>
      <button class="cta wide" data-act="applyPaste" style="margin-top:12px"><span>Use this code</span></button>`, (b) => {
      b._onApply = () => {
        const code = net.rtc.extractCode($('#pasteCode', b).value);
        if (!code) { toast('That doesn\'t look like a V/MESH code', 'bad'); return; }
        sheet.close(); onCode(code);
      };
    });
  }
  net.Signal.init();
  net.Signal.handler = (code) => {
    if (S.role === 'host' && S.mode === 'rtc' && S.node && code.startsWith('o.')) { hostAcceptOffer(code); return true; }
    if (S.role === 'guest' && S.pendingOffer && code.startsWith('a.')) { guestApplyAnswer(code); return true; }
    return false;
  };

  /* ───────── Radar ───────── */
  const angleFor = (id) => (parseInt(C.sha256Hex(String(id)).slice(0, 4), 16) / 65536) * Math.PI * 2;
  const radiusFor = (ms) => (ms == null ? .6 : .36 + (Math.min(ms, 200) / 200) * .5);
  function renderRadar() {
    const box = $('#radarBlips');
    const core = $('#radarCore');
    core.style.setProperty('--c', S.color);
    core.firstElementChild.textContent = ini(S.name);
    const items = [];
    if (S.role === 'host' && S.node) {
      S.node.members.forEach((s) => items.push({ id: s.id, name: s.name, color: s.color, cls: '', link: true, r: radiusFor(S.node.rtt[s.id]) }));
      S.node.pending.forEach((s) => items.push({ id: s.id, name: s.name + ' · at door', color: s.color, cls: 'pending', r: .86 }));
      [...S.node.sess].filter((s) => s.state === 'challenge').forEach((s) => items.push({ id: s.id, name: s.name, color: s.color, cls: 'ghost', r: .92 }));
    } else if (S.role === 'guest') {
      if (S.node && S.node.state === 'in') {
        S.node.roster.filter((r) => r.id !== S.node.id).forEach((r) => items.push({ id: r.id, name: r.host ? r.name + ' · host' : r.name, color: r.color, cls: r.host ? 'cell' : '', link: !!r.host, r: r.host ? .5 : .8 }));
      } else {
        S.cells.forEach((c, k) => items.push({ id: k, name: c.cell, color: '#e8173a', cls: 'cell', r: .66, cellId: k }));
      }
    }
    const keep = new Set(items.map((i) => i.id));
    $$('.blip:not(.bad), .radar-link', box).forEach((el) => { if (!keep.has(el.dataset.id)) el.remove(); });
    items.forEach((it) => {
      const a = angleFor(it.id);
      const x = 50 + Math.cos(a) * it.r * 46, y = 50 + Math.sin(a) * it.r * 46;
      let b = box.querySelector(`.blip[data-id="${cssId(it.id)}"]`);
      if (!b) { b = document.createElement('div'); b.dataset.id = it.id; b.innerHTML = '<i></i><em></em>'; box.appendChild(b); }
      b.className = 'blip ' + it.cls + (it.cellId && S.chosenCell === it.cellId ? ' on' : '');
      b.style.setProperty('--x', x + '%'); b.style.setProperty('--y', y + '%'); b.style.setProperty('--c', it.color);
      b.firstChild.textContent = it.cls.includes('cell') && !it.link ? 'V' : ini(it.name);
      b.lastChild.textContent = it.name;
      b.onclick = it.cellId ? () => chooseCell(it.cellId) : null;
      b.dataset.tip = it.cellId ? 'Cell|' + it.name + '|Tap to select this cell, then enter its passphrase.' : 'Phone|' + it.name + '|' + (it.cls === 'pending' ? 'Waiting at the door for approval.' : it.link ? 'Connected. Distance from centre shows round-trip latency.' : 'Inside the cell.');
      let l = box.querySelector(`.radar-link[data-id="${cssId(it.id)}"]`);
      if (it.link) {
        if (!l) { l = document.createElement('div'); l.className = 'radar-link'; l.dataset.id = it.id; box.prepend(l); }
        l.style.width = it.r * 46 + '%';
        l.style.transform = `rotate(${a}rad)`;
      } else if (l) l.remove();
    });
    $('#radar').classList.toggle('calm', S.role === 'guest' && S.node && S.node.state === 'in');
  }

  /* ───────── Lobby & global actions ───────── */
  enter.lobby = () => { if (S.role === 'host') refreshLobby(); renderRadar(); };
  const ACTIONS = {
    reveal: (el) => el.classList.toggle('blur'),
    addPhone: openAddPhone,
    newTab: () => window.open(location.pathname, '_blank'),
    drill: () => {
      if (S.mode === 'sim') { releaseIntruder(); return; }
      sheet.open(`<h3>Intruder drill</h3>
        <p>${S.mode === 'tabs' ? 'Open another tab, choose <b>Same device · tabs → Join a cell</b>, pick this cell and knock with a <b>wrong passphrase</b>.' : 'On another phone, create a knock code using a <b>wrong passphrase</b> and let this phone scan it.'}</p>
        <p>You will see the alarm here, the intruder sees <b>ACCESS DENIED</b>, and nothing about the real passphrase leaks. Three bad keys in a minute triggers auto-lockdown.</p>
        ${S.mode === 'tabs' ? '<button class="cta wide" data-act="newTab"><span>Open a new tab</span></button>' : ''}`);
    },
    toTest: () => go('test'),
    toChat: () => go('chat'),
    leave: () => leaveCell(),
    back: () => { teardown(); resetRole(); go('role'); },
    kick: (el) => { if (S.node && S.role === 'host') S.node.kick(el.dataset.id); },
    peek: () => { const ip = $('#inGuestPass'); if (ip) ip.type = ip.type === 'password' ? 'text' : 'password'; },
    pickCell: (el) => chooseCell(el.dataset.id),
    knock: guestKnock,
    makeKnock: rtcMakeKnock,
    scanReply: () => openScanner('Scan the host\'s reply', guestApplyAnswer),
    pasteReply: () => openPaste('Paste the host\'s reply', guestApplyAnswer),
    copyKnock: () => S.pendingOffer && copyText(codeUrl(S.pendingOffer.code)),
    scanKnock: () => openScanner('Scan the guest\'s knock', hostAcceptOffer),
    pasteKnock: () => openPaste('Paste the guest\'s knock', hostAcceptOffer),
    copyReply: () => { const c = $('#sheetBody').dataset.code; if (c) copyText(codeUrl(c)); },
    scanToPaste: () => { const b = $('#sheetBody'); if (b._onPaste) b._onPaste(); },
    applyPaste: () => { const b = $('#sheetBody'); if (b._onApply) b._onApply(); },
    retry: () => { S.node = null; setGuestPhase('pick'); },
    cancelKnock: () => { const n = S.node; S.node = null; if (n && n.leave) n.leave(); if (S.pendingOffer) { S.pendingOffer.close(); S.pendingOffer = null; } setGuestPhase('pick'); },
    bleScan: async () => {
      try {
        const d = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
        toast(`Found <b>${esc(d.name || 'unnamed device')}</b>. A web page can connect to gadgets like this, but cannot accept a connection from another phone.`, 'good', 6500);
      } catch (e) { toast(esc(e.message || 'Scan cancelled')); }
    },
    pickRtc: () => { sheet.close(); const c = $('#methods .method[data-mode="rtc"]'); if (c) c.click(); },
    members: () => openMembers()
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const f = ACTIONS[el.dataset.act];
    if (f) { fx.sound.click(); f(el, e); }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'inLock' && S.node && S.role === 'host') S.node.lock(e.target.checked);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'inGuestPass') { e.preventDefault(); if (S.mode === 'rtc') rtcMakeKnock(); else guestKnock(); }
  });

  /* ───────── Signal test ───────── */
  function testTargets() {
    if (!inCell()) return [];
    if (S.role === 'host') return S.node.members.map((s) => ({ id: s.id, name: s.name, color: s.color }));
    const h = S.node.roster.find((r) => r.host);
    return h ? [{ id: h.id, name: h.name, color: h.color, host: true }] : [];
  }
  function renderTest() {
    const t = testTargets();
    $('#testList').innerHTML = t.length ? t.map((x) => `
      <div class="t-card" data-id="${esc(x.id)}">
        <div class="t-top"><div class="av sm" style="--c:${esc(x.color)}">${esc(ini(x.name))}</div><b>${esc(x.name)}${x.host ? ' · host' : ''}</b><span class="t-state">ready</span></div>
        <svg class="spark" viewBox="0 0 300 44" preserveAspectRatio="none"><defs><linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff2d48"/><stop offset="1" stop-color="#ff2d48" stop-opacity="0"/></linearGradient></defs><path class="a" d=""/><path class="l" d=""/></svg>
        <div class="t-metrics">
          <div><b data-m="rtt">—</b><span>avg ms</span></div><div><b data-m="jit">—</b><span>jitter</span></div>
          <div><b data-m="tp">—</b><span>KB/s</span></div><div><b data-m="int">—</b><span>intact</span></div>
        </div>
      </div>`).join('') : '<div class="empty">No phones in the cell yet. Admit someone first.</div>';
    $('#btnRunTest').disabled = !t.length;
    $('#btnToChat').disabled = !inCell();
  }
  function drawSpark(card, arr) {
    const max = Math.max(60, ...arr) * 1.15;
    const pts = arr.map((v, i) => [arr.length < 2 ? 150 : (i / (arr.length - 1)) * 296 + 2, 42 - (v / max) * 38]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    card.querySelector('path.l').setAttribute('d', d);
    card.querySelector('path.a').setAttribute('d', pts.length ? d + ` L${pts[pts.length - 1][0]} 44 L${pts[0][0]} 44 Z` : '');
  }
  function setGauge(ms) {
    const frac = ms == null ? 0 : 1 - Math.min(ms, 300) / 300;
    const arc = $('#gaugeArc');
    arc.style.strokeDashoffset = 252 * (1 - Math.max(.03, frac));
    $('#gauge').style.setProperty('--gc', ms == null ? 'var(--red-2)' : ms < 60 ? 'var(--ok)' : ms < 150 ? 'var(--warn)' : 'var(--red-2)');
    $('#gaugeVal').textContent = ms == null ? '—' : Math.round(ms);
  }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  let testing = false;
  async function runTest() {
    const targets = testTargets();
    if (!targets.length || testing) return;
    testing = true;
    const btn = $('#btnRunTest');
    btn.disabled = true; btn.querySelector('span').textContent = 'Testing…';
    $('#verdict').className = 'verdict';
    $('#verdict').textContent = 'Measuring round-trips…';
    const all = []; let lostAll = 0, intactAll = 100, tpMin = Infinity;
    for (const t of targets) {
      const card = $(`.t-card[data-id="${cssId(t.id)}"]`);
      if (!card || !inCell()) break;
      const st = card.querySelector('.t-state');
      const set = (k, v) => { card.querySelector(`[data-m="${k}"]`).textContent = v; };
      card.classList.add('running');
      st.textContent = 'pinging ×10';
      const rtts = []; let lost = 0;
      for (let i = 0; i < 10; i++) {
        const ms = S.role === 'host' ? await S.node.ping(t.id) : await S.node.ping();
        if (!inCell()) break;
        if (ms == null) lost++; else { rtts.push(ms); all.push(ms); }
        drawSpark(card, rtts);
        setGauge(avg(all));
        set('rtt', rtts.length ? avg(rtts).toFixed(0) : '—');
        fx.sound.tick();
        await sleep(110);
      }
      if (!inCell()) break;
      st.textContent = 'burst 120 × 512 B';
      $('#verdict').textContent = `Bursting 60 KB to ${t.name}…`;
      const b = S.role === 'host' ? await S.node.bulk(t.id, 120, 512) : await S.node.bulk(120, 512);
      const jit = rtts.length > 1 ? avg(rtts.slice(1).map((v, i) => Math.abs(v - rtts[i]))) : 0;
      const tp = b && b.ms ? (b.got * 512 / 1024) / (b.ms / 1000) : 0;
      const intact = b ? Math.round((b.ok / b.n) * 100) : 0;
      set('jit', jit.toFixed(1)); set('tp', tp >= 1000 ? (tp / 1024).toFixed(1) + 'M' : tp.toFixed(0)); set('int', intact + '%');
      st.textContent = lost ? `${lost}/10 lost` : 'clean';
      card.classList.remove('running');
      lostAll += lost; intactAll = Math.min(intactAll, intact); tpMin = Math.min(tpMin, tp);
    }
    const a = avg(all);
    const good = all.length && lostAll === 0 && intactAll === 100 && a < 150;
    $('#verdict').className = 'verdict ' + (good ? 'good' : 'bad');
    $('#verdict').textContent = !all.length ? 'No replies. The line is down.'
      : good ? `Clean line · ${Math.round(a)} ms average · every byte intact. Ready to transmit.`
        : `Line is usable but noisy: ${lostAll} lost pings, ${intactAll}% intact.`;
    if (good) { fx.sound.chime(); fx.fireworks.burstAt($('#gauge'), 70); }
    btn.disabled = false; btn.querySelector('span').textContent = 'Run again';
    testing = false;
  }
  $('#btnRunTest').onclick = runTest;
  $('#btnToChat').onclick = () => go('chat');
  enter.test = () => { renderTest(); setGauge(null); $('#verdict').className = 'verdict'; $('#verdict').textContent = testTargets().length ? 'Ready when you are.' : 'Waiting for phones.'; };

  /* ───────── Chat ───────── */
  const msgEls = new Map();
  function renderMsg(m, quiet) {
    const log = $('#chatLog');
    if (m.id && msgEls.has(m.id)) return;
    const me = !m.sys && m.from === myId();
    const el = document.createElement('div');
    if (m.sys) {
      el.className = 'msg sys' + (m.alert ? ' alert' : '');
      el.innerHTML = '<div class="bubble"></div>';
      el.firstChild.textContent = m.text;
    } else {
      el.className = 'msg' + (me ? ' me' : '') + (m.burst ? ' burst' : '');
      el.innerHTML = `<div class="av sm"></div><div class="bubble">${me ? '' : '<span class="who"></span>'}<div class="txt"></div>
        <div class="meta"><span>${time(m.ts)}</span>${me ? `<span class="tick ${m.pending ? '' : 'ok'}">${m.pending ? '◌' : '✓✓'}</span>` : ''}</div></div>`;
      el.style.setProperty('--c', m.color);
      const av = el.querySelector('.av'); av.style.setProperty('--c', m.color); av.textContent = ini(m.name);
      if (!me) el.querySelector('.who').textContent = m.name;
      const txt = el.querySelector('.txt');
      if (me || quiet) txt.textContent = m.text;
      else fx.scramble(txt, m.text, { duration: Math.min(900, 280 + m.text.length * 12) });
    }
    if (m.id) msgEls.set(m.id, el);
    const near = log.scrollHeight - log.scrollTop - log.clientHeight < 140;
    log.appendChild(el);
    if (near || me) requestAnimationFrame(() => log.scrollTo({ top: log.scrollHeight, behavior: quiet ? 'auto' : 'smooth' }));
  }
  function onMessage(m, fromHistory) {
    if (!m) return;
    renderMsg(m, fromHistory);
    if (fromHistory || m.sys || m.from === myId()) { if (m.sys && !fromHistory) renderChatHead(); return; }
    delete S.typers[m.name]; renderTyping();
    fx.sound.squelch(); fx.haptic(18);
    if (S.screen !== 'chat') { S.unread++; toast(`<b style="color:${esc(m.color)}">${esc(m.name)}</b>&nbsp; ${esc(m.text.slice(0, 80))}`); }
  }
  function onAck(id) {
    const el = msgEls.get(id);
    const t = el && el.querySelector('.tick');
    if (t) { t.textContent = '✓✓'; t.classList.add('ok'); }
  }
  function onTyping(t) {
    if (!t || t.id === myId()) return;
    S.typers[t.name] = Date.now();
    renderTyping();
    setTimeout(renderTyping, 3300);
  }
  function renderTyping() {
    const names = Object.keys(S.typers).filter((n) => Date.now() - S.typers[n] < 3200);
    $('#typing').textContent = names.length ? `${names.join(', ')} ${names.length > 1 ? 'are' : 'is'} keying the mic` : '';
  }
  function renderChatHead() {
    if (!S.node) return;
    const r = roster();
    $('#chCell').textContent = S.role === 'host' ? S.cell : S.node.cell || 'Cell';
    $('#chNum').textContent = S.role === 'host' ? chNum() : String((parseInt(C.sha256Hex(String(S.node.cell || 'v').toLowerCase()).slice(0, 4), 16) % 99) + 1).padStart(2, '0');
    $('#chSub').textContent = `${r.length} ${r.length === 1 ? 'phone' : 'phones'} · ${MODES[S.mode].kind}${S.role === 'host' && S.node.locked ? ' · 🔒' : ''}`;
    $('#chFaces').innerHTML = r.slice(0, 4).map((x) => `<div class="av sm" style="--c:${esc(x.color)}">${esc(ini(x.name))}</div>`).join('') +
      (r.length > 4 ? `<div class="av sm" style="--c:#333">+${r.length - 4}</div>` : '');
    $('#sasStrip').innerHTML = S.role === 'guest' && S.node.sasCode
      ? `<span>Safety words</span>${S.node.sasCode.map((x) => `<b>${x.e} ${x.w}</b>`).join(' · ')}`
      : S.role === 'host' ? `<span>Door: ${S.autoAdmit ? 'auto-admit' : 'host approval'} · ${S.node.locked ? 'locked' : 'unlocked'} · ${S.logs.filter((l) => l.level === 'intruder').length} intruders blocked</span>` : '';
  }
  enter.chat = () => {
    S.unread = 0;
    renderChatHead();
    if (!$('#chatLog').children.length) renderMsg({ sys: true, text: `Channel ${$('#chNum').textContent} open. Everything stays between these phones.`, id: 'hello' });
    const log = $('#chatLog');
    log.scrollTop = log.scrollHeight;
    if (!inCell()) toast('You are not in a cell yet', 'bad');
  };
  $('#quick').innerHTML = QUICK.map((q) => `<button type="button">${q}</button>`).join('');
  $('#quick').onclick = (e) => { const b = e.target.closest('button'); if (b) transmit(b.textContent, true); };
  function transmit(text, burst) {
    if (!inCell()) { toast('Not connected to a cell', 'bad'); return; }
    S.node.send(text, burst);
    fx.sound.roger(); fx.haptic(15);
    const p = $('#btnPtt');
    p.classList.remove('fire'); void p.offsetWidth; p.classList.add('fire');
  }
  $('#composer').onsubmit = (e) => {
    e.preventDefault();
    const inp = $('#inMsg');
    const v = inp.value.trim();
    if (!v) { inp.focus(); return; }
    transmit(v);
    inp.value = '';
  };
  let lastTyping = 0;
  $('#inMsg').oninput = () => {
    if (!inCell() || Date.now() - lastTyping < 2200) return;
    lastTyping = Date.now();
    S.node.typing();
  };
  $('#btnMembers').onclick = openMembers;

  function openMembers() {
    if (!S.node) { toast('Not in a cell'); return; }
    const host = S.role === 'host';
    sheet.open(`
      <h3>${esc(host ? S.cell : S.node.cell || 'Cell')}</h3>
      <p>${host ? 'You hold the key. Everyone here passed your door.' : `Hosted by ${esc(S.node.hostName || 'the host')}.`}</p>
      <h4>On air</h4><div class="members" id="sheetMembers"></div>
      ${host ? `
        <h4>Door</h4>
        <label class="toggle"><input type="checkbox" id="inLock" ${S.node.locked ? 'checked' : ''}><i></i><div><b>Lock the cell</b><span>Refuse every new knock.</span></div></label>
        ${S.mode === 'rtc' ? '<button class="cta wide sm" data-act="addPhone" style="margin-bottom:10px"><span>Add a phone</span></button>' : ''}
        <button class="ghost wide sm" data-act="drill">Run an intruder drill</button>
        <h4>Security log</h4><div class="seclog" id="secLogSheet"></div>` : `
        <h4>Safety words</h4><div class="sas sm">${sasHtml(S.node.sasCode)}</div>
        <p class="hint">Compare these with the host in person. A mismatch means someone is between you.</p>`}
      <button class="ghost wide" data-act="leave" style="margin-top:22px;color:var(--red-2)">${host ? 'Close the cell' : 'Leave the cell'}</button>`,
    () => { renderMembersSheet(); renderLog(); }, null, 'members');
  }
  function renderMembersSheet() {
    const box = $('#sheetMembers');
    if (!box || sheet.tag !== 'members' || !S.node) return;
    box.innerHTML = roster().map((x) => memberRow(x, { kick: S.role === 'host' })).join('');
    const lk = $('#sheetBody #inLock');
    if (lk && S.role === 'host') lk.checked = S.node.locked;
  }

  /* ───────── How phones can talk ───────── */
  function openHow() {
    sheet.open(`
      <h3>How phones talk off-grid</h3>
      <p>No towers, no internet: what's left is the radios inside the phones. Here is what each option can and can't do, especially from a web page.</p>
      <div class="cmp-wrap"><table class="cmp">
        <tr><th>Method</th><th>Range</th><th>Web page?</th><th>Notes</th></tr>
        <tr><td>Hotspot + WebRTC</td><td>30–50 m</td><td class="y">Yes (this demo)</td><td>One phone's hotspot, a QR handshake, then direct DTLS-encrypted links. Fast.</td></tr>
        <tr><td>Bluetooth LE</td><td>10–50 m</td><td class="n">Scan only</td><td>Browsers can't advertise, so phones can't find each other from a page.</td></tr>
        <tr><td>Wi-Fi Direct / Aware</td><td>50–100 m</td><td class="n">No</td><td>Android native APIs. No router at all.</td></tr>
        <tr><td>Multipeer / Nearby</td><td>30–100 m</td><td class="n">No</td><td>Apple and Google SDKs mix Bluetooth + Wi-Fi and can relay through peers.</td></tr>
        <tr><td>LoRa (Meshtastic)</td><td>1–10 km</td><td class="m">Via companion app</td><td>Cheap radio dongles, real multi-hop mesh, text only.</td></tr>
      </table></div>
      <h4>Why a host?</h4>
      <p class="hint" style="font-size:14px">On a hotspot the phones form a star: the host relays messages and guards the door. Native mesh SDKs can hop through any phone instead, but someone still has to decide who is trusted.</p>
      <h4>Keeping strangers out</h4>
      <p class="hint" style="font-size:14px">V/MESH stacks four locks: a passphrase that is <b>proven, never sent</b>; <b>host approval</b> for each phone; <b>safety words</b> compared face to face to defeat a man-in-the-middle; and <b>auto-lockdown</b> after repeated bad keys.</p>
      <h4>Getting the page onto phones offline</h4>
      <p class="hint" style="font-size:14px">Open V/MESH once over HTTPS while you have internet and add it to your home screen. It is cached for airplane mode. Or serve it from a laptop on the hotspot (<span class="mono">node serve.mjs</span>).</p>
      <button class="cta wide" data-act="howStart" style="margin-top:18px"><span>Start</span></button>`);
  }
  ACTIONS.howStart = () => { sheet.close(); $('#btnStart').click(); };

  /* ───────── Top bar ───────── */
  function netPill() {
    const p = $('#netPill');
    p.classList.toggle('online', navigator.onLine);
    p.lastElementChild.textContent = navigator.onLine ? 'ONLINE · UNUSED' : 'OFF-GRID';
  }
  addEventListener('online', netPill); addEventListener('offline', netPill); netPill();
  function soundBtn() { $('#btnSound').classList.toggle('muted', !fx.sound.on); }
  $('#btnSound').onclick = () => { fx.sound.set(!fx.sound.on); fx.sound.unlock(); soundBtn(); if (fx.sound.on) fx.sound.roger(); };
  soundBtn();
  $('#btnTour').onclick = () => { fx.sound.unlock(); const t = TOURS[S.screen]; if (t) help.tour.start(t()); };

  /* ───────── Tooltips ───────── */
  help.register({
    '#brand': ['V/MESH', 'Home', 'Back to the start screen (only when you are not inside a cell).'],
    '#steps': ['Progress', 'Seven steps', 'Intro → codename → transport → host → lobby → signal test → chat. Tap an earlier step to go back.'],
    '#netPill': ['Network', 'Internet status', 'V/MESH never uses the internet, even when it is there. Try airplane mode with Wi-Fi on.'],
    '#btnSound': ['Audio', 'Radio sounds', 'Squelch, roger beeps, knocks and alarms. Tap to mute.'],
    '#btnTour': ['Help', 'Walk me through', 'A narrated tour of the screen you are on. Long-press anything for a tip.'],
    '#heroMark': ['Mark', 'The circled V', 'Drawn fresh each time you arrive. Tap Start to cut it again.'],
    '#btnStart': ['Begin', 'Start', 'Pick a codename, choose a transport, decide the host, test, then talk.'],
    '#btnWalk': ['Tour', 'Narrated walk-through', 'A British voice when your device has one. Words light up as they are spoken.'],
    '#btnHow': ['Explainer', 'Off-grid options', 'Bluetooth vs Wi-Fi Direct vs hotspot vs LoRa, and what a web page can really do.'],
    '#statBars': ['Off-grid', 'Zero bars', 'Works in a basement, a tunnel, or airplane mode with Wi-Fi switched on.'],
    '#statDtls': ['Privacy', 'DTLS encryption', 'Real phone-to-phone links use WebRTC, encrypted with keys pinned by the QR exchange.'],
    '#statGate': ['Security', 'Two keys', 'Prove the passphrase AND be approved by the host. Either alone is not enough.'],
    '#avatarPreview': ['Identity', 'Your mark', 'Initial plus signal colour. Shown on radars and beside your messages.'],
    '#fieldName': ['Identity', 'Codename', 'Up to 18 characters. Never leaves your cell.'],
    '#btnDice': ['Identity', 'Random codename', 'Rolls a fresh adjective + noun.'],
    '#nameIdeas': ['Identity', 'Ideas', 'Tap one to use it.'],
    '#swatches': ['Identity', 'Signal colour', 'Helps everyone tell voices apart in the channel.'],
    '#tileHost': ['Role', 'Host', 'Your phone becomes the hub: it relays every message and approves who gets in.'],
    '#tileGuest': ['Role', 'Guest', 'Find or scan a cell, prove the passphrase, wait for the host.'],
    '#tileLots': ['Role', 'Draw lots', 'Fair host election. In tabs mode, every tab that draws is counted automatically.'],
    '#inCell': ['Host', 'Cell name', 'Shown to phones in range. Also salts the key, so two cells with the same passphrase still differ.'],
    '#fieldPass': ['Host', 'Passphrase', 'Say it aloud, never send it. Phones only exchange HMAC proofs of it.'],
    '#btnGenPass': ['Host', 'Generate', 'Three random words + digits: easy to say, hard to guess.'],
    '#passMeter': ['Host', 'Strength', 'Rough entropy estimate. Aim for "Strong".'],
    '#toggleAuto': ['Host', 'Auto-admit', 'Off (recommended): you approve every phone by hand even if it knows the passphrase.'],
    '#btnOpenCell': ['Host', 'Open the cell', 'Starts beaconing / accepting knocks on the chosen transport.'],
    '#radar': ['Lobby', 'Radar', 'You are the centre. Cells, knocks and members appear as blips; distance reflects latency.'],
    '#knockDock': ['Door', 'Knocks', 'A phone that proved the passphrase waits here for your approval.'],
    '#credCard': ['Host', 'Your cell', 'Tap the blurred passphrase to reveal it.'],
    '#defCard': ['Security', 'Door defences', 'Every lock between a stranger and your channel.'],
    '#btnDrill': ['Security', 'Intruder drill', 'Throws a wrong-passphrase or forged-key attacker at your door.'],
    '#lockToggle': ['Security', 'Lock', 'Seals the cell. Even correct passphrases are refused.'],
    '#cellList': ['Guest', 'Cells in range', 'Tap one to target it.'],
    '#fieldGuestPass': ['Guest', 'Passphrase', 'Used locally to compute a one-time proof. It is never transmitted.'],
    '#btnMakeKnock': ['Guest', 'Knock code', 'Creates a WebRTC offer packed into a QR code for the host to scan.'],
    '#gauge': ['Test', 'Round-trip', 'Average time for a ping to reach the other phone and return.'],
    '#testList': ['Test', 'Per-phone results', 'Latency sparkline, jitter, burst throughput and integrity (hash-checked).'],
    '#btnRunTest': ['Test', 'Run', '10 pings + a 120-packet burst per phone, over the same link chat uses.'],
    '#btnToChat': ['Chat', 'Open the channel', 'Start transmitting.'],
    '#chDial': ['Channel', 'Channel number', 'Derived from the cell name. Read it out to confirm everyone is on the same channel.'],
    '#chFaces': ['Channel', 'On air', 'Everyone currently inside the cell.'],
    '#btnMembers': ['Channel', 'Members & security', 'Roster, signal bars, lock, kick, security log, leave.'],
    '#sasStrip': ['Security', 'Safety words / door status', 'Guests: compare words with the host. Host: door state at a glance.'],
    '#chatLog': ['Channel', 'Transmissions', 'Incoming messages decrypt in front of you. ✓✓ means the host relayed yours.'],
    '#quick': ['Channel', 'Burst codes', 'One-tap radio phrases, sent in caps like a real call sign.'],
    '#btnPtt': ['Channel', 'Transmit', 'Send. Roger beep included.'],
    '#lotsPanel': ['Election', 'Dominoes', 'Highest number hosts. Ties draw again.']
  });

  /* ───────── Tours ───────── */
  const step = (sel, k, t, d, before) => ({ sel, k, t, d, before });
  const TOURS = {
    intro: () => [
      step('#heroMark', 'Welcome', 'This is V/MESH', 'A private walkie-talkie network for phones standing close together. No cell towers, no internet. Just the phones in the room.'),
      step('#btnStart', 'The ritual', 'Start', 'Start walks you through five steps: choose a codename, pick how phones connect, decide who hosts, test the line, then talk.'),
      step('#btnHow', 'Explainer', 'How phones talk off-grid', 'Bluetooth, Wi-Fi Direct, hotspots and long-range radios, compared honestly. Including what a web page can and cannot do.'),
      step('#statGate', 'Security', 'Two keys to get in', 'Every phone must prove it knows the passphrase, and then the host must open the door by hand. Nobody walks in uninvited.'),
      step('#netPill', 'Status', 'Off-grid indicator', 'Shows whether this phone has internet. V/MESH never uses it. Try airplane mode with Wi-Fi on.'),
      step('#btnTour', 'Help', 'Always one tap away', 'Tap the question mark on any screen for a tour of that step. Long-press anything for a tooltip.')
    ],
    name: () => [
      step('#avatarPreview', 'Identity', 'Your mark', 'Your initial and signal colour. It appears on the radar and next to every message you send.'),
      step('#fieldName', 'Identity', 'Codename', 'Up to eighteen characters. Only phones admitted to your cell will see it.'),
      step('#btnDice', 'Identity', 'Feeling anonymous?', 'Roll the dice for a random codename.'),
      step('#swatches', 'Identity', 'Signal colour', 'Pick a colour so the others can tell your transmissions apart at a glance.'),
      step('#btnName', 'Next', 'Continue', 'When you are happy with your codename, continue to choose the airwaves.')
    ],
    link: () => [
      step('#methods [data-mode="rtc"]', 'Real phones', 'Wi-Fi or hotspot', 'One phone opens a hotspot and the others join it. They swap QR codes once, then talk directly, encrypted, with no server in between.'),
      step('#methods [data-mode="tabs"]', 'One device', 'Same-device tabs', 'No second phone handy? Open a few tabs. They discover each other and run the exact same protocol.'),
      step('#methods [data-mode="sim"]', 'Demo', 'Simulated cell', 'Virtual phones knock on your door, chat back, and an intruder tries to break in. Perfect for showing it off alone.'),
      step('#methods [data-mode="ble"]', 'Honesty', 'Why not Bluetooth?', 'Browsers can scan for Bluetooth gadgets but cannot make a phone discoverable. Phone-to-phone Bluetooth needs a native app.'),
      step('#caps', 'Capabilities', 'What this device can do', 'A live check of the browser features V/MESH relies on. Long-press any chip for details.')
    ],
    role: () => [
      step('#tileHost', 'Role', 'The host', 'The host phone becomes the hub. It relays every message and decides who gets in.'),
      step('#tileGuest', 'Role', 'The guests', 'Guests find the cell, prove they know the passphrase, then wait for the host to open the door.'),
      step('#tileLots', 'Role', 'Draw lots', 'No obvious host? Everyone draws a domino and the highest number hosts. In tabs mode the election runs automatically.'),
      step('#hostPanel', 'Host setup', 'Lock it down', 'Name the cell and set a passphrase. Say it out loud, never send it. Keep auto-admit off so you approve every phone yourself.', () => { if ($('#hostPanel').hidden) $('#tileHost').click(); })
    ],
    lobby: () => (S.role === 'host' ? [
      step('#radar', 'Lobby', 'Your radar', 'You sit at the centre. Knocking phones blink at the edge; admitted phones get a live link, closer when the signal is faster.'),
      step('#credCard', 'Lobby', 'Your cell', 'Cell name, channel and passphrase. Tap the blurred passphrase to reveal it to the people beside you.'),
      $('#addCard') ? step('#addCard', 'Lobby', 'Bring phones in', S.mode === 'rtc' ? 'Scan each guest\'s knock code and show them your reply. Two codes per phone, no server.' : 'Open another tab and join from there to watch the full handshake.') : null,
      step('#defCard', 'Security', 'Door defences', 'Passphrase proofs, your approval, safety words and auto-lockdown. Flip the lock to refuse everyone new.'),
      step('#btnDrill', 'Security', 'Intruder drill', 'Throw an attacker at your own door: a guessed passphrase, or a forged key. Watch the alarm, then check the security log.'),
      step('#btnLobbyTest', 'Next', 'Signal test', 'Once someone is inside, prove the line is clean before you rely on it.')
    ] : [
      step('#radar', 'Lobby', 'Your radar', S.guestPhase === 'in' ? 'You are inside. The host sits on the inner ring; other guests orbit further out.' : 'Cells in range appear as red squares. Tap one to target it.'),
      $('#cellList') ? step('#cellList', 'Lobby', 'Cells in range', 'Every cell beaconing nearby. Tap the one whose host you know.') : null,
      $('#fieldGuestPass') ? step('#fieldGuestPass', 'Security', 'The passphrase', 'Type what the host told you. It never leaves this phone; only a one-time proof is sent.') : null,
      $('#btnMakeKnock') ? step('#btnMakeKnock', 'Hotspot', 'Knock code', 'Creates a QR code holding your connection offer. The host scans it and shows you a reply.') : null,
      $('#btnKnock') ? step('#btnKnock', 'Door', 'Knock', 'Sends your knock. If the proofs check out, you wait at the door for the host.') : null,
      $('#waitSas') ? step('#waitSas', 'Security', 'Safety words', 'Read these to the host. If their words match yours, nobody is sitting in the middle of your link.') : null
    ]),
    test: () => [
      step('#gauge', 'Signal', 'Round-trip time', 'The average time for a ping to reach the other phone and come back. Under sixty milliseconds is excellent.'),
      step('#testList', 'Signal', 'Every phone', 'Each link gets ten pings and a burst of a hundred and twenty packets. Every packet is hash-checked for integrity.'),
      step('#btnRunTest', 'Signal', 'Run the test', 'Run it now, and again after anyone moves away, to see how distance hurts the signal.'),
      step('#btnToChat', 'Next', 'Open the channel', 'Line clean? Time to talk.')
    ],
    chat: () => [
      step('#chDial', 'Channel', 'Channel number', 'Derived from the cell name. Read it out loud to make sure everyone is on the same channel.'),
      step('#chFaces', 'Channel', 'Who is on air', 'Everyone currently inside the cell.'),
      step('#chatLog', 'Channel', 'Transmissions', 'Incoming messages decrypt in front of your eyes. Two ticks mean the host relayed yours to the cell.'),
      step('#quick', 'Channel', 'Burst codes', 'One-tap radio phrases for when there is no time to type.'),
      step('#btnPtt', 'Channel', 'Transmit', 'Send, with a roger beep. Over and out.'),
      step('#btnMembers', 'Security', 'Members and security', 'Signal bars, safety words, the lock, the security log, and the way out.')
    ]
  };

  /* ───────── Boot ───────── */
  function relayMode() {
    const code = net.rtc.extractCode(location.href);
    if (!code) return false;
    history.replaceState(null, '', location.pathname + location.search);
    const ov = document.createElement('div');
    ov.className = 'relay';
    ov.innerHTML = '<div><div id="relayDom"></div><h2>Signal received</h2><p>Handing the code to your open V/MESH tab…</p></div>';
    document.body.appendChild(ov);
    $('#relayDom', ov).appendChild(fx.dominoes(22));
    net.Signal.relay(code).then((ok) => {
      const box = ov.firstElementChild;
      if (ok) {
        fx.sound.chime();
        box.innerHTML = '<div class="admit-badge">✓ Delivered</div><h2>Switch back</h2><p>The code reached your V/MESH tab. You can close this one.</p><button class="ghost" id="relayClose">Close this tab</button>';
        $('#relayClose', box).onclick = () => window.close();
        setTimeout(() => window.close(), 1500);
      } else {
        box.innerHTML = `<h2>No tab is waiting</h2><p>Open V/MESH on this phone, get to the step that expects a code, then scan again. Or copy the code and paste it there.</p>
          <div class="cta-row" style="justify-content:center"><button class="cta sm" id="relayCopy"><span>Copy code</span></button><button class="ghost sm" id="relayHere">Open V/MESH</button></div>`;
        $('#relayCopy', box).onclick = () => copyText(code);
        $('#relayHere', box).onclick = () => ov.remove();
      }
    });
    return true;
  }

  stagger($('#scr-intro'));
  relayMode();
  if ('serviceWorker' in navigator && window.isSecureContext && /^https?:/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline cache is optional */ });
  }
  addEventListener('pagehide', () => {
    if (S.node && S.role === 'guest' && S.node.leave) S.node.leave();
    if (S.node && S.role === 'host') S.node.destroy();
  });
  window.VMDebug = { S, go };
})();
