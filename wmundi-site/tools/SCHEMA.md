# Esquema do conteúdo de cada demonstração (um arquivo JSON por produto em tools/content/<slug>.json)

{
  "slug": "completodonto",               // minúsculo, sem acento, só letras/números/hífen
  "nome": "Completodonto",               // exatamente o nome do catálogo (data-nome)
  "cat": "saude",                         // saude|mkt|edu|neg|mob|fin|car|mod
  "tagline": "frase curta (até 110 caracteres) do que o sistema resolve",
  "persona": "Quem usa (ex.: Clínica 'Exemplo Sorriso' — empresa FICTÍCIA)",
  "kpis": [ {"l":"Rótulo","v":"valor já formatado","d":"nota curta opcional"} ],   // 4 itens
  "table": { "title":"Título", "cols":["Col A","Col B","Col C","Status"], "rows":[["...","...","...","ok|warn|bad|info:Texto do selo"]] },  // 6 a 8 linhas, 3 a 5 colunas; última coluna pode ser selo no formato "ok:Pago", "warn:Pendente", "bad:Atrasado", "info:Novo"
  "chart": { "title":"Título", "labels":["Jan","Fev",...], "values":[numeros] },  // 6 a 12 pontos, barras simples
  "sim": {
    "title": "Simulador: ...",
    "intro": "uma frase explicando o que o visitante pode mexer",
    "inputs": [ {"id":"pac","label":"Pacientes por mês","min":50,"max":1000,"step":10,"val":300,"unit":""} ],   // 2 a 4 sliders; id só letras/números, sem espaço
    "outputs": [ {"label":"Receita estimada","expr":"pac*ticket*0.9","fmt":"brl"} ]   // 2 a 4 resultados; expr é expressão JavaScript usando os ids dos inputs (só + - * / ( ) Math.min/max/round/ceil/floor); fmt: brl | int | pct | dec1 | min
  },
  "fluxo": ["Passo 1 do uso", "Passo 2", "Passo 3", "Passo 4"],   // 4 passos curtos
  "recursos": ["6 a 8 recursos típicos exibidos como lista"],
  "faq": [ {"q":"Pergunta","a":"Resposta curta"} ]   // 2 itens
}

## Regras obrigatórias
- Tudo é FICTÍCIO: nomes de pessoas inventados genéricos (ex.: "Cliente Exemplo 01", "Maria Modelo"), empresas inventadas (ex.: "Clínica Exemplo Sorriso"), sem CPF/CNPJ/telefone/e-mail reais; use "000.000.000-00" ou omita. Nunca use marcas reais de terceiros como clientes.
- Não prometa resultado financeiro real nem funcionalidade garantida; o texto deve parecer um modelo ilustrativo.
- Não inclua preço de venda do produto (os valores estão sob consulta).
- Português do Brasil, com acentos. Sem HTML (texto puro). Nada de emojis.
- Os números das tabelas, KPIs e gráfico devem ser coerentes entre si e plausíveis.
- Conferir que cada expr usa apenas ids definidos em inputs e produz números sensatos nos valores padrão.
