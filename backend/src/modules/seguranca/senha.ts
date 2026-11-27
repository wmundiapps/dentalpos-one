// ============================================================
// Política de senha forte para CADASTRO e TROCA de senha.
// NÃO é aplicada no login: senhas existentes continuam válidas.
// ============================================================

export const SENHA_MIN = 10

// Senhas e radicais muito comuns (pt-BR e en). Comparação sem acentos/maiúsculas e sem números/símbolos no fim.
const COMUNS = new Set([
  'password', 'passw0rd', 'senha', 'senha123', 'senhasenha', 'mudar123', 'mudar', 'trocar123', 'admin', 'administrador', 'administrator',
  'qwerty', 'qwertyuiop', 'qwerty123', 'asdfgh', 'asdfghjkl', 'zxcvbn', 'zxcvbnm', 'abc123', 'abcdef', 'abcdefgh', 'abcdefghij',
  '1234567890', '123456789', '12345678', '0123456789', '0987654321', '1q2w3e4r', '1q2w3e4r5t', '1qaz2wsx', 'iloveyou', 'letmein', 'welcome',
  'welcome1', 'monkey', 'dragon', 'football', 'futebol', 'flamengo', 'corinthians', 'palmeiras', 'brasil', 'brasil123', 'brazil', 'amor', 'iloveu',
  'dentalpos', 'dentalpos1', 'dentalposone', 'dentista', 'odontologia', 'clinica', 'clinica123', 'consultorio', 'edumaster', 'edumasterpro',
  'universidade', 'faculdade', 'professor', 'estudante', 'aluno', 'secretaria', 'teste', 'teste123', 'testando', 'usuario', 'usuario123',
  'master', 'root', 'toor', 'changeme', 'trustno1', 'sunshine', 'princess', 'superman', 'batman', 'internet', 'computador', 'mudaragora',
])

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export interface ResultadoSenha { ok: boolean; erro?: string }

export function validarSenhaForte(senha: unknown, contexto: { email?: string; nome?: string } = {}): ResultadoSenha {
  const s = typeof senha === 'string' ? senha : ''
  if (s.length < SENHA_MIN) return { ok: false, erro: `A senha deve possuir pelo menos ${SENHA_MIN} caracteres.` }
  if (s.length > 128) return { ok: false, erro: 'A senha deve ter no máximo 128 caracteres.' }
  const n = normalizar(s)
  const semFim = n.replace(/[\d\W_]+$/g, '')
  if (COMUNS.has(n) || COMUNS.has(semFim) || COMUNS.has(n.replace(/[\W_]+/g, ''))) {
    return { ok: false, erro: 'Esta senha é muito comum. Escolha outra, menos previsível.' }
  }
  if (new Set(n).size <= 3) return { ok: false, erro: 'A senha é muito repetitiva. Use caracteres variados.' }
  if (/^(?:0123456789|1234567890|abcdefghij|qwertyuiop|asdfghjkl|zxcvbnm)/.test(n) || sequencial(n)) {
    return { ok: false, erro: 'A senha não pode ser uma sequência simples (ex.: 1234567890, abcdefghij).' }
  }
  const local = normalizar(String(contexto.email || '').split('@')[0] || '')
  if (local.length >= 4 && n.includes(local)) return { ok: false, erro: 'A senha não pode conter o seu e-mail.' }
  const nome = normalizar(String(contexto.nome || '')).replace(/\s+/g, '')
  if (nome.length >= 5 && n.replace(/\s+/g, '').includes(nome)) return { ok: false, erro: 'A senha não pode conter o seu nome.' }
  return { ok: true }
}

function sequencial(s: string) {
  if (s.length < 8) return false
  let asc = 0
  let desc = 0
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1)
    if (d === 1) asc++
    else if (d === -1) desc++
  }
  return asc >= s.length - 2 || desc >= s.length - 2
}
