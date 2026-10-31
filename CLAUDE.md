# DentalPos — regras do repositório (memória do projeto)

Sistema de gestão odontológica (clínicas, laboratórios, acadêmicos). Nome do produto: **DentalPos** (sem "One" em tela, e-mail ou texto). Endereço: app.dentalpos.com.br; API: api.dentalpos.com.br.
Monorepo: `frontend/` (React + Vite + MUI), `backend/` (Express + Prisma, Postgres no Supabase), publicado na Vercel (projetos `dentalpos-one` e `dentalpos-one-w2pa`). Outros produtos no mesmo repositório: `revah/`, `espacos/` (SpaceHour).

## Como trabalhar com o Robson
- Ele é dentista e dono da clínica; fala português. Quer **um passo curto por vez**, com comandos, URLs e valores em bloco de copiar e colar. Explique só quando ele perguntar.
- **Nunca** pedir nem mostrar senha, chave de API, token ou código no chat. Ele digita direto na tela de destino.
- O que mexe em **banco, cobrança, segredo ou acesso/segurança** vira PR para ele decidir. O resto, com build da Vercel pronto e sem conflito, pode ser mesclado sem perguntar.
- A chave do Supabase do ambiente é só de leitura: SQL de criação ou alteração ele cola no editor do projeto **DentalPos One** (`lfeqfzvmasqnnmqvkjyg`). Sempre confira o nome do projeto no canto da tela (já houve SQL rodado no projeto errado).
- Antes de mesclar PR que mexe no banco, conferir no banco que o SQL rodou.
- Validar o frontend com `cd frontend && npx tsc -b` e o backend com `cd backend && npx tsc --noEmit`.
- Nunca apagar: corrigir ou adicionar. Tabela nova nasce com RLS ligado e sem acesso para `anon`/`authenticated` (migrações manuais em `backend/prisma/manual-migrations/`).

## Palavras e regras de produto
- "Cobrar" é só para cobrança de atraso. A ação que cria boleto, Pix, cartão, cheque ou dinheiro chama-se **"Gerar financeiro"**.
- Planos: Basic R$ 197, Intermedium R$ 397, Plenum R$ 597 por mês. Profissionais: **30 dias grátis** com cartão cadastrado no início (a cobrança só começa depois do teste, sem fidelidade, cancela a qualquer momento) e **50% de desconto nos 12 meses seguintes**, depois valor cheio (Black Friday 2026, campanha em `marketing/black-friday/`; desconto vale para cadastros até 31/12/2026, configurável por `SUBSCRIPTION_PROMO_UNTIL`). Tudo automático: cadastro em `/cadastro`, assinatura no Asaas, webhook `/api/webhooks/platform-asaas`, cancelamento e reativação em Configurações > Minha assinatura (reativar cobra antes o que estava em atraso, sem novo teste), aviso fixo no sistema quando a mensalidade atrasa, aviso por e-mail 3 dias antes da primeira cobrança. Não existe mais teste de 60 dias nem teste sem cartão. Acadêmicos: gratuito até a colação de grau e mais 6 meses grátis depois da formatura (regra de 19/10/2026; concedida manualmente na conta, sem automação no sistema), depois mensalidade reduzida (50%, a confirmar) por 12 meses. Estudantes (My Students): R$ 23 por mês (a confirmar).
- **Indicador profissional** (`/profissionais`, Configurações > Indicador profissional): o paciente informa nome, WhatsApp, cidade e serviço (com autorização), vê quantos profissionais há por cidade e só abre os nomes da cidade que clicar (até 3 por busca). O contato do profissional nunca aparece: o pedido vai por mensagem automática (e-mail; SMS, WhatsApp e Telegram quando `COMTELE_API_KEY`, `META_PHONE_NUMBER_ID`/`META_ACCESS_TOKEN`/`META_FINDER_TEMPLATE` e `TELEGRAM_BOT_TOKEN` existirem). O profissional só aparece se ligar e aceitar os termos. Textos de autorização são texto legal: **aprovados pelo Robson e pela Dra. Roberta em 31/10/2026** (versão `2026-10-31` em `backend/src/services/finderService.ts`); qualquer mudança exige nova aprovação e nova versão. O cadastro antigo sem cartão (`/demo/register`, EXPERIENCE) está encerrado no código; o teste de 30 dias é só em `/cadastro`.
- Pendências, filas e avisos nunca somem; o travamento de tela foi trocado pelo alerta "VOCÊ ESTÁ EM RISCO".
- O funcionário só vê os próprios dados de RH; RH, administração e gestor veem tudo.

## Documentos legais
- Texto contratual e cláusulas reutilizáveis: `docs/legal/CLAUSULAS-PADRAO-WMUNDI.md` (cláusulas-padrão para **todos** os sistemas da WMundi) e `docs/legal/CONTRATO-ASSINATURA-DENTALPOS.md` (minuta). Ao criar contrato ou termos de outro sistema, comece pelas cláusulas-padrão.
- Cláusula aprovada (15/10/2026): atualizações semanais com possível indisponibilidade temporária; outras quedas fora da responsabilidade da empresa são tratadas com os servidores e empresas responsáveis; em caso de queda, o cliente contata o suporte por e-mail.
- Texto legal só muda com aprovação do Robson e revisão da Dra. Roberta.

## Reaproveitar entre sistemas
- Playbook do ClubeFaz (repositório `wmundiapps/ifaco`, `docs/PLAYBOOK-reaproveitar.md`): copia-se o **código**, nunca a lista de contatos. Aplicados aqui: captação na Receita, Excel com WhatsApp, convite por e-mail agendado, 2 etapas, envio de arquivos seguro, cabeçalhos de segurança.
