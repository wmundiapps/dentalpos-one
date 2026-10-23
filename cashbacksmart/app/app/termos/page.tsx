import Link from 'next/link';

export const metadata = { title: 'Termos de uso e privacidade' };

export default function Termos() {
  return (
    <main className="wrap narrow" style={{ padding: '32px 16px 64px', maxWidth: 720 }}>
      <Link href="/">
        <img src="/logo.svg" alt="Cashbacksmart" style={{ height: 34 }} />
      </Link>
      <h1 style={{ marginTop: 24 }}>Termos de uso e privacidade</h1>
      <p className="muted">Versão de lançamento. Texto-base a ser revisado pela assessoria jurídica antes da operação comercial.</p>

      <h2>1. O que é o Cashbacksmart</h2>
      <p>
        Plataforma que conecta pessoas e empresas participantes. As empresas definem regras de cashback (valor fixo ou percentual) e o cliente acumula saldo para usar como
        desconto em compras futuras na mesma empresa.
      </p>
      <h2>2. Assinatura</h2>
      <p>
        Pessoa física: conta grátis. Premium opcional (o saldo não vence): R$ 4 por mês, cobrados uma vez por ano (R$ 48), com arrependimento em até 7 dias e reembolso integral.
        Empresa: promoção de inauguração com 6 meses sem mensalidade e depois R$ 49,90 por mês, mais taxa de 20% sobre o cashback usado pelos clientes na loja. A fatura é
        emitida automaticamente no dia 1º de cada mês, com o que foi usado no mês anterior (Pix, boleto ou cartão). Sem fidelidade: a empresa pode cancelar a qualquer momento
        pelo painel, sem multa e sem precisar explicar o motivo; a loja continua funcionando até o fim do mês e paga apenas até o mês em uso.
      </p>
      <h2>3. Saldo de cashback</h2>
      <p>
        O saldo é um crédito de desconto concedido pela empresa e só pode ser usado nela. Não é dinheiro em conta, não rende e não pode ser sacado. Cada regra informa em quanto
        tempo o saldo é liberado e por quanto tempo vale (mínimo de 30 dias; sem vencimento para clientes Premium). Compras canceladas estornam o cashback correspondente.
        Notas fiscais enviadas pelo cliente valem uma única vez e dependem da confirmação da loja; envio de notas de terceiros ou falsas leva ao bloqueio da conta.
      </p>
      <h2>4. Ofertas e comunicações</h2>
      <p>
        Participar do Cashbacksmart inclui receber, no app, ofertas das empresas participantes. Também enviamos ofertas por e-mail; você pode parar de receber e-mails a qualquer
        momento pelo link no rodapé ou na sua conta, sem perder o acesso às ofertas no app. Avisos do seu cashback (crédito, confirmação de nota e saldo perto de vencer) chegam por
        e-mail e pelo canal que você escolher na conta: WhatsApp ou SMS (ou só e-mail).
      </p>
      <h2 id="privacidade">5. Dados pessoais (LGPD)</h2>
      <p>
        Usamos nome, e-mail, celular, CPF e cidade para identificar você no caixa, calcular o cashback, cobrar a assinatura e mostrar ofertas da sua região. As empresas veem
        apenas seu nome e o histórico de compras feitas nelas. Não vendemos seus dados. Nas páginas de oferta (captação de clientes), quem preenche o formulário
        autoriza expressamente que a loja da oferta (ou até 3 lojas da categoria e cidade, nas páginas do Cashbacksmart) receba nome, celular e e-mail para entrar em contato. Fotos
        de notas fiscais são vistas apenas pela loja da compra e por você. Para acessar, corrigir ou excluir seus dados, escreva para privacidade@cashbacksmart.com.br.
      </p>
      <h2>6. Empresas</h2>
      <p>
        A empresa é responsável pelas ofertas que publica, pelo lançamento correto das compras e pelo desconto concedido no resgate. O conteúdo das campanhas deve ser verdadeiro e
        respeitar o Código de Defesa do Consumidor. Empresas inadimplentes têm lançamentos e campanhas pausados até a regularização.
      </p>
    </main>
  );
}
