# SpaceHour: campanha de lançamento (72 horas)

**Objetivo:** cadastros reais em 2 a 3 dias, **primeiro de anfitriões** (quem tem sala ociosa) e, em seguida, de profissionais que alugam. Sem espaços anunciados, o profissional chega e não encontra nada. Por isso, 2/3 da verba vai para os anfitriões.

**Onde:** comece só por **Maringá e região (raio de 30 km)**. O anfitrião e quem aluga precisam estar na mesma cidade, e concentrar a verba num lugar só dá resultado mais rápido do que espalhar pelo Brasil. Quando Maringá tiver de 10 a 15 espaços anunciados, abra Londrina e Curitiba com os mesmos anúncios.

**Materiais prontos:**
- Landing de anfitriões: https://space-hour.com/anuncie
- Landing de profissionais: https://space-hour.com/profissionais
- Cards: pasta `docs/marketing/cards/`
  - `anfitrioes-1..5.png`: carrossel 1080×1080
  - `profissionais-1..4.png`: carrossel 1080×1080
  - `story-*.png`: Stories e Reels, 1080×1920
  - `og-image.png`: imagem que aparece quando o link é compartilhado
- Medição: aba **Admin → Campanha** mostra os cadastros por origem, os e-mails confirmados e os anfitriões com anúncio.

> Prazo realista: o Meta leva de algumas horas até 24 h para aprovar os anúncios, e o Google, cerca de 1 dia útil. Os primeiros cadastros costumam vir das mensagens diretas (seção 5) no mesmo dia. Os anúncios ganham força do 2º dia em diante.

---

## 0. Antes de ligar os anúncios (1 hora)

1. **Meta Pixel**
   - No Gerenciador de Eventos (business.facebook.com/events_manager), clique em Conectar fontes de dados → Web → Pixel e dê o nome "SpaceHour". Copie o **ID do pixel** (só números).
2. **Google Ads**
   - Em ads.google.com, crie a conta e depois vá em Metas → Conversões → Nova → Site → "Inscrição".
   - Escolha a instalação manual ("Usar o Google Tag") e copie os dois códigos:
     - o **ID da tag**, que começa com `AW-`;
     - o **rótulo de conversão**, no formato `AW-123456789/AbCdEf...`.
3. **Vercel** → Settings → Environment Variables. **Não marque "Sensitive".** Crie as três variáveis abaixo e faça **um único Redeploy** no fim.

   | Nome | Valor |
   |---|---|
   | `VITE_META_PIXEL_ID` | ID do pixel |
   | `VITE_GOOGLE_TAG_ID` | `AW-...` |
   | `VITE_GOOGLE_ADS_SIGNUP_LABEL` | `AW-.../...` |

4. Abra o site numa janela anônima. Deve aparecer o aviso de cookies; clique em **Aceitar**. O Pixel e a tag só carregam depois do aceite, como exige a LGPD.
5. **Verificar o domínio no Meta** (necessário para o evento de conversão):
   - Em Configurações do Negócio → Segurança da marca → Domínios, adicione `space-hour.com`.
   - Escolha o registro TXT de DNS e crie esse TXT no DNS da GoDaddy.
6. Em Gerenciador de Eventos → Mensuração de eventos agregados, deixe **CompleteRegistration** como prioridade 1 e **Lead** como prioridade 2.

## 1. Links com UTM (use exatamente estes)

Com eles, cada cadastro aparece em Admin → Campanha com a origem certa.

```
Meta – anfitriões:      https://space-hour.com/anuncie?utm_source=meta&utm_medium=paid&utm_campaign=lanc-anfitrioes
Meta – profissionais:   https://space-hour.com/profissionais?utm_source=meta&utm_medium=paid&utm_campaign=lanc-profissionais
Google – anfitriões:    https://space-hour.com/anuncie?utm_source=google&utm_medium=cpc&utm_campaign=lanc-anfitrioes
Google – profissionais: https://space-hour.com/profissionais?utm_source=google&utm_medium=cpc&utm_campaign=lanc-profissionais
WhatsApp (anfitriões):  https://space-hour.com/anuncie?utm_source=whatsapp&utm_medium=direto&utm_campaign=lanc
WhatsApp (profiss.):    https://space-hour.com/profissionais?utm_source=whatsapp&utm_medium=direto&utm_campaign=lanc
Instagram bio/orgânico: https://space-hour.com/anuncie?utm_source=instagram&utm_medium=organico&utm_campaign=lanc
```

