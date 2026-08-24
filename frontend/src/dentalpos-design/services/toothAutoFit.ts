import * as THREE from "three";

export interface ToothAutoFitOptions {
  clearance?: number;
  maxScaleUp?: number;
  maxScaleDown?: number;
}

export interface ToothAutoFitResult {
  position: THREE.Vector3;

  scale: number;

  availableWidth: number;

  toothWidthBefore: number;

  toothWidthAfter: number;
}

function getBounds(
  object: THREE.Object3D
) {
  const box =
    new THREE.Box3().setFromObject(
      object
    );

  const size =
    new THREE.Vector3();

  const center =
    new THREE.Vector3();

  box.getSize(size);
  box.getCenter(center);

  return {
    box,
    size,
    center,
  };
}

export function autoFitToothBetweenNeighbors(
  tooth: THREE.Object3D,
  mesial: THREE.Object3D,
  distal: THREE.Object3D,
  options: ToothAutoFitOptions = {}
): ToothAutoFitResult {
  const {
    clearance = 0.05,
    maxScaleUp = 1.25,
    maxScaleDown = 0.65,
  } = options;

  const toothBounds =
    getBounds(tooth);

  const mesialBounds =
    getBounds(mesial);

  const distalBounds =
    getBounds(distal);

  const midpoint =
    mesialBounds.center
      .clone()
      .add(
        distalBounds.center
      )
      .multiplyScalar(0.5);

  const centerDistance =
    mesialBounds.center.distanceTo(
      distalBounds.center
    );

  const mesialHalfWidth =
    mesialBounds.size.x / 2;

  const distalHalfWidth =
    distalBounds.size.x / 2;

  const availableWidth =
    Math.max(
      0.1,
      centerDistance -
        mesialHalfWidth -
        distalHalfWidth -
        clearance * 2
    );

  const toothWidthBefore =
    Math.max(
      toothBounds.size.x,
      0.0001
    );

  let scale =
    availableWidth /
    toothWidthBefore;

  scale =
    THREE.MathUtils.clamp(
      scale,
      maxScaleDown,
      maxScaleUp
    );

  tooth.scale.multiplyScalar(
    scale
  );

  tooth.position.copy(
    midpoint
  );

  tooth.updateMatrixWorld(
    true
  );

  const finalBounds =
    getBounds(tooth);

  return {
    position:
      midpoint.clone(),

    scale,

    availableWidth,

    toothWidthBefore,

    toothWidthAfter:
      finalBounds.size.x,
  };
}

export function centerToothBetweenObjects(
  tooth: THREE.Object3D,
  first: THREE.Object3D,
  second: THREE.Object3D
) {
  const firstCenter =
    getBounds(first).center;

  const secondCenter =
    getBounds(second).center;

  const midpoint =
    firstCenter
      .clone()
      .add(secondCenter)
      .multiplyScalar(0.5);

  tooth.position.copy(
    midpoint
  );

  tooth.updateMatrixWorld(
    true
  );

  return midpoint;
}