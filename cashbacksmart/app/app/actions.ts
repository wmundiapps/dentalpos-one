'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { UserError, tx } from '@/lib/db';
import { createSession, createPending2fa, getPending2fa, clientMeta, destroySession, getSession, homeFor, requireBusiness, requireRole, requireSession, selectBusiness } from '@/lib/auth';
import { rateLimit, verifyCaptcha } from '@/lib/security';
import { passwordLogin, newDeviceAlert, verifySecondFactor, startTotpSetup, confirmTotp, disableTotp, requestPasswordReset, resetPassword, changePassword, logoutEverywhere, sessionVersionOf, createNotice, endNotice } from '@/lib/services/security';
import { registerBusiness, registerConsumer, addStaff, setEmailOptin, createBusinessFor, titleCity } from '@/lib/services/accounts';
import { registerPurchase, generateRedemptionCode, cancelPurchase, saveRule, toggleRule } from '@/lib/services/cashback';
import { buyPackage, buyPremium, cancelSubscription, markInvoicePaid, reactivateSubscription } from '@/lib/services/billing';
import { approveClaim, parseNfce, rejectClaim, submitClaim, submitPhotoClaim, MAX_PHOTO_BYTES } from '@/lib/services/nfce';
import { setNotifyChannel } from '@/lib/services/messages';
import { createLeadPage, createPlatformLeadPage, setLeadPageActive, setLeadStatus, submitLead } from '@/lib/services/leads';
import { sha256 } from '@/lib/security';
import { sendPhoneCode, verifyPhoneCode } from '@/lib/services/phone';
import { createCampaign, processOutbox } from '@/lib/services/campaigns';
import { updateBusiness, setBusinessStatus } from '@/lib/services/catalog';
import { parseBRL, brl, onlyDigits } from '@/lib/format';
import { welcome } from '@/lib/services/notify';
import { pushToUser } from '@/lib/push';
import { botReply } from '@/lib/services/bot';
import { resolveFlag } from '@/lib/services/fraud';
import { deleteConsumerAccount } from '@/lib/services/privacy';

export type ActionState = { error?: string; ok?: string; data?: any } | null;

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

/** Só aceita voltar para páginas internas conhecidas (evita redirecionamento aberto) */
function safeNext(v: string) {
  return /^\/(n|l)\/[A-Za-z0-9-]{1,80}$/.test(v) || /^\/app(\/[a-z-]+)?$/.test(v) ? v : null;
}

/** Ações de admin exigem verificação em duas etapas ativa */
async function requireAdmin() {
  const sess = await requireRole('admin');
  const { securityStatus } = await import('@/lib/services/security');
  const st = await securityStatus(sess.userId);
  if (!st?.totp_enabled) redirect('/seguranca?obrigatorio=1');
  return sess;
}

async function run(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    console.error(e);
    return { error: 'Algo deu errado. Tente de novo em instantes.' };
  }
}

/** Promoção de boas-vindas do cadastro da loja */
function welcomeFrom(f: FormData) {
  const mode = s(f, 'welcomeMode');
  if (mode !== 'first' && mode !== 'window') return null;
  const kind = s(f, 'welcomeKind') === 'fixed' ? 'fixed' : 'percent';
  const value = cashbackValue(kind, s(f, 'welcomeValue'));
  if (!Number.isInteger(value) || value <= 0) throw new UserError('Informe o valor da promoção de boas-vindas');
  const days = mode === 'window' ? Number(s(f, 'welcomeDays') || 30) : null;
  return { kind, value, windowDays: days } as const;
}

/** Converte o campo de cashback: "10" (%) ou "5,00" (R$) */
function cashbackValue(kind: string, raw: string) {
  if (kind === 'percent') {
    const n = Number(raw.replace(',', '.'));
    return Number.isFinite(n) ? Math.round(n * 100) : NaN;
  }
  return parseBRL(raw);
}

