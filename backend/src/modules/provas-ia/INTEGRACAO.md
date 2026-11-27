# Provas com Correção por IA — Guia de Integração

## 1. Onde colocar

```
backend/
  prisma/schema.prisma        <- cole schema-provas-ia.prisma no final
  src/
    services-ai/               <- NOVO: serviço de IA compartilhado
      client.ts
      generateQuestions.ts
      gradeEssayAnswer.ts
    modules/
      provas-ia/
        validators.ts
        assessments.ts
        generation.ts
        attempts.ts
        routes.ts
```

`services-ai/` fica fora de `modules/` de propósito — é infraestrutura
compartilhada, não um módulo de negócio. Quando os módulos de Regulatório
(triagem de atos do MEC) e Governança forem construídos, eles importam
daqui também, sem recriar cliente de IA.

## 2. Instalar dependência e configurar env var

```powershell
npm install @anthropic-ai/sdk
```

No `.env` do backend (mesma variável para todo o backend a partir de agora):
```
ANTHROPIC_API_KEY=sk-ant-...
```

## 3. Ajustes obrigatórios

Os mesmos de sempre: caminho do Prisma client, e este módulo reaproveita
`middleware.ts` de `../academico/middleware`.

```powershell
npx prisma migrate dev --name provas_correcao_ia
npx prisma generate
```

```ts
// src/app.ts
import provasIARouter from './modules/provas-ia/routes';
app.use('/api/provas', provasIARouter);
```

## 4. Fluxo completo de exemplo

```bash
# Professor cria a avaliação, já marcando correção automática por IA
POST /api/provas/assessments
{
  "disciplineId": "...",
  "classSectionId": "...",
  "titulo": "Prova 2 — Farmacocinética",
  "tipo": "PROVA",
  "dataAbertura": "2026-10-01T00:00:00-03:00",
  "dataFechamento": "2026-10-03T23:59:00-03:00",
  "correcaoPorIA": true
}

# Professor gera questões automaticamente a partir de um resumo de aula
# já cadastrado no módulo de Conteúdo
POST /api/provas/assessments/{assessmentId}/generate-questions
{
  "contentItemId": "...",
  "quantidadeMultiplaEscolha": 6,
  "quantidadeDissertativas": 2,
  "focoEnade": true
}
# -> a IA lê o resumoTexto do conteúdo e cria as questões + rubricas
#    de correção das dissertativas automaticamente

# Professor também pode adicionar uma questão manual na mesma prova
POST /api/provas/assessments/{assessmentId}/questions
{
  "enunciado": "Explique o mecanismo de ação de...",
  "tipo": "DISSERTATIVA",
  "peso": 2,
  "criteriosRubrica": "Deve citar: (1) ligação ao receptor, (2) cascata intracelular, (3) efeito clínico esperado."
}

# Aluno inicia a tentativa (dentro da janela de dataAbertura/dataFechamento)
POST /api/provas/assessments/{assessmentId}/attempts

# Aluno responde tudo de uma vez e submete
POST /api/provas/attempts/{attemptId}/submit
{
  "respostas": [
    { "questionId": "...", "respostaTexto": "Alternativa B" },
    { "questionId": "...", "respostaTexto": "O mecanismo consiste em..." }
  ]
}
# -> múltipla escolha é corrigida na hora; dissertativa (se correcaoPorIA
#    = true) é corrigida pela IA usando a rubrica, com nota e feedback;
#    se todas as questões já têm nota, a tentativa finaliza sozinha com
#    a nota final ponderada pelo peso de cada questão

# Aluno consulta o próprio resultado, com feedback de cada questão
GET /api/provas/attempts/{attemptId}

# Se a prova NÃO tinha correcaoPorIA, as dissertativas ficam pendentes
# e o professor corrige manualmente:
POST /api/provas/attempts/{attemptId}/answers/{questionId}/grade
{ "nota": 8.5, "feedback": "Faltou mencionar o efeito de segunda ordem." }
```

## 5. Sobre o `resumoTexto` como fonte da IA

A geração automática de questões precisa de texto — hoje ela lê o campo
`resumoTexto` do `ContentItem` (módulo de Conteúdo). Para gerar questões a
partir de PDF ou vídeo diretamente, seria necessário um passo de extração
de texto (OCR do PDF, ou transcrição do vídeo) antes de chamar
`generateQuestions()` — isso não está implementado ainda; por ora, o
professor usa o resumo de aula como base, o que já cobre o caso de uso
principal.

## 6. Próximo módulo na fila

Conforme o roteiro: Desempenho/ENADE/Residência (usa os dados deste módulo
e do Núcleo Acadêmico para montar o painel de acompanhamento do aluno) ou
Protocolo + Certificados. Me diga qual, ou eu sigo pela ordem.
