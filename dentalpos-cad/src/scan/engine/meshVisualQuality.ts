import * as THREE from "three";

export interface MeshVisualQualityOptions {
  color?: number;
  roughness?: number;
  metalness?: number;
  flatShading?: boolean;
}

export function createDentalMaterial(
  options: MeshVisualQualityOptions = {}
) {
  const {
    color = 0xe8edf2,
    roughness = 0.58,
    metalness = 0,
    flatShading = false,
  } = options;

  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    flatShading,
    side: THREE.DoubleSide,
  });
}

export function improveGeometryNormals(
  sourceGeometry: THREE.BufferGeometry
) {
  const geometry =
    sourceGeometry.clone();

  geometry.deleteAttribute(
    "normal"
  );

  geometry.computeVertexNormals();
  geometry.normalizeNormals();

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

export function configureDentalRenderer(
  renderer: THREE.WebGLRenderer
) {
  renderer.setPixelRatio(
    Math.min(
      window.devicePixelRatio || 1,
      2
    )
  );

  renderer.outputColorSpace =
    THREE.SRGBColorSpace;

  renderer.toneMapping =
    THREE.ACESFilmicToneMapping;

  renderer.toneMappingExposure =
    1.05;

  renderer.shadowMap.enabled =
    false;
}

export function addDentalLighting(
  scene: THREE.Scene
) {
  const lightGroup =
    new THREE.Group();

  lightGroup.name =
    "DENTALPOS_LIGHTING";

  const hemisphere =
    new THREE.HemisphereLight(
      0xffffff,
      0x263241,
      1.45
    );

  lightGroup.add(
    hemisphere
  );

  const main =
    new THREE.DirectionalLight(
      0xffffff,
      2.4
    );

  main.position.set(
    80,
    120,
    160
  );

  lightGroup.add(
    main
  );

  const left =
    new THREE.DirectionalLight(
      0xdbeafe,
      1.15
    );

  left.position.set(
    -140,
    50,
    80
  );

  lightGroup.add(
    left
  );

  const right =
    new THREE.DirectionalLight(
      0xffffff,
      0.9
    );

  right.position.set(
    140,
    30,
    40
  );

  lightGroup.add(
    right
  );

  const rear =
    new THREE.DirectionalLight(
      0xbcd7ff,
      0.75
    );

  rear.position.set(
    0,
    90,
    -140
  );

  lightGroup.add(
    rear
  );

  scene.add(
    lightGroup
  );

  return lightGroup;
}

export function removeDentalLighting(
  scene: THREE.Scene,
  lightGroup: THREE.Group | null
) {
  if (!lightGroup) {
    return;
  }

  scene.remove(
    lightGroup
  );

  lightGroup.traverse(
    (object) => {
      if (
        object instanceof
        THREE.Light
      ) {
        object.dispose();
      }
    }
  );
}