import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../state';
import { track } from '../tracking';
import { FEES } from '../../../shared/rules';

// Landing pages das campanhas (Meta, Google, links diretos). Lançamento só no
// Brasil: textos em português. /anuncie → anfitriões; /profissionais → locatários.

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function useTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    return () => { document.title = prev; };
  }, [title]);
}

function Cta({ to, children, audience }: { to: string; children: string; audience: 'host' | 'pro' }) {
  const { me } = useApp();
  const target = me ? to : `/cadastro?next=${encodeURIComponent(to)}`;
  return <Link className="btn btn-primary lp-cta" to={target} onClick={() => track('Lead', { content_category: audience })}>{children}</Link>;
}

function Faq({ items }: { items: [string, string][] }) {
  return (
    <section className="lp-section">
      <h2>Perguntas frequentes</h2>
      <div className="lp-faq">
        {items.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
      </div>
    </section>
  );
}

function Steps({ items }: { items: [string, string][] }) {
  return (
    <section className="lp-section">
      <h2>Como funciona</h2>
      <ol className="lp-steps">
        {items.map(([title, text], i) => <li key={title}><span className="lp-step-n">{i + 1}</span><div><strong>{title}</strong><p>{text}</p></div></li>)}
      </ol>
    </section>
  );
}

function Benefits({ items }: { items: [string, string, string][] }) {
  return (
    <section className="lp-section">
      <div className="lp-grid">
        {items.map(([icon, title, text]) => (
          <div className="lp-card" key={title}><div className="lp-icon" aria-hidden>{icon}</div><h3>{title}</h3><p>{text}</p></div>
        ))}
      </div>
    </section>
  );
}

function Simulator() {
  const [price, setPrice] = useState(60);
  const [hours, setHours] = useState(12);
  const gross = price * hours * 4;
  const net = gross * (1 - FEES.hostServiceFeeRate);
  return (
    <section className="lp-section lp-sim">
      <h2>Quanto seus horários vagos podem render</h2>
      <div className="lp-sim-body">
        <label>Preço por hora: <strong>{brl(price)}</strong>
          <input type="range" min={20} max={300} step={5} value={price} onChange={(e) => setPrice(Number(e.target.value))} />
        </label>
        <label>Horas alugadas por semana: <strong>{hours} h</strong>
          <input type="range" min={2} max={40} step={1} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
        </label>
        <div className="lp-sim-result">
          <span>Você recebe em 4 semanas</span>
          <strong>{brl(net)}</strong>
          <small>Simulação: {hours} h × {brl(price)} × 4 semanas, já descontada a taxa de {Math.round(FEES.hostServiceFeeRate * 100)}% do SpaceHour e antes da tarifa do Mercado Pago. O resultado depende das reservas que você receber.</small>
        </div>
      </div>
    </section>
  );
}

export function HostLanding() {
  useTitle('Anuncie seu consultório por hora | SpaceHour');
  const fee = `${Math.round(FEES.hostServiceFeeRate * 100)}%`;
  return (
    <div className="lp">
      <section className="lp-hero">
        <div className="container">
          <p className="lp-kicker">Para donos de consultórios, clínicas e salas</p>
          <h1>Seu consultório vazio pode ajudar a pagar o aluguel.</h1>
          <p className="lp-lead">Alugue por hora os horários em que a sua sala fica parada para dentistas, médicos, psicólogos, fisioterapeutas e outros profissionais. Você define o preço, os horários e as regras, e o dinheiro cai direto na sua conta Mercado Pago.</p>
          <Cta to="/anfitriao/novo" audience="host">Anunciar meu espaço grátis</Cta>
          <p className="lp-note">Sem mensalidade. Por reserva: {fee} do SpaceHour + a tarifa do Mercado Pago.</p>
        </div>
      </section>
      <div className="container">
        <Benefits items={[
          ['💸', `${fee} por reserva, sem mensalidade`, 'Anunciar é grátis e não tem fidelidade. A taxa do SpaceHour só é cobrada quando uma reserva é paga; a tarifa de processamento do Mercado Pago sai da sua parte, como em qualquer venda.'],
          ['🏦', 'Dinheiro direto na sua conta', 'O pagamento (Pix ou cartão) é feito pelo Mercado Pago e a sua parte vai direto para a sua conta, sem passar pela nossa.'],
          ['🗓️', 'Você decide tudo', 'Escolha os dias e horários disponíveis, o preço por hora, a taxa de limpeza e se aprova cada pedido ou aceita reservas na hora.'],
          ['🩺', 'Profissionais verificados', 'Quem aluga envia o registro no conselho (CRO, CRM, CRP e outros). O documento passa por uma checagem automática e pela nossa equipe, e você pode conferir antes de liberar a sala.'],
          ['🛡️', 'Caução e regras claras', 'Você pode exigir caução e avalista. Os danos são tratados por mediação, e as regras de cancelamento ficam claras para os dois lados.'],
          ['⭐', 'Avaliações dos dois lados', 'Cada reserva gera avaliação do espaço e do profissional. Bons inquilinos voltam, e quem não cumpre as regras recebe advertência.'],
        ]} />
        <Simulator />
        <Steps items={[
          ['Crie sua conta', 'Leva um minuto. Depois é só confirmar o seu e-mail.'],
          ['Anuncie o espaço', 'Coloque fotos, os equipamentos, os horários livres e o preço por hora.'],
          ['Conecte o Mercado Pago', 'Com isso o anúncio fica visível e você recebe cada reserva direto na sua conta.'],
        ]} />
        <Faq items={[
          ['Quanto custa anunciar?', `Nada. Em cada reserva paga, o SpaceHour desconta ${fee} e o Mercado Pago desconta a tarifa de processamento dele (menor no Pix, maior no cartão). Quem aluga paga uma taxa de serviço à parte.`],
          ['Quando recebo o dinheiro?', 'O pagamento é processado pelo Mercado Pago e a sua parte vai direto para a sua conta Mercado Pago, dentro do prazo de liberação dela.'],
          ['E se alguém danificar algo?', 'Você pode exigir caução e avalista no anúncio. Se houver um problema, abra um incidente na reserva: a nossa equipe faz a mediação e o responsável recebe advertência.'],
          ['Posso alugar um consultório de saúde?', 'Pode. Você continua responsável pelo alvará, pela vigilância sanitária e pelas regras do seu conselho. Leia as Obrigações do Anfitrião antes de publicar.'],
          ['Posso bloquear horários ou pausar o anúncio?', 'Pode. Você edita dias, horários e preço quando quiser em Painel do anfitrião → Meus anúncios.'],
        ]} />
        <section className="lp-final">
          <h2>Seus horários vagos podem virar renda a partir desta semana.</h2>
          <Cta to="/anfitriao/novo" audience="host">Anunciar meu espaço grátis</Cta>
          <p className="lp-note">Dúvidas? Escreva para <a href="mailto:support@space-hour.com">support@space-hour.com</a> · <Link to="/regras/host-obligations">Obrigações do Anfitrião</Link></p>
        </section>
      </div>
    </div>
  );
}

export function ProLanding() {
  useTitle('Consultório por hora para profissionais | SpaceHour');
  return (
    <div className="lp">
      <section className="lp-hero">
        <div className="container">
          <p className="lp-kicker">Para dentistas, médicos, psicólogos, fisioterapeutas, advogados e professores</p>
          <h1>Atenda em um consultório pronto e pague só pelas horas que usar.</h1>
          <p className="lp-lead">Sem contrato de aluguel, sem condomínio e sem fiador. Encontre consultórios odontológicos, salas de atendimento, clínicas, salas de aula e auditórios perto de você e reserve online com Pix ou cartão.</p>
          <Cta to="/" audience="pro">Quero encontrar um espaço</Cta>
          <p className="lp-note">O cadastro é grátis e você só paga quando reservar.</p>
        </div>
      </section>
      <div className="container">
        <Benefits items={[
          ['⏱️', 'Por hora, do seu jeito', 'Reserve um período avulso ou os mesmos horários toda semana, conforme a sua agenda de pacientes ou clientes.'],
          ['🦷', 'Espaços já equipados', 'Cada anúncio mostra os equipamentos disponíveis, como cadeira odontológica, maca, divã, projetor ou lousa.'],
          ['💳', 'Pix ou cartão', 'O pagamento é feito online pelo Mercado Pago, com o preço completo mostrado antes de você confirmar.'],
          ['📍', 'Endereço após a confirmação', 'O endereço exato e as instruções de acesso são liberados quando a reserva é confirmada.'],
          ['↩️', 'Cancelamento claro', 'Cada espaço mostra a política de cancelamento e reembolso antes de você reservar.'],
          ['✅', 'Registro enviado uma vez só', 'Muitos espaços de saúde exigem registro profissional verificado. Você envia o documento uma vez e ele vale para todas as reservas.'],
        ]} />
        <Steps items={[
          ['Crie sua conta', 'Confirme seu e-mail e, se a sua profissão exigir, envie o registro no conselho.'],
          ['Escolha o espaço e o horário', 'Filtre por cidade e tipo de sala e veja as fotos, os equipamentos e as avaliações.'],
          ['Reserve e atenda', 'Pague com Pix ou cartão, receba o endereço e use a sala no horário marcado.'],
        ]} />
        <Faq items={[
          ['Preciso assinar contrato?', 'Não. Cada reserva segue os Termos de Uso e as regras do espaço, que você aceita ao reservar.'],
          ['Quanto custa?', 'O preço por hora é definido pelo anfitrião. Somam-se a taxa de limpeza (se houver) e a taxa de serviço do SpaceHour, e o total aparece antes de você pagar.'],
          ['Por que pedem meu registro profissional?', 'Salas de saúde e de outras profissões regulamentadas só podem ser usadas por profissionais habilitados. O registro protege você, o anfitrião e os seus pacientes.'],
          ['Posso reservar toda semana no mesmo horário?', 'Pode. Na reserva você escolhe vários dias de uma vez, respeitando os limites do espaço.'],
        ]} />
        <section className="lp-final">
          <h2>Seu próximo atendimento pode ser num consultório pronto.</h2>
          <Cta to="/" audience="pro">Quero encontrar um espaço</Cta>
          <p className="lp-note">Tem um espaço ocioso? <Link to="/anuncie">Anuncie no SpaceHour</Link></p>
        </section>
      </div>
    </div>
  );
}
