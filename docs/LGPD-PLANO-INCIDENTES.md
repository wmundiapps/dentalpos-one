# Plano de Resposta a Incidentes de Segurança com Dados Pessoais

> **Modelo de apoio**, a ser aprovado pela direção e validado por advogado. Base: LGPD art. 48 e Resolução CD/ANPD nº 15/2024 (comunicação de incidente de segurança). Ferramenta no sistema: **Central LGPD → Incidentes**.

## 1. Quando este plano é acionado
Qualquer evento que cause acesso não autorizado, perda, alteração, divulgação ou indisponibilidade de dados pessoais: vazamento de planilha, conta invadida, dispositivo perdido, envio de e-mail ao destinatário errado, ransomware, falha de permissão, acesso indevido de colaborador, falha de operador/suboperador. **Na dúvida, registre.**

## 2. Papéis
| Papel | Responsabilidade |
|---|---|
| Qualquer colaborador | comunicar imediatamente ao encarregado/TI (canal: [e-mail/ramal]) |
| Encarregado (DPO) | coordena a resposta, avalia o risco, mantém o registro e comunica ANPD/titulares |
| TI / Segurança | contenção, evidências, erradicação, recuperação |
| Direção | decisões, recursos, comunicação institucional |
| Jurídico | enquadramento legal, texto das comunicações |
| Comunicação | atendimento a titulares e imprensa (somente com texto aprovado) |
| WMundi (operadora) | notificar a Instituição em até [24 h]; fornecer evidências |

## 3. O relógio: 3 dias úteis
O prazo para comunicar a **ANPD** e os **titulares afetados** (quando houver risco ou dano relevante) é de **3 dias úteis contados da ciência** do incidente. O sistema calcula o prazo ao registrar a "ciência" (sábados, domingos e feriados nacionais não contam — feriados locais devem ser considerados manualmente), cria alerta crítico e sinaliza "fora do prazo". **Registre a ciência assim que souber.**

## 4. Fluxo
| # | Fase | O que fazer | No sistema |
|---|---|---|---|
| 1 | Detecção e registro | Quem soube avisa o DPO; o DPO registra o incidente (o que, quando, quem, quantos) | Incidentes → Registrar; define severidade e ciência |
| 2 | Contenção (horas) | Isolar conta/sistema; revogar senhas, tokens e chaves; bloquear acessos; recolher cópia indevida; pedir exclusão ao destinatário | Evento "Contenção" na linha do tempo |
| 3 | Preservação de evidências | Guardar logs, e-mails, imagens de disco; não apagar nada; anotar quem manuseou | Checklist "Evidências" |
| 4 | Avaliação | Quais dados e quantos titulares? Há dados sensíveis ou de menores? Que dano pode ocorrer (fraude, discriminação, exposição, risco à segurança física)? Os dados estavam cifrados? | Campos de categorias/titulares; evento "Avaliação" |
| 5 | Decisão de risco | **Risco ou dano relevante?** Sim → comunicação obrigatória. Não → documentar a justificativa (obrigatória para encerrar) | "Reavaliar risco" |
| 6 | Comunicação à ANPD | Formulário da ANPD, em até 3 dias úteis. Se faltar informação, comunicar o que houver e complementar depois | "Registrar comunicação à ANPD" (guarda o protocolo) |
| 7 | Comunicação aos titulares | Linguagem simples, em até 3 dias úteis: o que houve, quais dados, riscos, o que a instituição fez, o que o titular pode fazer, contato do DPO | "Registrar comunicação aos titulares" |
| 8 | Erradicação e recuperação | Corrigir a causa, restaurar de backup, reforçar controles | Checklist |
| 9 | Pós-incidente | Causa raiz, plano de ação com prazos, revisar ROPA/RIPD, treinar equipe, ajustar contratos | "Encerrar" exige causa e medidas |
| 10 | Registro | Manter o registro por **mínimo 5 anos** | trilha e linha do tempo permanecem |

## 5. Critérios de severidade (sugestão)
| Severidade | Exemplos |
|---|---|
| Baixa | tentativa bloqueada; acesso indevido contido sem exposição de dados |
| Média | e-mail com poucos dados enviado a destinatário errado e já apagado |
| Alta | planilha com CPF/notas de muitos alunos exposta; conta administrativa invadida |
| Crítica | dados sensíveis/menores expostos; ransomware com exfiltração; base inteira acessada |
(Severidade **Crítica** marca automaticamente "risco relevante".)

## 6. Conteúdo mínimo da comunicação à ANPD
Descrição da natureza e das categorias de dados; número de titulares (inclusive menores); medidas técnicas e de segurança adotadas; riscos relacionados; motivos da demora (se houver); medidas para reverter ou mitigar; dados de contato do encarregado.

## 7. Modelo de comunicação aos titulares (adaptar)
> Assunto: Aviso sobre incidente de segurança envolvendo seus dados
> Em [data], identificamos [o que ocorreu, em linguagem simples]. Foram envolvidos os seguintes dados: [..]. Os riscos possíveis são [..]. Já tomamos as seguintes medidas: [..]. Recomendamos que você [ações práticas, ex.: desconfie de mensagens pedindo dados; troque a senha]. Dúvidas: encarregado [nome, e-mail, telefone]. Pedimos desculpas pelo ocorrido.

## 8. Exercícios e manutenção
Treinar a equipe anualmente e fazer um simulado (ex.: "planilha enviada por engano") medindo o tempo até o registro da ciência e até a comunicação. Revisar este plano a cada 12 meses ou após incidente relevante.

## 9. Contatos de emergência (preencher)
DPO: [..] · TI: [..] · Direção: [..] · Jurídico: [..] · WMundi suporte/segurança: [..] · ANPD: https://www.gov.br/anpd
