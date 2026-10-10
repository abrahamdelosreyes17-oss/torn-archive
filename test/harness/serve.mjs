#!/usr/bin/env node
// The harness's server: the project folder over http on this computer only, so the hub's modules load in a browser.
//     node test/harness/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.argv[2]) || 8781;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = resolve(ROOT, '.' + (path.endsWith('/') ? path + 'index.html' : path));
    if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403).end(); return; }
    try {
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
    } catch {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    }
}).listen(PORT, '127.0.0.1', () => console.log(`Torn Archive harness: http://127.0.0.1:${PORT}/test/harness/hub.html`));
