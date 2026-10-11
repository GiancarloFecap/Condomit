import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(mobileDir, '..');
const out = join(root, 'www');

const folders = ['assets', 'pages', 'scripts', 'styles'];
const rootFiles = ['inicio.html', 'robots.txt', 'sitemap.xml', 'manifest.webmanifest', 'service-worker.js', 'privacidade.html', 'suporte.html', 'excluir-conta.html', 'favicon.ico'];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const folder of folders) {
  await cp(join(root, folder), join(out, folder), { recursive: true });
}
for (const file of rootFiles) {
  await cp(join(root, file), join(out, file));
}

// Capacitor exige index.html no webDir; use o mesmo HTML público, inclusive SEO.
const index = await readFile(join(root, 'index.html'), 'utf8');
await writeFile(join(out, 'index.html'), index, 'utf8');

console.log(`[Condomit] Web bundle mobile criado em ${out}`);
