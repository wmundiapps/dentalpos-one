import * as THREE from "three";

export type DentalRenderMode =
  | "clinical"
  | "matte"
  | "highContrast"
  | "wireframe"
  | "translucent";

export function createRenderMaterial(
  mode: DentalRenderMode
): THREE.Material {
  switch (mode) {
    case "matte":
      return new THREE.MeshStandardMaterial({
        color: 0xd8dee6,
        roughness: 0.9,
        metalness: 0,
        side: THREE.DoubleSide,
      });

    case "highContrast":
      return new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.42,
        metalness: 0,
        side: THREE.DoubleSide,
      });

    case "wireframe":
      return new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        wireframe: true,
        side: THREE.DoubleSide,
      });

    case "translucent":
      return new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        roughness: 0.55,
        metalness: 0,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

    case "clinical":
    default:
      return new THREE.MeshStandardMaterial({
        color: 0xe8edf2,
        roughness: 0.58,
        metalness: 0,
        side: THREE.DoubleSide,
      });
  }
}

export function applyRenderMode(
  mesh: THREE.Mesh,
  mode: DentalRenderMode
) {
  const oldMaterial = mesh.material;

  mesh.material =
    createRenderMaterial(mode);

  if (Array.isArray(oldMaterial)) {
    oldMaterial.forEach(
      (material) =>
        material.dispose()
    );
  } else {
    oldMaterial.dispose();
  }
}