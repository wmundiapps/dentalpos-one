# Revisão jurídica por país — documentos pt-BR da SpaceHour

Data: 25/09/2026 · Escopo: `docs/legal/pt-BR/*.md` (12 documentos) · Fonte das regras de negócio: `shared/rules.ts` (RULES_VERSION 2026-09-24) e `shared/countries.ts`.

> **Aviso.** Esta revisão foi feita com o máximo cuidado possível, mas **não é parecer jurídico** e não substitui advogados habilitados em cada jurisdição. As referências legais refletem o conhecimento disponível até meados de 2026. Itens marcados como **[verificar]** têm confiança menor e devem ser confirmados antes da publicação. Nenhum documento deve ser publicado em um país sem a validação de advogado local e, para questões tributárias, de contador local.

## 1. Resumo executivo

1. **Parâmetros do código x lei:** em 7 países, o prazo de arrependimento do código (`withdrawalDays`, contado em dias corridos × 24 h) é **menos protetivo** que a lei: CO, UY e MX (5 dias úteis), CR (dias úteis), SV (contagem a verificar), EC (lei prevê 3 dias; código tem 0) e PY (possível direito, a verificar). Os documentos seguem o código, mas trazem nota expressa de que prevalece a lei local (country-rules 1.5 e marcas †; cancellation-refunds 4.2 e 4.3).
2. **Brasil (CDC, art. 49):** a lei não condiciona o arrependimento ao "não início" do serviço. Foi incluída a possibilidade de desistir das Ocorrências futuras de uma série (cancellation-refunds 4.6). O código não faz isso: o pedido é tratado manualmente pela Central.
3. **Correções factuais relevantes:** HIPAA (não se aplica à Plataforma); Chile, Ley 21.719 (vigência em 01/12/2026); México (nova LFPDPPP 2025 e extinção do INAI); Índia (TCS de 0,5%, TDS 194-O de 0,1%, DPDP Rules 2025, transição do DCI para a National Dental Commission); EUA (limite do 1099-K restabelecido em US$ 20.000/200 transações); UE (encerramento da plataforma ODR em 20/07/2025; função de retratação obrigatória desde 19/06/2026); Brasil (prazo de 3 dias úteis para comunicar incidentes à ANPD, Res. 15/2024, e RDC 611/2022 para raios X); Israel (Emenda 13 em vigor desde 14/08/2025).
4. **Novas obrigações identificadas:** preço total com taxas incluídas (*drip pricing*) no Reino Unido (DMCCA 2024), na Austrália (ACL), na Califórnia (SB 478) e na Índia (Dark Patterns Guidelines); Botón de arrepentimiento na Argentina; Livro de Reclamações Eletrónico em Portugal; médiateur de la consommation na França; informação do VSBG na Alemanha; Libro de Reclamaciones virtual no Peru; *platform reporting* no Reino Unido, no Canadá, na Austrália e na China.
5. **Decisões do proprietário incorporadas:** Mercado Pago e Stripe como processadores; pré-triagem de registro profissional por IA, confirmação pelo Anfitrião, exercício ilegal com exclusão e comunicação às autoridades; e-mails support@ e privacy@; regras de fotos; formulário de feedback.

## 2. Divergências entre código e lei (sugestões para `shared/countries.ts` / `rules.ts` — NÃO aplicadas)

| País / regra | Código atual | Recomendação |
|---|---|---|
| CO, UY, MX | `withdrawalDays: 5` em dias corridos | Contar em dias úteis locais (calendário de feriados) ou usar 7 dias corridos como aproximação conservadora |
| CR | `withdrawalDays: 8` em dias corridos | Contar em dias úteis ou usar ~11 dias corridos **[verificar a base legal exata]** |
| SV | `withdrawalDays: 8` | Confirmar a contagem legal |
| EC | `withdrawalDays: 0` | Parametrizar 3 dias (LODC, art. 45) |
| PY | `withdrawalDays: 0` | Verificar a Ley 1334/98 e a Ley 4868/2013; se houver direito, parametrizar |
| BR | Arrependimento só se `nothingStarted` | Permitir arrependimento parcial das Ocorrências futuras dentro de 7 dias (CDC, art. 49) |
| US | `dataProtectionLaw` menciona "HIPAA when handling health data" | Corrigir: HIPAA aplica-se a *covered entities/business associates* |
| US / CA | `minAge: 18` | Exigir maioridade estadual/provincial (19 em AL/NE e em várias províncias; 21 no MS) |
| IN | `dental: 'Dental Council of India'` | Incluir a National Dental Commission (NDC Act 2023) |
| DE | "Landeszahnärztekammer (Approbation)" | A Approbation é concedida pela autoridade estadual, e não pela Kammer |
| PY | `dataProtectionLaw: 'Legislación vigente…'` | Citar a Ley 6534/2020 e a nova lei geral **[verificar número e vigência]** |
| SV / BO / GT / HN | textos genéricos | Atualizar conforme country-rules.md |
| `HOST_CANCELLATION_PENALTIES` | Sempre gera *strike* e multa | Criar motivo "dúvida sobre habilitação" **sem multa e sem Advertência** (decisão do proprietário) e aplicar isenção a circunstâncias atenuantes |
| `PENALTIES` | Não há tipo `illegal_practice` | Criar o tipo (`severe: true`, exclusão imediata, comunicação às autoridades, sem prazo para o banimento); hoje ele é tratado como `unauthorized_activity` |
| Preço exibido | Taxa de Serviço somada no checkout | UK, AU, Califórnia e Índia exigem que o preço anunciado já inclua as taxas obrigatórias (payments 3.4). **Mudança de produto obrigatória antes do lançamento nesses mercados** |
| Função de retratação na UE | — | Implementar botão "Desistir/cancelar o contrato" com confirmação (Diretiva (UE) 2023/2673, art. 11a da Diretiva 2011/83) |
| Argentina | — | Link "Botón de arrepentimiento" na home (Res. SCI 424/2020) |

