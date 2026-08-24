import * as THREE from "three";

export type ImplantConnectionType =
  | "custom"
  | "tibase"
  | "multiunit"
  | "magnetic"
  | "w48";

export interface ImplantFitOptions {
  connectionType?: ImplantConnectionType;

  platformDiameter?: number;

  cementGap?: number;

  emergenceHeight?: number;

  rotationalOffset?: number;
}

export interface ImplantFitResult {
  connectionType: ImplantConnectionType;

  platformDiameter: number;

  targetDiameter: number;

  currentDiameter: number;

  scaleFactor: number;

  movement: THREE.Vector3;

  aligned: boolean;
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

export function alignRestorationToImplant(
  restoration: THREE.Object3D,
  implantComponent: THREE.Object3D,
  options: ImplantFitOptions = {}
): ImplantFitResult {
  const {
    connectionType = "custom",
    platformDiameter = 4,
    cementGap = 0.05,
    emergenceHeight = 2,
    rotationalOffset = 0,
  } = options;

  const implantBounds =
    getBounds(
      implantComponent
    );

  const restorationBounds =
    getBounds(
      restoration
    );

  const movement =
    implantBounds.center
      .clone()
      .sub(
        restorationBounds.center
      );

  restoration.position.add(
    movement
  );

  if (
    rotationalOffset !== 0
  ) {
    restoration.rotateY(
      THREE.MathUtils.degToRad(
        rotationalOffset
      )
    );
  }

  restoration.position.y +=
    emergenceHeight;

  restoration.updateMatrixWorld(
    true
  );

  const updatedBounds =
    getBounds(
      restoration
    );

  const currentDiameter =
    Math.max(
      updatedBounds.size.x,
      updatedBounds.size.z,
      0.0001
    );

  const targetDiameter =
    platformDiameter +
    cementGap * 2;

  const scaleFactor =
    targetDiameter /
    currentDiameter;

  return {
    connectionType,

    platformDiameter,

    targetDiameter,

    currentDiameter,

    scaleFactor,

    movement,

    aligned: true,
  };
}

export function fitCervicalRegionToImplant(
  restoration: THREE.Mesh,
  implantComponent: THREE.Object3D,
  options: ImplantFitOptions = {}
) {
  const {
    platformDiameter = 4,
    cementGap = 0.05,
    emergenceHeight = 2,
  } = options;

  implantComponent.updateMatrixWorld(
    true
  );

  const geometry =
    restoration.geometry.clone();

  geometry.computeBoundingBox();

  const box =
    geometry.boundingBox;

  const position =
    geometry.getAttribute(
      "position"
    );

  if (
    !box ||
    !position
  ) {
    geometry.dispose();

    throw new Error(
      "Não foi possível ajustar a região cervical."
    );
  }

  const center =
    box.getCenter(
      new THREE.Vector3()
    );

  const cervicalLevel =
    box.min.y;

  const targetRadius =
    platformDiameter / 2 +
    cementGap;

  const transitionHeight =
    Math.max(
      emergenceHeight,
      0.1
    );

  for (
    let index = 0;
    index < position.count;
    index += 1
  ) {
    const x =
      position.getX(index);

    const y =
      position.getY(index);

    const z =
      position.getZ(index);

    const height =
      y - cervicalLevel;

    if (
      height < 0 ||
      height >
        transitionHeight
    ) {
      continue;
    }

    const dx =
      x - center.x;

    const dz =
      z - center.z;

    const radius =
      Math.sqrt(
        dx * dx +
        dz * dz
      );

    if (
      radius <= 0.0001
    ) {
      continue;
    }

    const normalizedHeight =
      THREE.MathUtils.clamp(
        height /
          transitionHeight,
        0,
        1
      );

    const smooth =
      normalizedHeight *
      normalizedHeight *
      (
        3 -
        2 *
          normalizedHeight
      );

    const targetScale =
      targetRadius /
      radius;

    const scale =
      THREE.MathUtils.lerp(
        targetScale,
        1,
        smooth
      );

    position.setXYZ(
      index,

      center.x +
        dx * scale,

      y,

      center.z +
        dz * scale
    );
  }

  position.needsUpdate =
    true;

  geometry.deleteAttribute(
    "normal"
  );

  geometry.computeVertexNormals();

  geometry.computeBoundingBox();

  geometry.computeBoundingSphere();

  const previousGeometry =
    restoration.geometry;

  restoration.geometry =
    geometry;

  previousGeometry.dispose();

  restoration.updateMatrixWorld(
    true
  );

  return {
    platformDiameter,

    cementGap,

    emergenceHeight,

    targetDiameter:
      targetRadius * 2,
  };
}

export function centerOnImplantAxis(
  restoration: THREE.Object3D,
  implantComponent: THREE.Object3D
) {
  const restorationBounds =
    getBounds(
      restoration
    );

  const implantBounds =
    getBounds(
      implantComponent
    );

  const movement =
    new THREE.Vector3(
      implantBounds.center.x -
        restorationBounds.center.x,

      0,

      implantBounds.center.z -
        restorationBounds.center.z
    );

  restoration.position.add(
    movement
  );

  restoration.updateMatrixWorld(
    true
  );

  return movement;
}