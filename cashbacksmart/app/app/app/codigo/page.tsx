import QRCode from 'qrcode';
import { requireRole } from '@/lib/auth';
import { getUser } from '@/lib/services/accounts';

export const metadata = { title: 'Meu código' };

export default async function Codigo() {
  const { userId } = await requireRole('consumer');
  const u = await getUser(userId);
  const svg = await QRCode.toString(u!.member_code, { type: 'svg', margin: 0, color: { dark: '#1B2A6B', light: '#FFFFFF' } });
  const code = u!.member_code;
  return (
    <div className="stack" style={{ textAlign: 'center', maxWidth: 460, margin: '0 auto' }}>
      <h1>Meu código</h1>
      <p className="muted">Mostre no caixa antes de pagar. A loja também pode te achar pelo CPF ou celular.</p>
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
