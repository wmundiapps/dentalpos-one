// Copia o build do DentalPod Design para o frontend do Dentalpos One (servido em /dentalpoddesign/).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'dist')
const dst = path.resolve(root, '../frontend/public/dentalpoddesign')
if (!fs.existsSync(src)) throw new Error('Rode "npm run build" antes.')
fs.rmSync(dst, { recursive: true, force: true })
fs.cpSync(src, dst, { recursive: true })
console.log('Copiado para', dst)
