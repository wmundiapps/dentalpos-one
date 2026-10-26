// Kit da rede: códigos assinados dos cartões (paciente / credenciado) e cartões em SVG.
// Sem dependências: o QR (SVG) e a logo chegam prontos de quem chama.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

/* ---------------------------------------------------------------- códigos */

// Base32 de Crockford (sem I, L, O, U): fácil de ditar e de digitar.
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const secret = () => process.env.CARD_SECRET || process.env.SESSION_SECRET || '';

function sig(type, ref, yymm) {
  const key = secret();
  if (!key) throw new Error('CARD_SECRET/SESSION_SECRET ausente');
  const h = createHmac('sha256', key).update(`${type}|${ref}|${yymm}`).digest();
  let out = '';
  for (let i = 0; i < 8; i++) out += B32[h[i] % 32];
  return out;
}

export const CARD_TYPES = { ASP: 'Paciente da rede AlignSystem', ASC: 'Profissional credenciado AlignSystem' };

// yyyy-mm → "2712"
export function yymmOf(ym) {
  const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
  if (!m || +m[2] < 1 || +m[2] > 12) return null;
  return m[1].slice(2) + m[2];
}

export const patientRef = (caseCode) => String(caseCode).replace(/\D/g, '').padStart(6, '0').slice(-6);
export const dentistRef = (uuid) => String(uuid).replace(/-/g, '').slice(0, 8).toUpperCase();

export function makeCode(type, ref, ym) {
  const yymm = yymmOf(ym);
  if (!CARD_TYPES[type] || !ref || !yymm) throw new Error('dados do cartão inválidos');
  return `${type}-${ref}-${yymm}-${sig(type, ref, yymm)}`;
}

// Aceita o código puro ou o link do QR (…/validar?c=CODIGO).
export function parseCode(raw) {
  let c = String(raw || '').trim();
  const q = c.match(/[?&]c=([^&#\s]+)/i);
  if (q) { try { c = decodeURIComponent(q[1]); } catch { return null; } }
  c = c.toUpperCase().replace(/\s+/g, '');
  const m = c.match(/^(ASP|ASC)-([0-9A-F]{6,8})-(\d{2})(\d{2})-([0-9A-Z]{8})$/);
  if (!m) return null;
  const [, type, ref, yy, mm, s] = m;
  if (type === 'ASP' && !/^\d{6}$/.test(ref)) return null;
  if (type === 'ASC' && !/^[0-9A-F]{8}$/.test(ref)) return null;
  const expected = sig(type, ref, yy + mm);
  const ok = s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected));
  if (!ok) return { type, ref, valid: false };
  const year = 2000 + Number(yy), month = Number(mm);
  const now = new Date();
  const expired = year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1);
  return { type, ref, valid: true, expired, validUntil: `${String(month).padStart(2, '0')}/${year}`, code: c };
}

// Nome para mostrar a terceiros na validação (LGPD): primeiro nome + iniciais.
export function maskName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return [parts[0], ...parts.slice(1).filter((p) => p.length > 2).map((p) => p[0].toUpperCase() + '.')].join(' ');
}

/* ---------------------------------------------------------------- SVG */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SANS = "Inter, 'Helvetica Neue', Arial, sans-serif";
const MONO = "'IBM Plex Mono', Menlo, Consolas, monospace";
export const COLORS = { navy: '#12233A', emerald: '#157A6E', emeraldDark: '#0E5A51', honey: '#C98A2C', cream: '#FAF6EF', line: '#E1D8C5', ink60: '#5E6878' };