## 2. Verba sugerida (3 dias)

| Canal | Por dia | 3 dias |
|---|---|---|
| Meta – anfitriões (carrossel + stories) | R$ 60 | R$ 180 |
| Meta – profissionais | R$ 30 | R$ 90 |
| Google Search (as duas campanhas) | R$ 40 | R$ 120 |
| **Total** | **R$ 130** | **R$ 390** |

Os valores são um ponto de partida. Depois do 1º dia, passe a verba para o que estiver trazendo cadastros mais baratos (veja a seção 6).

## 3. Meta Ads (Facebook + Instagram)

**Campanha 1: SpaceHour | Anfitriões | Maringá**
- **Objetivo:** Leads → local da conversão: **Site** → evento **CompleteRegistration**.
  - Se o Meta reclamar de poucos eventos no início, use o objetivo **Tráfego** → "Visualizações da página de destino" nas primeiras 24 h e troque depois.
- **Público:** Maringá, raio de 30 km, 25–65 anos, Advantage+ público ligado.
  - Sugestões de interesse: Odontologia, Psicologia, Fisioterapia, Medicina, Nutrição, Clínica, Empreendedorismo.
  - Se algum interesse não aparecer, deixe o público aberto. O texto do anúncio já seleciona quem tem consultório.
- **Posicionamentos:** Advantage+ (Feed, Stories, Reels).
- **Anúncio A (carrossel):** `anfitrioes-1..5.png`, nessa ordem, cada card com o mesmo link.
- **Anúncio B (Stories/Reels):** `story-anfitrioes.png`.
- **Botão:** Cadastre-se. **Link:** o de "Meta – anfitriões" da seção 1.

Texto principal. Crie 3 anúncios, um com cada texto, e o Meta mostra mais o que funcionar melhor:

```
Seu consultório fica vazio em alguns horários da semana? 🦷🩺
No SpaceHour você aluga esses horários por hora para dentistas, médicos, psicólogos e outros profissionais com registro verificado.
✅ Você define preço, dias e regras
✅ Pix ou cartão, direto na sua conta Mercado Pago
✅ Sem mensalidade: só 3% por reserva
Anuncie grátis 👇
```
```
Horário vago no consultório é aluguel pago sem retorno.
Com o SpaceHour, profissionais da sua região reservam a sua sala por hora e pagam online. Você escolhe os horários, o preço e se aprova cada pedido.
Anunciar é grátis, sem mensalidade.
```
```
Já pensou em dividir o custo do seu consultório sem fazer contrato com ninguém?
No SpaceHour cada reserva é por hora, paga antecipadamente pelo Mercado Pago, com caução opcional e avaliação dos dois lados.
Comece hoje, é grátis.
```
- **Título:** `Anuncie seu consultório grátis` / `Seu horário vago pode virar renda`
- **Descrição:** `Sem mensalidade. Só 3% por reserva.`

**Campanha 2: SpaceHour | Profissionais | Maringá**
- Mesmo objetivo, mesmo público e mesmo evento da Campanha 1.
- **Anúncio A (carrossel):** `profissionais-1..4.png`.
- **Anúncio B (Stories/Reels):** `story-profissionais.png`.
- **Link:** o de "Meta – profissionais" da seção 1.

