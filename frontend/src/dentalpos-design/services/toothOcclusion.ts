import * as THREE from "three";

export interface OcclusalAnalysisResult {
  minimumDistance: number;

  collision: boolean;

  contact: boolean;

  clearance: boolean;

  status:
    | "collision"
    | "contact"
    | "clearance";

  contactPointTooth:
    THREE.Vector3;

  contactPointAntagonist:
    THREE.Vector3;
}

export interface OcclusalOptions {
  contactDistance?: number;
  clearanceDistance?: number;
}

function getWorldBoundingBox(
  object: THREE.Object3D
) {
  object.updateMatrixWorld(
    true
  );

  return new THREE.Box3()
    .setFromObject(
      object
    );
}

export function analyzeOcclusion(
  tooth: THREE.Object3D,
  antagonist: THREE.Object3D,
  options: OcclusalOptions = {}
): OcclusalAnalysisResult {
  const {
    contactDistance = 0.15,
    clearanceDistance = 0.4,
  } = options;

  const toothBox =
    getWorldBoundingBox(
      tooth
    );

  const antagonistBox =
    getWorldBoundingBox(
      antagonist
    );

  const collision =
    toothBox.intersectsBox(
      antagonistBox
    );

  const toothCenter =
    toothBox.getCenter(
      new THREE.Vector3()
    );

  const antagonistCenter =
    antagonistBox.getCenter(
      new THREE.Vector3()
    );

  const contactPointTooth =
    toothBox.clampPoint(
      antagonistCenter,
      new THREE.Vector3()
    );

  const contactPointAntagonist =
    antagonistBox.clampPoint(
      toothCenter,
      new THREE.Vector3()
    );

  const minimumDistance =
    collision
      ? 0
      : contactPointTooth.distanceTo(
          contactPointAntagonist
        );

  let status:
    | "collision"
    | "contact"
    | "clearance";

  if (collision) {
    status = "collision";
  } else if (
    minimumDistance <=
    contactDistance
  ) {
    status = "contact";
  } else {
    status = "clearance";
  }

  return {
    minimumDistance,

    collision,

    contact:
      status === "contact",

    clearance:
      minimumDistance >
      clearanceDistance,

    status,

    contactPointTooth,

    contactPointAntagonist,
  };
}

export function createOcclusalContactMarker(
  position: THREE.Vector3,
  status:
    | "collision"
    | "contact"
    | "clearance"
) {
  let color =
    0x22c55e;

  if (
    status === "contact"
  ) {
    color =
      0xf59e0b;
  }

  if (
    status === "collision"
  ) {
    color =
      0xef4444;
  }

  const geometry =
    new THREE.SphereGeometry(
      0.35,
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
    "DENTALPOS_OCCLUSAL_CONTACT";

  marker.position.copy(
    position
  );

  marker.renderOrder =
    1200;

  return marker;
}

export function clearOcclusalContacts(
  scene: THREE.Scene
) {
  const objects:
    THREE.Object3D[] = [];

  scene.traverse(
    (object) => {
      if (
        object.name ===
        "DENTALPOS_OCCLUSAL_CONTACT"
      ) {
        objects.push(
          object
        );
      }
    }
  );

  objects.forEach(
    (object) => {
      scene.remove(
        object
      );

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