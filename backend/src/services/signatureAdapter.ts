export interface SignatureRequest {
  documentId: string
  patientId: string
  signerName?: string | null
  signerDocument?: string | null
  contentHash: string
}

export interface SignatureResult {
  provider: string
  status: 'PENDING' | 'SIGNED' | 'UNAVAILABLE'
  externalId?: string
  signedAt?: Date
}

/**
 * Adapter boundary for a future qualified/electronic signature provider.
 * No external provider is configured in Chat 4. Calling this adapter is safe
 * and explicitly reports UNAVAILABLE instead of simulating a signature.
 */
export async function requestClinicalSignature(_input: SignatureRequest): Promise<SignatureResult> {
  return { provider: 'NOT_CONFIGURED', status: 'UNAVAILABLE' }
}
