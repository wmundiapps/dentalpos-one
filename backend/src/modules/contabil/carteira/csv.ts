// Leitor de CSV mínimo (RFC 4180): separador ; ou , (detectado), aspas, quebras de linha dentro de aspas, BOM.
export function lerCsv(texto: string): string[][] {
  let s = texto.replace(/^﻿/, '')
  const primeira = s.split(/\r?\n/, 1)[0] || ''
  const sep = (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length ? ';' : ','
  const linhas: string[][] = []
  let campo = '', linha: string[] = [], aspas = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (aspas) {
      if (c === '"') { if (s[i + 1] === '"') { campo += '"'; i++ } else aspas = false } else campo += c
    } else if (c === '"') aspas = true
    else if (c === sep) { linha.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      linha.push(campo); campo = ''
      if (linha.some((x) => x.trim() !== '')) linhas.push(linha)
      linha = []
    } else campo += c
  }
  if (campo !== '' || linha.length) { linha.push(campo); if (linha.some((x) => x.trim() !== '')) linhas.push(linha) }
  return linhas
}

export const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
/** Normaliza o nome de coluna: minúsculas, sem acento, sem espaços/pontuação ("Nome Fantasia" -> "nomefantasia"). */
export const chaveColuna = (s: string) => semAcento(s).toLowerCase().replace(/[^a-z0-9]/g, '')
