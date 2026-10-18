import { randomUUID } from 'node:crypto';

export const uid = () => randomUUID();
export const nowIso = () => new Date().toISOString();

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// ---------- Validação enxuta ----------
// spec: { campo: 'str:1:120' | 'str?:0:500' | 'int:0:100000' | 'email' | 'phone' | 'bool' | 'date' | 'enum:a,b,c' | 'iso' }
// Sufixo ? = opcional. Retorna objeto limpo (só campos do spec).
export function validate(input, spec) {
  const out = {};
  const errors = {};
  const src = input && typeof input === 'object' ? input : {};
  for (const [key, rule] of Object.entries(spec)) {
    const [type, a, b] = rule.split(':');
    const optional = type.endsWith('?');
    const t = optional ? type.slice(0, -1) : type;
    let val = src[key];
    const empty = val === undefined || val === null || val === '';
    if (empty) {
      if (!optional) errors[key] = 'obrigatório';
      else out[key] = null;
      continue;
    }
    switch (t) {
      case 'str': {
        if (typeof val !== 'string') { errors[key] = 'texto inválido'; break; }
        val = cleanText(val);
        const min = Number(a ?? 0), max = Number(b ?? 500);
        if (val.length < min) errors[key] = `mínimo ${min} caracteres`;
        else if (val.length > max) errors[key] = `máximo ${max} caracteres`;
        else out[key] = val;
        break;
      }
      case 'int': {
        const n = Number(val);
        if (!Number.isInteger(n)) { errors[key] = 'número inteiro inválido'; break; }
        if (a !== undefined && n < Number(a)) errors[key] = `mínimo ${a}`;
        else if (b !== undefined && n > Number(b)) errors[key] = `máximo ${b}`;
        else out[key] = n;
        break;
      }
      case 'email': {
        const s = String(val).trim().toLowerCase();
        if (!/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(s) || s.length > 254) errors[key] = 'e-mail inválido';
        else out[key] = s;
        break;
      }
      case 'phone': {
        const p = normalizePhone(String(val));
        if (!p) errors[key] = 'telefone inválido (use DDD + número)';
        else out[key] = p;
        break;
      }
      case 'bool':
        out[key] = val === true || val === 1 || val === 'true' || val === '1' ? 1 : 0;
        break;
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(val)) || Number.isNaN(Date.parse(val))) errors[key] = 'data inválida (AAAA-MM-DD)';
        else out[key] = String(val);
        break;
      case 'iso':
        if (Number.isNaN(Date.parse(String(val)))) errors[key] = 'data/hora inválida';
        else out[key] = new Date(String(val)).toISOString();
        break;
      case 'enum': {
        const opts = (a || '').split(',');
        if (!opts.includes(String(val))) errors[key] = `valor inválido (${opts.join(', ')})`;
        else out[key] = String(val);
        break;
      }
      default:
        errors[key] = 'regra desconhecida';
    }
  }
  if (Object.keys(errors).length) throw new HttpError(422, 'Dados inválidos', { errors });
  return out;
}

// Remove caracteres de controle e normaliza espaços. Escape de HTML acontece na saída.
export function cleanText(s) {
  return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/‮/g, '').trim();
}

// Telefone BR → E.164 sem "+" (ex.: 5544999998888). Retorna null se inválido.
export function normalizePhone(raw) {
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (!/^55\d{10,11}$/.test(d)) return null;
  const ddd = Number(d.slice(2, 4));
  if (ddd < 11 || ddd > 99) return null;
  return d;
}

export function formatPhone(p) {
  if (!p) return '';
  const d = String(p).replace(/^55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return p;
}

export const brl = (cents) =>
  (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Datas e fuso horário ----------
// Converte "AAAA-MM-DD" + "HH:MM" no fuso do salão para ISO UTC.
export function zonedToUtc(dateStr, timeStr, tz = 'America/Sao_Paulo') {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const off = tzOffsetMs(new Date(guess), tz);
    guess = Date.UTC(y, m - 1, d, hh, mm) - off;
  }
  return new Date(guess).toISOString();
}

export function tzOffsetMs(date, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// Data local "AAAA-MM-DD" de um instante no fuso do salão
export function localDate(date, tz = 'America/Sao_Paulo') {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export function localHour(date, tz = 'America/Sao_Paulo') {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(date));
}

export function localWeekday(dateStr) {
  // 0=domingo ... 6=sábado
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function fmtDateTimeBR(iso, tz = 'America/Sao_Paulo') {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const json = (v, fallback = null) => {
  if (v === null || v === undefined || v === '') return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
};
