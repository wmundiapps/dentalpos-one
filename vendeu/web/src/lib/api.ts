// Cliente da API. Cookie de sessão do servidor (same-origin); nenhum segredo no navegador.
import { formatBRL } from '@shared/fees';

const DEVICE_KEY = 'vendeu.deviceId';
let memoryDevice = '';

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Identificador do dispositivo (registro de origem anti-fraude). Guardado no navegador. */
export function deviceId(): string {
  try {
    let v = localStorage.getItem(DEVICE_KEY);
    if (!v) { v = uuid(); localStorage.setItem(DEVICE_KEY, v); }
    return v;
  } catch {
    memoryDevice ||= uuid();
    return memoryDevice;
  }
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, public detail?: unknown) { super(code); }
}

type Query = Record<string, string | number | boolean | undefined | null>;
export const qs = (q: Query = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'X-Requested-With': 'vendeu', 'x-device-id': deviceId(), Accept: 'application/json' };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'network_error');
  }
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('json') ? await res.json().catch(() => null) : null;
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? `http_${res.status}`, (data as { detail?: unknown } | null)?.detail);
  return data as T;
}

export const api = {
  get: <T>(path: string, q?: Query) => request<T>('GET', path + qs(q)),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown = {}) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown = {}) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, form),
};

/** Baixa a resposta JSON como arquivo (exportação LGPD). */
export async function downloadJson(path: string, filename: string) {
  const res = await fetch(`/api${path}`, { credentials: 'same-origin', headers: { 'X-Requested-With': 'vendeu', 'x-device-id': deviceId() } });
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    throw new ApiError(res.status, d?.error ?? `http_${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const MESSAGES: Record<string, string> = {
  network_error: 'Sem conexão com o servidor. Verifique sua internet e tente de novo.',
  unauthenticated: 'Entre na sua conta para continuar.',
  unauthorized: 'Você não tem autorização para isso.',
  forbidden: 'Você não tem permissão para acessar esta área.',
  bad_origin: 'Pedido recusado por segurança. Recarregue a página e tente de novo.',
  not_found: 'Não encontramos o que você procurou.',
  internal_error: 'Algo deu errado do nosso lado. Tente de novo em instantes.',
  validation_error: 'Alguns dados estão incorretos. Confira e tente de novo.',
  invalid_json: 'Não conseguimos ler os dados enviados.',
  payload_too_large: 'O conteúdo enviado é grande demais.',
  file_too_large: 'O arquivo é grande demais. O limite é 10 MB por foto (8 MB por documento).',
  too_many_files: 'Envie um arquivo por vez.',
  file_required: 'Escolha um arquivo para enviar.',
  invalid_credentials: 'E-mail ou senha incorretos.',
  account_locked: 'Muitas tentativas erradas. Sua conta ficou bloqueada por alguns minutos; tente mais tarde.',
  account_blocked: 'Esta conta está bloqueada. Fale com o suporte: suporte@vendeu.app.',
  email_in_use: 'Este e-mail já tem cadastro. Entre na sua conta ou use "Esqueci a senha".',
  doc_in_use: 'Este CPF/CNPJ já está cadastrado em outra conta.',
  code_invalid: 'Código incorreto. Confira os 6 dígitos e tente de novo.',
  code_expired: 'O código expirou ou já foi usado. Peça um novo código.',
  too_many_attempts: 'Muitas tentativas com este código. Peça um novo código.',
  too_many_requests: 'Muitas tentativas em pouco tempo. Aguarde um pouco e tente de novo.',
  email_not_verified: 'Confirme seu e-mail para enviar mensagens a vendedores.',
  contact_not_verified: 'Confirme seu e-mail e seu telefone antes de continuar.',
  kyc_required: 'Para publicar, primeiro precisamos verificar sua identidade.',
  kyc_under_review: 'Seus documentos já estão em análise. Aguarde o resultado.',
  already_verified: 'Sua identidade já foi verificada.',
  identity_required: 'Informe seu CPF/CNPJ e endereço para virar anunciante.',
  seller_account_required: 'Para anunciar, complete seu cadastro de anunciante (CPF/CNPJ e endereço).',
  fee_overdue: 'Você tem taxa de retirada em atraso. Pague a taxa pendente para voltar a anunciar.',
  pending_fees: 'Você tem taxa de retirada pendente. Pague antes de eliminar a conta.',
  not_a_company: 'O cartão CNPJ só é pedido para empresas.',
  documents_missing: 'Faltam documentos. Envie todos os itens da lista antes de enviar para análise.',
  invalid_document_type: 'Formato não aceito. Envie uma foto (JPG, PNG ou WebP) ou um PDF.',
  unsafe_pdf: 'Este PDF contém conteúdo ativo e foi recusado. Envie uma foto ou outro PDF.',
  invalid_image: 'Não conseguimos ler esta imagem. Envie uma foto JPG, PNG ou WebP.',
  image_too_small: 'A foto é pequena demais. Use uma imagem com pelo menos 200 x 200 pixels.',
  too_many_photos: 'Você já enviou o máximo de 10 fotos.',
  min_photos: 'O anúncio precisa ter pelo menos 1 foto.',
  photos_required: 'Envie pelo menos 1 foto do produto.',
  asset_ref_required: 'Informe a placa (veículo) ou a matrícula (imóvel).',
  signer_name_mismatch: 'O nome digitado precisa ser igual ao do seu cadastro.',
  terms_not_accepted: 'Os termos foram atualizados. Leia a versão atual e aceite novamente.',
  listing_blocked: 'Este anúncio não pode ser publicado.',
  listing_closed: 'Este anúncio já foi encerrado e não pode mais ser alterado.',
  locked_fields: 'Depois de publicado, não dá para mudar operação, categoria nem condição (novo/usado), porque a declaração assinada cobre esses dados.',
  rent_period_required: 'Informe o período do aluguel (dia, semana ou mês).',
  invalid_status: 'Esta ação não está disponível para o estado atual do anúncio ou do pedido. Atualize a página.',
  own_listing: 'Este anúncio é seu: você não pode comprar ou conversar com você mesmo.',
  listing_unavailable: 'Este anúncio acabou de ficar indisponível (reservado por outra pessoa ou retirado).',
  seller_cannot_receive: 'O vendedor ainda não pode receber por este anúncio (conta Mercado Pago desconectada). Tente de novo mais tarde.',
  ship_to_required: 'Para receber em casa, informe o endereço de entrega.',
  return_window_closed: 'O prazo de devolução de 7 dias já terminou. Se houver um problema grave, fale com o suporte.',
  payment_method_required: 'Conecte sua conta Mercado Pago para publicar: é por ela que você recebe.',
  method_in_use: 'Não dá para desconectar agora: você tem anúncio no ar, pedido em andamento ou taxa a pagar. Retire os anúncios e conclua os pedidos primeiro.',
  order_in_progress: 'Este anúncio tem um pedido em andamento. Conclua ou cancele o pedido antes de retirá-lo.',
  orders_in_progress: 'Você tem pedido em andamento (compra ou venda). Conclua os pedidos antes de eliminar a conta.',
  sale_only_through_platform: 'A venda só acontece pelos pedidos do Vendeu. Não há mais "Vendi": o comprador faz o pedido e paga pelo app.',
  pix_only: 'Por enquanto o pagamento do pedido é só por Pix.',
  use_mock_connect: 'Ambiente de teste: use a conexão simulada.',
  mercadopago_not_configured: 'A conexão com o Mercado Pago ainda não foi configurada neste ambiente. Fale com o suporte.',
  invalid_state: 'A conexão com o Mercado Pago expirou. Tente conectar de novo.',
  handover_code_invalid: 'Código incorreto.',
  payment_provider_error: 'O serviço de pagamento não respondeu. Tente de novo em instantes.',
  listing_required: 'Escolha o anúncio a denunciar.',
  reason_required: 'Informe o motivo.',
  filter_required: 'Informe ao menos um filtro para consultar.',
  invalid_status_admin: 'Esta decisão não é possível no estado atual.',
};

export function errorMessage(e: unknown, fallback = 'Não foi possível concluir. Tente de novo.', overrides: Record<string, string> = {}): string {
  if (!(e instanceof ApiError)) return fallback;
  if (overrides[e.code]) return overrides[e.code];
  if (e.code === 'offer_out_of_range') {
    const d = (e.detail ?? {}) as { minCents?: number; maxCents?: number };
    return d.minCents && d.maxCents ? `A proposta precisa ficar entre ${formatBRL(d.minCents)} (50% do preço) e ${formatBRL(d.maxCents)}.` : 'A proposta precisa ser de no mínimo 50% do preço anunciado e no máximo o preço anunciado.';
  }
  if (e.code === 'validation_error' && Array.isArray(e.detail) && e.detail.length) {
    const msgs = (e.detail as { message?: string }[]).map((d) => d.message).filter(Boolean) as string[];
    // mensagens do servidor já vêm em português quando são regras de negócio; as técnicas do zod ficam genéricas
    const pt = msgs.filter((m) => /[áéíóúãõçÁÉÍÓÚ]|precisa|informe|inválid|mínimo|Descreva|Título/i.test(m));
    if (pt.length) return [...new Set(pt)].join(' ');
  }
  if (e.code === 'listing_blocked') return MESSAGES.listing_blocked;
  if (e.code === 'documents_missing') return MESSAGES.documents_missing;
  return MESSAGES[e.code] ?? (e.status >= 500 ? MESSAGES.internal_error : fallback);
}

const BLOCK_REASONS: Record<string, string> = {
  arma_ou_municao: 'armas, munições e itens parecidos não podem ser anunciados',
  droga: 'substâncias ilícitas não podem ser anunciadas',
  origem_ilicita: 'o texto sugere produto de origem duvidosa, roubado ou adulterado',
  documento_falso: 'documentos e notas falsos não são permitidos',
  proibido_por_lei: 'este tipo de item é proibido por lei',
  contrabando: 'o texto sugere contrabando ou produto pirata',
};
export const blockReasonLabel = (code: string) => BLOCK_REASONS[code] ?? 'o conteúdo infringe as regras de anúncio';

export const RISK_FLAG_LABEL: Record<string, string> = {
  sem_nota: 'Sem nota fiscal', possivel_falsificacao: 'Possível falsificação', pagamento_antecipado: 'Pede pagamento antecipado',
  entrega_apos_pagamento: 'Entrega só após pagamento', vendedor_no_exterior: 'Vendedor no exterior', urgencia: 'Urgência exagerada',
  origem_a_confirmar: 'Origem a confirmar', contato_fora_da_plataforma: 'Contato fora da plataforma', link_externo: 'Link externo',
  telefone_na_descricao: 'Telefone na descrição', email_na_descricao: 'E-mail na descrição', evita_encontro_presencial: 'Evita encontro presencial',
  preco_muito_baixo: 'Preço muito baixo', foto_repetida: 'Foto repetida de outro anunciante', origem_sem_nota: 'Origem sem nota',
  titulo_em_caixa_alta: 'Título em CAIXA ALTA',
};
