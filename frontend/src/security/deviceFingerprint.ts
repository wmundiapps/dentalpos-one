const CHAVE = "dentalpos.deviceFingerprint";

/** Identificador aleatório persistente deste navegador (não é fingerprinting de hardware — só "lembrar este navegador"). */
export function deviceFingerprint(): string {
  try {
    const existente = localStorage.getItem(CHAVE);
    if (existente) return existente;
    const novo = crypto.randomUUID();
    localStorage.setItem(CHAVE, novo);
    return novo;
  } catch {
    return "";
  }
}
