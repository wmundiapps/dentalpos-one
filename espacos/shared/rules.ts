// Regras de negócio da plataforma — fonte única usada pelo servidor (validação
// e cobrança) e pela web (exibição). Os documentos legais em docs/legal
// descrevem exatamente estes parâmetros; ao mudar um valor aqui, atualizar lá.

import type {
  CancellationPolicyId, GuarantorPolicy, IncidentType, Listing, Occurrence, PriceBreakdown, SpaceCategory,
} from './types.js';
import { getCountry } from './countries.js';

export const RULES_VERSION = '2026-09-27';

// ───────────── Limites anti-locação de longo prazo ─────────────
export const BOOKING_LIMITS = {
  slotMinutes: 30,               // granularidade dos horários
  minBookingMinutes: 60,         // mínimo absoluto (anfitrião pode exigir mais via minHours)
  maxHoursPerOccurrence: 12,     // um turno/dia não passa de 12 h
  earliestStart: '06:00',
  latestEnd: '23:00',            // sem pernoite: tudo dentro do mesmo dia
  maxConsecutiveDays: 5,         // reserva multi-dia: no máximo 5 dias seguidos
  maxRecurringWeeks: 12,         // recorrência semanal: no máximo 12 semanas por série
  maxOccurrencesPerBooking: 12,
  maxAdvanceDays: 180,           // antecedência máxima
  minAdvanceMinutes: 60,         // reservar com pelo menos 1 h de antecedência
  maxHoursPer30DaysPerListing: 120, // teto por locatário, por espaço, em janela móvel de 30 dias
  maxActiveSeriesPerListing: 2,  // séries recorrentes simultâneas por locatário no mesmo espaço
  cooldownDaysAfterMaxSeries: 14, // após esgotar 12 semanas, intervalo antes de nova série
  hostDecisionHours: 24,         // anfitrião tem 24 h para aceitar solicitação
  guarantorDecisionHours: 48,    // avalista tem 48 h para aceitar
} as const;

// ───────────── Taxas da plataforma ─────────────
export const FEES = {
  guestServiceFeeRate: 0.15,  // taxa de serviço paga pelo locatário
  hostServiceFeeRate: 0.05,   // taxa de serviço descontada do repasse ao anfitrião
  payoutDelayHours: 24,       // repasse ao anfitrião 24 h após o início da (primeira) ocorrência
  depositReleaseHours: 72,    // caução liberada 72 h após o check-out se não houver ocorrência
  maxCleaningFeeRate: 0.30,   // taxa de limpeza limitada a 30% do valor base
  maxDepositMultiple: 3,      // caução limitada a 3x o valor base
} as const;

// ───────────── Política de cancelamento (locatário) ─────────────
export interface CancellationTier { minHoursBefore: number; refundRate: number }

export const CANCELLATION_POLICIES: Record<CancellationPolicyId, CancellationTier[]> = {
  // do maior prazo para o menor; primeira faixa atendida define o reembolso do valor base
  flexible: [{ minHoursBefore: 24, refundRate: 1 }, { minHoursBefore: 0, refundRate: 0.5 }],
  moderate: [{ minHoursBefore: 72, refundRate: 1 }, { minHoursBefore: 24, refundRate: 0.5 }, { minHoursBefore: 0, refundRate: 0 }],
  strict: [{ minHoursBefore: 168, refundRate: 1 }, { minHoursBefore: 72, refundRate: 0.5 }, { minHoursBefore: 0, refundRate: 0 }],
};

// Janela de cortesia: cancelamento em até 24 h após reservar é integral,
// desde que a reserva tenha sido feita com pelo menos 48 h de antecedência.
export const GRACE_PERIOD = { hoursAfterBooking: 24, minHoursBeforeStart: 48 } as const;

// ───────────── Cancelamento pelo anfitrião ─────────────
export const HOST_CANCELLATION_PENALTIES = [
  { minHoursBefore: 168, feeRate: 0, strike: true },
  { minHoursBefore: 48, feeRate: 0.10, strike: true },
  { minHoursBefore: 0, feeRate: 0.25, strike: true },
] as const;
export const HOST_CANCELLATIONS_BEFORE_SUSPENSION = 3; // em 12 meses

// ───────────── Advertências (strikes) ─────────────
export const STRIKE_RULES = {
  windowDays: 365,
  suspendAt: 3,        // 3 advertências em 12 meses → suspensão
  suspensionDays: 90,
  banAt: 5,            // 5 advertências em 12 meses → exclusão definitiva
} as const;

