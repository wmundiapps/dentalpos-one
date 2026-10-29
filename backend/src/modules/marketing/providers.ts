// Interface de provedor de canais (disparo e redes sociais). Sem credenciais => implementação SIMULADA:
// nada sai da máquina, o envio fica registrado com simulado=true. Para integrar um provedor real,
// registre uma implementação com registrarProvedor() (ex.: Twilio, Resend, Meta Graph) — a conformidade (compliance.ts) é aplicada ANTES.
import { token } from './common'

export interface EnvioInput { destino: string; assunto?: string | null; corpo: string; meta?: Record<string, any> }
export interface EnvioResultado { ok: boolean; externalId?: string; erro?: string; simulado: boolean; provedor: string; hardBounce?: boolean }
export interface ProvedorCanal { canal: string; nome: string; enviar(i: EnvioInput): Promise<EnvioResultado> }
export interface PublicacaoInput { texto: string; midiaUrl?: string | null }
export interface PublicacaoResultado { ok: boolean; externalId?: string; url?: string; erro?: string; simulado: boolean; provedor: string }
export interface ProvedorRede { rede: string; nome: string; publicar(i: PublicacaoInput): Promise<PublicacaoResultado> }

const PROV_CANAL: Record<string, ProvedorCanal> = {}
const PROV_REDE: Record<string, ProvedorRede> = {}
export const registrarProvedor = (p: ProvedorCanal) => { PROV_CANAL[p.canal] = p }
export const registrarProvedorRede = (p: ProvedorRede) => { PROV_REDE[p.rede] = p }

function validaDestino(canal: string, d: string): string | null {
  if (canal === 'EMAIL') return /^\S+@\S+\.\S+$/.test(d) ? null : 'E-mail inválido.'
  if (canal === 'TELEGRAM') return d.length >= 3 ? null : 'Chat do Telegram inválido.'
  return /^\d{12,13}$/.test(d.replace(/\D/g, '')) ? null : 'Telefone inválido.'
}
const NOMES: Record<string, string> = { EMAIL: 'E-mail (simulado)', SMS: 'SMS (simulado)', TELEGRAM: 'Telegram (simulado)', WHATSAPP: 'WhatsApp (simulado)', VOZ: 'Voz Twilio (simulado)' }
function simulado(canal: string): ProvedorCanal {
  return {
    canal, nome: NOMES[canal] ?? canal,
    async enviar(i) {
      const erro = validaDestino(canal, i.destino)
      if (erro) return { ok: false, erro, simulado: true, provedor: 'SIMULADO' }
      // Gatilhos de teste: destinos contendo "bounce" simulam rejeição definitiva; "falha" simula erro transitório.
      if (/bounce/i.test(i.destino)) return { ok: false, erro: 'Destino rejeitado pelo provedor (simulado).', simulado: true, provedor: 'SIMULADO', hardBounce: true }
      if (/falha/i.test(i.destino)) return { ok: false, erro: 'Falha transitória do provedor (simulado).', simulado: true, provedor: 'SIMULADO' }
      return { ok: true, externalId: `sim-${canal.toLowerCase()}-${token(6)}`, simulado: true, provedor: 'SIMULADO' }
    },
  }
}
function simuladoRede(rede: string): ProvedorRede {
  return {
    rede, nome: `${rede} (simulado)`,
    async publicar(i) {
      if (!i.texto?.trim()) return { ok: false, erro: 'Texto vazio.', simulado: true, provedor: 'SIMULADO' }
      if (rede === 'TIKTOK' && !i.midiaUrl) return { ok: false, erro: 'TikTok exige vídeo/mídia.', simulado: true, provedor: 'SIMULADO' }
      if (rede === 'INSTAGRAM' && !i.midiaUrl) return { ok: false, erro: 'Instagram exige imagem/mídia.', simulado: true, provedor: 'SIMULADO' }
      const id = `sim-${rede.toLowerCase()}-${token(5)}`
      return { ok: true, externalId: id, url: `https://simulado.invalid/${rede.toLowerCase()}/${id}`, simulado: true, provedor: 'SIMULADO' }
    },
  }
}
export const provedorCanal = (canal: string): ProvedorCanal => PROV_CANAL[canal] ?? simulado(canal)
export const provedorRede = (rede: string): ProvedorRede => PROV_REDE[rede] ?? simuladoRede(rede)
export const statusProvedores = () => ({
  canais: ['EMAIL', 'SMS', 'TELEGRAM', 'WHATSAPP', 'VOZ'].map((c) => { const p = provedorCanal(c); return { canal: c, nome: p.nome, simulado: !PROV_CANAL[c] } }),
  redes: ['INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'TIKTOK', 'THREADS'].map((r) => { const p = provedorRede(r); return { rede: r, nome: p.nome, simulado: !PROV_REDE[r] } }),
})
