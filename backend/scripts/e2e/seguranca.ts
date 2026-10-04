// Testes do módulo de SEGURANÇA (2FA TOTP, bloqueio de login, originGuard, varredura de uploads, moderação).
// Uso:  DATABASE_URL=postgresql://postgres@127.0.0.1:5546/seg npx tsx scripts/e2e/seguranca.ts
// Requer um Postgres com o schema aplicado (prisma db push). Não depende de internet nem de chaves de IA:
// ClamAV, VirusTotal e a API de visão são SIMULADOS (servidor TCP local e fetch interceptado).
import bcrypt from 'bcryptjs'
import http from 'http'
import jwt from 'jsonwebtoken'
import net from 'net'
import { deflateRawSync, deflateSync } from 'zlib'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'seg-test-secret-0123456789abcdef0123456789abcdef'
process.env.NODE_ENV = 'test'
process.env.CORS_ORIGIN = 'https://app.exemplo.com'
process.env.AUTH_RATE_LIMIT_MAX = '10000'
process.env.API_RATE_LIMIT_MAX = '100000'
process.env.ALLOW_PUBLIC_REGISTRATION = 'true'
process.env.UPLOAD_MODERATION = 'off' // ligado explicitamente nos testes de moderação
delete process.env.REQUIRE_2FA_ROLES

import { prisma } from '../../src/lib/prisma'
import { base32Decode, base32Encode, gerarSegredoBase32, hotp, totp, verificarTotp } from '../../src/modules/seguranca/totp'
import { cifrar, decifrar } from '../../src/modules/seguranca/cripto'
import { validarSenhaForte } from '../../src/modules/seguranca/senha'
import { analisarLocal, scanUpload } from '../../src/modules/seguranca/uploads'
import { moderarTexto } from '../../src/modules/seguranca/moderacao'
import { validarUrlExterna } from '../../src/modules/seguranca/url'
import { origemPermitida } from '../../src/modules/seguranca/origem'
import { runEduJobs } from '../../src/modules/core/jobs'

const fails: string[] = []
let ok = 0
function check(nome: string, cond: any, extra?: any) {
  if (cond) { ok++; return }
  fails.push(nome)
  console.log('  FALHA', nome, extra !== undefined ? (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 300) : '')
}
const secao = (t: string) => console.log(`\n== ${t}`)

// ---------------------------------------------------------------- amostras de arquivos
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1'), Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x10, 0x00, 0x10, 0x01, 0x01, 0x11, 0x00]), Buffer.from([0xff, 0xd9])])
const PDF_OK = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF')
const PDF_JS = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/OpenAction 4 0 R>>endobj\n4 0 obj<</S/JavaScript/JS(app.alert(1))>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF')
const PDF_JS_OBF = Buffer.from('%PDF-1.4\n4 0 obj<</S/J#61vaScr#69pt/JS(app.alert(1))>>endobj\n%%EOF')
const PDF_LAUNCH = Buffer.from('%PDF-1.4\n4 0 obj<</S/Launch/F(cmd.exe)>>endobj\n%%EOF')
const PDF_OPEN_URI = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/OpenAction<</S/URI/URI(http://x.test)>>>>endobj\n%%EOF')
const PDF_OPEN_FIT = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/OpenAction[3 0 R/Fit]>>endobj\n%%EOF')
const PDF_EMBED = Buffer.from('%PDF-1.4\n5 0 obj<</Type/EmbeddedFile/Length 3>>stream\nabc\nendstream endobj\n%%EOF')
const objstm = deflateSync(Buffer.from('4 0 << /S /JavaScript /JS (app.alert(1)) >>'))
const PDF_OBJSTM_JS = Buffer.concat([Buffer.from('%PDF-1.5\n6 0 obj\n<</Type/ObjStm/N 1/First 4/Filter/FlateDecode/Length ' + objstm.length + '>>\nstream\n'), objstm, Buffer.from('\nendstream\nendobj\n%%EOF')])
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(58), Buffer.from([0x40, 0, 0, 0]), Buffer.from('PE\0\0'), Buffer.alloc(200)])
const ELF = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(100)])
const SVG_OK = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>')
const SVG_SCRIPT = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
const SVG_ONLOAD = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>')
const SVG_FO = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"/></foreignObject></svg>')
const SVG_JSHREF = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="javascript:alert(1)"><rect width="5" height="5"/></a></svg>')
const EICAR = Buffer.from(['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE', '!$H+H*'].join(''))

// ZIP mínimo (método 8 = deflate) para montar docx/zip de teste.
function crc32(buf: Buffer) {
  let c, crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) { c = (crc ^ buf[i]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c }
  return (crc ^ 0xffffffff) >>> 0
}
function zip(entradas: Array<{ nome: string; dados: Buffer; metodo?: 0 | 8; flags?: number }>): Buffer {
  const locais: Buffer[] = []
  const centrais: Buffer[] = []
  let off = 0
  for (const e of entradas) {
    const metodo = e.metodo ?? 8
    const comp = metodo === 8 ? deflateRawSync(e.dados) : e.dados
    const nome = Buffer.from(e.nome)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(e.flags ?? 0, 6); lh.writeUInt16LE(metodo, 8)
    lh.writeUInt32LE(crc32(e.dados), 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(e.dados.length, 22); lh.writeUInt16LE(nome.length, 26)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(e.flags ?? 0, 8); ch.writeUInt16LE(metodo, 10)
    ch.writeUInt32LE(crc32(e.dados), 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(e.dados.length, 24); ch.writeUInt16LE(nome.length, 28); ch.writeUInt32LE(off, 42)
    locais.push(lh, nome, comp)
    centrais.push(ch, nome)
    off += 30 + nome.length + comp.length
  }
  const cd = Buffer.concat(centrais)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entradas.length, 8); eocd.writeUInt16LE(entradas.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16)
  return Buffer.concat([...locais, cd, eocd])
}
const CT = Buffer.from('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
const DOCX_OK = zip([{ nome: '[Content_Types].xml', dados: CT }, { nome: 'word/document.xml', dados: Buffer.from('<w:document/>') }])
const DOCX_MACRO = zip([{ nome: '[Content_Types].xml', dados: CT }, { nome: 'word/document.xml', dados: Buffer.from('<w:document/>') }, { nome: 'word/vbaProject.bin', dados: Buffer.from('vba') }])
const DOCX_MACROENABLED = zip([{ nome: '[Content_Types].xml', dados: Buffer.from(CT.toString().replace('document.main+xml', 'document.macroEnabled.main+xml')) }, { nome: 'word/document.xml', dados: Buffer.from('<w:document/>') }])
const ZIP_OK = zip([{ nome: 'leia-me.txt', dados: Buffer.from('olá') }, { nome: 'exame.pdf', dados: PDF_OK }])
const ZIP_EXE_NOME = zip([{ nome: 'instalar.exe', dados: Buffer.from('x') }])
const ZIP_EXE_CONTEUDO = zip([{ nome: 'relatorio.txt', dados: EXE }])
const ZIP_TRAVERSAL = zip([{ nome: '../../etc/passwd', dados: Buffer.from('x') }])
const ZIP_SENHA = zip([{ nome: 'a.txt', dados: Buffer.from('x'), flags: 1 }])
const ZIP_BOMB = zip([{ nome: 'zeros.txt', dados: Buffer.alloc(12 * 1024 * 1024) }])
const ZIP_ANINHADO_EXE = zip([{ nome: 'interno.zip', dados: ZIP_EXE_CONTEUDO }])
const OLE_BASE = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(512)])
const OLE_MACRO = Buffer.concat([OLE_BASE, Buffer.from('_VBA_PROJECT', 'utf16le')])

