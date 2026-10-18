// Monta a pasta dist/ (site público): landing na raiz, demonstração em /demo, cards em /cards.
// Uso: node scripts/build-site.mjs   (sem dependências)
import { cpSync, mkdirSync, rmSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

cpSync(join(root, 'landing'), dist, { recursive: true });                  // /, /fonts, /termos.html ...
cpSync(join(root, 'demo'), join(dist, 'demo'), { recursive: true });       // /demo
mkdirSync(join(dist, 'painel'), { recursive: true });
cpSync(join(root, 'demo', 'painel'), join(dist, 'painel'), { recursive: true }); // /painel (usado pela demo via ../painel)
rmSync(join(dist, 'demo', 'painel'), { recursive: true, force: true });

// Galeria de cards para baixar
mkdirSync(join(dist, 'cards'), { recursive: true });
const pngs = existsSync(join(root, 'ads', 'out')) ? readdirSync(join(root, 'ads', 'out')).filter((f) => f.endsWith('.png')) : [];
for (const f of pngs) cpSync(join(root, 'ads', 'out', f), join(dist, 'cards', f));
const groups = [...new Set(pngs.map((f) => f.split('_')[0]))];
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Cards — Studio Beauty Barber</title>
<style>body{margin:0;font:15px/1.5 system-ui,sans-serif;background:#14110f;color:#f1ebe0;padding:24px}h1{font:600 28px Georgia,serif}h2{margin:28px 0 8px;color:#c9a66b;text-transform:capitalize}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}a{color:inherit;text-decoration:none}img{width:100%;border-radius:8px;border:1px solid #352e27;display:block}small{color:#a79d8e}</style></head><body>
<h1>Cards de divulgação</h1><p>Clique para abrir e salvar a imagem no tamanho original. Feed 1:1 e 4:5, Stories 9:16, Link 1,91:1 e Google 1:1.</p>
${groups.map((g) => `<h2>${g}</h2><div class="g">${pngs.filter((f) => f.startsWith(g + '_')).map((f) => `<a href="${f}"><img src="${f}" alt="${f}" loading="lazy"><small>${f.replace('.png', '')}</small></a>`).join('')}</div>`).join('')}
</body></html>`;
writeFileSync(join(dist, 'cards', 'index.html'), html);

// Cabeçalhos de segurança do site estático (CSP estrita: sem scripts inline)
const base = JSON.parse((await import('node:fs')).readFileSync(join(root, 'landing', 'vercel.json'), 'utf8'));
base.cleanUrls = false;
writeFileSync(join(dist, 'vercel.json'), JSON.stringify(base, null, 2));
console.log(`dist/ pronto: ${pngs.length} cards, demo e landing.`);
