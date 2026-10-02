import * as THREE from "three";

import {
  analyzeOcclusion,
  type OcclusalAnalysisResult,
} from "./toothOcclusion";

export interface OcclusalAdjustmentOptions {
  targetDistance?: number;
  step?: number;
  maxIterations?: number;
}

export interface OcclusalAdjustmentResult {
  adjusted: boolean;

  iterations: number;

  movement: number;

  initial: OcclusalAnalysisResult;

  final: OcclusalAnalysisResult;
}

export function autoAdjustOcclusion(
  tooth: THREE.Object3D,
  antagonist: THREE.Object3D,
  options: OcclusalAdjustmentOptions = {}
): OcclusalAdjustmentResult {
  const {
    targetDistance = 0.12,
    step = 0.03,
    maxIterations = 200,
  } = options;

  const initial =
    analyzeOcclusion(
      tooth,
      antagonist,
      {
        contactDistance:
          targetDistance,
      }
    );

  let current =
    initial;

  let iterations = 0;

  let totalMovement = 0;

  const direction =
    getAdjustmentDirection(
      tooth,
      antagonist
    );

  if (
    current.status === "contact"
  ) {
    return {
      adjusted: false,
      iterations: 0,
      movement: 0,
      initial,
      final: current,
    };
  }

  if (
    current.status === "collision"
  ) {
    const awayDirection =
      direction
        .clone()
        .multiplyScalar(-1);

    while (
      current.status ===
        "collision" &&
      iterations <
        maxIterations
    ) {
      tooth.position.add(
        awayDirection
          .clone()
          .multiplyScalar(step)
      );

      tooth.updateMatrixWorld(
        true
      );

      totalMovement += step;

      iterations += 1;

      current =
        analyzeOcclusion(
          tooth,
          antagonist,
          {
            contactDistance:
              targetDistance,
          }
        );
    }
  }

  if (
    current.minimumDistance >
    targetDistance
  ) {
    while (
      current.minimumDistance >
        targetDistance &&
      iterations <
        maxIterations
    ) {
      const previousPosition =
        tooth.position.clone();

      tooth.position.add(
        direction
          .clone()
          .multiplyScalar(step)
      );

      tooth.updateMatrixWorld(
        true
      );

      const next =
        analyzeOcclusion(
          tooth,
          antagonist,
          {
            contactDistance:
              targetDistance,
          }
        );

      if (
        next.status ===
        "collision"
      ) {
        tooth.position.copy(
          previousPosition
        );

        tooth.updateMatrixWorld(
          true
        );

        break;
      }

      totalMovement += step;

      iterations += 1;

      current = next;

      if (
        current.status ===
        "contact"
      ) {
        break;
      }
    }
  }

  const final =
    analyzeOcclusion(
      tooth,
      antagonist,
      {
        contactDistance:
          targetDistance,
      }
    );

  return {
    adjusted:
      totalMovement > 0,

    iterations,

    movement:
      totalMovement,

    initial,

    final,
  };
}

function getAdjustmentDirection(
  tooth: THREE.Object3D,
  antagonist: THREE.Object3D
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
      .sub(toothCenter);

  if (
    direction.lengthSq() === 0
  ) {
    return new THREE.Vector3(
      0,
      -1,
      0
    );
  }

  return direction.normalize();
}

export function moveToothOcclusally(
  tooth: THREE.Object3D,
  direction: THREE.Vector3,
  distance: number
) {
  tooth.position.add(
    direction
      .clone()
      .normalize()
      .multiplyScalar(
        distance
      )
  );

  tooth.updateMatrixWorld(
    true
  );

  return tooth.position.clone();
}