import * as THREE from "three";

import {
  autoPlaceDentalTooth,
  type ToothAutoPlacementResult,
} from "./toothAutoPlacement";

import {
  getToothNeighbors,
} from "./toothAdjacency";

import {
  getAntagonists,
} from "./toothAntagonist";

import {
  getMirroredToothNumber,
  createMirroredTooth,
} from "./toothMirror";

import {
  applyGoldenProportion,
  type ToothProportionResult,
} from "./toothProportion";

export interface DentalDesignContext {
  toothNumber: number;
  tooth: THREE.Mesh;

  getToothMesh: (
    toothNumber: number
  ) => THREE.Mesh | null;
}

export interface DentalDesignAnalysis {
  toothNumber: number;

  mesial: number | null;
  distal: number | null;

  antagonists: number[];

  mirror: number | null;

  mesialAvailable: boolean;
  distalAvailable: boolean;

  antagonistAvailable: boolean;

  canAutoPlace: boolean;
  canGoldenProportion: boolean;
  canMirror: boolean;
}

export function analyzeDentalDesign(
  context: DentalDesignContext
): DentalDesignAnalysis {
  const {
    toothNumber,
    getToothMesh,
  } = context;

  const neighbors =
    getToothNeighbors(
      toothNumber
    );

  const antagonistData =
    getAntagonists(
      toothNumber
    );

  const mirror =
    getMirroredToothNumber(
      toothNumber
    );

  const mesialMesh =
    neighbors.mesial
      ? getToothMesh(
          neighbors.mesial
        )
      : null;

  const distalMesh =
    neighbors.distal
      ? getToothMesh(
          neighbors.distal
        )
      : null;

  const antagonistAvailable =
    antagonistData.antagonists.some(
      (number) =>
        Boolean(
          getToothMesh(number)
        )
    );

  return {
    toothNumber,

    mesial:
      neighbors.mesial,

    distal:
      neighbors.distal,

    antagonists:
      antagonistData.antagonists,

    mirror,

    mesialAvailable:
      Boolean(mesialMesh),

    distalAvailable:
      Boolean(distalMesh),

    antagonistAvailable,

    canAutoPlace:
      Boolean(
        mesialMesh ||
        distalMesh
      ),

    canGoldenProportion:
      Boolean(
        mesialMesh ||
        distalMesh
      ),

    canMirror:
      mirror !== null,
  };
}

export function runAutoPlacement(
  context: DentalDesignContext
): ToothAutoPlacementResult {
  return autoPlaceDentalTooth(
    context.toothNumber,
    context.tooth,
    context.getToothMesh
  );
}

export function runGoldenProportion(
  context: DentalDesignContext
): ToothProportionResult | null {
  const neighbors =
    getToothNeighbors(
      context.toothNumber
    );

  let reference:
    THREE.Mesh | null = null;

  if (neighbors.mesial) {
    reference =
      context.getToothMesh(
        neighbors.mesial
      );
  }

  if (
    !reference &&
    neighbors.distal
  ) {
    reference =
      context.getToothMesh(
        neighbors.distal
      );
  }

  if (!reference) {
    return null;
  }

  return applyGoldenProportion(
    context.tooth,
    reference,
    "decrease"
  );
}

export function runMirror(
  context: DentalDesignContext
) {
  const targetNumber =
    getMirroredToothNumber(
      context.toothNumber
    );

  if (!targetNumber) {
    return null;
  }

  const existing =
    context.getToothMesh(
      targetNumber
    );

  if (existing) {
    return {
      toothNumber:
        targetNumber,

      mesh:
        existing,

      created:
        false,
    };
  }

  const mesh =
    createMirroredTooth(
      context.tooth,
      targetNumber
    );

  return {
    toothNumber:
      targetNumber,

    mesh,

    created:
      true,
  };
}

export function getDentalDesignSummary(
  analysis: DentalDesignAnalysis
) {
  const messages: string[] = [];

  if (
    analysis.mesialAvailable
  ) {
    messages.push(
      `Adjacente mesial ${analysis.mesial} disponível.`
    );
  }

  if (
    analysis.distalAvailable
  ) {
    messages.push(
      `Adjacente distal ${analysis.distal} disponível.`
    );
  }

  if (
    analysis.antagonistAvailable
  ) {
    messages.push(
      "Antagonista disponível para análise oclusal."
    );
  }

  if (
    analysis.canAutoPlace
  ) {
    messages.push(
      "Posicionamento automático disponível."
    );
  }

  if (
    analysis.canGoldenProportion
  ) {
    messages.push(
      "Ajuste proporcional disponível."
    );
  }

  if (
    analysis.canMirror
  ) {
    messages.push(
      `Espelhamento disponível para o dente ${analysis.mirror}.`
    );
  }

  if (
    messages.length === 0
  ) {
    messages.push(
      "Insira dentes adjacentes ou antagonistas para ampliar a automação."
    );
  }

  return messages;
}