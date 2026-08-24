import * as THREE from "three";

export interface ToothPlacementOptions {
  offsetX?: number;
  offsetY?: number;
  offsetZ?: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
}

export interface ToothPlacementResult {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  center: THREE.Vector3;
}

function getObjectCenter(
  object: THREE.Object3D
) {
  const box =
    new THREE.Box3().setFromObject(
      object
    );

  return box.getCenter(
    new THREE.Vector3()
  );
}

export function placeToothAtPoint(
  tooth: THREE.Object3D,
  target: THREE.Vector3,
  options: ToothPlacementOptions = {}
): ToothPlacementResult {
  const {
    offsetX = 0,
    offsetY = 0,
    offsetZ = 0,

    rotationX = 0,
    rotationY = 0,
    rotationZ = 0,
  } = options;

  const currentCenter =
    getObjectCenter(tooth);

  const desiredPosition =
    target
      .clone()
      .add(
        new THREE.Vector3(
          offsetX,
          offsetY,
          offsetZ
        )
      );

  const movement =
    desiredPosition
      .clone()
      .sub(currentCenter);

  tooth.position.add(
    movement
  );

  tooth.rotation.set(
    THREE.MathUtils.degToRad(
      rotationX
    ),
    THREE.MathUtils.degToRad(
      rotationY
    ),
    THREE.MathUtils.degToRad(
      rotationZ
    )
  );

  tooth.updateMatrixWorld(
    true
  );

  return {
    position:
      tooth.position.clone(),

    rotation:
      tooth.rotation.clone(),

    center:
      getObjectCenter(tooth),
  };
}

export function alignToothToSurface(
  tooth: THREE.Object3D,
  point: THREE.Vector3,
  normal: THREE.Vector3
) {
  const normalizedNormal =
    normal.clone().normalize();

  const up =
    new THREE.Vector3(
      0,
      1,
      0
    );

  const quaternion =
    new THREE.Quaternion();

  quaternion.setFromUnitVectors(
    up,
    normalizedNormal
  );

  tooth.quaternion.copy(
    quaternion
  );

  const center =
    getObjectCenter(tooth);

  const movement =
    point
      .clone()
      .sub(center);

  tooth.position.add(
    movement
  );

  tooth.updateMatrixWorld(
    true
  );

  return {
    position:
      tooth.position.clone(),

    quaternion:
      tooth.quaternion.clone(),
  };
}

export function moveToothAlongNormal(
  tooth: THREE.Object3D,
  normal: THREE.Vector3,
  distance: number
) {
  const movement =
    normal
      .clone()
      .normalize()
      .multiplyScalar(
        distance
      );

  tooth.position.add(
    movement
  );

  tooth.updateMatrixWorld(
    true
  );

  return tooth.position.clone();
}

export function centerToothOnPoint(
  tooth: THREE.Object3D,
  point: THREE.Vector3
) {
  const center =
    getObjectCenter(tooth);

  tooth.position.add(
    point
      .clone()
      .sub(center)
  );

  tooth.updateMatrixWorld(
    true
  );

  return tooth.position.clone();
}