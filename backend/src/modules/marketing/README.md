# Módulo Marketing e Captação (prefixo `Mkt`)

Calendário de campanhas, geração de leads e funil integrado a Admissões, canais de disparo (simulados), mídia offline, gerador de peças com IA,
site/landing pages, atendimento com IA, eventos, indicação premiada e **conformidade LGPD**. Estende `comunicacao` (opt-in/opt-out) e `admissoes` (funil).
Autenticado: `/api/edu/marketing`. Público: `/api/public/edu/marketing`. Schema: `prisma/edu/marketing.prisma` (31 modelos, sem relações com outros módulos; SQL aditivo no bloco `MKT:BEGIN/END` de `prisma/manual-migrations/20261004_edumaster_pro.sql`).
Seed: `scripts/seeds/marketing.ts` (`seedMarketing(api, ctx)`). E2E: `scripts/e2e/marketing.ts` (330+ verificações).

## Papéis
Leitura: MARKETING, ADMISSIONS, COORDINATOR, SECRETARY, FINANCE (+ ADMIN/OWNER/RECTOR/BOARD). Escrita: MARKETING (ADMISSIONS/SECRETARY atuam em leads, atendimentos e supressão). Aprovação de campanhas, publicações e peças: COORDINATOR e papéis de gestão — **quem criou não aprova** (exceto ADMIN/OWNER/RECTOR/BOARD). Contato/CPF de leads são mascarados para quem não é do marketing/admissões. Tudo filtrado por `tenantId`.

## Regras de conformidade (compliance.ts) — valem para TODOS os canais
Todo envio (disparo, cadência, lembrete, envio avulso, **inclusive os adiados**, reavaliados na hora de sair) passa por `checarEnvio`:
1. **Lista de supressão global** (`MktSupressao`, só hash + máscara): descadastro por link de 1 clique, `SAIR/PARAR/STOP` recebido em qualquer canal, pedido do titular/atendente, importação ou bounce definitivo. Suprime **todos os identificadores** conhecidos da pessoa (e-mail, telefone...), cancela envios agendados/cadências e propaga o opt-out para `ComPreferencia`/LGPD. Bloqueia até mensagens transacionais.
2. **Opt-out da Comunicação** (`ComPreferencia` consentimento=false) vence qualquer opt-in.
3. **Opt-in obrigatório** para finalidade `MARKETING` (consentimento do formulário/landing/evento, preferência na Comunicação, candidato com `consentimentoMarketing` ou consentimento LGPD ativo). `TRANSACIONAL` (atendimento solicitado, lembrete de evento) dispensa opt-in, nunca a supressão.
4. **Limites de frequência** por pessoa (dia/semana, somando canais) e **janela de horário** (Brasília): fora dela o envio fica `AGENDADO` para a próxima janela.
5. Rodapé de descadastro (`/descadastro/:token`, POST sem login) em todas as mensagens; SMS/WhatsApp também orientam "responda SAIR".
Reativar exige justificativa (≥15 caracteres, auditada) ou novo opt-in explícito do titular. **Prova de consentimento** (`MktConsentimento`): texto exibido, versão, hash, origem, URL, hash do IP/UA, revogação. Importação de listas só habilita marketing com base legal + comprovante. Relatório: `/conformidade/painel` e `/conformidade/relatorio.csv`.

## Endpoints principais (autenticados)
| Área | Rotas |
|---|---|
| Painéis | `GET /painel`, `/painel/{funil,canais,campanhas,conversao,editorial,disparos}`, `POST /painel/sincronizar`, `GET /relatorios/:tipo[?formato=csv]` (canais, campanhas, consultores, funil, publicacoes, disparos) |
| Campanhas | CRUD `/campanhas`; `POST /campanhas/:id/{enviar-aprovacao,aprovar,rejeitar,ativar,pausar,concluir,cancelar,vincular-admissoes}`; `/custos` (orçamento realizado); `GET /calendario?visao=mes\|semana&canal&curso&publico&vestibularId` |
| Leads | `/leads` (+ `/importar`, `/:id/{etapa,atribuir,eventos,candidato}`, `/sincronizar-admissoes`, `/leads-export.csv`), `/formularios`, `/consultores`, `/scoring/regras`, `/cadencias` |
| Disparos | `/segmentos`, `/disparos` (+ `/previa`, `/:id/{executar,cancelar}`), `/envios`, `/provedores`, `/publicacoes` (redes: aprovação, agendamento, publicar) |
| Offline | `/midia-offline` (+ `/:id/insercoes`), `/midia-offline-relatorio` |
| IA | `POST /ia/gerar`, `/ia/imagem`, `/pecas` (biblioteca, aprovação), `/marca` |
| Site | `/site`, `/paginas` (+ `publicar`/`despublicar`), `/atendimentos` (+ `/entrada` simula canal, `/:id/{responder,assumir,encerrar}`) |
| Eventos / incentivos | `/eventos` (+ `publicar`, `inscricoes`, `checkin`, `lembretes`), `/programas` (+ `indicadores`, `ranking`), `/indicacoes` |
| LGPD | `/conformidade/{painel,supressao,supressao/importar,supressao/:id/remover,verificar,consentimentos,prova/:leadId,relatorio.csv}`, `/config` |

