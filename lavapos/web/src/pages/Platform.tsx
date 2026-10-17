import { api } from '../api';
import { Badge, Card, Kpi, Loading, Money, Page, useAction, useLoad } from '../ui';
import { dmy } from '../format';
import { useMe } from '../App';

export default function Platform() {
  const { logout } = useMe(); const t = useLoad<any[]>('/platform/tenants'); const [run] = useAction();
  if (!t.data) return <Loading error={t.error} />;
  const sum = (k: string) => t.data!.reduce((a, x) => a + x[k], 0);
  const active = t.data.filter((x) => x.billingStatus === 'ativa'), trial = t.data.filter((x) => x.billingStatus === 'trial');
  const set = async (id: string, status: string) => { await run(() => api(`/platform/tenants/${id}/billing`, { body: { status } }), 'Atualizado.'); await t.reload(); };
  return (
    <Page title="Painel da plataforma" sub="Lava-rápidos, mensalidades e comissão" actions={<button onClick={logout}>Sair</button>}>
      <div className="grid g4" style={{ marginBottom: 14 }}><Kpi label="Lava-rápidos" value={t.data.length} /><Kpi label="Em teste grátis" value={trial.length} /><Kpi label="Pagantes" value={active.length} tone="ok" /><Kpi label="Mensalidades (MRR)" value={<Money cents={active.reduce((a, x) => a + x.monthlyFeeCents, 0)} />} />
        <Kpi label="Movimentado no mês (GMV)" value={<Money cents={sum('gmvMonthCents')} />} /><Kpi label="Comissão do mês" value={<Money cents={sum('feeMonthCents')} />} tone="ok" /><Kpi label="Comissão a cobrar (fora do Asaas)" value={<Money cents={sum('feeToCollectCents')} />} tone="warn" /></div>
      <Card title="Lava-rápidos"><div className="scroll"><table><thead><tr><th>Nome</th><th>Responsável</th><th>Cadastro</th><th>Status</th><th>GMV mês</th><th>Comissão</th><th /></tr></thead><tbody>
        {t.data.map((x) => (<tr key={x.id}><td><b>{x.name}</b><br /><span className="muted small">{x.email}</span></td><td>{x.ownerName}</td><td>{dmy(x.createdAt)}</td><td><Badge tone={x.billingStatus === 'ativa' ? 'ok' : x.billingStatus === 'trial' ? 'info' : 'bad'}>{x.billingStatus}</Badge>{x.billingStatus === 'trial' && <span className="small muted"> até {dmy(x.trialEndsAt)}</span>}</td><td><Money cents={x.gmvMonthCents} /></td><td><Money cents={x.feeMonthCents} /></td>
          <td className="nowrap">{x.billingStatus !== 'ativa' && <button className="sm" onClick={() => set(x.id, 'ativa')}>Ativar</button>} {x.billingStatus !== 'inadimplente' && <button className="sm" onClick={() => set(x.id, 'inadimplente')}>Inadimplente</button>}</td></tr>))}</tbody></table></div></Card>
    </Page>
  );
}
