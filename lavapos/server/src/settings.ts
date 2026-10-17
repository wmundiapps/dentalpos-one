import { z } from 'zod';
import { text } from './validators.js';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const channels = z.object({ whatsapp: z.boolean(), sms: z.boolean(), email: z.boolean() });

export const settingsSchema = z.object({
  hours: z.array(z.object({ closed: z.boolean(), open: hhmm, close: hhmm })).length(7), // 0 = domingo
  slotMinutes: z.number().int().min(10).max(120),
  bays: z.number().int().min(1).max(40),                 // vagas/boxes de lavagem ao mesmo tempo
  publicBooking: z.object({ enabled: z.boolean(), message: text(300), minNoticeHours: z.number().int().min(0).max(72), maxDaysAhead: z.number().int().min(1).max(120) }),
  loyalty: z.object({
    enabled: z.boolean(), cashbackPercent: z.number().min(0).max(30), minRedeemCents: z.number().int().min(0).max(100000),
    cashbacksmart: z.object({ enabled: z.boolean(), merchantId: text(80) }),
  }),
  reminders: z.object({
    washReminderDays: z.number().int().min(7).max(120), washReminder: channels,
    appointmentReminderHours: z.number().int().min(1).max(72), appointmentReminder: channels,
    readyNotice: channels, bookingConfirmation: channels, reviewRequest: channels,
  }),
  templates: z.object({ pronto: text(500), lembrete: text(500), agenda: text(500), confirmacao: text(500), avaliacao: text(500) }),
  google: z.object({ placeId: text(80), reviewDelayHours: z.number().int().min(0).max(72) }),
  pricing: z.object({ desiredMarginPct: z.number().min(0).max(90), taxPct: z.number().min(0).max(40), cardFeePct: z.number().min(0).max(10), workingDaysPerMonth: z.number().int().min(1).max(31), targetProfitCents: z.number().int().min(0).max(1_000_000_00) }),
  invoice: z.object({ autoIssue: z.boolean(), provider: z.enum(['manual', 'enotas', 'focusnfe']), serviceCode: text(20), municipalRegistration: text(30) }),
  asaas: z.object({ sandbox: z.boolean(), walletId: text(60) }),
});
export type Settings = z.infer<typeof settingsSchema>;

const day = (closed = false) => ({ closed, open: '08:00', close: '18:00' });
export function defaultSettings(): Settings {
  return {
    hours: [day(true), day(), day(), day(), day(), day(), { closed: false, open: '08:00', close: '14:00' }],
    slotMinutes: 30, bays: 2,
    publicBooking: { enabled: true, message: 'Agende seu horário. Você recebe a confirmação por WhatsApp.', minNoticeHours: 2, maxDaysAhead: 30 },
    loyalty: { enabled: true, cashbackPercent: 5, minRedeemCents: 500, cashbacksmart: { enabled: false, merchantId: '' } },
    reminders: {
      washReminderDays: 21, washReminder: { whatsapp: true, sms: false, email: true },
      appointmentReminderHours: 24, appointmentReminder: { whatsapp: true, sms: true, email: true },
      readyNotice: { whatsapp: true, sms: true, email: true }, bookingConfirmation: { whatsapp: true, sms: false, email: true },
      reviewRequest: { whatsapp: true, sms: false, email: true },
    },
    templates: {
      pronto: 'Olá, {nome}! Seu {veiculo} ({placa}) está pronto na {lavacar}. Pode retirar. Obrigado!',
      lembrete: 'Olá, {nome}! Já faz {dias} dias da última lavagem do seu {veiculo}. Que tal agendar? {link}',
      agenda: 'Olá, {nome}! Lembrete: você tem horário na {lavacar} em {data} às {hora} para o {veiculo}.',
      confirmacao: 'Olá, {nome}! Agendamento confirmado na {lavacar}: {data} às {hora}. Até lá!',
      avaliacao: 'Olá, {nome}! Obrigado por escolher a {lavacar}. Sua opinião ajuda muito: avalie no Google em {link}',
    },
    google: { placeId: '', reviewDelayHours: 2 },
    pricing: { desiredMarginPct: 30, taxPct: 6, cardFeePct: 2.5, workingDaysPerMonth: 26, targetProfitCents: 0 },
    invoice: { autoIssue: true, provider: 'manual', serviceCode: '', municipalRegistration: '' },
    asaas: { sandbox: true, walletId: '' },
  };
}
