# Wmundi — pacote de continuação para outra sessão do Claude

Gerado em 25/10/2026. Branch: `claude/wmundi-business-plan-rtz7e4` (repositório `wmundiapps/dentalpos-one`). **Nenhum PR foi aberto.**
Leia primeiro `CLAUDE.md` na raiz: ele manda em tudo (português, um passo curto por vez, nunca pedir nem mostrar senha/chave/token, banco/cobrança/segredo/segurança viram PR para o Robson decidir, nunca apagar, produto se chama "DentalPos").

> Para a nova sessão: comece dizendo "Li o CLAUDE.md e este arquivo". Depois pergunte ao Robson qual item da seção 7 ele quer primeiro. Um passo por vez.

## 1. Quem é o Robson e o que ele pediu
Robson Ravel de Oliveira, dentista e dono da clínica, vai abrir a **Wmundi**. Metas pedidas:
- **Muito grande** (referência TOTVS), **empolgante** (RD Station), **IA em soluções** (GitHub, Octadesk, Tolzz), **desenvolvedora de apps** (Apple e Google Play).
- Reestruturar o site com as áreas: desenvolvimento de apps, marketing digital para empresas, educação, saúde, serviços, automação.
- Empresa organizada por setores, com agentes (robôs) por setor: "milhares de robôs, poucos funcionários".
- Escalar para o país todo e para o exterior: registro no Brasil e na Europa já vigentes, EUA possível.
- Listar tudo que a Wmundi pode oferecer a empresas e ao público.

## 2. O que já está feito (tudo em `docs/wmundi/`)
| Arquivo | Conteúdo |
|---|---|
| `PLANO-DE-NEGOCIOS-WMUNDI.md` | Plano de execução: visão, 4 ambições, estrutura Brasil/Europa/EUA, 7 áreas, modelo de poucos humanos e muitos robôs, receitas, roadmap fases 0–3, indicadores, riscos, 5 decisões para o Robson |
| `CATALOGO-WMUNDI.md` | Tudo que a Wmundi pode oferecer, por área e público, e 5 pacotes comerciais sugeridos |
| `AGENTES-ROBOS-POR-SETOR.md` | 19 setores, gerente + operários por setor, Agente Maestro, regras de segurança dos robôs, ordem dos 10 primeiros robôs |
| `site/index.html` | Proposta de página do site novo (HTML único, escuro, 7 áreas) |
| `site/COMO-PUBLICAR.md` | Como descobrir se o site está no GoDaddy, WordPress ou Wix e onde colar |
| `demos/painel-maestro.html` | Demo interativa: painel do Maestro (19 setores, fila "Precisa de você", feed ao vivo, ligar/desligar setor). Dados fictícios |
| `demos/robo-de-agenda.html` | Demo: conversa simulada de WhatsApp do robô de agenda do DentalPos com bastidores. Dados fictícios |
| `demos/site-previa.html` | Prévia do site novo adaptada para publicar como página privada |

As 3 demos foram publicadas como artefatos privados na conta do Robson (links funcionam só na conta dele):
- Painel Maestro: https://claude.ai/artifact/NGgqWn2TytrbSGQ9vvGXq7
- Prévia do site: https://claude.ai/artifact/QQ5Wbv7pcoKsttYgaELfcL
- Robô de Agenda: https://claude.ai/artifact/7Zf8hRcD74a7TzbdB6LuAt

Em outra conta, republique os HTML de `demos/` (são arquivos de página sem `<head>`/`<body>`, prontos para o Artifact). **Nenhuma demo foi aberta em navegador para conferência visual.**

## 3. Decisões do Robson e pendências abertas
- **Site da Wmundi:** não está neste repositório. Ele não sabe se está no GoDaddy, WordPress ou Wix. Passo dele: abrir wmundi.com, "Exibir código-fonte", procurar `wp-content` (WordPress), `wixstatic` (Wix) ou `godaddy`. Depois adaptar a página à plataforma.
- **Nome em evidência e "desenvolvedores Apple e Android":** discutido e **o Robson mandou não fazer nada por enquanto. Deixar como está.** Proposta que ficou aguardando: nome e título dele em destaque, frase "Apps para iPhone e Android" (verdadeira se a equipe entrega), e deixar prontos mas desligados os selos App Store/Google Play e "Desenvolvedor Apple e Google Play" até existirem as contas de desenvolvedor da empresa (Apple exige D-U-N-S, leva semanas) e o primeiro app publicado. Nunca dizer "certificado pela Apple" ou "parceiro Google". Faltam dele: como quer nome e título, e quem abre as contas Apple e Google.
- **5 decisões no fim do plano (seção 10):** ordem de prioridade (IA nos produtos → apps → marketing → escala), nome da holding e onde fica a propriedade intelectual, EUA agora ou depois do primeiro cliente, preço do primeiro agente de IA (teste de R$ 97 a R$ 297, a confirmar), primeiro app (DentalPos Paciente ou Agenda). **Nenhuma foi respondida.**
- Contador e Dra. Roberta precisam validar estrutura societária e textos legais. Texto legal só muda com aprovação do Robson e revisão da Dra. Roberta.
- E-mail de contato da página usa `contato@dentalpos.com.br`; trocar por um e-mail da Wmundi quando houver.