let logos = null;
function logo(kind) {
  if (!logos) {
    const read = (f) => { try { return 'data:image/svg+xml;base64,' + readFileSync(new URL(`./kit-assets/${f}`, import.meta.url)).toString('base64'); } catch { return ''; } };
    logos = { branca: read('logo-branca.svg'), cor: read('logo-cor.svg') };
  }
  return logos[kind];
}
// A logo tem proporção 482 × 80.
function logoImg(kind, x, y, w) {
  const href = logo(kind);
  const h = Math.round((w * 80) / 482);
  if (!href) return `<text x="${x}" y="${y + h * 0.8}" font-family="${SANS}" font-size="${h * 0.8}" font-weight="700" fill="${kind === 'branca' ? '#fff' : COLORS.navy}">AlignSystem</text>`;
  return `<image href="${href}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
}

// Encaixa um QR (SVG completo vindo do pacote qrcode) numa posição.
function qrAt(qrSvg, x, y, size) {
  if (!qrSvg) return '';
  const inner = qrSvg.replace(/<\?xml[^>]*>/, '').replace(/<svg\b([^>]*)>/, (m, attrs) => `<svg${attrs.replace(/\s(width|height|x|y)="[^"]*"/g, '')} x="${x}" y="${y}" width="${size}" height="${size}" shape-rendering="crispEdges">`);
  return inner;
}

// Corta texto longo para caber (aproximação pela média de largura das letras).
function fit(text, maxPx, fontPx, ratio = 0.56) {
  const t = String(text || '');
  const max = Math.floor(maxPx / (fontPx * ratio));
  return t.length > max ? t.slice(0, Math.max(1, max - 1)).trimEnd() + '…' : t;
}
const svgOpen = (w, h, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"${extra}>`;

/* Cartão da rede no tamanho CR80 (85,6 × 54 mm) a 300 dpi: 1012 × 638. */
export function networkCardSVG({ kind, name, lines = [], code, validUntil, qrSvg, footnote }) {
  const W = 1012, H = 638;
  const bg = kind === 'ASC' ? COLORS.emeraldDark : COLORS.navy;
  const label = kind === 'ASC' ? ['PROFISSIONAL', 'CREDENCIADO'] : ['PACIENTE', 'DA REDE'];
  const ls = lines.filter(Boolean).slice(0, 2).map((l, i) => `<text x="56" y="${392 + i * 34}" font-family="${SANS}" font-size="26" fill="#fff" fill-opacity=".86">${esc(fit(l, 560, 26))}</text>`).join('');
  return `${svgOpen(W, H)}
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>
<clipPath id="r"><rect width="${W}" height="${H}" rx="40"/></clipPath></defs>
<g clip-path="url(#r)"><rect width="${W}" height="${H}" fill="${bg}"/><rect width="${W}" height="${H}" fill="url(#g)"/>
<circle cx="${W - 70}" cy="-60" r="250" fill="none" stroke="#fff" stroke-opacity=".07" stroke-width="70"/>
<rect x="0" y="${H - 14}" width="${W}" height="14" fill="${COLORS.honey}"/></g>
${logoImg('branca', 56, 52, 300)}
<text x="${W - 56}" y="78" text-anchor="end" font-family="${SANS}" font-size="20" font-weight="800" letter-spacing="4" fill="#fff" fill-opacity=".92">${label[0]}</text>
<text x="${W - 56}" y="106" text-anchor="end" font-family="${SANS}" font-size="20" font-weight="800" letter-spacing="4" fill="#fff" fill-opacity=".92">${label[1]}</text>
<text x="56" y="350" font-family="${SANS}" font-size="44" font-weight="700" fill="#fff">${esc(fit(name, 600, 44))}</text>
${ls}
<text x="56" y="510" font-family="${MONO}" font-size="30" font-weight="600" letter-spacing="2" fill="#fff">${esc(code)}</text>
<text x="56" y="560" font-family="${SANS}" font-size="16" font-weight="700" letter-spacing="3" fill="#fff" fill-opacity=".7">VÁLIDO ATÉ</text>
<text x="210" y="560" font-family="${SANS}" font-size="22" font-weight="600" fill="#fff">${esc(validUntil)}</text>
<rect x="${W - 292}" y="${H - 330}" width="236" height="236" rx="18" fill="#fff"/>
${qrAt(qrSvg, W - 274, H - 312, 200)}
${footnote ? `<text x="${W - 174}" y="${H - 66}" text-anchor="middle" font-family="${SANS}" font-size="14" fill="#fff" fill-opacity=".8">${esc(footnote)}</text>` : ''}
</svg>`;
}

/* Cartão de visita digital. h: 1050 × 600 (3,5 × 2 pol a 300 dpi). v: 810 × 1440 (celular). */
export function businessCardSVG({ orient = 'h', eyebrow, name, role, badge, lines = [], qrSvg, qrCaption }) {
  const L = lines.filter((l) => l && l[1]);
  if (orient === 'v') {
    const W = 810, H = 1440;
    const rows = L.slice(0, 5).map((l, i) => `<text x="${W / 2}" y="${880 + i * 70}" text-anchor="middle" font-family="${SANS}" font-size="18" font-weight="800" letter-spacing="3" fill="${COLORS.emerald}">${esc(l[0])}</text><text x="${W / 2}" y="${910 + i * 70}" text-anchor="middle" font-family="${SANS}" font-size="28" fill="${COLORS.navy}">${esc(fit(l[1], 700, 28, 0.52))}</text>`).join('');
    return `${svgOpen(W, H)}<rect width="${W}" height="${H}" fill="${COLORS.cream}"/><rect width="${W}" height="330" fill="${COLORS.navy}"/>${logoImg('branca', 165, 130, 480)}
<text x="${W / 2}" y="470" text-anchor="middle" font-family="${SANS}" font-size="20" font-weight="800" letter-spacing="4" fill="${COLORS.emerald}">${esc(fit(String(eyebrow || '').toUpperCase(), 700, 20, 0.72))}</text>
<text x="${W / 2}" y="560" text-anchor="middle" font-family="${SANS}" font-size="58" font-weight="800" fill="${COLORS.navy}">${esc(fit(name, 720, 58))}</text>
<text x="${W / 2}" y="620" text-anchor="middle" font-family="${SANS}" font-size="${String(role || '').length > 40 ? 26 : 30}" fill="${COLORS.ink60}">${esc(fit(role, 740, String(role || '').length > 40 ? 26 : 30, 0.5))}</text>
${badge ? `<rect x="${W / 2 - 170}" y="650" width="340" height="52" rx="10" fill="none" stroke="${COLORS.emerald}" stroke-width="2"/><text x="${W / 2}" y="686" text-anchor="middle" font-family="${MONO}" font-size="26" font-weight="600" fill="${COLORS.emerald}">${esc(fit(badge, 320, 26, 0.6))}</text>` : ''}
${rows}
${qrSvg ? `<rect x="${W / 2 - 110}" y="${H - 300}" width="220" height="220" rx="14" fill="#fff" stroke="${COLORS.line}"/>${qrAt(qrSvg, W / 2 - 92, H - 282, 184)}<text x="${W / 2}" y="${H - 48}" text-anchor="middle" font-family="${SANS}" font-size="18" font-weight="700" letter-spacing="3" fill="${COLORS.ink60}">${esc(String(qrCaption || '').toUpperCase())}</text>` : ''}
<rect x="0" y="${H - 14}" width="${W}" height="14" fill="${COLORS.honey}"/></svg>`;
  }
  const W = 1050, H = 600;
  const rows = L.slice(0, 4).map((l, i) => `<text x="360" y="${430 + i * 38}" font-family="${SANS}" font-size="15" font-weight="800" letter-spacing="2" fill="${COLORS.emerald}">${esc(l[0])}</text><text x="490" y="${430 + i * 38}" font-family="${SANS}" font-size="23" fill="${COLORS.navy}">${esc(fit(l[1], qrSvg ? 330 : 520, 23, 0.52))}</text>`).join('');
  return `${svgOpen(W, H)}<rect width="${W}" height="${H}" fill="${COLORS.cream}"/><rect width="300" height="${H}" fill="${COLORS.navy}"/>
${logoImg('branca', 30, 270, 240)}
<text x="360" y="110" font-family="${SANS}" font-size="18" font-weight="800" letter-spacing="4" fill="${COLORS.emerald}">${esc(fit(String(eyebrow || '').toUpperCase(), 640, 18, 0.72))}</text>
<text x="360" y="180" font-family="${SANS}" font-size="50" font-weight="800" fill="${COLORS.navy}">${esc(fit(name, 640, 50))}</text>
<text x="360" y="228" font-family="${SANS}" font-size="27" fill="${COLORS.ink60}">${esc(fit(role, 660, 27, 0.5))}</text>
${badge ? `<rect x="360" y="252" width="${Math.min(420, 28 + badge.length * 16)}" height="44" rx="8" fill="none" stroke="${COLORS.emerald}" stroke-width="2"/><text x="374" y="282" font-family="${MONO}" font-size="23" font-weight="600" fill="${COLORS.emerald}">${esc(fit(badge, 390, 23, 0.6))}</text>` : ''}
${rows}
${qrSvg ? `<rect x="${W - 222}" y="${H - 222}" width="186" height="186" rx="12" fill="#fff" stroke="${COLORS.line}"/>${qrAt(qrSvg, W - 207, H - 207, 156)}` : ''}
<rect x="300" y="${H - 12}" width="${W - 300}" height="12" fill="${COLORS.honey}"/></svg>`;
}

/* Lembrete de consulta, 1080 × 1350 (4:5, feed e WhatsApp). */
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
// Partes da data no fuso de São Paulo, sem depender do fuso do servidor.
export function spParts(date) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false });
  const p = Object.fromEntries(f.formatToParts(new Date(date)).map((x) => [x.type, x.value]));
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  return { y: +p.year, m: +p.month, d: +p.day, hh: p.hour === '24' ? '00' : p.hour, mi: p.minute, weekday: DIAS[wd], month: MESES[+p.month - 1] };
}
export const REMINDER_KINDS = { confirmacao: 'Agendamento confirmado', lembrete24: 'Lembrete: sua consulta é amanhã', lembretedia: 'Lembrete: sua consulta é hoje', reagendamento: 'Consulta reagendada' };
export const APPT_KINDS = { teleorientacao: 'Teleorientação por vídeo', documentacao: 'Documentação ortodôntica', consulta: 'Consulta' };

