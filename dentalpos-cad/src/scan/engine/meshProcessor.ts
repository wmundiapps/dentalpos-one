import * as THREE from "three";

import {
  diagnoseMesh,
} from "./meshDiagnostics";

import type {
  MeshDiagnosticResult,
} from "./meshDiagnostics";

import {
  repairMesh,
} from "./meshRepair";

import type {
  MeshRepairResult,
} from "./meshRepair";

export interface MeshProcessingResult {
  original: MeshDiagnosticResult;

  repaired: MeshDiagnosticResult;

  repair: MeshRepairResult;

  geometry: THREE.BufferGeometry;

  improved: boolean;
}

export function processMesh(
  sourceGeometry: THREE.BufferGeometry
): MeshProcessingResult {
  const original =
    diagnoseMesh(
      sourceGeometry
    );

  const repair =
    repairMesh(
      sourceGeometry
    );

  const repaired =
    diagnoseMesh(
      repair.geometry
    );

  const improved =
    repaired.duplicateTriangles <
      original.duplicateTriangles ||
    repaired.degenerateTriangles <
      original.degenerateTriangles ||
    repaired.nonManifoldEdges <
      original.nonManifoldEdges;

  return {
    original,

    repaired,

    repair,

    geometry:
      repair.geometry,

    improved,
  };
}