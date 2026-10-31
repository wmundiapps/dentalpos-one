# Campanha Black Friday — DentalPos

**Oferta:** 30 dias grátis (cartão cadastrado no início, cobrança só depois dos 30 dias) + 50% de desconto nos 12 meses seguintes. Sem fidelidade: cancela quando quiser.
**Validade da oferta:** cadastros até 31/12/2026 (o sistema mostra um contador na página de cadastro). Black Friday é 27/11 e Cyber Monday 30/11.
**Link de destino:** `https://app.dentalpos.com.br/cadastro` (cadastro com cartão e teste de 30 dias, já no ar neste repositório).
**Planos com 50%:** Basic R$ 98,50 · Intermedium R$ 198,50 · Plenum R$ 298,50 por mês (de R$ 197 / 397 / 597).

## Conferir antes de colocar no ar
1. O cadastro com cartão, os 30 dias de teste, a cobrança automática com 50% por 12 meses e o cancelamento já estão no sistema (`/cadastro`). Antes de anunciar, faça 1 cadastro de teste em ambiente de testes do Asaas (ASAAS_ENV=SANDBOX) e confira a primeira cobrança.
2. "Centenas de processos automatizados": confirme o número que você quer sustentar. Os textos dizem "centenas", sem número exato.
3. Texto de oferta é comunicação comercial. Mostre à Dra. Roberta se quiser validar as regras do desconto (quem é elegível, o que acontece no mês 13).

## Gravuras (pasta `marketing/black-friday/`)
Feed/Instagram/Facebook = `*-feed.png` (1080×1080). Stories, Reels e TikTok = `*-stories.png` (1080×1920).

| Nº | Arquivo | Mensagem |
|---|---|---|
| 1 | `01-oferta` | 30 dias grátis e 50% off por 12 meses |
| 2 | `02-automatico` | Centenas de processos rodando sozinhos |
| 3 | `03-whatsapp` | Use o WhatsApp do seu consultório |
| 4 | `04-documentos` | Papelaria e documentos inclusos |
| 5 | `05-migracao` | Migração automática simples |
| 6 | `06-ultimas-horas` | Oferta acaba em 31/12 |

Para regerar: `cd marketing/black-friday && node gerar.mjs`.

---

# BLOCO 1 — Instagram e Facebook (Meta)

## Estrutura
- **Campanha:** objetivo **Cadastros** (Leads) ou **Vendas** se o pixel do cadastro estiver instalado.
- **Conjunto 1 — Dentistas:** Brasil, 25–60 anos, interesses: Odontologia, Cirurgião-dentista, Clínica odontológica, CRO. Orçamento R$ 40/dia.
- **Conjunto 2 — Remarketing:** quem visitou o site ou interagiu com Instagram/Facebook nos últimos 30 dias. R$ 20/dia.
- **Anúncios:** cada gravura vira um anúncio. Feed → posicionamentos Feed; Stories → Stories e Reels.

## Textos principais (cole no campo "Texto principal")

**Anúncio 1 (oferta)**
```
BLACK FRIDAY DENTALPOS 🖤

30 dias grátis. A cobrança só começa depois do teste e você cancela quando quiser, sem fidelidade.
E 50% de desconto nos 12 meses seguintes.

Agenda, prontuário, financeiro, estoque e retorno de pacientes em um só sistema.

Válido até 31/12. Teste agora.
```

**Anúncio 2 (automação)**
```
Quantas tarefas da sua clínica dependem de alguém lembrar de fazer?

No DentalPos, centenas de processos rodam sozinhos: lembrete de consulta, aviso de retorno, cobrança de atraso, relatórios. Você só configura uma vez.

Menos dependência de funcionário. Mais tempo para atender.

30 dias grátis e 50% off por 12 meses na Black Friday.
```

**Anúncio 3 (WhatsApp)**
```
Mensagem para o paciente saindo do SEU número.

No DentalPos você configura o WhatsApp do próprio consultório e o sistema envia confirmações, lembretes e avisos de retorno. O paciente reconhece o número e responde.

Teste 30 dias grátis. Black Friday: 50% off por 12 meses.
```

**Anúncio 4 (documentos)**
```
Receita, atestado, termo, contrato, orçamento.

A papelaria e a documentação já vêm inclusas no DentalPos. Você não paga por documento novo, nunca.

30 dias grátis + 50% de desconto por 12 meses até 31/12.
```

