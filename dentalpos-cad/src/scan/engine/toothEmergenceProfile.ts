import * as THREE from "three";

export type RestorationSupport =
  | "natural-tooth"
  | "implant";

export interface EmergenceProfileOptions {
  support?: RestorationSupport;

  cervicalScaleX?: number;
  cervicalScaleZ?: number;

  transitionHeight?: number;

  implantDiameter?: number;

  smoothingStrength?: number;
}

export interface EmergenceProfileResult {
  support: RestorationSupport;

  originalVertexCount: number;

  modifiedVertexCount: number;

  cervicalLevel: number;

  transitionHeight: number;

  implantDiameter: number | null;
}

export function createEmergenceProfile(
  sourceGeometry: THREE.BufferGeometry,
  options: EmergenceProfileOptions = {}
): {
  geometry: THREE.BufferGeometry;
  result: EmergenceProfileResult;
} {
  const {
    support = "natural-tooth",

    cervicalScaleX = 0.92,

    cervicalScaleZ = 0.92,

    transitionHeight = 2.5,

    implantDiameter = 4,

    smoothingStrength = 0.65,
  } = options;

  const geometry =
    sourceGeometry.clone();

  geometry.computeBoundingBox();

  const box =
    geometry.boundingBox;

  if (!box) {
    geometry.dispose();

    throw new Error(
      "Não foi possível calcular o perfil de emergência."
    );
  }

  const position =
    geometry.getAttribute(
      "position"
    );

  if (!position) {
    geometry.dispose();

    throw new Error(
      "Geometria sem atributo de posição."
    );
  }

  const cervicalLevel =
    box.min.y;

  const safeTransitionHeight =
    Math.max(
      transitionHeight,
      0.1
    );

  const center =
    box.getCenter(
      new THREE.Vector3()
    );

  let modifiedVertexCount =
    0;

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

    const distanceFromCervical =
      y - cervicalLevel;

    if (
      distanceFromCervical <
        0 ||
      distanceFromCervical >
        safeTransitionHeight
    ) {
      continue;
    }

    const normalizedHeight =
      THREE.MathUtils.clamp(
        distanceFromCervical /
          safeTransitionHeight,
        0,
        1
      );

    const smoothFactor =
      smoothStep(
        normalizedHeight
      );

    const influence =
      (1 - smoothFactor) *
      THREE.MathUtils.clamp(
        smoothingStrength,
        0,
        1
      );

    let targetScaleX =
      cervicalScaleX;

    let targetScaleZ =
      cervicalScaleZ;

    if (
      support === "implant"
    ) {
      const radialX =
        x - center.x;

      const radialZ =
        z - center.z;

      const radialDistance =
        Math.sqrt(
          radialX * radialX +
            radialZ * radialZ
        );

      const targetRadius =
        Math.max(
          implantDiameter /
            2,
          0.1
        );

      if (
        radialDistance >
        0.0001
      ) {
        const radialScale =
          targetRadius /
          radialDistance;

        targetScaleX =
          radialScale;

        targetScaleZ =
          radialScale;
      }
    }

    const finalScaleX =
      THREE.MathUtils.lerp(
        1,
        targetScaleX,
        influence
      );

    const finalScaleZ =
      THREE.MathUtils.lerp(
        1,
        targetScaleZ,
        influence
      );

    const newX =
      center.x +
      (x - center.x) *
        finalScaleX;

    const newZ =
      center.z +
      (z - center.z) *
        finalScaleZ;

    position.setXYZ(
      index,
      newX,
      y,
      newZ
    );

    modifiedVertexCount +=
      1;
  }

  position.needsUpdate =
    true;

  geometry.deleteAttribute(
    "normal"
  );

  geometry.computeVertexNormals();

  geometry.computeBoundingBox();

  geometry.computeBoundingSphere();

  return {
    geometry,

    result: {
      support,

      originalVertexCount:
        position.count,

      modifiedVertexCount,

      cervicalLevel,

      transitionHeight:
        safeTransitionHeight,

      implantDiameter:
        support === "implant"
          ? implantDiameter
          : null,
    },
  };
}

export function applyEmergenceProfileToMesh(
  mesh: THREE.Mesh,
  options: EmergenceProfileOptions = {}
) {
  const previousGeometry =
    mesh.geometry;

  const {
    geometry,
    result,
  } =
    createEmergenceProfile(
      previousGeometry,
      options
    );

  mesh.geometry =
    geometry;

  previousGeometry.dispose();

  mesh.updateMatrixWorld(
    true
  );

  return result;
}

function smoothStep(
  value: number
) {
  const x =
    THREE.MathUtils.clamp(
      value,
      0,
      1
    );

  return (
    x *
    x *
    (3 - 2 * x)
  );
}