import { Router, Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { escapeHtml as esc } from '../core/branding'
import { mascararCpf, normalizarCodigo, sha256 } from './logic'

// ============================================================
// VERIFICAÇÃO PÚBLICA de autenticidade (certificados, documentos e diplomas) por código.
// Montada em /api/public/edu/secretaria (sem login). Expõe o mínimo necessário.
// ============================================================

export const publicRouter = Router()

// Limitador simples em memória (por IP): 40 consultas/min — dificulta enumeração de códigos.
const janela = new Map<string, { n: number; t: number }>()
function limitar(req: Request, res: Response): boolean {
  const ip = String(req.ip || req.headers['x-forwarded-for'] || 'x')
  const agora = Date.now()
  const j = janela.get(ip)
  if (!j || agora - j.t > 60_000) janela.set(ip, { n: 1, t: agora })
  else if (++j.n > 40) {
    res.status(429).json({ error: 'Muitas consultas. Aguarde um minuto.' })
    return false
  }
  if (janela.size > 5000) for (const [k, v] of janela) if (agora - v.t > 60_000) janela.delete(k)
  return true
}

export async function verificarCodigo(codigoBruto: string, hashInformado?: string) {
  const codigo = normalizarCodigo(codigoBruto)
  if (codigo.length < 9) return null
  const cert = await prisma.secCertificado.findUnique({ where: { codigo }, include: { modelo: { select: { nome: true, tipo: true } } } })
  if (cert) {
    const inst = await prisma.eduInstitution.findUnique({ where: { tenantId: cert.tenantId }, select: { nome: true } })
    return {
      valido: cert.status === 'EMITIDO',
      tipo: 'CERTIFICADO',
      situacao: cert.status,
      motivo: cert.status === 'EMITIDO' ? undefined : cert.motivoRevogacao ?? undefined,
      substituidoPor: cert.substituidoPorId ? (await prisma.secCertificado.findUnique({ where: { id: cert.substituidoPorId }, select: { numero: true, codigo: true } })) ?? undefined : undefined,
      instituicao: inst?.nome,
      documento: cert.modelo.nome,
      numero: cert.numero,
      destinatario: cert.destinatarioNome,
      cpf: mascararCpf(cert.destinatarioDoc),
      descricao: cert.tituloEvento,
      cargaHoraria: cert.cargaHoraria,
      periodo: cert.periodo,
      emitidoEm: cert.emitidoEm,
      hashConfere: hashInformado ? hashInformado.toLowerCase() === cert.hash : undefined,
    }
  }
  const doc = await prisma.secDocumentoEmitido.findUnique({ where: { codigo } })
  if (doc) {
    const [inst, st] = await Promise.all([prisma.eduInstitution.findUnique({ where: { tenantId: doc.tenantId }, select: { nome: true } }), doc.studentId ? prisma.student.findFirst({ where: { id: doc.studentId, tenantId: doc.tenantId }, select: { nomeCompleto: true, cpf: true } }) : null])
    const vencido = doc.validoAte ? doc.validoAte < new Date() : false
    return {
      valido: !doc.cancelado && !vencido,
      tipo: 'DOCUMENTO_ACADEMICO',
      situacao: doc.cancelado ? 'CANCELADO' : vencido ? 'VALIDADE_EXPIRADA' : 'VIGENTE',
      instituicao: inst?.nome,
      documento: doc.tipo.replace(/_/g, ' '),
      destinatario: st?.nomeCompleto,
      cpf: mascararCpf(st?.cpf),
      emitidoEm: doc.createdAt,
      validoAte: doc.validoAte,
      hashConfere: hashInformado ? hashInformado.toLowerCase() === doc.hash : sha256(doc.html) === doc.hash ? true : undefined,
    }
  }
  const dip = await prisma.secDiploma.findUnique({ where: { codigoVerificacao: codigo } })
  if (dip) {
    const [inst, st, prog, livro] = await Promise.all([
      prisma.eduInstitution.findUnique({ where: { tenantId: dip.tenantId }, select: { nome: true } }),
      prisma.student.findFirst({ where: { id: dip.studentId, tenantId: dip.tenantId }, select: { nomeCompleto: true, cpf: true } }),
      dip.programId ? prisma.academicProgram.findFirst({ where: { id: dip.programId }, select: { nome: true } }) : null,
      dip.livroId ? prisma.secLivro.findUnique({ where: { id: dip.livroId }, select: { numero: true } }) : null,
    ])
    return {
      valido: ['REGISTRADO', 'ENTREGUE'].includes(dip.status),
      tipo: 'DIPLOMA',
      situacao: dip.status,
      instituicao: inst?.nome,
      documento: dip.tipo === 'SEGUNDA_VIA' ? 'Diploma (2ª via)' : 'Diploma',
      destinatario: st?.nomeCompleto,
      cpf: mascararCpf(st?.cpf),
      descricao: prog?.nome,
      numero: dip.numeroRegistro ? `Livro ${livro?.numero ?? '?'}, folha ${dip.folha}, registro ${dip.numeroRegistro}` : undefined,
      emitidoEm: dip.dataRegistro,
    }
  }
  return null
}

publicRouter.get('/verificar/:codigo', async (req, res, next) => {
  try {
    if (!limitar(req, res)) return
    const r = await verificarCodigo(String(req.params.codigo), typeof req.query.hash === 'string' ? req.query.hash : undefined)
    if (!r) return res.status(404).json({ valido: false, error: 'Código não encontrado.' })
    // Navegadores (Accept: text/html) recebem página legível; integrações recebem JSON.
    if (req.query.formato === 'json' || !String(req.headers.accept || '').includes('text/html')) return res.json(r)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(paginaVerificacao(r))
  } catch (e) {
    next(e)
  }
})

publicRouter.get('/verificar/:codigo/pagina', async (req, res, next) => {
  try {
    if (!limitar(req, res)) return
    const r = await verificarCodigo(String(req.params.codigo))
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.status(r ? 200 : 404).send(paginaVerificacao(r))
  } catch (e) {
    next(e)
  }
})

function paginaVerificacao(r: Awaited<ReturnType<typeof verificarCodigo>>) {
  const cor = r?.valido ? '#15803d' : '#b91c1c'
  const linhas = r
    ? Object.entries({ Instituição: r.instituicao, Documento: r.documento, Número: r.numero, Titular: r.destinatario, CPF: r.cpf, Descrição: (r as any).descricao, 'Carga horária': (r as any).cargaHoraria ? `${(r as any).cargaHoraria}h` : undefined, Período: (r as any).periodo, Emissão: r.emitidoEm ? new Date(r.emitidoEm).toLocaleDateString('pt-BR') : undefined, Situação: r.situacao, Motivo: (r as any).motivo })
        .filter(([, v]) => v)
        .map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`)
        .join('')
    : ''
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Verificação de autenticidade</title><style>body{font-family:system-ui,sans-serif;background:#f1f5f9;margin:0;padding:24px}.c{max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 12px #0002}h1{font-size:20px;color:${cor}}table{width:100%;border-collapse:collapse}th{text-align:left;color:#475569;width:35%;padding:6px 0;vertical-align:top}td{padding:6px 0}</style></head><body><div class="c"><h1>${r ? (r.valido ? '✔ Documento autêntico e vigente' : '✖ Documento NÃO está vigente') : '✖ Código não encontrado'}</h1>${r ? `<table>${linhas}</table>` : '<p>Confira o código impresso no documento.</p>'}</div></body></html>`
}