Públicos: `GET /site/:slug`, `/site/:slug/paginas/:pagina`, `/site/:slug/html/:pagina` (HTML de SEO no servidor), `/site/:slug/sitemap.xml`, `POST /site/:slug/formularios/:form/enviar`, `/site/:slug/simulador`, `/site/:slug/chat`, `GET /site/:slug/eventos`, `POST /site/:slug/eventos/:evento/inscricao`, `GET /r/:token` (QR/URL curta), `GET|POST /descadastro/:token`. Rate limit por IP + honeypot (`MKT_RATE_LIMIT_OFF=1` só para testes).
Páginas do frontend: `/edu/marketing?secao=...` (autenticado), `/site/:slug/:pagina?` e `/descadastro/:token` (públicas).

## Leads, atribuição, scoring e funil
- Captura em formulários/landing/evento/atendente/importação/indicação/cupom. Dedupe por e-mail/telefone (novo toque vira evento). Origem por `utm_source`/`utm_medium`, cupom (mídia offline) ou escolha; campanha por `utm_campaign`. Origens: site, Instagram, Facebook, LinkedIn, TikTok, Threads, Google Ads, Twilio/ligação, WhatsApp, e-mail, rádio, TV, outdoor, panfletagem, convênios (empresa/colégio/prefeitura), indicação, evento, balcão.
- **Scoring** (`logic.ts`, regras ajustáveis em `/scoring/regras`): soma de eventos (captura, origem, telefone, curso, abriu/clicou, respondeu, simulou mensalidade, evento...), 0–100; QUENTE ≥ 60, MORNO ≥ 30.
- **Distribuição**: consultor ativo com menor carga ponderada (filtra por curso/origem); SLA do 1º contato (`slaPrimeiroContatoMin`).
- **Admissões**: todo lead cria um `AdmCandidato` LEAD (com UTM e consentimento); `sincronizarAdmissoes` (botão, job e a cada consulta) leva INSCRITO/MATRICULADO/DESISTENTE de volta ao funil e importa candidatos do vestibular que não vieram do marketing. Matrícula grava a receita (mensalidade × parcelas da oferta, ou `ticketMedio`).
- **Custos e ROI**: CPL, custo por inscrito, CAC e ROI por canal (custos lançados + mídia offline + eventos) e por campanha.

## Provedores (simulados)
`providers.ts`: interface `ProvedorCanal` (EMAIL, SMS, TELEGRAM, WHATSAPP, VOZ) e `ProvedorRede` (INSTAGRAM, FACEBOOK, LINKEDIN, TIKTOK, THREADS). Sem credenciais tudo é **simulado** (registro com `simulado=true`, `externalId sim-...`). Destinos com "bounce" simulam rejeição definitiva (gera supressão) e "falha" simula erro transitório. Para um provedor real: `registrarProvedor()/registrarProvedorRede()` — as verificações de conformidade já rodam antes. IA: `services-ai/client.ts` (sem chave → geração/atendimento determinísticos, marcados como simulados; imagens são SVG com a marca).

## Jobs (`registerEduJob`)
`marketing.disparos-e-envios` (disparos agendados + envios adiados), `marketing.cadencias`, `marketing.publicacoes`, `marketing.lembretes-eventos`, `marketing.sync-admissoes`.

## Limites honestos
Sem envio real, ligações, publicação em redes ou geração de imagem por IA sem credenciais; textos de consentimento e bases legais são modelos a validar com advogado/DPO; o QR de presença é validado por token (a leitura por câmera fica a cargo do dispositivo — há campo manual); a atribuição é "último toque" por lead (eventos de toque ficam na linha do tempo).
