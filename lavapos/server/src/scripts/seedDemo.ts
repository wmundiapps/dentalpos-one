// Cria um lava-rápido de demonstração com um mês de movimento (clientes, ordens, fotos, clube, despesas, lembretes).
// Uso (banco local ou de homologação): DEMO_PASSWORD='...' npm run seed-demo --workspace server
// A senha vem de variável de ambiente, nunca do chat. Não rode em produção com dados de clientes reais.
import sharp from 'sharp';
import { createApp } from '../app.js';
import { migrate, pool } from '../db.js';
import { addDays, nowLocal } from '../time.js';
import { VEHICLE_CATALOG } from '../vehicles.js';

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'yes') { console.error('Recusado em produção.'); process.exit(1); }
const PASSWORD = process.env.DEMO_PASSWORD;
if (!PASSWORD) { console.error('Defina DEMO_PASSWORD.'); process.exit(1); }
const EMAIL = process.env.DEMO_EMAIL ?? 'demo@lavapos.com.br';

await migrate(false);
const server = createApp().listen(0);
const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
let token = '';
async function api(path: string, body?: unknown, method?: string, raw?: Buffer): Promise<any> {
  const r = await fetch(base + path, { method: method ?? (body || raw ? 'POST' : 'GET'), headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(raw ? { 'content-type': 'image/jpeg' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: raw ? new Uint8Array(raw) : body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method ?? 'POST'} ${path}: ${r.status} ${j.error}`);
  return j;
}
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]!;

// ---- imagens de demonstração (carro estilizado: sujo / limpo)
async function carImage(clean: boolean, color: string): Promise<Buffer> {
  const bg = clean ? '#cfe9ff' : '#b9a98a';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${clean ? '#eaf5ff' : '#8f8161'}"/></linearGradient>
  <linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${clean ? color : '#7a6a50'}"/><stop offset="1" stop-color="${clean ? '#0b2a4a' : '#4b4030'}"/></linearGradient></defs>
  <rect width="1200" height="900" fill="url(#g)"/><ellipse cx="600" cy="690" rx="430" ry="38" fill="#000" opacity=".22"/>
  <path d="M170 600c0-60 24-100 80-120l150-100c40-28 80-40 140-40h210c70 0 110 16 150 60l90 80c60 10 100 40 100 120v40c0 14-10 24-24 24H194c-14 0-24-10-24-24z" fill="url(#b)"/>
  <path d="M420 400l-120 85h250V380h-60c-26 0-50 6-70 20zM590 380v105h300l-70-70c-26-26-50-35-90-35z" fill="${clean ? '#e8f6ff' : '#b8ad92'}" opacity=".92"/>
  <circle cx="330" cy="650" r="70" fill="#111"/><circle cx="330" cy="650" r="34" fill="${clean ? '#d9dee6' : '#8a8374'}"/><circle cx="880" cy="650" r="70" fill="#111"/><circle cx="880" cy="650" r="34" fill="${clean ? '#d9dee6' : '#8a8374'}"/>
  ${clean ? '<g fill="#fff" opacity=".9"><path d="M300 330l8 24 24 8-24 8-8 24-8-24-24-8 24-8z"/><path d="M930 300l6 18 18 6-18 6-6 18-6-18-18-6 18-6z"/></g>' : Array.from({ length: 26 }, (_, i) => `<circle cx="${220 + ((i * 97) % 760)}" cy="${420 + ((i * 53) % 220)}" r="${5 + (i % 5) * 3}" fill="#4a3d28" opacity=".5"/>`).join('')}
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}

console.log('Cadastrando o lava-rápido de demonstração…');
let r = await fetch(base + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lavacarName: 'Brilho Total Lava Car', ownerName: 'Carlos Mendes', email: EMAIL, phone: '44999990000', password: PASSWORD, acceptTerms: true }) });
if (r.status === 409) { const l = await api('/auth/login', { email: EMAIL, password: PASSWORD }); token = l.token; console.log('Conta de demonstração já existe; vou completar os dados.'); } else { token = ((await r.json()) as any).token; }
const me = await api('/auth/me'); const tenantId = me.tenant.id;
if ((await api('/r/customer')).length > 0) { console.log('Já existe movimento; nada a fazer.'); server.close(); await pool.end(); process.exit(0); }

const settings = (await api('/settings')).settings;
await api('/settings', { loyalty: { ...settings.loyalty, cashbackPercent: 5, minRedeemCents: 500 }, google: { placeId: '', reviewDelayHours: 2 }, bays: 3 }, 'PUT');

const services = await api('/r/service'); const S = (n: string) => services.find((s: any) => s.data.name.startsWith(n));
const checklist = await api('/r/checklistItem'); const plans = await api('/r/plan');
const FIRST = ['Ana', 'Bruno', 'Carla', 'Daniel', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Karen', 'Lucas', 'Mariana', 'Nicolas', 'Olívia', 'Paulo', 'Rafaela', 'Sérgio', 'Tatiane', 'Victor', 'Wesley', 'Yara', 'Zeca', 'Letícia'];
const LAST = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Lima', 'Pereira', 'Costa', 'Ribeiro', 'Almeida', 'Carvalho', 'Gomes', 'Martins'];
const cpfOf = (n: number) => { const d = String(100000000 + n * 7919).slice(0, 9).split('').map(Number); const dv = (len: number) => { let s = 0; for (let i = 0; i < len; i++) s += d[i]! * (len + 1 - i); const x = (s * 10) % 11; return x === 10 ? 0 : x; }; d.push(dv(9)); d.push(dv(10)); return d.join(''); };
const brands = Object.keys(VEHICLE_CATALOG).filter((b) => b !== 'Outra');
const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
const people: { c: any; v: any; cat: string }[] = [];
for (let i = 0; i < FIRST.length; i++) {
  const c = await api('/r/customer', { name: `${FIRST[i]} ${pick(LAST)}`, whatsapp: `4499${String(1000000 + i * 1317).slice(0, 7)}`, email: `${FIRST[i]!.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}@exemplo.com.br`, cpf: cpfOf(i + 3), consentMarketing: i % 4 !== 0, cashbackOptIn: i % 3 !== 0 });
  const brand = pick(brands); const [model, cat] = pick(VEHICLE_CATALOG[brand]!);
  const plate = `${pick([...LETTERS])}${pick([...LETTERS])}${pick([...LETTERS])}${Math.floor(rnd() * 9)}${pick([...LETTERS])}${Math.floor(rnd() * 9)}${Math.floor(rnd() * 9)}`;
  const v = await api('/r/vehicle', { customerId: c.id, plate, brand, model, year: 2016 + Math.floor(rnd() * 10), color: pick(['Branco', 'Preto', 'Prata', 'Cinza', 'Vermelho', 'Azul']), categoryKey: cat });
  people.push({ c, v, cat });
}
const colors = ['#c0262d', '#1f6feb', '#e8e8ee', '#2b2f36', '#5a6b7b', '#f2f2f2'];
const marksFor = () => { const m: Record<string, string[]> = {}; for (const it of checklist) { const x = rnd(); m[it.id] = x < 0.1 ? ['risco'] : x < 0.14 ? ['amassado'] : x < 0.3 ? ['sujo'] : ['ok']; } return m; };
const combos = [['Lavagem completa'], ['Lavagem só externa'], ['Lavagem completa', 'Enceramento'], ['Higienização interna'], ['Lavagem completa', 'Hidratação'], ['Espelhamento'], ['Impermeabilização'], ['Lavagem só externa']];
const methods = ['pix', 'pix', 'credito', 'debito', 'dinheiro'];
const delivered: string[] = []; const showOrders: string[] = [];
console.log('Lançando ordens do último mês…');
for (let k = 0; k < 240; k++) {
  const p = pick(people); const names = pick(combos); const ids = names.map((n) => S(n).id);
  const o = await api('/orders', { customerId: p.c.id, vehicleId: p.v.id, serviceIds: ids, checkin: { checklist: marksFor(), fuel: pick(['1/4', '1/2', '3/4']), km: 20000 + Math.floor(rnd() * 90000), belongings: pick(['', 'Documentos', 'Estepe, Macaco e triângulo']), customerAgrees: true, photoConsent: k % 3 === 0 } });
  if (k < 10) { await api(`/photos?phase=checkin&angle=frente&orderId=${o.id}`, undefined, 'POST', await carImage(false, pick(colors))); await api(`/photos?phase=checkin&angle=lateral-esq&orderId=${o.id}`, undefined, 'POST', await carImage(false, pick(colors))); }
  await api(`/orders/${o.id}/ready`, {});
  const total = o.data.totalCents as number;
  const out: Record<string, string[]> = {}; for (const i of o.data.checkin.items) out[i.id] = i.states.filter((s: string) => !['sujo'].includes(s));
  const d = await api(`/orders/${o.id}/deliver`, { checklist: out, customerAgrees: true, payments: [{ method: pick(methods), amountCents: total }] });
  if (k < 10) { await api(`/photos?phase=checkout&angle=frente&orderId=${o.id}`, undefined, 'POST', await carImage(true, pick(colors))); }
  delivered.push(o.id); if (k < 10 && k % 3 === 0) showOrders.push(o.id); void d;
}
// Espalha as ordens/pagamentos pelos últimos 30 dias (a API sempre grava "agora")
const rows = (await pool.query("SELECT id FROM records WHERE tenant_id=$1 AND kind='order' ORDER BY created_at", [tenantId])).rows;
for (const [i, row] of rows.entries()) {
  const daysAgo = Math.floor(((rows.length - i) / rows.length) * 29); const date = addDays(nowLocal().date, -daysAgo); const stamp = `${date}T${String(8 + (i % 9)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:00.000Z`;
  await pool.query("UPDATE records SET created_at = $2::timestamptz, data = data || jsonb_build_object('deliveredAt', $3::text) WHERE id = $1", [row.id, stamp, stamp]);
  await pool.query("UPDATE records SET created_at = $2::timestamptz, data = CASE WHEN data->>'paidAt' IS NOT NULL THEN data || jsonb_build_object('paidAt', $3::text) ELSE data END WHERE tenant_id=$4 AND kind='payment' AND data->>'orderId' = $1", [row.id, stamp, stamp, tenantId]);
}
await pool.query("UPDATE records SET data = data || jsonb_build_object('lastWashAt', (SELECT max(left(o.data->>'deliveredAt',10)) FROM records o WHERE o.tenant_id = records.tenant_id AND o.kind='order' AND o.data->>'customerId' = records.id::text)) WHERE tenant_id=$1 AND kind='customer'", [tenantId]);

console.log('Abrindo ordens no pátio…');
for (const [k, st] of ['em_servico', 'em_servico', 'pronto', 'em_servico'].entries()) {
  const p = people[k + 5]!; const o = await api('/orders', { customerId: p.c.id, vehicleId: p.v.id, serviceIds: [S(k % 2 ? 'Lavagem completa' : 'Higienização').id], checkin: { checklist: marksFor(), fuel: '1/2', km: 54000, customerAgrees: true, photoConsent: true } });
  await api(`/photos?phase=checkin&angle=frente&orderId=${o.id}`, undefined, 'POST', await carImage(false, colors[k]!));
  if (st === 'pronto') await api(`/orders/${o.id}/ready`, {});
}

console.log('Vitrine antes e depois…');
for (const [i, oid] of showOrders.entries()) {
  const o = { id: oid };
  const ph = await api(`/photos/order/${o.id}`); const b = ph.find((x: any) => x.phase === 'checkin'); const a = ph.find((x: any) => x.phase === 'checkout');
  if (b && a) await api('/showcase', { orderId: o.id, beforePhotoId: b.id, afterPhotoId: a.id, title: ['Higienização completa de SUV', 'Espelhamento de pintura', 'Hidratação de couro', 'Lavagem completa'][i]!, serviceName: 'Demonstração', plateHidden: true });
}

console.log('Clube…');
for (const [i, p] of people.slice(0, 6).entries()) await api('/club/subscriptions', { customerId: p.c.id, vehicleId: p.v.id, planId: plans[i % plans.length].id });

console.log('Agenda…');
const today = nowLocal().date; let day = today;
for (const [i, p] of people.slice(8, 15).entries()) {
  if (i === 4) day = addDays(today, 1);
  const hour = [9, 10, 11, 14, 9, 10, 15][i]!;
  try { await api('/agenda', { customerId: p.c.id, vehicleId: p.v.id, serviceIds: [S(i % 2 ? 'Lavagem só' : 'Lavagem completa').id], start: `${day}T${String(hour).padStart(2, '0')}:00` }); } catch (e) { console.log('  pulou horário:', (e as Error).message); }
}

console.log('Despesas e lembretes…');
const month = today.slice(0, 7);
for (const [description, kind, category, amount, rec] of [['Aluguel do ponto', 'fixa', 'aluguel', 450000, 'mensal'], ['Salários e encargos', 'fixa', 'salarios', 680000, 'mensal'], ['Energia elétrica', 'fixa', 'energia', 90000, 'mensal'], ['Água e esgoto', 'fixa', 'agua', 60000, 'mensal'], ['Contador', 'fixa', 'outros', 45000, 'mensal'], ['Internet e sistemas', 'fixa', 'outros', 25000, 'mensal'], ['Impulsionamento Instagram', 'variavel', 'marketing', 40000, 'nenhuma'], ['Manutenção da lavadora', 'variavel', 'manutencao', 32000, 'nenhuma']] as const)
  await api('/r/expense', { description, kind, category, amountCents: amount, dueDate: `${month}-${rec === 'mensal' ? '10' : '18'}`, recurring: rec, paid: description.startsWith('Aluguel') });
for (const [title, type, off] of [['Licença ambiental (lavagem de veículos)', 'licenca_ambiental', 21], ['Alvará de funcionamento', 'alvara', 75], ['Aluguel do ponto — reajuste anual', 'aluguel', 9], ['Certificado dos bombeiros (AVCB)', 'bombeiros', -4], ['Contrato de fornecimento de produtos', 'contrato', 210]] as const)
  await api('/r/compliance', { title, type, dueDate: addDays(today, off), alertDays: 30, recurrenceMonths: type === 'contrato' ? 0 : 12 });
const sup = await api('/r/supplier', { name: 'Distribuidora AutoQuímica', cnpj: '', phone: '4433334444', email: 'vendas@autoquimica.exemplo', contact: 'Marcos', products: 'Shampoo, cera, pretinho, polidores' });
await api('/r/supplier', { name: 'Filmes & Películas Brasil', phone: '1133335555', email: 'comercial@filmes.exemplo', contact: 'Renata', products: 'Insulfilme, película de proteção (PPF)' });
const items = await api('/r/stockItem'); const shampoo = items.find((i: any) => i.data.name.startsWith('Shampoo'));
await api(`/r/stockItem/${shampoo.id}`, { supplierId: sup.id, minQty: 15000 }, 'PUT');
await pool.query("UPDATE records SET data = jsonb_set(data,'{qty}','300') WHERE id = $1", [items.find((i: any) => i.data.name.startsWith('Cera')).id]); // abaixo do mínimo, para o alerta

console.log('\nPronto. Acesso: ' + EMAIL + ' (senha da variável DEMO_PASSWORD)');
server.close(); await pool.end();
