// V/MESH static server: `node serve.mjs [port]`. Listens on all interfaces so phones on the same
// hotspot / Wi-Fi can open it. No dependencies.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || process.env.PORT || 8812);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json'
};

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, url === '/' ? 'index.html' : url);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  fs.readFile(file, (err, buf) => {
    if (err) return res.writeHead(404).end('Not found');
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}).on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`Port ${port} is already in use (V/MESH may already be running). Try: node serve.mjs ${port + 1}`);
  process.exit(1);
}).listen(port, '0.0.0.0', () => {
  console.log(`V/MESH on http://localhost:${port}`);
  Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .forEach((i) => console.log(`  phones on this network: http://${i.address}:${port}`));
});
