import { z } from 'zod';

export const onlyDigits = (s: string) => s.replace(/\D/g, '');

export function validCpf(raw: string): boolean {
  const c = onlyDigits(raw);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(c[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

export function validCnpj(raw: string): boolean {
  const c = onlyDigits(raw);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = w.reduce((a, n, i) => a + n * Number(c[i]), 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}

/** Placa antiga (ABC1234) ou Mercosul (ABC1D23). */
export const normalizePlate = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const validPlate = (p: string) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizePlate(p));

/** Telefone brasileiro com DDD (10 ou 11 dígitos, DDI 55 opcional); devolve só dígitos com 55. */
export function normalizePhone(raw: string): string | null {
  let d = onlyDigits(raw);
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return null;
  return '55' + d;
}

/** Texto livre: sem caracteres de controle, sem tags, tamanho limitado. */
export const text = (max: number) =>
  z.string().max(max).transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/[<>]/g, '').trim());

export const money = z.number().int().min(0).max(100_000_000);
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const isoDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/);
export const uuid = z.string().uuid();

const COMMON = ['1234567890', 'senha12345', 'password12', 'lavacar123', 'lavapos123', 'qwertyuiop', '12345678910'];
/** Senha: 10+ caracteres, letra e número, fora da lista de senhas comuns. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return 'A senha precisa ter pelo menos 10 caracteres.';
  if (pw.length > 128) return 'A senha é longa demais.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Use letras e números na senha.';
  if (COMMON.includes(pw.toLowerCase()) || /^(.)\1+$/.test(pw)) return 'Essa senha é muito comum. Escolha outra.';
  return null;
}