**Anúncio 5 (migração)**
```
Medo de trocar de sistema e perder tudo?

A migração do DentalPos é automática e simples. Seus pacientes e histórico vêm junto, sem digitar nada de novo.

Teste 30 dias grátis. Black Friday: 50% off por 12 meses.
```

**Anúncio 6 (últimos dias — de 15/12 a 31/12)**
```
ÚLTIMOS DIAS ⏳

30 dias grátis, 50% de desconto por 12 meses e migração automática.
A oferta acaba em 31/12.
```

**Campos fixos de todos:** Título: `DentalPos Black Friday` · Descrição: `30 dias grátis · 50% off` · Botão: **Cadastre-se** · URL: link de destino.

## Passo a passo (Meta)
1. Entre em **business.facebook.com** e confirme sua conta de anúncios e a página/Instagram da clínica conectados.
2. Em **Gerenciador de Eventos**, confirme o pixel no site (se não houver, use objetivo Tráfego).
3. **Gerenciador de Anúncios → Criar → Campanha → Cadastros** (ou Vendas).
4. Crie o **Conjunto 1** com o público acima, posicionamentos **Advantage+**, orçamento diário R$ 40, início 16/11, fim 31/12.
5. Crie os anúncios: **Imagem**, envie o arquivo `-feed` para Feed e o `-stories` para Stories/Reels (personalize posicionamento), cole o texto e a URL.
6. Duplique o conjunto para o **Remarketing** trocando o público.
7. **Publicar.** A análise leva até 24h, então envie com 2 dias de folga.
8. Depois de 3 dias, pause os 2 anúncios com menor taxa de cadastro e coloque o orçamento nos melhores.

---

# BLOCO 2 — Google Ads

## Estrutura
- **Campanha:** Rede de Pesquisa, objetivo **Leads**, orçamento R$ 50/dia, Brasil, português.
- **Grupos de anúncios:** (a) sistema para dentista, (b) software para clínica odontológica, (c) prontuário odontológico.

## Palavras-chave (correspondência de frase)
```
"sistema para dentista"
"software odontológico"
"sistema para clínica odontológica"
"prontuário odontológico online"
"programa para consultório odontológico"
"agenda para dentista"
"sistema odontológico com whatsapp"
"migrar sistema odontológico"
```
**Negativas:** `grátis download`, `crackeado`, `curso`, `vaga`, `emprego`, `pdf`.

## Títulos (máx. 30 caracteres — cole os 12)
```
DentalPos: 30 dias grátis
50% off por 12 meses
Black Friday DentalPos
Sistema para Dentistas
Processos 100% automáticos
Use o WhatsApp da clínica
Documentos sem custo extra
Migração automática
Cobrança só após 30 dias
Gestão para Clínica Odonto
Agenda e Prontuário Online
Oferta até 31/12
```

## Descrições (máx. 90 caracteres)
```
30 dias grátis e 50% de desconto por 12 meses. Migre seus dados sem digitar nada.
Centenas de processos automáticos. Configure uma vez e o sistema trabalha por você.
WhatsApp do seu consultório, receitas e documentos inclusos. Sem custo por documento.
Cobrança só após os 30 dias. Sem fidelidade, cancele quando quiser. Até 31/12.
```

## Extensões (ativos)
- **Sitelinks:** "Planos e preços", "Migração automática", "Falar no WhatsApp", "Entrar".
- **Frases de destaque:** `Sem fidelidade`, `Migração automática`, `Documentos inclusos`, `WhatsApp do consultório`.
- **Imagens:** use as `-feed.png`.

## Passo a passo (Google)
1. Entre em **ads.google.com** com a conta da empresa.
2. **Campanhas → Nova campanha → Leads → Pesquisa.**
3. Meta de conversão: **Envios de formulário/Cadastro**. Se ainda não existir, crie em **Metas → Conversões** (tag no site ou importe do Google Analytics).
4. Lance: **Maximizar conversões**; orçamento R$ 50/dia; local Brasil.
5. Crie os 3 grupos, cole palavras-chave, títulos, descrições e URL final.
6. Adicione as extensões e as palavras negativas.
7. Datas: início 16/11, fim 31/12. **Publicar.**
8. Após 1 semana, em **Termos de pesquisa**, adicione como negativas as buscas que não têm a ver.

---

# BLOCO 3 — TikTok

## Vídeos (15–25 s, vertical). Grave no celular com a tela do sistema e sua voz, ou use os `-stories.png` como fundo.

