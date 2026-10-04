import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { registrarEvento, ipDaRequisicao } from './eventos'
import { moderarTexto } from './moderacao'
import { checarNomeArquivo } from './tipos'
import { checarMetadadosArquivo, mensagemBloqueio, scanUpload } from './uploads'

// ============================================================
// uploadGuard — aplica a varredura a TODO corpo JSON (POST/PUT/PATCH) sem alterar contratos de resposta:
//   - data URLs / campos *base64  -> scanUpload (tipo real, malware, moderação de imagem)
//   - campos de URL de anexo      -> só https, sem rede interna (SSRF), sem arquivo proibido
//   - nome/MIME de arquivo        -> extensões e MIMEs proibidos (cobre uploads por URL pré-assinada)
//   - rotas /public (formulários) -> moderação de texto (bloqueia domínios adultos/malware; marca phishing p/ revisão)
// Bloqueio = 422 com mensagem em português. Montado em routes/index.ts (antes e depois do authMiddleware).
// ============================================================

const CHAVES_NOME_FORTE = ['arquivoNome', 'originalName', 'filename', 'fileName', 'nomeArquivo']
const CHAVES_MIME = ['mime', 'mimeType', 'contentType', 'tipoMime']
const CHAVES_URL_ANEXO = new Set([
  'arquivourl', 'urlarquivo', 'fileurl', 'externalurl', 'camerareadyurl', 'capaurl', 'repositoriourl', 'anaisurl', 'urlacesso', 'attachmenturl', 'anexourl', 'documentourl', 'imageurl', 'logourl',
])
const PAI_ANEXO = /(anexo|arquivo|documento|attachment|file|upload|logo|imagem|midia|camera|evidencia|foto|capa|marca|identidade|brand)/i

interface Item {
  tipo: 'data' | 'base64' | 'url' | 'meta'
  valor?: string
  nome?: string
  mime?: string
  caminho: string
}

function primeiraString(o: Record<string, any>, chaves: string[]): string | undefined {
  for (const k of chaves) if (typeof o[k] === 'string' && o[k]) return o[k]
  return undefined
}

/** `rota` (caminho da requisição) ajuda a reconhecer um `url` de primeiro nível como anexo (ex.: /documentos/:codigo/enviar). */
export function coletarItens(corpo: unknown, limite = 25, rota = ''): Item[] {
  const itens: Item[] = []
  const visita = (v: any, caminho: string, chavePai: string, prof: number) => {
    if (itens.length >= limite || prof > 6 || v == null) return
    if (Array.isArray(v)) { v.slice(0, 50).forEach((x, i) => visita(x, `${caminho}[${i}]`, chavePai, prof + 1)); return }
    if (typeof v !== 'object') return
    const forte = primeiraString(v, CHAVES_NOME_FORTE)
    const fraco = primeiraString(v, ['nome', 'name'])
    // "nome"/"name" genéricos só valem como nome de arquivo se terminarem em extensão plausível.
    const nome = forte || (fraco && /\.[A-Za-z0-9]{2,5}$/.test(fraco) ? fraco : undefined)
    const mime = primeiraString(v, CHAVES_MIME)
    let temConteudo = false
    for (const [k, val] of Object.entries(v)) {
      const lk = k.toLowerCase()
      const cam = caminho ? `${caminho}.${k}` : k
      if (typeof val === 'string') {
        if (/^\s*data:/i.test(val) && val.length > 20) { itens.push({ tipo: 'data', valor: val, nome, mime, caminho: cam }); temConteudo = true }
        else if (/base64$/.test(lk) && val.length > 100) { itens.push({ tipo: 'base64', valor: val, nome, mime, caminho: cam }); temConteudo = true }
        else if (val && (CHAVES_URL_ANEXO.has(lk) || (lk === 'url' && (nome || mime || PAI_ANEXO.test(chavePai))))) { itens.push({ tipo: 'url', valor: val, nome, mime, caminho: cam }); temConteudo = true }
      } else if (val && typeof val === 'object') visita(val, cam, k, prof + 1)
    }
    // Objeto com nome de arquivo (e/ou MIME) e sem conteúdo (ex.: intenção de upload pré-assinado): confere só os metadados.
    if (!temConteudo && (forte || (fraco && mime))) itens.push({ tipo: 'meta', nome: forte || fraco, mime, caminho: caminho || 'corpo' })
  }
  visita(corpo, '', rota, 0)
  return itens
}