## 3. Riscos transversais (exigem advogado)

1. **Natureza jurídica "licença de uso" x locação:** a requalificação judicial é possível no BR (Lei 8.245/1991), na FR (bail professionnel), no DE (Mietvertrag), no UK (*lease* x *licence* — Street v Mountford) e em outros países, sobretudo em séries de 12 semanas. Os limites anti-longa duração ajudam, mas não eliminam o risco.
2. **Assimetria de cancelamento (Diretiva 93/13, Anexo, alíneas "d" e "e"; CDC, art. 51; ACL; Consumer Contract Act japonês, art. 9):** o Locatário pode perder até 100% do Valor Base (política Rígida, menos de 72 h), enquanto no cancelamento pelo Anfitrião recebe apenas o reembolso, sem compensação (a multa do Anfitrião não é repassada ao Locatário). Recomenda-se repassar ao Locatário ao menos parte da multa do Anfitrião e demonstrar que 0% de reembolso corresponde ao dano médio (o Espaço não é realocado). No Japão, o cancelamento de consumidor não pode exceder o "dano médio".
3. **Pré-triagem por IA:** RGPD, art. 22; LGPD, art. 20; Lei 25 do Québec (aviso de decisão automatizada); Austrália (transparência a partir de 10/12/2026); AI Act da UE (provavelmente não é alto risco, mas exige avaliação). Pontos a garantir: (i) revisão humana de qualquer resultado negativo; (ii) contrato com o fornecedor de IA proibindo treinamento com os documentos (privacy 3.2 afirma isso — **garantir contratualmente**); (iii) DPIA/RIPD; (iv) indicar o fornecedor na lista de suboperadores; (v) transferência internacional dos documentos.
4. **Comunicação de crime às autoridades:** comunicar apenas fatos **constatados**, com revisão humana, para evitar responsabilidade por denunciação caluniosa ou difamação (BR, CP, art. 339) e violação de dados pessoais. O texto já exige constatação e revisão humana (penalties 6.5 e 9.2).
5. **Transferência de responsabilidade ao Anfitrião:** exigir que o Anfitrião confirme a habilitação reduz o risco da Plataforma, mas pode não afastar responsabilidade solidária perante o consumidor (CDC, arts. 7º, parágrafo único, e 25) nem deveres de diligência (DSA, art. 30, para profissionais).
6. **Cobertura dos processadores:** a Stripe não aceita contas de plataforma nem faz repasses em todos os países listados. Confirmar: repasses internacionais do Stripe Connect para BO, PY, PA, CR, GT, SV, HN, NI, BZ, EC; China (CNY exige instituição licenciada local); Índia (Stripe em regime de convite desde 2024). Métodos listados que podem não estar disponíveis no processador escolhido: Interac online, Bit, BPAY, PayID, Wero, Bizum, PayPal via Stripe nos EUA, Webpay/PSE/Yape via Mercado Pago **[verificar]**.
7. **Regulação de pagamentos:** definir o fluxo de fundos (split do Mercado Pago / Stripe Connect) para que a Operadora não seja enquadrada como instituição de pagamento ou subcredenciador (BR, Lei 12.865/2013 e regulação do BCB), como *money transmitter* (EUA) ou como instituição de pagamento (UE, PSD2 — exceção de agente comercial).
8. **Fiança eletrônica:** é inválida na Alemanha para pessoa física (BGB, § 766), e na França exige menção de próprio punho ou eletrônica (Code civil, art. 2297). Implementar fluxo com assinatura ou restringir o Avalista nesses países.
9. **Online Safety Act 2023 (UK):** mensagens e avaliações entre usuários exigem avaliação de risco de conteúdo ilegal.
10. **Tributação da Taxa de Serviço na UE:** serviços de intermediação ligados a imóveis podem ser tributados no país do imóvel. Registro de IVA (One-Stop Shop não-UE para B2C; *reverse charge* em B2B) **[contador]**.
11. **Encarregado (LGPD):** a Res. CD/ANPD 18/2024 exige divulgar a identidade do encarregado (pessoa física ou jurídica), e não apenas o e-mail do cargo. Publicar o nome junto com privacy@space-hour.com.
12. **Retenção de feedback (3 anos)** e dos documentos da pré-triagem: prazos propostos nesta revisão, que devem ser validados pelo proprietário e pelo DPO.

