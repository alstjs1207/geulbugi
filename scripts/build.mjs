import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'dist');
const files = ['index.html', '404.html', 'styles.css', 'app.js', 'motion.js', 'site.config.js', 'robots.txt', 'guide', 'privacy', 'assets'];
await mkdir(out, { recursive: true });
for (const file of files) await cp(path.join(root, file), path.join(out, file), { recursive: true });

// Only add a canonical domain once the owner has chosen the production URL.
if (process.env.SITE_URL) {
  const url = new URL(process.env.SITE_URL);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('SITE_URL must be a plain HTTPS origin, for example https://example.com');
  const base = url.origin;
  const routes = ['', 'guide/', 'privacy/'];
  for (const route of routes) {
    const target = path.join(out, route, 'index.html');
    const canonical = `${base}/${route}`;
    let html = await readFile(target, 'utf8');
    html = html.replace('</head>', `<link rel="canonical" href="${canonical}"><meta property="og:url" content="${canonical}"></head>`);
    html = html.replace('content="/assets/social.png"', `content="${base}/assets/social.png"`);
    await writeFile(target, html);
  }
  const escapeXml = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  await writeFile(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map(route => `<url><loc>${escapeXml(`${base}/${route}`)}</loc></url>`).join('')}</urlset>`);
  await writeFile(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
} else {
  // Avoid retaining a sitemap from a previous build with a different domain.
  const { rm } = await import('node:fs/promises');
  await rm(path.join(out, 'sitemap.xml'), { force: true });
}
console.log(`Static site built: ${out}`);
