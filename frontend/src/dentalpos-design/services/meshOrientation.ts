import * as THREE from "three";

export type DentalArch =
  | "superior"
  | "inferior"
  | "unknown";

export interface MeshOrientationResult {
  arch: DentalArch;

  confidence: number;

  center: THREE.Vector3;

  size: THREE.Vector3;

  suggestedRotation: THREE.Euler;
}

export function analyzeMeshOrientation(
  sourceGeometry: THREE.BufferGeometry
): MeshOrientationResult {
  const geometry =
    sourceGeometry.clone();

  geometry.computeBoundingBox();

  const box =
    geometry.boundingBox;

  if (!box) {
    geometry.dispose();

    throw new Error(
      "Não foi possível analisar a orientação da malha."
    );
  }

  const center =
    new THREE.Vector3();

  const size =
    new THREE.Vector3();

  box.getCenter(center);
  box.getSize(size);

  /*
   * Nesta primeira versão não fazemos
   * diagnóstico anatômico automático.
   *
   * Mantemos a orientação original do scanner.
   */

  const suggestedRotation =
    new THREE.Euler(
      0,
      0,
      0
    );

  geometry.dispose();

  return {
    arch: "unknown",

    confidence: 0,

    center,
    size,

    suggestedRotation,
  };
}

export function applyMeshOrientation(
  sourceGeometry: THREE.BufferGeometry,
  rotation: THREE.Euler
) {
  const geometry =
    sourceGeometry.clone();

  const matrix =
    new THREE.Matrix4();

  matrix.makeRotationFromEuler(
    rotation
  );

  geometry.applyMatrix4(
    matrix
  );

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

export function rotateMeshX(
  sourceGeometry: THREE.BufferGeometry,
  degrees: number
) {
  const geometry =
    sourceGeometry.clone();

  geometry.rotateX(
    THREE.MathUtils.degToRad(
      degrees
    )
  );

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

export function rotateMeshY(
  sourceGeometry: THREE.BufferGeometry,
  degrees: number
) {
  const geometry =
    sourceGeometry.clone();

  geometry.rotateY(
    THREE.MathUtils.degToRad(
      degrees
    )
  );

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

export function rotateMeshZ(
  sourceGeometry: THREE.BufferGeometry,
  degrees: number
) {
  const geometry =
    sourceGeometry.clone();

  geometry.rotateZ(
    THREE.MathUtils.degToRad(
      degrees
    )
  );

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}