## 4. Revisão por país

Legenda: **V** = verificado sem alteração; **C** = corrigido/acrescentado; **R** = risco residual (advogado local); **P** = item obrigatório antes do lançamento.

### Brasil (BR)
| Tipo | Item |
|---|---|
| V | LGPD; CDC, art. 49 (7 dias corridos); ISS 2–5% (LC 116/2003); idade de 18 anos; conselhos (CRO, CRM, CRP, OAB, CREFITO, CRN, CRMV); Marco Civil, art. 15 (6 meses); Res. ANPD 19/2024 (transferência internacional); consumidor.gov.br; Lei 9.307/96, art. 4º, § 2º; CDC, art. 51, VII; fiança (CC, arts. 818 e 828) |
| C | CBS/IBS 2026 (0,9%/0,1% em teste); Decreto 7.962/2013; CNES; RDC 611/2022 (raios X; substituiu a Portaria 453/98); RDC 50/2002 e 63/2011; CP, arts. 282–284; LCP, art. 47; Lei 8.906/94; incidente à ANPD em 3 dias úteis (Res. 15/2024); arrependimento parcial em séries; CDC, art. 31 (português); CC, arts. 412, 413 e 424; Súmula 332 do STJ; COREN em estética |
| R | Requalificação como locação; aplicabilidade do CDC a profissionais (teoria finalista mitigada); abusividade de 0% de reembolso (CDC, art. 51, IV); licença sanitária do "consultório compartilhado" (varia por município; alguns conselhos regulam o compartilhamento); responsabilidade solidária da plataforma (CDC, art. 7º); obrigatoriedade de cadastro no consumidor.gov.br (Portaria Senacon 15/2020) **[verificar]**; responsabilidade de plataforma no IBS/CBS (LC 214/2025) a partir de 2027 |
| P | CNPJ com CNAE de intermediação; inscrição municipal e emissão de NFS-e; nomeação e publicação da identidade do encarregado (Res. 18/2024); RIPD da pré-triagem por IA; contrato Mercado Pago (split); identificação da Operadora no site (Decreto 7.962/2013); preencher [RAZÃO SOCIAL], [CNPJ] e [ENDEREÇO] |

### Argentina (AR)
| Tipo | Item |
|---|---|
| V | Ley 25.326; Ley 24.240, art. 34 (10 dias corridos); IVA 21%; COPREC; Ventanilla Única |
| C | CCyC, arts. 1110–1116; AAIP e inscrição de bases; Botón de arrepentimiento (Res. SCI 424/2020); CP, arts. 208 e 247; ARCA (ex-AFIP); Ingresos Brutos; LDC, art. 37 |
| R | "Botón de baja" (Res. SC 316/2022 **[verificar]**); percepções de IVA/IIBB sobre serviços digitais; reforma da lei de dados em tramitação |
| P | Inscrição das bases na AAIP; botão de arrependimento; CUIT ou representação fiscal, se houver estabelecimento |

### Bolívia (BO)
| Tipo | Item |
|---|---|
| V | IVA 13%; Ley 453; CPE, art. 130 |
| C | Inexistência de lei geral de dados; Ley 164/2011 e DS 1793/2013; IT 3%; Ley 3131 (saúde); Ley 387 (advocacia) |
| R | Tipificação penal exata do exercício ilegal **[verificar]**; cobertura de repasses da Stripe; eventual tributação de serviços digitais |
| P | Confirmar o meio de repasse aos Anfitriões |

### Chile (CL)
| Tipo | Item |
|---|---|
| V | IVA 19%; Ley 19.496 (retracto de 10 dias); SERNAC; Superintendencia de Salud |
| C | Vigência da Ley 21.719 em 01/12/2026 e nova Agencia; art. 3º bis "b" (antes da prestação); art. 16; SEREMI; CP, art. 313 a; Ley 21.210 (IVA digital) |
| R | Contagem do prazo de retracto após a Ley 21.398 **[verificar]**; adequação à Ley 21.719 (bases legais, DPO voluntário, modelo de prevenção) |
| P | Programa de conformidade com a Ley 21.719 antes de 01/12/2026; registro no SII para o IVA de serviços digitais, se aplicável |