// ---------- Conta ----------
export async function loginAction(_: ActionState, f: FormData): Promise<ActionState> {
  let dest = '/';
  const r = await run(async () => {
    const meta = await clientMeta();
    await verifyCaptcha(String(f.get('cf-turnstile-response') || ''), meta.ip);
    const u = await passwordLogin(s(f, 'email'), String(f.get('password') || ''), meta);
    if (u.needs2fa) {
      await createPending2fa(u.id);
      dest = '/entrar/verificar';
      return null;
    }
    await createSession(u.id, u.role, u.sessionVersion);
    await newDeviceAlert(u.id, meta.ip, meta.ua).catch(() => null);
    dest = u.role === 'admin' ? '/seguranca' : (u.role === 'consumer' && safeNext(s(f, 'volta'))) || homeFor(u.role);
    return null;
  });
  if (r?.error) return r;
  redirect(dest);
}

export async function verify2faAction(_: ActionState, f: FormData): Promise<ActionState> {
  let dest = '/';
  const r = await run(async () => {
    const userId = await getPending2fa();
    if (!userId) throw new UserError('O tempo para digitar o código acabou. Entre de novo.');
    const v = await verifySecondFactor(userId, s(f, 'code'));
    await createSession(userId, v.role as any, v.sessionVersion);
    const meta = await clientMeta();
    await newDeviceAlert(userId, meta.ip, meta.ua).catch(() => null);
    dest = v.usedRecovery ? '/seguranca?recuperacao=1' : homeFor(v.role as any);
    return null;
  });
  if (r?.error) return r;
  redirect(dest);
}

export async function forgotPasswordAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async () => {
    const meta = await clientMeta();
    await verifyCaptcha(String(f.get('cf-turnstile-response') || ''), meta.ip);
    await requestPasswordReset(s(f, 'email'), meta.ip);
    return { ok: 'Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha. Ele vale por 30 minutos.' };
  });
}

export async function resetPasswordAction(_: ActionState, f: FormData): Promise<ActionState> {
  const r = await run(async () => {
    if (String(f.get('password')) !== String(f.get('password2'))) throw new UserError('As senhas não são iguais');
    await resetPassword(s(f, 'token'), String(f.get('password') || ''));
    return null;
  });
  if (r?.error) return r;
  await destroySession();
  redirect('/entrar?senha=1');
}

export async function changePasswordAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async () => {
    const sess = await requireSession();
    if (String(f.get('next')) !== String(f.get('next2'))) throw new UserError('As senhas novas não são iguais');
    const sv = await changePassword(sess.userId, String(f.get('current') || ''), String(f.get('next') || ''));
    await createSession(sess.userId, sess.role, sv);
    return { ok: 'Senha alterada. Os outros aparelhos foram desconectados.' };
  });
}

export async function startTotpAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async () => {
    const sess = await requireSession();
    const r = await startTotpSetup(sess.userId);
    const QR = (await import('qrcode')).default;
    const svg = await QR.toString(r.uri, { type: 'svg', margin: 0, color: { dark: '#1B2A6B', light: '#FFFFFF' } });
    return { ok: 'iniciado', data: { secret: r.secret, svg } };
  });
}

export async function confirmTotpAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async () => {
    const sess = await requireSession();
    const codes = await confirmTotp(sess.userId, s(f, 'code'));
    return { ok: 'ativado', data: { codes } };
  });
}

export async function disableTotpAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async () => {
    const sess = await requireSession();
    await disableTotp(sess.userId, String(f.get('password') || ''));
    revalidatePath('/seguranca');
    return { ok: 'Verificação em duas etapas desativada.' };
  });
}

export async function logoutEverywhereAction() {
  const sess = await requireSession();
  await logoutEverywhere(sess.userId);
  await destroySession();
  redirect('/entrar');
}

export async function logoutAction() {
  await destroySession();
  redirect('/');
}

