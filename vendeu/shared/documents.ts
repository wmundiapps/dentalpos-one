// Validação de CPF/CNPJ (dígitos verificadores) e normalizações usadas no cadastro.

export const onlyDigits = (v: string) => v.replace(/\D/g, '');

function allEqual(d: string) { return /^(\d)\1+$/.test(d); }

export function isValidCpf(raw: string): boolean {
  const d = onlyDigits(raw);
  if (d.length !== 11 || allEqual(d)) return false;
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const dv = ((sum * 10) % 11) % 10;
    if (dv !== Number(d[len])) return false;
  }
  return true;
}

export function isValidCnpj(raw: string): boolean {
  const d = onlyDigits(raw);
  if (d.length !== 14 || allEqual(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export const isValidCep = (v: string) => onlyDigits(v).length === 8;

/** Telefone brasileiro: DDD + 8 ou 9 dígitos (aceita +55). Devolve só dígitos com 55, ou null. */
export function normalizePhoneBR(raw: string): string | null {
  let d = onlyDigits(raw);
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  if (d.length === 11 && d[2] !== '9') return null;
  return `55${d}`;
}

export const maskCpf = (v: string) => { const d = onlyDigits(v); return d.length === 11 ? `***.${d.slice(3, 6)}.***-${d.slice(9)}` : '***'; };
export const maskCnpj = (v: string) => { const d = onlyDigits(v); return d.length === 14 ? `**.***.${d.slice(5, 8)}/${d.slice(8, 12)}-**` : '***'; };
export const maskDoc = (v: string) => (onlyDigits(v).length === 14 ? maskCnpj(v) : maskCpf(v));
