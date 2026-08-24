import * as THREE from "three";

export type ContactMapLevel =
  | "collision"
  | "strong"
  | "ideal"
  | "light"
  | "clearance";

export interface ContactMapOptions {
  collisionDistance?: number;
  strongContactDistance?: number;
  idealContactDistance?: number;
  lightContactDistance?: number;
  sampleStep?: number;
  maxRayDistance?: number;
}

export interface ContactMapPoint {
  position: THREE.Vector3;
  distance: number;
  level: ContactMapLevel;
}

export interface ContactMapResult {
  minimumDistance: number;

  maximumDistance: number;

  collisionPoints: number;

  strongContactPoints: number;

  idealContactPoints: number;

  lightContactPoints: number;

  clearancePoints: number;

  points: ContactMapPoint[];
}

function classifyDistance(
  distance: number,
  options: Required<ContactMapOptions>
): ContactMapLevel {
  if (
    distance <=
    options.collisionDistance
  ) {
    return "collision";
  }

  if (
    distance <=
    options.strongContactDistance
  ) {
    return "strong";
  }

  if (
    distance <=
    options.idealContactDistance
  ) {
    return "ideal";
  }

  if (
    distance <=
    options.lightContactDistance
  ) {
    return "light";
  }

  return "clearance";
}

export function analyzeContactMap(
  tooth: THREE.Mesh,
  antagonist: THREE.Object3D,
  options: ContactMapOptions = {}
): ContactMapResult {
  const settings: Required<ContactMapOptions> = {
    collisionDistance:
      options.collisionDistance ??
      0.03,

    strongContactDistance:
      options.strongContactDistance ??
      0.08,

    idealContactDistance:
      options.idealContactDistance ??
      0.15,

    lightContactDistance:
      options.lightContactDistance ??
      0.35,

    sampleStep:
      options.sampleStep ??
      8,

    maxRayDistance:
      options.maxRayDistance ??
      5,
  };

  tooth.updateMatrixWorld(
    true
  );

  antagonist.updateMatrixWorld(
    true
  );

  const geometry =
    tooth.geometry.index
      ? tooth.geometry.toNonIndexed()
      : tooth.geometry.clone();

  if (
    !geometry.getAttribute(
      "normal"
    )
  ) {
    geometry.computeVertexNormals();
  }

  const position =
    geometry.getAttribute(
      "position"
    );

  const normal =
    geometry.getAttribute(
      "normal"
    );

  if (
    !position ||
    !normal
  ) {
    geometry.dispose();

    throw new Error(
      "Geometria inválida para mapa de contatos."
    );
  }

  const raycaster =
    new THREE.Raycaster();

  const localPoint =
    new THREE.Vector3();

  const localNormal =
    new THREE.Vector3();

  const worldPoint =
    new THREE.Vector3();

  const worldNormal =
    new THREE.Vector3();

  const points:
    ContactMapPoint[] = [];

  let minimumDistance =
    Number.POSITIVE_INFINITY;

  let maximumDistance = 0;

  let collisionPoints = 0;
  let strongContactPoints = 0;
  let idealContactPoints = 0;
  let lightContactPoints = 0;
  let clearancePoints = 0;

  for (
    let index = 0;
    index < position.count;
    index += Math.max(
      1,
      settings.sampleStep
    )
  ) {
    localPoint.fromBufferAttribute(
      position,
      index
    );

    localNormal.fromBufferAttribute(
      normal,
      index
    );

    worldPoint
      .copy(localPoint)
      .applyMatrix4(
        tooth.matrixWorld
      );

    worldNormal
      .copy(localNormal)
      .transformDirection(
        tooth.matrixWorld
      )
      .normalize();

    /*
     * Busca contato na direção externa
     * e também na direção oposta.
     */

    const directions = [
      worldNormal.clone(),
      worldNormal
        .clone()
        .multiplyScalar(-1),
    ];

    let nearestDistance =
      Number.POSITIVE_INFINITY;

    for (
      const direction of directions
    ) {
      const origin =
        worldPoint
          .clone()
          .add(
            direction
              .clone()
              .multiplyScalar(
                0.01
              )
          );

      raycaster.set(
        origin,
        direction
      );

      raycaster.near =
        0;

      raycaster.far =
        settings.maxRayDistance;

      const intersections =
        raycaster.intersectObject(
          antagonist,
          true
        );

      if (
        intersections.length >
        0
      ) {
        nearestDistance =
          Math.min(
            nearestDistance,
            intersections[0]
              .distance
          );
      }
    }

    if (
      !Number.isFinite(
        nearestDistance
      )
    ) {
      continue;
    }

    minimumDistance =
      Math.min(
        minimumDistance,
        nearestDistance
      );

    maximumDistance =
      Math.max(
        maximumDistance,
        nearestDistance
      );

    const level =
      classifyDistance(
        nearestDistance,
        settings
      );

    switch (level) {
      case "collision":
        collisionPoints += 1;
        break;

      case "strong":
        strongContactPoints += 1;
        break;

      case "ideal":
        idealContactPoints += 1;
        break;

      case "light":
        lightContactPoints += 1;
        break;

      case "clearance":
        clearancePoints += 1;
        break;
    }

    points.push({
      position:
        worldPoint.clone(),

      distance:
        nearestDistance,

      level,
    });
  }

  geometry.dispose();

  if (
    !Number.isFinite(
      minimumDistance
    )
  ) {
    minimumDistance = 0;
  }

  return {
    minimumDistance,

    maximumDistance,

    collisionPoints,

    strongContactPoints,

    idealContactPoints,

    lightContactPoints,

    clearancePoints,

    points,
  };
}

function getContactColor(
  level: ContactMapLevel
) {
  switch (level) {
    case "collision":
      return 0xef4444;

    case "strong":
      return 0xf97316;

    case "ideal":
      return 0xfacc15;

    case "light":
      return 0x22c55e;

    case "clearance":
    default:
      return 0x38bdf8;
  }
}

export function createContactMapVisualization(
  result: ContactMapResult
) {
  const group =
    new THREE.Group();

  group.name =
    "DENTALPOS_CONTACT_MAP";

  result.points.forEach(
    (point) => {
      if (
        point.level ===
        "clearance"
      ) {
        return;
      }

      const geometry =
        new THREE.SphereGeometry(
          0.16,
          8,
          8
        );

      const material =
        new THREE.MeshBasicMaterial({
          color:
            getContactColor(
              point.level
            ),

          depthTest:
            false,
        });

      const marker =
        new THREE.Mesh(
          geometry,
          material
        );

      marker.position.copy(
        point.position
      );

      marker.userData = {
        level:
          point.level,

        distance:
          point.distance,
      };

      marker.renderOrder =
        1800;

      group.add(
        marker
      );
    }
  );

  return group;
}

export function updateContactMapVisualization(
  scene: THREE.Scene,
  result: ContactMapResult
) {
  clearContactMapVisualization(
    scene
  );

  const visualization =
    createContactMapVisualization(
      result
    );

  scene.add(
    visualization
  );

  return visualization;
}

export function clearContactMapVisualization(
  scene: THREE.Scene
) {
  const object =
    scene.getObjectByName(
      "DENTALPOS_CONTACT_MAP"
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