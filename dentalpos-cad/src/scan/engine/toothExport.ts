import * as THREE from "three";

import {
  STLExporter,
} from "three/examples/jsm/exporters/STLExporter.js";

export interface ToothExportOptions {
  binary?: boolean;

  fileName?: string;

  applyWorldTransform?: boolean;
}

export interface ToothExportResult {
  fileName: string;

  blob: Blob;

  size: number;

  binary: boolean;
}

export function exportToothToSTL(
  mesh: THREE.Mesh,
  toothNumber: number,
  options: ToothExportOptions = {}
): ToothExportResult {
  const {
    binary = true,

    fileName =
      `DentalPos_${toothNumber}.stl`,

    applyWorldTransform = true,
  } = options;

  const exporter =
    new STLExporter();

  const exportMesh =
    prepareMeshForExport(
      mesh,
      applyWorldTransform
    );

  const result =
    exporter.parse(
      exportMesh,
      {
        binary,
      }
    );

  let blob: Blob;

  if (
    result instanceof
    DataView
  ) {
    const buffer =
      result.buffer.slice(
        result.byteOffset,
        result.byteOffset +
          result.byteLength
      );

    blob =
      new Blob(
        [buffer],
        {
          type:
            "model/stl",
        }
      );
  } else {
    blob =
      new Blob(
        [result],
        {
          type:
            "model/stl",
        }
      );
  }

  disposePreparedMesh(
    exportMesh
  );

  return {
    fileName,

    blob,

    size:
      blob.size,

    binary,
  };
}

export function downloadToothSTL(
  mesh: THREE.Mesh,
  toothNumber: number,
  options: ToothExportOptions = {}
) {
  const result =
    exportToothToSTL(
      mesh,
      toothNumber,
      options
    );

  const url =
    URL.createObjectURL(
      result.blob
    );

  const anchor =
    document.createElement(
      "a"
    );

  anchor.href =
    url;

  anchor.download =
    result.fileName;

  document.body.appendChild(
    anchor
  );

  anchor.click();

  document.body.removeChild(
    anchor
  );

  setTimeout(
    () => {
      URL.revokeObjectURL(
        url
      );
    },
    100
  );

  return result;
}

function prepareMeshForExport(
  source: THREE.Mesh,
  applyWorldTransform: boolean
) {
  source.updateMatrixWorld(
    true
  );

  const geometry =
    source.geometry.clone();

  if (
    applyWorldTransform
  ) {
    geometry.applyMatrix4(
      source.matrixWorld
    );
  }

  geometry.computeVertexNormals();

  geometry.computeBoundingBox();

  geometry.computeBoundingSphere();

  const material =
    new THREE.MeshStandardMaterial();

  const mesh =
    new THREE.Mesh(
      geometry,
      material
    );

  mesh.name =
    `${source.name}_EXPORT`;

  return mesh;
}

function disposePreparedMesh(
  mesh: THREE.Mesh
) {
  mesh.geometry.dispose();

  const materials =
    Array.isArray(
      mesh.material
    )
      ? mesh.material
      : [mesh.material];

  materials.forEach(
    (material) =>
      material.dispose()
  );
}