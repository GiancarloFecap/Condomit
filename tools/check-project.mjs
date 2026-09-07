import { readdir, readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, extname, join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (m) => m.slice(1)));
const ignoredDirs = new Set(['node_modules', '.git', 'www', 'android', 'ios']);
const errors = [];
let htmlCount = 0;
let jsCount = 0;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(path)); else out.push(path);
  }
  return out;
}

const files = await walk(root);
const localRefRegex = /(?:src|href)=["']([^"']+)["']/gi;
for (const file of files) {
  const ext = extname(file).toLowerCase();
  if (ext === '.js') {
    jsCount++;
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) errors.push(`JS inválido: ${file}\n${result.stderr}`);
    const content = await readFile(file, 'utf8');
    if (content.includes('127.0.0.1:7777/event')) errors.push(`Debug local restante: ${file}`);
    if (content.includes('coresg-normal.trae.ai')) errors.push(`Dependência de imagem temporária restante: ${file}`);
    if (content.includes('Logo-Lado.png')) errors.push(`Referência com capitalização incompatível com Linux/Netlify: ${file}`);
    if (/password\s*!==\s*condominium\.condominium_name/.test(content)) errors.push(`Comparação insegura de senha com nome do condomínio: ${file}`);
  }
  if (ext !== '.html') continue;
  htmlCount++;
  const content = await readFile(file, 'utf8');
  let match;
  while ((match = localRefRegex.exec(content))) {
    const ref = match[1].split('#')[0].split('?')[0];
    if (!ref || /^(?:https?:|mailto:|tel:|data:|javascript:|#)/i.test(ref)) continue;
    const target = ref.startsWith('/') ? join(root, ref) : resolve(dirname(file), ref);
    try { await access(target); } catch { errors.push(`Referência ausente em ${file}: ${ref}`); }
  }
}

for (const required of ['capacitor.config.ts', 'manifest.webmanifest', 'service-worker.js', 'privacidade.html', 'excluir-conta.html', 'suporte.html']) {
  try { await access(join(root, required)); } catch { errors.push(`Arquivo obrigatório ausente: ${required}`); }
}

if (errors.length) {
  console.error(`[Condomit check] ${errors.length} problema(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`[Condomit check] OK — ${htmlCount} HTMLs e ${jsCount} JavaScripts verificados.`);
