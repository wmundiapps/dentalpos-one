// Aplica a identidade visual do salão (cores) ao painel e à página pública.
const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (r) => '#' + r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
export const luminance = (c) => { const [r, g, b] = hex(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

export function applyBrand(brand) {
  if (!brand?.colors) return;
  const { menu, accent, bg } = brand.colors;
  const root = document.documentElement.style;
  const lum = luminance(accent);
  const menuLight = luminance(menu) > 0.45;
  root.setProperty('--paper', bg);
  root.setProperty('--gold', lum > 0.35 ? mix(accent, '#000000', 0.18) : accent);      // texto e bordas sobre fundo claro
  root.setProperty('--gold-2', lum < 0.25 ? mix(accent, '#ffffff', 0.25) : accent);    // destaque sobre o menu
  root.setProperty('--gold-soft', mix(accent, '#ffffff', 0.86));
  root.setProperty('--night', menu);
  root.setProperty('--night-2', menuLight ? mix(menu, '#000000', 0.06) : mix(menu, '#ffffff', 0.08));
  root.setProperty('--night-line', menuLight ? mix(menu, '#000000', 0.12) : mix(menu, '#ffffff', 0.12));
  root.setProperty('--on-accent', lum > 0.4 ? '#1b1916' : '#ffffff');
  document.body.dataset.side = menuLight ? 'light' : 'dark';
  document.body.dataset.mode = brand.mode || 'masc';
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', menu);
}

export const waLink = (num, text = '') => `https://wa.me/${String(num).replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
export const mapsLink = (address, city) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([address, city].filter(Boolean).join(', '))}`;
