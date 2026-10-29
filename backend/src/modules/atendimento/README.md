# Central de Atendimento ao Aluno (`/api/edu/atendimento`)

Estende `modules/secretaria` (protocolos, verificação pública, histórico acadêmico) e `modules/comunicacao` (contatos, conversas, canais, consentimento) sem duplicá-los. Modelos Prisma com prefixo **Atd** em `backend/prisma/edu/atendimento.prisma` (migration em `manual-migrations/20261004_edumaster_pro.sql`, bloco `ATD:BEGIN/END`). O módulo `apoio/atendimento.ts` continua sendo o agendamento clínico/psicopedagógico do NAE; a Central cobre a demanda geral.

## O que existe
| Área | Rotas (resumo) |
|---|---|
| Caixa única omnichannel | `GET/POST /atendimentos`, `/:id/mensagens` (resposta ou `nota:true`), `assumir`, `atribuir`, `distribuir`, `transferir`, `resolver`, `reabrir`, `avaliacao` (CSAT), `POST /canais/simular-entrada`, `POST /atendimentos/importar-conversa` |
| Filas, SLA, distribuição | `/setores` (+ `/membros`), SLA por setor × prioridade, distribuição `MANUAL | RODIZIO | MENOR_CARGA` com capacidade |
| Painéis | `/painel/atendente`, `/painel/gestor` (SLA, TMR/TMA, CSAT, IA, canais, setores, equipe) |
| Protocolo e jornada | `/protocolos` (nº `ANO/SEQ`, código de rastreio), `/avancar`, `/concluir` (deferir/indeferir), `/cancelar`, `/pendencias`, `/etapas-config` (visibilidade por instituição) |
| Documentos recebidos | checklist por serviço, upload (passa pelo `uploadGuard` global), `/documentos/:id/conferir` (aprova/rejeita → pendência com prazo), `/documentos-recebidos` |
| Rastreio público (sem login) | `GET /api/public/edu/atendimento/rastreio/:codigo`, `POST .../notificacoes` (opt-out), `GET/POST .../avaliacao/:token`, `GET .../conhecimento/:instituicao` |
| IA | `/conhecimento` (FAQ por instituição), `/ia/config`, `/ia/uso`, `/ia/lgpd`, `/ia/testar`, sugestão/resumo/classificação por atendimento, `/portal/assistente` |
| Emissão | `/modelos-documento`, `/documentos-emitidos` (+ `/pdf`, `/segunda-via`, `/revogar`, `/cancelar`) |
| Autoatendimento | `/servicos` (catálogo), `/portal/servicos`, `/portal/solicitar`, `/portal/protocolos…`, `/portal/chat`, `/portal/documentos…` |

Papéis: atendem `SUPPORT, SECRETARY, ADMISSIONS, FINANCE, COORDINATOR, STAFF` (+ ADMIN/OWNER/RECTOR/BOARD); gestão (catálogo, setores, IA, modelos, revogação, isenção de taxa) = `SUPPORT, SECRETARY` + super; portal = `STUDENT`. Tudo filtrado por `tenantId`.

## Regras importantes
- **Canais simulados**: sem credenciais em *Comunicação > Canais* a resposta fica `ENVIADA_SIMULADA` (nunca finge entrega). Com canal WhatsApp/e-mail configurado, a mensagem vai para a caixa de saída real da Comunicação. Ver `canais.ts` (interface `CanalProvider`).
- **IA** (`ia.ts`): sem `ANTHROPIC_API_KEY` usa o motor SIMULADO local (ranking da base de conhecimento + regras de classificação). Com chave, usa `services-ai/client.ts`. Resposta automática só com confiança ≥ mínimo configurado (padrão desligada); abaixo disso, escalona e deixa a sugestão como nota interna. **LGPD**: identificadores (CPF, CNPJ, e-mail, telefone, cartão, RA, nomes) são mascarados antes de qualquer provedor; texto com dado sensível (saúde, deficiência, menores, biometria…) nunca é enviado e vai a humano; o registro `AtdIaUso` guarda só hash e contagens.
- **Jornada**: cada serviço define suas etapas; a instituição escolhe quais são visíveis (`AtdEtapaConfig`). Etapa oculta não aparece no portal, no rastreio público nem gera notificação. Notificações respeitam opt-out (`AtdProtocolo.notificar` e `ComPreferencia`), com destino mascarado no registro.
- **Rastreio público**: código imprevisível (12 caracteres, alfabeto sem ambíguos), rate limit por IP, `Cache-Control: no-store`; expõe só serviço, nº do protocolo, nome mascarado, etapas visíveis e datas — sem CPF, e-mail, telefone, documentos nem notas internas.
- **Emissão**: PDF próprio sem dependências (`pdf.ts` + `qr.ts`, QR validado contra a biblioteca `qrcode`) com número `DOC-ANO-SEQ`, código de verificação e SHA-256. A verificação pública reaproveita `secretaria/verificacao.ts` (estendido). **Assinatura ICP-Brasil = interface** (`AssinaturaProvider` em `emissao.ts`); a implementação padrão é SIMULADA e o PDF/verificação avisam que não tem validade jurídica. 2ª via substitui o original; revogação/cancelamento exigem motivo e são auditados.
- **Autoatendimento**: serviço com automação e sem documentos exigidos resolve na hora (`EMITIR_DOCUMENTO`, `SEGUNDA_VIA_BOLETO`, `CONSULTA_FINANCEIRA`); `TRANCAMENTO` abre jornada e, ao deferir, tranca a matrícula. Taxa > 0 gera `AccountReceivable`; a automação roda quando o recebível está `PAGO` (`sincronizar-taxa`) ou após isenção pela gestão.

## Como ver na demo
Seed: `import { seedAtendimento } from './seeds/atendimento'` (ou `npx tsx scripts/seeds/atendimento.ts` após o seed acadêmico). Login `admin@ravel.edu.br / Ravel@2026` → menu **EduMaster · Atendimento**. Aluno (`aluno@ravel.edu.br`) → Portal do Aluno › **Serviços e atendimento**. Página pública: `/rastreio?c=<código>` (o código aparece no protocolo).

## Testes
`DATABASE_URL=postgresql://USER:PASS@127.0.0.1:5432/BANCO_LOCAL npx tsx scripts/e2e/atendimento.ts` (300+ verificações; usa só banco local).
