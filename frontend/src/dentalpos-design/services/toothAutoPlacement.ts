import * as THREE from "three";

import {
  getToothNeighbors,
} from "./toothAdjacency";

import {
  getAntagonists,
} from "./toothAntagonist";

import {
  autoFitToothBetweenNeighbors,
} from "./toothAutoFit";

export interface ToothAutoPlacementResult {
  positioned: boolean;
  fittedBetweenNeighbors: boolean;
  mesialNumber: number | null;
  distalNumber: number | null;
  antagonistNumbers: number[];
  message: string;
}

export function autoPlaceDentalTooth(
  toothNumber: number,
  tooth: THREE.Object3D,
  getToothMesh: (
    toothNumber: number
  ) => THREE.Object3D | null
): ToothAutoPlacementResult {
  const neighbors =
    getToothNeighbors(
      toothNumber
    );

  const antagonists =
    getAntagonists(
      toothNumber
    );

  const mesialNumber =
    neighbors.mesial;

  const distalNumber =
    neighbors.distal;

  const mesialMesh =
    mesialNumber !== null
      ? getToothMesh(
          mesialNumber
        )
      : null;

  const distalMesh =
    distalNumber !== null
      ? getToothMesh(
          distalNumber
        )
      : null;

  if (
    mesialMesh &&
    distalMesh
  ) {
    autoFitToothBetweenNeighbors(
      tooth,
      mesialMesh,
      distalMesh,
      {
        clearance: 0.05,
        maxScaleUp: 1.2,
        maxScaleDown: 0.7,
      }
    );

    return {
      positioned: true,
      fittedBetweenNeighbors: true,
      mesialNumber,
      distalNumber,
      antagonistNumbers:
        antagonists.antagonists,
      message:
        "Dente posicionado automaticamente entre os adjacentes.",
    };
  }

  if (
    mesialMesh &&
    mesialNumber !== null
  ) {
    positionBesideNeighbor(
      tooth,
      mesialMesh,
      toothNumber,
      mesialNumber
    );

    return {
      positioned: true,
      fittedBetweenNeighbors: false,
      mesialNumber,
      distalNumber,
      antagonistNumbers:
        antagonists.antagonists,
      message:
        "Dente posicionado utilizando o adjacente mesial.",
    };
  }

  if (
    distalMesh &&
    distalNumber !== null
  ) {
    positionBesideNeighbor(
      tooth,
      distalMesh,
      toothNumber,
      distalNumber
    );

    return {
      positioned: true,
      fittedBetweenNeighbors: false,
      mesialNumber,
      distalNumber,
      antagonistNumbers:
        antagonists.antagonists,
      message:
        "Dente posicionado utilizando o adjacente distal.",
    };
  }

  return {
    positioned: false,
    fittedBetweenNeighbors: false,
    mesialNumber,
    distalNumber,
    antagonistNumbers:
      antagonists.antagonists,
    message:
      "Nenhum dente adjacente disponível para posicionamento automático.",
  };
}

function positionBesideNeighbor(
  tooth: THREE.Object3D,
  neighbor: THREE.Object3D,
  toothNumber: number,
  neighborNumber: number
) {
  const toothBox =
    new THREE.Box3().setFromObject(
      tooth
    );

  const neighborBox =
    new THREE.Box3().setFromObject(
      neighbor
    );

  const toothSize =
    toothBox.getSize(
      new THREE.Vector3()
    );

  const neighborSize =
    neighborBox.getSize(
      new THREE.Vector3()
    );

  const neighborCenter =
    neighborBox.getCenter(
      new THREE.Vector3()
    );

  const spacing =
    toothSize.x / 2 +
    neighborSize.x / 2 +
    0.05;

  const direction =
    getHorizontalDirection(
      toothNumber,
      neighborNumber
    );

  const target =
    neighborCenter.clone();

  target.x +=
    spacing * direction;

  const currentCenter =
    toothBox.getCenter(
      new THREE.Vector3()
    );

  tooth.position.add(
    target.sub(
      currentCenter
    )
  );

  tooth.updateMatrixWorld(
    true
  );
}

function getHorizontalDirection(
  toothNumber: number,
  neighborNumber: number
) {
  const toothQuadrant =
    Math.floor(
      toothNumber / 10
    );

  const neighborQuadrant =
    Math.floor(
      neighborNumber / 10
    );

  if (
    toothQuadrant !==
    neighborQuadrant
  ) {
    return toothNumber >
      neighborNumber
      ? 1
      : -1;
  }

  if (
    toothQuadrant === 1 ||
    toothQuadrant === 4
  ) {
    return toothNumber >
      neighborNumber
      ? -1
      : 1;
  }

  return toothNumber >
    neighborNumber
    ? 1
    : -1;
}