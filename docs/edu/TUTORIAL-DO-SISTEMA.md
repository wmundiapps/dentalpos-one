# EduMaster Pro — tutorial completo: o que cada módulo faz e como usar

## Como o sistema é organizado

O EduMaster Pro é dividido em **módulos**, um por área da instituição (acadêmico, financeiro, RH, etc.). Cada módulo aparece como um item no menu lateral — mas **nem todo usuário vê todos os itens**: o que aparece depende do **cargo** de quem está logado (professor, secretaria, financeiro, reitoria, aluno...). Isso é controlado por uma matriz cargo × módulo, configurável em **Acesso por cargo** (`/edu/acesso-por-cargo`). Esse é o primeiro conceito a entender: se um usuário não vê um módulo, o problema normalmente é permissão, não bug.

Login: cada tipo de usuário entra de um jeito —
- **Administração/secretaria/professor/RH:** e-mail e senha (com recuperação de senha self-service e reset pelo admin).
- **Professor:** também pode entrar por nome + data de nascimento, nos ambientes configurados assim.
- **Aluno:** entra por RA (registro acadêmico) + data de nascimento.
- **Gestor de polo:** acesso restrito só ao próprio polo, também por nome + data de nascimento.

---

## Painel e produtividade pessoal

### Reitoria (`/edu`)
Painel executivo: indicadores da instituição, OKRs e um assistente de relatório com IA que resume a situação geral (financeiro, acadêmico, regulatório) para a diretoria.

### Minha Mesa (`/edu/minha-mesa`)
A tela de "o que eu preciso fazer hoje": pendências, lembretes e notificações do próprio usuário logado, reunidas em um só lugar — para não depender de lembrar de abrir cada módulo separadamente.

### Alertas (`/edu/alertas`)
Central de todos os alertas do sistema (vencimentos, pendências críticas, avisos), em lista e com detalhe de cada um.

### Mensagens (`/edu/mensagens`)
Chat interno entre usuários do sistema — para conversas rápidas sem precisar de e-mail ou WhatsApp.

---

## Acadêmico

### Admissões (`/edu/admissoes`)
Vestibular e funil de candidatos: cadastro de candidatos, bolsas, campanhas de captação e classificação dos aprovados.

### Acadêmico — núcleo (`/edu/academico/...`)
- **Alunos:** cadastro geral dos alunos.
- **Criar acessos:** gera o login do aluno/professor.
- **Matrizes curriculares:** disciplinas e grade de cada curso.
- **Salas:** cadastro de salas de aula/laboratórios.

### Secretaria (`/edu/secretaria`)
Documentos acadêmicos (históricos, certificados, diplomas), arquivo e conferência de documentação do aluno.

### Notas (`/edu/notas`)
Diário de classe: lançamento de notas por professor, boletim do aluno.

### Calendário (`/edu/calendario`)
Grade de eventos e calendário acadêmico, com geração de arquivo iCal para exportar.

### Modalidades / Polos EAD (`/edu/modalidades`, `/edu/polos-ead`)
Gestão da oferta de cursos por modalidade (presencial, EAD, polos parceiros), acompanhamento de engajamento e de conformidade de cada polo.

### Desempenho (`/edu/desempenho`)
Atividades, banco de questões e simulados — para medir o desempenho do aluno ao longo do curso.

### Exames (`/edu/exames`)
- **Banco de questões** (lado do professor): cadastro de questões reaproveitáveis em provas.
- **Estudo e simulado** (lado do aluno): resolução de simulados a partir do banco.

### Presença (`/edu/presenca`, `/edu/presenca/quiosque`, `/edu/minha-biometria`)
Controle de frequência/chamada, inclusive por biometria, e um modo "quiosque" (um totem/tablet fixo onde o aluno bate presença sozinho).

### Biblioteca (`/edu/biblioteca`)
Acervo e circulação de empréstimos de livros/material, com controle de adequação (o que está em dia ou atrasado).

### Campos de prática (`/edu/campos-pratica`)
Gestão de estágios e campos de prática (clínicas, campo agro, clínica veterinária etc.): agenda e cadastro dos locais e turnos.

### Análise de documentos (`/edu/analise-docs`)
Para transferências: verificação da instituição de origem do aluno (hoje com base simulada, ver `INTEGRACOES.md`) e análise de equivalência de disciplinas.

---

## Financeiro

### Financeiro (`/edu/financeiro`)
Módulo central do dinheiro da instituição:
- **Contas a receber:** mensalidades dos alunos.
- **Contas a pagar:** fornecedores, inclusive por boleto recebido por e-mail (sub-tela `?secao=boletos`).
- **DRE e fluxo de caixa:** visão gerencial.
- **Notas fiscais.**

A baixa automática de mensalidade via gateway de pagamento ainda não está 100% conectada — ver `INTEGRACOES.md`, item 5.

### Cobrança (`/edu/cobranca`)
Gestão de inadimplentes: acordos de pagamento e histórico de cobrança por aluno. **"Cobrar" aqui é só para atraso** — gerar o boleto/Pix/cartão da primeira cobrança é feito dentro do Financeiro.

