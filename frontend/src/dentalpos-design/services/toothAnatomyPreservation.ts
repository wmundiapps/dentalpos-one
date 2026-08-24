import * as THREE from "three";

export interface AnatomyPreservationOptions {
  strength?: number;
  preserveOcclusal?: boolean;
  preserveCervical?: boolean;
  occlusalRegion?: number;
  cervicalRegion?: number;
}

export interface AnatomyPreservationResult {
  modifiedVertices: number;
  preservedVertices: number;
  strength: number;
}

export function preserveToothAnatomy(
  mesh: THREE.Mesh,
  referenceGeometry: THREE.BufferGeometry,
  options: AnatomyPreservationOptions = {}
): AnatomyPreservationResult {
  const {
    strength = 0.75,
    preserveOcclusal = true,
    preserveCervical = true,
    occlusalRegion = 0.25,
    cervicalRegion = 0.2,
  } = options;

  const safeStrength =
    THREE.MathUtils.clamp(
      strength,
      0,
      1
    );

  const geometry =
    mesh.geometry.clone();

  const position =
    geometry.getAttribute(
      "position"
    );

  const referencePosition =
    referenceGeometry.getAttribute(
      "position"
    );

  if (
    !position ||
    !referencePosition
  ) {
    geometry.dispose();

    throw new Error(
      "Geometria inválida para preservação anatômica."
    );
  }

  if (
    position.count !==
    referencePosition.count
  ) {
    geometry.dispose();

    throw new Error(
      "A geometria atual e a geometria de referência possuem topologias diferentes."
    );
  }

  geometry.computeBoundingBox();

  const box =
    geometry.boundingBox;

  if (!box) {
    geometry.dispose();

    throw new Error(
      "Não foi possível calcular os limites da geometria."
    );
  }

  const height =
    Math.max(
      box.max.y - box.min.y,
      0.0001
    );

  const current =
    new THREE.Vector3();

  const reference =
    new THREE.Vector3();

  let modifiedVertices = 0;

  let preservedVertices = 0;

  for (
    let index = 0;
    index < position.count;
    index += 1
  ) {
    current.fromBufferAttribute(
      position,
      index
    );

    reference.fromBufferAttribute(
      referencePosition,
      index
    );

    const normalizedHeight =
      THREE.MathUtils.clamp(
        (
          current.y -
          box.min.y
        ) /
          height,
        0,
        1
      );

    let regionStrength =
      safeStrength;

    if (
      preserveCervical &&
      normalizedHeight <=
        cervicalRegion
    ) {
      const cervicalInfluence =
        1 -
        normalizedHeight /
          Math.max(
            cervicalRegion,
            0.0001
          );

      regionStrength =
        Math.max(
          regionStrength,
          cervicalInfluence
        );
    }

    if (
      preserveOcclusal &&
      normalizedHeight >=
        1 -
          occlusalRegion
    ) {
      const occlusalInfluence =
        (
          normalizedHeight -
          (
            1 -
            occlusalRegion
          )
        ) /
        Math.max(
          occlusalRegion,
          0.0001
        );

      regionStrength =
        Math.max(
          regionStrength,
          occlusalInfluence
        );
    }

    const finalPosition =
      current
        .clone()
        .lerp(
          reference,
          THREE.MathUtils.clamp(
            regionStrength,
            0,
            1
          )
        );

    const displacement =
      finalPosition.distanceTo(
        current
      );

    if (
      displacement >
      0.000001
    ) {
      modifiedVertices +=
        1;
    } else {
      preservedVertices +=
        1;
    }

    position.setXYZ(
      index,
      finalPosition.x,
      finalPosition.y,
      finalPosition.z
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
    mesh.geometry;

  mesh.geometry =
    geometry;

  previousGeometry.dispose();

  mesh.updateMatrixWorld(
    true
  );

  return {
    modifiedVertices,

    preservedVertices,

    strength:
      safeStrength,
  };
}

export function createAnatomyReference(
  mesh: THREE.Mesh
) {
  const reference =
    mesh.geometry.clone();

  reference.computeVertexNormals();

  reference.computeBoundingBox();

  reference.computeBoundingSphere();

  return reference;
}

export function restoreOriginalAnatomy(
  mesh: THREE.Mesh,
  referenceGeometry: THREE.BufferGeometry
) {
  const previousGeometry =
    mesh.geometry;

  mesh.geometry =
    referenceGeometry.clone();

  mesh.geometry.computeVertexNormals();

  mesh.geometry.computeBoundingBox();

  mesh.geometry.computeBoundingSphere();

  previousGeometry.dispose();

  mesh.updateMatrixWorld(
    true
  );
}