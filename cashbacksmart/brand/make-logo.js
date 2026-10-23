// Gera a logomarca Cashbacksmart em SVG (texto convertido em curvas) e PNGs.
const opentype = require('opentype.js');
const fs = require('fs');
const sharp = require('sharp');

const C = { ink: '#1B2A6B', coin: '#FFB627', green: '#12A150', white: '#FFFFFF' };
const font = opentype.parse(fs.readFileSync(require.resolve('@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff')));

// Símbolo: moeda com sorriso + seta circular de retorno, em caixa 100x100
function symbol(ink = C.ink, coin = C.coin, smile = C.ink) {
  const cx = 50, cy = 50, R = 36; // raio da seta
  const a0 = (-30 * Math.PI) / 180, a1 = (250 * Math.PI) / 180; // arco anti-horário de retorno
  const p = (a, r = R) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  // ponta da seta no fim do arco (a1), apontando na direção da tangente horária
  const tang = a1 + Math.PI / 2;
  const tip = [x1 + 13 * Math.cos(tang), y1 + 13 * Math.sin(tang)];
  const l = p(a1, R - 10), r = p(a1, R + 10);
  return `
  <path d="M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 1 1 ${x1.toFixed(2)} ${y1.toFixed(2)}" fill="none" stroke="${ink}" stroke-width="9" stroke-linecap="round"/>
  <path d="M ${l[0].toFixed(2)} ${l[1].toFixed(2)} L ${tip[0].toFixed(2)} ${tip[1].toFixed(2)} L ${r[0].toFixed(2)} ${r[1].toFixed(2)} Z" fill="${ink}" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/>
  <circle cx="${cx}" cy="${cy}" r="23" fill="${coin}"/>
  <circle cx="${cx}" cy="${cy}" r="17.5" fill="none" stroke="#FFFFFF" stroke-opacity=".55" stroke-width="2"/>
  <circle cx="43" cy="45" r="2.8" fill="${smile}"/><circle cx="57" cy="45" r="2.8" fill="${smile}"/>
  <path d="M 40.5 52.5 Q 50 62 59.5 52.5" fill="none" stroke="${smile}" stroke-width="3.6" stroke-linecap="round"/>`;
}

const WORDS = JSON.parse(fs.readFileSync(__dirname + '/words.json', 'utf8'));
function word(text, x, y, size, fill) {
  const w = WORDS[text];
  const k = size / 64;
  return { svg: `<path transform="translate(${x} ${y}) scale(${k})" fill="${fill}" d="${w.d}"/>`, width: w.width * k };
}

function horizontal({ ink = C.ink, coin = C.coin, accent = C.green, bg = null } = {}) {
  const w1 = word('cashback', 112, 68, 64, ink);
  const w2 = word('smart', 112 + w1.width + 2, 68, 64, accent);
  const W = Math.ceil(112 + w1.width + 2 + w2.width + 10);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 100" width="${W * 2}" height="200">
  ${bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : ''}
  <g>${symbol(ink, coin, C.ink)}</g>${w1.svg}${w2.svg}</svg>`;
}

function icon({ bg = C.ink, ink = C.white } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512">
  <rect width="100" height="100" rx="22" fill="${bg}"/>
  <g transform="translate(9 9) scale(.82)">${symbol(ink, C.coin, C.ink)}</g></svg>`;
}

const out = {
  'logo-horizontal.svg': horizontal(),
  'logo-horizontal-negativo.svg': horizontal({ ink: C.white, accent: C.coin, bg: C.ink }),
  'logo-simbolo.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512">${symbol()}</svg>`,
  'icone-app.svg': icon(),
  'icone-app-verde.svg': icon({ bg: C.green }),
};
fs.mkdirSync('out', { recursive: true });
(async () => {
  for (const [name, svg] of Object.entries(out)) {
    fs.writeFileSync('out/' + name, svg);
    await sharp(Buffer.from(svg), { density: 300 }).png().toFile('out/' + name.replace('.svg', '.png'));
  }
  console.log(Object.keys(out).join('\n'));
})();
module.exports = { symbol, C };