export async function deleteAccountAction(_: ActionState, f: FormData): Promise<ActionState> {
  const r = await run(async () => {
    const sess = await requireRole('consumer');
    if (s(f, 'confirm').toUpperCase() !== 'EXCLUIR') throw new UserError('Para confirmar, digite EXCLUIR');
    await deleteConsumerAccount(sess.userId, String(f.get('password') || ''));
    await destroySession();
    return { ok: 'excluida' };
  });
  if (r?.ok === 'excluida') redirect('/entrar?conta=excluida');
  return r;
}

export async function signupConsumerAction(_: ActionState, f: FormData): Promise<ActionState> {
  const r = await run(async () => {
    const meta = await clientMeta();
    await rateLimit(`signup:${meta.ip || 'x'}`, 8, 3600, 'Muitos cadastros feitos desta rede. Tente de novo mais tarde.');
    await verifyCaptcha(String(f.get('cf-turnstile-response') || ''), meta.ip);
    const u = await registerConsumer({
      name: s(f, 'name'), email: s(f, 'email'), phone: s(f, 'phone'), cpf: s(f, 'cpf'), password: String(f.get('password') || ''),
      city: s(f, 'city'), state: s(f, 'state'), referral: s(f, 'referral'), acceptAds: f.get('acceptAds') === 'on' ? true : (false as any),
    });
    await createSession(u.id, 'consumer', (await sessionVersionOf(u.id)) || 1);
    await welcome(u.id, 'consumer').catch(() => null);
    return null;
  });
  if (r?.error) return r;
  redirect(safeNext(s(f, 'volta')) || '/app?bemvindo=1');
}

export async function signupBusinessAction(_: ActionState, f: FormData): Promise<ActionState> {
  const r = await run(async () => {
    const meta = await clientMeta();
    await rateLimit(`signup:${meta.ip || 'x'}`, 8, 3600, 'Muitos cadastros feitos desta rede. Tente de novo mais tarde.');
    await verifyCaptcha(String(f.get('cf-turnstile-response') || ''), meta.ip);
    const kind = s(f, 'cashbackKind') === 'fixed' ? 'fixed' : 'percent';
    const u = await registerBusiness({
      name: s(f, 'name'), email: s(f, 'email'), phone: s(f, 'phone'), password: String(f.get('password') || ''),
      city: s(f, 'city'), state: s(f, 'state'), businessName: s(f, 'businessName'), cnpj: s(f, 'cnpj'), category: s(f, 'category'),
      address: s(f, 'address'), neighborhood: s(f, 'neighborhood'), cashbackKind: kind, cashbackValue: cashbackValue(kind, s(f, 'cashbackValue')),
      welcome: welcomeFrom(f),
      acceptAds: f.get('acceptAds') === 'on' ? true : (false as any),
    });
    await createSession(u.id, 'business', (await sessionVersionOf(u.id)) || 1);
    await welcome(u.id, 'business').catch(() => null);
    return null;
  });
  if (r?.error) return r;
  redirect('/painel?bemvindo=1');
}

// ---------- Consumidor ----------
export async function redemptionCodeAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async () => {
    const sess = await requireRole('consumer');
    await rateLimit(`redeem:${sess.userId}`, 10, 3600, 'Você gerou muitos códigos. Aguarde um pouco.');
    const c = await generateRedemptionCode(sess.userId, s(f, 'businessId'));
    return { ok: 'Código gerado', data: { code: c.code, max: brl(c.maxCents), expiresAt: c.expiresAt.toISOString() } };
  });
}

export async function emailOptinAction(f: FormData) {
  const sess = await requireRole('consumer');
  await setEmailOptin(sess.userId, f.get('optin') === '1');
  revalidatePath('/app/conta');
}

