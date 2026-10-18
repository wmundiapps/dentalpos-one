import { h, get, brl, fmtTime, statusChip, icon, fail } from '../lib.js';

export async function render(root, { session, navigate }) {
  const d = await get('/api/dashboard');
  const tz = session.salon.timezone;
  const first = session.user.name.split(' ')[0];
  const trialDays = session.salon.status === 'trial' && session.salon.trial_ends_at
    ? Math.max(0, Math.ceil((Date.parse(session.salon.trial_ends_at) - Date.now()) / 86400_000)) : null;

  const max = Math.max(1, ...d.revenue_14d.map((x) => x.cents));
  const fmtDay = (s) => `${s.slice(8)}/${s.slice(5, 7)}`;

  root.append(
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, `Olá, ${first}`), h('p', {}, new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(new Date()))),
      h('div', { class: 'row wrap' },
        h('a', { class: 'btn primary', href: '#/agenda' }, icon('plus'), 'Novo agendamento'),
        h('a', { class: 'btn', href: '#/vendas' }, icon('cart'), 'Abrir comanda'))),
    session.salon.status === 'trial_expired' ? h('div', { class: 'banner bad' }, h('span', {}, 'Seu teste grátis terminou. Escolha um plano para continuar editando.'), h('a', { class: 'btn sm', href: '#/assinatura' }, 'Ver planos')) : null,
    session.salon.status === 'past_due' ? h('div', { class: 'banner bad' }, h('span', {}, 'Há uma cobrança em atraso. Regularize para evitar a suspensão.'), h('a', { class: 'btn sm', href: '#/assinatura' }, 'Resolver')) : null,
    trialDays !== null ? h('div', { class: 'banner' }, h('span', {}, `Teste grátis: faltam ${trialDays} ${trialDays === 1 ? 'dia' : 'dias'}.`), h('a', { class: 'btn sm', href: '#/assinatura' }, 'Escolher plano')) : null,

    h('div', { class: 'grid g4' },
      kpi('Faturamento do mês', brl(d.revenue_month_cents), `${d.sales_month} vendas`),
      kpi('Hoje', brl(d.revenue_today_cents), `${d.today_appointments.length} atendimentos na agenda`),
      kpi('Ticket médio', brl(d.ticket_cents), `${d.new_clients_month} clientes novos no mês`),
      kpi('Faltas no mês', `${(d.noshow_rate * 100).toFixed(1).replace('.', ',')}%`, 'Lembretes automáticos ajudam a reduzir')),

    h('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(0,3fr) minmax(0,2fr)', marginTop: '14px' } },
      h('div', { class: 'card' }, h('h3', {}, 'Faturamento — últimos 14 dias'),
        h('div', { class: 'bars', role: 'img', 'aria-label': 'Gráfico de barras do faturamento diário' },
          d.revenue_14d.map((x) => h('div', { class: 'bar', style: { height: `${Math.max(2, (x.cents / max) * 100)}%` }, 'data-tip': `${fmtDay(x.date)} · ${brl(x.cents)}` }))),
        h('div', { class: 'axis' }, d.revenue_14d.map((x, i) => h('span', {}, i % 2 === 0 ? fmtDay(x.date) : '')))),
      h('div', { class: 'stack' },
        h('div', { class: 'card' }, h('h3', {}, 'Atenção'),
          h('ul', { class: 'list-clean' },
            alertItem(d.unread_conversations, 'conversas aguardando resposta', '#/conversas', 'chat'),
            alertItem(d.new_leads_month, 'novos leads no mês', '#/leads', 'funnel'),
            alertItem(d.low_stock.length, 'produtos com estoque baixo', '#/catalogo', 'box'),
            !d.unread_conversations && !d.low_stock.length ? h('li', { class: 'muted' }, 'Tudo em dia por aqui. ✨') : null)),
        d.low_stock.length ? h('div', { class: 'card' }, h('h3', {}, 'Estoque baixo'),
          h('ul', { class: 'list-clean' }, d.low_stock.map((p) => h('li', {}, h('span', { class: 'grow' }, p.name), h('span', { class: 'chip warn' }, `${p.stock} un.`))))) : null)),

    h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', {}, 'Agenda de hoje'),
      d.today_appointments.length
        ? h('div', { class: 'scroll-x' }, h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, ['Hora', 'Cliente', 'Serviço', 'Profissional', 'Situação'].map((t) => h('th', {}, t)))),
          h('tbody', {}, d.today_appointments.map((a) => h('tr', { class: 'click', onclick: () => navigate('agenda') },
            h('td', { class: 'nowrap' }, fmtTime(a.starts_at, tz)), h('td', {}, a.client_name), h('td', {}, a.service_name), h('td', {}, a.staff_name), h('td', {}, statusChip(a.status)))))))
        : h('p', { class: 'empty' }, 'Nenhum atendimento marcado para hoje.')));
}

const kpi = (label, value, sub) => h('div', { class: 'card kpi' }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), h('div', { class: 'sub' }, sub));
const alertItem = (n, text, href, ic) => n ? h('li', {}, icon(ic), h('a', { href, style: { color: 'inherit', textDecoration: 'none' } }, h('b', {}, n), ' ', text)) : null;
