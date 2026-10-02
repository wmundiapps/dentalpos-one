import * as THREE from "three";

export interface MeshNormalizationResult {
  geometry: THREE.BufferGeometry;

  originalCenter: THREE.Vector3;

  originalSize: THREE.Vector3;

  scale: number;
}

export function normalizeDentalMesh(
  sourceGeometry: THREE.BufferGeometry
): MeshNormalizationResult {
  const geometry =
    sourceGeometry.clone();

  geometry.computeBoundingBox();

  const box =
    geometry.boundingBox;

  if (!box) {
    geometry.dispose();

    throw new Error(
      "Não foi possível calcular os limites da malha."
    );
  }

  const center =
    new THREE.Vector3();

  const size =
    new THREE.Vector3();

  box.getCenter(center);
  box.getSize(size);

  /*
   * Centraliza a arcada.
   */

  geometry.translate(
    -center.x,
    -center.y,
    -center.z
  );

  /*
   * Mantemos escala clínica real.
   *
   * Nenhum redimensionamento automático.
   */

  const scale = 1;

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return {
    geometry,

    originalCenter:
      center.clone(),

    originalSize:
      size.clone(),

    scale,
  };
}

export function restoreDentalMeshPosition(
  normalizedGeometry: THREE.BufferGeometry,
  originalCenter: THREE.Vector3
) {
  const geometry =
    normalizedGeometry.clone();

  geometry.translate(
    originalCenter.x,
    originalCenter.y,
    originalCenter.z
  );

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}