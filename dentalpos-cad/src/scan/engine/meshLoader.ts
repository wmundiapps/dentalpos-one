import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

export interface LoadedDentalMesh {
  geometry: THREE.BufferGeometry;
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  depth: number;
  triangles: number;
}

export async function loadSTLFile(
  file: File
): Promise<LoadedDentalMesh> {
  if (
    !file.name
      .toLowerCase()
      .endsWith(".stl")
  ) {
    throw new Error(
      "O arquivo selecionado não é um STL."
    );
  }

  const buffer =
    await file.arrayBuffer();

  const loader =
    new STLLoader();

  const geometry =
    loader.parse(buffer);

  const position =
    geometry.getAttribute(
      "position"
    );

  if (!position) {
    geometry.dispose();

    throw new Error(
      "STL sem dados geométricos."
    );
  }

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const boundingBox =
    geometry.boundingBox;

  if (!boundingBox) {
    geometry.dispose();

    throw new Error(
      "Não foi possível calcular as dimensões do STL."
    );
  }

  const size =
    new THREE.Vector3();

  boundingBox.getSize(size);

  const triangles =
    geometry.index
      ? Math.floor(
          geometry.index.count / 3
        )
      : Math.floor(
          position.count / 3
        );

  return {
    geometry,
    fileName: file.name,
    fileSize: file.size,

    width: size.x,
    height: size.y,
    depth: size.z,

    triangles,
  };
}

export function centerGeometry(
  sourceGeometry: THREE.BufferGeometry
): THREE.BufferGeometry {
  const geometry =
    sourceGeometry.clone();

  geometry.computeBoundingBox();

  const box =
    geometry.boundingBox;

  if (!box) {
    return geometry;
  }

  const center =
    new THREE.Vector3();

  box.getCenter(center);

  geometry.translate(
    -center.x,
    -center.y,
    -center.z
  );

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

export function disposeGeometry(
  geometry:
    | THREE.BufferGeometry
    | null
    | undefined
) {
  if (!geometry) {
    return;
  }

  geometry.dispose();
}