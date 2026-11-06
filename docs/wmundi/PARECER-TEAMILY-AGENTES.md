# Parecer: Teamily AI e a prateleira de agentes da WMundi

Data: 06/11/2026 · Pedido do Robson: escanear teamily.ai e opinar se podemos desenvolver agentes prontos para vender na nossa plataforma.
Regra: o site é **referência de mercado**. Nada de copiar texto, código, marca ou layout. Os agentes da WMundi são desenvolvidos do zero.

## 1. O que li (e o que não consegui ver)
**Li:** página inicial, `/about`, `/about/help-center`, `/pricing` (só o FAQ), `/discover` (só o esqueleto), `sitemap.xml`, `robots.txt`, `llms.txt` (resumo que a própria empresa publica) e uma busca na internet.
**Não consegui ver:** o catálogo de agentes e os valores dos planos (as páginas `/pricing` e `/discover` carregam por JavaScript e pedem login), o blog (`blog.teamily.ai` bloqueado nesta sessão) e o aplicativo por dentro. **Por isso não existe aqui uma lista completa dos "agentes prontos" deles.** O que aparece na vitrine da home: Personal AI, Webpage Developer, Market Research, Finance Assistant, Slides Assistant, Analysis Agent, Music Hub e exemplos como "Atlas" (agente de releases) e "Design Agent". O `llms.txt` diz haver "50+ agentes especialistas embutidos" (afirmação deles, não verificada).

## 2. O que o Teamily realmente é
- Um **mensageiro nativo de IA** ("rede social humano + IA"): grupos de chat em que pessoas e agentes conversam juntos, com memória compartilhada entre conversas, "estúdios" para criar sites, slides, documentos e painéis, roteador que escolhe o melhor modelo por tarefa, agentes que se criam em linguagem natural (sem código), feed público para copiar ("fork") agentes dos outros, e apps para web, iOS, Android, macOS e Windows.
- Quem está por trás (segundo o próprio site): Teamily, Inc., subsidiária da TensorOpera AI, fundada por pesquisadores de IA (Dr. Aiden Chaoyang He e Prof. Salman Avestimehr). Declara **4,5 milhões de usuários (jun/2026)** e **US$ 20 milhões em financiamento** (números da própria empresa, não verificados por mim).
- Preço (o que consegui confirmar): planos **Free, Plus e Pro**, uso incluído e **uso sob demanda por token** (pague pelo que usar, com limite mensal opcional), **assinatura anual com 2 meses grátis**, e "patrocínio de grupo" (o dono do grupo paga o uso de todos). Um diretório de terceiros cita "a partir de US$ 19,99/mês"; **não confirmado**.
- Em resumo: **não é um catálogo de agentes verticais para pequenas empresas**. É uma plataforma de conversa e produtividade, global, em inglês, para pessoas e equipes.

## 3. Parecer
**Copiar o Teamily inteiro (mensageiro + rede social + memória + estúdios + roteador de modelos): não recomendo.** É um produto de empresa com 20 milhões de dólares captados e milhões de usuários, concorrendo com Slack e WhatsApp. Anos de trabalho, e não é onde a WMundi tem vantagem.

**Desenvolver nossa própria prateleira de agentes verticais, em português, ligados aos sistemas que já temos: recomendo, e dá para começar já.** É um mercado diferente e mais fácil de vender: a clínica não quer "um mensageiro de IA", quer **o agente que confirma consulta, cobra o atrasado e responde o WhatsApp**. Nossos diferenciais reais:
1. **Vertical e em português:** odontologia/saúde, escolas, comércio, serviços.
2. **Agente dentro do sistema de gestão:** ele enxerga agenda, financeiro e cadastro do DentalPos/REVAH, o que um mensageiro genérico não tem.
3. **WhatsApp-first, com aprovação humana** para o que é sensível (a nossa regra de "robô propõe, humano aprova").
4. **Distribuição por parceiros:** produtos na prateleira para os parceiros venderem.
5. **Cobrança já pronta:** créditos e Asaas.

