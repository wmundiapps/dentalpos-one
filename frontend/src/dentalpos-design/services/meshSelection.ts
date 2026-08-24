import * as THREE from "three";

export interface SelectedSurface {
  faceIndex: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

export function selectMeshSurface(
  mesh: THREE.Mesh,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  clientX: number,
  clientY: number
): SelectedSurface | null {
  const rect =
    renderer.domElement.getBoundingClientRect();

  const pointer =
    new THREE.Vector2(
      ((clientX - rect.left) /
        rect.width) *
        2 -
        1,

      -(
        (clientY - rect.top) /
        rect.height
      ) *
        2 +
        1
    );

  const raycaster =
    new THREE.Raycaster();

  raycaster.setFromCamera(
    pointer,
    camera
  );

  const intersections =
    raycaster.intersectObject(
      mesh,
      false
    );

  if (
    intersections.length === 0
  ) {
    return null;
  }

  const hit =
    intersections[0];

  const faceIndex =
    hit.faceIndex ?? -1;

  const normal =
    hit.face?.normal
      ? hit.face.normal.clone()
      : new THREE.Vector3(
          0,
          0,
          1
        );

  normal.transformDirection(
    mesh.matrixWorld
  );

  return {
    faceIndex,
    point:
      hit.point.clone(),
    normal,
  };
}

export function createSurfaceMarker(
  selection: SelectedSurface
) {
  const group =
    new THREE.Group();

  group.name =
    "DENTALPOS_SURFACE_SELECTION";

  const sphereGeometry =
    new THREE.SphereGeometry(
      0.5,
      18,
      18
    );

  const sphereMaterial =
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      depthTest: false,
    });

  const sphere =
    new THREE.Mesh(
      sphereGeometry,
      sphereMaterial
    );

  sphere.position.copy(
    selection.point
  );

  sphere.renderOrder =
    1000;

  group.add(
    sphere
  );

  const normalEnd =
    selection.point
      .clone()
      .add(
        selection.normal
          .clone()
          .multiplyScalar(4)
      );

  const lineGeometry =
    new THREE.BufferGeometry()
      .setFromPoints([
        selection.point,
        normalEnd,
      ]);

  const lineMaterial =
    new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      depthTest: false,
    });

  const normalLine =
    new THREE.Line(
      lineGeometry,
      lineMaterial
    );

  normalLine.renderOrder =
    999;

  group.add(
    normalLine
  );

  return group;
}

export function clearSurfaceSelection(
  scene: THREE.Scene
) {
  const selection =
    scene.getObjectByName(
      "DENTALPOS_SURFACE_SELECTION"
    );

  if (!selection) {
    return;
  }

  scene.remove(
    selection
  );

  selection.traverse(
    (object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Line
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