// ───────────── Tabela de penalidades (locatário) ─────────────
// base: 'booking' = % do valor base da reserva; 'hourly' = múltiplo do valor/hora;
// 'cost' = custo comprovado; 'fixedHours' = equivalente a N horas.
export interface PenaltyRule {
  type: IncidentType;
  base: 'booking' | 'hourly' | 'cost' | 'fixedHours' | 'none';
  value: number;
  strike: boolean;
  severe?: boolean;      // pode levar a exclusão imediata
  reportWindowHours: number;
}

export const PENALTIES: PenaltyRule[] = [
  { type: 'overstay', base: 'hourly', value: 1.5, strike: false, reportWindowHours: 24 },
  { type: 'extra_cleaning', base: 'cost', value: 0, strike: false, reportWindowHours: 24 },
  { type: 'damage', base: 'cost', value: 0, strike: false, reportWindowHours: 72 },
  { type: 'rule_violation', base: 'booking', value: 0.2, strike: true, reportWindowHours: 72 },
  { type: 'over_capacity', base: 'booking', value: 0.25, strike: true, reportWindowHours: 72 },
  { type: 'unauthorized_activity', base: 'booking', value: 0.5, strike: true, reportWindowHours: 72 },
  { type: 'sublet', base: 'booking', value: 1.0, strike: true, severe: true, reportWindowHours: 168 },
  { type: 'smoking_substances', base: 'fixedHours', value: 2, strike: true, reportWindowHours: 24 },
  { type: 'building_fine', base: 'cost', value: 0, strike: true, reportWindowHours: 720 },
  { type: 'harassment', base: 'none', value: 0, strike: true, severe: true, reportWindowHours: 720 },
  { type: 'off_platform_payment', base: 'none', value: 0, strike: true, severe: true, reportWindowHours: 720 },
  { type: 'no_show', base: 'none', value: 0, strike: false, reportWindowHours: 24 },
  // exercício ilegal da profissão (registro falso, de terceiro, suspenso): exclusão imediata
  { type: 'illegal_practice', base: 'booking', value: 1.0, strike: true, severe: true, reportWindowHours: 720 },
  // contra o anfitrião
  { type: 'listing_inaccurate', base: 'booking', value: 0, strike: true, reportWindowHours: 24 },
  { type: 'host_no_access', base: 'booking', value: 0, strike: true, reportWindowHours: 24 },
  { type: 'safety', base: 'none', value: 0, strike: true, severe: true, reportWindowHours: 72 },
];
export const OVERSTAY = { toleranceMinutes: 10, blockMinutes: 15, multiplier: 1.5, severeAfterMinutes: 30, severeMultiplier: 2 } as const;
export const INCIDENT_RESPONSE_HOURS = 48; // a outra parte tem 48 h para responder/contestar

// ───────────── Avaliações ─────────────
export const REVIEW_RULES = {
  windowDays: 14,
  minCommentLength: 10,
  maxCommentLength: 2000,
  guestCategories: ['cleanliness', 'accuracy', 'equipment', 'location', 'communication', 'value'],
  hostCategories: ['punctuality', 'care', 'rules', 'communication'],
  clientCategories: ['comfort', 'cleanliness', 'accessibility', 'location'],
  clientInviteDays: 14,
  maxClientInvitesPerBooking: 50,
} as const;

// ───────────── Avalista ─────────────
export const GUARANTOR_RULES = {
  defaultLiabilityMultiple: 3, // responsabilidade limitada a 3x o total da reserva
  minAge: 18,
} as const;

export const CATEGORIES: SpaceCategory[] = [
  'dental', 'medical', 'psychology', 'physio', 'aesthetics', 'nutrition', 'veterinary', 'law',
  'classroom', 'auditorium', 'meeting', 'coworking', 'studio', 'lab', 'kitchen', 'other',
];
export const HEALTH_CATEGORIES: SpaceCategory[] = ['dental', 'medical', 'psychology', 'physio', 'aesthetics', 'nutrition', 'veterinary'];
export const CATEGORY_ICONS: Record<SpaceCategory, string> = {
  dental: '🦷', medical: '🩺', psychology: '🛋️', physio: '🦴', aesthetics: '💆', nutrition: '🥗', veterinary: '🐾',
  law: '⚖️', classroom: '🎓', auditorium: '🎤', meeting: '🤝', coworking: '💻', studio: '🎙️', lab: '🧪', kitchen: '🍳', other: '🏢',
};

