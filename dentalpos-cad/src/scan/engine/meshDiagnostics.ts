import * as THREE from "three";

export interface MeshDiagnosticResult {
  triangles: number;

  vertices: number;

  uniqueVertices: number;

  duplicateTriangles: number;

  degenerateTriangles: number;

  openEdges: number;

  nonManifoldEdges: number;

  shells: number;

  width: number;

  height: number;

  depth: number;

  healthy: boolean;

  warnings: string[];
}

type TriangleIds = [
  number,
  number,
  number
];

/*
 * ============================================================
 * UNION FIND
 *
 * Usado para descobrir quantas partes independentes
 * existem dentro do STL.
 * ============================================================
 */

class UnionFind {
  private parent: number[];
  private rank: number[];

  constructor(size: number) {
    this.parent =
      Array.from(
        { length: size },
        (_, index) => index
      );

    this.rank =
      new Array(size).fill(0);
  }

  find(value: number): number {
    let current = value;

    while (
      this.parent[current] !==
      current
    ) {
      this.parent[current] =
        this.parent[
          this.parent[current]
        ];

      current =
        this.parent[current];
    }

    return current;
  }

  union(
    first: number,
    second: number
  ) {
    let rootA =
      this.find(first);

    let rootB =
      this.find(second);

    if (rootA === rootB) {
      return;
    }

    if (
      this.rank[rootA] <
      this.rank[rootB]
    ) {
      [rootA, rootB] =
        [rootB, rootA];
    }

    this.parent[rootB] =
      rootA;

    if (
      this.rank[rootA] ===
      this.rank[rootB]
    ) {
      this.rank[rootA] += 1;
    }
  }
}

/*
 * ============================================================
 * CHAVE DE VÉRTICE
 *
 * STL normalmente possui muitos vértices repetidos.
 *
 * Agrupamos pontos extremamente próximos para
 * descobrir a topologia real da malha.
 * ============================================================
 */

function createVertexKey(
  x: number,
  y: number,
  z: number,
  tolerance: number
) {
  const qx =
    Math.round(x / tolerance);

  const qy =
    Math.round(y / tolerance);

  const qz =
    Math.round(z / tolerance);

  return `${qx},${qy},${qz}`;
}

/*
 * ============================================================
 * CHAVE DE ARESTA
 * ============================================================
 */

function createEdgeKey(
  a: number,
  b: number
) {
  return a < b
    ? `${a}:${b}`
    : `${b}:${a}`;
}

/*
 * ============================================================
 * CHAVE DE TRIÂNGULO
 *
 * Ordenamos os vértices para que:
 *
 * 1-2-3
 * 3-2-1
 * 2-3-1
 *
 * sejam reconhecidos como o MESMO triângulo.
 * ============================================================
 */

function createTriangleKey(
  triangle: TriangleIds
) {
  return [...triangle]
    .sort((a, b) => a - b)
    .join(":");
}

/*
 * ============================================================
 * ÁREA DO TRIÂNGULO
 * ============================================================
 */

function triangleArea(
  ax: number,
  ay: number,
  az: number,

  bx: number,
  by: number,
  bz: number,

  cx: number,
  cy: number,
  cz: number
) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;

  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;

  const crossX =
    aby * acz -
    abz * acy;

  const crossY =
    abz * acx -
    abx * acz;

  const crossZ =
    abx * acy -
    aby * acx;

  return (
    0.5 *
    Math.sqrt(
      crossX * crossX +
        crossY * crossY +
        crossZ * crossZ
    )
  );
}

/*
 * ============================================================
 * DIAGNÓSTICO PRINCIPAL
 * ============================================================
 */

