#!/usr/bin/env node
// DentalPos — baixa os Dados Abertos do CNPJ da Receita Federal (compartilhamento público, listado por WebDAV).
//
// Uso:  node scripts/receita-baixar.mjs --pasta "C:\dados-cnpj" [--mes 2026-09] [--teste]
//   --teste   só a parte 0 de Estabelecimentos e Empresas (rápido, lista parcial)
//
// A Receita só responde a internet brasileira: rode no computador da clínica, não na nuvem.
// Os .zip ficam na pasta (o segundo uso no mês reaproveita o que já foi baixado). Quem descompacta é o chamador.
// Fonte oficial (mesmo link do dados.gov.br): https://arquivos.receitafederal.gov.br/index.php/s/YggdBLfdninEJX9
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}
const HOST = (process.env.RECEITA_HOST || 'https://arquivos.receitafederal.gov.br').replace(/\/$/, '')
const SHARE = process.env.RECEITA_SHARE || 'YggdBLfdninEJX9'
const DAV = `${HOST}/public.php/webdav/`
const AUTH = `Basic ${Buffer.from(`${SHARE}:`).toString('base64')}`
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function nomesDoXml(xml, pasta) {
  const hrefs = [...xml.matchAll(/<(?:\w+:)?href>([^<]+)<\/(?:\w+:)?href>/g)].map((m) => m[1])
  const propria = pasta ? pasta.replace(/\/$/, '').split('/').pop() : 'webdav'
  return hrefs
    .map((h) => decodeURIComponent(h.replace(/\/$/, '').split('/').pop() || ''))
    .filter((n) => n && n !== propria)
}

export function escolherMes(nomes) {
  const meses = nomes.filter((n) => /^\d{4}-\d{2}$/.test(n)).sort()
  return meses.length ? meses[meses.length - 1] : null
}

async function listar(pasta = '') {
  for (let t = 1; t <= 5; t += 1) {
    try {
      const r = await fetch(DAV + pasta, { method: 'PROPFIND', headers: { 'User-Agent': UA, Authorization: AUTH, Depth: '1', 'Content-Type': 'application/xml' } })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return nomesDoXml(await r.text(), pasta)
    } catch (e) {
      console.log(`  falha ao listar a pasta da Receita (${e.message}); tentativa ${t}/5`)
      await sleep(10000 * t)
    }
  }
  throw new Error('Não consegui abrir a pasta da Receita. Confira a internet (ela precisa ser do Brasil) e tente mais tarde.')
}

async function baixar(url, destino) {
  for (let t = 1; t <= 5; t += 1) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Authorization: AUTH } })
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`)
      const total = Number(r.headers.get('content-length') || 0)
      const out = fs.createWriteStream(`${destino}.part`)
      let feito = 0
      let ultimo = 0
      for await (const pedaco of r.body) {
        if (!out.write(pedaco)) await new Promise((ok) => out.once('drain', ok))
        feito += pedaco.length
        if (total && Date.now() - ultimo > 2000) {
          ultimo = Date.now()
          process.stdout.write(`\r  ${path.basename(destino)}: ${Math.floor((feito * 100) / total)}% de ${Math.round(total / 1e6)} MB   `)
        }
      }
      await new Promise((ok, fail) => out.end((e) => (e ? fail(e) : ok())))
      fs.renameSync(`${destino}.part`, destino)
      console.log(`\r  ${path.basename(destino)}: baixado (${Math.round(feito / 1e6)} MB)          `)
      return
    } catch (e) {
      console.log(`\n  falha ao baixar ${path.basename(destino)} (${e.message}); tentativa ${t}/5`)
      await sleep(10000 * t)
    }
  }
  throw new Error(`Não foi possível baixar ${path.basename(destino)}. Tente de novo mais tarde.`)
}

async function main() {
  const pasta = opt('pasta', '')
  if (!pasta) throw new Error('Informe --pasta.')
  fs.mkdirSync(pasta, { recursive: true })
  const mes = opt('mes', '') || escolherMes(await listar())
  if (!mes) throw new Error('Nenhuma pasta de mês encontrada no compartilhamento da Receita.')
  console.log(`Mês dos dados: ${mes}`)

  const ultimo = args.includes('--teste') ? 0 : 9
  const querer = ['Simples.zip', 'Municipios.zip']
  for (let i = 0; i <= ultimo; i += 1) querer.push(`Estabelecimentos${i}.zip`, `Empresas${i}.zip`)

  const noServidor = new Map((await listar(`${mes}/`)).map((n) => [n.toLowerCase(), n]))
  for (const nome of querer) {
    const real = noServidor.get(nome.toLowerCase())
    if (!real) throw new Error(`O arquivo ${nome} não está na pasta ${mes} da Receita.`)
    const destino = path.join(pasta, nome)
    if (fs.existsSync(destino)) { console.log(`  ${nome}: já baixado antes, reaproveitando`); continue }
    await baixar(`${DAV}${mes}/${encodeURIComponent(real)}`, destino)
  }
  console.log('Download concluído.')
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('receita-baixar.mjs')) {
  main().catch((e) => { console.error(`\nERRO: ${e.message}`); process.exit(1) })
}
