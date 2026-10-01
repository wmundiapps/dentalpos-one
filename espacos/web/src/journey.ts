// Para onde voltar depois de um passo da jornada (cadastro, confirmar e-mail, verificação).

/** Só aceita caminhos internos do site ("/reservar/..."), nunca outro domínio. */
export function safePath(p: string | null | undefined): string | null {
  if (!p || !p.startsWith('/') || p.startsWith('//') || p.startsWith('/\\')) return null;
  return p;
}

/** A pessoa estava no meio de uma reserva? */
export const isBookingPath = (p: string | null | undefined) => !!p && /^\/reservar\//.test(p);

const AFTER_VERIFY_KEY = 'sh_after_verify';

/** Guarda para onde ir depois de confirmar o e-mail (o link do e-mail pode abrir em outra aba). */
export function rememberAfterVerify(next: string | null) {
  try {
    const p = safePath(next);
    if (p) localStorage.setItem(AFTER_VERIFY_KEY, p); else localStorage.removeItem(AFTER_VERIFY_KEY);
  } catch { /* ignore */ }
}

/** Lê (e apaga) o destino guardado no cadastro. */
export function takeAfterVerify(): string | null {
  try {
    const p = safePath(localStorage.getItem(AFTER_VERIFY_KEY));
    localStorage.removeItem(AFTER_VERIFY_KEY);
    return p;
  } catch { return null; }
}
