import * as THREE from "three";

import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

import {
  getToothFromLibrary,
  type ToothLibraryItem,
} from "./toothLibrary";

export interface LoadedLibraryTooth {
  tooth: ToothLibraryItem;
  geometry: THREE.BufferGeometry;
  mesh: THREE.Mesh;
}

export function getToothLibraryPath(
  toothNumber: number
) {
  const tooth =
    getToothFromLibrary(
      toothNumber
    );

  if (!tooth) {
    throw new Error(
      `Dente ${toothNumber} não encontrado na biblioteca.`
    );
  }

  return `/dentalpos-design/teeth/${tooth.fileName}`;
}

export async function loadToothFromLibrary(
  toothNumber: number
): Promise<LoadedLibraryTooth> {
  const tooth =
    getToothFromLibrary(
      toothNumber
    );

  if (!tooth) {
    throw new Error(
      `Dente ${toothNumber} não encontrado na biblioteca.`
    );
  }

  const path =
    getToothLibraryPath(
      toothNumber
    );

  const response =
    await fetch(path);

  if (!response.ok) {
    throw new Error(
      `Arquivo ${tooth.fileName} não encontrado na biblioteca DentalPos.`
    );
  }

  const buffer =
    await response.arrayBuffer();

  const loader =
    new STLLoader();

  const geometry =
    loader.parse(buffer);

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material =
    new THREE.MeshStandardMaterial({
      color: 0xf4f1e8,
      roughness: 0.55,
      metalness: 0,
      side: THREE.DoubleSide,
    });

  const mesh =
    new THREE.Mesh(
      geometry,
      material
    );

  mesh.name =
    `DENTALPOS_TOOTH_${toothNumber}`;

  mesh.userData = {
    type: "tooth",
    toothNumber,
    toothName:
      tooth.name,
    arch:
      tooth.arch,
    group:
      tooth.group,
  };

  return {
    tooth,
    geometry,
    mesh,
  };
}

export async function toothExistsInLibrary(
  toothNumber: number
) {
  try {
    const path =
      getToothLibraryPath(
        toothNumber
      );

    const response =
      await fetch(
        path,
        {
          method: "HEAD",
        }
      );

    return response.ok;
  } catch {
    return false;
  }
}

export function disposeLibraryTooth(
  loaded:
    | LoadedLibraryTooth
    | null
    | undefined
) {
  if (!loaded) {
    return;
  }

  loaded.geometry.dispose();

  const material =
    loaded.mesh.material;

  if (
    Array.isArray(material)
  ) {
    material.forEach(
      (item) =>
        item.dispose()
    );
  } else {
    material.dispose();
  }
}