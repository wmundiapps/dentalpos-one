// Dados de demonstração para desenvolvimento local. Recusa rodar em produção.
// Contas de teste (só local): admin@vendeu.demo / vendedor@vendeu.demo / comprador@vendeu.demo — senha "Demo12345".
import sharp from 'sharp';
import { hashPassword } from './auth.js';
import { id, migrate, one, pool } from './db.js';
import { encryptText, hmac } from './secure.js';
import { refreshOutrosGroups } from './outros.js';
import { norm } from './risk.js';

if (process.env.NODE_ENV === 'production') { console.error('seed não roda em produção'); process.exit(1); }
await migrate(false);

const PASS = await hashPassword('Demo12345');
async function user(email: string, name: string, extra: Record<string, unknown> = {}) {
  const ex = await one(pool, 'SELECT id FROM users WHERE email = $1', [email]);
  if (ex) return ex.id as string;
  const uid = id('usr');
  const cpf = extra.cpf as string | undefined;
  await pool.query(
    `INSERT INTO users (id, role, account_type, email, email_verified_at, phone, phone_verified_at, password_hash, full_name, doc_type, doc_hash, doc_enc, doc_masked, kyc_status, cep, street, street_number, district, city, state, birth_date)
     VALUES ($1,$2,$3,$4,now(),$5,now(),$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
    [uid, extra.role ?? 'user', extra.type ?? 'comprador', email, '5511999990000', PASS, name, cpf ? 'cpf' : null, cpf ? hmac(cpf) : null, cpf ? encryptText(cpf) : null, cpf ? `***.${cpf.slice(3, 6)}.***-${cpf.slice(9)}` : null,
      extra.kyc ?? 'none', cpf ? '01310100' : null, cpf ? 'Avenida Paulista' : null, cpf ? '1000' : null, cpf ? 'Bela Vista' : null, cpf ? 'São Paulo' : null, cpf ? 'SP' : null, cpf ? '1985-05-20' : null]);
  return uid;
}
await user('admin@vendeu.demo', 'Administrador Demo', { role: 'admin' });
await user('comprador@vendeu.demo', 'Paula Compradora');
const seller = await user('vendedor@vendeu.demo', 'Carlos Vendedor Demo', { type: 'anunciante', kyc: 'verified', cpf: '52998224725' });

async function img(label: string, hue: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},60%,55%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},65%,35%)"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><text x="400" y="320" font-size="54" font-family="sans-serif" font-weight="bold" fill="#fff" text-anchor="middle">${label.replace(/&/g, 'e')}</text></svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer();
}

const items: [string, string, string, string, number, string, number][] = [
  // operação, categoria, condição, título, preço (R$), descrição, matiz
  ['venda', 'moveis', 'usado', 'Sofá retrátil 3 lugares cinza', 800, 'Sofá retrátil em ótimo estado, tecido suede cinza, 3 lugares. Retirada no local, aceito visita.', 210],
  ['venda', 'moveis', 'novo', 'Mesa de jantar 6 cadeiras', 1200, 'Mesa de jantar nova na caixa, com 6 cadeiras, madeira maciça, nota fiscal.', 25],
  ['venda', 'moveis', 'usado', 'Guarda-roupa casal 6 portas', 650, 'Guarda-roupa de casal com 6 portas e espelho, ótimo estado de conservação, desmontado.', 280],
  ['venda', 'brinquedos', 'novo', 'Kit blocos de montar 500 peças', 140, 'Kit de blocos de montar com 500 peças coloridas, lacrado, a partir de 4 anos.', 340],
  ['venda', 'brinquedos', 'usado', 'Casa de boneca de madeira', 220, 'Casa de boneca de madeira com móveis, usada com cuidado, sem peças faltando.', 15],
  ['venda', 'automoveis', 'usado', 'Fiat Uno 2012 completo', 28500, 'Fiat Uno 2012, 4 portas, ar condicionado, direção hidráulica, documentação em dia, único dono.', 0],
  ['venda', 'automoveis', 'novo', 'Moto 0km 160cc', 14900, 'Moto zero quilômetro 160cc, nota fiscal, 1 ano de garantia de fábrica, emplacamento incluso.', 120],
  ['venda', 'imoveis', 'usado', 'Casa 3 quartos com quintal', 480000, 'Casa com 3 quartos, quintal amplo, 2 vagas, escritura e matrícula regularizadas.', 95],
  ['venda', 'utilidades-lar', 'novo', 'Air fryer 5 litros digital', 350, 'Air fryer digital de 5 litros, 1 ano de garantia, na caixa, nota fiscal.', 200],
  ['venda', 'utilidades-lar', 'usado', 'Aspirador de pó vertical', 180, 'Aspirador de pó vertical, funcionando perfeitamente, acompanha filtro reserva.', 160],
  ['venda', 'outros', 'usado', 'Bicicleta aro 29 usada', 700, 'Bicicleta aro 29 em bom estado de uso, freios revisados, pneus novos. Retirar no local.', 60],
  ['venda', 'outros', 'usado', 'Bicicleta infantil aro 16', 220, 'Bicicleta infantil aro 16 com rodinhas, bom estado, pintura conservada.', 70],
  ['venda', 'outros', 'usado', 'Bicicleta ergométrica', 450, 'Bicicleta ergométrica com painel digital, regulagem de carga, funcionando bem.', 80],
  ['venda', 'outros', 'novo', 'Bicicleta urbana nova', 1500, 'Bicicleta urbana nova, 21 marchas, quadro de alumínio, na caixa, nota fiscal.', 90],
  ['venda', 'outros', 'usado', 'Violão acústico com capa', 380, 'Violão acústico com capa e afinador, cordas novas, pouco usado, som excelente.', 40],
  ['locacao', 'imoveis', 'usado', 'Apartamento 2 quartos Centro', 1800, 'Apartamento de 2 quartos no centro, 60m², vaga de garagem, condomínio incluso. Contrato de 30 meses.', 150],
  ['locacao', 'automoveis', 'usado', 'Carro compacto para aluguel semanal', 450, 'Carro compacto 2019, ar condicionado, seguro incluso, ideal para motoristas de aplicativo.', 300],
  ['locacao', 'utilidades-lar', 'usado', 'Cadeiras e mesas para festas', 120, 'Aluguel de 10 mesas e 40 cadeiras para festas, entrega e retirada combinadas.', 330],
  ['locacao', 'brinquedos', 'novo', 'Pula-pula inflável para festas', 180, 'Pula-pula inflável novo para festas infantis, diária, instalação inclusa na cidade.', 10],
];
const asset: Record<string, string> = { automoveis: 'ABC1D23', imoveis: 'Matrícula 12345 - 4º RI' };
for (const [op, cat, cond, title, price, desc, hue] of items) {
  if (await one(pool, 'SELECT 1 FROM listings WHERE title = $1 AND seller_id = $2', [title, seller])) continue;
  const lid = id('lst');
  const cents = price * 100;
  await pool.query(
    `INSERT INTO listings (id, seller_id, operation, category, condition, title, description, price_cents, rent_period, city, state, district, status, search_text, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'São Paulo','SP','Bela Vista','active',$10, now() - random() * interval '10 days')`,
    [lid, seller, op, cat, cond, title, desc, cents, op === 'locacao' ? (cat === 'automoveis' ? 'semana' : cat === 'imoveis' ? 'mes' : 'dia') : null, norm(`${title} ${desc} São Paulo Bela Vista`)]);
  await pool.query('INSERT INTO listing_price_history (id, listing_id, price_cents) VALUES ($1,$2,$3)', [id('prc'), lid, cents]);
  const up = id('img');
  const data = await img(title.slice(0, 26), hue);
  await pool.query("INSERT INTO uploads (id, owner_id, kind, mime, size, data, url) VALUES ($1,$2,'photo','image/webp',$3,$4,$5)", [up, seller, data.length, data, `/api/uploads/${up}`]);
  await pool.query('INSERT INTO listing_photos (id, listing_id, upload_id, position) VALUES ($1,$2,$3,0)', [id('pho'), lid, up]);
  await pool.query("INSERT INTO listing_declarations (id, listing_id, user_id, origin_kind, asset_ref, signer_name, text_version, text_hash) VALUES ($1,$2,$3,'uso_proprio',$4,'Carlos Vendedor Demo','demo','demo')", [id('dcl'), lid, seller, asset[cat] ?? null]);
}
console.log('grupos de Outros:', await refreshOutrosGroups());
console.log('Seed pronto. Contas locais: admin@vendeu.demo, vendedor@vendeu.demo, comprador@vendeu.demo (senha Demo12345).');
await pool.end();