**Vídeo 1 — "Funcionário faltou?"** (gancho de automação)
- 0–3 s (fala): "Funcionário faltou e a agenda virou bagunça?"
- 3–12 s (tela): lembretes, confirmações e retornos saindo sozinhos.
- 12–20 s: "No DentalPos centenas de processos rodam sozinhos. Você só configura."
- 20–25 s: "30 dias grátis e 50% off por 12 meses. Link na bio."

**Vídeo 2 — "Seu número no WhatsApp"**
- 0–3 s: "Seu paciente responde mais se vem do SEU número."
- 3–15 s (tela): configurando o WhatsApp do consultório.
- 15–25 s: "DentalPos. Black Friday, 30 dias grátis. Link na bio."

**Vídeo 3 — "Trocar de sistema sem dor"**
- 0–3 s: "Não troca de sistema por medo de perder os dados?"
- 3–15 s: migração automática acontecendo.
- 15–25 s: "Documentos inclusos, sem custo por documento. 30 dias grátis."

**Legenda (copiar):**
```
Black Friday DentalPos: 30 dias grátis + 50% off por 12 meses. Automação, WhatsApp do seu consultório, documentos inclusos e migração automática. Link na bio. #dentista #odontologia #clinicaodontologica #gestaoodontologica #blackfriday
```

## Passo a passo (TikTok)
1. Crie conta em **ads.tiktok.com** (TikTok Ads Manager) e conecte o perfil comercial da clínica.
2. Instale o **TikTok Pixel** no site (Ferramentas → Eventos), se for medir cadastros.
3. **Campanha → objetivo Geração de leads** (ou Conversões).
4. Público: Brasil, 25–55 anos, interesses em Saúde e Odontologia; orçamento diário R$ 30.
5. Anúncio: envie o vídeo (ou o `-stories.png`), cole a legenda, botão **Cadastre-se**, URL do destino.
6. Para impulsionar um vídeo já postado: **Spark Ads** (publique o vídeo orgânico, gere o código e use no anúncio).
7. Datas 16/11 a 31/12. **Enviar** (análise até 24h).

---

# BLOCO 4 — WhatsApp (mensagens para lista e status)

**Mensagem 1 — convite (envio individual ou lista de transmissão de quem já pediu contato)**
```
Olá, Dr(a). {nome}! Aqui é do DentalPos.

Na Black Friday liberamos 30 dias grátis (a cobrança só começa depois do teste e não há fidelidade) e 50% de desconto nos 12 meses seguintes.

✔ Centenas de processos automáticos, sem depender de funcionário
✔ Use o WhatsApp do seu consultório
✔ Papelaria e documentos inclusos
✔ Migração automática do seu sistema atual

Quer testar? Cadastro em: https://app.dentalpos.com.br/cadastro
```

**Mensagem 2 — lembrete (3 dias depois, só quem não respondeu)**
```
Dr(a). {nome}, a oferta de Black Friday do DentalPos vai até 31/12. São 30 dias grátis e 50% off por 12 meses. Posso ajudar a migrar seus dados do sistema atual?
```

**Mensagem 3 — último dia (31/12)**
```
Hoje é o último dia: 30 dias grátis + 50% de desconto por 12 meses no DentalPos. https://app.dentalpos.com.br/cadastro
```

**Status do WhatsApp:** poste as gravuras `-stories.png` 1, 3 e 6 (uma por dia).

## Regras para não ser bloqueado
- Mande só para quem já tem relacionamento ou pediu contato. Inclua "Se não quiser receber, responda SAIR" e respeite.
- Nunca importe lista de contatos de terceiros (regra do projeto: copia-se o código, nunca a lista).
- Envie em lotes pequenos e espaçados.

---

# Cronograma
| Data | Ação |
|---|---|
| 05–14/11 | Conferir cadastro 30 dias/50%, instalar pixels, criar campanhas e enviar para análise |
| 16/11 | Campanhas no ar (Meta, Google, TikTok); WhatsApp mensagem 1 |
| 20/11 | Revisar resultados, pausar anúncios fracos |
| 24–26/11 | Mensagem 2 no WhatsApp; destaque "Black Friday chegando" |
| 27/11 | Black Friday: reforçar orçamento nos melhores anúncios |
| 30/11 | Cyber Monday: reforçar o orçamento nos melhores anúncios |
| 15/12 | Anúncio 6 (últimos dias) e mensagem 2 |
| 31/12 | Último dia: mensagem 3 |
| 01/01 | Encerrar campanhas e medir cadastros |
