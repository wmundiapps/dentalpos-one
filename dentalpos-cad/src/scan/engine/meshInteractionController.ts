import * as THREE from "three";

export interface MeshSelectionResult {
  mesh: THREE.Mesh;
  point: THREE.Vector3;
  faceIndex: number | null;
  distance: number;
}

export interface PointerCoordinates {
  x: number;
  y: number;
}

export function getPointerCoordinates(
  event: PointerEvent | MouseEvent,
  renderer: THREE.WebGLRenderer
): PointerCoordinates {
  const rect =
    renderer.domElement.getBoundingClientRect();

  const x =
    ((event.clientX - rect.left) /
      rect.width) *
      2 -
    1;

  const y =
    -(
      (event.clientY - rect.top) /
      rect.height
    ) *
      2 +
    1;

  return {
    x,
    y,
  };
}

export function selectDentalMesh(
  event: PointerEvent | MouseEvent,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  objects: THREE.Object3D[]
): MeshSelectionResult | null {
  const pointer =
    getPointerCoordinates(
      event,
      renderer
    );

  const raycaster =
    new THREE.Raycaster();

  raycaster.setFromCamera(
    new THREE.Vector2(
      pointer.x,
      pointer.y
    ),
    camera
  );

  const intersections =
    raycaster.intersectObjects(
      objects,
      true
    );

  for (
    const intersection
    of intersections
  ) {
    if (
      intersection.object instanceof
      THREE.Mesh
    ) {
      return {
        mesh:
          intersection.object,

        point:
          intersection.point.clone(),

        faceIndex:
          intersection.faceIndex ??
          null,

        distance:
          intersection.distance,
      };
    }
  }

  return null;
}

export function highlightMesh(
  mesh: THREE.Mesh,
  color = 0x38bdf8
) {
  const materials =
    Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];

  materials.forEach(
    (material) => {
      if (
        material instanceof
          THREE.MeshStandardMaterial ||
        material instanceof
          THREE.MeshPhongMaterial ||
        material instanceof
          THREE.MeshLambertMaterial
      ) {
        material.emissive.setHex(
          color
        );

        material.emissiveIntensity =
          0.22;

        material.needsUpdate =
          true;

        return;
      }

      if (
        material instanceof
        THREE.MeshBasicMaterial
      ) {
        material.color.setHex(
          color
        );

        material.needsUpdate =
          true;
      }
    }
  );
}

export function clearMeshHighlight(
  mesh: THREE.Mesh
) {
  const materials =
    Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];

  materials.forEach(
    (material) => {
      if (
        material instanceof
          THREE.MeshStandardMaterial ||
        material instanceof
          THREE.MeshPhongMaterial ||
        material instanceof
          THREE.MeshLambertMaterial
      ) {
        material.emissive.setHex(
          0x000000
        );

        material.emissiveIntensity =
          0;

        material.needsUpdate =
          true;
      }
    }
  );
}

export function createSelectionMarker(
  point: THREE.Vector3,
  radius = 0.6
) {
  const geometry =
    new THREE.SphereGeometry(
      radius,
      20,
      20
    );

  const material =
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      depthTest: false,
    });

  const marker =
    new THREE.Mesh(
      geometry,
      material
    );

  marker.name =
    "DENTALPOS_SELECTION_MARKER";

  marker.position.copy(
    point
  );

  marker.renderOrder =
    999;

  return marker;
}

export function removeSelectionMarker(
  scene: THREE.Scene
) {
  const marker =
    scene.getObjectByName(
      "DENTALPOS_SELECTION_MARKER"
    );

  if (!marker) {
    return;
  }

  scene.remove(
    marker
  );

  if (
    marker instanceof
    THREE.Mesh
  ) {
    marker.geometry.dispose();

    const materials =
      Array.isArray(
        marker.material
      )
        ? marker.material
        : [marker.material];

    materials.forEach(
      (material) =>
        material.dispose()
    );
  }
}