export const AMENITIES = [
  'wifi', 'air_conditioning', 'reception', 'waiting_room', 'parking', 'accessibility', 'elevator', 'restroom',
  'dental_chair', 'autoclave', 'xray', 'compressor', 'suction', 'stretcher', 'sink', 'biohazard_disposal',
  'soundproofing', 'couch', 'projector', 'screen', 'sound_system', 'microphone', 'whiteboard', 'desks', 'chairs',
  'printer', 'coffee', 'kitchenette', 'lockers', 'security_24h', 'cleaning_included', 'video_conference', 'lighting_kit',
] as const;

// ───────────── Utilitários de horário/fuso ─────────────
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
export function fromMinutes(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

// Converte data/hora local de um fuso IANA para instante UTC.
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const offset = tzOffsetMinutes(new Date(asUtc), timeZone);
  let result = asUtc - offset * 60000;
  // ajuste para transições de horário de verão
  const offset2 = tzOffsetMinutes(new Date(result), timeZone);
  if (offset2 !== offset) result = asUtc - offset2 * 60000;
  return new Date(result);
}

function tzOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((local - at.getTime()) / 60000);
}

export function todayInZone(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function occurrenceHours(o: Occurrence): number {
  return (toMinutes(o.end) - toMinutes(o.start)) / 60;
}

export function occurrenceStartUtc(listing: Pick<Listing, 'timezone'>, o: Occurrence): Date {
  return zonedToUtc(o.date, o.start, listing.timezone);
}
export function occurrenceEndUtc(listing: Pick<Listing, 'timezone'>, o: Occurrence): Date {
  return zonedToUtc(o.date, o.end, listing.timezone);
}

// ───────────── Arredondamento por moeda ─────────────
export function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}
export function roundMoney(value: number, currency: string): number {
  const f = 10 ** currencyDigits(currency);
  return Math.round(value * f) / f;
}

// ───────────── Preço ─────────────
export function computePrice(listing: Listing, occurrences: Occurrence[]): PriceBreakdown {
  const country = getCountry(listing.countryCode);
  const cur = listing.currency;
  let base = 0;
  let hours = 0;
  let days = 0;
  for (const o of occurrences) {
    const h = occurrenceHours(o);
    hours += h;
    // Diária: aplica pricePerDay quando for mais vantajoso para o locatário
    const hourly = h * listing.pricePerHour;
    if (listing.pricePerDay && h >= 6 && listing.pricePerDay < hourly) {
      base += listing.pricePerDay;
      days += 1;
    } else {
      base += hourly;
    }
  }
  base = roundMoney(base, cur);
  const cleaningFee = roundMoney(listing.cleaningFee * occurrences.length, cur);
  const guestServiceFee = roundMoney((base + cleaningFee) * FEES.guestServiceFeeRate, cur);
  const taxOnServiceFee = roundMoney(guestServiceFee * country.taxRate, cur);
  const total = roundMoney(base + cleaningFee + guestServiceFee + taxOnServiceFee, cur);
  const hostServiceFee = roundMoney((base + cleaningFee) * FEES.hostServiceFeeRate, cur);
  const hostPayout = roundMoney(base + cleaningFee - hostServiceFee, cur);
  return {
    currency: cur, hours, days, occurrences: occurrences.length, baseAmount: base, cleaningFee, guestServiceFee,
    taxOnServiceFee, taxName: country.taxName, total, hostServiceFee, hostPayout, securityDeposit: listing.securityDeposit,
  };
}

// ───────────── Validação de reserva ─────────────
export interface ValidationContext {
  now?: Date;
  existing: Array<{ occurrences: Occurrence[] }>; // reservas ativas do espaço (conflitos)
  guestHoursLast30Days: number;                  // horas já reservadas pelo locatário neste espaço (janela ±30 dias)
  guestActiveSeries: number;
  seriesCooldownUntil?: string;                   // YYYY-MM-DD: fim do intervalo após uma série de 12 semanas
}

export type ValidationError = { code: string; params?: Record<string, string | number> };

