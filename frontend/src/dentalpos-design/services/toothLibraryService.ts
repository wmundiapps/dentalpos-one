import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

import {
  getToothByFDI,
} from "../tooth-library/toothLibrary";

import type {
  ToothDefinition,
} from "../tooth-library/toothLibrary";

import {
  GOLDEN_RATIO,
} from "./toothProportion";

// ============================================================
// TIPOS
// ============================================================

export interface LoadedTooth {
  definition: ToothDefinition;
  geometry: THREE.BufferGeometry;
}

export interface ToothTransform {
  position: {
    x: number;
    y: number;
    z: number;
  };

  rotation: {
    x: number;
    y: number;
    z: number;
  };

  scale: {
    x: number;
    y: number;
    z: number;
  };
}

// ============================================================
// CARREGAR STL
// ============================================================

export async function loadToothSTL(
  file: File,
  fdi: number
): Promise<LoadedTooth> {
  const definition =
    getToothByFDI(fdi);

  if (!definition) {
    throw new Error(
      `Dente FDI ${fdi} não encontrado na DentalPos Tooth Library.`
    );
  }

  const arrayBuffer =
    await file.arrayBuffer();

  const loader =
    new STLLoader();

  const geometry =
    loader.parse(arrayBuffer);

  if (!geometry.attributes.normal) {
    geometry.computeVertexNormals();
  }

  geometry.computeBoundingBox();

  const box =
    geometry.boundingBox;

  if (!box) {
    throw new Error(
      `Não foi possível calcular a geometria do dente ${fdi}.`
    );
  }

  const center =
    new THREE.Vector3();

  box.getCenter(center);

  geometry.translate(
    -center.x,
    -center.y,
    -center.z
  );

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return {
    definition,
    geometry,
  };
}

// ============================================================
// DIMENSÕES
// ============================================================

export function getGeometryDimensions(
  geometry: THREE.BufferGeometry
): THREE.Vector3 {
  geometry.computeBoundingBox();

  const box =
    geometry.boundingBox;

  if (!box) {
    return new THREE.Vector3(
      0,
      0,
      0
    );
  }

  const dimensions =
    new THREE.Vector3();

  box.getSize(
    dimensions
  );

  return dimensions;
}

// ============================================================
// ESCALA ANATÔMICA INICIAL
// ============================================================

export function calculateInitialToothScale(
  geometry: THREE.BufferGeometry,
  definition: ToothDefinition
): THREE.Vector3 {
  const dimensions =
    getGeometryDimensions(
      geometry
    );

  if (
    dimensions.x <= 0 ||
    dimensions.y <= 0 ||
    dimensions.z <= 0
  ) {
    return new THREE.Vector3(
      1,
      1,
      1
    );
  }

  const scaleX =
    definition.defaultSize
      .mesiodistal /
    dimensions.x;

  const scaleY =
    definition.defaultSize
      .height /
    dimensions.y;

  const scaleZ =
    definition.defaultSize
      .buccolingual /
    dimensions.z;

  return new THREE.Vector3(
    scaleX,
    scaleY,
    scaleZ
  );
}

// ============================================================
// ESPELHAMENTO CONTRALATERAL
// ============================================================

export function createMirroredGeometry(
  sourceGeometry: THREE.BufferGeometry
): THREE.BufferGeometry {
  const mirrored =
    sourceGeometry.clone();

  mirrored.scale(
    -1,
    1,
    1
  );

  mirrored.computeVertexNormals();
  mirrored.computeBoundingBox();
  mirrored.computeBoundingSphere();

  return mirrored;
}

// ============================================================
// TRANSFORMAÇÃO INICIAL
// ============================================================

export function createDefaultToothTransform(): ToothTransform {
  return {
    position: {
      x: 0,
      y: 0,
      z: 0,
    },

    rotation: {
      x: 0,
      y: 0,
      z: 0,
    },

    scale: {
      x: 1,
      y: 1,
      z: 1,
    },
  };
}

// ============================================================
// PROPORÇÃO ÁUREA
// ============================================================

export function calculateGoldenRatioWidth(
  referenceWidth: number,
  direction:
    | "increase"
    | "decrease"
): number {
  if (
    !Number.isFinite(
      referenceWidth
    ) ||
    referenceWidth <= 0
  ) {
    return 0;
  }

  if (
    direction === "increase"
  ) {
    return (
      referenceWidth *
      GOLDEN_RATIO
    );
  }

  return (
    referenceWidth /
    GOLDEN_RATIO
  );
}

// ============================================================
// UTILIDADES
// ============================================================

export function getContralateralFDI(
  fdi: number
): number | null {
  const tooth =
    getToothByFDI(fdi);

  if (!tooth) {
    return null;
  }

  return tooth.mirrorTooth;
}