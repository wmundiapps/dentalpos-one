import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useApp } from '../lib/app';
import { useAction, useAsync, usePageTitle } from '../lib/hooks';
import { formatBRL } from '@shared/fees';
import { CATEGORIES } from '@shared/catalog';
import { daysLeft, fmtDate, priceLabel, SALE_STATUS } from '../lib/format';
import { Alert, Badge, Empty, ErrorAlert, ErrorState, Loading, PageHead, StatusBadge } from '../components/ui';
import { CloseModal, type CloseTarget } from '../components/CloseModal';
import { FeeTableView } from './Fees';

interface Mine {
  id: string; title: string; priceCents: number; rentPeriod: string | null; operation: 'venda' | 'locacao'; condition: string; category: string;
  status: string; photo: string | null; views: number; reviewNote: string | null; removedReason: string | null; openSaleId: string | null; riskFlags: string[] | null;
}
interface Sale { id: string; listingId: string; listingTitle: string; operation: string; declaredPriceCents: number; feeCents: number; status: string; flagged: boolean; dueAt: string; paidAt: string | null; receiptNumber: string | null }

export function Sell() {
  usePageTitle('Venda — painel do anunciante');
  const { user, ready } = useApp();
  if (!ready) return <Loading />;
  return user ? <Panel /> : <Visitor />;
}

function Visitor() {
  return (
    <div className="stack-l">
      <section className="hero">
        <h1>Anunciar é grátis.<br />Você só paga quando vender e retirar o anúncio.</h1>
        <p>Sem mensalidade, sem plano, sem taxa para publicar. Quando vender ou alugar, você marca como vendido e paga uma taxa pequena, calculada pelo valor do negócio.</p>
        <div className="row wrap">
          <Link to="/cadastrar?tipo=anunciante" className="btn btn-accent btn-lg">Cadastrar e anunciar</Link>
          <Link to="/entrar?volta=/venda" className="btn btn-light btn-lg">Já tenho conta</Link>
        </div>
      </section>
      <section className="steps" aria-label="Como funciona">
        {[['1', 'Cadastre-se', 'Confirme e-mail e telefone e verifique sua identidade. Isso protege compradores e você.'], ['2', 'Anuncie grátis', 'Fotos, preço e descrição. Assine a declaração de origem do bem.'], ['3', 'Negocie no Vendeu', 'Converse pelo chat, combine o encontro em local público.'], ['4', 'Vendeu? Retire o anúncio', 'Informe o valor fechado e pague a taxa por Pix ou cartão.']].map(([n, t, d]) => (
          <div className="step" key={n}><span className="step-n" aria-hidden="true">{n}</span><h2>{t}</h2><p className="muted">{d}</p></div>
        ))}
      </section>
      <section>
        <h2>Quanto custa vender?</h2>
        <FeeTableView />
        <p><Link to="/taxas">Calculadora, exemplos e perguntas frequentes</Link></p>
      </section>
    </div>
  );
}

