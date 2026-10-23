import QRCode from 'qrcode';
import { requireRole } from '@/lib/auth';
import { getUser } from '@/lib/services/accounts';
import { isPremium } from '@/lib/services/cashback';
import { pool } from '@/lib/db';
import { MemberCard } from '@/components/MemberCard';

export const metadata = { title: 'Meu código' };

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export default async function Codigo() {
  const { userId } = await requireRole('consumer');
  const u = await getUser(userId);
  const code = u!.member_code;
  const svg = await QRCode.toString(code, { type: 'svg', margin: 0, color: { dark: '#1B2A6B', light: '#FFFFFF' } });
  const premium = await isPremium(pool(), userId).catch(() => false);
  const created = u!.created_at ? new Date(u!.created_at) : null;
  const since = created ? `${MESES[created.getMonth()]}/${created.getFullYear()}` : '';
  return (
    <div className="stack" style={{ textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
      <h1>Meu código</h1>
      <p className="muted">Mostre no caixa antes de pagar. A loja também pode te achar pelo CPF ou celular.</p>
      <MemberCard name={u!.name} code={code} qrSvg={svg} premium={premium} since={since} />
      <p className="muted" style={{ margin: 0 }}>Salve o cartão no celular ou imprima: o QR identifica você em qualquer loja participante.</p>
      <div>
        <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      <div className="code-big" data-testid="member-code" aria-label={`Código ${code.split('').join(' ')}`}>
        {code.slice(0, 4)} {code.slice(4)}
      </div>
      <div className="card tight" style={{ textAlign: 'left' }}>
        <h3>Indique e espalhe</h3>
        <p style={{ margin: 0 }}>
          Seu código de indicação: <strong>{u!.referral_code}</strong>
        </p>
        <small>Link: cashbacksmart.com.br/cadastro?indicacao={u!.referral_code}</small>
      </div>
    </div>
  );
}
