/** Política de arquivos clínicos: bloqueia executáveis/scripts e exige tipo coerente com a extensão. */
const BLOCKED_EXT = new Set(['exe', 'dll', 'bat', 'cmd', 'com', 'scr', 'msi', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse', 'mjs', 'wsf', 'hta', 'jar', 'apk', 'app', 'sh', 'bash', 'php', 'phtml', 'asp', 'aspx', 'jsp', 'cgi', 'py', 'rb', 'pl', 'lnk', 'reg', 'iso', 'dmg', 'html', 'htm', 'xhtml', 'svg', 'xml', 'swf', 'docm', 'xlsm', 'pptm', 'dotm', 'xltm'])
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'heic', 'pdf', 'dcm', 'dicom', 'stl', 'ply', 'obj', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv', 'zip', 'mp4', 'mov', ''])

export function checkUploadMeta(originalName: string, extension: string, mimeType: string, externalUrl?: string | null): string | null {
  const parts = originalName.toLowerCase().split('.').slice(1) // "a.php.jpg" → todas as extensões intermediárias contam
  const exts = [...parts, extension.toLowerCase()].filter(Boolean)
  if (exts.some((e) => BLOCKED_EXT.has(e))) return 'Tipo de arquivo bloqueado por segurança (executáveis, scripts e páginas web não são permitidos).'
  if (!ALLOWED_EXT.has(extension.toLowerCase())) return 'Extensão de arquivo não permitida.'
  if (/\.\./.test(originalName) || /[\\/\u0000]/.test(originalName)) return 'Nome de arquivo inválido.'
  const m = mimeType.toLowerCase()
  if (/(javascript|ecmascript|x-sh|x-msdownload|x-executable|x-dosexec|html|xml|svg)/.test(m)) return 'Tipo MIME bloqueado por segurança.'
  if (externalUrl) {
    let u: URL
    try {
      u = new URL(externalUrl)
    } catch {
      return 'Link externo inválido.'
    }
    if (u.protocol !== 'https:') return 'Links externos devem usar https.'
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname) || u.hostname.endsWith('.internal')) return 'Link externo não permitido.'
  }
  return null
}
