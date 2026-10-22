import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteConfig } from '../site.config.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const pages = ['index.html', 'guide/index.html', 'privacy/index.html', '404.html'];
const documents = new Map(await Promise.all(pages.map(async page => [page, await readFile(path.join(root, page), 'utf8')])));
let checked = 0;
for (const [page, html] of documents) {
  if (!html.includes('lang="ko"') || !html.includes('name="viewport"')) throw new Error(`Missing Korean language or viewport: ${page}`);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate element ID: ${page}`);
  for (const [, raw] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|data:)/.test(raw)) continue;
    const [pathname, fragment] = raw.split('#');
    const resolved = pathname.startsWith('/') ? pathname.slice(1) : path.posix.join(path.posix.dirname(page), pathname || path.posix.basename(page));
    const target = resolved.endsWith('/') || !resolved ? `${resolved}index.html` : resolved;
    await access(path.join(root, target));
    if (fragment && !target.endsWith('.svg')) {
      const content = documents.get(target) ?? await readFile(path.join(root, target), 'utf8');
      if (!content.includes(`id="${fragment}"`)) throw new Error(`Broken fragment ${raw} in ${page}`);
    }
    checked++;
  }
}
const app = await readFile(path.join(root, 'app.js'), 'utf8');
for (const [, src] of app.matchAll(/src: '(\/assets\/[^']+)'/g)) await access(path.join(root, src.slice(1)));
if (siteConfig.chromeWebStoreUrl) {
  const url = new URL(siteConfig.chromeWebStoreUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'chromewebstore.google.com' || !url.pathname.startsWith('/detail/')) throw new Error('Invalid Chrome Web Store URL');
}
const vercel = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'));
if (vercel.outputDirectory !== 'dist' || vercel.buildCommand !== 'npm run build') throw new Error('Unexpected Vercel build configuration');
console.log(`Checked ${pages.length} pages, ${checked} local references, gallery assets and Vercel configuration.`);
