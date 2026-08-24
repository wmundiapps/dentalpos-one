import * as THREE from "three";

export type ToothMorphologyRegion =
  | "cervical"
  | "middle"
  | "occlusal";

export interface ToothMorphologyOptions {
  cervicalScale?: number;
  middleScale?: number;
  occlusalScale?: number;

  widthScale?: number;
  depthScale?: number;

  smoothing?: number;
}

export interface ToothMorphologyResult {
  modifiedVertices: number;

  cervicalVertices: number;
  middleVertices: number;
  occlusalVertices: number;

  originalSize: THREE.Vector3;
  finalSize: THREE.Vector3;
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

function getRegionScale(
  normalizedHeight: number,
  cervicalScale: number,
  middleScale: number,
  occlusalScale: number,
  smoothing: number
) {
  const safeSmoothing =
    THREE.MathUtils.clamp(
      smoothing,
      0,
      1
    );

  if (
    normalizedHeight <=
    0.5
  ) {
    const local =
      smoothStep(
        normalizedHeight /
          0.5
      );

    const smoothLocal =
      THREE.MathUtils.lerp(
        normalizedHeight /
          0.5,
        local,
        safeSmoothing
      );

    return THREE.MathUtils.lerp(
      cervicalScale,
      middleScale,
      smoothLocal
    );
  }

  const local =
    smoothStep(
      (normalizedHeight -
        0.5) /
        0.5
    );

  const smoothLocal =
    THREE.MathUtils.lerp(
      (normalizedHeight -
        0.5) /
        0.5,
      local,
      safeSmoothing
    );

  return THREE.MathUtils.lerp(
    middleScale,
    occlusalScale,
    smoothLocal
  );
}

export function modifyToothMorphology(
  sourceGeometry: THREE.BufferGeometry,
  options: ToothMorphologyOptions = {}
): {
  geometry: THREE.BufferGeometry;
  result: ToothMorphologyResult;
} {
  const {
    cervicalScale = 1,
    middleScale = 1,
    occlusalScale = 1,

    widthScale = 1,
    depthScale = 1,

    smoothing = 0.8,
  } = options;

  const geometry =
    sourceGeometry.clone();

  geometry.computeBoundingBox();

  const box =
    geometry.boundingBox;

  const position =
    geometry.getAttribute(
      "position"
    );

  if (
    !box ||
    !position
  ) {
    geometry.dispose();

    throw new Error(
      "Geometria inválida para modificação morfológica."
    );
  }

  const originalSize =
    box.getSize(
      new THREE.Vector3()
    );

  const center =
    box.getCenter(
      new THREE.Vector3()
    );

  const height =
    Math.max(
      box.max.y -
        box.min.y,
      0.0001
    );

  let modifiedVertices = 0;

  let cervicalVertices = 0;
  let middleVertices = 0;
  let occlusalVertices = 0;

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

    const normalizedHeight =
      THREE.MathUtils.clamp(
        (y - box.min.y) /
          height,
        0,
        1
      );

    if (
      normalizedHeight <
      0.33
    ) {
      cervicalVertices += 1;
    } else if (
      normalizedHeight <
      0.66
    ) {
      middleVertices += 1;
    } else {
      occlusalVertices += 1;
    }

    const regionScale =
      getRegionScale(
        normalizedHeight,
        cervicalScale,
        middleScale,
        occlusalScale,
        smoothing
      );

    const scaleX =
      regionScale *
      widthScale;

    const scaleZ =
      regionScale *
      depthScale;

    const newX =
      center.x +
      (x - center.x) *
        scaleX;

    const newZ =
      center.z +
      (z - center.z) *
        scaleZ;

    position.setXYZ(
      index,
      newX,
      y,
      newZ
    );

    if (
      Math.abs(
        newX - x
      ) > 0.000001 ||
      Math.abs(
        newZ - z
      ) > 0.000001
    ) {
      modifiedVertices += 1;
    }
  }

  position.needsUpdate =
    true;

  geometry.deleteAttribute(
    "normal"
  );

  geometry.computeVertexNormals();

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const finalSize =
    geometry.boundingBox
      ? geometry.boundingBox.getSize(
          new THREE.Vector3()
        )
      : new THREE.Vector3();

  return {
    geometry,

    result: {
      modifiedVertices,

      cervicalVertices,
      middleVertices,
      occlusalVertices,

      originalSize,
      finalSize,
    },
  };
}

export function applyToothMorphology(
  mesh: THREE.Mesh,
  options: ToothMorphologyOptions = {}
) {
  const previousGeometry =
    mesh.geometry;

  const {
    geometry,
    result,
  } =
    modifyToothMorphology(
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

export function resetToothMorphology(
  mesh: THREE.Mesh,
  originalGeometry: THREE.BufferGeometry
) {
  const previousGeometry =
    mesh.geometry;

  mesh.geometry =
    originalGeometry.clone();

  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingBox();
  mesh.geometry.computeBoundingSphere();

  previousGeometry.dispose();

  mesh.updateMatrixWorld(
    true
  );
}