### Colômbia (CO)
| Tipo | Item |
|---|---|
| V | Ley 1581/2012; Ley 1480, art. 47 (5 días hábiles); IVA 19%; ReTHUS; SIC |
| C | Nota † (dias úteis); reversión del pago (art. 51); REPS (Res. 3100/2019); SEP (Ley 2277/2022); RNBD; Decreto 1074/2015 |
| R | Tipificação penal do exercício ilegal (Ley 1164/2007) **[verificar]** |
| P | Inscrição no RNBD (se superar o limite de ativos); RUT para IVA de serviços digitais; política de tratamento de dados em espanhol |

### Equador (EC)
| Tipo | Item |
|---|---|
| V | IVA 15%; LOPDP 2021 |
| C | **LODC, art. 45 — devolução em 3 dias** (código com 0; prevalece a lei); Reglamento LOPDP 2023; Superintendencia; Foro de Abogados; permiso de funcionamiento |
| R | Aplicabilidade do art. 45 a serviços com data marcada; obrigação de nomear delegado de proteção de dados |
| P | Avaliar a nomeação de DPO (LOPDP, art. 48); parametrizar 3 dias |

### Paraguai (PY)
| Tipo | Item |
|---|---|
| V | IVA 10%; Ley 1334/98; SEDECO |
| C | Ley 6534/2020; Ley 1682/2001; Ley 4868/2013 |
| R | **Nova lei geral de proteção de dados (número e vigência) [verificar]**; possível direito de desistência (Ley 1334, art. 26 / Ley 4868) **[verificar]** |
| P | Confirmar o regime de dados e a desistência antes do lançamento |

### Peru (PE)
| Tipo | Item |
|---|---|
| V | Ley 29733; Ley 29571; IGV 18%; INDECOPI; colégios |
| C | DS 016-2024-JUS (inscrição de bancos de dados, oficial de dados); Libro de Reclamaciones virtual; RENIPRESS; CP, art. 363; DL 1623 (IGV sobre serviços digitais desde 01/10/2024) |
| R | Enquadramento da Plataforma como sujeito do IGV digital |
| P | Libro de Reclamaciones virtual; inscrição de bancos de dados na ANPD; avaliar oficial de dados |

### Uruguai (UY)
| Tipo | Item |
|---|---|
| V | Ley 18.331; Ley 17.250, art. 16 (5 días hábiles); IVA 22% |
| C | Nota †; Ley 19.670, art. 40; URCDP; habilitação MSP |
| R | Obrigatoriedade de encarregado |
| P | Inscrição das bases na URCDP |

### Panamá (PA)
| Tipo | Item |
|---|---|
| V | Ley 81/2019; Ley 45/2007; ITBMS 7%; idoneidad |
| C | DE 285/2021; ANTAI; Ley 51/2008; MINSA |
| R | Existência de direito de retracto em e-commerce **[verificar]**; repasses pela Stripe |
| P | Registro de tratamento, se exigido pela ANTAI |

### Costa Rica (CR)
| Tipo | Item |
|---|---|
| V | Ley 8968; Ley 7472; IVA 13%; colégios |
| C | Nota † (dias úteis); PRODHAB e inscrição de bases; permiso sanitario |
| R | Base exata do retracto de 8 dias (Reglamento DE 37899-MEIC) **[verificar]** |
| P | Inscrição das bases de dados com fins comerciais na PRODHAB |

### Guatemala (GT)
| Tipo | Item |
|---|---|
| V | Decreto 006-2003; IVA 12%; DIACO |
| C | Inexistência de lei geral de dados (Decreto 57-2008 aplica-se ao setor público); colegiação obrigatória |
| R | Direito de retracto em vendas fora do estabelecimento **[verificar]** |
| P | Repasses pela Stripe |

### El Salvador (SV)
| Tipo | Item |
|---|---|
| V | IVA 13%; Defensoría del Consumidor |
| C | Ley de Protección de Datos Personales (2024); DL 776/2005; CSSP/Juntas de Vigilancia |
| R | **Contagem do retracto de 8 dias e regulamentação da lei de dados [verificar]** |
| P | Adequação à nova lei de dados |

### Honduras (HN)
| Tipo | Item |
|---|---|
| V | Decreto 24-2008; ISV 15% |
| C | Hábeas data (art. 182); Ley de Transparencia; colegiação |
| R | Sem lei geral de dados; repasses |
| P | Repasses pela Stripe |

### Nicarágua (NI)
| Tipo | Item |
|---|---|
| V | Ley 787; Ley 842; IVA 15%; DIPRODEC |
| C | Registro no MINSA |
| R | Cobertura de pagamentos e sanções internacionais (verificar listas OFAC/UE para contrapartes) |
| P | Triagem de sanções |

### Belize (BZ)
| Tipo | Item |
|---|---|
| V | GST 12,5%; Data Protection Act 2021 |
| C | Belize Medical and Dental Council; General Legal Council; canal Belize Bureau of Standards **[verificar]** |
| R | Data de início de vigência da DPA 2021 e obrigação de registro no Information Commissioner **[verificar]** |
| P | Repasses pela Stripe |

