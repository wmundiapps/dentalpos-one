import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { one } from '@/lib/db';
import { config } from '@/lib/config';
import { businessByKit } from '@/lib/services/nfce';
import { ClaimForm } from '@/app/app/nota/ClaimForm';
import { PhotoClaimForm } from './PhotoClaimForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ganhe cashback nesta compra' };

/** Página do QR impresso no caixa: o cliente cadastra a nota desta loja */
export default async function Caixa({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ modo?: string }> }) {
  const { code } = await params;
  const sp = await searchParams;
  const biz = await businessByKit(code);
  if (!biz) notFound();
  const sess = await getSession();
  const back = `/n/${biz.kit_code}`;
  const best = await one<{ kind: string; value: number }>(
    `select kind, value from cashback_rules where business_id=$1 and active and audience='all' and weekdays is null and (ends_at is null or ends_at >= current_date) order by (kind='percent') desc, value desc limit 1`,
    [biz.id],
  );
  const offer = best ? (best.kind === 'percent' ? `${(best.value / 100).toLocaleString('pt-BR')}% de volta` : `R$ ${(best.value / 100).toFixed(2).replace('.', ',')} de volta`) : 'cashback';
  let blocked = false;
  if (sess?.role === 'consumer' && config.requirePhoneVerification) {
    const u = await one<{ phone_verified_at: Date | null }>('select phone_verified_at from users where id=$1', [sess.userId]);
    blocked = !u?.phone_verified_at;
  }
  const photo = sp.modo === 'foto';
  return (
    <main className="auth">
      <div className="card" style={{ maxWidth: 520 }}>
        <Link href="/" aria-label="Página inicial">
          <img src="/logo.svg" alt="Cashbacksmart" className="logo" />
        </Link>
        <p className="muted" style={{ margin: '0 0 4px' }}>
          {biz.category} · {biz.city}/{biz.state}
        </p>
        <h1 style={{ marginTop: 0 }}>{biz.name}</h1>
        <p className="tag green" style={{ display: 'inline-block' }}>
          Ganhe {offer} nesta compra
        </p>

        {!sess ? (
          <div className="stack" style={{ marginTop: 16 }}>
            <p>Cadastre sua nota fiscal e receba cashback para usar na próxima compra aqui. A conta é grátis.</p>
            <Link className="btn block" href={`/cadastro?volta=${encodeURIComponent(back)}`}>
              Criar conta grátis
            </Link>
            <Link className="btn ghost block" href={`/entrar?volta=${encodeURIComponent(back)}`}>
              Já tenho conta
            </Link>
          </div>
        ) : sess.role !== 'consumer' ? (
          <p className="alert warn" style={{ marginTop: 16 }}>
            Esta página é para clientes. Entre com uma conta de cliente para cadastrar a nota.
          </p>
        ) : blocked ? (
          <p className="alert warn" style={{ marginTop: 16 }}>
            Confirme seu celular em <Link href="/app/conta">Conta</Link> para cadastrar notas. Leva 1 minuto.
          </p>
        ) : (
          <div className="stack" style={{ marginTop: 16 }}>
            <div className="seg" role="tablist" aria-label="Como cadastrar">
              <Link href={back} className={!photo ? 'on' : ''} role="tab" aria-selected={!photo}>
                QR da nota
              </Link>
              <Link href={`${back}?modo=foto`} className={photo ? 'on' : ''} role="tab" aria-selected={photo}>
                Foto da nota
              </Link>
            </div>
            {photo ? (
              <>
                <p className="muted" style={{ margin: 0 }}>
                  Sem QR na nota? Tire uma foto, informe o valor e o número. A loja confere e confirma.
                </p>
                <PhotoClaimForm kit={biz.kit_code} />
              </>
            ) : (
              <>
                <p className="muted" style={{ margin: 0 }}>
                  Aponte a câmera para o QR impresso no cupom fiscal e informe o valor total.
                </p>
                <ClaimForm />
              </>
            )}
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Cada nota vale uma vez. Se a loja já lançou sua compra, nada é duplicado. <Link href="/app/nota">Ver minhas notas</Link>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
