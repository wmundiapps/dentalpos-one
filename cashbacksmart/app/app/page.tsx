import { LaunchPromo } from '@/components/LaunchPromo';
import Link from 'next/link';
import { Calculator } from './Calculator';
import './landing.css';

export const metadata = {
  title: 'Cashbacksmart — compra no bairro, dinheiro de volta',
  description: 'Padaria, farmácia, salão, mercado: as lojas da sua cidade devolvem parte do que você gasta. Grátis para você.',
  openGraph: { title: 'Cashbacksmart — compra no bairro, dinheiro de volta', description: 'Grátis. Cashback em todo o comércio da sua cidade.', images: ['/og.png'] },
};

const lines = [
  { shop: 'Padaria Trigo Bom', what: 'Pães e café', paid: 'R$ 32,50', back: '+ R$ 3,25', rule: '10%' },
  { shop: 'Farmácia Vida', what: 'Vitaminas', paid: 'R$ 89,90', back: '+ R$ 4,49', rule: '5%' },
  { shop: 'Studio Bela', what: 'Corte e escova', paid: 'R$ 70,00', back: '+ R$ 7,00', rule: 'fixo' },
  { shop: 'Mercadinho Central', what: 'Compra da semana', paid: 'R$ 214,30', back: '+ R$ 6,43', rule: '3%' },
];

