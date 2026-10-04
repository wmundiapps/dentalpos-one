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
