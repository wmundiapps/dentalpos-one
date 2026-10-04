import { callAIForJSON, AI_MODEL, AiContext } from './client';

// ============================================================
// Gera questões (múltipla escolha e/ou dissertativas) a partir de
// um texto-base (resumo de aula, ementa, transcrição de vídeo etc).
// Retorna já no formato pronto para virar registros de Question +
// GradingRubric no banco.
// ============================================================

export interface GeneratedQuestion {
  enunciado: string;
  tipo: 'MULTIPLA_ESCOLHA' | 'DISSERTATIVA' | 'VERDADEIRO_FALSO';
  alternativas?: { texto: string; correta: boolean }[];
  respostaCorreta?: string; // para múltipla escolha: id/texto da correta; para V/F: "true"/"false"
  criteriosRubrica?: string; // apenas para dissertativa
  peso: number;
}

interface GenerateQuestionsParams {
  textoBase: string;
  quantidadeMultiplaEscolha: number;
  quantidadeDissertativas: number;
  focoEnade?: boolean;
  focoResidencia?: boolean;
  nivelDificuldade?: 'BASICO' | 'INTERMEDIARIO' | 'AVANCADO';
  ctx?: AiContext;
}

export async function generateQuestions(
  params: GenerateQuestionsParams,
): Promise<GeneratedQuestion[]> {
  const {
    textoBase,
    quantidadeMultiplaEscolha,
    quantidadeDissertativas,
    focoEnade,
    focoResidencia,
    nivelDificuldade = 'INTERMEDIARIO',
  } = params;

  const foco = focoEnade
    ? 'no estilo e nível de exigência do ENADE'
    : focoResidencia
      ? 'no estilo e nível de exigência de provas de residência médica/multiprofissional'
      : 'no estilo de uma avaliação de disciplina universitária regular';

  const system = `Você é um elaborador de questões para uma instituição de ensino superior brasileira.
Gere questões ${foco}, nível de dificuldade ${nivelDificuldade}, baseadas ESTRITAMENTE no conteúdo fornecido.
Responda APENAS com um array JSON válido, sem nenhum texto antes ou depois, sem markdown.
Cada item do array deve seguir exatamente este formato:
{
  "enunciado": "string",
  "tipo": "MULTIPLA_ESCOLHA" | "DISSERTATIVA",
  "alternativas": [{"texto": "string", "correta": boolean}] (apenas se MULTIPLA_ESCOLHA, 4 ou 5 alternativas, exatamente 1 correta),
  "criteriosRubrica": "string descrevendo o que uma resposta completa deve conter, e os principais erros a penalizar" (apenas se DISSERTATIVA),
  "peso": number (1 a 3, conforme a complexidade da questão)
}`;

  const user = `Conteúdo-base:
"""
${textoBase}
"""

Gere exatamente ${quantidadeMultiplaEscolha} questões de múltipla escolha e ${quantidadeDissertativas} questões dissertativas.`;

  return callAIForJSON<GeneratedQuestion[]>({ system, user, maxTokens: 4000, ctx: params.ctx });
}

export { AI_MODEL };
