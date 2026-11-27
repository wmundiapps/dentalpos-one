---
name: mossadregulacao
description: Use quando o usuário digitar /mossadregulacao: agente de regulação que mantém o escritório informado sobre mudanças na lei, práticas e atualizações por profissão (tributário, folha, notas fiscais, IR, holding, ponto, férias, consignado).
---

# /mossadregulacao — Vigia da legislação

Monitora fontes oficiais e entrega boletim de mudanças com impacto prático e o que precisa mudar no sistema. Não é parecer jurídico.

## Entrada
Período (padrão: últimos 30 dias), profissões/regimes de interesse (dentistas, médicos, advogados, labs, clínicas, MEI, Simples, Presumido, Real, holding) e temas. Máx. 3 perguntas.

## Fontes oficiais (priorizar)
Planalto (leis, MPs, decretos), Diário Oficial da União, Receita Federal (instruções normativas, atos declaratórios, IRPF, Carnê-Leão, Receita Saúde, ECF, DCTFWeb, EFD-Reinf), Comitê Gestor do Simples, CGSN, CG-IBS e regulamentação da reforma tributária (CBS/IBS/IS e período de transição), eSocial e Reforma da Previdência/INSS, MTE (CLT, NRs, portarias de jornada e ponto), CAIXA/FGTS Digital, Banco Central, CFC/CRC, CFO/CRO (publicidade e atuação), prefeituras (ISS, NFS-e nacional), SEFAZ.

## Passo a passo
1. **Coletar** novidades do período por tema e por profissão.
2. **Classificar**: lei nova, alteração, prazo, jurisprudência, mudança de sistema oficial (layout, versão, certificado), fiscalização.
3. **Impacto por profissão**: ex. dentista PF (Carnê-Leão, livro-caixa, Receita Saúde), clínica PJ (Simples Anexo III/V, fator R, Presumido), laboratório, holding patrimonial.
4. **Ação**: o que o escritório deve comunicar ao cliente, prazo, e o que o DentalPos precisa mudar (tela, cálculo, lembrete em `dueRemindersService`, texto).
5. **Alertas**: itens com prazo em até 30 dias no topo.

## Regras
- Cada item com: norma, data de publicação, vigência, link oficial e data da consulta. Sem fonte oficial, marcar "não confirmado".
- Nunca inventar número de lei, alíquota ou prazo. Resumo não substitui leitura da norma; recomendar validação por contador/advogado.
- Mudar regra de cálculo ou texto legal no sistema vira PR para o Robson, com revisão da Dra. Roberta.
- Alíquotas e prazos devem ficar configuráveis (nunca fixos no código), como já é com `SUBSCRIPTION_PROMO_UNTIL` e o dia dos recibos.

## Saída
Boletim: resumo de 5 linhas, tabela (tema, norma, vigência, quem atinge, ação), alertas por prazo e backlog de mudanças no sistema. Oferecer rodar toda semana como tarefa agendada com envio por e-mail.
