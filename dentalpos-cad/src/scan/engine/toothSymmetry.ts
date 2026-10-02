import * as THREE from "three";

export interface ToothSymmetryOptions {
  axis?: "x" | "y" | "z";
  center?: number;
  strength?: number;
}

export interface ToothSymmetryResult {
  modifiedVertices: number;
  axis: "x" | "y" | "z";
  center: number;
  strength: number;
}

export function applyToothSymmetry(
  mesh: THREE.Mesh,
  options: ToothSymmetryOptions = {}
): ToothSymmetryResult {
  const {
    axis = "x",
    strength = 1,
  } = options;

  const geometry =
    mesh.geometry.clone();

  geometry.computeBoundingBox();

  const box =
    geometry.boundingBox;

  const position =
    geometry.getAttribute(
      "position"
    );

  if (!box || !position) {
    geometry.dispose();

    throw new Error(
      "Geometria inválida para simetrização."
    );
  }

  const boundingCenter =
    box.getCenter(
      new THREE.Vector3()
    );

  const center =
    options.center ??
    (
      axis === "x"
        ? boundingCenter.x
        : axis === "y"
          ? boundingCenter.y
          : boundingCenter.z
    );

  const safeStrength =
    THREE.MathUtils.clamp(
      strength,
      0,
      1
    );

  const vertices:
    THREE.Vector3[] = [];

  for (
    let index = 0;
    index < position.count;
    index += 1
  ) {
    vertices.push(
      new THREE.Vector3(
        position.getX(index),
        position.getY(index),
        position.getZ(index)
      )
    );
  }

  let modifiedVertices = 0;

  for (
    let index = 0;
    index < vertices.length;
    index += 1
  ) {
    const vertex =
      vertices[index];

    const coordinate =
      getCoordinate(
        vertex,
        axis
      );

    const mirroredCoordinate =
      center -
      (
        coordinate -
        center
      );

    const target =
      findClosestMirroredVertex(
        vertices,
        vertex,
        axis,
        mirroredCoordinate
      );

    if (!target) {
      continue;
    }

    const symmetricalPosition =
      createSymmetricalPosition(
        vertex,
        target,
        axis,
        center
      );

    const current =
      new THREE.Vector3(
        position.getX(index),
        position.getY(index),
        position.getZ(index)
      );

    const finalPosition =
      current.clone().lerp(
        symmetricalPosition,
        safeStrength
      );

    position.setXYZ(
      index,
      finalPosition.x,
      finalPosition.y,
      finalPosition.z
    );

    modifiedVertices += 1;
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
    axis,
    center,
    strength:
      safeStrength,
  };
}

function getCoordinate(
  vector: THREE.Vector3,
  axis: "x" | "y" | "z"
) {
  if (axis === "x") {
    return vector.x;
  }

  if (axis === "y") {
    return vector.y;
  }

  return vector.z;
}

function findClosestMirroredVertex(
  vertices: THREE.Vector3[],
  source: THREE.Vector3,
  axis: "x" | "y" | "z",
  mirroredCoordinate: number
) {
  let closest:
    THREE.Vector3 | null =
    null;

  let closestDistance =
    Number.POSITIVE_INFINITY;

  for (
    const candidate of vertices
  ) {
    const candidateCoordinate =
      getCoordinate(
        candidate,
        axis
      );

    const axisDistance =
      Math.abs(
        candidateCoordinate -
        mirroredCoordinate
      );

    if (
      axisDistance >
      closestDistance
    ) {
      continue;
    }

    const distance =
      calculatePerpendicularDistance(
        source,
        candidate,
        axis
      );

    const score =
      distance +
      axisDistance;

    if (
      score <
      closestDistance
    ) {
      closestDistance =
        score;

      closest =
        candidate;
    }
  }

  return closest;
}

function calculatePerpendicularDistance(
  first: THREE.Vector3,
  second: THREE.Vector3,
  axis: "x" | "y" | "z"
) {
  if (axis === "x") {
    return Math.sqrt(
      Math.pow(
        first.y - second.y,
        2
      ) +
      Math.pow(
        first.z - second.z,
        2
      )
    );
  }

  if (axis === "y") {
    return Math.sqrt(
      Math.pow(
        first.x - second.x,
        2
      ) +
      Math.pow(
        first.z - second.z,
        2
      )
    );
  }

  return Math.sqrt(
    Math.pow(
      first.x - second.x,
      2
    ) +
    Math.pow(
      first.y - second.y,
      2
    )
  );
}

function createSymmetricalPosition(
  source: THREE.Vector3,
  target: THREE.Vector3,
  axis: "x" | "y" | "z",
  center: number
) {
  const result =
    source.clone();

  if (axis === "x") {
    result.x =
      center +
      (
        center -
        target.x
      );

    result.y =
      (
        source.y +
        target.y
      ) / 2;

    result.z =
      (
        source.z +
        target.z
      ) / 2;
  }

  if (axis === "y") {
    result.y =
      center +
      (
        center -
        target.y
      );

    result.x =
      (
        source.x +
        target.x
      ) / 2;

    result.z =
      (
        source.z +
        target.z
      ) / 2;
  }

  if (axis === "z") {
    result.z =
      center +
      (
        center -
        target.z
      );

    result.x =
      (
        source.x +
        target.x
      ) / 2;

    result.y =
      (
        source.y +
        target.y
      ) / 2;
  }

  return result;
}