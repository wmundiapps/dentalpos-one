import {
  type ToothDesignValidationResult,
} from "./toothDesignValidation";

export type DesignQualityLevel =
  | "excellent"
  | "good"
  | "attention"
  | "critical";

export interface ToothDesignQualityScore {
  score: number;

  level: DesignQualityLevel;

  errors: number;

  warnings: number;

  thicknessScore: number;

  contactScore: number;

  manufacturingScore: number;

  message: string;
}

export function calculateToothDesignQualityScore(
  validation: ToothDesignValidationResult
): ToothDesignQualityScore {
  let thicknessScore = 100;

  let contactScore = 100;

  let manufacturingScore = 100;

  /*
   * ESPESSURA
   */

  if (validation.thickness) {
    const thickness =
      validation.thickness;

    thicknessScore -=
      thickness.criticalPoints *
      8;

    thicknessScore -=
      thickness.warningPoints *
      2;

    if (
      !thickness.manufacturingSafe
    ) {
      manufacturingScore -=
        40;
    }
  } else {
    thicknessScore = 70;

    manufacturingScore = 70;
  }

  /*
   * CONTATOS PROXIMAIS
   */

  const contacts = [
    validation.mesialContact,
    validation.distalContact,
  ];

  contacts.forEach(
    (contact) => {
      if (!contact) {
        return;
      }

      switch (
        contact.type
      ) {
        case "collision":
          contactScore -=
            35;
          break;

        case "none":
          contactScore -=
            20;
          break;

        case "proximity":
          contactScore -=
            8;
          break;

        case "contact":
          break;
      }
    }
  );

  /*
   * ERROS E ALERTAS
   */

  manufacturingScore -=
    validation.errors *
    15;

  manufacturingScore -=
    validation.warnings *
    4;

  /*
   * LIMITES
   */

  thicknessScore =
    clampScore(
      thicknessScore
    );

  contactScore =
    clampScore(
      contactScore
    );

  manufacturingScore =
    clampScore(
      manufacturingScore
    );

  /*
   * SCORE FINAL
   */

  const score =
    Math.round(
      thicknessScore *
        0.4 +
      contactScore *
        0.3 +
      manufacturingScore *
        0.3
    );

  let level:
    DesignQualityLevel;

  let message: string;

  if (score >= 90) {
    level =
      "excellent";

    message =
      "Design com excelente qualidade técnica.";
  } else if (
    score >= 75
  ) {
    level =
      "good";

    message =
      "Design adequado, com pequenos ajustes opcionais.";
  } else if (
    score >= 55
  ) {
    level =
      "attention";

    message =
      "Design requer revisão antes da fabricação.";
  } else {
    level =
      "critical";

    message =
      "Design apresenta problemas críticos.";
  }

  return {
    score,

    level,

    errors:
      validation.errors,

    warnings:
      validation.warnings,

    thicknessScore,

    contactScore,

    manufacturingScore,

    message,
  };
}

export function calculateProjectQualityScore(
  validations:
    ToothDesignValidationResult[]
) {
  if (
    validations.length === 0
  ) {
    return {
      score: 0,

      level:
        "critical" as DesignQualityLevel,

      teeth: 0,

      excellent: 0,

      good: 0,

      attention: 0,

      critical: 0,
    };
  }

  const scores =
    validations.map(
      (validation) =>
        calculateToothDesignQualityScore(
          validation
        )
    );

  const average =
    scores.reduce(
      (
        total,
        item
      ) =>
        total +
        item.score,
      0
    ) /
    scores.length;

  const score =
    Math.round(
      average
    );

  let level:
    DesignQualityLevel;

  if (score >= 90) {
    level =
      "excellent";
  } else if (
    score >= 75
  ) {
    level =
      "good";
  } else if (
    score >= 55
  ) {
    level =
      "attention";
  } else {
    level =
      "critical";
  }

  return {
    score,

    level,

    teeth:
      scores.length,

    excellent:
      scores.filter(
        (item) =>
          item.level ===
          "excellent"
      ).length,

    good:
      scores.filter(
        (item) =>
          item.level ===
          "good"
      ).length,

    attention:
      scores.filter(
        (item) =>
          item.level ===
          "attention"
      ).length,

    critical:
      scores.filter(
        (item) =>
          item.level ===
          "critical"
      ).length,
  };
}

function clampScore(
  score: number
) {
  return Math.max(
    0,
    Math.min(
      100,
      score
    )
  );
}