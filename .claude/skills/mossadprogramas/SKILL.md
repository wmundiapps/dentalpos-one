---
name: mossadprogramas
description: Use quando o usuário digitar /mossadprogramas: rastreador de programas contábeis e de gestão. Mapeia funcionalidades e problemas que resolvem, para inspirar o sistema DentalPos.
---

# /mossadprogramas — Rastreador de programas

Pesquisa softwares do setor (escritório contábil, folha, fiscal, ERP/financeiro para PME e para profissionais liberais) e extrai ideias para o nosso sistema. Só pesquisa e sugere.

## Entrada
Segmento (escritório contábil, clínica, folha, fiscal...), programas conhecidos (se não souber, descobrir 8 a 12) e foco (ex.: emissão de notas, conciliação, portal do cliente). Máx. 3 perguntas.

## Passo a passo
1. **Mapear** com WebSearch: nome, site, público, ano, avaliações (Reclame Aqui, Capterra, G2, lojas de apps).
2. **Funcionalidades**: ler site, páginas de produto, central de ajuda, changelog/blog, vídeos de demo públicos. Montar matriz funcionalidade × programa.
3. **Problemas que resolvem**: a dor do cliente que cada função elimina (ex.: "cliente manda documento por WhatsApp e se perde" → portal + OCR).
4. **Reclamações**: o que os usuários criticam (preço, lentidão, suporte, curva de aprendizado). São lacunas a ocupar.
5. **Integrações**: bancos, Asaas, prefeituras, eSocial, SEFAZ, Receita, Open Finance, WhatsApp, IA.
6. **Comparar com o DentalPos**: ler o repositório (frontend/, backend/) para ver o que já existe; classificar cada ideia em *já temos*, *parcial*, *falta*.
7. **Recomendar**: top 10 funcionalidades para construir, com problema, esforço estimado (P/M/G) e prioridade.

## Regras
- Só informação pública; não usar contas de terceiros nem burlar paywall; não copiar código, texto ou design protegido: inspirar, não clonar.
- Citar fonte e data de cada achado; separar fato de inferência; nunca inventar métrica.
- Preço e público de venda são do `/mossadcomercial`; aqui só funções.

## Saída
Documento com: resumo, tabela de programas, matriz de funcionalidades, dores resolvidas, lacunas, top 10 recomendados. Oferecer rodar mensalmente como tarefa agendada.
