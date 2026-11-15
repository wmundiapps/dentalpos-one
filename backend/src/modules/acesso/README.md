# Acesso por cargo — EduMaster Pro

A instituição define, por **cargo** (papel do sistema: `COORDINATOR`, `SECRETARY`, `FINANCE`, `TEACHER`, `STUDENT`...) e por **módulo** (1º segmento da rota `/api/edu/<modulo>`), um estado:

| Estado | Efeito |
|---|---|
| `PADRAO` | Comportamento atual: cada tela decide pelo seu próprio `requireRole`. |
| `BLOQUEAR` | `403` em **todo** o módulo para o cargo (`codigo: ACESSO_CARGO_BLOQUEADO`) e o módulo some do menu lateral. |
| `PERMITIR` | O cargo passa pelo `requireRole` das rotas de gestão do módulo. |

Modelo: `AcsRegra` (`prisma/edu/acesso.prisma`; SQL no bloco `ACS:BEGIN/END` de `prisma/manual-migrations/20261004_edumaster_pro.sql`), uma linha por `tenantId + cargo + modulo`, com quem alterou e quando. Cada mudança efetiva gera `audit()` (`modulo: acesso`, `REGRA_ALTERADA` com `de/para`, ou `MATRIZ_RESTAURADA`); repetir o mesmo estado não gera evento.

## Regras de segurança
* Cargos **SUPER** (`ADMIN`, `OWNER`, `RECTOR`, `BOARD`) nunca são bloqueados: a API recusa a regra (400) e o middleware ignora qualquer linha gravada à força no banco.
* Módulos **essenciais** (`core`, `acesso`) não aceitam regra (sustentam marca, avisos e a própria tela).
* Só `ADMIN`/`OWNER` editam; `RECTOR`/`BOARD` apenas leem.
* `PERMITIR` **não** afrouxa: rotas só de `STUDENT`/`TEACHER` (que checam o dono do dado no handler) nem rotas exclusivas da administração (`requireRole()` sem papéis).

## Como é aplicado
`modules/acesso/regras.ts` → `acessoPorCargo`, registrado em `edu.routes.ts` logo após `ambienteContext`. As regras do tenant ficam em cache de **30 s** (`TTL_CACHE_MS`) e o cache é invalidado ao salvar (vale na hora na instância que salvou; em várias instâncias, em até 30 s). `requireRole` (`academico/middleware.ts`) consulta `req.acessoConcedido`.
Se a leitura das regras falhar, o sistema segue no comportamento padrão e registra o erro (não derruba o acesso).

## Limites (honestos)
* **Módulos com checagem própria fora do `requireRole`** (ex.: papel conferido direto no handler ou por helper próprio como o do Jurídico/LGPD) só respeitam `BLOQUEAR`; `PERMITIR` não os abre.
* O módulo é o 1º segmento da rota: não há regra por tela/aba dentro do módulo, nem por usuário individual.
* O menu esconde itens pelo mapa `frontend/src/edu/acesso/modulos.ts` (rota do frontend → módulo); a proteção real é o 403 do backend. Itens do menu fora desse mapa não são ocultados.
* O catálogo de módulos (`catalogo.ts`) é manual: um módulo novo montado em `edu.routes.ts` só recebe regras depois de entrar no catálogo.
* Bloquear `STUDENT`/`TEACHER` em módulos usados pelos portais pode quebrar telas deles; use a pré-visualização “O que este cargo vê”.

## API (`/api/edu/acesso`)
`GET /catalogo`, `GET /matriz`, `PUT /regras` (uma célula ou `{alteracoes:[...]}`, até 600), `POST /restaurar-padrao` (`{cargo?}`), `GET /meus-modulos` (qualquer usuário: módulos bloqueados/permitidos do próprio cargo), `GET /previa/:cargo`, `GET /historico`.

## Tela e testes
Tela: **/edu/acesso-por-cargo** (Configurações > Acesso por cargo, só `ADMIN`/`OWNER`): matriz cargos × módulos com filtros, rascunho com “Salvar/Descartar”, “Restaurar padrão”, “O que este cargo vê” e auditoria; no celular escolhe-se um cargo por vez.
Seed: `scripts/seeds/acesso.ts` (`seedAcesso(api, ctx)`; rodar **por último**: ex. secretaria sem Financeiro, financeiro sem Jurídico). e2e: `DATABASE_URL=postgresql://postgres:pg@127.0.0.1:5432/acesso_e2e npx tsx scripts/e2e/acesso.ts` (após `prisma db push`).
