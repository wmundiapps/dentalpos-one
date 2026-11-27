import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '../../lib/prisma'
import { notify } from '../core/notify'

// Convite de acesso: ao cadastrar aluno, professor, diretoria, reitoria ou funcionário, a pessoa recebe um link para
// DEFINIR a própria senha (mesmo mecanismo da "Esqueci minha senha"). Assim a recuperação já nasce funcionando e
// ninguém precisa conhecer a senha provisória. O link vale por 72 horas e só pode ser usado uma vez.
const HORAS = 72
const base = () => { const b = String(process.env.PUBLIC_APP_URL || '').trim() || 'https://app.dentalpos.com.br'; return b.endsWith('/') ? b : `${b}/` }

export async function enviarConviteAcesso(user: { id: string; clinicId: string; tenantId: string; email: string; firstName: string }, quem = 'sua instituição') {
  const token = randomBytes(32).toString('hex')
  await prisma.passwordResetToken.create({ data: { clinicId: user.clinicId, userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + HORAS * 3_600_000) } })
  const url = new URL('redefinir-senha', base()); url.searchParams.set('token', token)
  await notify({
    tenantId: user.tenantId, canal: 'EMAIL', userId: user.id, destino: user.email, templateKey: 'convite-acesso', refType: 'User', refId: user.id,
    assunto: 'Seu acesso foi criado — defina sua senha',
    mensagem: `Olá, ${user.firstName}.\n\nSeu acesso ao sistema de ${quem} foi criado. Defina sua senha neste link (vale por ${HORAS} horas):\n${url.toString()}\n\nDepois de entrar, você pode ativar a autenticação em 2 etapas e o reconhecimento facial em "Minha biometria". Esqueceu a senha? Use "Esqueci minha senha" na tela de entrada.`,
  })
}
