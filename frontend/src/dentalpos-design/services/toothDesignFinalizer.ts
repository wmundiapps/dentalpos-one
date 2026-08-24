import {
  type ToothDesignSession,
} from "./toothDesignSession";

import {
  validateToothDesign,
  type ToothDesignValidationResult,
} from "./toothDesignValidation";

import {
  calculateToothDesignQualityScore,
  type ToothDesignQualityScore,
} from "./toothDesignQualityScore";

import {
  exportToothToSTL,
  type ToothExportResult,
} from "./toothExport";

export interface FinalizedTooth {
  toothNumber: number;

  valid: boolean;

  validation:
    ToothDesignValidationResult;

  quality:
    ToothDesignQualityScore;

  exportResult:
    ToothExportResult | null;
}

export interface DesignFinalizationResult {
  success: boolean;

  totalTeeth: number;

  approvedTeeth: number;

  rejectedTeeth: number;

  exportedTeeth: number;

  averageScore: number;

  teeth:
    FinalizedTooth[];

  messages:
    string[];
}

export interface FinalizationOptions {
  exportSTL?: boolean;

  minimumQualityScore?: number;

  allowWarnings?: boolean;
}

export function finalizeDentalDesign(
  session: ToothDesignSession,
  options: FinalizationOptions = {}
): DesignFinalizationResult {
  const {
    exportSTL = false,
    minimumQualityScore = 70,
    allowWarnings = true,
  } = options;

  const instances =
    session.getAllTeeth();

  const teeth:
    FinalizedTooth[] = [];

  const messages:
    string[] = [];

  let approvedTeeth = 0;

  let rejectedTeeth = 0;

  let exportedTeeth = 0;

  let totalScore = 0;

  for (
    const instance of instances
  ) {
    const validation =
      validateToothDesign({
        toothNumber:
          instance.toothNumber,

        tooth:
          instance.mesh,

        getToothMesh:
          (toothNumber) =>
            session.getToothMesh(
              toothNumber
            ),
      });

    const quality =
      calculateToothDesignQualityScore(
        validation
      );

    totalScore +=
      quality.score;

    const warningsAccepted =
      allowWarnings ||
      validation.warnings === 0;

    const approved =
      validation.errors === 0 &&
      warningsAccepted &&
      quality.score >=
        minimumQualityScore;

    let exportResult:
      ToothExportResult | null =
      null;

    if (approved) {
      approvedTeeth += 1;

      if (exportSTL) {
        try {
          exportResult =
            exportToothToSTL(
              instance.mesh,
              instance.toothNumber,
              {
                binary: true,

                applyWorldTransform:
                  true,

                fileName:
                  `DentalPos_${instance.toothNumber}.stl`,
              }
            );

          exportedTeeth +=
            1;
        } catch {
          messages.push(
            `Falha ao preparar STL do dente ${instance.toothNumber}.`
          );
        }
      }
    } else {
      rejectedTeeth += 1;

      messages.push(
        `Dente ${instance.toothNumber} requer revisão antes da fabricação.`
      );
    }

    teeth.push({
      toothNumber:
        instance.toothNumber,

      valid:
        approved,

      validation,

      quality,

      exportResult,
    });
  }

  const averageScore =
    instances.length > 0
      ? Math.round(
          totalScore /
            instances.length
        )
      : 0;

  const success =
    instances.length > 0 &&
    rejectedTeeth === 0;

  if (
    instances.length === 0
  ) {
    messages.push(
      "Nenhum dente disponível para finalização."
    );
  } else if (success) {
    messages.push(
      "Projeto aprovado para fabricação."
    );
  }

  return {
    success,

    totalTeeth:
      instances.length,

    approvedTeeth,

    rejectedTeeth,

    exportedTeeth,

    averageScore,

    teeth,

    messages,
  };
}

export function downloadFinalizedSTLs(
  result: DesignFinalizationResult
) {
  let downloaded = 0;

  result.teeth.forEach(
    (tooth) => {
      if (
        !tooth.valid ||
        !tooth.exportResult
      ) {
        return;
      }

      const url =
        URL.createObjectURL(
          tooth.exportResult.blob
        );

      const anchor =
        document.createElement(
          "a"
        );

      anchor.href =
        url;

      anchor.download =
        tooth.exportResult.fileName;

      document.body.appendChild(
        anchor
      );

      anchor.click();

      document.body.removeChild(
        anchor
      );

      setTimeout(
        () => {
          URL.revokeObjectURL(
            url
          );
        },
        100
      );

      downloaded += 1;
    }
  );

  return downloaded;
}

export function createFinalizationSummary(
  result: DesignFinalizationResult
) {
  return {
    status:
      result.success
        ? "approved"
        : "review",

    total:
      result.totalTeeth,

    approved:
      result.approvedTeeth,

    rejected:
      result.rejectedTeeth,

    exported:
      result.exportedTeeth,

    averageScore:
      result.averageScore,
  };
}

export function disposeFinalizationResult(
  result: DesignFinalizationResult
) {
  result.teeth.forEach(
    (tooth) => {
      tooth.exportResult =
        null;
    }
  );
}