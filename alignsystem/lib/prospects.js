// Captação de dentistas (playbook do ClubeFaz): regras comuns da lista de contatos.
// Regra LGPD: só contatos buscados pela própria AlignSystem; quem sai fica bloqueado para sempre (hash).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const PROSPECT_STATUSES = ['novo', 'convidado', 'cadastrado', 'saiu'];

const MAP = JSON.parse(readFileSync(new URL('./data/cnae-dentistas.json', import.meta.url), 'utf8'));
export const CATEGORIES = Object.fromEntries(Object.entries(MAP).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, v.nome]));
const PRIORITY = new RegExp(MAP._prioridade.join('|'), 'i');
export const isPriority = (name) => PRIORITY.test(String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, ''));

export function blockHash(kind, value) {
  const normalized = kind === 'email' ? String(value).trim().toLowerCase() : String(value).replace(/\D/g, '');
  return createHash('sha256').update(`${kind}:${normalized}`).digest('hex');
}

// A Receita guarda muito celular no formato antigo (DDD + 8 dígitos começando em 6 a 9): põe o 9 na frente
export function fixOldMobile(phone) {
  if (phone && phone.length === 10 && '6789'.includes(phone[2])) return `${phone.slice(0, 2)}9${phone.slice(2)}`;
  return phone || null;
}
export const isMobile = (phone) => Boolean(phone && phone.length === 11 && phone[2] === '9');

// Janela de silêncio: convite só entre 8h e 21h, horário de Brasília
export function insideSendingWindow(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(now));
  return hour >= 8 && hour < 21;
}

// Saída: bloqueia para sempre (hash) e apaga telefone e e-mail do registro
export async function optOutProspect(sql, id) {
  const [p] = await sql`select * from prospects where id = ${id}`;
  if (!p) return null;
  const hashes = [
    p.cnpj && { hash: blockHash('cnpj', p.cnpj), kind: 'cnpj' },
    p.phone && { hash: blockHash('phone', p.phone), kind: 'phone' },
    p.email && { hash: blockHash('email', p.email), kind: 'email' },
  ].filter(Boolean);
  await sql.begin(async (tx) => {
    if (hashes.length) await tx`insert into prospect_blocklist ${tx(hashes, 'hash', 'kind')} on conflict do nothing`;
    await tx`update prospects set status = 'saiu', opted_out_at = now(), phone = null, email = null, mobile = false, updated_at = now() where id = ${p.id}`;
  });
  return p;
}