```
Atende poucas vezes por semana e paga aluguel cheio? 🤔
No SpaceHour você reserva consultórios e salas prontas por hora: odontológico, psicologia, fisioterapia, sala de aula e mais.
✅ Sem contrato, sem condomínio, sem fiador
✅ Pague só pelas horas que usar, com Pix ou cartão
Cadastro grátis 👇
```
```
Consultório pronto, na hora que você precisa.
Escolha o espaço, veja fotos, equipamentos e avaliações, e reserve online. Avulso ou toda semana no mesmo horário.
```
- **Título:** `Consultório por hora, sem contrato`
- **Descrição:** `Reserve online com Pix ou cartão.`

> Enquanto houver poucos espaços em Maringá, deixe a Campanha 2 com verba baixa (R$ 20–30/dia). Assim que existirem de 5 a 10 anúncios publicados, suba a verba.

## 4. Google Ads (Rede de Pesquisa)

Configuração comum: tipo **Pesquisa** (desmarque "Rede de Display"), local **Maringá + 30 km**, idioma português, lances **Maximizar conversões** (conversão "Inscrição").

### Campanha A: Profissionais (quem procura sala)

Palavras-chave (correspondência de frase, com aspas):
```
"aluguel de consultório por hora"
"alugar consultório por hora"
"consultório por hora"
"sala por hora para psicólogo"
"sala para atendimento por hora"
"sublocação de consultório"
"consultório compartilhado"
"coworking para psicólogos"
"coworking médico"
"alugar sala odontológica"
"cadeira odontológica aluguel por hora"
"sala para fisioterapia aluguel"
"sala de aula para alugar por hora"
"auditório para alugar"
```

Títulos (até 30 caracteres cada, cole os 12):
```
Alugue Consultório por Hora
Consultório Pronto por Hora
Sala para Psicólogo por Hora
Sala Odontológica por Hora
Sem Contrato e Sem Fiador
Pague Só as Horas que Usar
Reserve com Pix ou Cartão
Espaços Prontos em Maringá
Consultórios e Salas Prontas
Atenda Seus Pacientes Já
Cadastro Grátis
SpaceHour
```

Descrições (até 90 caracteres):
```
Consultórios, salas de psicologia, fisioterapia e aula por hora. Reserve online com Pix.
Sem contrato, sem condomínio e sem fiador. Pague só pelas horas que usar. Cadastro grátis.
Veja fotos, equipamentos e avaliações. Endereço liberado quando a reserva é confirmada.
Espaços prontos para atender seus pacientes e clientes, avulso ou toda semana.
```

URL final: o link "Google – profissionais" da seção 1.

### Campanha B: Anfitriões (quem tem sala)

Palavras-chave:
```
"alugar meu consultório"
"alugar horário do consultório"
"sublocar consultório"
"sublocar sala"
"como alugar meu consultório"
"renda extra consultório"
"dividir consultório"
"alugar sala comercial por hora"
```

Títulos:
```
Alugue Seu Consultório Vago
Renda Extra no Seu Consultório
Anuncie Seu Consultório Grátis
Horário Vago Vira Renda
Só 3% por Reserva
Dinheiro Direto na Sua Conta
Profissionais Verificados
Você Define Preço e Horário
Sem Mensalidade
Receba via Mercado Pago
SpaceHour
```

Descrições:
```
Alugue por hora os horários vagos da sua sala a profissionais com registro verificado.
Anunciar é grátis. Sem mensalidade: só 3% por reserva. Dinheiro direto no Mercado Pago.
Você define preço, dias, horários e regras. Aceite na hora ou aprove cada pedido.
Caução, avalista e mediação de incidentes para proteger o seu espaço.
```

URL final: o link "Google – anfitriões" da seção 1.

**Palavras-chave negativas** (nas duas campanhas):
```
emprego
vaga
vagas
curso
concurso
salário
comprar
venda
à venda
móveis
planta
decoração
```

## 5. Ação direta (o que traz cadastros em 24 h)

Anúncio pago demora a aprender. Mensagem pessoal converte no mesmo dia. Meta: **30 contatos por dia** durante os 3 dias.