## 4. Curso de marketing em Harvard (pedido do Robson)
Ele quer fazer um curso de Harvard. Pesquisa feita (preços de páginas salvas, **confirmar na página oficial**):
- Harvard (HBS Online, via Harvard Professional & Lifelong Learning), todos pagos desde o início, sem versão gratuita com certificado: Digital Marketing Strategy (online, 7 semanas, ~US$ 1.850), Creating Brand Value (6 semanas, US$ 1.850), Entrepreneurial Marketing (4 semanas, US$ 1.850), Marketing Analytics (online ao vivo US$ 2.950; presencial US$ 3.200), Future Proof with AI (US$ 279), Credential of Digital Innovation and Strategy (US$ 6.500). Lista: https://pll.harvard.edu/subject/marketing
- Stanford: sem curso online de marketing com preço confirmado. GSB tem programas online (https://www.gsb.stanford.edu/programs/online); especialização de Product Marketing no Coursera com teste grátis (certificado pago, preço não confirmado).
- Universidade da Flórida: Mestrado online em Marketing (Warrington), 1 ano, assíncrono, ~US$ 15.921 (residente da Flórida) e ~US$ 39.836 (fora), sem GMAT/GRE, elegibilidade a confirmar; certificados Essentials of Business são de negócios em geral.
- **Recomendação dada:** 1º Digital Marketing Strategy; 2º Marketing Analytics quando houver dados e clientes; 3º Creating Brand Value depois de decidir marca e posicionamento. Deixar de lado por ora Entrepreneurial Marketing e Future Proof with AI.
- Certificado da HBS Online: é "Certificado de Conclusão", não diploma. Exige entregas no prazo, respostas originais, citação de fontes e participação nas discussões; decisão até 30 dias após o prazo final; digital gratuito desde 1/1/2026, impresso pode ter custo. **Não foi possível confirmar se o certificado diz "online"** nem a diferença para presencial.
- Cuidado ao divulgar: citar como "Digital Marketing Strategy, HBS Online", sem usar nome ou logo de Harvard como apoio à Wmundi.
- Ajuda financeira: edX/HBS Online cita até 90% de desconto em certificados verificados, por aprovação.

### E-mail para a HBS Online (rascunho, em inglês)
Ainda **não enviado**. Não achei URL de formulário nem e-mail para quem ainda não é aluno. Página oficial: https://www.harvardonline.harvard.edu/node/94 (FAQ primeiro; portais de suporte parecem ser para inscritos). Não usar `executive_education@hbs.edu` nem `doctoralprograms@hbs.edu` (outros setores). Próximo passo: o Robson abre a página do curso (https://pll.harvard.edu/course/digital-marketing-strategy) e diz quais botões aparecem.

Assunto: Question about Digital Marketing Strategy – schedule, requirements, and certificate

Corpo: apresentação (Robson Ravel de Oliveira, dentista, fundador da Wmundi, Brasil) e 13 perguntas: (1) o certificado diz que foi online? (2) diferença para o certificado presencial de educação executiva? (3) certificado digital/impresso, custo e envio ao Brasil? (4) requisitos exatos e nota mínima? (5) datas de início e duração da turma? (6) aulas gravadas ou ao vivo; dias, horários e fuso? (7) prazos semanais e o que acontece se perder um? (8) tarefas (leituras, quizzes, trabalhos, discussões, prova final)? (9) como e quando são as provas, cronometradas, janela de horário? (10) horas por semana? (11) formas de pagamento para o Brasil (cartão internacional, parcelas, outra moeda)? (12) preço de US$ 1.850 atual e descontos/ajuda financeira? (13) política de reembolso ou adiamento? Assinatura: Robson Ravel de Oliveira, Founder, Wmundi, Maringá, Paraná, Brazil, e-mail robsonravel@wmundi.com (telefone e endereço completo ficam fora deste arquivo de propósito; o Robson tem o texto final no chat anterior; o e-mail digitado antes como `emundi.com` era erro de digitação, o correto é **wmundi.com**).

## 5. Auditoria de webhooks de pagamento (pedida a partir de um vídeo)
Somente leitura, **nenhum arquivo foi alterado**. Achados em `backend/src` (DentalPos) e `revah/api/src` (REVAH):
- **Correto:** Stripe no DentalPos (`controllers/webhookController.ts`: HMAC, tolerância de 5 min, 401 se inválido, 503 se sem segredo); Stripe no REVAH (`services/billing.ts`, verificação oficial); Asaas em `/webhooks/asaas` (exige token, comparação segura); ponte REVAH (`revahBridge`, assinatura + horário); Meta WhatsApp no REVAH (assinatura; em produção recusa sem segredo).
- **Risco:** `POST /webhooks/platform-asaas` (`controllers/platformBillingController.ts`, função `webhook`) só recusa se `ASAAS_WEBHOOK_TOKEN` estiver configurado **e** diferente do recebido. Se a variável estiver vazia no servidor, aceita qualquer requisição; `handlePlatformWebhook` (`services/platformBillingService.ts`) credita pacotes de créditos ao receber `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` com `externalReference` `credit:<id>`. A comparação também não é segura contra medição de tempo.
- **Correção proposta (~5 linhas):** recusar sempre que o token não estiver configurado (como `/webhooks/asaas`) e usar `timingSafeEqual`. É cobrança e segurança, então **vira PR para o Robson decidir**. **PR ainda não aberto.** Antes: ele confere, sem me mostrar o valor, se `ASAAS_WEBHOOK_TOKEN` existe nas variáveis da Vercel.
- **Menores:** webhook do Resend usa a chave na URL (`/p/webhook/resend?key=`), que pode aparecer em logs; tokens Asaas por clínica ficam em texto em `paymentProviderConfig.settings`.
- Depois da correção: rodar `cd backend && npx tsc --noEmit`.

## 6. Regras do repositório que valem aqui (de `CLAUDE.md`)
Um passo curto por vez, com comandos e URLs em bloco de copiar. Nunca pedir nem mostrar senha, chave ou token. Banco, cobrança, segredo e acesso viram PR. A chave do Supabase do ambiente é só de leitura: SQL de criação ou alteração ele cola no editor do projeto **DentalPos One** (`lfeqfzvmasqnnmqvkjyg`), conferindo o nome do projeto na tela. Tabela nova nasce com RLS ligado e sem acesso para `anon`/`authenticated`, em `backend/prisma/manual-migrations/`. "Cobrar" só para atraso; a ação que cria boleto/Pix/cartão chama-se "Gerar financeiro". Planos: Basic R$ 197, Intermedium R$ 397, Plenum R$ 597; Profissionais 30 dias grátis e 50% nos 12 meses seguintes; Acadêmicos grátis no último ano e 90 dias após a formatura; Estudantes R$ 23 (a confirmar). Validar com `cd frontend && npx tsc -b` e `cd backend && npx tsc --noEmit`. Cláusulas padrão: `docs/legal/CLAUSULAS-PADRAO-WMUNDI.md`.

## 7. Próximos passos sugeridos (o Robson escolhe; um por vez)
1. Descobrir a plataforma do site (WordPress, Wix ou GoDaddy) e adaptar `site/index.html`.
2. Responder as 5 decisões do plano (seção 10 do plano).
3. Definir nome e título no site e quem abre as contas Apple e Google; depois ligar a frase "Desenvolvedor Apple e Google Play".
4. Abrir o PR da correção do webhook `platform-asaas` (após conferir a variável na Vercel).
5. Enviar o e-mail à HBS Online e escolher a turma do curso.
6. Primeiros robôs a construir: atendente por e-mail/WhatsApp, agenda, cobrança de atraso, resumo diário do Maestro.

## 8. Limitações desta sessão (para não repetir)
Sem acesso a e-mail, ao site wmundi.com nem a páginas de Harvard/Stanford/Coursera/UF (as buscas funcionaram, abrir os sites não). O token do Supabase do ambiente é só leitura. Preços de cursos vêm de páginas salvas e precisam de conferência.
