/**
 * Confere as variáveis de ambiente antes de colocar no ar: npm run check-env
 * Lê o ambiente atual (ou .env.local se existir). Não imprime valores, só se estão preenchidos.
 */
import fs from 'fs';
import path from 'path';

const envFile = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}
const has = (k: string) => !!process.env[k]?.trim();
type Item = { name: string; vars: string[]; why: string; level: 'obrigatorio' | 'recomendado' | 'opcional'; extra?: () => string | null };

const items: Item[] = [
  { name: 'Banco de dados', vars: ['DATABASE_URL'], why: 'sem ele nada funciona', level: 'obrigatorio' },
  { name: 'Sessões', vars: ['AUTH_SECRET'], why: 'mínimo 32 caracteres', level: 'obrigatorio', extra: () => ((process.env.AUTH_SECRET || '').length < 32 ? 'AUTH_SECRET precisa ter 32+ caracteres' : null) },
  { name: 'Endereço do site', vars: ['APP_URL'], why: 'links dos e-mails e dos apps', level: 'obrigatorio', extra: () => (/^https:\/\//.test(process.env.APP_URL || '') ? null : 'APP_URL deve começar com https://') },
  { name: 'Robôs agendados', vars: ['CRON_SECRET'], why: 'cobrança, avisos e antifraude', level: 'obrigatorio' },
  { name: 'E-mail (Resend)', vars: ['RESEND_API_KEY', 'MAIL_FROM'], why: 'confirmações, faturas e campanhas', level: 'obrigatorio' },
  { name: 'Cobrança (Asaas)', vars: ['ASAAS_API_KEY', 'ASAAS_WEBHOOK_TOKEN'], why: 'fatura automática no dia 1º (sem isso, baixa manual no admin)', level: 'recomendado', extra: () => (process.env.PAYMENT_PROVIDER === 'stripe' ? 'PAYMENT_PROVIDER=stripe: confira o bloco do Stripe' : null) },
  { name: 'Cobrança (Stripe)', vars: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'], why: 'só se PAYMENT_PROVIDER=stripe', level: 'opcional' },
  { name: 'Captcha (Turnstile)', vars: ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'], why: 'barra robôs no cadastro e no login', level: 'recomendado' },
  { name: 'SMS (Twilio)', vars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM'], why: 'confirmar o celular (boas-vindas e envio de notas)', level: 'recomendado' },
  { name: 'WhatsApp (Meta)', vars: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET', 'WHATSAPP_TEMPLATE_NOTICE'], why: 'avisos e atendimento', level: 'recomendado' },
  { name: 'Robô de atendimento (Anthropic)', vars: ['ANTHROPIC_API_KEY'], why: 'sem a chave o robô responde por regras', level: 'opcional' },
  { name: 'Push dos apps (Firebase)', vars: ['FIREBASE_SERVICE_ACCOUNT'], why: 'notificações nos apps', level: 'opcional' },
  { name: 'Lojas de apps', vars: ['APP_STORE_URL', 'PLAY_STORE_URL'], why: 'link de atualização obrigatória', level: 'opcional' },
];

let missingRequired = 0;
for (const it of items) {
  const missing = it.vars.filter((v) => !has(v));
  const problem = it.extra?.() ?? null;
  const ok = missing.length === 0;
  const tag = ok ? (problem ? 'ATENÇÃO ' : 'ok      ') : it.level === 'obrigatorio' ? 'FALTA   ' : it.level === 'recomendado' ? 'faltando' : 'opcional';
  if (!ok && it.level === 'obrigatorio') missingRequired++;
  if (ok && problem && it.level === 'obrigatorio') missingRequired++;
  console.log(`${tag}  ${it.name}${ok ? '' : ` → ${missing.join(', ')}`}${problem && (ok || it.level === 'obrigatorio') ? ` (${problem})` : ''}  [${it.why}]`);
}
console.log(missingRequired ? `\n${missingRequired} item(ns) obrigatório(s) pendente(s).` : '\nTudo o que é obrigatório está preenchido.');
process.exit(missingRequired ? 1 : 0);
