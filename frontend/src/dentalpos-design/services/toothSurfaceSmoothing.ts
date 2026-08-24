import * as THREE from "three";

export interface SurfaceSmoothingOptions {
  iterations?: number;
  strength?: number;
  preserveBoundary?: boolean;
}

export interface SurfaceSmoothingResult {
  modifiedVertices: number;
  iterations: number;
  strength: number;
}

export function smoothToothSurface(
  mesh: THREE.Mesh,
  options: SurfaceSmoothingOptions = {}
): SurfaceSmoothingResult {
  const {
    iterations = 2,
    strength = 0.25,
    preserveBoundary = true,
  } = options;

  const safeIterations =
    THREE.MathUtils.clamp(
      Math.floor(iterations),
      1,
      10
    );

  const safeStrength =
    THREE.MathUtils.clamp(
      strength,
      0,
      1
    );

  let geometry =
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
      "Geometria inválida para suavização."
    );
  }

  const vertices: THREE.Vector3[] =
    [];

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

  const adjacency =
    createAdjacency(
      vertices
    );

  const boundary =
    preserveBoundary
      ? detectBoundaryVertices(
          adjacency
        )
      : new Set<number>();

  let current =
    vertices.map(
      (vertex) =>
        vertex.clone()
    );

  let modifiedVertices = 0;

  for (
    let iteration = 0;
    iteration < safeIterations;
    iteration += 1
  ) {
    const next =
      current.map(
        (vertex) =>
          vertex.clone()
      );

    for (
      let index = 0;
      index < current.length;
      index += 1
    ) {
      if (
        boundary.has(index)
      ) {
        continue;
      }

      const neighbors =
        adjacency.get(index);

      if (
        !neighbors ||
        neighbors.size === 0
      ) {
        continue;
      }

      const average =
        new THREE.Vector3();

      neighbors.forEach(
        (neighborIndex) => {
          average.add(
            current[
              neighborIndex
            ]
          );
        }
      );

      average.divideScalar(
        neighbors.size
      );

      next[index].lerp(
        average,
        safeStrength
      );

      modifiedVertices +=
        1;
    }

    current = next;
  }

  for (
    let index = 0;
    index < current.length;
    index += 1
  ) {
    position.setXYZ(
      index,
      current[index].x,
      current[index].y,
      current[index].z
    );
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

    iterations:
      safeIterations,

    strength:
      safeStrength,
  };
}

function createAdjacency(
  vertices: THREE.Vector3[]
) {
  const adjacency =
    new Map<
      number,
      Set<number>
    >();

  for (
    let index = 0;
    index < vertices.length;
    index += 1
  ) {
    adjacency.set(
      index,
      new Set<number>()
    );
  }

  for (
    let index = 0;
    index + 2 < vertices.length;
    index += 3
  ) {
    connect(
      adjacency,
      index,
      index + 1
    );

    connect(
      adjacency,
      index + 1,
      index + 2
    );

    connect(
      adjacency,
      index + 2,
      index
    );
  }

  return adjacency;
}

function connect(
  adjacency: Map<
    number,
    Set<number>
  >,
  first: number,
  second: number
) {
  adjacency
    .get(first)
    ?.add(second);

  adjacency
    .get(second)
    ?.add(first);
}

function detectBoundaryVertices(
  adjacency: Map<
    number,
    Set<number>
  >
) {
  const boundary =
    new Set<number>();

  adjacency.forEach(
    (
      neighbors,
      index
    ) => {
      if (
        neighbors.size < 3
      ) {
        boundary.add(
          index
        );
      }
    }
  );

  return boundary;
}