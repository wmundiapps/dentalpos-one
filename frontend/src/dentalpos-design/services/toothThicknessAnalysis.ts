import * as THREE from "three";

export interface ThicknessAnalysisOptions {
  minimumThickness?: number;
  warningThickness?: number;
  sampleStep?: number;
}

export type ThicknessStatus =
  | "critical"
  | "warning"
  | "safe";

export interface ThicknessSample {
  vertexIndex: number;

  position: THREE.Vector3;

  thickness: number;

  status: ThicknessStatus;
}

export interface ThicknessAnalysisResult {
  minimumThickness: number;

  maximumThickness: number;

  averageThickness: number;

  criticalPoints: number;

  warningPoints: number;

  safePoints: number;

  samples: ThicknessSample[];

  manufacturingSafe: boolean;
}

export function analyzeToothThickness(
  mesh: THREE.Mesh,
  options: ThicknessAnalysisOptions = {}
): ThicknessAnalysisResult {
  const {
    minimumThickness = 0.5,
    warningThickness = 0.8,
    sampleStep = 10,
  } = options;

  const geometry =
    mesh.geometry.index
      ? mesh.geometry.toNonIndexed()
      : mesh.geometry.clone();

  const position =
    geometry.getAttribute(
      "position"
    );

  const normal =
    geometry.getAttribute(
      "normal"
    );

  if (!position) {
    geometry.dispose();

    throw new Error(
      "Geometria sem posições para análise de espessura."
    );
  }

  if (!normal) {
    geometry.computeVertexNormals();
  }

  const normals =
    geometry.getAttribute(
      "normal"
    );

  const raycaster =
    new THREE.Raycaster();

  const samples:
    ThicknessSample[] = [];

  let minimum =
    Number.POSITIVE_INFINITY;

  let maximum = 0;

  let total = 0;

  let criticalPoints = 0;

  let warningPoints = 0;

  let safePoints = 0;

  const vertex =
    new THREE.Vector3();

  const vertexNormal =
    new THREE.Vector3();

  const worldPosition =
    new THREE.Vector3();

  const worldNormal =
    new THREE.Vector3();

  mesh.updateMatrixWorld(
    true
  );

  for (
    let index = 0;
    index < position.count;
    index += Math.max(
      1,
      sampleStep
    )
  ) {
    vertex.fromBufferAttribute(
      position,
      index
    );

    vertexNormal.fromBufferAttribute(
      normals,
      index
    );

    worldPosition
      .copy(vertex)
      .applyMatrix4(
        mesh.matrixWorld
      );

    worldNormal
      .copy(vertexNormal)
      .transformDirection(
        mesh.matrixWorld
      )
      .normalize();

    const origin =
      worldPosition
        .clone()
        .add(
          worldNormal
            .clone()
            .multiplyScalar(
              -0.01
            )
        );

    const direction =
      worldNormal
        .clone()
        .multiplyScalar(-1);

    raycaster.set(
      origin,
      direction
    );

    raycaster.near =
      0.02;

    raycaster.far =
      50;

    const intersections =
      raycaster.intersectObject(
        mesh,
        false
      );

    const validHit =
      intersections.find(
        (intersection) =>
          intersection.distance >
          0.02
      );

    if (!validHit) {
      continue;
    }

    const thickness =
      validHit.distance;

    let status:
      ThicknessStatus =
      "safe";

    if (
      thickness <
      minimumThickness
    ) {
      status =
        "critical";

      criticalPoints +=
        1;
    } else if (
      thickness <
      warningThickness
    ) {
      status =
        "warning";

      warningPoints +=
        1;
    } else {
      safePoints +=
        1;
    }

    minimum =
      Math.min(
        minimum,
        thickness
      );

    maximum =
      Math.max(
        maximum,
        thickness
      );

    total +=
      thickness;

    samples.push({
      vertexIndex:
        index,

      position:
        worldPosition.clone(),

      thickness,

      status,
    });
  }

  geometry.dispose();

  const average =
    samples.length > 0
      ? total /
        samples.length
      : 0;

  if (
    !Number.isFinite(
      minimum
    )
  ) {
    minimum = 0;
  }

  return {
    minimumThickness:
      minimum,

    maximumThickness:
      maximum,

    averageThickness:
      average,

    criticalPoints,

    warningPoints,

    safePoints,

    samples,

    manufacturingSafe:
      criticalPoints === 0,
  };
}

export function createThicknessMarkers(
  result: ThicknessAnalysisResult
) {
  const group =
    new THREE.Group();

  group.name =
    "DENTALPOS_THICKNESS_ANALYSIS";

  result.samples.forEach(
    (sample) => {
      if (
        sample.status ===
        "safe"
      ) {
        return;
      }

      const color =
        sample.status ===
        "critical"
          ? 0xef4444
          : 0xf59e0b;

      const geometry =
        new THREE.SphereGeometry(
          0.18,
          10,
          10
        );

      const material =
        new THREE.MeshBasicMaterial({
          color,

          depthTest:
            false,
        });

      const marker =
        new THREE.Mesh(
          geometry,
          material
        );

      marker.position.copy(
        sample.position
      );

      marker.userData = {
        thickness:
          sample.thickness,

        status:
          sample.status,
      };

      marker.renderOrder =
        1700;

      group.add(
        marker
      );
    }
  );

  return group;
}

export function clearThicknessAnalysis(
  scene: THREE.Scene
) {
  const object =
    scene.getObjectByName(
      "DENTALPOS_THICKNESS_ANALYSIS"
    );

  if (!object) {
    return;
  }

  scene.remove(
    object
  );

  object.traverse(
    (child) => {
      if (
        child instanceof
        THREE.Mesh
      ) {
        child.geometry.dispose();

        const materials =
          Array.isArray(
            child.material
          )
            ? child.material
            : [
                child.material,
              ];

        materials.forEach(
          (material) =>
            material.dispose()
        );
      }
    }
  );
}