### México (MX)
| Tipo | Item |
|---|---|
| V | IVA 16%; LFPC, art. 56 (5 días hábiles); PROFECO/Concilianet; cédula SEP; COFEPRIS |
| C | Nova LFPDPPP (DOF 20/03/2025) e extinção do INAI; aviso de privacidad; Cap. III Bis e LISR, arts. 113-A–113-D; CPF, art. 250; espanhol obrigatório; LFPC, art. 90; licencia sanitaria para raios X |
| R | **Alíquotas de retenção de ISR/IVA vigentes em 2026 e novas obrigações de acesso do SAT em tempo real (reforma de 2026) [verificar com contador]**; se a cessão por hora é "uso o goce temporal de inmuebles" (alíquota de retenção de hospedaje) ou serviço; registro do contrato de adesão na PROFECO (LFPC, art. 86), se aplicável |
| P | Inscrição no RFC como plataforma estrangeira, com representante legal e domicílio fiscal; aviso de privacidad; retenções configuradas no Mercado Pago/sistema |

### Estados Unidos (US)
| Tipo | Item |
|---|---|
| V | FTC Act; ADA Title III; state boards; ausência de direito geral de arrependimento online |
| C | HIPAA corrigida; leis estaduais além do CCPA; Washington MHMDA; SB 478 (Califórnia); 1099-K de US$ 20.000/200 (OBBBA 2025) e limites estaduais; W-9/W-8 e *backup withholding*; maioridade 19/21; FTC Rule on Reviews (16 CFR 465) |
| R | Sales tax sobre a taxa da plataforma e regras de *marketplace facilitator* por estado; limites de aplicabilidade do CCPA; leis de "junk fees" de outros estados (MN, CO, VA etc.); cláusula de arbitragem/renúncia a *class action* (os documentos não a impõem — decisão comercial); acessibilidade do site (ADA) |
| P | EIN/entidade nos EUA ou Stripe Connect *cross-border*; preço total exibido na Califórnia; W-9 no onboarding; avaliação de *money transmitter* (usar Stripe como *payment facilitator*) |

### Canadá (CA)
| Tipo | Item |
|---|---|
| V | PIPEDA; Law 25; GST 5% / HST 13–15% / QST 9,975%; *colleges* provinciais |
| C | Bill 96 (francês primeiro no contrato de adesão); PIPA de Alberta e da Colúmbia Britânica; cancelamento de *internet agreements* sem as divulgações obrigatórias; maioridade 19; Reporting Rules for Digital Platform Operators; leis profissionais (RHPA, Code des professions) |
| R | Nova CPA de Ontário (2023) — data de vigência **[verificar]**; registro de GST/HST de não residente |
| P | Tradução integral para o francês (Québec) **antes** do aceite; responsável pela proteção de dados pessoais do Québec (publicar cargo e contato); PIA para transferências fora do Québec; *platform reporting* à CRA |

### União Europeia — itens comuns (PT, ES, IT, FR, DE)
| Tipo | Item |
|---|---|
| V | RGPD; Diretiva 2011/83 (14 dias e exceção do art. 16, "l"); Diretiva 93/13; DSA; DAC7 |
| C | DSA, arts. 17, 20, 21 e 30; P2B 2019/1150; Omnibus 2019/2161 (informar se o Anfitrião é profissional, ordenação, verificação de avaliações); **Diretiva 2023/2673 (função de retratação a partir de 19/06/2026)**; Ato Europeu de Acessibilidade (28/06/2025); encerramento da plataforma ODR (20/07/2025) |
| R | Consumidor x profissional (a maioria dos Locatários é profissional); simetria de cancelamento (Anexo 93/13); natureza "alojamento não residencial/lazer" para excluir o direito de desistência; AI Act |
| P | **Representante na UE — RGPD, art. 27, e DSA, art. 13** (se não houver estabelecimento na UE); registro DAC7 em um Estado-Membro; registro de IVA (One-Stop Shop não-UE ou nacional); acessibilidade EAA; ponto único de contato (DSA, arts. 11 e 12); avaliação de DPO (RGPD, art. 37; na Alemanha, BDSG, § 38, a partir de 20 pessoas); DPIA da pré-triagem por IA |

### Portugal (PT)
| Tipo | Item |
|---|---|
| V | Lei 58/2019; DL 24/2014 (art. 17); IVA 23%; ordens; ERS |
| C | IVA 22% na Madeira e 16% nos Açores; DL 127/2014; DL 446/85; Lei 144/2015; Livro de Reclamações Eletrónico; CP, art. 358; língua portuguesa |
| R | Adaptação do pt-BR ao português europeu (recomendável, não obrigatória) |
| P | **Livro de Reclamações Eletrónico**; informação sobre entidade RAL no site e nos termos; NIF |

