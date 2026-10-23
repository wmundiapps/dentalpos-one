import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { one } from '@/lib/db';
import { config } from '@/lib/config';
import { myClaims } from '@/lib/services/nfce';
import { brl, dateTimeBR } from '@/lib/format';
import { ClaimForm } from './ClaimForm';
import { PhotoClaimForm } from '@/app/n/[code]/PhotoClaimForm';
import { q } from '@/lib/db';

export const metadata = { title: 'Enviar nota fiscal' };

const ST: Record<string, [string, string]> = { pending: ['Aguardando a loja', 'coin'], confirmed: ['Aprovada', 'green'], rejected: ['Recusada', 'coral'], canceled: ['Cancelada', ''] };

export default async function Nota() {
  const { userId } = await requireRole('consumer');
  const [u, claims] = await Promise.all([one<{ phone_verified_at: Date | null; city: string; state: string }>('select phone_verified_at, city, state from users where id=$1', [userId]), myClaims(userId)]);
  const stores = await q<{ kit_code: string; name: string }>(
    `select kit_code, name from businesses where status='active' and state=$1 and lower(city)=lower($2) order by name limit 500`,
    [u?.state || '', u?.city || ''],
  );
  const blocked = config.requirePhoneVerification && !u?.phone_verified_at;
  return (
    <div className="stack" style={{ maxWidth: 600 }}>
      <h1>Enviar nota fiscal</h1>
      <p className="muted">A loja esqueceu de lançar? Leia o QR do cupom fiscal e informe o valor. A loja confirma em até {config.claimAutoApproveHours} horas. Vale para notas deste mês e do mês passado, e cada nota só vale uma vez.</p>
      {blocked ? (
        <p className="alert warn">
          Confirme seu celular em <Link href="/app/conta">Conta</Link> para enviar notas.
        </p>
      ) : (
        <>
          <ClaimForm />
          <details className="card">
            <summary style={{ fontWeight: 700, cursor: 'pointer' }}>A nota não tem QR? Envie a foto</summary>
            <p className="muted">Tire uma foto da nota e informe o valor e o número. A loja confere e confirma. No caixa, você também pode apontar a câmera para o QR do Cashbacksmart da loja.</p>
            <PhotoClaimForm stores={stores} />
          </details>
        </>
      )}
      <section className="card">
        <h2>Notas enviadas</h2>
        {claims.length ? (
          <div className="list">
            {claims.map((c: any) => (
              <div key={c.id} className="row between" style={{ alignItems: 'flex-start' }}>
                <span>
                  <strong>{c.business}</strong> · {brl(c.amount_cents)}
                  <small style={{ display: 'block' }}>
                    {dateTimeBR(c.created_at)} · cashback {brl(c.cashback_cents)}
                    {c.reject_reason ? ` · motivo: ${c.reject_reason}` : ''}
                  </small>
                </span>
                <span className={`tag ${ST[c.status][1]}`}>{ST[c.status][0]}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Nenhuma nota enviada ainda.</p>
        )}
      </section>
    </div>
  );
}