export function diagnoseMesh(
  sourceGeometry: THREE.BufferGeometry,
  tolerance = 0.0001
): MeshDiagnosticResult {
  /*
   * Fazemos clone para nunca alterar
   * a geometria clínica original.
   */

  const geometry =
    sourceGeometry.clone();

  const position =
    geometry.getAttribute(
      "position"
    );

  if (!position) {
    geometry.dispose();

    throw new Error(
      "A geometria não possui posições de vértices."
    );
  }

  /*
   * ==========================================================
   * DIMENSÕES
   * ==========================================================
   */

  geometry.computeBoundingBox();

  const boundingBox =
    geometry.boundingBox;

  const dimensions =
    new THREE.Vector3();

  if (boundingBox) {
    boundingBox.getSize(
      dimensions
    );
  }

  /*
   * ==========================================================
   * CRIA ÍNDICES DE VÉRTICES ÚNICOS
   * ==========================================================
   */

  const vertexMap =
    new Map<string, number>();

  const vertexIds =
    new Array<number>(
      position.count
    );

  let uniqueVertexCount = 0;

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
        uniqueVertexCount;

      vertexMap.set(
        key,
        vertexId
      );

      uniqueVertexCount += 1;
    }

    vertexIds[index] =
      vertexId;
  }

  /*
   * ==========================================================
   * TRIÂNGULOS
   * ==========================================================
   */

  const triangleCount =
    Math.floor(
      position.count / 3
    );

  const triangles =
    new Array<TriangleIds>(
      triangleCount
    );

  const triangleKeys =
    new Map<string, number>();

  let duplicateTriangles = 0;
  let degenerateTriangles = 0;

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

    const triangle: TriangleIds =
      [a, b, c];

    triangles[
      triangleIndex
    ] = triangle;

    /*
     * Detecta triângulo com vértices repetidos.
     */

    let degenerate =
      a === b ||
      b === c ||
      a === c;

    /*
     * Também verificamos área praticamente zero.
     */

    if (!degenerate) {
      const area =
        triangleArea(
          position.getX(base),
          position.getY(base),
          position.getZ(base),

          position.getX(base + 1),
          position.getY(base + 1),
          position.getZ(base + 1),

          position.getX(base + 2),
          position.getY(base + 2),
          position.getZ(base + 2)
        );

      if (
        !Number.isFinite(area) ||
        area <
          tolerance *
            tolerance
      ) {
        degenerate = true;
      }
    }

    if (degenerate) {
      degenerateTriangles += 1;
    }

    /*
     * Detecta triângulos repetidos.
     */

    const triangleKey =
      createTriangleKey(
        triangle
      );

    const previous =
      triangleKeys.get(
        triangleKey
      );

    if (
      previous !== undefined
    ) {
      duplicateTriangles += 1;
    } else {
      triangleKeys.set(
        triangleKey,
        triangleIndex
      );
    }
  }

  /*
   * ==========================================================
   * ARESTAS + SHELLS
   * ==========================================================
   */

  interface EdgeData {
    count: number;
    firstTriangle: number;
  }

  const edgeMap =
    new Map<
      string,
      EdgeData
    >();

  const unionFind =
    new UnionFind(
      triangleCount
    );

  const registerEdge = (
    vertexA: number,
    vertexB: number,
    triangleIndex: number
  ) => {
    const key =
      createEdgeKey(
        vertexA,
        vertexB
      );

    const existing =
      edgeMap.get(key);

    if (!existing) {
      edgeMap.set(key, {
        count: 1,
        firstTriangle:
          triangleIndex,
      });

      return;
    }

    existing.count += 1;

    /*
     * Triângulos que dividem uma aresta
     * pertencem à mesma região conectada.
     */

    unionFind.union(
      existing.firstTriangle,
      triangleIndex
    );
  };

  for (
    let triangleIndex = 0;
    triangleIndex <
    triangles.length;
    triangleIndex += 1
  ) {
    const triangle =
      triangles[
        triangleIndex
      ];

    const [a, b, c] =
      triangle;

    registerEdge(
      a,
      b,
      triangleIndex
    );

    registerEdge(
      b,
      c,
      triangleIndex
    );

    registerEdge(
      c,
      a,
      triangleIndex
    );
  }

  /*
   * ==========================================================
   * CLASSIFICAÇÃO DAS ARESTAS
   * ==========================================================
   */

  let openEdges = 0;
  let nonManifoldEdges = 0;

  edgeMap.forEach(
    (edge) => {
      if (
        edge.count === 1
      ) {
        openEdges += 1;
      }

      if (
        edge.count > 2
      ) {
        nonManifoldEdges += 1;
      }
    }
  );

  /*
   * ==========================================================
   * CONTAGEM DE SHELLS
   * ==========================================================
   */

  const roots =
    new Set<number>();

  for (
    let triangleIndex = 0;
    triangleIndex <
    triangleCount;
    triangleIndex += 1
  ) {
    roots.add(
      unionFind.find(
        triangleIndex
      )
    );
  }

  const shells =
    roots.size;

  /*
   * ==========================================================
   * AVISOS
   * ==========================================================
   */

  const warnings: string[] =
    [];

  if (
    duplicateTriangles > 0
  ) {
    warnings.push(
      `${duplicateTriangles.toLocaleString(
        "pt-BR"
      )} triângulos duplicados detectados.`
    );
  }

  if (
    degenerateTriangles > 0
  ) {
    warnings.push(
      `${degenerateTriangles.toLocaleString(
        "pt-BR"
      )} triângulos degenerados detectados.`
    );
  }

  if (openEdges > 0) {
    warnings.push(
      `${openEdges.toLocaleString(
        "pt-BR"
      )} bordas abertas detectadas.`
    );
  }

  if (
    nonManifoldEdges > 0
  ) {
    warnings.push(
      `${nonManifoldEdges.toLocaleString(
        "pt-BR"
      )} arestas não-manifold detectadas.`
    );
  }

  if (shells > 1) {
    warnings.push(
      `${shells.toLocaleString(
        "pt-BR"
      )} componentes independentes encontrados no STL.`
    );
  }

  const healthy =
    duplicateTriangles === 0 &&
    degenerateTriangles === 0 &&
    nonManifoldEdges === 0;

  /*
   * ==========================================================
   * LIMPEZA DA CÓPIA
   * ==========================================================
   */

  geometry.dispose();

  return {
    triangles:
      triangleCount,

    vertices:
      position.count,

    uniqueVertices:
      uniqueVertexCount,

    duplicateTriangles,

    degenerateTriangles,

    openEdges,

    nonManifoldEdges,

    shells,

    width:
      dimensions.x,

    height:
      dimensions.y,

    depth:
      dimensions.z,

    healthy,

    warnings,
  };
}