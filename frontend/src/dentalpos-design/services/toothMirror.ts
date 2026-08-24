import * as THREE from "three";

export type DentalArch =
  | "superior"
  | "inferior";

const mirrorMap: Record<number, number> = {
  11: 21,
  12: 22,
  13: 23,
  14: 24,
  15: 25,
  16: 26,
  17: 27,
  18: 28,

  21: 11,
  22: 12,
  23: 13,
  24: 14,
  25: 15,
  26: 16,
  27: 17,
  28: 18,

  31: 41,
  32: 42,
  33: 43,
  34: 44,
  35: 45,
  36: 46,
  37: 47,
  38: 48,

  41: 31,
  42: 32,
  43: 33,
  44: 34,
  45: 35,
  46: 36,
  47: 37,
  48: 38,
};

export function getMirroredToothNumber(
  toothNumber: number
): number | null {
  return (
    mirrorMap[toothNumber] ??
    null
  );
}

export function getDentalArch(
  toothNumber: number
): DentalArch | null {
  if (
    toothNumber >= 11 &&
    toothNumber <= 28
  ) {
    return "superior";
  }

  if (
    toothNumber >= 31 &&
    toothNumber <= 48
  ) {
    return "inferior";
  }

  return null;
}

export function mirrorToothGeometry(
  sourceGeometry: THREE.BufferGeometry
): THREE.BufferGeometry {
  const geometry =
    sourceGeometry.clone();

  geometry.scale(
    -1,
    1,
    1
  );

  /*
   * O espelhamento altera a orientação
   * das faces.
   *
   * Recalculamos as normais para manter
   * a visualização correta.
   */

  geometry.deleteAttribute(
    "normal"
  );

  geometry.computeVertexNormals();

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

export function createMirroredTooth(
  sourceMesh: THREE.Mesh,
  targetToothNumber: number
): THREE.Mesh {
  const geometry =
    mirrorToothGeometry(
      sourceMesh.geometry
    );

  let material:
    | THREE.Material
    | THREE.Material[];

  if (
    Array.isArray(
      sourceMesh.material
    )
  ) {
    material =
      sourceMesh.material.map(
        (item) =>
          item.clone()
      );
  } else {
    material =
      sourceMesh.material.clone();
  }

  const mirroredMesh =
    new THREE.Mesh(
      geometry,
      material
    );

  mirroredMesh.name =
    `DENTALPOS_TOOTH_${targetToothNumber}`;

  mirroredMesh.position.copy(
    sourceMesh.position
  );

  mirroredMesh.rotation.copy(
    sourceMesh.rotation
  );

  mirroredMesh.scale.copy(
    sourceMesh.scale
  );

  /*
   * Espelha também a posição
   * em relação ao plano sagital.
   */

  mirroredMesh.position.x *=
    -1;

  mirroredMesh.updateMatrixWorld(
    true
  );

  return mirroredMesh;
}

export function mirrorSelectedTooth(
  sourceMesh: THREE.Mesh,
  sourceToothNumber: number
) {
  const targetToothNumber =
    getMirroredToothNumber(
      sourceToothNumber
    );

  if (!targetToothNumber) {
    throw new Error(
      "Não foi possível identificar o dente contralateral."
    );
  }

  const mesh =
    createMirroredTooth(
      sourceMesh,
      targetToothNumber
    );

  return {
    sourceToothNumber,
    targetToothNumber,
    mesh,
  };
}