import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type DentalCameraView =
  | "perspective"
  | "superior"
  | "inferior"
  | "front"
  | "back"
  | "left"
  | "right";

export interface CameraFitOptions {
  margin?: number;
  minDistance?: number;
}

function getMeshBounds(
  object: THREE.Object3D
) {
  const box =
    new THREE.Box3().setFromObject(
      object
    );

  const center =
    new THREE.Vector3();

  const size =
    new THREE.Vector3();

  box.getCenter(center);
  box.getSize(size);

  const maxDimension =
    Math.max(
      size.x,
      size.y,
      size.z,
      1
    );

  return {
    box,
    center,
    size,
    maxDimension,
  };
}

export function fitDentalCamera(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
  options: CameraFitOptions = {}
) {
  const {
    margin = 1.2,
    minDistance = 10,
  } = options;

  const {
    center,
    maxDimension,
  } =
    getMeshBounds(object);

  const fov =
    THREE.MathUtils.degToRad(
      camera.fov
    );

  let distance =
    maxDimension /
    (2 * Math.tan(fov / 2));

  distance =
    Math.max(
      distance * margin,
      minDistance
    );

  camera.up.set(
    0,
    1,
    0
  );

  camera.position.set(
    center.x +
      maxDimension * 0.35,

    center.y +
      maxDimension * 0.25,

    center.z +
      distance
  );

  camera.near =
    Math.max(
      distance / 5000,
      0.001
    );

  camera.far =
    Math.max(
      distance * 100,
      1000
    );

  camera.updateProjectionMatrix();

  controls.target.copy(
    center
  );

  camera.lookAt(
    center
  );

  controls.update();
}

export function setDentalCameraView(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
  view: DentalCameraView
) {
  const {
    center,
    maxDimension,
  } =
    getMeshBounds(object);

  const distance =
    maxDimension * 2.2;

  camera.up.set(
    0,
    1,
    0
  );

  switch (view) {
    case "superior":
      camera.up.set(
        0,
        0,
        -1
      );

      camera.position.set(
        center.x,
        center.y +
          distance,
        center.z
      );

      break;

    case "inferior":
      camera.up.set(
        0,
        0,
        1
      );

      camera.position.set(
        center.x,
        center.y -
          distance,
        center.z
      );

      break;

    case "front":
      camera.position.set(
        center.x,
        center.y,
        center.z +
          distance
      );

      break;

    case "back":
      camera.position.set(
        center.x,
        center.y,
        center.z -
          distance
      );

      break;

    case "left":
      camera.position.set(
        center.x -
          distance,
        center.y,
        center.z
      );

      break;

    case "right":
      camera.position.set(
        center.x +
          distance,
        center.y,
        center.z
      );

      break;

    case "perspective":
    default:
      camera.position.set(
        center.x +
          maxDimension * 0.8,

        center.y +
          maxDimension * 0.65,

        center.z +
          maxDimension * 1.7
      );

      break;
  }

  camera.lookAt(
    center
  );

  controls.target.copy(
    center
  );

  controls.update();
}

export function resetDentalCamera(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  object: THREE.Object3D
) {
  fitDentalCamera(
    camera,
    controls,
    object,
    {
      margin: 1.2,
    }
  );
}