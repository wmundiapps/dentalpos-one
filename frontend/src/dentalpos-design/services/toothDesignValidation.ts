import * as THREE from "three";

import {
  analyzeToothThickness,
  type ThicknessAnalysisResult,
} from "./toothThicknessAnalysis";

import {
  getToothNeighbors,
} from "./toothAdjacency";

import {
  analyzeToothContact,
  type ToothContactResult,
} from "./toothContactAnalysis";

export type ValidationLevel =
  | "success"
  | "warning"
  | "error";

export interface ValidationMessage {
  id: string;

  level: ValidationLevel;

  title: string;

  message: string;
}

export interface ToothDesignValidationResult {
  valid: boolean;

  toothNumber: number;

  thickness:
    | ThicknessAnalysisResult
    | null;

  mesialContact:
    | ToothContactResult
    | null;

  distalContact:
    | ToothContactResult
    | null;

  messages:
    ValidationMessage[];

  errors: number;

  warnings: number;
}

export interface ToothDesignValidationContext {
  toothNumber: number;

  tooth: THREE.Mesh;

  getToothMesh: (
    toothNumber: number
  ) => THREE.Mesh | null;
}

export function validateToothDesign(
  context: ToothDesignValidationContext
): ToothDesignValidationResult {
  const {
    toothNumber,
    tooth,
    getToothMesh,
  } = context;

  const messages:
    ValidationMessage[] = [];

  const neighbors =
    getToothNeighbors(
      toothNumber
    );

  let thickness:
    | ThicknessAnalysisResult
    | null = null;

  let mesialContact:
    | ToothContactResult
    | null = null;

  let distalContact:
    | ToothContactResult
    | null = null;

  try {
    thickness =
      analyzeToothThickness(
        tooth,
        {
          minimumThickness:
            0.5,

          warningThickness:
            0.8,

          sampleStep:
            10,
        }
      );

    if (
      thickness.criticalPoints >
      0
    ) {
      messages.push({
        id:
          crypto.randomUUID(),

        level:
          "error",

        title:
          "Espessura crítica",

        message:
          `${thickness.criticalPoints} pontos abaixo da espessura mínima.`,
      });
    } else if (
      thickness.warningPoints >
      0
    ) {
      messages.push({
        id:
          crypto.randomUUID(),

        level:
          "warning",

        title:
          "Espessura reduzida",

        message:
          `${thickness.warningPoints} pontos próximos do limite mínimo.`,
      });
    } else {
      messages.push({
        id:
          crypto.randomUUID(),

        level:
          "success",

        title:
          "Espessura",

        message:
          "Espessura compatível com os parâmetros definidos.",
      });
    }
  } catch {
    messages.push({
      id:
        crypto.randomUUID(),

      level:
        "warning",

      title:
        "Espessura",

      message:
        "Não foi possível concluir a análise de espessura.",
    });
  }

  if (
    neighbors.mesial
  ) {
    const mesial =
      getToothMesh(
        neighbors.mesial
      );

    if (mesial) {
      mesialContact =
        analyzeToothContact(
          tooth,
          mesial,
          {
            contactTolerance:
              0.12,

            proximityTolerance:
              0.5,
          }
        );

      addContactMessage(
        messages,
        "mesial",
        neighbors.mesial,
        mesialContact
      );
    }
  }

  if (
    neighbors.distal
  ) {
    const distal =
      getToothMesh(
        neighbors.distal
      );

    if (distal) {
      distalContact =
        analyzeToothContact(
          tooth,
          distal,
          {
            contactTolerance:
              0.12,

            proximityTolerance:
              0.5,
          }
        );

      addContactMessage(
        messages,
        "distal",
        neighbors.distal,
        distalContact
      );
    }
  }

  const errors =
    messages.filter(
      (item) =>
        item.level ===
        "error"
    ).length;

  const warnings =
    messages.filter(
      (item) =>
        item.level ===
        "warning"
    ).length;

  return {
    valid:
      errors === 0,

    toothNumber,

    thickness,

    mesialContact,

    distalContact,

    messages,

    errors,

    warnings,
  };
}

function addContactMessage(
  messages: ValidationMessage[],
  side: "mesial" | "distal",
  neighborNumber: number,
  result: ToothContactResult
) {
  if (
    result.type ===
    "collision"
  ) {
    messages.push({
      id:
        crypto.randomUUID(),

      level:
        "error",

      title:
        `Contato ${side}`,

      message:
        `Interferência detectada com o dente ${neighborNumber}.`,
    });

    return;
  }

  if (
    result.type ===
    "contact"
  ) {
    messages.push({
      id:
        crypto.randomUUID(),

      level:
        "success",

      title:
        `Contato ${side}`,

      message:
        `Contato proximal com o dente ${neighborNumber}.`,
    });

    return;
  }

  if (
    result.type ===
    "proximity"
  ) {
    messages.push({
      id:
        crypto.randomUUID(),

      level:
        "warning",

      title:
        `Contato ${side}`,

      message:
        `Pequeno espaço proximal em relação ao dente ${neighborNumber}.`,
    });

    return;
  }

  messages.push({
    id:
      crypto.randomUUID(),

    level:
      "warning",

    title:
      `Contato ${side}`,

    message:
      `Ausência de contato proximal com o dente ${neighborNumber}.`,
  });
}