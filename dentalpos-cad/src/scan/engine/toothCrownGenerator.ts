import * as THREE from "three";

import {
  getToothDimensions,
} from "./toothProportion";

import {
  getToothNeighbors,
} from "./toothAdjacency";

import {
  getAntagonists,
} from "./toothAntagonist";

export interface CrownGenerationOptions {
  proximalClearance?: number;

  occlusalClearance?: number;

  minimumScale?: number;

  maximumScale?: number;

  preserveAnatomy?: number;
}

export interface CrownGenerationContext {
  toothNumber: number;

  crown: THREE.Mesh;

  getToothMesh: (
    toothNumber: number
  ) => THREE.Mesh | null;
}

export interface CrownGenerationResult {
  toothNumber: number;

  adjusted: boolean;

  scale: THREE.Vector3;

  position: THREE.Vector3;

  mesialUsed: boolean;

  distalUsed: boolean;

  antagonistUsed: boolean;

  messages: string[];
}

function getCenter(
  object: THREE.Object3D
) {
  return new THREE.Box3()
    .setFromObject(object)
    .getCenter(
      new THREE.Vector3()
    );
}

export function generateSemiAutomaticCrown(
  context: CrownGenerationContext,
  options: CrownGenerationOptions = {}
): CrownGenerationResult {
  const {
    proximalClearance = 0.05,

    occlusalClearance = 0.15,

    minimumScale = 0.7,

    maximumScale = 1.3,

    preserveAnatomy = 0.8,
  } = options;

  const {
    toothNumber,
    crown,
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

  const mesial =
    neighbors.mesial
      ? getToothMesh(
          neighbors.mesial
        )
      : null;

  const distal =
    neighbors.distal
      ? getToothMesh(
          neighbors.distal
        )
      : null;

  const antagonist =
    antagonistData.antagonists
      .map((number) =>
        getToothMesh(number)
      )
      .find(
        (
          mesh
        ): mesh is THREE.Mesh =>
          mesh !== null
      ) ?? null;

  const messages: string[] =
    [];

  let adjusted =
    false;

  /*
   * POSICIONAMENTO ENTRE ADJACENTES
   */

  if (
    mesial &&
    distal
  ) {
    const mesialCenter =
      getCenter(mesial);

    const distalCenter =
      getCenter(distal);

    const midpoint =
      mesialCenter
        .clone()
        .add(
          distalCenter
        )
        .multiplyScalar(
          0.5
        );

    const crownCenter =
      getCenter(crown);

    crown.position.add(
      midpoint
        .clone()
        .sub(
          crownCenter
        )
    );

    crown.updateMatrixWorld(
      true
    );

    adjusted = true;

    messages.push(
      "Coroa centralizada entre os dentes adjacentes."
    );
  }

  /*
   * AJUSTE PROXIMAL
   */

  if (
    mesial &&
    distal
  ) {
    const mesialDimensions =
      getToothDimensions(
        mesial
      );

    const distalDimensions =
      getToothDimensions(
        distal
      );

    const mesialCenter =
      getCenter(mesial);

    const distalCenter =
      getCenter(distal);

    const centerDistance =
      mesialCenter.distanceTo(
        distalCenter
      );

    const availableWidth =
      Math.max(
        0.1,

        centerDistance -
          mesialDimensions.width /
            2 -
          distalDimensions.width /
            2 -
          proximalClearance *
            2
      );

    const crownDimensions =
      getToothDimensions(
        crown
      );

    if (
      crownDimensions.width >
      0
    ) {
      const calculatedScale =
        availableWidth /
        crownDimensions.width;

      const safeScale =
        THREE.MathUtils.clamp(
          calculatedScale,
          minimumScale,
          maximumScale
        );

      const finalScale =
        THREE.MathUtils.lerp(
          1,
          safeScale,
          THREE.MathUtils.clamp(
            preserveAnatomy,
            0,
            1
          )
        );

      crown.scale.x *=
        finalScale;

      crown.updateMatrixWorld(
        true
      );

      adjusted = true;

      messages.push(
        "Largura proximal ajustada automaticamente."
      );
    }
  }

  /*
   * AJUSTE OCLUSAL
   */

  if (antagonist) {
    const crownBox =
      new THREE.Box3()
        .setFromObject(
          crown
        );

    const antagonistBox =
      new THREE.Box3()
        .setFromObject(
          antagonist
        );

    const crownCenter =
      crownBox.getCenter(
        new THREE.Vector3()
      );

    const antagonistCenter =
      antagonistBox.getCenter(
        new THREE.Vector3()
      );

    const direction =
      antagonistCenter
        .clone()
        .sub(
          crownCenter
        );

    if (
      direction.lengthSq() >
      0
    ) {
      direction.normalize();

      const crownPoint =
        crownBox.clampPoint(
          antagonistCenter,
          new THREE.Vector3()
        );

      const antagonistPoint =
        antagonistBox.clampPoint(
          crownCenter,
          new THREE.Vector3()
        );

      const distance =
        crownPoint.distanceTo(
          antagonistPoint
        );

      if (
        distance >
        occlusalClearance
      ) {
        const movement =
          Math.min(
            distance -
              occlusalClearance,
            2
          );

        crown.position.add(
          direction.multiplyScalar(
            movement
          )
        );

        crown.updateMatrixWorld(
          true
        );

        adjusted = true;

        messages.push(
          "Altura oclusal aproximada ao antagonista."
        );
      }
    }
  }

  /*
   * RESULTADO
   */

  if (
    messages.length === 0
  ) {
    messages.push(
      "Coroa mantida na anatomia original da biblioteca."
    );
  }

  return {
    toothNumber,

    adjusted,

    scale:
      crown.scale.clone(),

    position:
      crown.position.clone(),

    mesialUsed:
      Boolean(mesial),

    distalUsed:
      Boolean(distal),

    antagonistUsed:
      Boolean(
        antagonist
      ),

    messages,
  };
}