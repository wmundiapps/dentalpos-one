# QA visual do EduMaster Pro (demonstração)

Navegador real (Chromium via Playwright), API local na porta 3000 com Postgres local próprio (`qa_visual`), frontend em `vite` com `VITE_APP_MODE=edu`. Banco carregado com `edu-demo-seed.ts` + `edu-demo-user.ts` (apresentacao@uninga.br, ADMIN). Viewports: celular 390x844 e desktop 1366x768. Cada rota `/edu/*` do menu (103 URLs: `rotas.json` + rotas de `AppRoutes.tsx`) foi aberta e todas as abas principais (`role=tab`) foram clicadas: **799 estados por viewport**. Em cada estado foram coletados erros de console/página, respostas 4xx/5xx da API, texto `undefined`/`NaN`/`[object Object]`, tela quase vazia, spinner preso, inglês solto, menção a marca de terceiros/termos odontológicos e rolagem horizontal (celular). Screenshots-chave em `docs/apresentacao/fonte/qa/` (desktop e celular).

Perfis: apresentacao@uninga.br (ADMIN, completo), aluno@suainstituicao.edu.br (portal do aluno, salas virtuais do AVA, simulados, flashcards, ENADE/ENAMED/OAB) e prof.anatomia@suainstituicao.edu.br / Demo@2026 (portal do professor, calendário, notas, presença, desempenho, biblioteca, biometria).

## Resultado por tela (usuário ADMIN, após as correções)

Coluna "Celular" considera o resultado da rodada final; as ressalvas de rolagem horizontal listadas abaixo foram medidas **antes** da última correção de tabelas (commit "tabelas rolam na horizontal"), que eliminou as maiores (Banco de questões 376px, Jornadas/Gargalos 217px, Comunicação/Régua 197px) em verificação pontual; a rodada completa não foi repetida depois dela.

| Tela | Estados testados (abas) | Desktop | Celular | Observações |
|---|---|---|---|---|
| `/edu/financeiro` | 10 | OK | OK | - |
| `/edu/academico/alunos` | 1 | OK | OK | - |
| `/edu/academico/matrizes` | 1 | OK | OK | - |
| `/edu/academico/salas` | 6 | OK | OK | - |
| `/edu/academico/desenvolvimento` | 6 | OK | OK | - |
| `/edu/academico/pesquisa-extensao` | 5 | OK | OK | - |
| `/edu` | 3 | OK | OK | - |
| `/edu/minha-mesa` | 3 | OK | OK | - |
| `/edu/reitoria/agenda` | 1 | OK | OK | - |
| `/edu/reitoria/dou` | 4 | OK | OK | - |
| `/edu/reitoria/paineis` | 1 | OK | OK | - |
| `/edu/reitoria/convenios` | 1 | OK | OK | - |
| `/edu/reitoria/pessoas` | 1 | OK | OK | - |
| `/edu/reitoria/niveis` | 4 | OK | OK | - |
| `/edu/reitoria/comparativo` | 4 | OK | OK | - |
| `/edu/jornadas` | 3 | OK | ressalva | celular: rolagem horizontal em aba (217px) |
| `/edu/regulatorio` | 10 | OK | OK | - |
| `/edu/governanca` | 8 | OK | ressalva | celular: rolagem horizontal em aba (12px, 19px) |
| `/edu/identidade` | 1 | OK | OK | - |
| `/edu/admissoes` | 8 | OK | ressalva | 2 aviso(s) de console (React dev) · celular: rolagem horizontal em aba (25px) |
| `/edu/secretaria` | 6 | OK | OK | - |
| `/edu/calendario` | 9 | OK | OK | - |
| `/edu/notas` | 5 | OK | OK | - |
| `/edu/modalidades` | 6 | OK | OK | - |
| `/edu/desempenho` | 6 | OK | ressalva | celular: rolagem horizontal em aba (45px, 376px) |
| `/edu/biblioteca` | 7 | OK | OK | - |
| `/edu/presenca` | 7 | OK | OK | - |
| `/edu/pesquisa` | 4 | OK | ressalva | celular: rolagem horizontal em aba (15px) |
| `/edu/portal-aluno` | 14 | OK com ressalva | OK | API: GET /edu/notas/portal/meu-painel 400 |
| `/edu/inicio` | 1 | OK | OK | - |
| `/edu/portal-professor` | 10 | OK | OK | - |
| `/edu/minha-biometria` | 1 | OK | OK | - |
| `/edu/apoio` | 6 | OK | ressalva | celular: rolagem horizontal em aba (41px, 14px) |
| `/edu/comunicacao` | 8 | OK | ressalva | 2 aviso(s) de console (React dev) · celular: rolagem horizontal em aba (197px) |
| `/edu/infraestrutura` | 14 | OK | OK | - |
| `/edu/suprimentos` | 11 | OK com ressalva | OK | API: GET /edu/suprimentos/caixa/atual 404 |
| `/edu/atendimento` | 9 | OK | OK | - |
| `/edu/juridico` | 15 | OK | OK | - |
| `/edu/rh` | 11 | OK | OK | 24 aviso(s) de console (React dev) |
| `/edu/cobranca` | 9 | OK | OK | - |
| `/edu/marketing` | 18 | OK | OK | 4 aviso(s) de console (React dev) |
| `/edu/lgpd` | 7 | OK | OK | - |
| `/edu/feedback` | 2 | OK | OK | - |
| `/edu/exames` | 2 | OK | OK | - |
| `/edu/campos-pratica` | 8 | OK | OK | - |
| `/edu/polos-ead` | 5 | OK | OK | - |
| `/edu/presenca/quiosque` | 3 | OK | OK | - |
| `/edu/ambientes` | 1 | OK | OK | - |
| `/edu/analise-docs` | 5 | OK | OK | - |

