import * as THREE from "three";

import {
  applyRenderMode,
  type DentalRenderMode,
} from "./meshRenderModes";

export interface RenderControllerState {
  mode: DentalRenderMode;
  visible: boolean;
  opacity: number;
}

export function setDentalRenderMode(
  mesh: THREE.Mesh,
  mode: DentalRenderMode
) {
  applyRenderMode(
    mesh,
    mode
  );

  return mode;
}

export function setMeshVisibility(
  mesh: THREE.Mesh,
  visible: boolean
) {
  mesh.visible =
    visible;
}

export function setMeshOpacity(
  mesh: THREE.Mesh,
  opacity: number
) {
  const safeOpacity =
    THREE.MathUtils.clamp(
      opacity,
      0,
      1
    );

  const materials =
    Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];

  materials.forEach(
    (material) => {
      material.transparent =
        safeOpacity < 1;

      material.opacity =
        safeOpacity;

      material.depthWrite =
        safeOpacity >= 1;

      material.needsUpdate =
        true;
    }
  );

  return safeOpacity;
}

export function setMeshColor(
  mesh: THREE.Mesh,
  color: number
) {
  const materials =
    Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];

  materials.forEach(
    (material) => {
      if (
        material instanceof
          THREE.MeshStandardMaterial ||
        material instanceof
          THREE.MeshBasicMaterial ||
        material instanceof
          THREE.MeshPhongMaterial ||
        material instanceof
          THREE.MeshLambertMaterial
      ) {
        material.color.setHex(
          color
        );

        material.needsUpdate =
          true;
      }
    }
  );
}

export function resetDentalRender(
  mesh: THREE.Mesh
) {
  applyRenderMode(
    mesh,
    "clinical"
  );

  mesh.visible =
    true;

  setMeshOpacity(
    mesh,
    1
  );

  return {
    mode:
      "clinical" as DentalRenderMode,

    visible: true,

    opacity: 1,
  };
}

export function getRenderControllerState(
  mesh: THREE.Mesh,
  mode: DentalRenderMode
): RenderControllerState {
  const material =
    Array.isArray(mesh.material)
      ? mesh.material[0]
      : mesh.material;

  return {
    mode,

    visible:
      mesh.visible,

    opacity:
      material?.opacity ?? 1,
  };
}