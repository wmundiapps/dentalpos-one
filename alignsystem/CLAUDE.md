# AlignSystem — contexto para novas conversas

Rede de ortodontia com alinhadores. Operadora: **Instituto Ravel de Ensino Superior Ltda**, CNPJ 03.162.275/0001-10 (razão social sempre esta). RT: Dr. Robson Ravel de Oliveira, CRO-PR 514. Sede: Maringá/PR. Admin do painel: contato@dentalpos.com.br.

O usuário prefere respostas curtas em português, um passo por vez, com blocos de copiar e colar.

## Código e deploy
- Código no branch `claude/dental-consultation-platform-k5mei7`, pasta `alignsystem/` (não existe no `main`).
- Node + rotas serverless em `lib/app.js`; Postgres Neon (migrações rodam no build); front em `public/` (`painel.js`, `minha-avaliacao.html`, `app.js`).
- Vercel: projeto `prj_elmKLBSm90z3BNcUY7AnIfCbXy7h`, time `team_PPjPjgAfw8CsUSGsPPPop241`, domínio alignsystem.com.br.
- Deploy só por comando ou pela rotina de 2 em 2 dias: `POST https://api.vercel.com/v13/deployments` com `gitSource` (repoId 1345488314, ref do branch, sha) **e** `"projectSettings":{"rootDirectory":"alignsystem","commandForIgnoringBuildStep":"exit 1"}`. **Sempre** rodar os testes antes: `npm test` precisa terminar com `# fail 0`.
- O projeto na Vercel fica de propósito com Root Directory vazio e Ignored Build Step `exit 0`: os pushes de outros apps no repositório viram CANCELED, sem e-mail de falha. Não desfazer (o dono pediu).
- Testes locais: Postgres em /tmp/pgas/data, porta 5433 (`TEST_DATABASE_URL=postgres://alignsystem_app:dev@127.0.0.1:5433/asdev npm test`).

## Regras de negócio já implementadas
- Pré-avaliação por 7 fotos → parecer → escaneamento (valor único, descontado do tratamento) → plano com até 3 marcas por grau → contrato → pagamento Asaas com split.
- Até 18x sem juros no boleto; acima, com juros (tabela Price). Negociação on-line com teto da AlignSystem e desconto dividido proporcionalmente.
- Consultas incluídas por complexidade; consulta por quebra = consulta do dentista + 30% (o excedente fica com a AlignSystem); refinamento cobrado por consulta.
- Preço próprio: custo dos alinhadores para a AlignSystem, o restante 80% dentista / 20% AlignSystem.
- Dentista: até 10 cidades no mesmo estado (CRO de outro estado = outro cadastro); repasse no dia 10 do mês seguinte (ou no próximo dia útil).
- Atendimento só com autorização prévia (rotina/urgência) + registro com assinatura do paciente e do dentista.
- Contrato do paciente: cláusula 3.5 (consultas na sede em Maringá sem credenciado na região), 4.3, 4.6, 5.4. Termo do parceiro: 3.4, 6.7, 6.8, 10.2 (multa fixa R$ 5.000). Tudo pendente de revisão da Dra. Roberta.
- Webhook Asaas: token comparado em tempo constante e pagamento conferido direto na API do Asaas.
- Publicidade (regras do CRO): sem preço, sem "avaliação grátis", sem promessa de resultado; sempre com RT e CRO.

## Pendências
- Revisão jurídica dos contratos (Dra. Roberta) e reenvio do pacote Word.
- Pixel do Meta (variável META_PIXEL_ID na Vercel) e campanha de conversão no site (fase 2).
- Provedor de SMS para os avisos de negociação; teste de boletos acima de 18x no sandbox do Asaas.
- Credenciar dentistas em Curitiba, Londrina, Campo Mourão, Paranavaí e Cianorte.
