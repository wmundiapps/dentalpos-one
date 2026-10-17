# LavaPos nas lojas: Apple App Store e Google Play

O aplicativo é a mesma tela web empacotada com o Capacitor (`web/android` e `web/ios` já estão criados, com ícones, câmera e textos de permissão). O que **eu consegui deixar pronto** está abaixo; o que depende de **conta, Mac ou assinatura** está marcado com 👤.

## Pronto neste repositório
| Item | Onde |
|---|---|
| Projeto Android e iOS (id `br.com.lavapos.app`) | `web/android`, `web/ios` |
| Ícones, tela de abertura, câmera, sem backup/sem tráfego sem criptografia | já configurados |
| Declaração de privacidade da Apple (Privacy Manifest) | `web/ios/App/App/PrivacyInfo.xcprivacy` |
| Imagens: ícone iOS 1024, ícone Play 512, gráfico de destaque 1024×500 | `store/` |
| Capturas de tela reais: iPhone 6,7" (1290×2796) e Android (1080×1920) | `store/capturas/` |
| Textos das lojas, respostas de privacidade e notas para a revisão | abaixo |
| Exclusão de conta dentro do app (exigida pelas duas lojas) | Configurações › Conta e dados |
| Política de privacidade pública | `https://app.lavapos.com.br/legal/privacidade` |

## Passo a passo (um por vez)
1. 👤 **Contas de desenvolvedor**: Apple Developer Program (US$ 99/ano, em nome da empresa, exige D-U-N-S) e Google Play Console (taxa única de US$ 25; conta de organização também exige D-U-N-S). Confirme valores e exigências atuais nos sites.
2. **Endereço da API no app**: crie `web/.env.production` com `VITE_API_URL=https://api.lavapos.com.br` (valor público).
3. **Gerar os pacotes**
   - Android (qualquer computador com Android Studio): `cd lavapos/web && npm install && npm run cap:android` → *Build › Generate Signed App Bundle*. 👤 Crie e **guarde com segurança** o arquivo de assinatura (keystore); sem ele não há atualização.
   - iOS (👤 precisa de **Mac com Xcode**): `cd lavapos/web && npm install && npm run cap:ios` → no Xcode: selecione o Team, arraste `PrivacyInfo.xcprivacy` para o alvo *App*, *Product › Archive › Distribute*.
4. **Fichas das lojas**: cole os textos abaixo, envie as capturas e preencha a privacidade.
5. **Revisão**: informe a conta de demonstração (👤 você digita usuário e senha direto no campo das lojas; nunca no chat).
6. Publique primeiro em **teste fechado** (Google) e **TestFlight** (Apple) com 2 ou 3 lava-rápidos reais.

