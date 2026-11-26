import sharp from 'sharp'

// Conferência dos arquivos enviados. O tipo informado pelo navegador não vale nada (é fácil de falsificar):
// vale o conteúdo. Foto é sempre redesenhada do zero, o que descarta qualquer coisa escondida no arquivo
// e apaga os dados de localização (GPS) que o celular grava na foto. PDF só entra se for simples.

export class UploadRejected extends Error {}

export type Sniffed = 'jpeg' | 'png' | 'webp' | 'pdf' | null

export function sniff(buf: Buffer): Sniffed {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg'
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp'
  if (buf.length >= 5 && buf.toString('latin1', 0, 5) === '%PDF-') return 'pdf'
  return null
}

// Foto: confere que é imagem de verdade, gira conforme o celular, limita o tamanho e regrava em JPEG sem metadados.
export async function cleanImage(buf: Buffer, maxSide = 2000): Promise<Buffer> {
  const kind = sniff(buf)
  if (kind !== 'jpeg' && kind !== 'png' && kind !== 'webp') throw new UploadRejected('O arquivo não é uma foto válida. Use JPG, PNG ou WEBP.')
  try {
    return await sharp(buf, { limitInputPixels: 50_000_000, failOn: 'error' })
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer()
  } catch {
    throw new UploadRejected('Não foi possível ler esta foto. Tire outra ou envie em JPG.')
  }
}

// PDF: só aceita documento simples, sem programa (JavaScript), anexo escondido ou comando de abrir outro arquivo.
const PDF_DANGER = [/\/JavaScript\b/, /\/JS\b/, /\/Launch\b/, /\/EmbeddedFiles?\b/, /\/RichMedia\b/, /\/XFA\b/, /\/SubmitForm\b/, /\/ImportData\b/, /\/OpenAction\b/, /\/AA\b/]

export function checkPdf(buf: Buffer) {
  if (sniff(buf) !== 'pdf') throw new UploadRejected('O arquivo não é um PDF válido.')
  const text = buf.toString('latin1')
  if (PDF_DANGER.some((re) => re.test(text))) {
    throw new UploadRejected('Este PDF tem conteúdo ativo (programa ou anexo) e não pode ser aceito. Envie uma foto do documento.')
  }
}

// Recebe um arquivo em "data:<tipo>;base64,<dados>" e devolve o mesmo formato já limpo (foto sempre JPEG sem metadados).
export async function cleanDataUrl(file: { name: string; dataUrl: string }): Promise<{ name: string; mime: string; dataUrl: string }> {
  const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(file.dataUrl)
  if (!m) throw new UploadRejected('Anexo inválido.')
  const buf = Buffer.from(m[2], 'base64')
  if (buf.length === 0 || buf.length > 1_200_000) throw new UploadRejected('O arquivo está vazio ou grande demais (máximo 1 MB).')
  const kind = sniff(buf)
  if (kind === 'pdf') {
    checkPdf(buf)
    return { name: file.name.replace(/\.\w+$/, '') + '.pdf', mime: 'application/pdf', dataUrl: `data:application/pdf;base64,${m[2]}` }
  }
  const clean = await cleanImage(buf)
  return { name: file.name.replace(/\.\w+$/, '') + '.jpg', mime: 'image/jpeg', dataUrl: `data:image/jpeg;base64,${clean.toString('base64')}` }
}
