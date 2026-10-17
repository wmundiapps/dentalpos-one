// Padrão que todo lava-rápido novo recebe: categorias, serviços, checklist, planos e estoque inicial. Tudo editável depois.
import type { Db } from './db.js';
import { insertRec } from './repo.js';
import { CATEGORIES } from './vehicles.js';

type P = [number, number, number, number, number]; // carro, suv, utilitário, van, caminhão (em reais)
const pr = (p: P) => ({ carro: p[0] * 100, suv: p[1] * 100, utilitario: p[2] * 100, van: p[3] * 100, caminhao: p[4] * 100 });

const SERVICES: { name: string; group: string; durationMin: number; prices: P; description: string; stock?: [string, number][]; otherCost: number }[] = [
  { name: 'Lavagem completa', group: 'lavagem', durationMin: 60, prices: [60, 80, 90, 110, 200], description: 'Externa, interna, aspiração, painel e pneus.', stock: [['Shampoo automotivo', 40], ['Pretinho de pneus', 15]], otherCost: 800 },
  { name: 'Lavagem só externa', group: 'lavagem', durationMin: 30, prices: [35, 45, 55, 70, 120], description: 'Lavagem da lataria, rodas e pneus.', stock: [['Shampoo automotivo', 30]], otherCost: 500 },
  { name: 'Higienização interna', group: 'estetica', durationMin: 120, prices: [180, 230, 260, 320, 450], description: 'Limpeza profunda de bancos, carpetes, teto e dutos.', stock: [['Higienizador de estofados', 100]], otherCost: 3000 },
  { name: 'Hidratação de couros', group: 'estetica', durationMin: 60, prices: [90, 120, 130, 160, 220], description: 'Limpeza e hidratação de bancos de couro.', stock: [['Hidratante de couro', 50]], otherCost: 1500 },
  { name: 'Enceramento', group: 'protecao', durationMin: 90, prices: [100, 130, 150, 190, 300], description: 'Cera de carnaúba com brilho e proteção.', stock: [['Cera de carnaúba', 60]], otherCost: 2000 },
  { name: 'Espelhamento', group: 'estetica', durationMin: 240, prices: [350, 450, 500, 650, 900], description: 'Polimento técnico com acabamento espelhado.', stock: [['Composto polidor', 40]], otherCost: 6000 },
  { name: 'Impermeabilização', group: 'protecao', durationMin: 180, prices: [250, 320, 360, 450, 650], description: 'Proteção hidrofóbica da pintura ou dos bancos.', stock: [['Impermeabilizante', 80]], otherCost: 4000 },
  { name: 'Insulfilme', group: 'filme', durationMin: 180, prices: [350, 420, 450, 550, 700], description: 'Aplicação de película solar nos vidros.', stock: [['Insulfilme (m)', 3]], otherCost: 5000 },
  { name: 'Película de proteção (capô, maçanetas, estribos, cantos de portas)', group: 'filme', durationMin: 120, prices: [250, 300, 320, 380, 500], description: 'Película transparente contra riscos nos pontos de maior desgaste.', stock: [['Película de proteção (m)', 2]], otherCost: 4000 },
];

const CHECKLIST: [string, 'exterior' | 'interior' | 'pertences' | 'mecanica'][] = [
  ['Para-choque dianteiro', 'exterior'], ['Capô', 'exterior'], ['Para-brisa', 'exterior'], ['Teto', 'exterior'],
  ['Porta dianteira esquerda', 'exterior'], ['Porta traseira esquerda', 'exterior'], ['Porta dianteira direita', 'exterior'], ['Porta traseira direita', 'exterior'],
  ['Porta-malas / tampa', 'exterior'], ['Vidro traseiro', 'exterior'], ['Para-choque traseiro', 'exterior'],
  ['Rodas e calotas', 'exterior'], ['Pneus', 'exterior'], ['Retrovisores', 'exterior'], ['Faróis e lanternas', 'exterior'],
  ['Bancos', 'interior'], ['Painel e console', 'interior'], ['Carpetes e tapetes', 'interior'], ['Forro de teto', 'interior'], ['Volante e câmbio', 'interior'], ['Porta-malas (interior)', 'interior'],
  ['Documentos no veículo', 'pertences'], ['Objetos de valor', 'pertences'], ['Som, GPS e acessórios', 'pertences'], ['Estepe, macaco e triângulo', 'pertences'],
  ['Luzes do painel acesas', 'mecanica'], ['Ruídos ou falhas aparentes', 'mecanica'],
];

const STOCK: [string, string, number, number, number][] = [
  ['Shampoo automotivo', 'mL', 20000, 5000, 3], ['Pretinho de pneus', 'mL', 5000, 1000, 6], ['Higienizador de estofados', 'mL', 10000, 2000, 5],
  ['Hidratante de couro', 'mL', 3000, 500, 20], ['Cera de carnaúba', 'g', 4000, 800, 12], ['Composto polidor', 'g', 3000, 500, 15],
  ['Impermeabilizante', 'mL', 3000, 500, 30], ['Insulfilme (m)', 'm', 30, 6, 4000], ['Película de proteção (m)', 'm', 20, 4, 9000],
];

export async function seedTenant(db: Db, tenantId: string) {
  for (const c of CATEGORIES) await insertRec(db, tenantId, 'category', { ...c, active: true });
  const itemIds = new Map<string, string>();
  for (const [name, unit, qty, minQty, cost] of STOCK) {
    const r = await insertRec(db, tenantId, 'stockItem', { name, unit, qty, minQty, costCents: cost * 1 });
    itemIds.set(name, r.id);
  }
  const serviceIds: string[] = [];
  for (const s of SERVICES) {
    const recipe = (s.stock ?? []).map(([n, qty]) => ({ itemId: itemIds.get(n)!, qty })).filter((x) => x.itemId);
    const r = await insertRec(db, tenantId, 'service', { name: s.name, group: s.group, description: s.description, durationMin: s.durationMin, prices: pr(s.prices), recipe, otherCostCents: s.otherCost, active: true });
    serviceIds.push(r.id);
  }
  let i = 0;
  for (const [name, area] of CHECKLIST) await insertRec(db, tenantId, 'checklistItem', { name, area, order: i++, active: true });
  const complete = serviceIds[0];
  const external = serviceIds[1];
  const plans: [string, string, string, P][] = [
    ['Clube Semanal — lavagem completa', 'semanal', complete, [220, 290, 330, 400, 700]],
    ['Clube Quinzenal — lavagem completa', 'quinzenal', complete, [120, 155, 175, 215, 380]],
    ['Clube Trisemanal — lavagem completa', 'trisemanal', complete, [90, 115, 130, 160, 280]],
    ['Clube Mensal — lavagem externa', 'mensal', external, [35, 45, 55, 70, 120]],
  ];
  for (const [name, frequency, sid, p] of plans) await insertRec(db, tenantId, 'plan', { name, frequency, serviceIds: [sid], prices: pr(p), active: true });
}