function Panel() {
  const { user, feesDueCents, refresh, config } = useApp();
  const u = user!;
  const dueDays = config?.feeDueDays ?? 7;
  const mine = useAsync(() => api.get<{ items: Mine[] }>('/listings/mine'), []);
  const sales = useAsync(() => api.get<{ items: Sale[]; dueCents: number | string }>('/sales'), []);
  const [closing, setClosing] = useState<CloseTarget | null>(null);
  const act = useAction();

  const isSeller = u.accountType === 'anunciante';
  const steps: { done: boolean; title: string; text: string; to?: string; cta?: string; tone?: 'warn' | 'bad' }[] = [
    { done: u.emailVerified, title: 'E-mail verificado', text: u.emailVerified ? u.email : 'Confirme o código de 6 dígitos que enviamos.', to: '/conta/confirmar', cta: 'Confirmar e-mail' },
    { done: u.phoneVerified, title: 'Telefone verificado', text: u.phoneVerified ? 'Telefone confirmado.' : 'Confirme o código de 6 dígitos enviado por SMS.', to: '/conta/confirmar', cta: 'Confirmar telefone' },
    { done: isSeller, title: 'Conta de anunciante', text: isSeller ? `${u.docType?.toUpperCase()} ${u.docMasked ?? ''} · endereço informado` : 'Informe seu CPF ou CNPJ e seu endereço.', to: '/conta/anunciante', cta: 'Virar anunciante' },
    {
      done: u.kycStatus === 'verified', title: 'Verificação de identidade',
      text: ({ none: 'Envie documento, selfie e comprovante de endereço.', pending: 'Documentos em análise pela nossa equipe.', verified: 'Identidade verificada.', rejected: `Recusada: ${u.kycRejectReason ?? 'envie novamente'}` } as const)[u.kycStatus],
      to: '/conta/verificacao', cta: u.kycStatus === 'pending' ? 'Ver andamento' : u.kycStatus === 'rejected' ? 'Enviar de novo' : 'Verificar identidade', tone: u.kycStatus === 'rejected' ? 'bad' : u.kycStatus === 'pending' ? 'warn' : undefined,
    },
  ];
  const allDone = steps.every((s) => s.done);
  const overdue = (sales.data?.items ?? []).some((s) => s.status === 'awaiting_payment' && daysLeft(s.dueAt) < 0);
  const canCreate = isSeller && !u.feeBlocked;

  const pauseResume = async (id: string, action: 'pause' | 'resume') => { await act.run(() => api.post(`/listings/${id}/${action}`)); mine.reload(); };
  const removeDraft = async (l: Mine) => { await act.run(() => api.post(`/listings/${l.id}/close`, { sold: false, reason: 'desisti' })); mine.reload(); };

  return (
    <div className="stack-l">
      <PageHead title="Painel do anunciante" sub="Anunciar é grátis. Você só paga quando vender e retirar o anúncio."
        actions={canCreate ? <Link to="/venda/anunciar" className="btn btn-accent btn-lg">+ Anunciar</Link> : <button className="btn btn-accent btn-lg" disabled>+ Anunciar</button>} />

      {u.feeBlocked && (
        <Alert tone="bad" title="Novos anúncios bloqueados por taxa em atraso">
          Você tem taxa(s) vencida(s). Pague para voltar a anunciar. Seus anúncios atuais continuam no ar. <a href="#taxas">Ir para minhas taxas</a>
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
              {!s.done || s.tone ? <Link className="btn btn-outline btn-sm" to={s.to!}>{s.cta}</Link> : null}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="meus">
        <h2 id="meus">Meus anúncios</h2>
        <ErrorAlert error={act.error} />
        {mine.loading && !mine.data ? <Loading /> : mine.error ? <ErrorState error={mine.error} onRetry={mine.reload} /> : !mine.data?.items.length ? (
          <Empty icon="📣" title="Você ainda não tem anúncios">{canCreate ? <><Link to="/venda/anunciar">Crie o primeiro</Link>. É grátis.</> : 'Complete a ativação acima para anunciar.'}</Empty>
        ) : (
          <ul className="rows">
            {mine.data.items.map((l) => {
              const cat = CATEGORIES.find((c) => c.slug === l.category);
              return (
                <li key={l.id} className="row-card">
                  <div className="row-thumb">{l.photo ? <img src={l.photo} alt="" loading="lazy" /> : <span aria-hidden="true">{cat?.icon}</span>}</div>
                  <div className="row-main">
                    <Link to={`/anuncio/${l.id}`} className="row-title">{l.title}</Link>
                    <div className="row wrap gap-s"><StatusBadge status={l.status} /><span className="small muted">{priceLabel(l.priceCents, l.rentPeriod)} · {l.operation === 'venda' ? 'Venda' : 'Locação'} · {l.condition === 'novo' ? 'Novo' : 'Usado'} · {l.views} visualizações</span></div>
                    {l.status === 'rejected' && <div className="small text-bad">Recusado: {l.removedReason ?? l.reviewNote ?? 'veja as regras de anúncio'}</div>}
                    {l.status === 'pending_review' && <div className="small muted">Em análise pela equipe{l.reviewNote ? `: ${l.reviewNote}` : '.'}</div>}
                  </div>
                  <div className="row-actions">
                    {l.status === 'pending_checkout' && l.openSaleId && <Link className="btn btn-primary btn-sm" to={`/venda/taxa/${l.openSaleId}`}>Pagar taxa</Link>}
                    {['draft', 'rejected'].includes(l.status) && <Link className="btn btn-primary btn-sm" to={`/venda/anuncio/${l.id}/editar`}>{l.status === 'draft' ? 'Continuar' : 'Corrigir e publicar'}</Link>}
                    {['active', 'paused', 'pending_review'].includes(l.status) && <Link className="btn btn-outline btn-sm" to={`/venda/anuncio/${l.id}/editar`}>Editar</Link>}
                    {l.status === 'active' && <button className="btn btn-outline btn-sm" disabled={act.busy} onClick={() => pauseResume(l.id, 'pause')}>Pausar</button>}
                    {l.status === 'paused' && <button className="btn btn-outline btn-sm" disabled={act.busy} onClick={() => pauseResume(l.id, 'resume')}>Retomar</button>}
                    {['active', 'paused', 'pending_review'].includes(l.status) && (
                      <button className="btn btn-primary btn-sm" onClick={() => setClosing({ id: l.id, title: l.title, priceCents: l.priceCents, operation: l.operation })}>
                        {l.operation === 'locacao' ? 'Aluguei' : 'Vendi'} — retirar anúncio
                      </button>
                    )}
                    {['draft', 'rejected'].includes(l.status) && <button className="btn btn-ghost btn-sm" disabled={act.busy} onClick={() => removeDraft(l)}>Retirar</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="taxas">
        <h2 id="taxas">Minhas vendas e taxas</h2>
        {sales.loading && !sales.data ? <Loading /> : sales.error ? <ErrorState error={sales.error} onRetry={sales.reload} /> : !sales.data?.items.length ? (
          <Empty icon="🧾" title="Nenhuma venda ainda">Quando você vender ou alugar, o valor e a taxa aparecem aqui.</Empty>
        ) : (
          <>
            <div className="panel total-box">
              <div><span className="muted small">Total a pagar</span><div className="price price-lg">{formatBRL(Number(sales.data.dueCents))}</div></div>
              <div className="small muted">Prazo: {dueDays} dias após marcar como vendido. Atrasou? Novos anúncios ficam bloqueados até pagar.</div>
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
                      <div className="row wrap gap-s"><Badge tone={st.tone}>{st.label}</Badge>{s.flagged && <Badge tone="warn">Em análise</Badge>}</div>
                      <div className="small muted">Valor fechado {formatBRL(s.declaredPriceCents)} · taxa <strong>{formatBRL(s.feeCents)}</strong>
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
        {feesDueCents > 0 && <p className="sr-only">Total em aberto {formatBRL(feesDueCents)}</p>}
      </section>

      <CloseModal target={closing} onClose={() => setClosing(null)} onDone={() => { setClosing(null); mine.reload(); sales.reload(); void refresh(); }} />
      <details className="panel"><summary>Tabela de taxas</summary><FeeTableView /></details>
    </div>
  );
}

