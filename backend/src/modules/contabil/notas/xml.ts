import { soDigitos } from '../nucleo/util'

// Leitura LOCAL e simplificada de XML de NF-e (modelo 55/65) e de NFS-e. Não valida assinatura digital, schema nem situação na SEFAZ.
// Por segurança não usa parser XML completo (sem DTD/entidades externas): extrai campos por tag com limites de tamanho.

export const MAX_XML = 1_500_000

export interface NotaLida {
  tipo: 'NFE' | 'NFCE' | 'NFSE'; numero: number | null; serie: string; chaveAcesso: string | null; emitidaEm: Date | null
  emitenteDoc: string; emitenteNome: string; destinatarioDoc: string; destinatarioNome: string
  valorTotal: number; valorServicos: number; valorProdutos: number
  itens: Array<{ descricao: string; quantidade: number; valorUnitario: number; valorTotal: number }>
  impostos: { iss?: number; icms?: number; pis?: number; cofins?: number; irrf?: number; inss?: number }
}

const SEM_NS = (x: string) => x.replace(/<(\/?)[A-Za-z0-9_]+:/g, '<$1')   // remove prefixos de namespace
const tag = (x: string, t: string) => { const m = new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, 'i').exec(x); return m ? m[1].trim() : '' }
const bloco = (x: string, t: string) => tag(x, t)
const num = (s: string) => { const n = Number(String(s).replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const dec = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")

export function lerXmlNota(xmlBruto: string): NotaLida {
  if (xmlBruto.length > MAX_XML) throw Object.assign(new Error('XML muito grande (limite de 1,5 MB).'), { status: 413 })
  if (/<!DOCTYPE|<!ENTITY/i.test(xmlBruto)) throw Object.assign(new Error('XML com DTD/entidades não é aceito por segurança.'), { status: 400 })
  const x = SEM_NS(xmlBruto)
  const infNFe = /<infNFe\b/i.test(x)
  if (infNFe) {
    const id = /<infNFe[^>]*\bId="NFe(\d{44})"/i.exec(x)?.[1] ?? null
    const ide = bloco(x, 'ide'), emit = bloco(x, 'emit'), dest = bloco(x, 'dest'), tot = bloco(x, 'ICMSTot')
    const mod = tag(ide, 'mod')
    const dh = tag(ide, 'dhEmi') || tag(ide, 'dEmi')
    const itens = [...x.matchAll(/<det\b[^>]*>([\s\S]*?)<\/det>/gi)].slice(0, 200).map((m) => {
      const p = bloco(m[1], 'prod')
      return { descricao: dec(tag(p, 'xProd')).slice(0, 200), quantidade: num(tag(p, 'qCom')), valorUnitario: num(tag(p, 'vUnCom')), valorTotal: num(tag(p, 'vProd')) }
    })
    const data = dh ? new Date(dh) : null
    return {
      tipo: mod === '65' ? 'NFCE' : 'NFE', numero: tag(ide, 'nNF') ? parseInt(tag(ide, 'nNF'), 10) : null, serie: tag(ide, 'serie') || '1', chaveAcesso: id,
      emitidaEm: data && !isNaN(data.getTime()) ? data : null,
      emitenteDoc: soDigitos(tag(emit, 'CNPJ') || tag(emit, 'CPF')), emitenteNome: dec(tag(emit, 'xNome')).slice(0, 160),
      destinatarioDoc: soDigitos(tag(dest, 'CNPJ') || tag(dest, 'CPF')), destinatarioNome: dec(tag(dest, 'xNome')).slice(0, 160),
      valorTotal: num(tag(tot, 'vNF')), valorProdutos: num(tag(tot, 'vProd')), valorServicos: 0, itens,
      impostos: { icms: num(tag(tot, 'vICMS')), pis: num(tag(tot, 'vPIS')), cofins: num(tag(tot, 'vCOFINS')) },
    }
  }
  // NFS-e (layouts variam por município; lê os campos mais comuns do padrão ABRASF e do Ambiente Nacional)
  if (/<(InfNfse|InfDeclaracaoPrestacaoServico|Nfse|infNFSe|NFSe)\b/i.test(x)) {
    const prest = bloco(x, 'PrestadorServico') || bloco(x, 'Prestador') || bloco(x, 'emit') || x
    const toma = bloco(x, 'TomadorServico') || bloco(x, 'Tomador') || bloco(x, 'toma') || ''
    const doc = (b: string) => soDigitos(tag(b, 'Cnpj') || tag(b, 'CNPJ') || tag(b, 'Cpf') || tag(b, 'CPF'))
    const vs = num(tag(x, 'ValorServicos') || tag(x, 'vServ') || tag(x, 'vLiq') || '0')
    const dh = tag(x, 'DataEmissao') || tag(x, 'dhEmi') || tag(x, 'dhProc')
    const data = dh ? new Date(dh) : null
    return {
      tipo: 'NFSE', numero: tag(x, 'Numero') || tag(x, 'nNFSe') ? parseInt(tag(x, 'Numero') || tag(x, 'nNFSe'), 10) || null : null, serie: '1', chaveAcesso: null,
      emitidaEm: data && !isNaN(data.getTime()) ? data : null, emitenteDoc: doc(prest), emitenteNome: dec(tag(prest, 'RazaoSocial') || tag(prest, 'xNome')).slice(0, 160),
      destinatarioDoc: doc(toma), destinatarioNome: dec(tag(toma, 'RazaoSocial') || tag(toma, 'xNome')).slice(0, 160),
      valorTotal: vs, valorServicos: vs, valorProdutos: 0, itens: [{ descricao: dec(tag(x, 'Discriminacao') || tag(x, 'xDescServ') || 'Serviço').slice(0, 200), quantidade: 1, valorUnitario: vs, valorTotal: vs }],
      impostos: { iss: num(tag(x, 'ValorIss') || tag(x, 'vISSQN') || '0'), pis: num(tag(x, 'ValorPis') || '0'), cofins: num(tag(x, 'ValorCofins') || '0'), irrf: num(tag(x, 'ValorIr') || '0'), inss: num(tag(x, 'ValorInss') || '0') },
    }
  }
  throw Object.assign(new Error('Não reconheci este XML como NF-e/NFC-e/NFS-e. Envie o XML completo da nota (arquivo .xml original).'), { status: 400 })
}
