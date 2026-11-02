/* V/MESH · crypto helpers
   Pure-JS SHA-256 + HMAC so the handshake also works on plain-http LAN pages,
   where crypto.subtle is unavailable (it needs a secure context).            */
(function () {
  'use strict';
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);
  const ror = (x, n) => (x >>> n) | (x << (32 - n));
  const enc = new TextEncoder();
  const toBytes = (v) => (typeof v === 'string' ? enc.encode(v) : v);

  function sha256(input) {
    const bytes = toBytes(input);
    const l = bytes.length;
    const padded = ((l + 9 + 63) >> 6) << 6;
    const m = new Uint8Array(padded);
    m.set(bytes);
    m[l] = 0x80;
    const dv = new DataView(m.buffer);
    dv.setUint32(padded - 4, (l * 8) >>> 0);
    dv.setUint32(padded - 8, Math.floor((l * 8) / 4294967296));
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
      h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    const w = new Uint32Array(64);
    for (let o = 0; o < padded; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const a = w[i - 15], b = w[i - 2];
        w[i] = (w[i - 16] + (ror(a, 7) ^ ror(a, 18) ^ (a >>> 3)) + w[i - 7] + (ror(b, 17) ^ ror(b, 19) ^ (b >>> 10))) | 0;
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }
    const out = new Uint8Array(32);
    const ov = new DataView(out.buffer);
    [h0, h1, h2, h3, h4, h5, h6, h7].forEach((v, i) => ov.setUint32(i * 4, v >>> 0));
    return out;
  }

  function hmac(key, msg) {
    let k = toBytes(key);
    if (k.length > 64) k = sha256(k);
    const ip = new Uint8Array(64 + 0), op = new Uint8Array(64);
    for (let i = 0; i < 64; i++) { ip[i] = (k[i] || 0) ^ 0x36; op[i] = (k[i] || 0) ^ 0x5c; }
    const m = toBytes(msg);
    const inner = new Uint8Array(64 + m.length);
    inner.set(ip); inner.set(m, 64);
    const ih = sha256(inner);
    const outer = new Uint8Array(96);
    outer.set(op); outer.set(ih, 64);
    return sha256(outer);
  }

  const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  const sha256Hex = (v) => hex(sha256(v));
  const hmacHex = (k, m) => hex(hmac(k, m));

  function randBytes(n) {
    const b = new Uint8Array(n);
    crypto.getRandomValues(b);
    return b;
  }
  const randHex = (n) => hex(randBytes(n));
  function randInt(max) { return randBytes(4).reduce((a, x) => a * 256 + x, 0) % max; }
  function randText(n) {
    const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const b = randBytes(n);
    let s = '';
    for (let i = 0; i < n; i++) s += abc[b[i] % abc.length];
    return s;
  }

  /* Light key stretch so a guessed passphrase costs a bit more to verify offline. */
  function deriveKey(cell, pass) {
    let k = sha256('vmesh|' + String(cell).trim().toLowerCase() + '|' + String(pass));
    for (let i = 0; i < 2000; i++) k = sha256(k);
    return k;
  }

  function safeEq(a, b) {
    if (a.length !== b.length) return false;
    let r = 0;
    for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
  }

  /* Short Authentication String: four words + emoji both phones compute independently.
     If they match in person, nobody is sitting in the middle of the link.              */
  const WORDS = ['ROSE', 'DOMINO', 'LANTERN', 'EMBER', 'RAVEN', 'POWDER', 'MASK', 'CROWN', 'GALLERY', 'TRAIN', 'VELVET', 'TORCH',
    'ANVIL', 'BELL', 'COMET', 'DAGGER', 'FALCON', 'GLOVE', 'HARBOR', 'IVORY', 'JUKEBOX', 'KEY', 'LOTUS', 'MIRROR',
    'NOVEL', 'ORCHID', 'PIANO', 'QUILL', 'RIBBON', 'SABRE', 'TULIP', 'URN', 'VIOLIN', 'WALTZ', 'XENON', 'YARROW',
    'ZEPHYR', 'ARROW', 'BRIDGE', 'CANDLE', 'DIAL', 'ECHO', 'FUSE', 'GAVEL', 'HAZEL', 'INK', 'JADE', 'KITE',
    'LEDGER', 'MOTH', 'NEEDLE', 'OPAL', 'PARCEL', 'QUARTZ', 'RELIC', 'SPARK', 'THORN', 'UMBRA', 'VAULT', 'WICK',
    'YEW', 'ZINC', 'ATLAS', 'BANNER'];
  const EMOJI = ['🌹', '🁫', '🏮', '🔥', '🐦‍⬛', '💥', '🎭', '👑', '🖼️', '🚂', '🍷', '🔦', '⚒️', '🔔', '☄️', '🗡️',
    '🦅', '🧤', '⚓', '🦷', '📻', '🔑', '🪷', '🪞', '📕', '🌸', '🎹', '🪶', '🎀', '⚔️', '🌷', '⚱️',
    '🎻', '💃', '💡', '🌿', '🌬️', '🏹', '🌉', '🕯️', '⏱️', '🔊', '🧨', '⚖️', '🌰', '🖋️', '🟢', '🪁',
    '📒', '🦋', '🪡', '💎', '📦', '🔮', '🏺', '✨', '🥀', '🌑', '🏦', '🪔', '🌲', '🔩', '🗺️', '🚩'];
  function sas(fp, gn, hn) {
    const h = sha256(String(fp) + '|' + gn + '|' + hn);
    return [0, 1, 2, 3].map((i) => ({ w: WORDS[h[i] % 64], e: EMOJI[h[i] % 64] }));
  }

  function shortHash(s) { return sha256Hex(s).slice(0, 12); }

  const b64u = {
    enc(bytes) {
      let s = '';
      for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    dec(str) {
      const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
      const b = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
      return b;
    }
  };

  function passStrength(p) {
    if (!p) return 0;
    let pool = 0;
    if (/[a-z]/.test(p)) pool += 26;
    if (/[A-Z]/.test(p)) pool += 26;
    if (/\d/.test(p)) pool += 10;
    if (/[^a-zA-Z0-9]/.test(p)) pool += 20;
    return Math.round(p.length * Math.log2(Math.max(pool, 2)));
  }

  window.VM = window.VM || {};
  VM.crypto = { sha256, sha256Hex, hmac, hmacHex, hex, randHex, randInt, randText, deriveKey, safeEq, sas, shortHash, b64u, passStrength, WORDS };
})();
