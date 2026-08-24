import * as THREE from "three";

import {
  loadToothFromLibrary,
  type LoadedLibraryTooth,
} from "./toothLibraryLoader";

export interface ToothInstance {
  id: string;
  toothNumber: number;
  mesh: THREE.Mesh;
  source: LoadedLibraryTooth;
}

export class ToothLibraryManager {
  private instances =
    new Map<string, ToothInstance>();

  async createTooth(
    toothNumber: number
  ): Promise<ToothInstance> {
    const loaded =
      await loadToothFromLibrary(
        toothNumber
      );

    const id =
      crypto.randomUUID();

    loaded.mesh.userData = {
      ...loaded.mesh.userData,
      instanceId: id,
    };

    const instance: ToothInstance = {
      id,
      toothNumber,
      mesh: loaded.mesh,
      source: loaded,
    };

    this.instances.set(
      id,
      instance
    );

    return instance;
  }

  getInstance(
    id: string
  ): ToothInstance | null {
    return (
      this.instances.get(id) ??
      null
    );
  }

  getAllInstances() {
    return Array.from(
      this.instances.values()
    );
  }

  getInstancesByTooth(
    toothNumber: number
  ) {
    return this.getAllInstances().filter(
      (instance) =>
        instance.toothNumber ===
        toothNumber
    );
  }

  removeInstance(
    id: string,
    scene?: THREE.Scene
  ) {
    const instance =
      this.instances.get(id);

    if (!instance) {
      return false;
    }

    if (scene) {
      scene.remove(
        instance.mesh
      );
    }

    instance.mesh.geometry.dispose();

    const material =
      instance.mesh.material;

    if (Array.isArray(material)) {
      material.forEach(
        (item) =>
          item.dispose()
      );
    } else {
      material.dispose();
    }

    this.instances.delete(id);

    return true;
  }

  removeAll(
    scene?: THREE.Scene
  ) {
    const ids =
      Array.from(
        this.instances.keys()
      );

    ids.forEach(
      (id) =>
        this.removeInstance(
          id,
          scene
        )
    );
  }

  addToScene(
    id: string,
    scene: THREE.Scene
  ) {
    const instance =
      this.instances.get(id);

    if (!instance) {
      return false;
    }

    if (
      instance.mesh.parent !==
      scene
    ) {
      scene.add(
        instance.mesh
      );
    }

    return true;
  }

  hideInstance(
    id: string
  ) {
    const instance =
      this.instances.get(id);

    if (!instance) {
      return false;
    }

    instance.mesh.visible =
      false;

    return true;
  }

  showInstance(
    id: string
  ) {
    const instance =
      this.instances.get(id);

    if (!instance) {
      return false;
    }

    instance.mesh.visible =
      true;

    return true;
  }

  clear() {
    this.removeAll();
  }
}

export function createToothLibraryManager() {
  return new ToothLibraryManager();
}