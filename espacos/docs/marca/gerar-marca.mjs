import opentype from 'opentype.js';
import fs from 'node:fs';
const OUT = process.argv[2];
const F = (w) => { const b = fs.readFileSync(new URL(`./node_modules/@fontsource/poppins/files/poppins-latin-${w}-normal.woff`, import.meta.url)); return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const bold = F(700), med = F(500);
const C = { deep: '#0a5f5e', mid: '#0e7c7b', bright: '#17a8a5', mint: '#8ff0e9', ink: '#0b3534', paper: '#f3fbfa' };

// texto → path SVG (sem depender de fonte instalada)
function text(font, str, size, x, y, fill, track = 0) {
  let cx = x, d = '';
  for (const ch of str) {
    const g = font.charToGlyph(ch);
    d += g.getPath(cx, y, size).toPathData(2);
    cx += g.advanceWidth * size / font.unitsPerEm + track;
  }
  return { svg: `<path d="${d}" fill="${fill}"/>`, width: cx - x - track };
}
function wordmark(x, y, size, a, b) {
  const s = text(bold, 'Space', size, x, y, a, -size * 0.01);
  const h = text(bold, 'Hour', size, x + s.width - size * 0.01, y, b, -size * 0.01);
  return { svg: s.svg + h.svg, width: s.width + h.width };
}

// Símbolos (caixa 100x100)
const grad = (id) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.deep}"/><stop offset="1" stop-color="${C.bright}"/></linearGradient></defs>`;
const sym = {
  // A · Porta com relógio: o espaço (porta) + a hora (relógio no arco)
  A: (bg = 'grad', fg = '#fff', acc = C.mid) => `${bg === 'grad' ? grad('gA') : ''}<rect width="100" height="100" rx="24" fill="${bg === 'grad' ? 'url(#gA)' : bg}"/>
    <path d="M29 84 V47 A21 21 0 0 1 71 47 V84 Z" fill="${fg}"/>
    <circle cx="50" cy="47" r="13.5" fill="${acc}"/>
    <path d="M50 47 V37.5 M50 47 L57.5 51" stroke="${fg}" stroke-width="3.6" stroke-linecap="round" fill="none"/>
    <circle cx="62.5" cy="68" r="2.8" fill="${acc}"/>`,
  // B · Agenda: grade de horários com um horário reservado
  B: (bg = 'grad', fg = '#fff', acc = C.mint) => `${bg === 'grad' ? grad('gB') : ''}<rect width="100" height="100" rx="24" fill="${bg === 'grad' ? 'url(#gB)' : bg}"/>
    ${[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => { const x = 22 + c * 20, y = 22 + r * 20; const on = r === 1 && c === 1; return on ? `<rect x="${x - 2}" y="${y - 2}" width="20" height="20" rx="5" fill="${acc}"/>` : `<rect x="${x + 1}" y="${y + 1}" width="14" height="14" rx="4" fill="none" stroke="${fg}" stroke-width="2.6" opacity=".85"/>`; })).join('')}`,
  // C · Pino com relógio: um espaço perto de você, na hora certa
  C: (bg = 'grad', fg = '#fff', acc = C.mid) => `${bg === 'grad' ? grad('gC') : ''}<rect width="100" height="100" rx="24" fill="${bg === 'grad' ? 'url(#gC)' : bg}"/>
    <path d="M50 86 C50 86 25 60 25 43 A25 25 0 0 1 75 43 C75 60 50 86 50 86 Z" fill="${fg}"/>
    <circle cx="50" cy="43" r="14" fill="${acc}"/>
    <path d="M50 43 V34 M50 43 L57 47" stroke="${fg}" stroke-width="3.6" stroke-linecap="round" fill="none"/>`,
};

const svg = (w, h, body, bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ''}${body}</svg>`;
const place = (s, x, y, size) => `<g transform="translate(${x} ${y}) scale(${size / 100})">${s}</g>`;

function horizontal(k, variant) {
  const dark = variant === 'escuro';
  const mono = variant === 'mono';
  const symbol = dark ? sym[k]('#ffffff', C.deep, k === 'B' ? C.bright : k === 'C' ? '#ffffff' : C.mid) : mono ? sym[k](C.ink, '#fff', C.ink) : sym[k]();
  const wm = wordmark(150, 92, 74, dark ? '#ffffff' : C.ink, dark ? C.mint : mono ? C.ink : C.mid);
  const w = Math.ceil(150 + wm.width + 20);
  return svg(w, 140, place(symbol, 10, 15, 110) + wm.svg);
}
function vertical(k) {
  const adv = (f, str, size) => [...str].reduce((a, ch) => a + f.charToGlyph(ch).advanceWidth * size / f.unitsPerEm - size * 0.01, 0);
  const wmw = adv(bold, 'SpaceHour', 60);
  const w = Math.ceil(Math.max(wmw, 160) + 40);
  const wm2 = wordmark((w - wmw) / 2, 250, 60, C.ink, C.mid);
  return svg(w, 280, place(sym[k](), (w - 160) / 2, 10, 160) + wm2.svg);
}
const files = {};
for (const k of ['A', 'B', 'C']) {
  files[`opcao-${k}-simbolo.svg`] = svg(512, 512, place(sym[k](), 0, 0, 512));
  files[`opcao-${k}-horizontal.svg`] = horizontal(k, 'cor');
  files[`opcao-${k}-horizontal-escuro.svg`] = horizontal(k, 'escuro');
  files[`opcao-${k}-horizontal-mono.svg`] = horizontal(k, 'mono');
  files[`opcao-${k}-vertical.svg`] = vertical(k);
}
for (const [n, s] of Object.entries(files)) fs.writeFileSync(`${OUT}/${n}`, s);
console.log(Object.keys(files).length, 'arquivos');
