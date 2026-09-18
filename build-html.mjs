// Emits dist/index.html from index.html with the bundle path rewritten,
// so dist/ can be served as-is by any static server.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = import.meta.dirname;
const SRC = path.join(ROOT, 'index.html');
const OUT = path.join(ROOT, 'dist', 'index.html');
// The full tag is matched, so the identical path in the comment stays intact.
const TAG_ROOT = '<script type="module" src="dist/main.js"></script>';
const TAG_DIST = '<script type="module" src="main.js"></script>';

const html = await readFile(SRC, 'utf8');
if (!html.includes(TAG_ROOT)) {
  throw new Error('bundle tag not found in index.html');
}
await writeFile(OUT, html.replace(TAG_ROOT, TAG_DIST));