export function reminderSVG({ tipo, patient, startsAt, apptKind, dentist, place, contact }) {
  const W = 1080, H = 1350; const t = spParts(startsAt);
  const first = String(patient || '').trim().split(/\s+/)[0] || '';
  const rows = [['PACIENTE', patient], ['TIPO', APPT_KINDS[apptKind] || apptKind], ['PROFISSIONAL', dentist], ['LOCAL', place]].filter((r) => r[1]);
  const dl = rows.map((r, i) => `<text x="80" y="${820 + i * 74}" font-family="${SANS}" font-size="22" font-weight="800" letter-spacing="3" fill="${COLORS.ink60}">${r[0]}</text><text x="340" y="${820 + i * 74}" font-family="${SANS}" font-size="32" font-weight="600" fill="${COLORS.navy}">${esc(fit(r[1], 680, 32, 0.54))}</text>`).join('');
  return `${svgOpen(W, H)}<rect width="${W}" height="${H}" fill="#fff"/><rect width="${W}" height="190" fill="${COLORS.navy}"/>${logoImg('branca', 80, 62, 400)}
<text x="80" y="300" font-family="${SANS}" font-size="26" font-weight="800" letter-spacing="5" fill="${COLORS.emerald}">${esc(String(REMINDER_KINDS[tipo] || REMINDER_KINDS.confirmacao).toUpperCase())}</text>
<text x="80" y="356" font-family="${SANS}" font-size="40" font-weight="600" fill="${COLORS.ink60}">${esc(first)}, ${esc(t.weekday)}</text>
<text x="72" y="590" font-family="${SANS}" font-size="230" font-weight="800" letter-spacing="-8" fill="${COLORS.emerald}">${String(t.d).padStart(2, '0')}</text>
<text x="390" y="520" font-family="${SANS}" font-size="44" font-weight="800" letter-spacing="2" fill="${COLORS.navy}">${esc(t.month.toUpperCase())}</text>
<text x="390" y="578" font-family="${SANS}" font-size="44" font-weight="800" letter-spacing="2" fill="${COLORS.navy}">${t.y}</text>
<text x="${W - 80}" y="470" text-anchor="end" font-family="${SANS}" font-size="22" font-weight="800" letter-spacing="4" fill="${COLORS.ink60}">HORÁRIO</text>
<text x="${W - 80}" y="580" text-anchor="end" font-family="${MONO}" font-size="104" font-weight="600" fill="${COLORS.navy}">${t.hh}:${t.mi}</text>
<rect x="80" y="680" width="${W - 160}" height="3" fill="${COLORS.line}"/>
${dl}
<rect x="0" y="${H - 170}" width="${W}" height="170" fill="${COLORS.emeraldDark}"/>
<text x="80" y="${H - 95}" font-family="${SANS}" font-size="32" fill="#fff">Responda <tspan font-weight="800">1</tspan> para confirmar ou <tspan font-weight="800">2</tspan> para reagendar</text>
<text x="80" y="${H - 48}" font-family="${SANS}" font-size="26" fill="#fff" fill-opacity=".8">${esc(contact || '')}</text>
</svg>`;
}
