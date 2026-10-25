import { formatBRL } from '@shared/fees';

export { formatBRL };

export const PERIOD_LABEL: Record<string, string> = { dia: 'dia', semana: 'semana', mes: 'mês' };
export const priceLabel = (cents: number, period?: string | null) => `${formatBRL(cents)}${period ? ` /${PERIOD_LABEL[period] ?? period}` : ''}`;

export const LISTING_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'info' | 'muted' }> = {
  draft: { label: 'Rascunho', tone: 'muted' },
  active: { label: 'No ar', tone: 'ok' },
  paused: { label: 'Pausado', tone: 'info' },
  pending_review: { label: 'Em análise', tone: 'warn' },
  rejected: { label: 'Recusado', tone: 'bad' },
  removed: { label: 'Retirado', tone: 'muted' },
  pending_checkout: { label: 'Aguardando pagamento da taxa', tone: 'warn' },
  sold: { label: 'Vendido / alugado', tone: 'ok' },
};
export const SALE_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'info' | 'muted' }> = {
  awaiting_payment: { label: 'Aguardando pagamento', tone: 'warn' },
  paid: { label: 'Paga', tone: 'ok' },
  cancelled: { label: 'Cancelada', tone: 'muted' },
  waived: { label: 'Isenta', tone: 'info' },
};

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const fmtDate = (v?: string | null) => (v ? dateFmt.format(new Date(v)) : '—');
export const fmtDateTime = (v?: string | null) => (v ? dateTimeFmt.format(new Date(v)) : '—');
export const memberSince = (v?: string | null) => (v ? new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(v)) : '');
export function timeAgo(v?: string | null) {
  if (!v) return '';
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 30) return `há ${Math.floor(s / 86400)} d`;
  return fmtDate(v);
}
export function daysLeft(v?: string | null) {
  if (!v) return 0;
  return Math.ceil((new Date(v).getTime() - Date.now()) / 86400000);
}

/** Máscara de moeda: guarda só dígitos (centavos) e mostra "1.234,56". */
export function maskMoney(raw: string): string {
  const d = raw.replace(/\D/g, '').replace(/^0+/, '');
  if (!d) return '';
  const padded = d.padStart(3, '0');
  const int = padded.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${int},${padded.slice(-2)}`;
}
export const moneyToCents = (masked: string): number => {
  const d = masked.replace(/\D/g, '');
  return d ? Number(d) : 0;
};
export const centsToMasked = (cents: number) => maskMoney(String(Math.round(cents)));

export const maskCpfInput = (v: string) => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
export const maskCnpjInput = (v: string) => v.replace(/\D/g, '').slice(0, 14).replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
export const maskCepInput = (v: string) => v.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
export function maskPhoneInput(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
export const fmtPhone = (p?: string | null) => (p ? maskPhoneInput(p.replace(/^55/, '')) : '');

export function passwordStrength(p: string): { score: number; label: string } {
  let s = 0;
  if (p.length >= 8) s++;
  if (/[A-Za-z]/.test(p) && /\d/.test(p)) s++;
  if (p.length >= 12) s++;
  if (/[^A-Za-z0-9]/.test(p) && /[A-Z]/.test(p)) s++;
  return { score: s, label: ['Muito fraca', 'Fraca', 'Boa', 'Forte', 'Muito forte'][s] };
}

export const STATES = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
