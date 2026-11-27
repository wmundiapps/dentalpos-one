// LGPD: marketing exige opt-in explícito; operacional/cobrança seguem; opt-out sempre respeitado.
import { setup, check, summary, prisma, fails } from './qa5-lib'
import { podeEnviar } from '../../src/modules/comunicacao/pure'

async function main() {
  const { call, t1, close } = await setup()
  const admin = await t1.mk('ADMIN')
  const T = t1.tenantId
  await prisma.eduInstitution.create({ data: { tenantId: T, nome: 'Instituto LGPD' } })
  const pub = (p: string) => `/public/edu/admissoes${p}?tenant=${T}`

  // dois leads públicos: um aceita comunicações, outro não
  let r = await call(null, 'POST', pub('/leads'), { nome: 'Lead Aceita Tudo', email: 'aceita@x.com', telefone: '11999990001', consentimentoLgpd: true, aceitaComunicacoes: true })
  check('lead com aceite', r.status === 201 || r.status === 200, r.text)
  r = await call(null, 'POST', pub('/leads'), { nome: 'Lead Sem Aceite', email: 'nao@x.com', telefone: '11999990002', consentimentoLgpd: true })
  check('lead sem aceite de marketing', r.status === 201 || r.status === 200, r.text)
  const c1 = await prisma.admCandidato.findFirst({ where: { tenantId: T, email: 'aceita@x.com' } })
  const c2 = await prisma.admCandidato.findFirst({ where: { tenantId: T, email: 'nao@x.com' } })
  check('flag marketing gravada (aceita)', c1?.consentimentoMarketing === true && !!c1?.consentimentoMarketingEm, c1)
  check('flag marketing falsa por padrão', c2?.consentimentoMarketing === false && c2?.consentimentoLgpd === true, c2)

  // sincroniza contatos e confere preferências
  r = await call(admin, 'POST', '/edu/comunicacao/contatos/sincronizar', { fonte: 'CANDIDATOS' })
  check('sincronizar candidatos', r.status === 200, r.text)
  const k1 = await prisma.comContato.findFirst({ where: { tenantId: T, candidatoId: c1!.id }, include: { preferencias: true } })
  const k2 = await prisma.comContato.findFirst({ where: { tenantId: T, candidatoId: c2!.id }, include: { preferencias: true } })
  check('opt-in registrado só para quem aceitou', k1!.preferencias.some((p) => p.finalidade === 'MARKETING' && p.consentimento) && k2!.preferencias.length === 0, { k1: k1?.preferencias, k2: k2?.preferencias })

  // lógica de decisão
  check('marketing sem registro bloqueia', !podeEnviar([], 'WHATSAPP', 'MARKETING').ok)
  check('marketing com opt-in libera', podeEnviar(k1!.preferencias as any, 'WHATSAPP', 'MARKETING').ok)
  check('cobrança/acadêmico sem registro libera', podeEnviar([], 'WHATSAPP', 'COBRANCA').ok && podeEnviar([], 'EMAIL', 'ACADEMICO').ok)
  check('opt-out posterior vence', !podeEnviar([{ canal: '*', finalidade: 'MARKETING', consentimento: false }], 'EMAIL', 'MARKETING').ok)

  summary()
  await close()
  process.exit(fails.length ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(2) })
