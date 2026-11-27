import type { Express, Request, RequestHandler } from 'express'
import { prisma } from '../../lib/prisma'
import { concluirLogin } from '../../controllers/authController'
import { getDemoAccess } from '../../services/demoAccessService'
import { FacialError, novoNonce, validarEmbedding, verificar } from '../presenca/facial'
import { emitirDesafio, getConfig, registrarLog, templatesAtivos, validarLiveness } from '../presenca/servico'
import { bloqueioLogin, desafioSegundoFator, falhaLogin, sucessoLogin } from './login'

// Entrada por reconhecimento facial (alternativa à senha). Verificação 1:1 contra os modelos faciais da PRÓPRIA pessoa
// (a que digitou o e-mail), com prova de vivacidade de uso único e bloqueio por tentativas. Exige consentimento ativo
// (LGPD) e cadastro prévio em "Minha biometria". Se a pessoa usa 2 etapas, o código continua sendo pedido.
// O servidor só recebe o vetor (nunca a imagem). Respostas de erro não revelam se o e-mail existe.

async function localizar(email: string, clinicId?: string) {
  const users = await prisma.user.findMany({ where: { email: email.toLowerCase().trim(), isActive: true, ...(clinicId ? { clinicId } : {}) }, take: 2 })
  return users.length === 1 ? users[0] : null // e-mail ambíguo entre unidades: exige informar a unidade
}

export function montarLoginFacial(app: Express, limiter: RequestHandler) {
  app.post('/api/auth/face/desafio', limiter, async (req: Request, res) => {
    try {
      const user = await localizar(String(req.body?.email || ''), req.body?.clinicId ? String(req.body.clinicId) : undefined)
      if (!user) { const nonce = novoNonce(); return res.json({ nonce, acao: 'PISCAR', instrucao: 'Olhe para a câmera e pisque.' }) }
      return res.json(await emitirDesafio(user.tenantId))
    } catch (e) { console.error(e); return res.status(500).json({ error: 'Erro interno do servidor.' }) }
  })

  app.post('/api/auth/face/login', limiter, async (req: Request, res) => {
    const generico = { error: 'Não foi possível confirmar o rosto. Tente de novo ou entre com a senha.' }
    try {
      const email = String(req.body?.email || '').toLowerCase().trim()
      if (!email) return res.status(400).json({ error: 'Informe o e-mail.' })
      const bloq = await bloqueioLogin(req, `face:${email}`)
      if (bloq.bloqueado) return res.status(429).json({ error: 'Muitas tentativas. Aguarde antes de tentar de novo.', retryAfter: bloq.segundos })
      const user = await localizar(email, req.body?.clinicId ? String(req.body.clinicId) : undefined)
      if (!user) { await falhaLogin(req, `face:${email}`, null); return res.status(401).json(generico) }
      const tenantId = user.tenantId
      const cfg = await getConfig(tenantId)
      const vetor = validarEmbedding(req.body?.embedding)
      await validarLiveness(tenantId, req.body?.liveness, true)
      const aluno = await prisma.student.findFirst({ where: { tenantId, userId: user.id }, select: { id: true } })
      const chaves = [`USUARIO:${user.id}`, ...(aluno ? [`ALUNO:${aluno.id}`] : [])]
      const tpl = await templatesAtivos(tenantId, chaves)
      const r = verificar(vetor, tpl.map((t) => t.vetor), cfg.limiarDistancia)
      if (!tpl.length || !r.ok) {
        await registrarLog({ tenantId, acao: 'COMPARACAO', resultado: 'NAO_RECONHECIDO', pessoaKey: chaves[0], finalidade: 'ACESSO', userId: user.id, detalhe: { canal: 'LOGIN' } })
        await falhaLogin(req, `face:${email}`, user)
        return res.status(401).json(generico)
      }
      await registrarLog({ tenantId, acao: 'COMPARACAO', resultado: 'OK', pessoaKey: chaves[0], finalidade: 'ACESSO', distancia: r.distancia, userId: user.id, detalhe: { canal: 'LOGIN' } })
      await sucessoLogin(req, `face:${email}`)
      const desafio = await desafioSegundoFator(req, user as any)
      if (desafio) return res.json(desafio)
      const demo = await getDemoAccess(user.clinicId)
      return res.json(await concluirLogin(req, user as any, demo, 'Login por reconhecimento facial.'))
    } catch (e: any) {
      if (e instanceof FacialError) return res.status(e.status === 422 ? 422 : 401).json(e.status === 422 ? { error: e.message } : generico)
      console.error(e)
      return res.status(500).json({ error: 'Erro interno do servidor.' })
    }
  })
}
