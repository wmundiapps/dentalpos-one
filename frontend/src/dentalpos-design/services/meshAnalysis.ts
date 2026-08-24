import * as THREE from "three";

export interface DentalMeshAnalysis {
  triangleCount: number;
  vertexCount: number;

  surfaceArea: number;

  boundingBox: {
    width: number;
    height: number;
    depth: number;
  };

  center: {
    x: number;
    y: number;
    z: number;
  };

  min: {
    x: number;
    y: number;
    z: number;
  };

  max: {
    x: number;
    y: number;
    z: number;
  };
}

export function analyzeDentalMesh(
  sourceGeometry: THREE.BufferGeometry
): DentalMeshAnalysis {
  const geometry =
    sourceGeometry.index
      ? sourceGeometry.toNonIndexed()
      : sourceGeometry.clone();

  const position =
    geometry.getAttribute("position");

  if (!position) {
    geometry.dispose();

    throw new Error(
      "Geometria sem dados de posição."
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

  const size =
    new THREE.Vector3();

  const center =
    new THREE.Vector3();

  box.getSize(size);
  box.getCenter(center);

  const triangleCount =
    Math.floor(position.count / 3);

  let surfaceArea = 0;

  const a =
    new THREE.Vector3();

  const b =
    new THREE.Vector3();

  const c =
    new THREE.Vector3();

  const ab =
    new THREE.Vector3();

  const ac =
    new THREE.Vector3();

  const cross =
    new THREE.Vector3();

  for (
    let index = 0;
    index + 2 < position.count;
    index += 3
  ) {
    a.set(
      position.getX(index),
      position.getY(index),
      position.getZ(index)
    );

    b.set(
      position.getX(index + 1),
      position.getY(index + 1),
      position.getZ(index + 1)
    );

    c.set(
      position.getX(index + 2),
      position.getY(index + 2),
      position.getZ(index + 2)
    );

    ab.subVectors(b, a);
    ac.subVectors(c, a);

    cross.crossVectors(
      ab,
      ac
    );

    surfaceArea +=
      cross.length() * 0.5;
  }

  const result: DentalMeshAnalysis = {
    triangleCount,

    vertexCount:
      position.count,

    surfaceArea,

    boundingBox: {
      width: size.x,
      height: size.y,
      depth: size.z,
    },

    center: {
      x: center.x,
      y: center.y,
      z: center.z,
    },

    min: {
      x: box.min.x,
      y: box.min.y,
      z: box.min.z,
    },

    max: {
      x: box.max.x,
      y: box.max.y,
      z: box.max.z,
    },
  };

  geometry.dispose();

  return result;
}