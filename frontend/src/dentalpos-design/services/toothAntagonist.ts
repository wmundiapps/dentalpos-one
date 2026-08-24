import * as THREE from "three";

export interface AntagonistResult {
  toothNumber: number;
  antagonists: number[];
}

const antagonistMap: Record<
  number,
  number[]
> = {
  11: [41, 42],
  12: [42, 43],
  13: [43, 44],
  14: [44, 45],
  15: [45, 46],
  16: [46, 47],
  17: [47, 48],
  18: [48],

  21: [31, 32],
  22: [32, 33],
  23: [33, 34],
  24: [34, 35],
  25: [35, 36],
  26: [36, 37],
  27: [37, 38],
  28: [38],

  31: [21],
  32: [21, 22],
  33: [22, 23],
  34: [23, 24],
  35: [24, 25],
  36: [25, 26],
  37: [26, 27],
  38: [27, 28],

  41: [11],
  42: [11, 12],
  43: [12, 13],
  44: [13, 14],
  45: [14, 15],
  46: [15, 16],
  47: [16, 17],
  48: [17, 18],
};

export function getAntagonists(
  toothNumber: number
): AntagonistResult {
  return {
    toothNumber,

    antagonists:
      antagonistMap[
        toothNumber
      ] ?? [],
  };
}

export function getPrimaryAntagonist(
  toothNumber: number
): number | null {
  const result =
    getAntagonists(
      toothNumber
    );

  return (
    result.antagonists[0] ??
    null
  );
}

export function calculateOcclusalDistance(
  tooth: THREE.Object3D,
  antagonist: THREE.Object3D
) {
  const toothBox =
    new THREE.Box3().setFromObject(
      tooth
    );

  const antagonistBox =
    new THREE.Box3().setFromObject(
      antagonist
    );

  const toothCenter =
    new THREE.Vector3();

  const antagonistCenter =
    new THREE.Vector3();

  toothBox.getCenter(
    toothCenter
  );

  antagonistBox.getCenter(
    antagonistCenter
  );

  return toothCenter.distanceTo(
    antagonistCenter
  );
}

export function calculateClosestPoints(
  tooth: THREE.Object3D,
  antagonist: THREE.Object3D
) {
  const toothBox =
    new THREE.Box3().setFromObject(
      tooth
    );

  const antagonistBox =
    new THREE.Box3().setFromObject(
      antagonist
    );

  const toothCenter =
    new THREE.Vector3();

  const antagonistCenter =
    new THREE.Vector3();

  toothBox.getCenter(
    toothCenter
  );

  antagonistBox.getCenter(
    antagonistCenter
  );

  const toothPoint =
    toothBox.clampPoint(
      antagonistCenter,
      new THREE.Vector3()
    );

  const antagonistPoint =
    antagonistBox.clampPoint(
      toothCenter,
      new THREE.Vector3()
    );

  return {
    toothPoint,
    antagonistPoint,

    distance:
      toothPoint.distanceTo(
        antagonistPoint
      ),
  };
}

export function moveToothTowardAntagonist(
  tooth: THREE.Object3D,
  antagonist: THREE.Object3D,
  targetDistance = 0.2
) {
  const toothCenter =
    new THREE.Box3()
      .setFromObject(tooth)
      .getCenter(
        new THREE.Vector3()
      );

  const antagonistCenter =
    new THREE.Box3()
      .setFromObject(
        antagonist
      )
      .getCenter(
        new THREE.Vector3()
      );

  const direction =
    antagonistCenter
      .clone()
      .sub(toothCenter)
      .normalize();

  const current =
    calculateClosestPoints(
      tooth,
      antagonist
    );

  if (
    current.distance <=
    targetDistance
  ) {
    return 0;
  }

  const movement =
    current.distance -
    targetDistance;

  tooth.position.add(
    direction.multiplyScalar(
      movement
    )
  );

  tooth.updateMatrixWorld(
    true
  );

  return movement;
}