### Espanha (ES)
| Tipo | Item |
|---|---|
| V | LOPDGDD; TRLGDCU (art. 103); IVA 21%; RD 1277/2003; colégios |
| C | Arts. 82–91 (cláusulas abusivas); CP, art. 403 (intrusismo); Catalunha (Ley 22/2010 — catalão); Ley 13/2023 (DAC7); LO 1/2025 (tentativa prévia de solução consensual); Juntas Arbitrales |
| R | Obrigação de oferecer atendimento em línguas cooficiais; *hojas de reclamaciones* online por comunidade |
| P | NIF; versões em espanhol (e catalão, quando aplicável) |

### Itália (IT)
| Tipo | Item |
|---|---|
| V | Codice Privacy; Codice del Consumo (art. 59); IVA 22%; ordens; autorização regional |
| C | D.Lgs. 101/2018; arts. 33–38; art. 9 (italiano); D.Lgs. 502/1992, art. 8-ter; CP, art. 348; D.Lgs. 32/2023 (DAC7) |
| R | Mediação obrigatória (D.Lgs. 28/2010) em certas matérias contratuais **[verificar]** |
| P | Partita IVA ou identificação para fins de IVA; versão em italiano |

### França (FR)
| Tipo | Item |
|---|---|
| V | Loi Informatique et Libertés; L221-28; TVA 20%; ordres; ERP |
| C | **Loi Toubon**; L111-7 (deveres das plataformas); art. 242 bis do CGI; médiateur de la consommation (L612-1); exercício em local secundário (R.4127-85 / R.4127-270); CSP, L4161-1; CP, art. 433-17; SignalConso |
| R | Migração dos psicólogos do ADELI para o RPPS; *cautionnement* (art. 2297) |
| P | **Adesão a um médiateur de la consommation**; mentions légales (LCEN); versão integral em francês; SIRET/identificação de IVA |

### Alemanha (DE)
| Tipo | Item |
|---|---|
| V | DSGVO/BDSG; BGB, §§ 312g e 355; USt. 19%; Impressum (DDG) |
| C | TDDDG; § 312j (botão "zahlungspflichtig buchen"); VSBG; Approbation estadual; Heilpraktikergesetz; StGB, § 132a; **BGB, § 766 (fiança eletrônica inválida)**; PStTG (DAC7); Berufsordnung (outros locais de atendimento) |
| R | Controle de AGB (§§ 307–309) sobre penalidades percentuais e limitação de responsabilidade (§ 309, n. 7) |
| P | Impressum; informação do VSBG; botão de pedido conforme o § 312j; fluxo de Avalista com assinatura manuscrita ou exclusão do Avalista pessoa física |

### Reino Unido (GB)
| Tipo | Item |
|---|---|
| V | UK GDPR/DPA 2018; CRA 2015; CCRs 2013 (reg. 28); VAT 20%; GDC, GMC, HCPC, SRA/BSB; CQC |
| C | Data (Use and Access) Act 2025; PECR; **DMCCA 2024 (preço total, avaliações falsas)**; reguladores da Escócia, do País de Gales e da Irlanda do Norte; Law Society of Scotland/NI; Medical Act, s. 49; Dentists Act, ss. 38–39; Platform Operators Regulations 2023; Online Safety Act |
| R | *Licence* x *lease*; *unfair terms* (CRA, Part 2) |
| P | **Taxa ao ICO (registro obrigatório)**; representante no Reino Unido (UK GDPR, art. 27) se não houver estabelecimento; registro de VAT de não estabelecido; *platform reporting* ao HMRC; avaliação de risco do Online Safety Act; preço total nas buscas |

### Emirados Árabes Unidos (AE)
| Tipo | Item |
|---|---|
| V | PDPL 45/2021; DIFC DPL 2020; Law 15/2020; VAT 5%; DHA/DoH/MOHAP |
| C | ADGM DPR 2021; Cabinet Resolution 66/2023; Decree-Law 14/2023 (comércio eletrônico); DHCA; Federal Law 5/2019; árabe; Dubai DET |
| R | **Regulamento executivo da PDPL ainda pendente [verificar]**; possível redução da maioridade civil pela nova lei de transações civis (2025) **[verificar]** — a Plataforma mantém 21 anos (mais restritivo) |
| P | **Trade licence** (e-commerce, DET ou *free zone*); TRN (VAT); versões em árabe; conta da Stripe em entidade dos EAU, se exigido |

### Israel (IL)
| Tipo | Item |
|---|---|
| V | Privacy Protection Law + Emenda 13; CPL, art. 14C (14 dias); VAT 18%; MoH/Israel Bar |
| C | Vigência da Emenda 13 (14/08/2025); Data Security Regulations 2017; Cancellation Regulations 2010 (tarifa de 5%/100 ILS); hebraico; PPA |
| R | Obrigação de DPO pela Emenda 13; registro de bases (reduzido pela Emenda 13) |
| P | Versão em hebraico; avaliar DPO |

