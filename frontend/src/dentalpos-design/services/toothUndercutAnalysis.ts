import * as THREE from "three";

import type {
  InsertionAxis,
} from "./toothInsertionAxis";

export interface UndercutAnalysisOptions {
  angleThreshold?: number;
}

export interface UndercutAnalysisResult {
  totalFaces: number;

  undercutFaces: number;

  undercutPercentage: number;

  hasUndercut: boolean;

  severity:
    | "none"
    | "low"
    | "moderate"
    | "high";
}

export function analyzeUndercuts(
  mesh: THREE.Mesh,
  insertionAxis: InsertionAxis,
  options: UndercutAnalysisOptions = {}
): UndercutAnalysisResult {
  const {
    angleThreshold = 90,
  } = options;

  const geometry =
    mesh.geometry.index
      ? mesh.geometry.toNonIndexed()
      : mesh.geometry.clone();

  const position =
    geometry.getAttribute(
      "position"
    );

  if (!position) {
    geometry.dispose();

    throw new Error(
      "Geometria sem posições para análise de retenções."
    );
  }

  const axis =
    insertionAxis.direction
      .clone()
      .normalize();

  const worldQuaternion =
    mesh.getWorldQuaternion(
      new THREE.Quaternion()
    );

  const totalFaces =
    Math.floor(
      position.count / 3
    );

  let undercutFaces = 0;

  const a =
    new THREE.Vector3();

  const b =
    new THREE.Vector3();

  const c =
    new THREE.Vector3();

  const edge1 =
    new THREE.Vector3();

  const edge2 =
    new THREE.Vector3();

  const normal =
    new THREE.Vector3();

  for (
    let faceIndex = 0;
    faceIndex < totalFaces;
    faceIndex += 1
  ) {
    const index =
      faceIndex * 3;

    a.fromBufferAttribute(
      position,
      index
    );

    b.fromBufferAttribute(
      position,
      index + 1
    );

    c.fromBufferAttribute(
      position,
      index + 2
    );

    edge1.subVectors(
      b,
      a
    );

    edge2.subVectors(
      c,
      a
    );

    normal
      .crossVectors(
        edge1,
        edge2
      )
      .normalize()
      .applyQuaternion(
        worldQuaternion
      );

    const angle =
      THREE.MathUtils.radToDeg(
        normal.angleTo(
          axis
        )
      );

    if (
      angle >
      angleThreshold
    ) {
      undercutFaces += 1;
    }
  }

  geometry.dispose();

  const undercutPercentage =
    totalFaces > 0
      ? (
          undercutFaces /
          totalFaces
        ) *
        100
      : 0;

  let severity:
    | "none"
    | "low"
    | "moderate"
    | "high" =
    "none";

  if (
    undercutPercentage > 0 &&
    undercutPercentage <= 10
  ) {
    severity = "low";
  }

  if (
    undercutPercentage > 10 &&
    undercutPercentage <= 25
  ) {
    severity = "moderate";
  }

  if (
    undercutPercentage > 25
  ) {
    severity = "high";
  }

  return {
    totalFaces,

    undercutFaces,

    undercutPercentage,

    hasUndercut:
      undercutFaces > 0,

    severity,
  };
}

export function createUndercutOverlay(
  mesh: THREE.Mesh,
  insertionAxis: InsertionAxis,
  options: UndercutAnalysisOptions = {}
) {
  const {
    angleThreshold = 90,
  } = options;

  const sourceGeometry =
    mesh.geometry.index
      ? mesh.geometry.toNonIndexed()
      : mesh.geometry.clone();

  const position =
    sourceGeometry.getAttribute(
      "position"
    );

  if (!position) {
    sourceGeometry.dispose();

    throw new Error(
      "Geometria sem posições."
    );
  }

  const axis =
    insertionAxis.direction
      .clone()
      .normalize();

  const worldQuaternion =
    mesh.getWorldQuaternion(
      new THREE.Quaternion()
    );

  const vertices: number[] =
    [];

  const a =
    new THREE.Vector3();

  const b =
    new THREE.Vector3();

  const c =
    new THREE.Vector3();

  const edge1 =
    new THREE.Vector3();

  const edge2 =
    new THREE.Vector3();

  const normal =
    new THREE.Vector3();

  const totalFaces =
    Math.floor(
      position.count / 3
    );

  for (
    let faceIndex = 0;
    faceIndex < totalFaces;
    faceIndex += 1
  ) {
    const index =
      faceIndex * 3;

    a.fromBufferAttribute(
      position,
      index
    );

    b.fromBufferAttribute(
      position,
      index + 1
    );

    c.fromBufferAttribute(
      position,
      index + 2
    );

    edge1.subVectors(
      b,
      a
    );

    edge2.subVectors(
      c,
      a
    );

    normal
      .crossVectors(
        edge1,
        edge2
      )
      .normalize()
      .applyQuaternion(
        worldQuaternion
      );

    const angle =
      THREE.MathUtils.radToDeg(
        normal.angleTo(
          axis
        )
      );

    if (
      angle >
      angleThreshold
    ) {
      vertices.push(
        a.x,
        a.y,
        a.z,

        b.x,
        b.y,
        b.z,

        c.x,
        c.y,
        c.z
      );
    }
  }

  sourceGeometry.dispose();

  const geometry =
    new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      vertices,
      3
    )
  );

  geometry.computeVertexNormals();

  const material =
    new THREE.MeshBasicMaterial({
      color: 0xef4444,

      transparent: true,

      opacity: 0.55,

      side: THREE.DoubleSide,

      depthWrite: false,

      polygonOffset: true,

      polygonOffsetFactor: -2,

      polygonOffsetUnits: -2,
    });

  const overlay =
    new THREE.Mesh(
      geometry,
      material
    );

  overlay.name =
    "DENTALPOS_UNDERCUT_OVERLAY";

  overlay.position.copy(
    mesh.position
  );

  overlay.quaternion.copy(
    mesh.quaternion
  );

  overlay.scale.copy(
    mesh.scale
  );

  overlay.renderOrder =
    1600;

  return overlay;
}

export function clearUndercutOverlay(
  scene: THREE.Scene
) {
  const objects:
    THREE.Object3D[] = [];

  scene.traverse(
    (object) => {
      if (
        object.name ===
        "DENTALPOS_UNDERCUT_OVERLAY"
      ) {
        objects.push(
          object
        );
      }
    }
  );

  objects.forEach(
    (object) => {
      scene.remove(
        object
      );

      if (
        object instanceof
        THREE.Mesh
      ) {
        object.geometry.dispose();

        const materials =
          Array.isArray(
            object.material
          )
            ? object.material
            : [
                object.material,
              ];

        materials.forEach(
          (material) =>
            material.dispose()
        );
      }
    }
  );
}