export function validateOccurrences(listing: Listing, occurrences: Occurrence[], ctx: ValidationContext): ValidationError[] {
  const L = BOOKING_LIMITS;
  const errors: ValidationError[] = [];
  const now = ctx.now ?? new Date();
  if (occurrences.length === 0) return [{ code: 'no_occurrences' }];
  if (occurrences.length > L.maxOccurrencesPerBooking) errors.push({ code: 'too_many_occurrences', params: { max: L.maxOccurrencesPerBooking } });

  const sorted = [...occurrences].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const today = todayInZone(listing.timezone, now);
  const lastAllowed = addDays(today, L.maxAdvanceDays);

  const dates = sorted.map((o) => o.date);
  if (new Set(dates).size !== dates.length) errors.push({ code: 'duplicate_date' });

  // Padrão: dias consecutivos (máx 5) OU recorrência semanal (máx 12 semanas)
  if (sorted.length > 1) {
    const diffs = sorted.slice(1).map((o, i) => daysBetween(sorted[i].date, o.date));
    const consecutive = diffs.every((d) => d === 1);
    const weekly = diffs.every((d) => d === 7);
    if (consecutive && sorted.length > L.maxConsecutiveDays) errors.push({ code: 'max_consecutive_days', params: { max: L.maxConsecutiveDays } });
    if (weekly && sorted.length > L.maxRecurringWeeks) errors.push({ code: 'max_recurring_weeks', params: { max: L.maxRecurringWeeks } });
    if (!consecutive && !weekly) errors.push({ code: 'invalid_pattern' });
    if (weekly && ctx.guestActiveSeries >= L.maxActiveSeriesPerListing) errors.push({ code: 'max_active_series', params: { max: L.maxActiveSeriesPerListing } });
    if (weekly && ctx.seriesCooldownUntil && sorted[0].date < ctx.seriesCooldownUntil) errors.push({ code: 'series_cooldown', params: { date: ctx.seriesCooldownUntil } });
  }

  let totalHours = 0;
  for (const o of sorted) {
    const s = toMinutes(o.start);
    const e = toMinutes(o.end);
    const dur = e - s;
    totalHours += dur / 60;
    if (s % L.slotMinutes || e % L.slotMinutes) errors.push({ code: 'slot_granularity', params: { date: o.date } });
    if (dur < Math.max(L.minBookingMinutes, listing.minHours * 60)) errors.push({ code: 'min_duration', params: { date: o.date, hours: Math.max(1, listing.minHours) } });
    if (dur > L.maxHoursPerOccurrence * 60) errors.push({ code: 'max_duration', params: { date: o.date, hours: L.maxHoursPerOccurrence } });
    if (s < toMinutes(L.earliestStart) || e > toMinutes(L.latestEnd)) errors.push({ code: 'outside_platform_hours', params: { date: o.date } });
    if (o.date > lastAllowed) errors.push({ code: 'too_far_ahead', params: { days: L.maxAdvanceDays } });
    if (occurrenceStartUtc(listing, o).getTime() - now.getTime() < L.minAdvanceMinutes * 60000) errors.push({ code: 'too_soon', params: { date: o.date } });
    if (listing.blockedDates.includes(o.date)) errors.push({ code: 'date_blocked', params: { date: o.date } });

    // Dentro da janela ociosa informada pelo anfitrião
    const windows = listing.weeklyAvailability[weekdayOf(o.date) as 0] ?? [];
    const fits = windows.some((w) => toMinutes(w.start) <= s && toMinutes(w.end) >= e);
    if (!fits) errors.push({ code: 'outside_availability', params: { date: o.date } });

    // Conflito com outras reservas (considera intervalo de limpeza)
    for (const b of ctx.existing) {
      for (const x of b.occurrences) {
        if (x.date !== o.date) continue;
        const xs = toMinutes(x.start) - listing.bufferMinutes;
        const xe = toMinutes(x.end) + listing.bufferMinutes;
        if (s < xe && e > xs) errors.push({ code: 'conflict', params: { date: o.date, start: x.start, end: x.end } });
      }
    }
  }
  if (ctx.guestHoursLast30Days + totalHours > L.maxHoursPer30DaysPerListing) {
    errors.push({ code: 'monthly_cap', params: { max: L.maxHoursPer30DaysPerListing, used: ctx.guestHoursLast30Days } });
  }
  return errors;
}

export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

// ───────────── Reembolso ─────────────
export interface RefundResult {
  refundBase: number;
  refundCleaning: number;
  refundServiceFee: number;
  refundTax: number;
  total: number;
  rule: 'grace' | 'withdrawal' | 'policy' | 'host_cancel' | 'no_refund_started';
  rate: number;
}