/** Coleta textos livres (≥ 8 caracteres) de um corpo, para moderação em formulários públicos. */
function coletarTextos(corpo: unknown, limite = 40): string[] {
  const out: string[] = []
  const visita = (v: any, prof: number) => {
    if (out.length >= limite || prof > 5 || v == null) return
    if (typeof v === 'string') { if (v.length >= 8 && !/^\s*data:/i.test(v)) out.push(v.slice(0, 5000)); return }
    if (Array.isArray(v)) { v.slice(0, 50).forEach((x) => visita(x, prof + 1)); return }
    if (typeof v === 'object') for (const x of Object.values(v)) visita(x, prof + 1)
  }
  visita(corpo, 0)
  return out
}

const METODOS = new Set(['POST', 'PUT', 'PATCH'])

export const uploadGuard: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!METODOS.has(req.method)) return next()
    const corpo = req.body
    if (!corpo || typeof corpo !== 'object') return next()
    const url = (req.originalUrl || '').split('?')[0]
    // Webhooks de provedores (assinados) e o cron não são formulários de usuário.
    if (/\/webhook(s)?\b/i.test(url) || /\/cron\//i.test(url)) return next()

    const user = (req as any).user as { id?: string; tenantId?: string } | undefined
    const contexto = { tenantId: user?.tenantId, userId: user?.id, ip: ipDaRequisicao(req), origem: `${req.method} ${url}`.slice(0, 120) }
    const bloquear = (msg: string) => res.status(422).json({ error: msg })

    for (const it of coletarItens(corpo, 25, url)) {
      if (it.tipo === 'data' || it.tipo === 'base64') {
        const dado = it.tipo === 'data' ? it.valor! : `data:${it.mime || 'application/octet-stream'};base64,${it.valor}`
        const r = await scanUpload({ filename: it.nome, declaredMime: it.tipo === 'data' ? undefined : it.mime, data: dado, contexto })
        if (!r.ok) return bloquear(mensagemBloqueio(r))
      } else if (it.tipo === 'url') {
        const v = it.valor!.trim()
        // Valor sem esquema (referência relativa/nome de arquivo) não é endereço externo: só confere o nome.
        const temEsquema = /^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith('//')
        if (temEsquema) {
          const r = await scanUpload({ url: v.startsWith('//') ? 'https:' + v : v, contexto })
          if (!r.ok) return bloquear(`Link de anexo bloqueado: ${(r.motivo || '').replace(/\.$/, '')}.`)
        } else {
          const n = checarNomeArquivo(v.split('?')[0].split('/').pop() || '')
          if (!n.ok) return bloquear(`Link de anexo bloqueado: ${n.motivo}.`)
          if (/^\s*(javascript|data|vbscript):/i.test(v)) return bloquear('Link de anexo bloqueado: esquema não permitido.')
        }
      } else {
        const r = checarMetadadosArquivo({ filename: it.nome, mime: it.mime })
        if (!r.ok) {
          await registrarEvento({ ...contexto, tipo: 'upload_bloqueado', severidade: 'ATENCAO', detalhe: { origem: contexto.origem, nome: it.nome, mime: it.mime, motivo: r.motivo, metadados: true } })
          return bloquear(mensagemBloqueio(r))
        }
      }
    }

    // Moderação de texto em formulários públicos / chat do site / ouvidoria.
    if (/\/public\//i.test(url)) {
      const revisar: string[] = []
      for (const t of coletarTextos(corpo)) {
        const m = moderarTexto(t)
        if (m.acao === 'BLOQUEAR') {
          await registrarEvento({ ...contexto, tipo: 'texto_bloqueado', severidade: 'ATENCAO', detalhe: { origem: contexto.origem, motivos: m.motivos } })
          return bloquear(`Conteúdo bloqueado pela verificação de segurança: ${m.motivos[0]}.`)
        }
        if (m.acao === 'REVISAR') revisar.push(...m.motivos)
      }
      if (revisar.length) {
        await registrarEvento({ ...contexto, tipo: 'texto_revisao', detalhe: { origem: contexto.origem, motivos: [...new Set(revisar)].slice(0, 8) } })
      }
    }
    return next()
  } catch (e) {
    console.error('[seguranca] erro na varredura de upload', e)
    // Falha INTERNA da varredura: recusa por precaução (não deixa passar arquivo não verificado).
    return res.status(422).json({ error: 'Não foi possível verificar o arquivo com segurança. Tente novamente com outro arquivo.' })
  }
}
