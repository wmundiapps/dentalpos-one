// robsonravel@wmundi.com: proprietário da WMundi. Acesso total sempre (bypass de cargo em requireRole) e nunca
// bloqueado por aprovação de dispositivo novo (apenas notificado) — as duas únicas exceções de segurança do
// sistema, e ambas só para esta conta. Centralizado aqui para os dois módulos (academico/middleware e
// seguranca/dispositivos) usarem o mesmo valor.
export const OWNER_ACCOUNT_EMAIL = 'robsonravel@wmundi.com'

export function isOwnerAccount(email?: string | null): boolean {
  return String(email || '').trim().toLowerCase() === OWNER_ACCOUNT_EMAIL
}