## Textos das fichas (português do Brasil)
**Nome:** LavaPos — Gestão Lava Rápido (≤ 30 caracteres no Google: "LavaPos: Lava Rápido")
**Subtítulo (Apple, ≤ 30):** Check-in, agenda e clube de lavagens
**Descrição curta (Google, ≤ 80):** Check-in com fotos, agenda, clube de assinatura e financeiro do lava-rápido.
**Palavras-chave (Apple, ≤ 100):** lava rápido,lava jato,estética automotiva,agenda,check-in,assinatura,cashback,estoque,financeiro
**Categoria:** Negócios (secundária: Produtividade). **Preço:** grátis para baixar (o lava-rápido testa 30 dias; depois R$ 119,00/mês, contratado fora do aplicativo).
**Descrição completa:**
> O LavaPos é o sistema completo para quem tem lava-rápido, lava jato ou estética automotiva.
>
> • CHECK-IN E ENTREGA COM FOTOS — marque o estado do carro com toques (✕), fotografe os ângulos e compare na saída. Chega de discussão sobre risco e amassado.
> • CADASTRO RÁPIDO — placa, marca, modelo e ano em listas de rolagem; categorias Carro, SUV, Utilitários, Vans e Caminhões.
> • PREÇOS POR CATEGORIA E POR SERVIÇO — lavagem completa, só externa, higienização, hidratação de couro, enceramento, espelhamento, impermeabilização, insulfilme, película de proteção… e itens que você cria.
> • AGENDA INTELIGENTE — seus dias e horários, número de boxes e link de agendamento online para o cliente.
> • AVISOS AUTOMÁTICOS — veículo pronto, horário marcado e lembrete para voltar a lavar, por WhatsApp, SMS e e-mail.
> • CLUBE DE ASSINATURA — lavagem semanal, quinzenal, trisemanal ou mensal com cobrança automática.
> • CASHBACK E FIDELIDADE — programa próprio com opção da Cashbacksmart.
> • FINANCEIRO — recebimentos por Pix, cartão e boleto (Asaas), despesas, lucro do mês e nota fiscal.
> • ESTOQUE E FORNECEDORES — baixa automática de produto a cada serviço e alerta de estoque baixo.
> • LICENÇAS E CONTRATOS — avisos de licença ambiental, alvará, bombeiros, aluguel e contratos.
> • PRECIFICAÇÃO — descubra o preço certo, o ponto de equilíbrio e o lucro do mês.
> • VITRINE DO ANTES E DEPOIS e avaliações do Google na página do seu lava-rápido.
>
> 30 dias grátis, sem cartão. Depois R$ 119,00 por mês. Suporte por e-mail.
**URLs:** site `https://lavapos.com.br` · suporte `suporte@lavapos.com.br` · privacidade `https://app.lavapos.com.br/legal/privacidade` · marketing `https://lavapos.com.br`
**Classificação etária:** 4+ / Livre (sem conteúdo sensível).

## Respostas de privacidade
**Apple — "App Privacy" (dados coletados, vinculados ao usuário, sem rastreamento):** nome, e-mail, telefone, fotos (do veículo), informações de pagamento (processadas pelo Asaas; o app não guarda número de cartão), identificador de usuário. Finalidade: funcionalidade do app. **Rastreamento: não.**
**Google — "Segurança dos dados":** coleta nome, e-mail, telefone, fotos, informações financeiras de transação; **criptografados em trânsito: sim**; **usuário pode pedir exclusão: sim** (dentro do app e por e-mail); não compartilha com terceiros para publicidade; compartilha com prestadores (hospedagem, pagamento, mensagens) para operar o serviço. Declaração de **ID de publicidade: não**. Público-alvo: adultos / empresas (não é para crianças).
**Permissões:** câmera (só ao tocar para fotografar o veículo). Sem localização, sem contatos, sem microfone.

## Notas para a revisão (cole no campo "App Review Information")
> O LavaPos é um sistema de gestão para lava-rápidos (uso profissional). Conta de demonstração: usuário e senha informados nos campos próprios (👤 você preenche). Fluxo para testar: Novo check-in › digite a placa › marque o checklist › tire/escolha fotos › registre; depois abra o Pátio › marque como pronto › Entrega. A câmera é usada somente para fotografar o veículo. Exclusão de conta: Configurações › Conta e dados › "Encerrar minha conta". O teste é gratuito por 30 dias; a mensalidade do sistema é um serviço corporativo contratado por empresas (não há compra de conteúdo digital dentro do app).

## Pontos de atenção (decidir com calma)
- **Cobrança dentro do app (Apple 3.1.1/3.1.3):** a mensalidade R$ 119 é de um **serviço para empresas** (B2B) e as lavagens são **serviços físicos** — regras costumam permitir cobrança fora da compra no app, mas **a Apple decide caso a caso**. Por isso o app **não tem botão de pagamento**: a cobrança chega por Pix/boleto/cartão no e-mail. Peça confirmação a um especialista antes de lançar; o plano B é oferecer assinatura pela própria Apple.
- **Revisão da Apple:** costuma pedir login de demonstração funcionando e política de privacidade acessível. Mantenha o banco de demonstração ativo.
- **Textos legais** (contrato, privacidade, termos) são **minutas**: precisam da sua aprovação e da revisão da Dra. Roberta antes de publicar.
- **Conta Google nova de pessoa física** exige teste fechado com testadores por 14 dias antes de publicar; conta de empresa não. Confirme as regras vigentes.
