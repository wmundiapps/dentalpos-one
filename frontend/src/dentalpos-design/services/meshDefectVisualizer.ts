import * as THREE from "three";

export interface MeshDefectVisualization {
  openEdges: THREE.BufferGeometry;
  nonManifoldEdges: THREE.BufferGeometry;
}

interface VertexPosition {
  x: number;
  y: number;
  z: number;
}

interface EdgeData {
  count: number;
  a: number;
  b: number;
}

function createVertexKey(
  x: number,
  y: number,
  z: number,
  tolerance: number
) {
  const qx = Math.round(x / tolerance);
  const qy = Math.round(y / tolerance);
  const qz = Math.round(z / tolerance);

  return `${qx},${qy},${qz}`;
}

function createEdgeKey(
  a: number,
  b: number
) {
  return a < b
    ? `${a}:${b}`
    : `${b}:${a}`;
}

export function createMeshDefectVisualization(
  sourceGeometry: THREE.BufferGeometry,
  tolerance = 0.0001
): MeshDefectVisualization {
  const geometry =
    sourceGeometry.clone();

  const position =
    geometry.getAttribute("position");

  if (!position) {
    geometry.dispose();

    throw new Error(
      "A geometria não possui posições de vértices."
    );
  }

  /*
   * ============================================================
   * VÉRTICES ÚNICOS
   * ============================================================
   */

  const vertexMap =
    new Map<string, number>();

  const vertices:
    VertexPosition[] = [];

  const vertexIds =
    new Array<number>(
      position.count
    );

  for (
    let index = 0;
    index < position.count;
    index += 1
  ) {
    const x =
      position.getX(index);

    const y =
      position.getY(index);

    const z =
      position.getZ(index);

    const key =
      createVertexKey(
        x,
        y,
        z,
        tolerance
      );

    let vertexId =
      vertexMap.get(key);

    if (
      vertexId === undefined
    ) {
      vertexId =
        vertices.length;

      vertexMap.set(
        key,
        vertexId
      );

      vertices.push({
        x,
        y,
        z,
      });
    }

    vertexIds[index] =
      vertexId;
  }

  /*
   * ============================================================
   * ARESTAS
   * ============================================================
   */

  const edgeMap =
    new Map<
      string,
      EdgeData
    >();

  const registerEdge = (
    a: number,
    b: number
  ) => {
    const key =
      createEdgeKey(a, b);

    const existing =
      edgeMap.get(key);

    if (existing) {
      existing.count += 1;

      return;
    }

    edgeMap.set(key, {
      count: 1,
      a,
      b,
    });
  };

  const triangleCount =
    Math.floor(
      position.count / 3
    );

  for (
    let triangleIndex = 0;
    triangleIndex <
    triangleCount;
    triangleIndex += 1
  ) {
    const base =
      triangleIndex * 3;

    const a =
      vertexIds[base];

    const b =
      vertexIds[base + 1];

    const c =
      vertexIds[base + 2];

    registerEdge(a, b);
    registerEdge(b, c);
    registerEdge(c, a);
  }

  /*
   * ============================================================
   * CONVERTE DEFEITOS EM SEGMENTOS 3D
   * ============================================================
   */

  const openEdgePositions:
    number[] = [];

  const nonManifoldPositions:
    number[] = [];

  const pushEdge = (
    target: number[],
    edge: EdgeData
  ) => {
    const vertexA =
      vertices[edge.a];

    const vertexB =
      vertices[edge.b];

    target.push(
      vertexA.x,
      vertexA.y,
      vertexA.z,

      vertexB.x,
      vertexB.y,
      vertexB.z
    );
  };

  edgeMap.forEach(
    (edge) => {
      if (edge.count === 1) {
        pushEdge(
          openEdgePositions,
          edge
        );
      }

      if (edge.count > 2) {
        pushEdge(
          nonManifoldPositions,
          edge
        );
      }
    }
  );

  /*
   * ============================================================
   * GEOMETRIA DAS BORDAS ABERTAS
   * ============================================================
   */

  const openEdges =
    new THREE.BufferGeometry();

  openEdges.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      openEdgePositions,
      3
    )
  );

  /*
   * ============================================================
   * GEOMETRIA NÃO-MANIFOLD
   * ============================================================
   */

  const nonManifoldEdges =
    new THREE.BufferGeometry();

  nonManifoldEdges.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      nonManifoldPositions,
      3
    )
  );

  geometry.dispose();

  return {
    openEdges,
    nonManifoldEdges,
  };
}

export function disposeMeshDefectVisualization(
  visualization:
    MeshDefectVisualization | null
) {
  if (!visualization) {
    return;
  }

  visualization.openEdges.dispose();

  visualization.nonManifoldEdges.dispose();
}