// Padrão de nomes de pessoas: primeira letra de cada nome maiúscula e o resto minúscula; "da, de, do, das, dos, e" ficam minúsculas.
const PARTICLES = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'van', 'von'])
const ROMAN = new Set(['II', 'III', 'IV'])
const cap = (w: string) => w.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase())

export function formatPersonName(raw: string): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).map((w, i) => {
    if (i > 0 && PARTICLES.has(w.toLowerCase())) return w.toLowerCase()
    if (ROMAN.has(w.toUpperCase())) return w.toUpperCase()
    return cap(w)
  }).join(' ')
}