export async function consumerSubscriptionAction(f: FormData) {
  const sess = await requireRole('consumer');
  if (f.get('op') === 'cancel') await cancelSubscription({ userId: sess.userId });
  else await reactivateSubscription({ userId: sess.userId });
  revalidatePath('/app/conta');
}

// ---------- Empresa ----------
export async function purchaseAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async () => {
    const { session, business } = await requireBusiness();
    await rateLimit(`purchase:${business.id}`, 600, 3600, 'Limite de lançamentos por hora atingido. Fale com o atendimento.');
    const amount = parseBRL(s(f, 'amount'));
    if (!Number.isFinite(amount)) throw new UserError('Informe o valor da compra, ex.: 45,90');
    let nfceKey: string | null = null;
    if (s(f, 'nfce')) {
      const k = parseNfce(s(f, 'nfce'));
      if (!k) throw new UserError('Não reconhecemos o QR da nota. Leia de novo ou deixe em branco.');
      nfceKey = k.key;
    }
    const r = await registerPurchase({
      businessId: business.id, actorId: session.userId, customer: s(f, 'customer'), amountCents: amount,
      redemptionCode: s(f, 'redemptionCode') || undefined, receipt: s(f, 'receipt') || undefined, nfceKey,
    });
    revalidatePath('/painel');
    if (r.cashbackCents > 0) pushToUser(r.consumerId, `+${brl(r.cashbackCents)} de cashback`, `Na ${business.name}. Seu saldo já está na carteira.`, '/app/carteira').catch(() => null);
    return { ok: 'Compra registrada', data: { ...r, availableAt: r.availableAt.toISOString() } };
  });
}

export async function cancelPurchaseAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async () => {
    const { session } = await requireBusiness();
    const r = await cancelPurchase(s(f, 'purchaseId'), session.userId);
    revalidatePath('/painel');
    return { ok: `Compra cancelada. Cashback estornado: ${brl(r.reversedCents)}${r.restoredCents ? `; saldo devolvido ao cliente: ${brl(r.restoredCents)}` : ''}.` };
  });
}

export async function saveRuleAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async () => {
    const { session, business } = await requireBusiness();
    const kind = s(f, 'kind') === 'fixed' ? 'fixed' : 'percent';
    const weekdays = f.getAll('weekdays').map(Number).filter((n) => n >= 0 && n <= 6);
    const maxRaw = s(f, 'maxCashback');
    await saveRule(business.id, session.userId, {
      title: s(f, 'title'), kind, value: cashbackValue(kind, s(f, 'value')),
      minPurchaseCents: s(f, 'minPurchase') ? parseBRL(s(f, 'minPurchase')) : 0,
      maxCashbackCents: maxRaw ? parseBRL(maxRaw) : null,
      weekdays: weekdays.length === 7 ? null : weekdays,
      releaseDays: Number(s(f, 'releaseDays') || 0), expiresDays: Number(s(f, 'expiresDays') || 180),
      startsAt: s(f, 'startsAt') || null, endsAt: s(f, 'endsAt') || null,
      audience: s(f, 'audience') === 'first' || s(f, 'audience') === 'window' ? 'new_customer' : 'all',
      newWindowDays: s(f, 'audience') === 'window' ? Number(s(f, 'windowDays') || 30) : null,
    }, s(f, 'ruleId') || undefined);
    revalidatePath('/painel/regras');
    return { ok: 'Regra salva' };
  });
}

export async function toggleRuleAction(f: FormData) {
  const { session, business } = await requireBusiness();
  await toggleRule(business.id, session.userId, s(f, 'ruleId'), f.get('active') === '1');
  revalidatePath('/painel/regras');
}