// Cada ocorrência futura é avaliada individualmente (em séries recorrentes, as
// ocorrências já realizadas não são reembolsadas).
export function computeGuestRefund(params: {
  listing: Pick<Listing, 'timezone' | 'countryCode' | 'currency'>;
  policy: CancellationPolicyId;
  occurrences: Occurrence[];
  price: PriceBreakdown;
  bookedAt: Date;
  now?: Date;
  isConsumer?: boolean;
}): RefundResult {
  const { listing, policy, occurrences, price } = params;
  const now = params.now ?? new Date();
  const cur = price.currency;
  const country = getCountry(listing.countryCode);
  const starts = occurrences.map((o) => occurrenceStartUtc(listing, o).getTime());
  const firstStart = Math.min(...starts);
  const hoursSinceBooking = (now.getTime() - params.bookedAt.getTime()) / 3600000;
  const bookedHoursBefore = (firstStart - params.bookedAt.getTime()) / 3600000;
  const nothingStarted = now.getTime() < firstStart;

  // Janela de cortesia e direito de arrependimento reembolsam tudo
  const grace = nothingStarted && hoursSinceBooking <= GRACE_PERIOD.hoursAfterBooking && bookedHoursBefore >= GRACE_PERIOD.minHoursBeforeStart;
  const withdrawal = nothingStarted && (params.isConsumer ?? true) && country.withdrawalDays > 0 && hoursSinceBooking <= country.withdrawalDays * 24;
  if (grace || withdrawal) {
    return {
      refundBase: price.baseAmount, refundCleaning: price.cleaningFee, refundServiceFee: price.guestServiceFee,
      refundTax: price.taxOnServiceFee, total: price.total, rule: grace ? 'grace' : 'withdrawal', rate: 1,
    };
  }

  const tiers = CANCELLATION_POLICIES[policy];
  const perOccurrenceBase = price.baseAmount / occurrences.length;
  const perOccurrenceCleaning = price.cleaningFee / occurrences.length;
  let refundBase = 0;
  let refundCleaning = 0;
  let fullyRefundedCount = 0;
  for (const start of starts) {
    const hoursBefore = (start - now.getTime()) / 3600000;
    if (hoursBefore <= 0) continue; // já começou/passou
    const tier = tiers.find((t) => hoursBefore >= t.minHoursBefore) ?? { refundRate: 0 };
    refundBase += perOccurrenceBase * tier.refundRate;
    refundCleaning += perOccurrenceCleaning; // limpeza não realizada é sempre devolvida
    if (tier.refundRate === 1) fullyRefundedCount++;
  }
  // Taxa de serviço devolvida proporcionalmente às ocorrências com reembolso integral
  const feeShare = fullyRefundedCount / occurrences.length;
  const refundServiceFee = price.guestServiceFee * feeShare;
  const refundTax = price.taxOnServiceFee * feeShare;
  const total = roundMoney(refundBase + refundCleaning + refundServiceFee + refundTax, cur);
  return {
    refundBase: roundMoney(refundBase, cur), refundCleaning: roundMoney(refundCleaning, cur),
    refundServiceFee: roundMoney(refundServiceFee, cur), refundTax: roundMoney(refundTax, cur), total,
    rule: nothingStarted ? 'policy' : 'no_refund_started', rate: price.total ? total / price.total : 0,
  };
}

export function hostCancellationPenalty(hoursBefore: number) {
  return HOST_CANCELLATION_PENALTIES.find((p) => hoursBefore >= p.minHoursBefore) ?? HOST_CANCELLATION_PENALTIES[2];
}

export function overstayCharge(minutes: number, pricePerHour: number, currency: string): number {
  if (minutes <= OVERSTAY.toleranceMinutes) return 0;
  const blocks = Math.ceil(minutes / OVERSTAY.blockMinutes);
  const mult = minutes > OVERSTAY.severeAfterMinutes ? OVERSTAY.severeMultiplier : OVERSTAY.multiplier;
  return roundMoney(blocks * (OVERSTAY.blockMinutes / 60) * pricePerHour * mult, currency);
}

export function suggestedPenalty(type: IncidentType, listing: Pick<Listing, 'pricePerHour' | 'currency'>, price: PriceBreakdown, extra?: { minutes?: number; cost?: number }): number {
  const rule = PENALTIES.find((p) => p.type === type);
  if (!rule) return 0;
  switch (rule.base) {
    case 'booking': return roundMoney(price.baseAmount * rule.value, listing.currency);
    case 'hourly': return overstayCharge(extra?.minutes ?? 0, listing.pricePerHour, listing.currency);
    case 'fixedHours': return roundMoney(listing.pricePerHour * rule.value, listing.currency);
    case 'cost': return roundMoney(extra?.cost ?? 0, listing.currency);
    default: return 0;
  }
}

export function guarantorRequired(policy: GuarantorPolicy, total: number, threshold?: number): boolean {
  if (policy === 'required') return true;
  if (policy === 'required_over_amount') return total >= (threshold ?? 0);
  return false;
}
