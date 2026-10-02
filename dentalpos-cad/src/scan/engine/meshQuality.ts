import type {
  MeshDiagnosticResult,
} from "./meshDiagnostics";

export type MeshQualityLevel =
  | "excellent"
  | "good"
  | "warning"
  | "critical";

export interface MeshQualityResult {
  level: MeshQualityLevel;

  score: number;

  label: string;

  canDesign: boolean;

  canManufacture: boolean;

  messages: string[];
}

export function calculateMeshQuality(
  diagnostic: MeshDiagnosticResult
): MeshQualityResult {
  let score = 100;

  const messages: string[] = [];

  if (
    diagnostic.duplicateTriangles > 0
  ) {
    const penalty =
      Math.min(
        25,
        diagnostic.duplicateTriangles *
          0.02
      );

    score -= penalty;

    messages.push(
      "Foram encontradas faces duplicadas."
    );
  }

  if (
    diagnostic.degenerateTriangles > 0
  ) {
    const penalty =
      Math.min(
        20,
        diagnostic.degenerateTriangles *
          0.05
      );

    score -= penalty;

    messages.push(
      "Foram encontrados triângulos degenerados."
    );
  }

  if (
    diagnostic.nonManifoldEdges > 0
  ) {
    const penalty =
      Math.min(
        35,
        diagnostic.nonManifoldEdges *
          0.1
      );

    score -= penalty;

    messages.push(
      "A malha possui regiões não-manifold."
    );
  }

  if (
    diagnostic.openEdges > 0
  ) {
    const penalty =
      Math.min(
        20,
        diagnostic.openEdges *
          0.01
      );

    score -= penalty;

    messages.push(
      "A malha possui bordas abertas."
    );
  }

  if (
    diagnostic.shells > 10
  ) {
    score -= 10;

    messages.push(
      "O STL possui muitas regiões desconectadas."
    );
  }

  score =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(score)
      )
    );

  let level: MeshQualityLevel;

  let label: string;

  if (score >= 95) {
    level = "excellent";

    label = "Excelente";
  } else if (score >= 80) {
    level = "good";

    label = "Boa";
  } else if (score >= 60) {
    level = "warning";

    label = "Requer atenção";
  } else {
    level = "critical";

    label = "Crítica";
  }

  const canDesign =
    score >= 60;

  const canManufacture =
    score >= 80 &&
    diagnostic.nonManifoldEdges === 0 &&
    diagnostic.duplicateTriangles === 0;

  if (
    messages.length === 0
  ) {
    messages.push(
      "Nenhum problema estrutural relevante foi detectado."
    );
  }

  return {
    level,

    score,

    label,

    canDesign,

    canManufacture,

    messages,
  };
}