| Aluno: `/edu/portal-aluno` (14 abas), sala virtual do AVA (entrar na sala + 7 abas), ENADE/ENAMED/OAB (6 abas: simulados, flashcards, desempenho) | 30 | OK | OK | sem erro de API, sem texto ruim |
| Professor: portal, calendário, notas, presença, exames, desempenho, biblioteca, biometria | 47 | OK com ressalva | OK | 403 em painéis de gestão do calendário e da presença (ver pendências) |

## O que foi corrigido (commits pequenos na branch)

1. **Celular com rolagem horizontal em todas as telas** (46px): a barra superior estourava a largura (campo de busca sem `min-width:0`). Corrigido em `Header.tsx`.
2. **Grades de indicadores e barras que alargavam a página no celular** (Financeiro, Secretaria, Governança/PDI, Infraestrutura, Tesouraria): colunas `minmax(0,1fr)`, fonte responsiva nos números grandes, regra global de celular em `index.css` (cartões e tabelas rolam dentro do cartão em vez de alargar a página). Rolagem horizontal caiu de 772 de 786 estados para cerca de 12 (abas isoladas).
3. **Marca**: iniciais "DP" (DentalPos) no menu lateral e no avatar viraram "EM" no modo EduMaster; cupons de mídia offline "RAVELRADIO/RAVELOUT/RAVELFLY" no seed de Marketing viraram "EDURADIO/EDUOUTDOOR/EDUPANFLETO".
4. **Rota inexistente** `/campos-pratica/academico/class-sections` (404 em Campos de prática > Agro): a lista de turmas passou a usar `/academico/class-sections`.
5. **Admin sem vínculo com aluno/colaborador**: o Portal do Aluno agora abre o primeiro aluno de demonstração em vez de erro 400/"não vinculado"; `edu-demo-user.ts` vincula o usuário de apresentação a um colaborador do RH, eliminando 403/400 em Ponto, Férias e Avaliações (RH).
6. **Aluno e professor viam o menu inteiro de gestão**: o menu lateral agora filtra por perfil (aluno: portal, biometria, exames, início; professor: + biblioteca, portal do professor, calendário, notas, presença, desempenho). Também deixou de chamar `/pending-alerts` (403) para aluno/professor e `/procedure-durations` (rotina de clínica odontológica, 403) no modo EduMaster.
7. **Logomarca cortada** ("SUA INSTITUIÇ") em todas as telas: o SVG do seed principal tem texto maior que a largura. Criado `backend/scripts/seeds/marca.ts` (`seedMarca(api)`) com a logo corrigida; foi aplicado no banco de teste e conferido.
8. **React**: chave duplicada e `<div>` dentro de `<p>` em Admissões > Campanhas e ROI.

