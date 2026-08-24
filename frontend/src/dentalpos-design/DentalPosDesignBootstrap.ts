import * as THREE from "three";

import {
  createDentalPosDesign,
  type DentalPosDesign,
} from "./DentalPosDesign";

import {
  DENTALPOS_DESIGN_CONFIG,
} from "./DentalPosDesignConfig";

let instance:
  DentalPosDesign | null =
  null;

export function initializeDentalPosDesign(
  scene: THREE.Scene
) {
  if (instance) {
    return instance;
  }

  instance =
    createDentalPosDesign(
      scene,
      {
        projectName:
          "Novo Projeto",

        autosave:
          DENTALPOS_DESIGN_CONFIG
            .autosave
            .enabled,
      }
    );

  return instance;
}

export function getDentalPosDesignInstance() {
  return instance;
}

export function isDentalPosDesignInitialized() {
  return instance !== null;
}

export function disposeDentalPosDesign() {
  if (!instance) {
    return;
  }

  instance.dispose();

  instance = null;
}

export function restartDentalPosDesign(
  scene: THREE.Scene
) {
  disposeDentalPosDesign();

  return initializeDentalPosDesign(
    scene
  );
}