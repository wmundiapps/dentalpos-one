import { callAIForJSON, AiContext } from './client';

export interface GradeResult {
  nota: number; // de 0 até notaMaxima
  feedback: string; // justificativa, em tom construtivo, para o aluno ler
  pontosFortes: string[];
  pontosAMelhorar: string[];
}

interface GradeEssayParams {
  enunciado: string;
  criteriosRubrica: string;
  notaMaxima: number;
  respostaAluno: string;
  ctx?: AiContext;
}

export async function gradeEssayAnswer(params: GradeEssayParams): Promise<GradeResult> {
  const { enunciado, criteriosRubrica, notaMaxima, respostaAluno } = params;

  const system = `Você corrige questões dissertativas de provas universitárias com rigor acadêmico e imparcialidade.
Use APENAS os critérios da rubrica fornecida. Não invente critérios adicionais.
Se a resposta estiver em branco ou for irrelevante ao enunciado, dê nota 0 e explique por quê.
Responda APENAS com um objeto JSON válido, sem texto antes ou depois, sem markdown, no formato:
{
  "nota": number (0 até ${notaMaxima}),
  "feedback": "string — explicação direta ao aluno, em português, tom construtivo",
  "pontosFortes": ["string", ...],
  "pontosAMelhorar": ["string", ...]
}`;

  const user = `Enunciado da questão:
"""
${enunciado}
"""

Critérios de correção (rubrica definida pelo professor):
"""
${criteriosRubrica}
"""

Nota máxima: ${notaMaxima}

Resposta do aluno:
"""
${respostaAluno || '(resposta em branco)'}
"""`;

  return callAIForJSON<GradeResult>({ system, user, maxTokens: 1200, ctx: params.ctx });
}
