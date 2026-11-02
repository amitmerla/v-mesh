/* V/MESH · networking
   Links (in-memory sim, same-device tabs, WebRTC data channel) all speak one
   JSON protocol. The host runs a star relay and guards entry:
     knock → challenge (host proves key) → proof (guest proves key) → host approval → admitted */
(function () {
  'use strict';
  const C = VM.crypto;
  const now = () => performance.now();
  const clip = (t, n) => String(t == null ? '' : t).replace(/[\u0000-\u0008\u000B-\u001F]/g, '').trim().slice(0, n || 400);
  const cleanName = (t) => clip(t, 18) || 'Unknown';
  const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#c9a45c');

  class Emitter {
    constructor() { this._h = {}; }
    on(e, f) { (this._h[e] = this._h[e] || []).push(f); return this; }
    off(e, f) { this._h[e] = (this._h[e] || []).filter((x) => x !== f); }
    emit(e, ...a) {
      (this._h[e] || []).slice().forEach((f) => { try { f(...a); } catch (err) { console.error('[vmesh]', e, err); } });
    }
  }

  /* ───────── Links ───────── */
  class Link {
    constructor(kind) { this.kind = kind; this.onmessage = null; this.onclose = null; this.fp = ''; this.closed = false; }
    _recv(m) { if (!this.closed && this.onmessage) this.onmessage(m); }
    _closed() { if (this.closed) return; this.closed = true; if (this.onclose) this.onclose(); }
  }

  /* Simulated radio: JSON round-trip + jittery latency */
  function memPair(lat) {
    const latency = lat || (() => 8 + Math.random() * 34);
    const a = new Link('sim'), b = new Link('sim');
    a.fp = b.fp = 'sim:' + C.randHex(8);
    const wire = (from, to) => {
      from.send = (m) => {
        if (from.closed) return;
        const s = JSON.stringify(m);
        setTimeout(() => to._recv(JSON.parse(s)), latency());
      };
      from.close = () => { from._closed(); setTimeout(() => to._closed(), latency()); };
    };
    wire(a, b); wire(b, a);
    return [a, b];
  }

  /* Same-device tabs: BroadcastChannel acts as the "air" */
  const Air = {
    ch: null, id: null, links: new Map(), onIncoming: null, listeners: new Set(),
    supported: typeof BroadcastChannel !== 'undefined',
    init(id) {
      if (this.ch || !this.supported) return;
      this.id = id;
      this.ch = new BroadcastChannel('vmesh-air');
      this.ch.onmessage = (e) => this._on(e.data);
      addEventListener('pagehide', () => {
        this.links.forEach((l, remote) => this.post({ to: remote, from: this.id, close: 1 }));
      });
    },
    post(env) { if (this.ch) this.ch.postMessage(env); },
    broadcast(p) { this.post({ to: '*', from: this.id, p }); },
    listen(f) { this.listeners.add(f); return () => this.listeners.delete(f); },
    _on(env) {
      if (!env || env.from === this.id) return;
      if (env.to === '*') { this.listeners.forEach((f) => f(env.p, env.from)); return; }
      if (env.to !== this.id) return;
      let l = this.links.get(env.from);
      if (env.close) { if (l) { this.links.delete(env.from); l._closed(); } return; }
      if (!l) {
        if (!this.onIncoming) return;
        l = this.link(env.from);
        this.onIncoming(l);
      }
      l._recv(env.p);
    },
    link(remote) {
      const l = new Link('tabs');
      l.remote = remote;
      l.fp = 'tabs:' + [this.id, remote].sort().join(':');
      l.send = (p) => { if (!l.closed) this.post({ to: remote, from: this.id, p }); };
      l.close = () => { this.post({ to: remote, from: this.id, close: 1 }); this.links.delete(remote); l._closed(); };
      this.links.set(remote, l);
      return l;
    }
  };

  /* QR / URL hand-off: a code scanned by the phone's own camera opens a new tab,
     which forwards it to the waiting V/MESH tab over this channel.                */
  const Signal = {
    ch: typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('vmesh-signal') : null,
    handler: null,
    init() {
      if (!this.ch) return;
      this.ch.onmessage = (e) => {
        const m = e.data || {};
        if (m.t === 'sig' && this.handler) {
          const taken = this.handler(m.code);
          if (taken) this.ch.postMessage({ t: 'ack', nonce: m.nonce });
        }
      };
    },
    relay(code) {
      return new Promise((res) => {
        if (!this.ch) return res(false);
        const nonce = C.randHex(6);
        const t = setTimeout(() => { this.ch.removeEventListener('message', on); res(false); }, 1800);
        const on = (e) => { if (e.data && e.data.t === 'ack' && e.data.nonce === nonce) { clearTimeout(t); this.ch.removeEventListener('message', on); res(true); } };
        this.ch.addEventListener('message', on);
        this.ch.postMessage({ t: 'sig', code, nonce });
      });
    }
  };

  /* ───────── WebRTC (no STUN/TURN: local network only) ───────── */
  const RTC_CFG = { iceServers: [] };
  function gather(pc) {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((res) => {
      const t = setTimeout(res, 3500);
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); }
      });
    });
  }
  function slimSdp(sdp) {
    return sdp.split(/\r?\n/)
      .filter((l) => l && !/^a=(extmap-allow-mixed|msid-semantic)/.test(l) && !(l.startsWith('a=candidate') && / tcp /i.test(l)))
      .map((l) => (l.startsWith('a=candidate') ? l.replace(/ generation \d+.*$/, '') : l))
      .join('\r\n') + '\r\n';
  }
  async function deflate(bytes) {
    if (typeof CompressionStream === 'undefined') return null;
    try {
      const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
      return new Uint8Array(await new Response(s).arrayBuffer());
    } catch (e) { return null; }
  }
  async function inflate(bytes) {
    const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function pack(kind, sdp) {
    const raw = new TextEncoder().encode(slimSdp(sdp));
    const z = await deflate(raw);
    return kind + '.' + (z ? 'z' : 'p') + C.b64u.enc(z || raw);
  }
  async function unpack(code) {
    const m = /([oa])\.([zp])([A-Za-z0-9_-]+)/.exec(String(code || ''));
    if (!m) throw new Error('That is not a V/MESH code');
    let bytes = C.b64u.dec(m[3]);
    if (m[2] === 'z') {
      if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot read compressed codes');
      bytes = await inflate(bytes);
    }
    return { kind: m[1], sdp: new TextDecoder().decode(bytes) };
  }
  function extractCode(text) {
    const s = String(text || '').trim();
    const h = s.indexOf('#v=');
    const v = h >= 0 ? decodeURIComponent(s.slice(h + 3)) : s;
    return /^[oa]\.[zp][A-Za-z0-9_-]+$/.test(v) ? v : null;
  }
  const fpOf = (sdp) => ((/a=fingerprint:\S+ (\S+)/.exec(sdp || '') || [])[1] || '');

  function dcLink(dc, pc) {
    const l = new Link('rtc');
    l.fp = 'rtc:' + [fpOf(pc.localDescription && pc.localDescription.sdp), fpOf(pc.remoteDescription && pc.remoteDescription.sdp)].sort().join('|');
    l.send = (m) => { if (dc.readyState === 'open') dc.send(JSON.stringify(m)); };
    l.close = () => { try { dc.close(); pc.close(); } catch (e) { /* closed */ } l._closed(); };
    dc.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } l._recv(m); };
    dc.onclose = () => l._closed();
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') l._closed();
    });
    return l;
  }

  const rtc = {
    supported: typeof RTCPeerConnection !== 'undefined',
    async guestOffer() {
      const pc = new RTCPeerConnection(RTC_CFG);
      const dc = pc.createDataChannel('vmesh', { ordered: true });
      const ready = new Promise((res) => { dc.onopen = () => res(dcLink(dc, pc)); });
      await pc.setLocalDescription(await pc.createOffer());
      await gather(pc);
      const code = await pack('o', pc.localDescription.sdp);
      return {
        pc, code, ready,
        async accept(answer) {
          const s = await unpack(answer);
          if (s.kind !== 'a') throw new Error('Scan the host\'s reply code, not a knock code');
          await pc.setRemoteDescription({ type: 'answer', sdp: s.sdp });
        },
        close() { try { pc.close(); } catch (e) { /* closed */ } }
      };
    },
    async hostAnswer(offer) {
      const s = await unpack(offer);
      if (s.kind !== 'o') throw new Error('Scan the guest\'s knock code, not a reply code');
      const pc = new RTCPeerConnection(RTC_CFG);
      const ready = new Promise((res) => {
        pc.ondatachannel = (e) => {
          const dc = e.channel;
          if (dc.readyState === 'open') res(dcLink(dc, pc));
          else dc.onopen = () => res(dcLink(dc, pc));
        };
      });
      await pc.setRemoteDescription({ type: 'offer', sdp: s.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      await gather(pc);
      const code = await pack('a', pc.localDescription.sdp);
      return { pc, code, ready, close() { try { pc.close(); } catch (e) { /* closed */ } } };
    },
    extractCode,
    pack, unpack
  };

  /* ───────── Protocol nodes ───────── */
  class Node extends Emitter {
    constructor() { super(); this._wait = new Map(); }
    _ping(link) {
      const id = C.randHex(4), t0 = now();
      link.send({ t: 'ping', id });
      return new Promise((res) => {
        const to = setTimeout(() => { this._wait.delete(id); res(null); }, 4000);
        this._wait.set(id, () => { clearTimeout(to); res(now() - t0); });
      });
    }
    _bulk(link, n, size) {
      return new Promise((res) => {
        const t0 = now(), ids = [];
        let got = 0, ok = 0, bad = 0, done = false;
        const finish = () => {
          if (done) return; done = true;
          ids.forEach((i) => this._wait.delete(i));
          res({ n, size, got, ok, bad, ms: now() - t0 });
        };
        const to = setTimeout(finish, 10000);
        for (let i = 0; i < n; i++) {
          const d = C.randText(size), id = 'b' + C.randHex(3) + i;
          ids.push(id);
          this._wait.set(id, (m) => {
            got++; if (m.ok) ok++; else bad++;
            if (got === n) { clearTimeout(to); finish(); }
          });
          link.send({ t: 'bulk', id, d, h: C.shortHash(d) });
        }
      });
    }
    _common(link, m) {
      if (m.t === 'ping') { link.send({ t: 'pong', id: m.id }); return true; }
      if (m.t === 'pong' || m.t === 'bulkack') {
        const f = this._wait.get(m.id);
        if (f) { this._wait.delete(m.id); f(m); }
        return true;
      }
      if (m.t === 'bulk') { link.send({ t: 'bulkack', id: m.id, ok: C.shortHash(String(m.d)) === m.h }); return true; }
      return false;
    }
  }

  class HostNode extends Node {
    constructor(o) {
      super();
      this.role = 'host';
      this.id = o.id; this.name = o.name; this.color = o.color; this.cell = o.cell;
      this.autoAdmit = !!o.autoAdmit;
      this.key = C.deriveKey(o.cell, o.pass);
      this.sess = new Set();
      this.locked = false; this.fails = []; this.history = []; this.rtt = {};
      this._ka = setInterval(() => this._keepalive(), 4000);
    }
    get members() { return [...this.sess].filter((s) => s.state === 'in'); }
    get pending() { return [...this.sess].filter((s) => s.state === 'pending'); }
    roster() {
      return [{ id: this.id, name: this.name, color: this.color, host: true }]
        .concat(this.members.map((s) => ({ id: s.id, name: s.name, color: s.color, kind: s.link.kind })));
    }
    attach(link) {
      const s = { link, state: 'new', seen: Date.now() };
      this.sess.add(s);
      link.onmessage = (m) => { s.seen = Date.now(); this._on(s, m); };
      link.onclose = () => this._drop(s, 'lost');
      return s;
    }
    _on(s, m) {
      if (!m || typeof m !== 'object') return;
      if (this._common(s.link, m)) return;
      switch (m.t) {
        case 'knock': {
          if (s.state !== 'new') return;
          s.id = clip(m.id, 24) || C.randHex(6);
          s.name = cleanName(m.name); s.color = safeColor(m.color); s.gn = clip(m.n, 64);
          if (this.locked) {
            this._log('blocked', `${s.name} knocked on a locked cell`);
            this.emit('blocked', s);
            s.link.send({ t: 'denied', why: 'locked' });
            return this._kill(s);
          }
          if ([...this.sess].some((o) => o !== s && o.id === s.id && o.state !== 'dead') || s.id === this.id) s.id += '-' + C.randHex(2);
          s.hn = C.randHex(16); s.state = 'challenge';
          s.sas = C.sas(s.link.fp, s.gn, s.hn);
          s.link.send({ t: 'challenge', cell: this.cell, host: this.name, n: s.hn, proof: C.hmacHex(this.key, 'host|' + s.gn) });
          this._log('knock', `${s.name} knocked via ${s.link.kind}`);
          this.emit('knock', s);
          return;
        }
        case 'abort':
          if (s.state === 'challenge') this._fail(s, 'turned back: passphrase did not match');
          return;
        case 'proof': {
          if (s.state !== 'challenge') return;
          const exp = C.hmacHex(this.key, 'guest|' + s.hn + '|' + s.id);
          if (!C.safeEq(String(m.proof || ''), exp)) return this._fail(s, 'presented a forged key');
          s.state = 'pending';
          this._log('ok', `${s.name} proved the passphrase`);
          if (this.autoAdmit) this.admit(s.id);
          else { s.link.send({ t: 'wait' }); this.emit('pending', s); }
          return;
        }
        case 'msg': {
          if (s.state !== 'in') return;
          const msg = { id: clip(m.id, 32), from: s.id, name: s.name, color: s.color, text: clip(m.text), ts: Date.now(), burst: !!m.burst };
          if (!msg.text) return;
          this._store(msg);
          this._bcast({ t: 'msg', m: msg }, s);
          s.link.send({ t: 'ack', id: msg.id, n: this.members.length });
          this.emit('message', msg);
          return;
        }
        case 'typing':
          if (s.state !== 'in') return;
          this._bcast({ t: 'typing', id: s.id, name: s.name }, s);
          this.emit('typing', { id: s.id, name: s.name });
          return;
        case 'bye': this._drop(s, 'left'); return;
        default:
      }
    }
    _fail(s, why) {
      const t = Date.now();
      this.fails = this.fails.filter((x) => t - x < 60000).concat(t);
      this._log('intruder', `${s.name} ${why}`);
      this.emit('intruder', { name: s.name, why, kind: s.link.kind });
      s.link.send({ t: 'denied', why: 'key' });
      this._kill(s);
      if (this.fails.length >= 3 && !this.locked) this.lock(true, 'auto');
    }
    _kill(s) {
      s.state = 'dead';
      setTimeout(() => { try { s.link.close(); } catch (e) { /* closed */ } this.sess.delete(s); }, 300);
    }
    admit(id) {
      const s = this._find(id, 'pending');
      if (!s) return;
      s.state = 'in'; s.seen = Date.now();
      s.link.send({ t: 'admitted', you: s.id, cell: this.cell, host: this.name, roster: this.roster(), history: this.history.slice(-40) });
      this._log('ok', `${s.name} admitted by host`);
      this._sys(`${s.name} entered the cell`);
      this._roster();
      this.emit('joined', s);
    }
    deny(id) {
      const s = this._find(id, 'pending');
      if (!s) return;
      this._log('blocked', `${s.name} turned away by host`);
      s.link.send({ t: 'denied', why: 'host' });
      this._kill(s);
      this.emit('change');
    }
    kick(id) {
      const s = this._find(id, 'in');
      if (!s) return;
      s.link.send({ t: 'kicked', why: 'host' });
      this._kill(s);
      this._sys(`${s.name} was removed by the host`);
      this._log('blocked', `${s.name} removed`);
      this._roster();
    }
    lock(v, by) {
      this.locked = !!v;
      this._log(v ? 'lock' : 'ok', v ? (by === 'auto' ? 'Auto-lockdown: 3 failed keys in a minute' : 'Cell locked: no new phones') : 'Cell unlocked');
      if (v && by === 'auto') this._sys('Lockdown: the door is sealed');
      this.emit('lock', this.locked, by);
    }
    send(text, burst) {
      text = clip(text);
      if (!text) return null;
      const msg = { id: C.randHex(8), from: this.id, name: this.name, color: this.color, text, ts: Date.now(), burst: !!burst };
      this._store(msg);
      this._bcast({ t: 'msg', m: msg });
      this.emit('message', msg);
      return msg;
    }
    typing() { this._bcast({ t: 'typing', id: this.id, name: this.name }); }
    _store(m) { this.history.push(m); if (this.history.length > 200) this.history.shift(); }
    _sys(text, alert) {
      const m = { sys: true, alert: !!alert, text, ts: Date.now(), id: C.randHex(6) };
      this._store(m);
      this._bcast({ t: 'msg', m });
      this.emit('message', m);
    }
    _roster() { const r = this.roster(); this._bcast({ t: 'roster', r }); this.emit('roster', r); }
    _bcast(obj, except) { this.members.forEach((s) => { if (s !== except) s.link.send(obj); }); }
    _find(id, state) { return [...this.sess].find((s) => s.id === id && (!state || s.state === state)); }
    _drop(s, why) {
      if (!this.sess.has(s)) return;
      const was = s.state;
      this.sess.delete(s);
      s.state = 'dead';
      if (was === 'in') {
        this._sys(`${s.name} ${why === 'left' ? 'signed off' : 'lost signal'}`);
        this._log('blocked', `${s.name} ${why === 'left' ? 'left' : 'dropped'}`);
        this._roster();
      } else if (was === 'pending' || was === 'challenge') {
        this.emit('change');
      }
    }
    _log(level, text) { this.emit('log', { level, text, ts: Date.now() }); }
    _keepalive() {
      const t = Date.now();
      this.members.forEach((s) => {
        if (t - s.seen > 15000) { try { s.link.close(); } catch (e) { /* closed */ } this._drop(s, 'lost'); return; }
        this._ping(s.link).then((ms) => { if (ms != null) { this.rtt[s.id] = ms; this.emit('rtt', s.id, ms); } });
      });
    }
    ping(id) { const s = this._find(id, 'in'); return s ? this._ping(s.link) : Promise.resolve(null); }
    bulk(id, n, size) { const s = this._find(id, 'in'); return s ? this._bulk(s.link, n, size) : Promise.resolve(null); }
    destroy() {
      clearInterval(this._ka);
      this.sess.forEach((s) => { try { s.link.send({ t: 'kicked', why: 'closed' }); s.link.close(); } catch (e) { /* closed */ } });
      this.sess.clear();
    }
  }

  class GuestNode extends Node {
    constructor(o) {
      super();
      this.role = 'guest';
      this.id = o.id; this.name = o.name; this.color = o.color; this.pass = o.pass;
      this.state = 'idle'; this.roster = []; this.rtt = null; this.seen = Date.now();
    }
    get hostId() { const h = this.roster.find((r) => r.host); return h ? h.id : null; }
    join(link) {
      this.link = link; this.state = 'knock'; this.gn = C.randHex(16);
      link.onmessage = (m) => { this.seen = Date.now(); this._on(m); };
      link.onclose = () => this._lost();
      link.send({ t: 'knock', id: this.id, name: this.name, color: this.color, n: this.gn });
      this.emit('state', 'knock');
    }
    _on(m) {
      if (!m || typeof m !== 'object') return;
      if (this._common(this.link, m)) return;
      switch (m.t) {
        case 'challenge': {
          if (this.state !== 'knock') return;
          this.cell = clip(m.cell, 24); this.hostName = cleanName(m.host);
          this.key = C.deriveKey(this.cell, this.pass);
          this.sasCode = C.sas(this.link.fp, this.gn, clip(m.n, 64));
          if (!C.safeEq(String(m.proof || ''), C.hmacHex(this.key, 'host|' + this.gn))) {
            // Either we mistyped or this host doesn't hold the real key. Reveal nothing.
            this.link.send({ t: 'abort' });
            this.state = 'denied';
            this.emit('denied', 'mismatch');
            return;
          }
          this.state = 'proving';
          this.link.send({ t: 'proof', proof: C.hmacHex(this.key, 'guest|' + clip(m.n, 64) + '|' + this.id) });
          this.emit('state', 'proving', this.sasCode);
          return;
        }
        case 'wait': this.state = 'pending'; this.emit('state', 'pending', this.sasCode); return;
        case 'admitted':
          this.state = 'in';
          if (m.you) this.id = m.you;
          this.roster = m.roster || []; this.cell = m.cell || this.cell;
          clearInterval(this._ka);
          this._ka = setInterval(() => this._keep(), 4000);
          this.emit('admitted', m);
          return;
        case 'denied': if (this.state !== 'in') { this.state = 'denied'; this.emit('denied', m.why); } return;
        case 'kicked': this.state = 'out'; clearInterval(this._ka); this.emit('kicked', m.why); return;
        case 'msg': if (this.state === 'in' && m.m) this.emit('message', m.m); return;
        case 'ack': this.emit('ack', m.id, m.n); return;
        case 'roster': this.roster = m.r || []; this.emit('roster', this.roster); return;
        case 'typing': this.emit('typing', m); return;
        default:
      }
    }
    send(text, burst) {
      text = clip(text);
      if (!text || this.state !== 'in') return null;
      const msg = { id: C.randHex(8), from: this.id, name: this.name, color: this.color, text, ts: Date.now(), pending: true, burst: !!burst };
      this.link.send({ t: 'msg', id: msg.id, text, burst: !!burst });
      this.emit('message', msg);
      return msg;
    }
    typing() { if (this.state === 'in') this.link.send({ t: 'typing' }); }
    _keep() {
      if (Date.now() - this.seen > 15000) { this._lost(); return; }
      this._ping(this.link).then((ms) => { if (ms != null) { this.rtt = ms; this.emit('rtt', this.hostId, ms); } });
    }
    _lost() {
      if (['out', 'lost', 'denied', 'idle'].includes(this.state)) return;
      clearInterval(this._ka);
      this.state = 'lost';
      this.emit('lost');
    }
    ping() { return this._ping(this.link); }
    bulk(n, size) { return this._bulk(this.link, n, size); }
    leave() {
      clearInterval(this._ka);
      try { this.link.send({ t: 'bye' }); this.link.close(); } catch (e) { /* closed */ }
      this.state = 'out';
    }
  }

  window.VM = window.VM || {};
  VM.net = { Emitter, Link, memPair, Air, Signal, rtc, HostNode, GuestNode, clip };
})();
