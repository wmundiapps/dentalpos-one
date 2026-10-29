# Módulo infraestrutura (prefixo Inf) — `/api/edu/infraestrutura`

Papéis: G = FACILITIES (+ADMIN/OWNER/RECTOR/BOARD sempre); L = leitura (FACILITIES, COORDINATOR, FINANCE, SUPPLIES, SECRETARY); AUTH = qualquer autenticado.

## Models (25)
InfSequencia, InfCategoriaBem, InfBem, InfMovimentacaoBem, InfInventario, InfInventarioItem, InfPlanoPreventivo, InfOrdemServico, InfOsPeca, InfChamado, InfChamadoComentario, InfProjeto, InfProjetoEtapa, InfAreaEstacionamento, InfVaga, InfVeiculo, InfAcessoEstacionamento, InfOcorrenciaEstacionamento, InfReservaArea, InfRegraUso, InfPontoLuz, InfMedidor, InfLeitura, InfAcaoEficiencia, InfRequisitoCurso.

## Endpoints
- Bootstrap: POST /bootstrap (G); GET /modelos-checklist (L)
- Patrimônio: CRUD /categorias-bem (L/G); POST /bens (G); GET /bens, /bens/:id, /bens-por-tombamento/:tomb (L); PATCH /bens/:id (G); POST /bens/:id/{transferir,estado,baixar,reativar} (G); GET /bens/:id/depreciacao, /bens/:id/etiqueta (L); POST /etiquetas (L); GET /relatorios/patrimonio?format=html (L)
- Inventário: POST /inventarios (G); GET /inventarios, /inventarios/:id (L); POST /inventarios/:id/{contagem,fechar,cancelar} (G)
- Manutenção: CRUD /planos-preventivos; POST /planos-preventivos/:id/gerar-agora (G); POST /ordens-servico (G); GET /ordens-servico(/:id) (L); PATCH /ordens-servico/:id, /:id/checklist (G); POST /ordens-servico/:id/{pecas,status} (G); DELETE /ordens-servico/:id/pecas/:pecaId (G); GET /historico-manutencao?bemId|spaceId (L)
- Chamados: POST /chamados, GET /chamados/meus, GET /chamados/:id, POST /chamados/:id/{comentarios,fechar,reabrir,cancelar} (AUTH, dono ou gestão); GET /chamados (L); POST /chamados/:id/{atender,gerar-os,resolver} (G)
- Melhorias: POST/PATCH /projetos (G/COORDINATOR); GET /projetos, /projetos/painel, /projetos/:id (L); POST /projetos/:id/{status (G),evidencias,etapas}; PATCH/DELETE /etapas/:id
- Estacionamento (/estacionamento/...): CRUD areas, vagas, veiculos, ocorrencias; POST areas/:id/vagas-lote; POST veiculos/:id/credencial; POST acessos/entrada|saida (G/SUPPORT/STAFF); GET acessos, ocupacao; POST ocorrencias/:id/resolver; GET relatorios/ocupacao
- Pátio: CRUD /regras-uso (leitura AUTH); POST /reservas (AUTH); GET /reservas (L), /reservas/minhas, /reservas/agenda, /reservas/disponibilidade (AUTH); POST /reservas/:id/decidir (G), /reservas/:id/cancelar (dono/G)
- Iluminação/energia: CRUD /iluminacao/pontos; POST /iluminacao/pontos/:id/reportar (AUTH, abre chamado), /substituir (G); GET /iluminacao/resumo; CRUD /medidores; POST|GET /medidores/:id/leituras; GET /consumo; CRUD /acoes-eficiencia
- Adequação: CRUD /requisitos-curso; POST /requisitos-curso/copiar; GET /adequacao, /adequacao/:programId?vagas=&format=html; POST /adequacao/:programId/gerar-projetos
- GET /indicadores?de&ate (L)

## Jobs (registerEduJob)
infra.planos-preventivos, infra.os-vencidas, infra.projetos-atrasados, infra.reservas, infra.estacionamento, infra.energia-iluminacao

## Exportado para outros módulos (routes.ts)
calcularAdequacao, calcularIndicadores, abrirChamado, criarOrdemServico, depreciacaoDoBem, depreciacaoLinear. Funções puras em calc.ts (selftest: `npx tsx src/modules/infraestrutura/__selftest__.ts`).

