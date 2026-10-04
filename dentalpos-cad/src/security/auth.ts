// Autenticação local em 2 etapas: senha (PBKDF2) + código TOTP (app autenticador) + códigos de recuperação.
// Tudo fica no navegador; os dados do caso são cifrados (AES-GCM) com chave derivada da senha.
import { base32Encode, base32Decode, decryptText, deriveAesKey, encryptText, fromB64, hashPassword, otpauthUri, randomBytes, safeEqual, sha256Hex, toB64, verifyTotp } from "./crypto";

const KEY = "dpcad:auth:v1";
export const AUTOSAVE_KEY = "dentalpos-cad:autosave:enc";
interface Stored { salt: string; pw: string; secretEnc: string; recovery: string[]; lastStep: number; fails: number; lockUntil: number; confirmed: boolean }

const read = (): Stored | null => { try { const j = localStorage.getItem(KEY); return j ? (JSON.parse(j) as Stored) : null; } catch { return null; } };
const write = (s: Stored) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* cota */ } };

let aesKey: CryptoKey | null = null;
let autosavePlain: string | null = null;
export const isConfigured = () => !!read()?.confirmed;
export const isUnlocked = () => aesKey !== null;
export const lock = () => { aesKey = null; autosavePlain = null; };
export const getAutosave = () => autosavePlain;
export async function putAutosave(json: string) { if (!aesKey) return; try { localStorage.setItem(AUTOSAVE_KEY, await encryptText(aesKey, json)); } catch { /* cota */ } }
export const lockedOutSeconds = () => Math.max(0, Math.ceil(((read()?.lockUntil ?? 0) - Date.now()) / 1000));

export function validatePassword(p: string): string | null {
  if (p.length < 10) return "Use ao menos 10 caracteres.";
  if (!/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/\d/.test(p)) return "Misture letras maiúsculas, minúsculas e números.";
  if (/^(.)\1+$/.test(p) || /(1234|senha|password|qwerty)/i.test(p)) return "Senha previsível.";
  return null;
}
const genRecovery = () => Array.from({ length: 8 }, () => { const b = randomBytes(5); return base32Encode(b).slice(0, 8).replace(/(.{4})/, "$1-"); });

export interface PendingSetup { secretB32: string; uri: string; recovery: string[] }
let pending: { salt: Uint8Array; pw: string; secret: Uint8Array; secretEnc: string; recovery: string[]; recoveryHash: string[]; key: CryptoKey } | null = null;

/** etapa 1: cria senha + segredo TOTP + códigos de recuperação (ainda não ativos até confirmar um código) */
export async function beginSetup(password: string, account: string): Promise<PendingSetup> {
  const bad = validatePassword(password); if (bad) throw new Error(bad);
  const salt = randomBytes(16), secret = randomBytes(20);
  const key = await deriveAesKey(password, salt);
  const recovery = genRecovery();
  const recoveryHash = await Promise.all(recovery.map((r) => sha256Hex(toB64(salt) + r.replace("-", ""))));
  pending = { salt, pw: await hashPassword(password, salt), secret, secretEnc: await encryptText(key, toB64(secret)), recovery, recoveryHash, key };
  const b32 = base32Encode(secret);
  return { secretB32: b32, uri: otpauthUri(b32, account || "usuario"), recovery };
}
/** etapa 2: confirma com um código do autenticador e ativa */
export async function confirmSetup(code: string): Promise<boolean> {
  if (!pending) return false;
  const v = await verifyTotp(pending.secret, code);
  if (!v.ok) return false;
  write({ salt: toB64(pending.salt), pw: pending.pw, secretEnc: pending.secretEnc, recovery: pending.recoveryHash, lastStep: v.step, fails: 0, lockUntil: 0, confirmed: true });
  aesKey = pending.key; pending = null;
  autosavePlain = null;
  return true;
}

export type LoginResult = { ok: true; recoveryUsed?: boolean } | { ok: false; error: string; wait?: number };
export async function login(password: string, code: string): Promise<LoginResult> {
  const s = read(); if (!s?.confirmed) return { ok: false, error: "Autenticação não configurada." };
  const wait = lockedOutSeconds(); if (wait > 0) return { ok: false, error: `Muitas tentativas. Aguarde ${wait} s.`, wait };
  const fail = (msg: string): LoginResult => {
    s.fails += 1; if (s.fails >= 3) s.lockUntil = Date.now() + Math.min(15 * 60_000, 2 ** (s.fails - 2) * 1000 * 5);
    write(s); return { ok: false, error: msg, wait: lockedOutSeconds() };
  };
  const salt = fromB64(s.salt);
  const h = await hashPassword(password, salt);
  if (!safeEqual(h, s.pw)) return fail("Senha ou código inválido.");
  const key = await deriveAesKey(password, salt);
  let secret: Uint8Array;
  try { secret = fromB64(await decryptText(key, s.secretEnc)); } catch { return fail("Senha ou código inválido."); }
  let recoveryUsed = false;
  const v = await verifyTotp(secret, code, Date.now(), s.lastStep);
  if (v.ok) s.lastStep = v.step;
  else {
    const rh = await sha256Hex(s.salt + code.replace(/[\s-]/g, "").toUpperCase());
    const i = s.recovery.indexOf(rh);
    if (i < 0) return fail("Senha ou código inválido.");
    s.recovery.splice(i, 1); recoveryUsed = true; // código de recuperação é de uso único
  }
  s.fails = 0; s.lockUntil = 0; write(s);
  aesKey = key;
  try { const packed = localStorage.getItem(AUTOSAVE_KEY); autosavePlain = packed ? await decryptText(key, packed) : null; } catch { autosavePlain = null; }
  return { ok: true, recoveryUsed };
}
/** esqueci tudo: apaga credenciais e dados locais cifrados (irreversível) */
export function wipeAll() { lock(); try { localStorage.removeItem(KEY); localStorage.removeItem(AUTOSAVE_KEY); localStorage.removeItem("dentalpos-cad:autosave"); } catch { /* ignora */ } }
export { base32Decode };
