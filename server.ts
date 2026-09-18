// Zero-dependency static server for index.html + ES modules.
// ES modules do not load from file://, so the game needs any HTTP server.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = import.meta.dirname;
const PORT = Number(process.argv[2]) || 3000;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (url.pathname === '/') {
    file = path.join(ROOT, 'index.html');
  }

  // Trailing sep: a bare prefix match would allow sibling dirs (game-evil).
  if (!file.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }

  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