### China (CN)
| Tipo | Item |
|---|---|
| V | PIPL, DSL, CSL; Consumer Rights Law; E-Commerce Law; VAT 6%; 12315 |
| C | Network Data Security Management Regulations 2025; Lei do IVA (01/01/2026); regulamento de 2024 da Consumer Rights Law; 7 dias só para bens; E-Commerce Law, art. 31 (3 anos); **Regulamento 810 (informação fiscal de plataformas, 01/10/2025)**; 医疗机构执业许可证/诊所备案; Lei de Saúde Mental, art. 51 (psicoterapia só em instituição médica); CP, art. 336 |
| R | **Operação inviável sem entidade local**; Stripe não opera repasses em CNY; controle de conteúdo |
| P | Entidade local (WFOE ou JV); ICP 备案 e/ou licença EDI; representante (PIPL, art. 53); avaliação de segurança ou contrato-padrão de transferência de dados; armazenamento local; parceiro de pagamento licenciado (Alipay/WeChat Pay/UnionPay); oficial de proteção de dados (se acima de 1 milhão de indivíduos) |

### Japão (JP)
| Tipo | Item |
|---|---|
| V | APPI; 特定商取引法 (表記); consumo 10%; licenças do MHLW; 診療所開設届; 18 anos |
| C | **Consumer Contract Act, art. 9 (dano médio)**; tela final de confirmação; 医師法/歯科医師法, art. 17; 弁護士法, art. 72; Telecommunications Business Act; linha 188; fiança (arts. 446 e 465-2) |
| R | Orientações do MHLW sobre clínicas compartilhadas por hora ("時間貸し") **[verificar]**; necessidade de 電気通信事業届出 e representante doméstico |
| P | 特商法表記 completo (nome, endereço, telefone, responsável); registro para a nota fiscal (適格請求書) se aplicável; avaliar a notificação do Telecommunications Business Act |

### Índia (IN)
| Tipo | Item |
|---|---|
| V | DPDP Act 2023; CPA 2019; E-Commerce Rules 2020; GST 18%; RBI e-mandates; NMC; BCI; RCI |
| C | **DPDP Rules 2025 (implantação gradual)**; IT Act, s. 43A/SPDI no período de transição; **TCS de 0,5% (desde 10/07/2024)**; **TDS 194-O de 0,1% (desde 01/10/2024)**; Dark Patterns Guidelines 2023; National Dental Commission Act 2023; NCAHP; Clinical Establishments Act 2010; NMC Act, s. 34; Advocates Act, s. 45; prazos do *grievance officer*; tokenização de cartões |
| R | Stripe India em regime de convite; RBI PA-CB; datas exatas de vigência das DPDP Rules **[verificar]** |
| P | **Grievance officer residente (nome e contato publicados)** e *nodal person*; GSTIN (obrigatório para recolher TCS); TAN para TDS; processador de pagamento licenciado no RBI; preço total |

### Austrália (AU)
| Tipo | Item |
|---|---|
| V | Privacy Act/APPs; ACL; GST 10%; Ahpra; ausência de *cooling-off* online |
| C | POLA Act 2024 (transparência de decisões automatizadas a partir de 10/12/2026; *statutory tort*); **cláusulas injustas ilegais desde 09/11/2023, inclusive para pequenas empresas**; *component pricing*; *sharing economy reporting regime*; National Law, ss. 113–116; licenças de *day procedure* e radiação |
| R | Reforma da isenção de pequenas empresas do Privacy Act; proibição geral de práticas comerciais desleais em estudo |
| P | Registro de GST de não residente (se acima de A$ 75 mil); comunicação à ATO; preço total nas buscas; revisão de cláusulas injustas (políticas Moderada/Rígida) |

## 5. Lista de itens obrigatórios antes do lançamento (consolidada)