---

## Pessoas (RH, governança, apoio)

### RH (`/edu/rh`)
Colaboradores, avaliações de desempenho, plano de carreira, advertências e ciclo de vida do funcionário (admissão até saída).

### Governança (`/edu/governanca`)
Colegiados (conselhos internos), CPA (Comissão Própria de Avaliação), CIPA, deliberações e carreira docente.

### Apoio ao estudante (`/edu/apoio`)
Atendimentos de apoio psicossocial/AEE (atendimento educacional especializado), bolsas de assistência, ouvidoria e acompanhamento de egressos.

### Colaborador / CIPA / Lavanderia / Compras-rastreio
Áreas operacionais internas (uso de equipe de apoio/operações). **Não aparecem para aluno, professor nem cliente contábil** — são bloqueadas para esses perfis por padrão.

---

## Infraestrutura e compras

### Infraestrutura (`/edu/infraestrutura`)
Manutenção predial, abertura de chamados, controle de energia, estacionamento e adequação de espaço físico.

### Suprimentos (`/edu/suprimentos`)
Almoxarifado, cotações de compra, fluxo de aprovação (com rastreio de quem aprovou cada etapa) e catálogo de itens.

---

## Regulatório, jurídico e LGPD

### Regulatório (`/edu/regulatorio`)
Atos regulatórios (portarias, resoluções), checklists de comissão MEC e análise de documentos regulatórios com apoio de IA.

### Jurídico (`/edu/juridico`)
Contratos, documentos jurídicos, imóveis e um painel de inteligência jurídica (consultas/alertas sobre processos e prazos).

### LGPD (`/edu/lgpd`)
Consentimentos coletados, encarregado de dados (DPO), registro de incidentes e política de retenção de dados.

### Segurança e certificações (`/edu/seguranca-certificacoes`)
Controle de certificações da instituição e pontos de segurança institucional (não é a 2FA do usuário — essa fica em Configurações da própria conta).

---

## Comunicação e marketing

### Comunicação (`/edu/comunicacao`)
Omnichannel da instituição: um só lugar para WhatsApp, Telegram, e-mail, SMS, voz, redes sociais e chat do site.
- **Canais:** onde se cadastra cada canal (ver `INTEGRACOES.md`).
- **Campanhas, inbox e bot:** disparo e atendimento automatizado.
- **Régua de cobrança** e **caixa de saída**: lembretes programados e fila do que ainda será enviado.

### Marketing (`/edu/marketing`)
Campanhas de captação, calendário editorial e conformidade (LGPD) do que é divulgado.

### Atendimento (`/edu/atendimento`)
Central de atendimento ao aluno/público: catálogo de solicitações, base de conhecimento e documentos de apoio.

---

## Portais de autoatendimento

### Portal do Aluno (`/edu/portal-aluno`)
O que o próprio aluno vê e faz: boletim, situação financeira, biblioteca, fluxograma do curso e outras ações de autoatendimento — sem precisar passar pela secretaria para cada pedido simples.

### Portal do Professor (`/edu/portal-professor`)
Turmas do professor e as funções do dia a dia dele (lançar nota, dar presença, etc., de acordo com o que o cargo permite).

---

## Contabilidade (para escritórios de contabilidade que atendem a instituição)

### Contábil (`/edu/contabil` e sub-telas)
- **Abertura:** abertura de empresa.
- **RH/DP:** folha e obrigações trabalhistas.
- **Imposto de Renda.**
- **Assistente:** apoio com IA para dúvidas contábeis.
- **Carteira de clientes** e **Portal do cliente contábil:** para o escritório gerenciar várias instituições/empresas clientes a partir de uma única conta.

---

## Suporte e feedback

### Feedback (`/edu/feedback`)
Canal de sugestões e relato de problemas sobre o próprio sistema — qualquer usuário pode enviar, com campo de tela/departamento para dar contexto.

### Caixinha de ajuda com IA
Ícone fixo no canto da tela (não tem rota própria — aparece em qualquer página): tira dúvida sobre como usar o sistema sem precisar chamar o suporte. Não identifica qual IA está por trás; o uso é contado para controle interno de custo.

---

## Identidade e configuração da instituição

### Identidade (`/edu/identidade`)
Logomarca e identidade visual da instituição dentro do sistema (nome, cores, logo que aparece no topo).

### Acesso a polos (`/edu/acesso-polos`)
Gestão de quais gestores de polo têm acesso a qual polo — importante para quem tem mais de uma unidade/polo EAD.

---

## Conceito-chave para treinar a equipe: permissões por cargo

Antes de treinar qualquer pessoa num módulo específico, vale fixar este conceito: **o que cada cargo pode ver e fazer é configurado em `Acesso por cargo`**, não é fixo no sistema. Então, ao treinar alguém novo:
1. Confirme o cargo da pessoa.
2. Veja em `Acesso por cargo` quais módulos esse cargo já tem liberado.
3. Só então mostre os módulos que ela realmente vai usar — mostrar módulos que ela não vai ver na prática só confunde.
