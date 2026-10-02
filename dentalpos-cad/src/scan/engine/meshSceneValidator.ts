import * as THREE from "three";

export interface SceneValidationResult {
  meshCount: number;
  archCount: number;
  duplicateGeometryReferences: number;
  overlappingMeshes: number;
  valid: boolean;
  messages: string[];
}

export function validateDentalScene(
  scene: THREE.Scene
): SceneValidationResult {
  const meshes: THREE.Mesh[] = [];

  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      meshes.push(object);
    }
  });

  const archMeshes = meshes.filter(
    (mesh) =>
      mesh.name === "DENTALPOS_SINGLE_ARCH"
  );

  const geometryReferences =
    new Map<string, number>();

  for (const mesh of meshes) {
    const geometryId =
      mesh.geometry.uuid;

    geometryReferences.set(
      geometryId,
      (geometryReferences.get(
        geometryId
      ) ?? 0) + 1
    );
  }

  let duplicateGeometryReferences = 0;

  geometryReferences.forEach(
    (count) => {
      if (count > 1) {
        duplicateGeometryReferences +=
          count - 1;
      }
    }
  );

  let overlappingMeshes = 0;

  for (
    let firstIndex = 0;
    firstIndex < meshes.length;
    firstIndex += 1
  ) {
    const first =
      meshes[firstIndex];

    const firstBox =
      new THREE.Box3().setFromObject(
        first
      );

    for (
      let secondIndex =
        firstIndex + 1;
      secondIndex < meshes.length;
      secondIndex += 1
    ) {
      const second =
        meshes[secondIndex];

      const secondBox =
        new THREE.Box3().setFromObject(
          second
        );

      const samePosition =
        first.position.distanceTo(
          second.position
        ) < 0.0001;

      const sameRotation =
        Math.abs(
          first.rotation.x -
            second.rotation.x
        ) < 0.0001 &&
        Math.abs(
          first.rotation.y -
            second.rotation.y
        ) < 0.0001 &&
        Math.abs(
          first.rotation.z -
            second.rotation.z
        ) < 0.0001;

      const sameScale =
        first.scale.distanceTo(
          second.scale
        ) < 0.0001;

      const intersects =
        firstBox.intersectsBox(
          secondBox
        );

      if (
        intersects &&
        samePosition &&
        sameRotation &&
        sameScale
      ) {
        overlappingMeshes += 1;
      }
    }
  }

  const messages: string[] = [];

  if (archMeshes.length > 1) {
    messages.push(
      `${archMeshes.length} arcadas principais foram encontradas na cena.`
    );
  }

  if (
    duplicateGeometryReferences > 0
  ) {
    messages.push(
      `${duplicateGeometryReferences} referências de geometria estão duplicadas.`
    );
  }

  if (overlappingMeshes > 0) {
    messages.push(
      `${overlappingMeshes} possíveis sobreposições de objetos foram detectadas.`
    );
  }

  if (messages.length === 0) {
    messages.push(
      "Nenhuma duplicação de objetos foi detectada na cena."
    );
  }

  const valid =
    archMeshes.length <= 1 &&
    duplicateGeometryReferences === 0 &&
    overlappingMeshes === 0;

  return {
    meshCount:
      meshes.length,

    archCount:
      archMeshes.length,

    duplicateGeometryReferences,

    overlappingMeshes,

    valid,

    messages,
  };
}