## 4. O que a WMundi já tem no código (base da "fábrica de agentes")
- **DentalPos (`backend`)**: adaptador de IA (`aiService.ts`) que confere saldo, limita tamanho, chama o modelo e **debita créditos**; `creditService.ts` com carteira por clínica e tipos **IA, SMS e VOZ**, franquia por plano que renova todo mês; `platformBillingService.ts` para **vender pacotes de crédito** pelo Asaas.
- **REVAH (`revah/api`)**: robô de atendimento com contexto do cliente (CRM + histórico multicanal, `ai.ts`), motor de voz (`voice/engine.ts`), canais, caixa de entrada, automações, bloqueio de quem pediu para sair (opt-out), auditoria, planos e cobrança.
- **Resultado:** já existem **motor de IA + créditos + canais + auditoria + cobrança**. O que falta é a camada "agente como produto": **modelos de agente**, **catálogo/painel para contratar** e **rotina de configuração por cliente**.

## 5. Proposta: Prateleira de Agentes WMundi
**Fábrica de agentes (a ideia técnica):** cada agente é um modelo com personalidade, instruções, conhecimento do cliente, ferramentas permitidas (agenda, cobrança, mensagem), canais (WhatsApp, e-mail, voz), limites de uso, regra de aprovação humana e registro de tudo. Um mesmo código roda milhares de instâncias, uma por cliente.

**Onda 1 (agentes mais simples e de maior valor, 4 a 8 semanas):**
1. Atendente de WhatsApp (responde, qualifica, não inventa preço, passa para pessoa).
2. Agente de agenda (confirmação, remarcação, lista de espera, falta).
3. Cobrança de atraso (lembrete educado, segunda via, escalonamento com aprovação).
4. Pós-atendimento e avaliação (pesquisa de satisfação, pedido de avaliação no Google).
5. Resumo diário do dono ("Maestro" do negócio).

**Onda 2 (valor alto, esforço médio):** qualificador de leads e retorno comercial; criador de conteúdo (roteiro de reels, legendas, calendário); resposta às avaliações do Google; recepção por voz; triagem de currículos (RH).

**Onda 3 (diferenciais):** agente de odontologia (retorno de paciente, orçamento em aberto, alinhadores), agente escolar (acadêmico/financeiro), agente de comércio (estoque e reposição), agente de contabilidade (documentos pendentes).

**Como vender:** assinatura por agente + franquia de créditos, com pacote de crédito avulso (já existe), e **venda via parceiros** com condições combinadas só na proposta (sem divulgar percentuais no site, como o Robson decidiu).

## 6. Riscos e cuidados
- **Saúde:** o agente nunca dá diagnóstico nem promete tratamento; urgência vai para pessoa; publicidade de saúde segue regras do conselho profissional.
- **WhatsApp:** respeitar as políticas da Meta para robôs e a janela de mensagens; revisar antes de escalar. Só mandar mensagem a quem tem base legal e dar opção de sair.
- **LGPD:** dados de saúde são sensíveis: minimizar o que vai para o modelo de IA, contrato com o fornecedor de IA, registro de operações, revisão da Dra. Roberta.
- **Custo de IA:** medir custo por cliente e por agente; trabalhar com franquia e limite de uso (o código já tem a estrutura).
- **Qualidade:** testes com conversas reais anonimizadas; "frase proibida" (preço, diagnóstico, promessa).
- **Propriedade intelectual:** não usar o nome "Teamily", o texto, as imagens nem o layout deles. Fazer referência de mercado é permitido; copiar não.
- **Provedores de IA:** hoje o DentalPos usa OpenAI e o REVAH usa Anthropic. Convém unificar a camada para trocar de modelo sem reescrever agentes e para controlar custo.

## 7. Próximos passos sugeridos
1. O Robson aprova a **Onda 1** (5 agentes) e escolhe quais setores primeiro (odontologia é o mais natural).
2. Eu desenho a **fábrica de agentes** (modelo de agente, painel de contratação, aprovação humana, registros) e entrego a **Demo** para vender.
3. Piloto com 5 a 10 clientes e preço de teste (a confirmar).
4. Publicar a prateleira no site com os agentes reais assim que cada um estiver pronto.

Fontes: [Teamily AI, página inicial](https://teamily.ai/), [sobre](https://teamily.ai/about), [central de ajuda](https://teamily.ai/about/help-center), [llms.txt](https://teamily.ai/llms.txt), [diretório aitoolsspace](https://www.aitoolsspace.com/pt/tools/teamily).
