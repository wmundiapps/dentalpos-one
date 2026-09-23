"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RevahClient = exports.RevahError = void 0;
exports.hmacHex = hmacHex;
exports.createSsoToken = createSsoToken;
exports.verifyRevahWebhook = verifyRevahWebhook;
/**
 * @revah/dentalpos-one-adapter
 *
 * Único ponto de contato entre o DentalPos One e o REVAH. O DentalPos não conhece o banco
 * nem o código do REVAH: tudo passa por API assinada, SSO e eventos.
 *
 *  - provisionClinic / setLicense: servidor-a-servidor, assinados com o segredo compartilhado.
 *  - createSsoToken / ssoUrl: abre o REVAH (como "Marketing") dentro do DentalPos One.
 *  - sendEvent(s) / syncPatients: eventos da clínica (agendamento, falta, orçamento, cobrança, recall, pós-operatório).
 *  - verifyRevahWebhook: valida notificações que o REVAH envia de volta (opt-out, pedido de agendamento, ligação concluída).
 */
const crypto_1 = __importDefault(require("crypto"));
class RevahError extends Error {
    constructor(message, status, code, body) {
        super(message);
        this.status = status;
        this.code = code;
        this.body = body;
    }
}
exports.RevahError = RevahError;
const b64url = (buf) => Buffer.from(buf).toString('base64url');
function hmacHex(secret, payload) {
    return crypto_1.default.createHmac('sha256', secret).update(payload).digest('hex');
}
function safeEqual(a, b) {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && crypto_1.default.timingSafeEqual(ba, bb);
}
/** JWT HS256 de curta duração aceito por POST /auth/sso/dentalpos no REVAH. */
function createSsoToken(sharedSecret, claims, ttlSeconds = 120) {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = b64url(JSON.stringify({
        clinicId: String(claims.clinicId),
        email: claims.email,
        name: claims.name,
        role: claims.role,
        jti: crypto_1.default.randomUUID(),
        iat: now,
        exp: now + Math.min(ttlSeconds, 300),
        aud: 'revah',
        iss: 'dentalpos-one',
    }));
    const sig = crypto_1.default.createHmac('sha256', sharedSecret).update(`${header}.${payload}`).digest('base64url');
    return `${header}.${payload}.${sig}`;
}
/** Valida X-Revah-Timestamp / X-Revah-Signature de uma notificação do REVAH. */
function verifyRevahWebhook(rawBody, timestamp, signature, secret, toleranceSeconds = 300) {
    if (!timestamp || !signature || !secret)
        return false;
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds)
        return false;
    return safeEqual(hmacHex(secret, `${timestamp}.${rawBody.toString()}`), signature);
}
class RevahClient {
    constructor(opts) {
        this.opts = opts;
        this.apiUrl = opts.apiUrl.replace(/\/$/, '');
        this.appUrl = (opts.appUrl || 'https://app.revah.com.br').replace(/\/$/, '');
        this.fetchImpl = opts.fetchImpl || fetch;
    }
    async request(path, init = {}) {
        const body = init.body === undefined ? undefined : JSON.stringify(init.body);
        const res = await this.fetchImpl(`${this.apiUrl}${path}`, {
            method: init.method || (body ? 'POST' : 'GET'),
            headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
            body,
            signal: AbortSignal.timeout(this.opts.timeoutMs ?? 15000),
        });
        const text = await res.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        }
        catch {
            data = { raw: text };
        }
        if (!res.ok)
            throw new RevahError(data?.error || `REVAH respondeu HTTP ${res.status}`, res.status, data?.code, data);
        return data;
    }
    signed(path, body) {
        if (!this.opts.sharedSecret)
            throw new Error('sharedSecret não configurado.');
        const raw = JSON.stringify(body);
        const ts = Math.floor(Date.now() / 1000).toString();
        return this.request(path, {
            method: 'POST',
            body: JSON.parse(raw),
            headers: { 'X-Revah-Timestamp': ts, 'X-Revah-Signature': hmacHex(this.opts.sharedSecret, `${ts}.${raw}`) },
        });
    }
    /** Cria (ou atualiza) a empresa da clínica no REVAH. */
    provisionClinic(input) {
        return this.signed('/integrations/dentalpos/provision', { ...input, clinicId: String(input.clinicId) });
    }
    /** Feature flag/licença: ativa ou suspende o Marketing da clínica. */
    setLicense(clinicId, active, plan) {
        return this.signed('/integrations/dentalpos/license', { clinicId: String(clinicId), active, plan });
    }
    /** URL para abrir o REVAH embutido (iframe) já autenticado. */
    ssoUrl(user) {
        if (!this.opts.sharedSecret)
            throw new Error('sharedSecret não configurado.');
        return `${this.appUrl}/sso?embed=1&token=${encodeURIComponent(createSsoToken(this.opts.sharedSecret, user))}`;
    }
    sendEvent(apiKey, event) {
        return this.request('/integrations/dentalpos/events', {
            method: 'POST',
            body: event,
            headers: { 'X-Api-Key': apiKey },
        });
    }
    sendEvents(apiKey, events) {
        return this.request('/integrations/dentalpos/events', {
            method: 'POST',
            body: { events },
            headers: { 'X-Api-Key': apiKey },
        });
    }
    syncPatients(apiKey, patients) {
        return this.request('/integrations/dentalpos/patients/sync', { method: 'POST', body: { patients }, headers: { 'X-Api-Key': apiKey } });
    }
    status(apiKey) {
        return this.request('/integrations/dentalpos/status', { headers: { 'X-Api-Key': apiKey } });
    }
}
exports.RevahClient = RevahClient;