1. Constituir a Operadora e preencher [RAZÃO SOCIAL DA OPERADORA], [CNPJ] e [ENDEREÇO]; definir o foro (terms 16.3).
2. Publicar a **identidade** do encarregado/DPO (BR, Res. 18/2024) e avaliar a obrigatoriedade de DPO no RGPD, no BDSG, na LOPDP (EC), no Peru, no Uruguai, em Israel e na China.
3. **Representantes locais:** UE (RGPD, art. 27, e DSA, art. 13), Reino Unido (UK GDPR, art. 27), China (PIPL, art. 53, e entidade local), Índia (*grievance officer* e *nodal person*), Québec (responsável pela proteção de dados), México (representante e domicílio fiscal).
4. **Licenças e registros:** EAU (*trade licence*, TRN); China (ICP/EDI); Reino Unido (taxa ao ICO); bases de dados na AAIP (AR), no RNBD (CO), na URCDP (UY), na PRODHAB (CR) e na ANPD do Peru.
5. **Tributos/relatórios:** DAC7 (registro em um Estado-Membro), HMRC, CRA, ATO, 1099-K/W-9, RFC e retenções no México, GSTIN/TCS/TDS na Índia, IVA digital (CL, CO, PE, AR, PY, CR), NFS-e e IBS/CBS no Brasil.
6. **Produto:** preço total com taxas (UK, AU, Califórnia, Índia); função de retratação (UE); Botón de arrepentimiento (AR); Libro de Reclamaciones virtual (PE); Livro de Reclamações Eletrónico (PT); médiateur (FR); Impressum e botão do § 312j (DE); 特商法表記 (JP); versões em francês (FR/Québec), árabe e hebraico; acessibilidade (EAA/ADA).
7. **Pagamentos:** contratos com Mercado Pago e Stripe (Connect); confirmação da cobertura de repasses por país; fluxo de fundos sem custódia pela Operadora.
8. **Pré-triagem por IA:** RIPD/DPIA, contrato com o fornecedor (sem treinamento, localização dos dados), fluxo de revisão humana e registro das confirmações dos Anfitriões.
9. **Código:** ajustes da seção 2 (arrependimento em dias úteis, EC 3 dias, cancelamento do Anfitrião sem penalidade por dúvida sobre habilitação, tipo `illegal_practice`).
10. Revisão final de cada tradução por advogado local, com remoção da "Nota interna" dos Termos.

## 6. Seções alteradas (para os tradutores das outras 10 línguas)

Em **todos os 12 arquivos**, a linha de versão passou a ser "Versão 2026-09-25 · Vigência a partir de 25/09/2026".

| Arquivo | Seções alteradas |
|---|---|
| terms.md | 1.1 (domínios); 4.1 (Mercado Pago/Stripe; dados de cartão); 5.2 (maioridade local); 5.3; **6.5, 6.6, 6.7 (novas: pré-triagem por IA, não garantia, exercício ilegal)**; 6.3 (e-mail); 7.1 (fotos); 17.4 (idiomas obrigatórios); 18.2 e 18.3 (e-mails) |
| booking-rules.md | 3.1(f); 8.1 (reescrita: "pré-triagem"); **8.4, 8.5, 8.6, 8.7 (novas)**; 12.2 (e-mail) |
| cancellation-refunds.md | 4.2 (tabela: notas de dias úteis, AR, CL, UE, IL, nova linha Equador); 4.3 (reescrita); **4.6 e 4.7 (novas)**; 7.4 (isenção por dúvida sobre habilitação) |
| country-rules.md | **Reescrito integralmente**: 1.4, 1.5 e 1.6 alteradas; 1.7, 1.8 e 1.9 novas; nova linha "Processador" em todas as tabelas de países; linhas e observações alteradas em todas as seções 2.1 a 8.1; 3.0 nova; 5.0 reescrita; tabela 9 com colunas novas e nota † |
| host-obligations.md | 3.1 (lista ampliada: (a), (b), (f), (g) e novas (j) a (m)); **3.4, 3.5, 3.6 (novas)**; 5.2 (fotos, reescrita); 11.2 (lista ampliada: (a) a (g)); 14.1 |
| space-norms.md | 6.1; 6.1(f); **17 (nova seção: 17.1 a 17.4)** |
| penalties.md | 2.1 (nova linha "Exercício ilegal de profissão"); 6.2; **6.5 (nova)**; 7 (duas novas linhas na tabela); 8.1 (itens (a) a (g) reescritos); 9.2 |
| privacy.md | 1.3 (DPO e representantes); **1.5 (nova)**; 2 (tabela: linhas Profissionais, Anúncios e Pagamentos alteradas; nova linha Feedback); 2.1; **2.2 e 2.3 (novas)**; 3 (tabela: linha de verificação alterada; duas novas linhas); **3.2 e 3.3 (novas)**; 4.3 (processadores); 4.4; 5.1; 5.2; 6 (tabela: duas novas linhas); 7.2; 7.4; 11.1; 11.2; 12.1 |
| payments.md | **1.3, 1.4, 1.5 (novas)**; 3.4; 4.2; 7.3; **7.4 (nova)**; 13.3 |
| disputes.md | 2.1(a); 2.2 (nova linha na tabela); 6.4; 7.1 (tabela: AR, CO, PE, UK, AE, IL, JP e IN alteradas; novas linhas Belize, Portugal, Espanha, França, Alemanha e Itália); 8.1 (reescrita); **8.2 (nova)**; 11.1 (e-mail) |
| guarantor-deposit.md | 6.5 (outorga conjugal, Súmula 332 e formalidades por país (a) a (d)); 7.4 (e-mail do DPO) |
| reviews.md | 10.2 (reescrita); **10.3 (nova)** |
