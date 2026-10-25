import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useApp } from '../lib/app';
import { useAction, useAsync, usePageTitle } from '../lib/hooks';
import { formatBRL } from '@shared/fees';
import { CATEGORIES } from '@shared/catalog';
import { daysLeft, fmtDate, priceLabel, SALE_STATUS } from '../lib/format';
import { Alert, Badge, Empty, ErrorAlert, ErrorState, Loading, PageHead, PromiseStrip, StatusBadge } from '../components/ui';
import { WithdrawModal, type WithdrawTarget } from '../components/WithdrawModal';
import { PaymentAccount } from '../components/PaymentAccount';
import { needsAction, nextStep, OrderBadge, type Order } from '../components/OrderParts';
import { OrderRows } from './Orders';
import { FeeTableView } from './Fees';

interface Mine {
  id: string; title: string; priceCents: number; rentPeriod: string | null; operation: 'venda' | 'locacao'; condition: string; category: string;
  status: string; photo: string | null; views: number; reviewNote: string | null; removedReason: string | null; openSaleId: string | null; riskFlags: string[] | null; publishedAt: string | null;
}
interface Sale { id: string; kind: string; listingId: string; listingTitle: string; feeCents: number; status: string; dueAt: string; paidAt: string | null; receiptNumber: string | null }

export function Sell() {
  usePageTitle('Venda — painel do anunciante');
  const { user, ready } = useApp();
  if (!ready) return <Loading />;
  return user ? <Panel /> : <Visitor />;
}

function Visitor() {
  const { config } = useApp();
  const fee = formatBRL(config?.removalFeeCents ?? 1000);
  return (
    <div className="stack-l">
      <section className="hero">
        <h1>Anunciar não custa nada.<br />A comissão só existe quando a venda se concluir.</h1>
        <p>Sem mensalidade, sem plano, sem taxa para publicar. O comprador paga pelo Vendeu, o dinheiro fica retido no Mercado Pago até ele receber o produto e passar o prazo de devolução, e então cai na sua conta, menos a comissão da tabela.</p>
        <div className="row wrap">
          <Link to="/cadastrar?tipo=anunciante" className="btn btn-accent btn-lg">Cadastrar e anunciar</Link>
          <Link to="/entrar?volta=/venda" className="btn btn-light btn-lg">Já tenho conta</Link>
        </div>
      </section>
      <section className="steps" aria-label="Como funciona">
        {[['1', 'Cadastre-se e verifique', 'Confirme e-mail e telefone, verifique sua identidade e conecte sua conta Mercado Pago (é por ela que você recebe).'], ['2', 'Anuncie sem custo', 'Fotos, preço e descrição. Assine a declaração de origem do bem.'], ['3', 'Receba o pedido', 'O comprador paga o preço cheio ou envia uma proposta (mínimo 50% do preço, você tem 48 h para responder).'], ['4', 'Envie e receba', 'Pagamento retido; você envia (ou entrega em mãos com código). Recebido e passados 7 dias sem devolução, o valor é repassado a você.']].map(([n, t, d]) => (
          <div className="step" key={n}><span className="step-n" aria-hidden="true">{n}</span><h2>{t}</h2><p className="muted">{d}</p></div>
        ))}
      </section>
      <section className="panel stack">
        <h2>Como a negociação funciona</h2>
        <PromiseStrip />
        <p className="small muted">O contato do comprador (telefone, e-mail) só aparece para você depois do recebimento. Antes disso, a conversa é pelo chat do Vendeu, com telefone, e-mail e links ocultados. Se o comprador devolver dentro dos 7 dias, o dinheiro volta integral para ele e ninguém paga comissão.</p>
      </section>
      <section>
        <h2>Quanto custa vender?</h2>
        <p className="muted">Comissão sobre o valor combinado do pedido, descontada do repasse, só quando a venda se conclui:</p>
        <FeeTableView />
        <p><strong>Retirar um anúncio já publicado sem vender: {fee}</strong> (taxa fixa). Rascunho, anúncio recusado e pausar/retomar não custam nada.</p>
        <p><Link to="/taxas">Calculadora, exemplos e perguntas frequentes</Link></p>
      </section>
    </div>
  );
}

