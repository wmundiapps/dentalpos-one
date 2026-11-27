import { inflateSync } from 'node:zlib'

// PDF mínimo: gerador (demo/testes) e leitor de TEXTO EMBUTIDO. Não faz OCR: PDFs digitalizados (imagem) ou com fontes
// codificadas por glifo (Identity-H sem mapa legível) não são lidos, e o sistema diz isso em vez de inventar dados.

const escPdf = (s: string) =>
  Array.from(s).map((ch) => {
    const c = ch.charCodeAt(0)
    if (ch === '(' || ch === ')' || ch === '\\') return '\\' + ch
    if (c > 126 || c < 32) return c < 256 ? '\\' + c.toString(8).padStart(3, '0') : '?'
    return ch
  }).join('')

/** Gera um PDF de uma página com as linhas de texto (Helvetica, WinAnsi), sem compressão. */
export function montarPdfTexto(linhas: string[], titulo = 'Boleto'): Buffer {
  const conteudo = ['BT', '/F1 10 Tf', '14 TL', '40 800 Td', ...linhas.map((l) => `(${escPdf(l)}) Tj T*`), 'ET'].join('\n')
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(conteudo, 'latin1')} >>\nstream\n${conteudo}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Title (${escPdf(titulo)}) /Producer (EduMaster Pro) >>`,
  ]
  let out = '%PDF-1.4\n'
  const offs: number[] = []
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = Buffer.byteLength(out, 'latin1')
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

function decodificarString(raw: string): string {
  return raw.replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, (_m, g: string) => {
    if (g === 'n') return '\n'
    if (g === 'r') return '\r'
    if (g === 't') return '\t'
    if (g === 'b' || g === 'f') return ''
    if (/^[0-7]+$/.test(g)) return String.fromCharCode(parseInt(g, 8) & 255)
    if (g === '\n' || g === '\r\n') return ''
    return g
  })
}

function textoDoConteudo(c: string): string {
  const partes: string[] = []
  // (texto) Tj | (texto) ' | [(a) -10 (b)] TJ | <hex> Tj
  const re = /\[((?:\\.|[^\]])*)\]\s*TJ|\(((?:\\.|[^()\\])*)\)\s*(?:Tj|'|")|<([0-9A-Fa-f\s]+)>\s*Tj|\bT\*|\bTd\b|\bTD\b|\bET\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(c))) {
    if (m[1] !== undefined) {
      let linha = ''
      const rs = /\(((?:\\.|[^()\\])*)\)|(-?\d+(?:\.\d+)?)/g
      let k: RegExpExecArray | null
      while ((k = rs.exec(m[1]))) {
        if (k[1] !== undefined) linha += decodificarString(k[1])
        else if (Number(k[2]) < -250) linha += ' '
      }
      partes.push(linha)
    } else if (m[2] !== undefined) partes.push(decodificarString(m[2]))
    else if (m[3] !== undefined) {
      const hex = m[3].replace(/\s+/g, '')
      // pares de 2 dígitos = bytes; (códigos de 2 bytes por glifo não são texto legível)
      let t = ''
      for (let i = 0; i + 1 < hex.length; i += 2) t += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16))
      partes.push(t)
    } else partes.push('\n')
  }
  return partes.join('').replace(/\n{2,}/g, '\n')
}

export interface LeituraPdf { ok: boolean; texto: string; motivo?: string }

/** Extrai o texto embutido de um PDF (streams sem compressão ou FlateDecode). Sem OCR. */
export function extrairTextoPdf(buf: Buffer): LeituraPdf {
  const bin = buf.toString('latin1')
  if (!bin.startsWith('%PDF')) return { ok: false, texto: '', motivo: 'o arquivo não é um PDF válido' }
  if (/\/Encrypt\b/.test(bin)) return { ok: false, texto: '', motivo: 'PDF protegido por senha/criptografia: não foi possível ler' }
  const trechos: string[] = []
  const re = /<<((?:(?!>>\s*stream)[\s\S])*?)>>\s*stream\r?\n/g
  let m: RegExpExecArray | null
  while ((m = re.exec(bin))) {
    const ini = m.index + m[0].length
    const fim = bin.indexOf('endstream', ini)
    if (fim < 0) break
    const dict = m[1]
    if (/\/Subtype\s*\/Image|\/Type\s*\/XObject|\/FontFile|\/Length1|\/ObjStm|\/XRef/.test(dict)) continue
    let dados = Buffer.from(bin.slice(ini, fim), 'latin1')
    if (/\/FlateDecode/.test(dict)) {
      try { dados = inflateSync(dados) } catch { try { dados = inflateSync(dados.subarray(0, Math.max(0, dados.length - 1))) } catch { continue } }
    } else if (/\/Filter/.test(dict)) continue
    const txt = dados.toString('latin1')
    if (/\b(Tj|TJ)\b/.test(txt)) trechos.push(textoDoConteudo(txt))
  }
  const texto = trechos.join('\n').replace(/[^\S\n]+/g, ' ').trim()
  const legivel = (texto.match(/[A-Za-zÀ-ÿ0-9]/g) || []).length
  if (legivel < 12) {
    return {
      ok: false, texto: '',
      motivo: /\/Subtype\s*\/Image/.test(bin)
        ? 'PDF sem texto embutido (parece digitalizado/imagem). Este sistema não faz OCR: lance os dados manualmente ou peça o PDF original do fornecedor'
        : 'PDF sem texto legível (texto convertido em curvas ou fonte sem mapa de caracteres). Este sistema não faz OCR: lance os dados manualmente',
    }
  }
  return { ok: true, texto }
}