export default function Landing() {
  return (
    <div className="lp">
      <header className="lp-top wrap">
        <img src="/logo.svg" alt="Cashbacksmart" className="lp-logo" />
        <nav className="row" style={{ gap: 8 }}>
          <Link href="#empresas" className="lp-navlink hide-sm">
            Para empresas
          </Link>
          <Link href="/entrar" className="btn ghost sm">
            Entrar
          </Link>
        </nav>
      </header>

      <section className="lp-hero wrap">
        <div className="lp-hero-copy">
          <h1 className="lp-h1">
            Compra no bairro.
            <br />
            Dinheiro de volta.
          </h1>
          <p className="lp-lead">Padaria, farmácia, salão, mercado: as lojas da sua cidade devolvem parte do que você gasta, e o saldo vira desconto na próxima compra.</p>
          <div className="row">
            <Link href="/cadastro" className="btn">
              Criar conta grátis
            </Link>
            <Link href="/cadastro/empresa" className="btn ghost">
              Cadastrar minha empresa
            </Link>
          </div>
          <p className="muted lp-fine">Grátis para você. Loja esqueceu de lançar? Envie a nota fiscal pelo app.</p>
        </div>

        <figure className="lp-ticket" aria-label="Exemplo de cashback em um mês">
          <div className="lp-ticket-head">
            <strong>CUPOM DO MÊS</strong>
            <span>Maringá · outubro</span>
          </div>
          <ol className="lp-ticket-lines">
            {lines.map((l, i) => (
              <li key={l.shop} style={{ animationDelay: `${0.25 + i * 0.22}s` }}>
                <span className="lp-shop">
                  {l.shop}
                  <small>
                    {l.what} · {l.rule}
                  </small>
                </span>
                <span className="lp-paid">{l.paid}</span>
                <span className="lp-back">{l.back}</span>
              </li>
            ))}
          </ol>
          <div className="lp-ticket-total">
            <span>Voltou pra você</span>
            <strong>R$ 21,17</strong>
          </div>
          <figcaption className="lp-ticket-foot">E a conta é grátis.</figcaption>
        </figure>
      </section>

      <section className="lp-band">
        <div className="wrap">
          <h2 className="lp-h2">Como funciona</h2>
          <ol className="lp-steps">
            <li>
              <h3>Crie sua conta</h3>
              <p>Com CPF e celular. Leva um minuto, e a conta é grátis.</p>
            </li>
            <li>
              <h3>Mostre seu código no caixa</h3>
              <p>A loja digita seu código ou CPF junto com o valor. O cashback cai na hora na sua carteira.</p>
            </li>
            <li>
              <h3>Use o saldo na próxima compra</h3>
              <p>Gere um código de resgate no app e o caixa desconta do total. Simples assim.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="wrap lp-section lp-split">
        <div>
          <h2 className="lp-h2">Grátis para você. E cliente novo ganha mais.</h2>
          <p>
            Muitas lojas dão cashback maior na sua primeira compra, como 30% de volta. Se a loja esquecer de lançar, você envia a nota fiscal pelo app. Quer que o saldo nunca
            vença? O Premium custa R$ 4 por mês.
          </p>
        </div>
        <ul className="lp-checks">
          <li>Saldo por loja, sem mistério: você vê quanto tem e quando vence</li>
          <li>Funciona com dinheiro, Pix ou cartão</li>
          <li>Promoções de boas-vindas em lojas novas para você</li>
          <li>Seus dados não são vendidos</li>
        </ul>
      </section>

      <section id="empresas" className="lp-biz">
        <div className="wrap lp-split">
          <div>
            <LaunchPromo />
            <h2 className="lp-h2" style={{ marginTop: 18 }}>Para empresas: 6 meses sem mensalidade, e você só paga quando o cliente volta.</h2>
            <p>Sem maquininha nova e sem integração. O caixa lê o QR do cliente pelo celular. Você decide o cashback: valor fixo ou percentual, promoção para clientes novos, por dia da semana, com teto e validade.</p>
            <ul className="lp-checks light">
              <li>6 meses sem mensalidade, depois R$ 49,90 por mês</li>
              <li>Taxa de 20% só sobre o cashback que o cliente usar na sua loja</li>
              <li>Promoção de boas-vindas para atrair clientes novos</li>
              <li>Kit do caixa com QR: o cliente cadastra a nota sozinho, pelo QR do cupom ou por foto</li>
              <li>Captação de clientes: páginas de oferta que mandam contatos para o seu WhatsApp</li>
              <li>Fatura única no dia 1º, por Pix, boleto ou cartão. Sem fidelidade e sem multa</li>
              <li>4 campanhas de e-mail por mês para os clientes da sua cidade, inclusas</li>
              <li>Pacotes nacionais a partir de R$ 99 por 10 mil e-mails</li>
              <li>Vários caixas e várias lojas na mesma conta</li>
            </ul>
            <Link href="/cadastro/empresa" className="btn coin">
              Cadastrar minha empresa
            </Link>
          </div>
          <Calculator />
        </div>
      </section>

      <section className="wrap lp-section">
        <h2 className="lp-h2">Perguntas frequentes</h2>
        <div className="lp-faq">
          <details>
            <summary>O cashback é dinheiro de verdade?</summary>
            <p>É crédito de desconto na loja que te deu o cashback. Na próxima compra lá, você usa o saldo e paga menos.</p>
          </details>
          <details>
            <summary>Posso usar o saldo de uma loja em outra?</summary>
            <p>Não. Cada loja financia o próprio cashback, então o saldo vale nela. Na carteira você vê o saldo de cada uma.</p>
          </details>
          <details>
            <summary>A loja esqueceu de lançar minha compra. E agora?</summary>
            <p>No app, toque em "Enviar nota fiscal" e leia o QR do cupom. A loja confirma e o cashback cai na sua carteira. Cada nota vale uma vez só.</p>
          </details>
          <details>
            <summary>A loja precisa de equipamento?</summary>
            <p>Não. Um celular ou computador com internet basta para lançar compras.</p>
          </details>
          <details>
            <summary>Quanto a empresa paga, de verdade?</summary>
            <p>Nos 6 primeiros meses, só 20% do cashback que o cliente usar. Depois, R$ 49,90 por mês mais essa taxa. Se seus clientes usaram R$ 500 de cashback no mês, a taxa é R$ 100.</p>
          </details>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="wrap row between">
          <img src="/logo-negativo.svg" alt="Cashbacksmart" style={{ height: 28 }} />
          <nav className="row">
            <Link href="/termos">Termos e privacidade</Link>
            <Link href="/entrar">Entrar</Link>
          </nav>
          <small>Cashbacksmart é um produto WMundi.</small>
        </div>
      </footer>
    </div>
  );
}