function Panel() {
  const { user, pay, refresh, config } = useApp();
  const u = user!;
  const dueDays = config?.feeDueDays ?? 7;
  const [sp, setSp] = useSearchParams();
  const mine = useAsync(() => api.get<{ items: Mine[] }>('/listings/mine'), []);
  const sales = useAsync(() => api.get<{ items: Sale[]; dueCents: number | string }>('/sales'), []);
  const orders = useAsync(() => api.get<{ items: Order[] }>('/orders'), [], { silentMs: 20000 });
  const [closing, setClosing] = useState<WithdrawTarget | null>(null);
  const act = useAction();
  const mpBack = sp.get('mp') === 'ok';
  useEffect(() => {
    if (mpBack) { void refresh(); sales.reload(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mpBack]);

  const isSeller = u.accountType === 'anunciante';
  const mpDone = !!pay?.method?.connected;
  const steps: { done: boolean; title: string; text: string; to?: string; cta?: string; tone?: 'warn' | 'bad'; node?: React.ReactNode }[] = [
    { done: u.emailVerified, title: 'E-mail verificado', text: u.emailVerified ? u.email : 'Confirme o código de 6 dígitos que enviamos.', to: '/conta/confirmar', cta: 'Confirmar e-mail' },
    { done: u.phoneVerified, title: 'Telefone verificado', text: u.phoneVerified ? 'Telefone confirmado.' : 'Confirme o código de 6 dígitos enviado por SMS.', to: '/conta/confirmar', cta: 'Confirmar telefone' },
    { done: isSeller, title: 'Conta de anunciante', text: isSeller ? `${u.docType?.toUpperCase()} ${u.docMasked ?? ''} · endereço informado` : 'Informe seu CPF ou CNPJ e seu endereço.', to: '/conta/anunciante', cta: 'Virar anunciante' },
    {
      done: u.kycStatus === 'verified', title: 'Verificação de identidade',
      text: ({ none: 'Envie documento, selfie e comprovante de endereço.', pending: 'Documentos em análise pela nossa equipe.', verified: 'Identidade verificada.', rejected: `Recusada: ${u.kycRejectReason ?? 'envie novamente'}` } as const)[u.kycStatus],
      to: '/conta/verificacao', cta: u.kycStatus === 'pending' ? 'Ver andamento' : u.kycStatus === 'rejected' ? 'Enviar de novo' : 'Verificar identidade', tone: u.kycStatus === 'rejected' ? 'bad' : u.kycStatus === 'pending' ? 'warn' : undefined,
    },
    {
      done: mpDone, title: 'Conta Mercado Pago', text: mpDone ? 'Conectada: é por ela que você recebe suas vendas.' : 'Obrigatória para publicar: é por ela que você recebe. O Vendeu não vê sua senha nem seus dados bancários.',
      node: !mpDone ? <PaymentAccount /> : undefined,
    },
  ];
  const allDone = steps.every((s) => s.done);
  const overdue = (sales.data?.items ?? []).some((s) => s.status === 'awaiting_payment' && daysLeft(s.dueAt) < 0);
  const canCreate = isSeller && !u.feeBlocked;
  const sellerOrders = (orders.data?.items ?? []).filter((o) => o.role === 'seller');
  const waiting = sellerOrders.filter(needsAction);
  const openOrderOf = (listingId: string) => sellerOrders.find((o) => o.listing.id === listingId && !['released', 'refunded', 'declined', 'expired', 'cancelled'].includes(o.status));

  const pauseResume = async (id: string, action: 'pause' | 'resume') => { await act.run(() => api.post(`/listings/${id}/${action}`)); mine.reload(); };

  return (
    <div className="stack-l">
      <PageHead title="Painel do anunciante" sub="Anunciar não custa nada. A comissão só existe quando a venda se concluir."
        actions={canCreate ? <Link to="/venda/anunciar" className="btn btn-accent btn-lg">+ Anunciar</Link> : <button className="btn btn-accent btn-lg" disabled>+ Anunciar</button>} />

      {mpBack && <Alert tone="ok" title="Conta Mercado Pago conectada">{mpDone ? 'Pronto: você já pode publicar e receber pedidos.' : 'Confirmando a conexão…'} <button className="linklike" onClick={() => setSp({}, { replace: true })}>Fechar aviso</button></Alert>}

      {u.feeBlocked && (
        <Alert tone="bad" title="Novos anúncios bloqueados por taxa em atraso">
          Você tem taxa(s) de retirada vencida(s). Pague para voltar a anunciar. Seus anúncios atuais continuam no ar. <a href="#taxas">Ir para minhas taxas</a>
        </Alert>
      )}

      <section className="panel" aria-labelledby="ativacao">
        <h2 id="ativacao">{allDone ? '✅ Conta pronta para anunciar' : 'Ative sua conta para anunciar'}</h2>
        {!allDone && <p className="muted">Complete os passos abaixo. Cada um protege quem compra e quem vende.</p>}
        <ol className="checklist">
          {steps.map((s) => (
            <li key={s.title} className={s.done ? 'done' : ''}>
              <span className="check-ico" aria-hidden="true">{s.done ? '✔' : '○'}</span>
              <div>
                <strong>{s.title}</strong> <span className="sr-only">{s.done ? '(concluído)' : '(pendente)'}</span>
                <div className={`small ${s.tone === 'bad' ? 'text-bad' : 'muted'}`}>{s.text}</div>
              </div>
              {s.to && (!s.done || s.tone) ? <Link className="btn btn-outline btn-sm" to={s.to}>{s.cta}</Link> : null}
              {s.node && <div className="check-extra">{s.node}</div>}
            </li>
          ))}
        </ol>
        {mpDone && <details className="mp-details"><summary>Gerenciar conta Mercado Pago</summary><PaymentAccount /></details>}
      </section>

      <section aria-labelledby="pedidos">
        <div className="row between wrap"><h2 id="pedidos">Pedidos recebidos{waiting.length > 0 && <span className="count count-inline" aria-label={`${waiting.length} aguardando ação`}>{waiting.length}</span>}</h2><Link to="/pedidos" className="small">Ver todos os pedidos</Link></div>
        {orders.loading && !orders.data ? <Loading /> : orders.error && !orders.data ? <ErrorState error={orders.error} onRetry={orders.reload} /> : !sellerOrders.length ? (
          <Empty icon="📦" title="Nenhum pedido ainda">Quando alguém comprar, alugar ou fizer uma proposta, o pedido aparece aqui e você é avisado por e-mail.</Empty>
        ) : waiting.length ? (<>
          <p className="muted small">Aguardando uma ação sua: aceitar proposta, enviar o produto, entregar em mãos, confirmar devolução.</p>
          <OrderRows items={waiting} />
        </>) : <Alert tone="ok">Nenhum pedido aguardando ação sua. {sellerOrders.filter((o) => !['released', 'refunded', 'declined', 'expired', 'cancelled'].includes(o.status)).length} em andamento.</Alert>}
        {sellerOrders.some((o) => o.status === 'disputed') && <Alert tone="warn" title="Há pedido em disputa">A moderação está analisando e o dinheiro continua retido. <Link to="/pedidos">Ver pedidos</Link></Alert>}
      </section>

      <section aria-labelledby="meus">
        <h2 id="meus">Meus anúncios</h2>
        <ErrorAlert error={act.error} />
        {mine.loading && !mine.data ? <Loading /> : mine.error ? <ErrorState error={mine.error} onRetry={mine.reload} /> : !mine.data?.items.length ? (
          <Empty icon="📣" title="Você ainda não tem anúncios">{canCreate ? <><Link to="/venda/anunciar">Crie o primeiro</Link>. Anunciar não custa nada.</> : 'Complete a ativação acima para anunciar.'}</Empty>
        ) : (
          <ul className="rows">
            {mine.data.items.map((l) => {
              const cat = CATEGORIES.find((c) => c.slug === l.category);
              const ord = l.status === 'reserved' ? openOrderOf(l.id) : undefined;
              return (
                <li key={l.id} className="row-card">
                  <div className="row-thumb">{l.photo ? <img src={l.photo} alt="" loading="lazy" /> : <span aria-hidden="true">{cat?.icon}</span>}</div>
                  <div className="row-main">
                    <Link to={`/anuncio/${l.id}`} className="row-title">{l.title}</Link>
                    <div className="row wrap gap-s"><StatusBadge status={l.status} /><span className="small muted">{priceLabel(l.priceCents, l.rentPeriod)} · {l.operation === 'venda' ? 'Venda' : 'Locação'} · {l.condition === 'novo' ? 'Novo' : 'Usado'} · {l.views} visualizações</span></div>
                    {l.status === 'rejected' && <div className="small text-bad">Recusado: {l.removedReason ?? l.reviewNote ?? 'veja as regras de anúncio'}</div>}
                    {l.status === 'pending_review' && <div className="small muted">Em análise pela equipe{l.reviewNote ? `: ${l.reviewNote}` : '.'}</div>}
                    {l.status === 'reserved' && ord && <div className="small">{nextStep(ord)} <OrderBadge status={ord.status} /></div>}
                  </div>
                  <div className="row-actions">
                    {l.status === 'reserved' && <Link className="btn btn-primary btn-sm" to={ord ? `/pedidos/${ord.id}` : '/pedidos'}>Ver pedido</Link>}
                    {['draft', 'rejected'].includes(l.status) && <Link className="btn btn-primary btn-sm" to={`/venda/anuncio/${l.id}/editar`}>{l.status === 'draft' ? 'Continuar' : 'Corrigir e publicar'}</Link>}
                    {['active', 'paused', 'pending_review'].includes(l.status) && <Link className="btn btn-outline btn-sm" to={`/venda/anuncio/${l.id}/editar`}>Editar</Link>}
                    {l.status === 'active' && <button className="btn btn-outline btn-sm" disabled={act.busy} onClick={() => pauseResume(l.id, 'pause')}>Pausar</button>}
                    {l.status === 'paused' && <button className="btn btn-outline btn-sm" disabled={act.busy} onClick={() => pauseResume(l.id, 'resume')}>Retomar</button>}
                    {['active', 'paused', 'pending_review', 'draft', 'rejected'].includes(l.status) && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setClosing({ id: l.id, title: l.title, status: l.status, publishedAt: l.publishedAt })}>Retirar anúncio</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="taxas">
        <h2 id="taxas">Taxas de retirada</h2>
        {sales.loading && !sales.data ? <Loading /> : sales.error ? <ErrorState error={sales.error} onRetry={sales.reload} /> : !sales.data?.items.length ? (
          <Empty icon="🧾" title="Nenhuma taxa de retirada">Ela só existe se você retirar, sem vender, um anúncio que já foi publicado ({formatBRL(config?.removalFeeCents ?? 1000)}). A comissão de vendas é descontada do repasse e aparece nos pedidos.</Empty>
        ) : (
          <>
            <div className="panel total-box">
              <div><span className="muted small">Total a pagar</span><div className="price price-lg">{formatBRL(Number(sales.data.dueCents))}</div></div>
              <div className="small muted">Prazo: {dueDays} dias após retirar o anúncio. Atrasou? Novos anúncios ficam bloqueados até pagar.</div>
            </div>
            {overdue && <Alert tone="bad" title="Taxa vencida">Pague hoje para evitar o bloqueio de novos anúncios.</Alert>}
            <ul className="rows">
              {sales.data.items.map((s) => {
                const st = SALE_STATUS[s.status] ?? { label: s.status, tone: 'muted' as const };
                const dl = daysLeft(s.dueAt);
                return (
                  <li key={s.id} className="row-card">
                    <div className="row-main">
                      <strong className="row-title">{s.listingTitle}</strong>
                      <div className="row wrap gap-s"><Badge tone={st.tone}>{st.label}</Badge></div>
                      <div className="small muted">Taxa de retirada <strong>{formatBRL(s.feeCents)}</strong>
                        {s.status === 'awaiting_payment' && <> · vence em {fmtDate(s.dueAt)} ({dl >= 0 ? `${dl} dia(s)` : 'vencida'})</>}
                        {s.status === 'paid' && <> · paga em {fmtDate(s.paidAt)} · recibo {s.receiptNumber}</>}
                      </div>
                    </div>
                    <div className="row-actions">
                      {s.status === 'awaiting_payment' && <Link className="btn btn-primary btn-sm" to={`/venda/taxa/${s.id}`}>Pagar taxa</Link>}
                      {s.status === 'paid' && <Link className="btn btn-outline btn-sm" to={`/venda/taxa/${s.id}`}>Ver recibo</Link>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <WithdrawModal target={closing} onClose={() => setClosing(null)} onDone={() => { setClosing(null); mine.reload(); sales.reload(); void refresh(); }}
        onPause={(id) => void pauseResume(id, 'pause')} />
      <details className="panel"><summary>Tabela de comissão</summary><FeeTableView /></details>
    </div>
  );
}
