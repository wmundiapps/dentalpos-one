import * as THREE from "three";

import {
  createToothDesignController,
  type ToothDesignController,
} from "./toothDesignController";

import {
  createToothSceneManager,
  type ToothSceneManager,
} from "./toothSceneManager";

export interface ToothDesignSessionOptions {
  scene: THREE.Scene;
}

export class ToothDesignSession {
  private scene: THREE.Scene;

  private sceneManager: ToothSceneManager;

  private controller: ToothDesignController;

  constructor(
    options: ToothDesignSessionOptions
  ) {
    this.scene =
      options.scene;

    this.sceneManager =
      createToothSceneManager(
        this.scene
      );

    this.controller =
      createToothDesignController();
  }

  async insertTooth(
    toothNumber: number
  ) {
    const instance =
      await this.sceneManager.insertTooth(
        toothNumber
      );

    this.controller.selectTooth(
      toothNumber,
      instance.mesh
    );

    return instance;
  }

  selectTooth(
    toothNumber: number
  ) {
    const instance =
      this.sceneManager.getInstanceByTooth(
        toothNumber
      );

    if (!instance) {
      return false;
    }

    this.sceneManager.selectInstance(
      instance.id
    );

    this.controller.selectTooth(
      toothNumber,
      instance.mesh
    );

    return true;
  }

  removeSelected() {
    const selected =
      this.sceneManager.getSelectedInstance();

    if (!selected) {
      return false;
    }

    const removed =
      this.sceneManager.removeSelected();

    if (removed) {
      this.controller.clearSelection();
    }

    return removed;
  }

  removeTooth(
    toothNumber: number
  ) {
    const selectedNumber =
      this.controller.getSelectedToothNumber();

    const removed =
      this.sceneManager.removeTooth(
        toothNumber
      );

    if (
      removed &&
      selectedNumber ===
        toothNumber
    ) {
      this.controller.clearSelection();
    }

    return removed;
  }

  getSelectedMesh() {
    return this.controller.getSelectedMesh();
  }

  getSelectedToothNumber() {
    return this.controller.getSelectedToothNumber();
  }

  getToothMesh(
    toothNumber: number
  ) {
    return this.sceneManager.getMeshByTooth(
      toothNumber
    );
  }

  getAllTeeth() {
    return this.sceneManager.getAllTeeth();
  }

  moveSelected(
    x: number,
    y: number,
    z: number
  ) {
    return this.controller.moveSelected(
      new THREE.Vector3(
        x,
        y,
        z
      )
    );
  }

  rotateSelected(
    x: number,
    y: number,
    z: number
  ) {
    return this.controller.rotateSelected(
      new THREE.Vector3(
        x,
        y,
        z
      )
    );
  }

  scaleSelected(
    x: number,
    y: number,
    z: number
  ) {
    return this.controller.scaleSelected(
      new THREE.Vector3(
        x,
        y,
        z
      )
    );
  }

  undo() {
    return this.controller.undo();
  }

  redo() {
    return this.controller.redo();
  }

  canUndo() {
    return this.controller.canUndo();
  }

  canRedo() {
    return this.controller.canRedo();
  }

  getController() {
    return this.controller;
  }

  getSceneManager() {
    return this.sceneManager;
  }

  clear() {
    this.sceneManager.clear();

    this.controller.reset();
  }

  dispose() {
    this.sceneManager.clear();

    this.controller.dispose();
  }
}

export function createToothDesignSession(
  scene: THREE.Scene
) {
  return new ToothDesignSession({
    scene,
  });
}