export async function campaignAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async () => {
    const { session, business } = await requireBusiness();
    const scope = s(f, 'scope') === 'national' ? 'national' : 'local';
    const r = await createCampaign({ businessId: business.id, actorId: session.userId, scope, subject: s(f, 'subject'), body: s(f, 'body'), targetState: s(f, 'targetState') || null });
    // Envia já os primeiros lotes; o restante segue pelo agendador
    await processOutbox(500);
    revalidatePath('/painel/campanhas');
    return { ok: r.recipients ? `Campanha enviada para ${r.recipients.toLocaleString('pt-BR')} pessoas.` : 'Campanha criada, mas ainda não há clientes com e-mail nesta região.' };
  });
}

export async function buyPackageAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async () => {
    const { session, business } = await requireBusiness();
    await buyPackage(business.id, session.userId, s(f, 'packageId'));
    revalidatePath('/painel/faturas');
    return { ok: 'Pedido criado. Pague a fatura em Faturas para liberar os e-mails.' };
  });
}

export async function updateBusinessAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async () => {
    const { session, business } = await requireBusiness();
    await updateBusiness(business.id, session.userId, { name: s(f, 'name'), description: s(f, 'description'), address: s(f, 'address'), neighborhood: s(f, 'neighborhood'), phone: onlyDigits(s(f, 'phone')), category: s(f, 'category') });
    revalidatePath('/painel/empresa');
    return { ok: 'Dados salvos' };
  });
}

export async function addStaffAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async () => {
    const { session, business } = await requireBusiness();
    await addStaff(session.userId, business.id, { name: s(f, 'name'), email: s(f, 'email'), password: String(f.get('password') || '') });
    revalidatePath('/painel/empresa');
    return { ok: 'Operador adicionado. Ele já pode entrar com o e-mail e a senha informados.' };
  });
}

export async function addBusinessAction(_: ActionState, f: FormData): Promise<ActionState> {
  const r = await run(async () => {
    const sess = await requireRole('business');
    const kind = s(f, 'cashbackKind') === 'fixed' ? 'fixed' : 'percent';
    if (s(f, 'businessName').length < 2 || s(f, 'city').length < 2 || s(f, 'state').length !== 2) throw new UserError('Informe nome, cidade e UF da nova loja');
    const val = cashbackValue(kind, s(f, 'cashbackValue'));
    if (!Number.isInteger(val) || val <= 0) throw new UserError('Informe o valor do cashback');
    const id = await tx((c) =>
      createBusinessFor(c, sess.userId, {
        businessName: s(f, 'businessName'), cnpj: onlyDigits(s(f, 'cnpj')), category: s(f, 'category'), address: s(f, 'address'), neighborhood: s(f, 'neighborhood'),
        city: titleCity(s(f, 'city')), state: s(f, 'state').toUpperCase(), cashbackKind: kind, cashbackValue: val,
      }),
    );
    await selectBusiness(id);
    return null;
  });
  if (r?.error) return r;
  redirect('/painel?nova=1');
}

export async function selectBusinessAction(f: FormData) {
  await requireBusiness();
  await selectBusiness(s(f, 'businessId'));
  redirect('/painel');
}

export async function businessSubscriptionAction(f: FormData) {
  const { business, isOwner } = await requireBusiness();
  if (!isOwner) return;
  if (f.get('op') === 'cancel') await cancelSubscription({ businessId: business.id }, new Date());
  else await reactivateSubscription({ businessId: business.id });
  revalidatePath('/painel/faturas');
}

// ---------- Admin ----------
export async function adminMarkPaidAction(f: FormData) {
  const sess = await requireAdmin();
  await markInvoicePaid(s(f, 'invoiceId'), new Date(), sess.userId);
  revalidatePath('/admin/faturas');
}

export async function adminBusinessStatusAction(f: FormData) {
  await requireAdmin();
  await setBusinessStatus(s(f, 'businessId'), f.get('status') === 'blocked' ? 'blocked' : 'active');
  revalidatePath('/admin/empresas');
}

