import * as THREE from "three";

export interface MeshRepairResult {
  geometry: THREE.BufferGeometry;
  originalTriangles: number;
  repairedTriangles: number;
  removedDuplicateTriangles: number;
  removedDegenerateTriangles: number;
}

type Point = {
  x: number;
  y: number;
  z: number;
};

type Triangle = {
  a: Point;
  b: Point;
  c: Point;
};

function vertexKey(
  point: Point,
  tolerance: number
) {
  return [
    Math.round(point.x / tolerance),
    Math.round(point.y / tolerance),
    Math.round(point.z / tolerance),
  ].join(":");
}

function triangleKey(
  triangle: Triangle,
  tolerance: number
) {
  const keys = [
    vertexKey(triangle.a, tolerance),
    vertexKey(triangle.b, tolerance),
    vertexKey(triangle.c, tolerance),
  ];

  keys.sort();

  return keys.join("|");
}

function triangleArea(
  triangle: Triangle
) {
  const abx =
    triangle.b.x - triangle.a.x;

  const aby =
    triangle.b.y - triangle.a.y;

  const abz =
    triangle.b.z - triangle.a.z;

  const acx =
    triangle.c.x - triangle.a.x;

  const acy =
    triangle.c.y - triangle.a.y;

  const acz =
    triangle.c.z - triangle.a.z;

  const crossX =
    aby * acz - abz * acy;

  const crossY =
    abz * acx - abx * acz;

  const crossZ =
    abx * acy - aby * acx;

  return (
    0.5 *
    Math.sqrt(
      crossX * crossX +
        crossY * crossY +
        crossZ * crossZ
    )
  );
}

export function repairMesh(
  sourceGeometry: THREE.BufferGeometry,
  tolerance = 0.0001
): MeshRepairResult {
  const source =
    sourceGeometry.index
      ? sourceGeometry.toNonIndexed()
      : sourceGeometry.clone();

  const position =
    source.getAttribute("position");

  if (!position) {
    source.dispose();

    throw new Error(
      "Geometria sem posições."
    );
  }

  const triangleCount =
    Math.floor(position.count / 3);

  const validTriangles: Triangle[] = [];

  const triangleKeys =
    new Set<string>();

  let removedDuplicateTriangles = 0;
  let removedDegenerateTriangles = 0;

  for (
    let triangleIndex = 0;
    triangleIndex < triangleCount;
    triangleIndex += 1
  ) {
    const base =
      triangleIndex * 3;

    const triangle: Triangle = {
      a: {
        x: position.getX(base),
        y: position.getY(base),
        z: position.getZ(base),
      },

      b: {
        x: position.getX(base + 1),
        y: position.getY(base + 1),
        z: position.getZ(base + 1),
      },

      c: {
        x: position.getX(base + 2),
        y: position.getY(base + 2),
        z: position.getZ(base + 2),
      },
    };

    const keyA =
      vertexKey(
        triangle.a,
        tolerance
      );

    const keyB =
      vertexKey(
        triangle.b,
        tolerance
      );

    const keyC =
      vertexKey(
        triangle.c,
        tolerance
      );

    const repeatedVertex =
      keyA === keyB ||
      keyB === keyC ||
      keyA === keyC;

    const area =
      triangleArea(triangle);

    const degenerate =
      repeatedVertex ||
      !Number.isFinite(area) ||
      area <=
        tolerance * tolerance;

    if (degenerate) {
      removedDegenerateTriangles += 1;
      continue;
    }

    const key =
      triangleKey(
        triangle,
        tolerance
      );

    if (triangleKeys.has(key)) {
      removedDuplicateTriangles += 1;
      continue;
    }

    triangleKeys.add(key);

    validTriangles.push(triangle);
  }

  const vertices =
    new Float32Array(
      validTriangles.length * 9
    );

  let offset = 0;

  for (const triangle of validTriangles) {
    vertices[offset++] =
      triangle.a.x;

    vertices[offset++] =
      triangle.a.y;

    vertices[offset++] =
      triangle.a.z;

    vertices[offset++] =
      triangle.b.x;

    vertices[offset++] =
      triangle.b.y;

    vertices[offset++] =
      triangle.b.z;

    vertices[offset++] =
      triangle.c.x;

    vertices[offset++] =
      triangle.c.y;

    vertices[offset++] =
      triangle.c.z;
  }

  const geometry =
    new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      vertices,
      3
    )
  );

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  source.dispose();

  return {
    geometry,

    originalTriangles:
      triangleCount,

    repairedTriangles:
      validTriangles.length,

    removedDuplicateTriangles,

    removedDegenerateTriangles,
  };
}