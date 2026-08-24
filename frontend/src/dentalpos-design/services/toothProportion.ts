import * as THREE from "three";

export const GOLDEN_RATIO = 1.61803398875;

export interface ToothDimensions {
  width: number;
  height: number;
  depth: number;
}

export interface ToothProportionResult {
  current: ToothDimensions;
  target: ToothDimensions;

  scale: {
    x: number;
    y: number;
    z: number;
  };
}

export function getToothDimensions(
  object: THREE.Object3D
): ToothDimensions {
  const box =
    new THREE.Box3().setFromObject(
      object
    );

  const size =
    new THREE.Vector3();

  box.getSize(size);

  return {
    width: size.x,
    height: size.y,
    depth: size.z,
  };
}

export function calculateGoldenWidth(
  referenceWidth: number,
  direction:
    | "increase"
    | "decrease" = "decrease"
) {
  if (direction === "increase") {
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

export function calculateTargetDimensions(
  source: THREE.Object3D,
  targetWidth: number
): ToothProportionResult {
  const current =
    getToothDimensions(
      source
    );

  if (
    current.width <= 0 ||
    current.height <= 0 ||
    current.depth <= 0
  ) {
    throw new Error(
      "Dimensões inválidas para cálculo de proporção."
    );
  }

  const uniformScale =
    targetWidth /
    current.width;

  const target: ToothDimensions = {
    width:
      targetWidth,

    height:
      current.height *
      uniformScale,

    depth:
      current.depth *
      uniformScale,
  };

  return {
    current,

    target,

    scale: {
      x: uniformScale,
      y: uniformScale,
      z: uniformScale,
    },
  };
}

export function applyGoldenProportion(
  tooth: THREE.Object3D,
  referenceTooth: THREE.Object3D,
  direction:
    | "increase"
    | "decrease" = "decrease"
): ToothProportionResult {
  const reference =
    getToothDimensions(
      referenceTooth
    );

  const targetWidth =
    calculateGoldenWidth(
      reference.width,
      direction
    );

  const result =
    calculateTargetDimensions(
      tooth,
      targetWidth
    );

  tooth.scale.multiply(
    new THREE.Vector3(
      result.scale.x,
      result.scale.y,
      result.scale.z
    )
  );

  tooth.updateMatrixWorld(
    true
  );

  return result;
}

export function calculateWidthRatio(
  firstTooth: THREE.Object3D,
  secondTooth: THREE.Object3D
) {
  const first =
    getToothDimensions(
      firstTooth
    );

  const second =
    getToothDimensions(
      secondTooth
    );

  if (
    second.width === 0
  ) {
    return 0;
  }

  return (
    first.width /
    second.width
  );
}

export function calculateGoldenRatioDeviation(
  firstTooth: THREE.Object3D,
  secondTooth: THREE.Object3D
) {
  const ratio =
    calculateWidthRatio(
      firstTooth,
      secondTooth
    );

  return Math.abs(
    GOLDEN_RATIO -
    ratio
  );
}