export async function botAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async () => {
    const sess = await getSession();
    if (!sess) throw new UserError('Entre na sua conta para falar com o atendimento');
    await rateLimit(`bot:${sess.userId}`, 30, 600, 'Muitas mensagens seguidas. Aguarde alguns minutos.');
    let businessId: string | undefined;
    if (sess.role === 'business') businessId = (await requireBusiness()).business.id;
    const r = await botReply({ userId: sess.userId, role: sess.role, businessId }, s(f, 'message'));
    return { ok: 'respondido', data: { question: s(f, 'message'), answer: r.text } };
  });
}

export async function adminResolveFlagAction(f: FormData) {
  await requireAdmin();
  await resolveFlag(s(f, 'flagId'), f.get('unblock') === '1');
  revalidatePath('/admin/robos');
}

// ---------- Nota fiscal, celular e Premium ----------
export async function claimAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async () => {
    const sess = await requireRole('consumer');
    await rateLimit(`claim:${sess.userId}`, 10, 600, 'Muitas tentativas seguidas. Aguarde alguns minutos.');
    const amount = parseBRL(s(f, 'amount'));
    if (!Number.isFinite(amount)) throw new UserError('Informe o valor total da nota, ex.: 45,90');
    const r = await submitClaim(sess.userId, s(f, 'nfce'), amount);
    revalidatePath('/app/nota');
    if (r.status === 'merged') return { ok: `A ${r.business} já tinha lançado esta compra. Nota vinculada, sem duplicar.` };
    return { ok: `Nota enviada para a ${r.business}. ${r.cashbackCents ? `Você vai ganhar ${brl(r.cashbackCents)} quando a loja confirmar.` : 'Esta compra não tem cashback pelas regras atuais da loja.'}` };
  });
}

export async function decideClaimAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async () => {
    const { session } = await requireBusiness();
    if (s(f, 'decision') === 'approve') {
      const r = await approveClaim(s(f, 'purchaseId'), session.userId);
      if (r.cashbackCents > 0) pushToUser(r.consumerId, `+${brl(r.cashbackCents)} de cashback`, 'A loja confirmou sua nota fiscal.', '/app/carteira').catch(() => null);
      revalidatePath('/painel');
      return { ok: 'Compra confirmada' };
    }
    await rejectClaim(s(f, 'purchaseId'), session.userId, s(f, 'reason'));
    revalidatePath('/painel');
    return { ok: 'Nota recusada' };
  });
}

export async function sendPhoneCodeAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async () => {
    const sess = await requireRole('consumer');
    const r = await sendPhoneCode(sess.userId);
    return { ok: r.sent ? 'Enviamos um código por SMS.' : `Modo de teste (SMS ainda não configurado): seu código é ${r.devCode}.`, data: { sent: true } };
  });
}

export async function verifyPhoneAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async () => {
    const sess = await requireRole('consumer');
    await verifyPhoneCode(sess.userId, s(f, 'code'));
    revalidatePath('/app/conta');
    revalidatePath('/app/nota');
    return { ok: 'Celular confirmado!' };
  });
}

export async function premiumAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async () => {
    const sess = await requireRole('consumer');
    if ((await clientMeta()).ua?.includes('CashbacksmartApp/ios')) throw new UserError('O Premium não está disponível neste aplicativo');
    await buyPremium(sess.userId);
    revalidatePath('/app/conta');
    return { ok: 'Fatura do Premium criada. Pague abaixo para ativar: seu saldo deixa de vencer na hora.' };
  });
}

