// Copia os documentos legais (docs/legal/*.md) para public/legal, de onde a tela os exibe.
import fs from 'node:fs';
import path from 'node:path';
const src = path.resolve(import.meta.dirname, '../../docs/legal');
const dst = path.resolve(import.meta.dirname, '../public/legal');
fs.mkdirSync(dst, { recursive: true });
for (const f of fs.readdirSync(src).filter((x) => x.endsWith('.md'))) fs.copyFileSync(path.join(src, f), path.join(dst, f));
console.log('documentos legais copiados');