## Pendências (honestas)

- **Logo**: `edu-demo-seed.ts` (não editado por regra) ainda gera o SVG com texto cortado. Integrar `seedMarca` ao seed (ou trocar `viewBox` para 560 e `font-size` para 34 na linha do SVG). Sem isso, a demonstração recém-semeada mostra a logo cortada.
- Seed principal com falhas silenciosas: `PUT /edu/governanca/pdi-acoes/*` rejeita `gasto` enviado como texto (400; ações do PDI ficam sem gasto), registros clínicos de Campos de prática são rejeitados (403: coordenação não escreve registro clínico; o seed cai para o administrador e continua falhando), `POST /edu/calendario/gerador/aplicar` sem turma para períodos vazios (404, inofensivo).
- Telas com pouco dado de demonstração (vazias): Secretaria (documentos emitidos, diplomas, arquivo), Calendário (grade horária do período selecionado por padrão, reservas), Modalidades > Engajamento AVA e Tutoria, Reitoria > Pós lato/stricto (sem dados no período), Biblioteca > Repositório, Apoio > Bolsas, Atendimento > Documentos recebidos, Desempenho > Trilhas/Atividades dos professores, Regulatório > Simuladores e Análise por IA.
- Professor vê painéis de gestão no Calendário (conflitos, gerador, fila de reservas) e na Presença (biometria) que respondem 403; o servidor protege, mas a tela mostra aviso. Aluno também: `/edu/biblioteca` foi retirado do menu do aluno (a biblioteca dele está na aba do portal).
- Console: `<div>` dentro de `<p>` ainda em Comunicação, RH e Portal do Aluno (aviso só do React em desenvolvimento). `GET /edu/suprimentos/caixa/atual` responde 404 "Nenhum caixa aberto" (esperado, gera linha vermelha no console). Portal do Aluno para admin faz 1 chamada 400 antes de escolher o aluno automaticamente.
- Celular: o campo de busca do topo vira apenas um ícone (largura mínima); sobra rolagem horizontal pequena em abas isoladas (Governança CPA/NDE/Colegiados 12-31px, Admissões, Apoio, Pesquisa, Desempenho > Exames) medidas antes do último ajuste de tabelas; números grandes de outros KPIs (8 usos de `h4`) ainda sem fonte responsiva.
- Termos odontológicos: aparecem como cursos/clínica-escola legítimos (Odontologia, Endodontia, Implantodontia, equipamentos e fornecedores "DentalSupply"/"Odonto Supply", "Paciente" em Campos de prática e no banco de questões). Nenhuma menção a DentalPos, Revah, Jacad ou Clinicorp foi encontrada nas telas do EduMaster. Dados com nome "DentalSupply" podem ser renomeados se a universidade não for da área da saúde.
- Limite do teste: sub-abas aninhadas (por exemplo Atendimento > Protocolos > Visibilidade, Cobrança > Régua, Marketing > Canais) não foram percorridas pelo robô (o clique em abas muda a lista de abas); foram vistas apenas as abas do primeiro nível. Inglês solto: apenas o campo de mês nativo do navegador ("November 2026" no Ponto) e o nome de produto "Google Search".
- Não foi rodado o e2e do backend (as mudanças de backend são só de seeds/scripts); tsc limpo no backend e no frontend e build do frontend verde.