export async function photoClaimAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async () => {
    const sess = await requireRole('consumer');
    await rateLimit(`claim:${sess.userId}`, 10, 600, 'Muitas tentativas seguidas. Aguarde alguns minutos.');
    const amount = parseBRL(s(f, 'amount'));
    if (!Number.isFinite(amount)) throw new UserError('Informe o valor total da nota, ex.: 45,90');
    const file = f.get('photo');
    if (!(file instanceof File) || file.size === 0) throw new UserError('Tire uma foto da nota fiscal');
    if (file.size > MAX_PHOTO_BYTES) throw new UserError('Foto muito grande (máximo 6 MB)');
    const r = await submitPhotoClaim(sess.userId, { kitCode: s(f, 'kit'), amountCents: amount, nfNumber: s(f, 'number'), photo: Buffer.from(await file.arrayBuffer()) });
    revalidatePath('/app/nota');
    if (r.status === 'merged') return { ok: `A ${r.business} já tinha lançado esta compra. Nota vinculada, sem duplicar.` };
    return { ok: `Nota enviada para a ${r.business}. ${r.cashbackCents ? `Você vai ganhar ${brl(r.cashbackCents)} quando a loja confirmar.` : 'Esta compra não tem cashback pelas regras atuais da loja.'}` };
  });
}

export async function notifyChannelAction(f: FormData) {
  const sess = await requireRole('consumer');
  await setNotifyChannel(sess.userId, s(f, 'channel'));
  revalidatePath('/app/conta');
}

// ---------- Captação de leads ----------
export async function submitLeadAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async () => {
    const meta = await clientMeta();
    await rateLimit(`lead:${meta.ip || 'x'}`, 20, 3600, 'Muitos cadastros desta rede. Tente mais tarde.');
    await verifyCaptcha(String(f.get('cf-turnstile-response') || ''), meta.ip);
    if (s(f, 'website')) return { ok: 'Recebido!' }; // armadilha para robôs
    const r = await submitLead(s(f, 'slug'), {
      name: s(f, 'name'), phone: s(f, 'phone'), email: s(f, 'email') || null, answer: s(f, 'answer') || null,
      consent: f.get('consent') === 'on', ipHash: meta.ip ? sha256('lead:' + meta.ip) : null,
    });
    return { ok: r.duplicate ? 'Você já tinha se cadastrado nesta oferta. A loja vai falar com você!' : 'Pronto! A loja vai falar com você pelo WhatsApp em breve.', data: { done: true } };
  });
}

export async function createLeadPageAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async () => {
    const { session, business } = await requireBusiness();
    const p = await createLeadPage(business.id, session.userId, { title: s(f, 'title'), offer: s(f, 'offer'), question: s(f, 'question') || null });
    revalidatePath('/painel/leads');
    return { ok: 'Página criada. Divulgue o link no Instagram, WhatsApp e anúncios.', data: { slug: p.slug } };
  });
}

export async function toggleLeadPageAction(f: FormData) {
  const sess = await requireSession();
  await setLeadPageActive(s(f, 'pageId'), sess.userId, f.get('active') === '1', false);
  revalidatePath('/painel/leads');
}

export async function leadStatusAction(f: FormData) {
  const { session, business } = await requireBusiness();
  await setLeadStatus(business.id, session.userId, s(f, 'leadId'), s(f, 'status'));
  revalidatePath('/painel/leads');
}

export async function adminLeadPageAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async () => {
    const sess = await requireAdmin();
    const p = await createPlatformLeadPage(sess.userId, { title: s(f, 'title'), offer: s(f, 'offer'), question: s(f, 'question') || null, category: s(f, 'category'), city: s(f, 'city') ? titleCity(s(f, 'city')) : null, state: s(f, 'state') || null });
    revalidatePath('/admin/leads');
    return { ok: 'Página criada', data: { slug: p.slug } };
  });
}

export async function adminToggleLeadPageAction(f: FormData) {
  const sess = await requireAdmin();
  await setLeadPageActive(s(f, 'pageId'), sess.userId, f.get('active') === '1', true);
  revalidatePath('/admin/leads');
}

export async function adminNoticeAction(f: FormData) {
  await requireAdmin();
  if (f.get('end')) await endNotice(s(f, 'end'));
  else await createNotice(s(f, 'kind'), s(f, 'message'), s(f, 'audience'));
  revalidatePath('/admin/robos');
}

export async function whoAmI() {
  return getSession();
}
