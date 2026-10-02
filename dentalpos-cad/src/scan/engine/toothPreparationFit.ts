import * as THREE from "three";

export interface PreparationFitOptions {
  cementSpace?: number;
  cervicalClearance?: number;
  occlusalClearance?: number;
  radialClearance?: number;
}

export interface PreparationFitResult {
  fitted: boolean;

  preparationCenter: THREE.Vector3;

  restorationCenterBefore: THREE.Vector3;

  restorationCenterAfter: THREE.Vector3;

  movement: THREE.Vector3;

  preparationSize: THREE.Vector3;

  restorationSize: THREE.Vector3;

  recommendedMinimumSize: THREE.Vector3;
}

function getBounds(
  object: THREE.Object3D
) {
  object.updateMatrixWorld(true);

  const box =
    new THREE.Box3().setFromObject(
      object
    );

  const center =
    box.getCenter(
      new THREE.Vector3()
    );

  const size =
    box.getSize(
      new THREE.Vector3()
    );

  return {
    box,
    center,
    size,
  };
}

export function analyzePreparationFit(
  restoration: THREE.Object3D,
  preparation: THREE.Object3D,
  options: PreparationFitOptions = {}
): PreparationFitResult {
  const {
    cementSpace = 0.08,
    cervicalClearance = 0.05,
    occlusalClearance = 0.8,
    radialClearance = 0.1,
  } = options;

  const preparationBounds =
    getBounds(
      preparation
    );

  const restorationBounds =
    getBounds(
      restoration
    );

  const recommendedMinimumSize =
    new THREE.Vector3(
      preparationBounds.size.x +
        radialClearance * 2 +
        cementSpace * 2,

      preparationBounds.size.y +
        cervicalClearance +
        occlusalClearance +
        cementSpace,

      preparationBounds.size.z +
        radialClearance * 2 +
        cementSpace * 2
    );

  const fitted =
    restorationBounds.size.x >=
      recommendedMinimumSize.x &&
    restorationBounds.size.y >=
      recommendedMinimumSize.y &&
    restorationBounds.size.z >=
      recommendedMinimumSize.z;

  return {
    fitted,

    preparationCenter:
      preparationBounds.center.clone(),

    restorationCenterBefore:
      restorationBounds.center.clone(),

    restorationCenterAfter:
      restorationBounds.center.clone(),

    movement:
      new THREE.Vector3(),

    preparationSize:
      preparationBounds.size.clone(),

    restorationSize:
      restorationBounds.size.clone(),

    recommendedMinimumSize,
  };
}

export function centerRestorationOnPreparation(
  restoration: THREE.Object3D,
  preparation: THREE.Object3D
) {
  const preparationBounds =
    getBounds(
      preparation
    );

  const restorationBounds =
    getBounds(
      restoration
    );

  const movement =
    preparationBounds.center
      .clone()
      .sub(
        restorationBounds.center
      );

  restoration.position.add(
    movement
  );

  restoration.updateMatrixWorld(
    true
  );

  return movement;
}

export function autoFitRestorationToPreparation(
  restoration: THREE.Object3D,
  preparation: THREE.Object3D,
  options: PreparationFitOptions = {}
): PreparationFitResult {
  const initialRestorationBounds =
    getBounds(
      restoration
    );

  const restorationCenterBefore =
    initialRestorationBounds.center.clone();

  const movement =
    centerRestorationOnPreparation(
      restoration,
      preparation
    );

  const {
    cementSpace = 0.08,
    cervicalClearance = 0.05,
    occlusalClearance = 0.8,
    radialClearance = 0.1,
  } = options;

  const preparationBounds =
    getBounds(
      preparation
    );

  let restorationBounds =
    getBounds(
      restoration
    );

  const recommendedMinimumSize =
    new THREE.Vector3(
      preparationBounds.size.x +
        radialClearance * 2 +
        cementSpace * 2,

      preparationBounds.size.y +
        cervicalClearance +
        occlusalClearance +
        cementSpace,

      preparationBounds.size.z +
        radialClearance * 2 +
        cementSpace * 2
    );

  const scaleX =
    restorationBounds.size.x > 0
      ? recommendedMinimumSize.x /
        restorationBounds.size.x
      : 1;

  const scaleY =
    restorationBounds.size.y > 0
      ? recommendedMinimumSize.y /
        restorationBounds.size.y
      : 1;

  const scaleZ =
    restorationBounds.size.z > 0
      ? recommendedMinimumSize.z /
        restorationBounds.size.z
      : 1;

  restoration.scale.x *=
    Math.max(
      1,
      scaleX
    );

  restoration.scale.y *=
    Math.max(
      1,
      scaleY
    );

  restoration.scale.z *=
    Math.max(
      1,
      scaleZ
    );

  restoration.updateMatrixWorld(
    true
  );

  centerRestorationOnPreparation(
    restoration,
    preparation
  );

  restorationBounds =
    getBounds(
      restoration
    );

  return {
    fitted: true,

    preparationCenter:
      preparationBounds.center.clone(),

    restorationCenterBefore,

    restorationCenterAfter:
      restorationBounds.center.clone(),

    movement,

    preparationSize:
      preparationBounds.size.clone(),

    restorationSize:
      restorationBounds.size.clone(),

    recommendedMinimumSize,
  };
}

export function calculatePreparationClearance(
  restoration: THREE.Object3D,
  preparation: THREE.Object3D
) {
  const restorationBounds =
    getBounds(
      restoration
    );

  const preparationBounds =
    getBounds(
      preparation
    );

  return {
    x:
      restorationBounds.size.x -
      preparationBounds.size.x,

    y:
      restorationBounds.size.y -
      preparationBounds.size.y,

    z:
      restorationBounds.size.z -
      preparationBounds.size.z,
  };
}