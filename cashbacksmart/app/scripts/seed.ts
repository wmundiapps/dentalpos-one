/**
 * Cria o administrador (ADMIN_EMAIL / ADMIN_PASSWORD) e, com SEED_DEMO=1, lojas e um cliente de demonstração.
 */
import { pool, one } from '../lib/db';
import { createAdmin, registerBusiness, registerConsumer } from '../lib/services/accounts';
import { saveRule } from '../lib/services/cashback';

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const pass = process.env.ADMIN_PASSWORD;
  if (email && pass) {
    await createAdmin('Administrador', email, pass);
    console.log('Admin pronto:', email);
  }
  if (process.env.SEED_DEMO === '1') {
    const exists = await one("select 1 from users where email='padaria@demo.cashbacksmart.com.br'");
    if (!exists) {
      const shops = [
        { email: 'padaria@demo.cashbacksmart.com.br', businessName: 'Padaria Trigo Bom', cnpj: '11222333000181', category: 'Alimentação', neighborhood: 'Zona 7', kind: 'percent' as const, value: 1000, welcome: { kind: 'percent' as const, value: 3000, windowDays: null } },
        { email: 'farmacia@demo.cashbacksmart.com.br', businessName: 'Farmácia Vida', cnpj: '45723174000110', category: 'Farmácia', neighborhood: 'Centro', kind: 'percent' as const, value: 500, welcome: { kind: 'percent' as const, value: 1000, windowDays: 30 } },
        { email: 'salao@demo.cashbacksmart.com.br', businessName: 'Studio Bela', cnpj: '33000167000101', category: 'Beleza e estética', neighborhood: 'Zona 5', kind: 'fixed' as const, value: 700, welcome: null },
        { email: 'mercado@demo.cashbacksmart.com.br', businessName: 'Mercadinho Central', cnpj: '06990590000123', category: 'Mercado', neighborhood: 'Vila Operária', kind: 'percent' as const, value: 300, welcome: null },
      ];
      for (const s of shops) {
        const b = await registerBusiness({ name: 'Responsável ' + s.businessName, email: s.email, phone: '44999990000', password: 'Demo#2026', city: 'Maringá', state: 'PR', businessName: s.businessName, cnpj: s.cnpj, welcome: s.welcome, category: s.category, neighborhood: s.neighborhood, cashbackKind: s.kind, cashbackValue: s.value, acceptAds: true });
        if (s.businessName === 'Padaria Trigo Bom') {
          await saveRule(b.businessId, b.id, { title: 'Terça em dobro', kind: 'percent', value: 2000, weekdays: [2], maxCashbackCents: 2000 });
          await pool().query(`update businesses set kit_code='PADARIA1' where id=$1`, [b.businessId]);
          await pool().query(
            `insert into lead_pages (slug, business_id, title, offer, category, city, state, created_by) values ('cafe-da-manha-gratis', $1, 'Café da manhã com 30% de volta', 'Cadastre-se e ganhe 30% de cashback na sua primeira compra na Padaria Trigo Bom. Válido para clientes novos.', 'Alimentação', 'Maringá', 'PR', $2)`,
            [b.businessId, b.id],
          );
        }
      }
      await registerConsumer({ name: 'Cliente Demonstração', email: 'cliente@demo.cashbacksmart.com.br', phone: '44988887777', cpf: '52998224725', password: 'Demo#2026', city: 'Maringá', state: 'PR', acceptAds: true });
      console.log('Dados de demonstração criados (senha Demo#2026)');
    }
  }
  await pool().end();
}
main().catch((e) => { console.error(e); process.exit(1); });
