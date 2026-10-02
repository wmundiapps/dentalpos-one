import type { MeshDiagnosticResult } from "./meshDiagnostics";

export interface MeshComparisonResult {
  duplicateDifference: number;
  degenerateDifference: number;
  openEdgeDifference: number;
  nonManifoldDifference: number;
  shellDifference: number;

  improved: boolean;
  worsened: boolean;

  summary: string;
}

export function compareMeshDiagnostics(
  original: MeshDiagnosticResult,
  repaired: MeshDiagnosticResult
): MeshComparisonResult {
  const duplicateDifference =
    original.duplicateTriangles -
    repaired.duplicateTriangles;

  const degenerateDifference =
    original.degenerateTriangles -
    repaired.degenerateTriangles;

  const openEdgeDifference =
    original.openEdges -
    repaired.openEdges;

  const nonManifoldDifference =
    original.nonManifoldEdges -
    repaired.nonManifoldEdges;

  const shellDifference =
    original.shells -
    repaired.shells;

  const totalImprovement =
    duplicateDifference +
    degenerateDifference +
    nonManifoldDifference;

  const totalWorsening =
    Math.max(
      0,
      -duplicateDifference
    ) +
    Math.max(
      0,
      -degenerateDifference
    ) +
    Math.max(
      0,
      -nonManifoldDifference
    );

  const improved =
    totalImprovement > 0;

  const worsened =
    totalWorsening > 0;

  let summary =
    "A malha permaneceu estruturalmente semelhante.";

  if (improved && !worsened) {
    summary =
      "A malha apresentou melhora após o reparo.";
  }

  if (worsened) {
    summary =
      "O reparo gerou alterações que precisam ser revisadas.";
  }

  if (
    repaired.duplicateTriangles === 0 &&
    repaired.degenerateTriangles === 0 &&
    repaired.nonManifoldEdges === 0
  ) {
    summary =
      "A malha reparada não apresenta duplicações, degenerações ou regiões não-manifold detectáveis.";
  }

  return {
    duplicateDifference,
    degenerateDifference,
    openEdgeDifference,
    nonManifoldDifference,
    shellDifference,

    improved,
    worsened,

    summary,
  };
}