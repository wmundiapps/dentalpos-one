import * as THREE from "three";

export interface DuplicateDetectionResult {
  totalTriangles: number;
  exactDuplicates: number;
  reversedDuplicates: number;
  duplicatePercentage: number;
  suspectedDoubleSurface: boolean;
}

type Vertex = {
  x: number;
  y: number;
  z: number;
};

function vertexKey(
  vertex: Vertex,
  tolerance: number
) {
  return [
    Math.round(vertex.x / tolerance),
    Math.round(vertex.y / tolerance),
    Math.round(vertex.z / tolerance),
  ].join(",");
}

function triangleKey(
  a: Vertex,
  b: Vertex,
  c: Vertex,
  tolerance: number
) {
  return [
    vertexKey(a, tolerance),
    vertexKey(b, tolerance),
    vertexKey(c, tolerance),
  ].join("|");
}

function canonicalTriangleKey(
  a: Vertex,
  b: Vertex,
  c: Vertex,
  tolerance: number
) {
  return [
    vertexKey(a, tolerance),
    vertexKey(b, tolerance),
    vertexKey(c, tolerance),
  ]
    .sort()
    .join("|");
}

export function detectDuplicateSurfaces(
  sourceGeometry: THREE.BufferGeometry,
  tolerance = 0.0001
): DuplicateDetectionResult {
  const geometry =
    sourceGeometry.index
      ? sourceGeometry.toNonIndexed()
      : sourceGeometry.clone();

  const position =
    geometry.getAttribute("position");

  if (!position) {
    geometry.dispose();

    throw new Error(
      "Geometria sem posições."
    );
  }

  const totalTriangles =
    Math.floor(position.count / 3);

  const directedTriangles =
    new Set<string>();

  const canonicalTriangles =
    new Map<string, string>();

  let exactDuplicates = 0;
  let reversedDuplicates = 0;

  for (
    let triangleIndex = 0;
    triangleIndex < totalTriangles;
    triangleIndex += 1
  ) {
    const base =
      triangleIndex * 3;

    const a: Vertex = {
      x: position.getX(base),
      y: position.getY(base),
      z: position.getZ(base),
    };

    const b: Vertex = {
      x: position.getX(base + 1),
      y: position.getY(base + 1),
      z: position.getZ(base + 1),
    };

    const c: Vertex = {
      x: position.getX(base + 2),
      y: position.getY(base + 2),
      z: position.getZ(base + 2),
    };

    const directed =
      triangleKey(
        a,
        b,
        c,
        tolerance
      );

    const reversed =
      triangleKey(
        c,
        b,
        a,
        tolerance
      );

    const canonical =
      canonicalTriangleKey(
        a,
        b,
        c,
        tolerance
      );

    if (
      directedTriangles.has(
        directed
      )
    ) {
      exactDuplicates += 1;
      continue;
    }

    if (
      directedTriangles.has(
        reversed
      )
    ) {
      reversedDuplicates += 1;
      continue;
    }

    const previous =
      canonicalTriangles.get(
        canonical
      );

    if (previous) {
      if (
        previous === directed
      ) {
        exactDuplicates += 1;
      } else {
        reversedDuplicates += 1;
      }

      continue;
    }

    directedTriangles.add(
      directed
    );

    canonicalTriangles.set(
      canonical,
      directed
    );
  }

  geometry.dispose();

  const duplicateTotal =
    exactDuplicates +
    reversedDuplicates;

  const duplicatePercentage =
    totalTriangles > 0
      ? (duplicateTotal /
          totalTriangles) *
        100
      : 0;

  const suspectedDoubleSurface =
    duplicatePercentage >= 25;

  return {
    totalTriangles,

    exactDuplicates,

    reversedDuplicates,

    duplicatePercentage,

    suspectedDoubleSurface,
  };
}