---
# Patrimônio — etiquetas, fotos, responsabilidade e inventário por QR (extensão; modelos `Cpp*`)
Testes: `scripts/e2e/compras-patrimonio.ts`. Seed: `scripts/seeds/compras-patrimonio.ts`. Autotestes dos geradores: `npx tsx src/modules/infraestrutura/etiquetas/selftest.ts` (gera PDF/SVG e matrizes; os códigos foram decodificados com zxing-cpp: QR v2–v13 e Code 128 conferidos).

## Etiquetas (`etiquetas/qr.ts`, `code128.ts`, `pdf.ts`, `render.ts`)
QR Code ISO 18004 (modo byte, correção M, versões 1–15, máscaras avaliadas) e Code 128 (B/C automático) **gerados sem dependências**, em SVG, **PDF vetorial** (Helvetica/WinAnsi) e HTML imprimível com `@page`. O QR contém `EDU:BEM:<tombamento>`; o leitor também entende o QR antigo (JSON `INF_BEM`), URL e o código de barras cru (`POST /leitura/interpretar`).
- `GET|POST|PUT|PATCH|DELETE /etiquetas/layouts` (CRUD; GESTAO escreve) — formato `A4_COLUNAS` (colunas x linhas, margens, espaços) ou `ROLO` (1 etiqueta por página do tamanho exato), campos `instituicao|codigo|nome|departamento|local|responsavel|categoria`, QR à esquerda/direita, fonte, borda, padrão; validação de que cabe no A4. `POST /etiquetas/layouts-predefinidos/instalar` (A4 3 colunas 63,5x33,9; A4 2 colunas; rolo 60x30; rolo 100x50).
- `POST /etiquetas/gerar {layoutId|layout, formato: pdf|svg|html|json, ids|spaceId|categoriaId|departamentoId|responsavelUserId, copias, pularPosicoes, pagina}` — lote (até 2.000), cabeçalhos `X-Total-Paginas/X-Total-Etiquetas`. `GET /bens/:id/etiqueta-svg`.
## Fotos
`POST /bens/:id/fotos {nome, dataUrl, legenda, principal}` (máx. 12 por bem, 1,5 MB cada porque o corpo JSON da API é limitado; o front reduz a imagem no aparelho), **varredura `scanUpload` (só imagem; executável disfarçado e SVG com script são barrados, 422)**; `GET /bens/:id/fotos`, `GET /fotos-bem/:id/arquivo` (nosniff + CSP sandbox), `PATCH /fotos-bem/:id`, `POST /fotos-bem/:id/principal`, `DELETE /fotos-bem/:id`. `InfBem.fotoPrincipalId` aponta para a principal.
## Localização, departamento e responsável
`InfBem.departamentoId` (cadastro, filtro e `/bens/:id/transferir`). `GET /localizacoes` (prédio=bloco > andar > sala, com contagem). **Termo de responsabilidade**: `POST /bens/:id/termos`, `GET /termos`, `POST /termos/:id/aceitar|recusar` (somente o próprio responsável; aceite grava data, IP e hash), `/encerrar`, `GET /termos/:id/documento`, `GET /meus-bens`. **Transferência com aceite**: `POST /transferencias` (local/departamento/responsável; troca de responsável exige o aceite dele, prazo da política, job `cpp:transferencias-expiradas`), `/aceitar` (atualiza o bem, grava `InfMovimentacaoBem`, encerra o termo anterior e emite o novo), `/recusar`, `/cancelar`; `GET /bens/:id/historico`; `GET /relatorios/responsabilidade[?format=html]`. A baixa do bem encerra termos e cancela transferências pendentes.
## Inventário físico por QR
`POST /inventarios/:id/leitura {payload, spaceId?, estado?}` (CONTADO/RECONTADO/SOBRA/BAIXADO/NAO_RECONHECIDO), `POST /inventarios/:id/leituras-lote` (offline, até 500), `GET /inventarios/:id/leituras|divergencias`, `POST /inventarios/:id/itens/:itemId/decidir {acao: AJUSTAR_LOCAL|MANTER|BAIXAR|INVESTIGAR|REGULARIZAR, motivo}` (após fechar), `GET /inventarios/:id/relatorio[?format=html|csv]`.
## Limites
Sem OCR/leitura de QR no servidor (a câmera usa `BarcodeDetector` do navegador; leitor USB e digitação funcionam em qualquer um). A etiqueta não inclui logotipo. Fonte do PDF é a Helvetica padrão (sem fontes embutidas).
