import QRCode from 'qrcode';
import { requireBusiness } from '@/lib/auth';
import { one } from '@/lib/db';
import { config } from '@/lib/config';
import { PrintButton } from '@/components/PrintButton';

export const metadata = { title: 'Kit do caixa' };

const INK = '#1B2A6B';

function Steps() {
  return (
    <ol style={{ margin: 0, paddingLeft: 22, lineHeight: 1.45 }}>
      <li>Aponte a câmera do celular para este QR</li>
      <li>Crie sua conta grátis (leva 1 minuto)</li>
      <li>Leia o QR da sua nota fiscal, ou tire uma foto e informe o valor e o número</li>
    </ol>
  );
}

export default async function Kit() {
  const { business } = await requireBusiness();
  const b = await one<{ kit_code: string; name: string }>('select kit_code, name from businesses where id=$1', [business.id]);
  const best = await one<{ kind: string; value: number }>(
    `select kind, value from cashback_rules where business_id=$1 and active and audience='all' and weekdays is null and (ends_at is null or ends_at >= current_date) order by (kind='percent') desc, value desc limit 1`,
    [business.id],
  );
  const welcome = await one<{ kind: string; value: number; new_window_days: number | null }>(
    `select kind, value, new_window_days from cashback_rules where business_id=$1 and active and audience='new_customer' order by value desc limit 1`,
    [business.id],
  );
  const fmt = (r: { kind: string; value: number }) => (r.kind === 'percent' ? `${(r.value / 100).toLocaleString('pt-BR')}%` : `R$ ${(r.value / 100).toFixed(2).replace('.', ',')}`);
  const url = `${config.appUrl.replace(/\/$/, '')}/n/${b!.kit_code}`;
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: INK, light: '#FFFFFF' } });
  const qr = (size: number) => <div style={{ width: size, height: size, margin: '0 auto' }} dangerouslySetInnerHTML={{ __html: svg.replace('<svg', `<svg width="${size}" height="${size}"`) }} />;
  const headline = best ? `${fmt(best)} de volta` : 'Cashback';
  const sheet: React.CSSProperties = { background: '#fff', border: '1px solid var(--line)', borderRadius: 18, padding: 28, color: INK };

  return (
    <div className="stack">
      <div className="noprint stack">
        <h1>Kit do caixa</h1>
        <p className="muted">
          Imprima e deixe no caixa. O cliente aponta a câmera para o QR, cria a conta grátis e cadastra a nota fiscal: pelo QR do cupom ou por foto, com valor e número. Você confirma no painel e a
          mesma nota nunca entra duas vezes.
        </p>
        <div className="row">
          <PrintButton />
          <span className="muted" style={{ fontSize: 14 }}>
            Link do seu QR: {url}
          </span>
        </div>
      </div>

      {/* Cartaz A4 */}
      <section className="kit-sheet kit-poster" style={{ ...sheet, textAlign: 'center' }}>
        <img src="/logo.svg" alt="Cashbacksmart" style={{ height: 46 }} />
        <p style={{ fontSize: 22, margin: '18px 0 4px', fontWeight: 700 }}>Compre aqui e ganhe</p>
        <p style={{ fontSize: 54, lineHeight: 1.05, margin: 0, fontWeight: 800, color: '#12A150' }}>{headline}</p>
        {welcome && (
          <p style={{ fontSize: 20, margin: '10px 0 0', fontWeight: 700 }}>
            Cliente novo: {fmt(welcome)} {welcome.new_window_days ? `nos primeiros ${welcome.new_window_days} dias` : 'na primeira compra'}
          </p>
        )}
        <div style={{ margin: '22px 0' }}>{qr(300)}</div>
        <div style={{ maxWidth: 460, margin: '0 auto', textAlign: 'left', fontSize: 18 }}>
          <Steps />
        </div>
        <p style={{ margin: '18px 0 0', fontWeight: 700 }}>{b!.name} · cashbacksmart.com.br</p>
      </section>

      {/* Display de balcão (2 por folha) */}
      <section className="kit-sheet kit-counter" style={{ ...sheet, display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {[0, 1].map((i) => (
          <div key={i} style={{ border: `2px dashed ${INK}`, borderRadius: 16, padding: 18, textAlign: 'center' }}>
            <img src="/logo.svg" alt="Cashbacksmart" style={{ height: 30 }} />
            <p style={{ fontSize: 30, fontWeight: 800, margin: '10px 0', color: '#12A150' }}>{headline}</p>
            {qr(170)}
            <p style={{ margin: '10px 0 0', fontWeight: 700 }}>Aponte a câmera e cadastre sua nota</p>
            <small>{b!.name}</small>
          </div>
        ))}
      </section>

      {/* Adesivos (12 por folha) */}
      <section className="kit-sheet kit-stickers" style={{ ...sheet, display: 'grid', gap: 14, gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {Array.from({ length: 12 }, (_, i) => i).map((i) => (
          <div key={i} style={{ border: `1.5px solid ${INK}`, borderRadius: 22, padding: '14px 10px', textAlign: 'center' }}>
            {qr(110)}
            <p style={{ margin: '6px 0 0', fontWeight: 800 }}>{headline}</p>
            <small>cashbacksmart.com.br</small>
          </div>
        ))}
      </section>
    </div>
  );
}
