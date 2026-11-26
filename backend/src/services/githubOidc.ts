import { createPublicKey, createVerify, type JsonWebKey } from 'crypto'

// Rotinas agendadas no GitHub Actions: o próprio GitHub assina um token (OIDC) dizendo qual repositório,
// branch e workflow rodou. Assim não existe senha compartilhada para vazar.
const ISSUER = 'https://token.actions.githubusercontent.com'
const JWKS_URL = `${ISSUER}/.well-known/jwks`
const REPOSITORY = process.env.GITHUB_OIDC_REPOSITORY || 'wmundiapps/dentalpos-one'

type Jwk = JsonWebKey & { kid?: string }
let cache: { keys: Jwk[]; at: number } | null = null

async function keys(force = false): Promise<Jwk[]> {
  if (!force && cache && Date.now() - cache.at < 10 * 60_000) return cache.keys
  const response = await fetch(JWKS_URL)
  if (!response.ok) throw new Error(`JWKS ${response.status}`)
  const body = (await response.json()) as { keys: Jwk[] }
  cache = { keys: body.keys, at: Date.now() }
  return body.keys
}

function b64json(part: string) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>
}

// true só se o token foi emitido pelo GitHub, para este repositório, na branch main, pelo workflow e público informados.
export async function verifyGithubToken(token: string, workflowFile: string, audience: string): Promise<boolean> {
  const parts = token.split('.')
  if (parts.length !== 3) return false
  let header: Record<string, unknown>
  let claims: Record<string, unknown>
  try {
    header = b64json(parts[0])
    claims = b64json(parts[1])
  } catch {
    return false
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return false

  let jwk = (await keys()).find((k) => k.kid === header.kid)
  if (!jwk) jwk = (await keys(true)).find((k) => k.kid === header.kid)
  if (!jwk) return false

  const verifier = createVerify('RSA-SHA256')
  verifier.update(`${parts[0]}.${parts[1]}`)
  if (!verifier.verify(createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) return false

  const now = Math.floor(Date.now() / 1000)
  const aud = claims.aud
  const audOk = aud === audience || (Array.isArray(aud) && aud.includes(audience))
  if (claims.iss !== ISSUER || !audOk) return false
  if (typeof claims.exp !== 'number' || claims.exp < now - 30) return false
  if (typeof claims.nbf === 'number' && claims.nbf > now + 30) return false
  return claims.repository === REPOSITORY && claims.ref === 'refs/heads/main' && claims.workflow_ref === `${REPOSITORY}/.github/workflows/${workflowFile}@refs/heads/main`
}
