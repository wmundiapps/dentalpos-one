export type RevahPlan = 'TRIAL' | 'START' | 'PRO' | 'ENTERPRISE';
export type DentalPosEventType = 'appointment.scheduled' | 'appointment.reminder' | 'appointment.no_show' | 'appointment.canceled' | 'budget.pending' | 'billing.due' | 'recall.due' | 'postop.followup';
export interface RevahPatient {
    id: string | number;
    name: string;
    phone?: string | null;
    email?: string | null;
    document?: string | null;
    birthDate?: string | null;
    tags?: string[];
    /** Opt-outs já registrados no DentalPos; viram suppression list no REVAH. */
    optOut?: {
        whatsapp?: boolean;
        sms?: boolean;
        email?: boolean;
        voice?: boolean;
    };
}
/** Variáveis usadas nos modelos de mensagem ({{data}}, {{hora}}, {{profissional}}, {{procedimento}}, {{valor}}, {{vencimento}}, {{link_pagamento}}). */
export interface RevahEventData {
    data?: string;
    hora?: string;
    profissional?: string;
    procedimento?: string;
    valor?: string;
    vencimento?: string;
    link_pagamento?: string;
    unidade?: string;
    [k: string]: string | number | boolean | undefined;
}
export interface RevahEvent {
    /** Identificador estável (idempotência): o REVAH ignora repetidos. */
    id: string;
    type: DentalPosEventType;
    occurredAt?: string;
    patient: RevahPatient;
    data?: RevahEventData;
}
export interface ProvisionInput {
    clinicId: string | number;
    clinicName: string;
    ownerEmail: string;
    ownerName?: string;
    document?: string;
    plan?: RevahPlan;
    /** URL do DentalPos que recebe notificações do REVAH. */
    webhookUrl?: string;
    rotateApiKey?: boolean;
}
export interface ProvisionResult {
    tenantId: string;
    created: boolean;
    plan: RevahPlan;
    status: string;
    /** Só vem na criação (ou rotateApiKey): guarde criptografado. */
    apiKey: string | null;
    /** Só vem na criação (ou rotateApiKey): segredo para validar webhooks do REVAH. */
    webhookSecret: string | null;
}
export interface RevahWebhookPayload {
    type: 'revah.opt_out' | 'revah.appointment_requested' | 'revah.call_completed' | string;
    tenantId: string;
    occurredAt: string;
    data: Record<string, unknown>;
}
export declare class RevahError extends Error {
    status: number;
    code?: string | undefined;
    body?: unknown | undefined;
    constructor(message: string, status: number, code?: string | undefined, body?: unknown | undefined);
}
export interface RevahClientOptions {
    /** URL da API do REVAH, ex.: https://api.revah.com.br */
    apiUrl: string;
    /** URL do painel do REVAH, ex.: https://app.revah.com.br */
    appUrl?: string;
    /** DENTALPOS_SHARED_SECRET (mesmo valor nos dois sistemas). */
    sharedSecret?: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
}
export declare function hmacHex(secret: string, payload: string): string;
/** JWT HS256 de curta duração aceito por POST /auth/sso/dentalpos no REVAH. */
export declare function createSsoToken(sharedSecret: string, claims: {
    clinicId: string | number;
    email: string;
    name?: string;
    role?: string;
}, ttlSeconds?: number): string;
/** Valida X-Revah-Timestamp / X-Revah-Signature de uma notificação do REVAH. */
export declare function verifyRevahWebhook(rawBody: string | Buffer, timestamp: string | undefined, signature: string | undefined, secret: string, toleranceSeconds?: number): boolean;
export declare class RevahClient {
    private opts;
    private apiUrl;
    private appUrl;
    private fetchImpl;
    constructor(opts: RevahClientOptions);
    private request;
    private signed;
    /** Cria (ou atualiza) a empresa da clínica no REVAH. */
    provisionClinic(input: ProvisionInput): Promise<ProvisionResult>;
    /** Feature flag/licença: ativa ou suspende o Marketing da clínica. */
    setLicense(clinicId: string | number, active: boolean, plan?: RevahPlan): Promise<{
        tenantId: string;
        status: string;
        plan: RevahPlan;
    }>;
    /** URL para abrir o REVAH embutido (iframe) já autenticado. */
    ssoUrl(user: {
        clinicId: string | number;
        email: string;
        name?: string;
        role?: string;
    }): string;
    sendEvent(apiKey: string, event: RevahEvent): Promise<{
        duplicate: boolean;
        contactId?: string;
        actionsScheduled?: number;
    }>;
    sendEvents(apiKey: string, events: RevahEvent[]): Promise<{
        results: {
            id: string;
            duplicate?: boolean;
            actionsScheduled?: number;
            error?: string;
        }[];
    }>;
    syncPatients(apiKey: string, patients: RevahPatient[]): Promise<{
        synced: number;
    }>;
    status(apiKey: string): Promise<{
        tenantId: string;
        plan: RevahPlan;
        status: string;
        channels: {
            channel: string;
            provider: string;
            label: string;
        }[];
    }>;
}