async function main() {
  // ====================================================================== TOTP
  secao('TOTP — vetores da RFC 6238 (SHA-1, 8 dígitos) e RFC 4226')
  const seg = Buffer.from('12345678901234567890')
  const vetores: Array<[number, string]> = [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']]
  for (const [t, esperado] of vetores) check(`RFC6238 t=${t}`, totp(seg, t * 1000, 8) === esperado, totp(seg, t * 1000, 8))
  const rfc4226 = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489']
  rfc4226.forEach((c, i) => check(`RFC4226 contador ${i}`, hotp(seg, i, 6) === c))
  check('base32 RFC4648', base32Encode(Buffer.from('12345678901234567890')) === 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
  check('base32 ida e volta', base32Decode(base32Encode(Buffer.from('segredo-de-teste'))).toString() === 'segredo-de-teste')
  const segB32 = gerarSegredoBase32()
  check('segredo gerado tem 32 caracteres base32', /^[A-Z2-7]{32}$/.test(segB32), segB32)
  const agora = 1_700_000_000_000
  const cod = totp(base32Decode(segB32), agora)
  check('verifica código atual', verificarTotp(segB32, cod, { agoraMs: agora }) !== null)
  check('janela +1 aceita', verificarTotp(segB32, totp(base32Decode(segB32), agora + 30_000), { agoraMs: agora }) !== null)
  check('janela -1 aceita', verificarTotp(segB32, totp(base32Decode(segB32), agora - 30_000), { agoraMs: agora }) !== null)
  check('janela +2 recusada', verificarTotp(segB32, totp(base32Decode(segB32), agora + 90_000), { agoraMs: agora }) === null)
  check('código errado recusado', verificarTotp(segB32, cod === '000000' ? '000001' : '000000', { agoraMs: agora }) === null)
  check('código com letras recusado', verificarTotp(segB32, 'abcdef', { agoraMs: agora }) === null)
  const passo = verificarTotp(segB32, cod, { agoraMs: agora })!
  check('anti-reutilização (ultimoPasso)', verificarTotp(segB32, cod, { agoraMs: agora, ultimoPasso: passo }) === null)

  secao('Cifra AES-256-GCM e chaves')
  const c1 = cifrar('segredo-super-secreto')
  check('cifrar/decifrar', decifrar(c1) === 'segredo-super-secreto' && !c1.includes('segredo-super'))
  check('cifras diferentes a cada vez (IV aleatório)', cifrar('x') !== cifrar('x'))
  let adulterado = false
  try { decifrar(c1.slice(0, -4) + 'AAAA') } catch { adulterado = true }
  check('adulteração detectada (GCM)', adulterado)
  process.env.SECURITY_ENC_KEY = 'a'.repeat(64)
  const c2 = cifrar('com chave nova')
  check('SECURITY_ENC_KEY usada', decifrar(c2) === 'com chave nova')
  check('segredo antigo (derivado de JWT_SECRET) ainda decifra após adotar SECURITY_ENC_KEY', decifrar(c1) === 'segredo-super-secreto')
  delete process.env.SECURITY_ENC_KEY
  {
    const j = process.env.JWT_SECRET
    const ne = process.env.NODE_ENV
    delete process.env.JWT_SECRET
    process.env.NODE_ENV = 'production'
    let msg = ''
    try { cifrar('x') } catch (e: any) { msg = String(e.message) }
    check('produção sem SECURITY_ENC_KEY nem JWT_SECRET falha com mensagem clara', /SECURITY_ENC_KEY/.test(msg), msg)
    process.env.JWT_SECRET = j
    process.env.NODE_ENV = ne
  }

  secao('Política de senha forte')
  check('curta recusada', !validarSenhaForte('Abc123!').ok)
  check('comum recusada', !validarSenhaForte('password123').ok && !validarSenhaForte('Senha123456').ok)
  check('"1234567890" recusada', !validarSenhaForte('1234567890').ok)
  check('"qwertyuiop" recusada', !validarSenhaForte('qwertyuiop').ok)
  check('repetitiva recusada', !validarSenhaForte('aaaaaaaaaaaa').ok)
  check('contém e-mail recusada', !validarSenhaForte('joaosilva2026!', { email: 'joaosilva@x.com' }).ok)
  check('forte aceita', validarSenhaForte('Cavalo-Bateria-Grampo-42').ok)
  check('forte curta (10) aceita', validarSenhaForte('r7K!m2Qz9x').ok)

  // ====================================================================== URL / SSRF
  secao('URLs externas (SSRF)')
  const urlsRuins = ['http://exemplo.com/a.pdf', 'https://localhost/a', 'https://127.0.0.1/a', 'https://10.0.0.5/a', 'https://192.168.1.1/a', 'https://172.16.0.1/a', 'https://169.254.169.254/latest/meta-data',
    'https://[::1]/a', 'https://[fd00::1]/a', 'https://[::ffff:127.0.0.1]/a', 'https://2130706433/a', 'https://0x7f.0.0.1/a', 'javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'file:///etc/passwd',
    'ftp://x.com/a', 'https://user:pass@exemplo.com/a', 'https://servidor.internal/a', 'https://impressora.local/a', 'https://semdominio/a', '']
  for (const u of urlsRuins) check(`URL recusada: ${u || '(vazia)'}`, !validarUrlExterna(u).ok)
  for (const u of ['https://exemplo.com/arquivo.pdf', 'https://cdn.universidade.edu.br/x/y?z=1', 'https://8.8.8.8/x']) check(`URL aceita: ${u}`, validarUrlExterna(u).ok)

  // ====================================================================== moderação de texto
  secao('Moderação de texto')
  check('termos médicos legítimos passam', moderarTexto('Aula de anatomia do sistema reprodutor, educação sexual e mama. Sexo biológico e saúde sexual.').acao === 'OK')
  check('domínio adulto bloqueia', moderarTexto('veja em https://www.pornhub.com/xyz').acao === 'BLOQUEAR')
  check('subdomínio adulto bloqueia', moderarTexto('acesse br.xvideos.com agora').acao === 'BLOQUEAR')
  check('javascript: bloqueia', moderarTexto('clique javascript:alert(1)').acao === 'BLOQUEAR')
  check('URL encurtada = revisar', moderarTexto('confira https://bit.ly/3abcde').acao === 'REVISAR')
  check('punycode = revisar', moderarTexto('entre em https://xn--pypal-4ve.com/login').acao === 'REVISAR')
  check('homoglifo = revisar', moderarTexto('https://pаypal.com/entrar').acao === 'REVISAR')
  check('link com IP = revisar', moderarTexto('http://203.0.113.9/login').acao === 'REVISAR')
  check('phishing por frase = revisar', moderarTexto('Sua conta será bloqueada hoje! Atualize seus dados agora, clique no link.').acao === 'REVISAR')
  check('link normal passa', moderarTexto('Veja o edital em https://www.universidade.edu.br/edital.pdf').acao === 'OK')

  // ====================================================================== scanUpload (local)
  secao('scanUpload — arquivos válidos')
  const v = (b: Buffer, nome?: string, mime?: string, permitir?: any) => analisarLocal(b, { filename: nome, declaredMime: mime, permitir })
  check('PNG válido', v(PNG, 'foto.png', 'image/png').veredito === 'LIMPO', v(PNG, 'foto.png', 'image/png'))
  check('JPEG válido', v(JPEG, 'foto.jpg', 'image/jpeg').veredito === 'LIMPO', v(JPEG, 'foto.jpg', 'image/jpeg'))
  check('JPEG com mime image/jpg (alias)', v(JPEG, 'foto.jpeg', 'image/jpg').ok)
  check('PDF válido', v(PDF_OK, 'laudo.pdf', 'application/pdf').veredito === 'LIMPO', v(PDF_OK, 'laudo.pdf'))
  check('PDF com OpenAction /Fit (comum) passa', v(PDF_OPEN_FIT, 'a.pdf').ok)
  check('SVG limpo', v(SVG_OK, 'logo.svg', 'image/svg+xml').ok)
  check('DOCX limpo', v(DOCX_OK, 'ata.docx').ok && v(DOCX_OK, 'ata.docx').tipo === 'docx', v(DOCX_OK, 'ata.docx'))
  check('ZIP limpo', v(ZIP_OK, 'exames.zip', 'application/zip').ok, v(ZIP_OK, 'exames.zip'))
  check('texto/CSV', v(Buffer.from('nome;idade\nAna;30\n'), 'alunos.csv', 'application/vnd.ms-excel').ok && v(Buffer.from('olá mundo'), 'a.txt', 'text/plain').ok)
  check('nome com ".com" no meio e PDF real passa', v(PDF_OK, 'contrato.empresa.com.pdf').ok)
  check('sem nome (só conteúdo) passa', v(PNG, undefined, 'image/png').ok)
  check('categoria não permitida neste campo', !v(PDF_OK, 'a.pdf', 'application/pdf', ['imagem']).ok)

  secao('scanUpload — bloqueios')
  const bloqueia = (nome: string, r: ReturnType<typeof v>, trecho?: RegExp) => check(nome, r.veredito === 'BLOQUEADO' && (!trecho || trecho.test(r.motivos.join(' | '))), r.motivos)
  bloqueia('exe renomeado .pdf', v(EXE, 'fatura.pdf', 'application/pdf'), /Windows/)
  bloqueia('exe renomeado .png', v(EXE, 'foto.png', 'image/png'))
  bloqueia('ELF renomeado .jpg', v(ELF, 'foto.jpg'), /ELF/)
  bloqueia('script com shebang', v(Buffer.from('#!/bin/sh\nrm -rf /\n'), 'leia.txt'), /shebang/)
  bloqueia('dupla extensão .pdf.exe', v(PDF_OK, 'contrato.pdf.exe'), /\.exe/)
  bloqueia('dupla extensão .jpg.js', v(PNG, 'foto.jpg.js'))
  bloqueia('dupla extensão .exe.pdf (intermediária)', v(PDF_OK, 'setup.exe.pdf'), /dupla extensão/)
  for (const e of ['exe', 'dll', 'bat', 'cmd', 'ps1', 'sh', 'js', 'vbs', 'jar', 'msi', 'scr', 'lnk', 'apk', 'docm', 'xlsm', 'html', 'hta']) bloqueia(`extensão .${e}`, v(Buffer.from('x'), `arquivo.${e}`), new RegExp(`\\.${e}`))
  bloqueia('RTLO no nome', v(PDF_OK, 'doc‮fdp.exe'))
  bloqueia('nome terminando em ponto', v(PDF_OK, 'doc.pdf.'))
  bloqueia('divergência extensão x conteúdo (PNG chamado .jpg)', v(PNG, 'foto.jpg'), /divergência/)
  bloqueia('divergência mime x conteúdo (PDF declarado image/png)', v(PDF_OK, 'a.pdf', 'image/png'), /divergência/)
  bloqueia('mime de executável declarado', v(PDF_OK, 'a.pdf', 'application/x-msdownload'))
  bloqueia('extensão desconhecida', v(PNG, 'foto.xyz'))
  bloqueia('arquivo vazio', v(Buffer.alloc(0), 'a.txt'))
  bloqueia('binário desconhecido', v(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 0, 0, 9]), 'a.bin'))
  bloqueia('PDF com /JavaScript', v(PDF_JS, 'a.pdf'), /JavaScript/)
  bloqueia('PDF com /JavaScript ofuscado (#61)', v(PDF_JS_OBF, 'a.pdf'), /JavaScript/)
  bloqueia('PDF com /Launch', v(PDF_LAUNCH, 'a.pdf'), /Launch/)
  bloqueia('PDF com /OpenAction URI', v(PDF_OPEN_URI, 'a.pdf'), /OpenAction/)
  bloqueia('PDF com /EmbeddedFile', v(PDF_EMBED, 'a.pdf'), /embutido/)
  bloqueia('PDF com JS dentro de ObjStm comprimido', v(PDF_OBJSTM_JS, 'a.pdf'), /fluxo comprimido/)
  bloqueia('SVG com <script>', v(SVG_SCRIPT, 'a.svg'), /script/)
  bloqueia('SVG com onload=', v(SVG_ONLOAD, 'a.svg'), /evento/)
  bloqueia('SVG com foreignObject', v(SVG_FO, 'a.svg'), /foreignObject/)
  bloqueia('SVG com javascript: em href', v(SVG_JSHREF, 'a.svg'))
  bloqueia('HTML disfarçado de .txt', v(Buffer.from('<!DOCTYPE html><html><body>oi</body></html>'), 'a.txt'), /HTML/)
  bloqueia('HTML com <script> disfarçado de .png (conteúdo texto)', v(Buffer.from('<html><script>alert(1)</script></html>'), 'a.png'))
  bloqueia('EICAR (.txt)', v(EICAR, 'teste.txt'), /EICAR/)
  bloqueia('EICAR (sem nome)', v(EICAR), /EICAR/)
  bloqueia('EICAR dentro do ZIP', v(zip([{ nome: 'a.txt', dados: EICAR }]), 'a.zip'), /EICAR/)
  bloqueia('polyglot PNG + <script>', v(Buffer.concat([PNG, Buffer.from('<script>alert(1)</script>')]), 'a.png'), /polyglot/)
  bloqueia('polyglot PNG + PDF', v(Buffer.concat([PNG, PDF_OK]), 'a.png'), /polyglot/)
  bloqueia('polyglot JPEG + ZIP', v(Buffer.concat([JPEG, ZIP_OK]), 'a.jpg'), /polyglot/)
  bloqueia('PDF com lixo antes do cabeçalho', v(Buffer.concat([Buffer.alloc(200, 0x20), PDF_OK]), 'a.pdf'), /antes do cabeçalho/)
  bloqueia('PNG com dimensões absurdas', v(Buffer.concat([PNG.subarray(0, 16), Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00]), PNG.subarray(24)]), 'a.png'), /dimensões/)
  bloqueia('DOCX com vbaProject.bin', v(DOCX_MACRO, 'a.docx'), /macro/)
  bloqueia('DOCX macroEnabled', v(DOCX_MACROENABLED, 'a.docx'), /macro/)
  bloqueia('OLE (.doc) com macros', v(OLE_MACRO, 'a.doc'), /macro/)
  check('OLE (.doc) sem macros passa', v(OLE_BASE, 'a.doc').ok)
  bloqueia('ZIP com .exe', v(ZIP_EXE_NOME, 'a.zip'), /\.exe/)
  bloqueia('ZIP com executável disfarçado de .txt', v(ZIP_EXE_CONTEUDO, 'a.zip'), /Windows/)
  bloqueia('ZIP aninhado com executável', v(ZIP_ANINHADO_EXE, 'a.zip'), /Windows|\.exe/)
  bloqueia('ZIP path traversal', v(ZIP_TRAVERSAL, 'a.zip'), /traversal/)
  bloqueia('ZIP protegido por senha', v(ZIP_SENHA, 'a.zip'), /senha/)
  bloqueia('ZIP bomb (12 MB de zeros)', v(ZIP_BOMB, 'a.zip'), /zip-bomb/)
  check('zip-bomb ocupa pouco (arquivo pequeno)', ZIP_BOMB.length < 100_000, ZIP_BOMB.length)
  bloqueia('RTF com objeto embutido', v(Buffer.from('{\\rtf1{\\object\\objemb{\\*\\objdata 0105}}}'), 'a.rtf'), /RTF/)
  bloqueia('planilha CSV com DDE', v(Buffer.from('a,b\n=cmd|\' /C calc\'!A0,2\n'), 'a.csv'), /DDE|fórmula/)
  bloqueia('texto com PowerShell codificado', v(Buffer.from('powershell -enc AAAA'), 'a.txt'))
  check('CSV com HYPERLINK = suspeito (aceita)', (() => { const r = v(Buffer.from('a\n=HYPERLINK("http://x.com","clique")\n'), 'a.csv'); return r.ok && r.veredito === 'SUSPEITO' })())
  check('limite de tamanho por categoria', !analisarLocal(Buffer.concat([Buffer.from('x'.repeat(5 * 1024 * 1024 + 1))]), { filename: 'a.txt' }).ok)

  // ====================================================================== scanUpload (data URL, URL, camadas externas simuladas)
  secao('scanUpload — data URL e URL')
  const dataUrl = (b: Buffer, mime: string) => `data:${mime};base64,${b.toString('base64')}`
  const ctx = { registrar: false as const }
  check('data URL PNG ok', (await scanUpload({ filename: 'a.png', data: dataUrl(PNG, 'image/png'), contexto: ctx })).ok)
  check('data URL com mime que mente', !(await scanUpload({ data: dataUrl(EXE, 'image/png'), contexto: ctx })).ok)
  check('data URL inválida', !(await scanUpload({ data: 'data:image/png;base64', contexto: ctx })).ok)
  check('data:text/html bloqueado', !(await scanUpload({ data: 'data:text/html;base64,' + Buffer.from('<script>1</script>').toString('base64'), contexto: ctx })).ok)
  check('URL https pública ok', (await scanUpload({ url: 'https://exemplo.com/a.pdf', contexto: ctx })).ok)
  check('URL apontando para .exe bloqueada', !(await scanUpload({ url: 'https://exemplo.com/setup.exe', contexto: ctx })).ok)
  check('URL interna bloqueada', !(await scanUpload({ url: 'https://127.0.0.1/a.pdf', contexto: ctx })).ok)
  check('URL com domínio adulto bloqueada', !(await scanUpload({ url: 'https://www.xvideos.com/a', contexto: ctx })).ok)

  secao('ClamAV simulado (clamd TCP / INSTREAM)')
  const clam = net.createServer((sock) => {
    let acc = Buffer.alloc(0)
    sock.on('data', (d) => {
      acc = Buffer.concat([acc, d])
      if (acc.length >= 4 && acc.subarray(acc.length - 4).equals(Buffer.alloc(4)) && acc.includes('zINSTREAM')) {
        sock.end(acc.includes('CLAMTESTVIRUS') ? 'stream: Fake.Test.Sig FOUND\0' : 'stream: OK\0')
      }
    })
  })
  await new Promise<void>((res) => clam.listen(0, '127.0.0.1', res))
  const clamPort = (clam.address() as any).port
  process.env.CLAMAV_HOST = '127.0.0.1'
  process.env.CLAMAV_PORT = String(clamPort)
  const txtVirus = Buffer.from('relatorio CLAMTESTVIRUS fim')
  const rv = await scanUpload({ filename: 'a.txt', data: txtVirus, contexto: ctx })
  check('ClamAV detecta e bloqueia', !rv.ok && /ClamAV/.test(rv.motivo || ''), rv)
  check('ClamAV limpo passa', (await scanUpload({ filename: 'a.txt', data: Buffer.from('arquivo limpo'), contexto: ctx })).ok)
  clam.close()
  process.env.CLAMAV_PORT = '1' // porta fechada: indisponível NÃO derruba o fluxo
  const rf = await scanUpload({ filename: 'a.txt', data: Buffer.from('arquivo limpo 2'), contexto: ctx })
  check('ClamAV indisponível = fail-open com aviso', rf.ok && rf.avisos.some((a) => /ClamAV indisponível/.test(a)), rf)
  delete process.env.CLAMAV_HOST; delete process.env.CLAMAV_PORT

  const fetchReal = globalThis.fetch
  secao('VirusTotal e visão (fetch simulado)')
  let vtMalicious = 7
  let vtFalha = false
  let visao: any = { sexual_explicito: false, violencia_grafica: false, menor_sexualizado: false, duvida: false, motivo: 'ok' }
  let visaoFalha = false
  let chamadasVisao = 0
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input?.url || input)
    if (url.includes('virustotal.com')) {
      if (vtFalha) throw Object.assign(new Error('rede'), { name: 'TimeoutError' })
      return new Response(JSON.stringify({ data: { attributes: { last_analysis_stats: { malicious: vtMalicious } } } }), { status: 200 })
    }
    if (url.includes('api.anthropic.com')) {
      chamadasVisao++
      if (visaoFalha) return new Response(JSON.stringify({ error: { message: 'overloaded' } }), { status: 529 })
      const corpo = JSON.parse(init.body)
      const temImagem = corpo.messages[0].content.some((c: any) => c.type === 'image' && c.source.type === 'base64')
      return new Response(JSON.stringify({ content: [{ type: 'text', text: temImagem ? '```json\n' + JSON.stringify(visao) + '\n```' : '{}' }] }), { status: 200 })
    }
    return fetchReal(input, init)
  }) as any
  process.env.VIRUSTOTAL_API_KEY = 'vt-test'
  const vt1 = await scanUpload({ filename: 'a.txt', data: Buffer.from('conteudo para vt 1'), contexto: ctx })
  check('VirusTotal com detecções bloqueia', !vt1.ok && /VirusTotal/.test(vt1.motivo || ''), vt1)
  vtMalicious = 0
  check('VirusTotal sem detecções passa', (await scanUpload({ filename: 'a.txt', data: Buffer.from('conteudo para vt 2'), contexto: ctx })).ok)
  vtFalha = true
  const vt3 = await scanUpload({ filename: 'a.txt', data: Buffer.from('conteudo para vt 3'), contexto: ctx })
  check('VirusTotal indisponível = fail-open', vt3.ok && vt3.avisos.some((a) => /VirusTotal indisponível/.test(a)), vt3)
  delete process.env.VIRUSTOTAL_API_KEY

  process.env.ANTHROPIC_API_KEY = 'sk-test'
  process.env.UPLOAD_MODERATION = 'flag'
  check('imagem limpa pela IA passa', (await scanUpload({ filename: 'a.png', data: PNG, contexto: ctx })).veredito === 'LIMPO')
  visao = { sexual_explicito: true, violencia_grafica: false, menor_sexualizado: false, duvida: false, motivo: 'nudez' }
  const mod1 = await scanUpload({ filename: 'b.png', data: Buffer.concat([PNG.subarray(0, PNG.length - 12), Buffer.from('xx'), PNG.subarray(PNG.length - 12)]), contexto: ctx })
  check('imagem sexual explícita bloqueada pela IA', !mod1.ok && /moderação/.test(mod1.motivo || ''), mod1)
  visao = { sexual_explicito: false, violencia_grafica: true, menor_sexualizado: false, duvida: false, motivo: 'gore' }
  check('violência gráfica bloqueada pela IA', !(await scanUpload({ filename: 'c.png', data: JPEG, contexto: ctx })).ok)
  visao = { sexual_explicito: false, violencia_grafica: false, menor_sexualizado: false, duvida: true, motivo: 'incerto' }
  const mod3 = await scanUpload({ filename: 'd.jpg', data: Buffer.concat([JPEG, Buffer.from([0])]), declaredMime: 'image/jpeg', contexto: ctx })
  check('imagem duvidosa = SUSPEITO (aceita p/ revisão)', mod3.ok && mod3.veredito === 'SUSPEITO', mod3)
  visao = { sexual_explicito: false, violencia_grafica: false, menor_sexualizado: false, duvida: false, motivo: 'foto clínica intraoral' }
  visaoFalha = true
  const mod4 = await scanUpload({ filename: 'e.png', data: Buffer.concat([PNG.subarray(0, PNG.length - 12), Buffer.from('yy'), PNG.subarray(PNG.length - 12)]), contexto: ctx })
  check('IA indisponível + política flag = aceita (SUSPEITO)', mod4.ok && mod4.veredito === 'SUSPEITO' && /indispon/.test(mod4.motivo || ''), mod4)
  process.env.UPLOAD_MODERATION = 'strict'
  const mod5 = await scanUpload({ filename: 'f.png', data: Buffer.concat([PNG.subarray(0, PNG.length - 12), Buffer.from('zz'), PNG.subarray(PNG.length - 12)]), contexto: ctx })
  check('IA indisponível + política strict = recusa imagem', !mod5.ok, mod5)
  check('strict não afeta PDF', (await scanUpload({ filename: 'a.pdf', data: PDF_OK, contexto: ctx })).ok)
  process.env.UPLOAD_MODERATION = 'off'
  const antes = chamadasVisao
  check('política off não chama a IA', (await scanUpload({ filename: 'g.png', data: Buffer.concat([PNG.subarray(0, PNG.length - 12), Buffer.from('ww'), PNG.subarray(PNG.length - 12)]), contexto: ctx })).ok && chamadasVisao === antes)
  delete process.env.ANTHROPIC_API_KEY
  process.env.UPLOAD_MODERATION = 'flag'
  const mod6 = await scanUpload({ filename: 'h.png', data: Buffer.concat([PNG.subarray(0, PNG.length - 12), Buffer.from('vv'), PNG.subarray(PNG.length - 12)]), contexto: ctx })
  check('sem ANTHROPIC_API_KEY + flag = aceita', mod6.ok, mod6)
  process.env.UPLOAD_MODERATION = 'off'
  globalThis.fetch = fetchReal

  // ====================================================================== HTTP
  secao('HTTP — login, 2FA, bloqueio, origem, uploads')
  const { default: app } = await import('../../src/app')
  const server = http.createServer(app).listen(0)
  const base = `http://127.0.0.1:${(server.address() as any).port}/api`
  const S = Math.random().toString(36).slice(2, 7)
  const tenantId = `seg-${S}`
  const outroTenant = `seg-b-${S}`
  const clinic = await prisma.clinic.create({ data: { tenantId, name: 'Seg ' + S, email: `s${S}@q.com`, phone: '1', cnpj: '00.000.000/0001-0' + (S.charCodeAt(0) % 10) } as any })
  const clinicB = await prisma.clinic.create({ data: { tenantId: outroTenant, name: 'SegB ' + S, email: `sb${S}@q.com`, phone: '1', cnpj: '11.000.000/0001-0' + (S.charCodeAt(1) % 10) } as any })
  const SENHA = 'Cavalo-Bateria-Grampo-42'
  const hash = await bcrypt.hash(SENHA, 4)
  const mkUser = (clinicId: string, tid: string, role: string, tag: string) => prisma.user.create({ data: { clinicId, tenantId: tid, email: `${tag}.${S}@seg.test`, password: hash, firstName: tag, lastName: 'Teste', role: role as any } as any })
  const uAdmin = await mkUser(clinic.id, tenantId, 'ADMIN', 'admin')
  const uSem2fa = await mkUser(clinic.id, tenantId, 'TEACHER', 'prof')
  const uCom2fa = await mkUser(clinic.id, tenantId, 'SECRETARY', 'sec')
  const uCoord = await mkUser(clinic.id, tenantId, 'COORDINATOR', 'coord')
  const uBloq = await mkUser(clinic.id, tenantId, 'STAFF', 'bloq')
  const uAdminB = await mkUser(clinicB.id, outroTenant, 'ADMIN', 'adminb')
  const tokenDe = (u: any) => jwt.sign({ id: u.id, email: u.email, clinicId: u.clinicId, tenantId: u.tenantId, role: u.role }, process.env.JWT_SECRET!)

  const req = async (method: string, path: string, body?: any, headers: Record<string, string> = {}) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined })
    const text = await r.text()
    let json: any = null
    try { json = JSON.parse(text) } catch { /* não-JSON */ }
    if (r.status >= 500) { fails.push(`5xx ${method} ${path}: ${text.slice(0, 200)}`); console.log('  5XX', method, path, text.slice(0, 200)) }
    return { status: r.status, json, text, headers: r.headers }
  }
  const auth = (t: string) => ({ authorization: `Bearer ${t}` })
  const login = (u: any, senha = SENHA, extra: any = {}) => req('POST', '/auth/login', { email: u.email, password: senha, clinicId: u.clinicId, ...extra })

  // relógio simulado (avança em passos de 30 s para gerar códigos TOTP novos sem esperar)
  const relogioReal = Date.now
  let deslocamento = 0
  Date.now = () => relogioReal() + deslocamento
  const avancar = (s: number) => { deslocamento += s * 1000 }

  // ---- login SEM 2FA: exatamente como antes
  let r = await login(uSem2fa)
  check('login sem 2FA: 200 com token e user (contrato atual)', r.status === 200 && !!r.json?.token && r.json?.user?.email === uSem2fa.email && !('requires2fa' in (r.json || {})) && !r.json?.user?.password, r.text)
  const tokenProf = r.json?.token
  r = await req('GET', '/auth/me', undefined, auth(tokenProf))
  check('token normal acessa a API', r.status === 200, r.text)
  r = await login(uSem2fa, 'senha-errada-123')
  check('senha errada: 401 genérico', r.status === 401 && r.json?.error === 'Usuário ou senha inválidos.', r.text)
  r = await req('POST', '/auth/login', { email: `naoexiste.${S}@seg.test`, password: 'qualquer-coisa-1', clinicId: clinic.id })
  check('e-mail inexistente: mesma mensagem 401', r.status === 401 && r.json?.error === 'Usuário ou senha inválidos.', r.text)
  const ev1 = await prisma.segEvento.count({ where: { tenantId, tipo: 'login_falho' } })
  check('login falho registrado em SegEvento', ev1 >= 1, ev1)
  const evSemSegredo = await prisma.segEvento.findMany({ where: { tenantId }, take: 50 })
  check('SegEvento não contém senha', !JSON.stringify(evSemSegredo).includes('senha-errada-123'))

  // ---- bloqueio temporário progressivo (usuário e e-mail inexistente)
  secao('Bloqueio progressivo de login')
  for (let i = 0; i < 5; i++) await login(uBloq, 'errada-' + i + 'xyz')
  r = await login(uBloq)
  check('após 5 falhas: 429 mesmo com senha correta', r.status === 429 && !!r.headers.get('retry-after') && /Muitas tentativas/.test(r.json?.error || ''), r.text)
  let tent = await prisma.segTentativaLogin.findFirst({ where: { escopo: 'login', chave: uBloq.email } })
  const min1 = (tent!.bloqueadoAte!.getTime() - Date.now()) / 60000
  check('1º bloqueio ≈ 15 min', min1 > 14 && min1 <= 15.1 && tent!.nivel === 1, { min1, nivel: tent?.nivel })
  check('evento login_bloqueado registrado', (await prisma.segEvento.count({ where: { tenantId, tipo: 'login_bloqueado' } })) >= 1)
  for (let i = 0; i < 5; i++) await req('POST', '/auth/login', { email: `fantasma.${S}@seg.test`, password: 'x' + i + 'yyyyyyy' })
  r = await req('POST', '/auth/login', { email: `fantasma.${S}@seg.test`, password: 'qualquer12345' })
  check('e-mail INEXISTENTE também bloqueia (não revela existência)', r.status === 429, r.text)
  await prisma.segTentativaLogin.update({ where: { id: tent!.id }, data: { bloqueadoAte: new Date(Date.now() - 1000) } })
  r = await login(uBloq)
  check('bloqueio expirado: login volta a funcionar e zera contagem', r.status === 200 && (await prisma.segTentativaLogin.count({ where: { escopo: 'login', chave: uBloq.email } })) === 0, r.text)
  for (let i = 0; i < 5; i++) await login(uBloq, 'errada-' + i + 'abc')
  tent = await prisma.segTentativaLogin.findFirst({ where: { escopo: 'login', chave: uBloq.email } })
  check('bloqueio fica 429 novamente', (await login(uBloq)).status === 429)
  // progressão: simula histórico (nível 1 já ocorrido) e verifica 1 hora
  await prisma.segTentativaLogin.update({ where: { id: tent!.id }, data: { bloqueadoAte: new Date(Date.now() - 1000), nivel: 1, falhas: 0 } })
  for (let i = 0; i < 5; i++) await login(uBloq, 'errada-' + i + 'def')
  tent = await prisma.segTentativaLogin.findFirst({ where: { escopo: 'login', chave: uBloq.email } })
  const min2 = (tent!.bloqueadoAte!.getTime() - Date.now()) / 60000
  check('2º bloqueio ≈ 1 hora (progressivo)', min2 > 59 && min2 <= 60.1 && tent!.nivel === 2, { min2, nivel: tent?.nivel })

  // ---- 2FA: configuração
  secao('2FA — configuração, login, recuperação')
  const tokenSec = tokenDe(uCom2fa)
  r = await req('GET', '/security/2fa/status', undefined, auth(tokenSec))
  check('status inicial: desativado', r.status === 200 && r.json?.enabled === false && r.json?.requiredByRole === false, r.text)
  r = await req('GET', '/security/2fa/status')
  check('status sem token: 401', r.status === 401)
  r = await req('POST', '/security/2fa/setup/start', {}, auth(tokenSec))
  const segredo: string = r.json?.secret
  check('setup/start devolve segredo base32 e otpauth://', r.status === 200 && /^[A-Z2-7]{32}$/.test(segredo) && /^otpauth:\/\/totp\//.test(r.json?.otpauthUrl) && r.json.otpauthUrl.includes('secret=' + segredo), r.text)
  const reg = await prisma.segDoisFatores.findUnique({ where: { userId: uCom2fa.id } })
  check('segredo guardado CIFRADO (não em claro)', !!reg && !reg.segredoCifrado.includes(segredo) && reg.ativadoEm === null)
  r = await login(uCom2fa)
  check('login com configuração pendente (não confirmada) segue sem 2FA', r.status === 200 && !!r.json?.token, r.text)
  r = await req('POST', '/security/2fa/setup/confirm', { code: '000000' }, auth(tokenSec))
  check('confirmar com código errado: 400', r.status === 400, r.text)
  const codConf = totp(base32Decode(segredo), Date.now())
  r = await req('POST', '/security/2fa/setup/confirm', { code: codConf }, auth(tokenSec))
  const recovery: string[] = r.json?.recoveryCodes || []
  check('confirmar ativa e devolve 8 códigos de recuperação', r.status === 200 && r.json?.enabled === true && recovery.length === 8 && recovery.every((c) => /^[a-z2-9]{5}-[a-z2-9]{5}$/.test(c)), r.text)
  const reg2 = await prisma.segDoisFatores.findUnique({ where: { userId: uCom2fa.id } })
  check('códigos guardados só com hash', !!reg2?.ativadoEm && !JSON.stringify(reg2.codigosRecuperacao).includes(recovery[0]) && (reg2.codigosRecuperacao as any[]).length === 8)
  r = await req('GET', '/security/2fa/status', undefined, auth(tokenSec))
  check('status: ativo, 8 códigos restantes', r.json?.enabled === true && r.json?.recoveryCodesRemaining === 8, r.text)
  r = await req('POST', '/security/2fa/setup/start', {}, auth(tokenSec))
  check('setup/start com 2FA ativo: 409', r.status === 409)

  // ---- login COM 2FA
  r = await login(uCom2fa)
  const desafio: string = r.json?.challengeToken
  check('login com 2FA: 200 {requires2fa, challengeToken} e SEM token de sessão', r.status === 200 && r.json?.requires2fa === true && !!desafio && !r.json?.token && !r.json?.user, r.text)
  r = await req('GET', '/auth/me', undefined, auth(desafio))
  check('challengeToken NÃO dá acesso à API', r.status === 401, r.text)
  r = await req('GET', '/edu/core/instituicao', undefined, auth(desafio))
  check('challengeToken NÃO dá acesso a /edu', r.status === 401)
  r = await req('GET', '/security/2fa/status', undefined, auth(desafio))
  check('challengeToken NÃO dá acesso às rotas de segurança', r.status === 401)
  const desafioJwt: any = jwt.decode(desafio)
  check('challengeToken: escopo 2fa, curto (5 min)', desafioJwt?.scope === '2fa' && desafioJwt.exp - desafioJwt.iat === 300, desafioJwt)
  r = await req('POST', '/auth/2fa/verify', { challengeToken: desafio, code: '123456' })
  check('verify com código errado: 401', r.status === 401 && !r.json?.token, r.text)
  r = await req('POST', '/auth/2fa/verify', { challengeToken: 'lixo', code: '123456' })
  check('verify com token inválido: 401', r.status === 401)
  r = await req('POST', '/auth/2fa/verify', { challengeToken: tokenSec, code: totp(base32Decode(segredo), Date.now()) })
  check('verify com token de sessão (escopo errado): 401', r.status === 401)
  // a ativação já consumiu o passo atual; o próximo passo (+30 s) está dentro da janela ±1 e é aceito
  avancar(30)
  const codVerify = totp(base32Decode(segredo), Date.now())
  r = await req('POST', '/auth/2fa/verify', { challengeToken: desafio, code: codVerify })
  check('verify com TOTP correto: 200 com token, user e demo', r.status === 200 && !!r.json?.token && r.json?.user?.id === uCom2fa.id && !r.json?.user?.password, r.text)
  r = await req('GET', '/auth/me', undefined, auth(r.json?.token))
  check('token obtido no verify acessa a API', r.status === 200)
  r = await login(uCom2fa)
  r = await req('POST', '/auth/2fa/verify', { challengeToken: r.json.challengeToken, code: codVerify })
  check('reutilizar o MESMO código TOTP é recusado (anti-replay)', r.status === 401, r.text)

  // ---- recuperação (uso único)
  r = await login(uCom2fa)
  const ch2 = r.json.challengeToken
  r = await req('POST', '/auth/2fa/verify', { challengeToken: ch2, recoveryCode: recovery[0] })
  check('código de recuperação entra e informa quantos restam', r.status === 200 && !!r.json?.token && r.json?.recoveryCodesRemaining === 7, r.text)
  r = await login(uCom2fa)
  r = await req('POST', '/auth/2fa/verify', { challengeToken: r.json.challengeToken, recoveryCode: recovery[0] })
  check('código de recuperação é de USO ÚNICO', r.status === 401, r.text)
  r = await login(uCom2fa)
  r = await req('POST', '/auth/2fa/verify', { challengeToken: r.json.challengeToken, recoveryCode: recovery[1].toUpperCase().replace('-', ' ') })
  check('recuperação aceita maiúsculas/separador diferente', r.status === 200, r.text)
  check('evento de uso de código de recuperação registrado', (await prisma.segEvento.count({ where: { userId: uCom2fa.id, tipo: '2fa_codigo_recuperacao_usado' } })) === 2)
  // uso concorrente do mesmo código: só um vence
  const chs = await Promise.all([login(uCom2fa), login(uCom2fa)])
  const conc = await Promise.all(chs.map((c) => req('POST', '/auth/2fa/verify', { challengeToken: c.json.challengeToken, recoveryCode: recovery[2] })))
  check('uso concorrente do mesmo código de recuperação: exatamente um sucesso', conc.filter((x) => x.status === 200).length === 1, conc.map((x) => x.status))

  // ---- limite de tentativas no verify (5/15 min por usuário+IP)
  secao('2FA — limite de tentativas')
  await prisma.segTentativaLogin.deleteMany({ where: { escopo: '2fa', chave: uCom2fa.id } })
  r = await login(uCom2fa)
  const chL = r.json.challengeToken
  const sts: number[] = []
  for (let i = 0; i < 5; i++) sts.push((await req('POST', '/auth/2fa/verify', { challengeToken: chL, code: '11111' + i })).status)
  r = await req('POST', '/auth/2fa/verify', { challengeToken: chL, code: totp(base32Decode(segredo), Date.now() + 60_000 > Date.now() ? Date.now() + 30_000 : Date.now()) })
  check('5 códigos errados -> próximo (mesmo certo) é 429', sts.every((s) => s === 401) && r.status === 429, { sts, last: r.status, body: r.text })
  check('evento 2fa_bloqueado registrado', (await prisma.segEvento.count({ where: { userId: uCom2fa.id, tipo: '2fa_bloqueado' } })) >= 1)
  await prisma.segTentativaLogin.deleteMany({ where: { escopo: '2fa', chave: uCom2fa.id } })

  // ---- regenerar códigos / desativar
  secao('2FA — regenerar códigos e desativar')
  const novoCodigo = () => { avancar(30); return totp(base32Decode(segredo), Date.now()) }
  r = await req('POST', '/security/2fa/recovery-codes/regenerate', { password: 'errada-errada', code: novoCodigo() }, auth(tokenSec))
  check('regenerar com senha errada: 401', r.status === 401, r.text)
  r = await req('POST', '/security/2fa/recovery-codes/regenerate', { password: SENHA, code: novoCodigo() }, auth(tokenSec))
  const recovery2: string[] = r.json?.recoveryCodes || []
  check('regenerar devolve 8 novos códigos', r.status === 200 && recovery2.length === 8 && !recovery2.includes(recovery[3]), r.text)
  r = await login(uCom2fa)
  r = await req('POST', '/auth/2fa/verify', { challengeToken: r.json.challengeToken, recoveryCode: recovery[3] })
  check('códigos antigos deixam de valer após regenerar', r.status === 401)
  r = await req('POST', '/security/2fa/disable', { password: SENHA, code: '000000' }, auth(tokenSec))
  check('desativar com código errado: 401', r.status === 401)
  r = await req('POST', '/security/2fa/disable', { password: 'errada-errada', code: novoCodigo() }, auth(tokenSec))
  check('desativar com senha errada: 401', r.status === 401)
  await prisma.segTentativaLogin.deleteMany({ where: { escopo: '2fa', chave: uCom2fa.id } })
  r = await req('POST', '/security/2fa/disable', { password: SENHA, code: novoCodigo() }, auth(tokenSec))
  check('desativar com senha + código: 200', r.status === 200 && r.json?.enabled === false, r.text)
  r = await login(uCom2fa)
  check('após desativar, login volta ao fluxo normal', r.status === 200 && !!r.json?.token && !r.json?.requires2fa, r.text)
  check('eventos 2fa_ativado/2fa_desativado registrados', (await prisma.segEvento.count({ where: { userId: uCom2fa.id, tipo: { in: ['2fa_ativado', '2fa_desativado'] } } })) === 2)
  check('auditoria do tenant registra ativação', (await prisma.auditLog.count({ where: { tenantId, module: 'security', action: '2FA_ATIVADO' } })) >= 1)

  // ---- REQUIRE_2FA_ROLES
  secao('REQUIRE_2FA_ROLES')
  r = await login(uCoord)
  check('sem REQUIRE_2FA_ROLES ninguém é obrigado', r.status === 200 && !!r.json?.token)
  process.env.REQUIRE_2FA_ROLES = 'COORDINATOR, rector'
  r = await login(uCoord)
  const setupToken: string = r.json?.setupToken
  check('papel obrigatório sem 2FA: {requires2faSetup} + token restrito, sem sessão', r.status === 200 && r.json?.requires2faSetup === true && !!setupToken && !r.json?.token, r.text)
  r = await req('GET', '/auth/me', undefined, auth(setupToken))
  check('token de configuração NÃO acessa a API', r.status === 401)
  r = await req('GET', '/edu/academico/programas', undefined, auth(setupToken))
  check('token de configuração NÃO acessa /edu', r.status === 401)
  r = await req('GET', '/security/events', undefined, auth(setupToken))
  check('token de configuração NÃO acessa /security/events', r.status === 403 || r.status === 401)
  r = await req('POST', '/security/2fa/setup/start', {}, auth(setupToken))
  const segCoord: string = r.json?.secret
  check('token de configuração acessa setup/start', r.status === 200 && !!segCoord, r.text)
  r = await req('POST', '/security/2fa/setup/confirm', { code: totp(base32Decode(segCoord), Date.now()) }, auth(setupToken))
  check('confirmar com token restrito devolve códigos E token de sessão', r.status === 200 && r.json?.recoveryCodes?.length === 8 && !!r.json?.token, r.text)
  r = await req('GET', '/auth/me', undefined, auth(r.json?.token))
  check('token de sessão devolvido no confirm funciona', r.status === 200)
  r = await req('POST', '/security/2fa/disable', { password: SENHA, code: '123456' }, auth(tokenDe(uCoord)))
  check('papel obrigatório não pode desativar o 2FA', r.status === 403, r.text)
  r = await login(uCoord)
  check('papel obrigatório já com 2FA: segue para o desafio normal', r.json?.requires2fa === true)
  delete process.env.REQUIRE_2FA_ROLES

  // ---- eventos (admin)
  secao('GET /security/events')
  r = await req('GET', '/security/events', undefined, auth(tokenDe(uAdmin)))
  check('ADMIN lista eventos do tenant', r.status === 200 && Array.isArray(r.json?.items) && r.json.total >= 5 && r.json.items.every((e: any) => e.tenantId === tenantId), r.text.slice(0, 200))
  r = await req('GET', '/security/events?tipo=login_bloqueado&severidade=ATENCAO', undefined, auth(tokenDe(uAdmin)))
  check('filtro por tipo/severidade', r.status === 200 && r.json.items.length >= 1 && r.json.items.every((e: any) => e.tipo === 'login_bloqueado'), r.text.slice(0, 200))
  r = await req('GET', `/security/events?userId=${uCom2fa.id}&desde=2020-01-01&ate=2100-01-01`, undefined, auth(tokenDe(uAdmin)))
  check('filtro por usuário e período', r.status === 200 && r.json.items.every((e: any) => e.userId === uCom2fa.id) && r.json.items.length > 3)
  r = await req('GET', '/security/events?severidade=XXX', undefined, auth(tokenDe(uAdmin)))
  check('filtro inválido: 400', r.status === 400)
  r = await req('GET', '/security/events', undefined, auth(tokenDe(uSem2fa)))
  check('não-admin: 403', r.status === 403)
  r = await req('GET', '/security/events', undefined, auth(tokenDe(uAdminB)))
  check('admin de OUTRO tenant não vê eventos deste', r.status === 200 && r.json.items.every((e: any) => e.tenantId === outroTenant))
  r = await req('GET', '/security/events')
  check('sem token: 401', r.status === 401)
  // admin-reset
  await prisma.segDoisFatores.upsert({ where: { userId: uSem2fa.id }, create: { tenantId, userId: uSem2fa.id, segredoCifrado: cifrar('ABC'), ativadoEm: new Date() }, update: {} })
  r = await login(uSem2fa)
  check('(pré) usuário com 2FA ativo pede desafio', r.json?.requires2fa === true)
  r = await req('POST', '/security/2fa/admin-reset', { userId: uAdminB.id }, auth(tokenDe(uAdmin)))
  check('admin-reset de usuário de outro tenant: 404', r.status === 404)
  r = await req('POST', '/security/2fa/admin-reset', { userId: uSem2fa.id }, auth(tokenDe(uAdmin)))
  check('admin-reset remove o 2FA', r.status === 200 && !(await prisma.segDoisFatores.findUnique({ where: { userId: uSem2fa.id } })))
  r = await req('POST', '/security/2fa/admin-reset', { userId: uSem2fa.id }, auth(tokenDe(uCom2fa)))
  check('admin-reset por não-admin: 403', r.status === 403)

  // ---- originGuard + cabeçalhos
  secao('originGuard e cabeçalhos')
  r = await req('POST', '/auth/login', { email: uSem2fa.email, password: SENHA, clinicId: clinic.id }, { origin: 'https://evil.example' })
  check('POST com Origin fora da allowlist: 403', r.status === 403 && /Origem não autorizada/.test(r.json?.error || ''), r.text)
  check('origem negada registrada em SegEvento', (await prisma.segEvento.count({ where: { tipo: 'origem_negada' } })) >= 1)
  r = await req('POST', '/auth/login', { email: uSem2fa.email, password: SENHA, clinicId: clinic.id }, { referer: 'https://evil.example/pagina' })
  check('POST com Referer fora da allowlist (sem Origin): 403', r.status === 403)
  r = await req('POST', '/auth/login', { email: uSem2fa.email, password: SENHA, clinicId: clinic.id }, { origin: 'null' })
  check('Origin "null" (iframe sandbox): 403', r.status === 403)
  r = await req('POST', '/auth/login', { email: uSem2fa.email, password: SENHA, clinicId: clinic.id }, { origin: 'https://app.exemplo.com' })
  check('Origin da allowlist (CORS_ORIGIN): passa', r.status === 200)
  r = await req('POST', '/auth/login', { email: uSem2fa.email, password: SENHA, clinicId: clinic.id }, { origin: 'https://one.dentalpos.com.br' })
  check('Origin confiável fixa do DentalPos: passa', r.status === 200)
  r = await req('POST', '/auth/login', { email: uSem2fa.email, password: SENHA, clinicId: clinic.id })
  check('sem Origin (servidor/webhook/cron): passa', r.status === 200)
  r = await req('POST', '/webhooks/asaas', {}, { origin: 'https://evil.example' })
  check('webhook com Origin estranho também é barrado (navegador)', r.status === 403)
  process.env.ALLOWED_ORIGINS = 'https://extra.exemplo.com'
  process.env.APP_ALLOWED_HOSTS = 'painel.exemplo.org'
  check('ALLOWED_ORIGINS e APP_ALLOWED_HOSTS ampliam a allowlist', origemPermitida('https://extra.exemplo.com') && origemPermitida('https://painel.exemplo.org') && !origemPermitida('https://evil.example'))
  delete process.env.ALLOWED_ORIGINS; delete process.env.APP_ALLOWED_HOSTS
  r = await req('GET', '/health')
  r = await req('GET', '/auth/me', undefined, { ...auth(tokenProf), origin: 'https://app.exemplo.com' })
  check('cabeçalhos: Permissions-Policy, Referrer-Policy, nosniff, CORP', !!r.headers.get('permissions-policy') && r.headers.get('referrer-policy') === 'no-referrer' && r.headers.get('x-content-type-options') === 'nosniff' && r.headers.get('cross-origin-resource-policy') === 'same-site', Object.fromEntries(r.headers))
  check('CSP restritiva em JSON', r.headers.get('content-security-policy') === "default-src 'none'; frame-ancestors 'none'", r.headers.get('content-security-policy'))
  check('CORS continua funcionando (allow-origin e credentials)', r.headers.get('access-control-allow-origin') === 'https://app.exemplo.com' && r.headers.get('access-control-allow-credentials') === 'true')
  const pre = await fetch(base + '/auth/login', { method: 'OPTIONS', headers: { origin: 'https://app.exemplo.com', 'access-control-request-method': 'POST' } })
  check('preflight de origem permitida: 204', pre.status === 204)

  // ---- política de senha no cadastro
  secao('Política de senha (cadastro)')
  r = await req('POST', '/auth/register', { firstName: 'A', lastName: 'B', email: `fraca.${S}@seg.test`, password: 'password123', clinicId: clinic.id, tenantId })
  check('cadastro com senha comum: 400', r.status === 400 && /comum/.test(r.json?.error || ''), r.text)
  r = await req('POST', '/auth/register', { firstName: 'A', lastName: 'B', email: `fraca2.${S}@seg.test`, password: 'Curta1!', clinicId: clinic.id, tenantId })
  check('cadastro com senha curta: 400', r.status === 400)
  r = await req('POST', '/auth/register', { firstName: 'Ana', lastName: 'Lima', email: `forte.${S}@seg.test`, password: SENHA, clinicId: clinic.id, tenantId })
  check('cadastro com senha forte: 201', r.status === 201, r.text)
  r = await login(uSem2fa, SENHA)
  check('senhas EXISTENTES continuam válidas no login (política só no cadastro/troca)', r.status === 200)
  const uFraca = await prisma.user.create({ data: { clinicId: clinic.id, tenantId, email: `legado.${S}@seg.test`, password: await bcrypt.hash('abc', 4), firstName: 'L', lastName: 'G', role: 'STAFF' } as any })
  r = await req('POST', '/auth/login', { email: uFraca.email, password: 'abc', clinicId: clinic.id })
  check('usuário legado com senha fraca ainda loga', r.status === 200)
  r = await req('PUT', `/user/${uFraca.id}`, { password: '1234567890' }, auth(tokenDe(uAdmin)))
  check('troca de senha por senha fraca: 400 (se o admin tem permissão) ou 403', r.status === 400 || r.status === 403, r.text)

  // ---- uploads via API
  secao('Uploads via API (uploadGuard)')
  const admin = auth(tokenDe(uAdmin))
  await prisma.eduInstitution.create({ data: { tenantId, nome: 'Instituto Seg' } })
  r = await req('POST', '/edu/core/marca', { kind: 'LOGO_PRINCIPAL', dataUrl: dataUrl(PNG, 'image/png') }, admin)
  check('logo PNG válido: 201 (contrato inalterado)', r.status === 201 && r.json?.kind === 'LOGO_PRINCIPAL', r.text)
  r = await req('POST', '/edu/core/marca', { kind: 'LOGO_PRINCIPAL', dataUrl: dataUrl(EXE, 'image/png') }, admin)
  check('executável com data URL de PNG: 422 em português', r.status === 422 && /Arquivo bloqueado/.test(r.json?.error || ''), r.text)
  r = await req('POST', '/edu/core/marca', { kind: 'LOGO_PRINCIPAL', dataUrl: dataUrl(SVG_SCRIPT, 'image/svg+xml') }, admin)
  check('SVG com script: 422', r.status === 422 && /script/.test(r.json?.error || ''), r.text)
  r = await req('POST', '/edu/core/marca', { kind: 'LOGO_ESCURA', dataUrl: dataUrl(SVG_OK, 'image/svg+xml') }, admin)
  check('SVG limpo: 201', r.status === 201, r.text)
  r = await req('POST', '/edu/core/marca', { kind: 'FAVICON', url: 'http://10.0.0.1/logo.png' }, admin)
  check('url de logo para rede interna: 422', r.status === 422, r.text)
  const nUpl = await prisma.segEvento.count({ where: { tenantId, tipo: 'upload_bloqueado' } })
  check('uploads bloqueados registrados em SegEvento (com tenant e usuário)', nUpl >= 2, nUpl)
  const nArq = await prisma.segArquivoVerificado.count({ where: { tenantId, veredito: 'BLOQUEADO' } })
  const nArqOk = await prisma.segArquivoVerificado.count({ where: { tenantId, veredito: 'LIMPO' } })
  check('vereditos gravados em SegArquivoVerificado (hash, tipo, motivo)', nArq >= 2 && nArqOk >= 2, { nArq, nArqOk })
  const regArq = await prisma.segArquivoVerificado.findFirst({ where: { tenantId, veredito: 'BLOQUEADO' } })
  check('registro de arquivo tem sha256 de 64 hex', /^[0-9a-f]{64}$/.test(regArq?.sha256 || ''))

  // outros pontos de upload: biblioteca/regulatório (dataUrl), URL de anexo
  r = await req('POST', '/edu/secretaria/protocolos/bootstrap', {}, admin)
  // anexo com executável em protocolos/outros: usa rota genérica de checagem de metadados
  r = await req('POST', '/edu/core/marca', { kind: 'LOGO_PRINCIPAL', url: 'https://exemplo.com/logo.png' }, admin)
  check('URL https pública de logo: 201', r.status === 201, r.text)

  // metadados (upload por URL pré-assinada, p.ex. arquivos clínicos): nome/MIME proibidos são recusados
  r = await req('POST', '/patients/inexistente/clinical-files/upload-intent', { originalName: 'exame.pdf.exe', mimeType: 'application/pdf', kind: 'EXAME' }, admin)
  check('arquivo clínico .pdf.exe: 422 antes de chegar ao controller', r.status === 422, r.text)
  r = await req('POST', '/patients/inexistente/clinical-files/upload-intent', { originalName: 'exame.pdf', mimeType: 'application/pdf', kind: 'EXAME', externalUrl: 'https://169.254.169.254/latest' }, admin)
  check('arquivo clínico com externalUrl interna (SSRF): 422', r.status === 422, r.text)
  r = await req('POST', '/patients/inexistente/clinical-files/upload-intent', { originalName: 'exame.pdf', mimeType: 'application/pdf', kind: 'EXAME' }, admin)
  check('arquivo clínico legítimo segue para o controller (404 paciente)', r.status === 404 || r.status === 400, r.text)

  // formulário público: moderação de texto
  const manif = (descricao: string, extra: any = {}) => req('POST', `/public/edu/apoio/ouvidoria/${tenantId}/manifestacoes`, { tipo: 'RECLAMACAO', assunto: 'Assunto da manifestação', descricao, anonima: true, ...extra })
  r = await manif('Gostaria de sugerir mais aulas de anatomia e educação sexual para os estudantes de odontologia.')
  check('ouvidoria pública com termos médicos: 201', r.status === 201, r.text)
  r = await manif('Vejam este conteúdo em https://www.pornhub.com/video/123 aqui na faculdade')
  check('ouvidoria pública com domínio adulto: 422', r.status === 422 && /Conteúdo bloqueado/.test(r.json?.error || ''), r.text)
  r = await manif('Preciso que atualizem meu cadastro, o link é https://bit.ly/3xyzabc para ver o edital.')
  check('ouvidoria com URL encurtada: aceita e marca para revisão', r.status === 201, r.text)
  check('evento texto_revisao registrado', (await prisma.segEvento.count({ where: { tipo: 'texto_revisao' } })) >= 1)
  r = await manif('descrição normal com tamanho suficiente', { website: 'x' })
  check('honeypot continua funcionando', r.status === 201)

  // ---- job de limpeza
  secao('Job de limpeza de tentativas')
  await prisma.segTentativaLogin.create({ data: { escopo: 'login', chave: `antigo.${S}@x.com`, ip: '1.1.1.1', falhas: 2, ultimaTentativaEm: new Date(Date.now() - 30 * 86400_000) } })
  await prisma.segTentativaLogin.create({ data: { escopo: 'login', chave: `recente.${S}@x.com`, ip: '1.1.1.1', falhas: 2, ultimaTentativaEm: new Date() } })
  await prisma.segTentativaLogin.create({ data: { escopo: 'login', chave: `bloqueado-antigo.${S}@x.com`, ip: '1.1.1.1', falhas: 0, ultimaTentativaEm: new Date(Date.now() - 30 * 86400_000), bloqueadoAte: new Date(Date.now() + 3600_000) } })
  const jobs: any = await runEduJobs()
  check('job seguranca.limpar-tentativas registrado e ok', jobs['seguranca.limpar-tentativas']?.ok === true, jobs['seguranca.limpar-tentativas'])
  check('apagou o antigo e manteve recente/bloqueado vigente', !(await prisma.segTentativaLogin.findFirst({ where: { chave: `antigo.${S}@x.com` } })) && !!(await prisma.segTentativaLogin.findFirst({ where: { chave: `recente.${S}@x.com` } })) && !!(await prisma.segTentativaLogin.findFirst({ where: { chave: `bloqueado-antigo.${S}@x.com` } })))

  Date.now = relogioReal
  server.close()
  await prisma.$disconnect()
  console.log(`\n${ok} verificações OK, ${fails.length} falhas`)
  fails.forEach((f) => console.log(' -', f))
  process.exit(fails.length ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(2) })
