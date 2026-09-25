// Contrato comum dos provedores de pagamento. A plataforma nunca vê dados de
// cartão: o locatário paga no checkout hospedado do provedor e aqui chegam só
// referências (sessão, pagamento, cliente, meio de pagamento salvo).

import type { Booking, Listing, Payment, User } from '../../../shared/types.js';

export type GatewayId = 'stripe' | 'mercadopago' | 'simulated';

export interface CheckoutUrls { successUrl: string; cancelUrl: string; notificationUrl: string }

export interface CheckoutResult { checkoutRef: string; checkoutUrl: string }

/** Resultado confirmado junto ao provedor (webhook ou consulta). */
export interface PaymentUpdate {
  paymentId: string;              // nosso id (metadado / external_reference)
  outcome: 'authorized' | 'captured' | 'failed' | 'expired' | 'refunded';
  providerRef?: string;
  customerRef?: string;
  paymentMethodRef?: string;
  amount?: number;
}

export interface Gateway {
  id: GatewayId;
  /** Pagamento aprovado na hora (sem redirecionar) — só no modo simulado. */
  instant: boolean;
  /** Consegue pré-autorizar caução e cobrar valores extras sem o locatário presente. */
  supportsOffSession: boolean;
  createCheckout(p: Payment, b: Booking, l: Listing, payer: User, urls: CheckoutUrls): Promise<CheckoutResult>;
  capture(p: Payment): Promise<void>;
  cancel(p: Payment): Promise<void>;
  refund(p: Payment, amount: number, reason: string): Promise<void>;
  /** Cobrança adicional (penalidade) no meio salvo; sem meio salvo, gera link de pagamento. */
  chargeExtra(p: Payment, amount: number, reason: string, payer: User, urls: CheckoutUrls): Promise<{ ref?: string; payLink?: string }>;
  holdDeposit(p: Payment, amount: number): Promise<string | undefined>;
  captureDeposit(p: Payment, amount: number): Promise<void>;
  releaseDeposit(p: Payment): Promise<void>;
  /** Valida a assinatura do webhook e devolve os pagamentos afetados (vazio se o evento não interessa). */
  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>, query: Record<string, unknown>): Promise<{ eventId: string; updates: PaymentUpdate[] }>;
}

/** Valor na menor unidade da moeda (centavos; JPY/CLP/PYG não têm casas decimais). */
export function toMinorUnits(amount: number, currency: string): number {
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return Math.round(amount * 10 ** digits);
}

export function fromMinorUnits(amount: number, currency: string): number {
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return amount / 10 ** digits;
}

export class PaymentProviderError extends Error {
  constructor(public provider: GatewayId, message: string, public retryable = false) {
    super(`[${provider}] ${message}`);
  }
}
