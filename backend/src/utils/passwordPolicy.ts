const COMMON = ['senha12345', '1234567890', '123456789a', 'password123', 'password1234', 'qwertyuiop', 'dentalpos123', 'dentalpos1234', 'admin12345', 'mudar12345', 'abc1234567', '1q2w3e4r5t', 'senhasenha', 'brasil1234']

/** Política de senha: ≥10 caracteres, ao menos 3 de 4 classes, sem sequências óbvias nem dados do usuário. */
export function validatePassword(password: string, hints: string[] = []): string | null {
  const p = String(password ?? '')
  if (p.length < 10) return 'A senha deve possuir pelo menos 10 caracteres.'
  if (p.length > 128) return 'A senha deve ter no máximo 128 caracteres.'
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length
  if (classes < 3) return 'Use ao menos 3 tipos de caractere: minúsculas, MAIÚSCULAS, números e símbolos.'
  const low = p.toLowerCase()
  if (COMMON.some((c) => low.includes(c))) return 'Senha muito comum. Escolha outra.'
  if (/^(.)\1+$/.test(p) || /(?:0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf)/i.test(p) && classes < 4) return 'Evite sequências óbvias (1234, abcd, qwer…).'
  for (const h of hints) {
    const t = String(h ?? '').toLowerCase().split('@')[0]
    if (t.length >= 4 && low.includes(t)) return 'A senha não pode conter seu nome ou e-mail.'
  }
  return null
}
