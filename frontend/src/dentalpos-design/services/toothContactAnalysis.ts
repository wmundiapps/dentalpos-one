import * as THREE from "three";

export type ContactType =
  | "none"
  | "proximity"
  | "contact"
  | "collision";

export interface ToothContactResult {
  type: ContactType;

  distance: number;

  collision: boolean;

  pointA: THREE.Vector3;

  pointB: THREE.Vector3;

  midpoint: THREE.Vector3;
}

export interface ContactAnalysisOptions {
  contactTolerance?: number;
  proximityTolerance?: number;
}

function getBox(
  object: THREE.Object3D
) {
  object.updateMatrixWorld(true);

  return new THREE.Box3().setFromObject(
    object
  );
}

export function analyzeToothContact(
  first: THREE.Object3D,
  second: THREE.Object3D,
  options: ContactAnalysisOptions = {}
): ToothContactResult {
  const {
    contactTolerance = 0.12,
    proximityTolerance = 0.5,
  } = options;

  const firstBox =
    getBox(first);

  const secondBox =
    getBox(second);

  const collision =
    firstBox.intersectsBox(
      secondBox
    );

  const firstCenter =
    firstBox.getCenter(
      new THREE.Vector3()
    );

  const secondCenter =
    secondBox.getCenter(
      new THREE.Vector3()
    );

  const pointA =
    firstBox.clampPoint(
      secondCenter,
      new THREE.Vector3()
    );

  const pointB =
    secondBox.clampPoint(
      firstCenter,
      new THREE.Vector3()
    );

  const distance =
    collision
      ? 0
      : pointA.distanceTo(
          pointB
        );

  let type: ContactType =
    "none";

  if (collision) {
    type =
      "collision";
  } else if (
    distance <=
    contactTolerance
  ) {
    type =
      "contact";
  } else if (
    distance <=
    proximityTolerance
  ) {
    type =
      "proximity";
  }

  const midpoint =
    pointA
      .clone()
      .add(pointB)
      .multiplyScalar(0.5);

  return {
    type,

    distance,

    collision,

    pointA,

    pointB,

    midpoint,
  };
}

export function createContactMarker(
  result: ToothContactResult
) {
  let color =
    0x64748b;

  if (
    result.type ===
    "proximity"
  ) {
    color =
      0x38bdf8;
  }

  if (
    result.type ===
    "contact"
  ) {
    color =
      0xf59e0b;
  }

  if (
    result.type ===
    "collision"
  ) {
    color =
      0xef4444;
  }

  const geometry =
    new THREE.SphereGeometry(
      0.3,
      16,
      16
    );

  const material =
    new THREE.MeshBasicMaterial({
      color,
      depthTest: false,
    });

  const marker =
    new THREE.Mesh(
      geometry,
      material
    );

  marker.name =
    "DENTALPOS_CONTACT_MARKER";

  marker.position.copy(
    result.midpoint
  );

  marker.renderOrder =
    1300;

  return marker;
}

export function clearContactMarkers(
  scene: THREE.Scene
) {
  const markers:
    THREE.Object3D[] = [];

  scene.traverse(
    (object) => {
      if (
        object.name ===
        "DENTALPOS_CONTACT_MARKER"
      ) {
        markers.push(
          object
        );
      }
    }
  );

  markers.forEach(
    (object) => {
      scene.remove(object);

      if (
        object instanceof
        THREE.Mesh
      ) {
        object.geometry.dispose();

        const materials =
          Array.isArray(
            object.material
          )
            ? object.material
            : [object.material];

        materials.forEach(
          (material) =>
            material.dispose()
        );
      }
    }
  );
}