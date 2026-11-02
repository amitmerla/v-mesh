# V/MESH — off-grid walkie-talkie cell

Plain HTML + CSS + JS (no frameworks, no dependencies). Phones close together form a private,
host-guarded cell and chat without cellular or internet.

## Run

```bash
node serve.mjs 8812
```

Open `http://localhost:8812`. The server listens on all interfaces and prints LAN URLs for phones.

## Transports

| Mode | What it is | Real? |
|---|---|---|
| Wi-Fi / hotspot | One phone hotspots, others join. QR-code offer/answer, then a WebRTC data channel (DTLS). No STUN/TURN, no server. | Yes, cross-phone |
| Same-device tabs | BroadcastChannel between tabs; beacons, discovery, host election | Yes, one device |
| Simulated | Virtual phones + intruders over an in-memory link with latency | Demo |
| Bluetooth | Probe only: browsers can't advertise, so phone-to-phone needs a native app | Explained |

## Entry gate

1. Guest knocks → host sends a challenge plus an HMAC proof that it holds the key (the guest aborts if the proof is wrong).
2. Guest answers with an HMAC proof. The passphrase is never sent.
3. Both sides show 4 safety words (from the DTLS fingerprints and nonces) to compare in person.
4. The host approves by hand (unless auto-admit is on). 3 bad keys within 60 s triggers auto-lockdown. The host can also lock the cell or remove phones.

## Phones in practice

- The QR codes are URLs (`…#v=<code>`). Scanning one with the phone's own camera opens a tab that
  hands the code to the waiting V/MESH tab (BroadcastChannel), so iPhones don't need an in-page scanner.
- The in-page scanner (BarcodeDetector) needs HTTPS or localhost. Plain-http LAN pages still work via the camera app or paste.
- For true airplane-mode use, open the page once over HTTPS and add it to the home screen (the service worker caches it).