**WhatsApp para donos de consultório e clínica** (conhecidos, fornecedores, clientes da DentalPOS, grupos de profissionais):
```
Oi, [nome]! Tudo bem?
Lancei o SpaceHour, um site em que o dono de consultório aluga por hora os horários em que a sala fica vazia para outros profissionais (dentista, psicólogo, fisio…).
O pagamento é por Pix ou cartão e cai direto na conta Mercado Pago de quem anuncia. Não tem mensalidade: só 3% por reserva.
Estou montando os primeiros espaços de Maringá. Quer anunciar o seu? É grátis:
https://space-hour.com/anuncie?utm_source=whatsapp&utm_medium=direto&utm_campaign=lanc
Se quiser, eu te ajudo a cadastrar por telefone em 10 minutos.
```

**WhatsApp para profissionais autônomos:**
```
Oi, [nome]! Você atende em consultório próprio ou alugado?
Lancei o SpaceHour: você reserva consultório ou sala pronta por hora, sem contrato e sem fiador, e paga com Pix.
Estamos abrindo em Maringá. Cadastre-se para ser avisado(a) dos espaços disponíveis:
https://space-hour.com/profissionais?utm_source=whatsapp&utm_medium=direto&utm_campaign=lanc
```

**Onde mais divulgar (grátis):**
- Stories e post no Instagram pessoal e no da empresa, usando os mesmos cards. Na bio, o link "Instagram bio/orgânico".
- LinkedIn pessoal, com o carrossel de anfitriões.
- Grupos de WhatsApp e Facebook de dentistas, psicólogos e fisioterapeutas de Maringá (leia as regras de cada grupo antes de postar).
- Sindicatos, associações e delegacias regionais dos conselhos (CRO, CRP, Crefito): ofereça divulgar o SpaceHour como benefício aos associados.

> LGPD: não use listas de contatos compradas nem mande mensagem em massa para quem você não conhece. Contato 1 a 1 e em grupos onde a divulgação é permitida.

**Concierge (muito importante):** para os 10 primeiros anfitriões, ofereça cadastrar junto por telefone ou chamada de vídeo: fotos, horários e conexão do Mercado Pago. Cada anúncio publicado vale mais do que 20 cliques.

## 6. Cronograma

| Quando | O quê |
|---|---|
| **Dia 0 (hoje)** | Fazer a seção 0 (Pixel, Google, Vercel, domínio). Subir as campanhas do Meta e do Google. Mandar os primeiros 30 WhatsApps. Postar os stories. |
| **Dia 1** | Às 12h e às 18h: abrir Admin → Campanha e o Gerenciador de Anúncios. Pausar anúncio com CTR abaixo de 0,8% depois de 1.500 impressões. Mais 30 WhatsApps. Ligar para quem se cadastrou e não anunciou. |
| **Dia 2** | Passar a verba para o anúncio de menor custo por cadastro. Se houver 5 ou mais espaços publicados, subir a verba de profissionais. Mais 30 contatos. |
| **Dia 3** | Balanço: cadastros por origem, cadastro → e-mail confirmado → anúncio publicado. Decidir se continua, amplia para Londrina/Curitiba ou ajusta textos. |

**Números para acompanhar** (Admin → Campanha + Gerenciador de Anúncios):
- **Custo por cadastro** = gasto ÷ cadastros daquela origem.
- **% de e-mails confirmados.** Se ficar baixa, peça para olharem o spam.
- **Anfitriões com anúncio.** É o número que realmente importa na primeira semana.

## 7. Cuidados

- **Não prometa ganhos:** o valor do card 4 e do simulador é uma simulação ilustrativa e está identificado assim. Mantenha esse aviso em qualquer outro material.
- Não use fotos de pacientes nem de antes e depois. Use fotos dos espaços, sem pessoas.
- Não diga "o mais barato" nem "o único" sem prova (Código de Defesa do Consumidor e CONAR).
- Os anúncios falam de aluguel de espaço, não de serviços de saúde. As regras de publicidade dos conselhos (CFO, CFM) valem para o profissional, não para o SpaceHour, mas evite prometer resultado de tratamento.
