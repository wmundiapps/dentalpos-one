/** Única fonte da lista de e-mails da equipe WMundi (variável WMUNDI_STAFF_EMAILS, separada por vírgula). */
const STAFF = (process.env.WMUNDI_STAFF_EMAILS || 'contato@dentalpos.com.br')
  .split(',')
  .map((v) => v.trim().toLowerCase())
  .filter(Boolean)

export const isWmundiStaffEmail = (email?: string | null) => STAFF.includes(String(email || '').trim().toLowerCase())
