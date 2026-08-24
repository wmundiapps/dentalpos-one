import * as THREE from "three";

export interface ToothNeighbors {
  mesial: number | null;
  distal: number | null;
}

const archSequences: number[][] = [
  [
    18, 17, 16, 15, 14, 13, 12, 11,
    21, 22, 23, 24, 25, 26, 27, 28,
  ],
  [
    48, 47, 46, 45, 44, 43, 42, 41,
    31, 32, 33, 34, 35, 36, 37, 38,
  ],
];

function findSequence(
  toothNumber: number
) {
  return (
    archSequences.find(
      (sequence) =>
        sequence.includes(
          toothNumber
        )
    ) ?? null
  );
}

export function getToothNeighbors(
  toothNumber: number
): ToothNeighbors {
  const sequence =
    findSequence(
      toothNumber
    );

  if (!sequence) {
    return {
      mesial: null,
      distal: null,
    };
  }

  const index =
    sequence.indexOf(
      toothNumber
    );

  const previous =
    index > 0
      ? sequence[index - 1]
      : null;

  const next =
    index <
    sequence.length - 1
      ? sequence[index + 1]
      : null;

  const quadrant =
    Math.floor(
      toothNumber / 10
    );

  const mesial =
    quadrant === 1 ||
    quadrant === 4
      ? next
      : previous;

  const distal =
    quadrant === 1 ||
    quadrant === 4
      ? previous
      : next;

  return {
    mesial,
    distal,
  };
}

export function getObjectCenter(
  object: THREE.Object3D
) {
  const box =
    new THREE.Box3()
      .setFromObject(
        object
      );

  const center =
    new THREE.Vector3();

  box.getCenter(
    center
  );

  return center;
}

export function getDistanceBetweenTeeth(
  first: THREE.Object3D,
  second: THREE.Object3D
) {
  const firstCenter =
    getObjectCenter(
      first
    );

  const secondCenter =
    getObjectCenter(
      second
    );

  return firstCenter.distanceTo(
    secondCenter
  );
}

export function calculateMidpointBetweenTeeth(
  first: THREE.Object3D,
  second: THREE.Object3D
) {
  const firstCenter =
    getObjectCenter(
      first
    );

  const secondCenter =
    getObjectCenter(
      second
    );

  return firstCenter
    .clone()
    .add(
      secondCenter
    )
    .multiplyScalar(
      0.5
    );
}

export function positionToothBetweenNeighbors(
  tooth: THREE.Object3D,
  mesial: THREE.Object3D,
  distal: THREE.Object3D
) {
  const midpoint =
    calculateMidpointBetweenTeeth(
      mesial,
      distal
    );

  tooth.position.copy(
    midpoint
  );

  tooth.updateMatrixWorld(
    true
  );

  return midpoint;
}