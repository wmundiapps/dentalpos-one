import type { ClinicalSignatureAdapter } from '../types/clinicalRecord'

export class SignatureProviderNotConfigured implements ClinicalSignatureAdapter {
  async createSignatureRequest(): Promise<never> { throw Object.assign(new Error('Provedor de assinatura clínica ainda não configurado.'), { statusCode:501 }) }
  async getSignatureStatus(): Promise<never> { throw Object.assign(new Error('Provedor de assinatura clínica ainda não configurado.'), { statusCode:501 }) }
}
