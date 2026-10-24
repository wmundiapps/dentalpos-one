import { Link } from 'react-router-dom';
import { Badge, Card, Kpi, Loading, Money, Page, useLoad } from '../ui';
import { dmy, hm } from '../format';
import { useMe } from '../App';

export default function Dashboard() {
  const { me } = useMe();
  const { data: d, error } = useLoad<any>('/dashboard');
  if (!d) return <Loading error={error} />;
  return (
    <Page title={`Olá, ${me.user.name.split(' ')[0]}!`} sub={me.tenant?.name} actions={<Link className="btn primary" to="/checkin">📝 Novo check-in</Link>}>
      {d.trialDaysLeft === 0 && <div className="alert warn">Seu teste grátis terminou. A cobrança da mensalidade chega por e-mail. Seus dados continuam guardados.</div>}
      {d.trialDaysLeft !== null && d.trialDaysLeft > 0 && <div className="alert info">Teste grátis: faltam <b>{d.trialDaysLeft} dias</b>. Depois, mensalidade de {(me.tenant!.monthlyFeeCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.</div>}
      {d.billingStatus === 'inadimplente' && <div className="alert bad"><b>VOCÊ ESTÁ EM RISCO:</b> há mensalidade do LavaPos em atraso. Regularize para não perder recursos.</div>}
      {d.complianceAlerts.length > 0 && <div className="alert warn"><b>Atenção:</b> {d.complianceAlerts.slice(0, 3).map((a: any) => `${a.title} (${a.daysLeft < 0 ? `venceu há ${-a.daysLeft}d` : a.daysLeft === 0 ? 'vence hoje' : `em ${a.daysLeft}d`})`).join(' · ')} — <Link to="/lembretes">ver tudo</Link></div>}
      {me.user.role === 'owner' && d.cashbacksmartEnabled === false && (<div className="cs-card"><div className="cs-kicker">NOVIDADE</div><h2>Cashback para seus clientes</h2><p>Participe do Cashbacksmart e faça seus clientes voltarem mais.</p><Link className="btn-cs" to="/marketing">💚 Quero participar do Cashbacksmart</Link></div>)}
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Kpi label="Carros em serviço" value={d.inService} /><Kpi label="Prontos para retirar" value={d.ready} tone={d.ready ? 'ok' : undefined} />
        <Kpi label="Recebido hoje" value={<Money cents={d.revenueTodayCents} />} /><Kpi label="Recebido no mês" value={<Money cents={d.revenueMonthCents} />} />
        <Kpi label="Clientes" value={d.customers} /><Kpi label="Assinantes do clube" value={d.subscribers} /><Kpi label="Receita recorrente (mês)" value={<Money cents={d.mrrCents} />} />
      </div>
      <div className="grid g2">
        <Card title="Agenda de hoje" right={<Link to="/agenda">abrir</Link>}>
          {d.appointmentsToday.length === 0 ? <p className="muted">Nenhum horário marcado hoje.</p> : d.appointmentsToday.map((a: any) => (
            <div key={a.id} className="row between check-row"><span><b>{hm(a.start)}</b> · {a.customerName} <span className="muted small">{a.plate}{a.source === 'online' ? ' · online' : ''}</span></span><Badge tone={a.status === 'cancelado' ? 'bad' : a.status === 'concluido' ? 'ok' : 'info'}>{a.status.replace('_', ' ')}</Badge></div>
          ))}
        </Card>
        <Card title="No pátio agora" right={<Link to="/patio">abrir</Link>}>
          {d.openOrders.length === 0 ? <p className="muted">Pátio vazio.</p> : d.openOrders.map((o: any) => (
            <Link key={o.id} to={`/os/${o.id}`} className="row between check-row" style={{ textDecoration: 'none', color: 'inherit' }}><span><b>{o.plate}</b> · {o.vehicleLabel}<br /><span className="muted small">{o.customerName}</span></span><Badge tone={o.status === 'pronto' ? 'ok' : 'info'}>{o.status === 'pronto' ? 'Pronto' : 'Em serviço'}</Badge></Link>
          ))}
        </Card>
        <Card title="Estoque baixo" right={<Link to="/estoque">abrir</Link>}>
          {d.lowStock.length === 0 ? <p className="muted">Tudo em dia.</p> : d.lowStock.map((i: any) => <div key={i.id} className="row between check-row"><span>{i.name}</span><Badge tone="bad">{i.qty} {i.unit} (mín. {i.minQty})</Badge></div>)}
        </Card>
        <Card title="Contas a pagar (7 dias)" right={<Link to="/financeiro">abrir</Link>}>
          {d.expensesDue.length === 0 ? <p className="muted">Nada vencendo.</p> : d.expensesDue.map((e: any) => <div key={e.id} className="row between check-row"><span>{e.description}<br /><span className="muted small">vence {dmy(e.dueDate)}</span></span><b><Money cents={e.amountCents} /></b></div>)}
        </Card>
      </div>
    </Page>
  );
}
