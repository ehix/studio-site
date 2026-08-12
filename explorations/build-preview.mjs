/* Build a self-contained preview from an exploration directory.
 *
 *   node explorations/build-preview.mjs r1b-landscape
 *   → previews/r1b-landscape.html
 *
 * The previews are single files on purpose: they get opened straight off disk,
 * dropped into a message, or kept as a record of what a direction looked like
 * on a given day, and any of those breaks the moment the page needs a sibling
 * stylesheet or a font next to it. So the shared CSS, the fonts and every
 * script are inlined, and nothing is minified — the source stays readable,
 * which is the whole point of the exercise.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const name = process.argv[2];
if (!name) {
  console.error('usage: node explorations/build-preview.mjs <exploration-dir>');
  process.exit(1);
}

const dir = path.join(HERE, name);
const src = path.join(dir, 'index.html');
if (!fs.existsSync(src)) {
  console.error(`no such exploration: ${path.relative(ROOT, src)}`);
  process.exit(1);
}

let html = fs.readFileSync(src, 'utf8');
const inlined = [];

/* ---- stylesheets ------------------------------------------------------- */
html = html.replace(/[ \t]*<link rel="stylesheet" href="([^"]+)">\n?/g, (m, href) => {
  const file = path.resolve(dir, href);
  const css = fs.readFileSync(file, 'utf8');
  inlined.push(path.relative(ROOT, file));
  return `<style>\n/* ---- ${href.replace(/^\.\.\//, '')} ---- */\n${css}</style>\n`;
});

/* ---- fonts ------------------------------------------------------------- */
html = html.replace(/url\("([^"]+\.woff2)"\)/g, (m, href) => {
  const file = path.resolve(dir, href);
  const b64 = fs.readFileSync(file).toString('base64');
  inlined.push(path.relative(ROOT, file));
  return `url("data:font/woff2;base64,${b64}")`;
});

/* ---- scripts ----------------------------------------------------------- */
html = html.replace(/[ \t]*<script src="([^"]+)"><\/script>\n?/g, (m, href) => {
  const file = path.resolve(dir, href);
  const js = fs.readFileSync(file, 'utf8');
  inlined.push(path.relative(ROOT, file));
  return `<script>\n/* ---- ${href} ---- */\n${js}</script>\n`;
});

const out = path.join(ROOT, 'previews', `${name}.html`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);

const kb = n => `${(n / 1024).toFixed(0)}KB`;
console.log(`${path.relative(ROOT, out)}  ${kb(Buffer.byteLength(html))}`);
for (const f of inlined) console.log(`  inlined  ${f}`);
/* Assets only. Ordinary <a href> point at pages the preview is not expected to
   carry, and flagging those trains you to ignore the warning. */
const left = [
  ...html.matchAll(/<(?:link|script|img|source)\b[^>]*\b(?:src|href)="(?!data:|https?:)([^"]+)"/g),
  /* `#n` / `%23n` are fragment references — an SVG filter pointing at a node in
     the same document, including inside an already-inlined data URI. */
  ...html.matchAll(/url\((?!["']?(?:data:|#|%23))["']?([^"')]+)["']?\)/g)
].map(m => m[1]);
if (left.length) {
  console.warn(`  WARNING: not self-contained, ${left.length} asset(s) still external:`);
  for (const f of new Set(left)) console.warn(`    ${f}`);
}
