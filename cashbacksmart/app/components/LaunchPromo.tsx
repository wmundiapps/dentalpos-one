import Link from 'next/link';

/** Promoção de inauguração para lojas novas + garantia de cancelamento */
export function LaunchPromo({ cta = true }: { cta?: boolean }) {
  return (
    <div className="promo" role="note" aria-label="Promoção de inauguração">
      <small style={{ display: 'block', fontWeight: 800, letterSpacing: '.06em' }}>PROMOÇÃO DE INAUGURAÇÃO</small>
      <strong>APROVEITE: 6 meses de mensalidade grátis. Cadastre sua loja!</strong>
      <p style={{ margin: '6px 0 0', color: 'var(--ink)' }}>
        <b>Garantia:</b> cancele quando quiser, sem multa e sem perguntas. Você paga só até o mês em uso.
      </p>
      {cta && (
        <Link href="/cadastro/empresa" className="btn" style={{ marginTop: 10 }}>
          Quero meus 6 meses grátis
        </Link>
      )}
    </div>
  );
}

export function CancelGuarantee() {
  return (
    <p className="muted" style={{ margin: 0 }}>
      Sem fidelidade: cancele quando quiser, sem multa e sem perguntas. A loja continua funcionando até o fim do mês e você paga só até o mês em uso, na fatura do dia 1º.
    </p>
  );
}
