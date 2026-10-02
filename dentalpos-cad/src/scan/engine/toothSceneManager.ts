import * as THREE from "three";

import {
  createToothLibraryManager,
  type ToothInstance,
  type ToothLibraryManager,
} from "./toothLibraryManager";

export class ToothSceneManager {
  private scene: THREE.Scene;

  private library: ToothLibraryManager;

  private selectedInstanceId:
    | string
    | null = null;

  constructor(
    scene: THREE.Scene
  ) {
    this.scene = scene;

    this.library =
      createToothLibraryManager();
  }

  async insertTooth(
    toothNumber: number
  ): Promise<ToothInstance> {
    /*
     * Impede inserir acidentalmente
     * duas instâncias do mesmo dente.
     */

    const existing =
      this.library.getInstancesByTooth(
        toothNumber
      );

    if (existing.length > 0) {
      this.selectInstance(
        existing[0].id
      );

      return existing[0];
    }

    const instance =
      await this.library.createTooth(
        toothNumber
      );

    this.library.addToScene(
      instance.id,
      this.scene
    );

    this.selectInstance(
      instance.id
    );

    return instance;
  }

  selectInstance(
    id: string
  ) {
    const instance =
      this.library.getInstance(
        id
      );

    if (!instance) {
      return null;
    }

    this.selectedInstanceId =
      id;

    return instance;
  }

  getSelectedInstance() {
    if (
      !this.selectedInstanceId
    ) {
      return null;
    }

    return this.library.getInstance(
      this.selectedInstanceId
    );
  }

  getSelectedMesh() {
    return (
      this.getSelectedInstance()
        ?.mesh ?? null
    );
  }

  getInstanceByTooth(
    toothNumber: number
  ) {
    const instances =
      this.library.getInstancesByTooth(
        toothNumber
      );

    return (
      instances[0] ?? null
    );
  }

  getMeshByTooth(
    toothNumber: number
  ) {
    return (
      this.getInstanceByTooth(
        toothNumber
      )?.mesh ?? null
    );
  }

  removeSelected() {
    if (
      !this.selectedInstanceId
    ) {
      return false;
    }

    const removed =
      this.library.removeInstance(
        this.selectedInstanceId,
        this.scene
      );

    if (removed) {
      this.selectedInstanceId =
        null;
    }

    return removed;
  }

  removeTooth(
    toothNumber: number
  ) {
    const instance =
      this.getInstanceByTooth(
        toothNumber
      );

    if (!instance) {
      return false;
    }

    const removed =
      this.library.removeInstance(
        instance.id,
        this.scene
      );

    if (
      this.selectedInstanceId ===
      instance.id
    ) {
      this.selectedInstanceId =
        null;
    }

    return removed;
  }

  getAllTeeth() {
    return this.library
      .getAllInstances();
  }

  hideTooth(
    toothNumber: number
  ) {
    const instance =
      this.getInstanceByTooth(
        toothNumber
      );

    if (!instance) {
      return false;
    }

    return this.library.hideInstance(
      instance.id
    );
  }

  showTooth(
    toothNumber: number
  ) {
    const instance =
      this.getInstanceByTooth(
        toothNumber
      );

    if (!instance) {
      return false;
    }

    return this.library.showInstance(
      instance.id
    );
  }

  clear() {
    this.library.removeAll(
      this.scene
    );

    this.selectedInstanceId =
      null;
  }
}

export function createToothSceneManager(
  scene: THREE.Scene
) {
  return new ToothSceneManager(
    scene
  );
}