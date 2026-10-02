import * as THREE from "three";

export interface ToothDesignSnapshot {
  id: string;

  toothNumber: number;

  geometry: THREE.BufferGeometry;

  position: THREE.Vector3;

  rotation: THREE.Euler;

  quaternion: THREE.Quaternion;

  scale: THREE.Vector3;

  createdAt: number;
}

export interface ToothDesignHistoryOptions {
  maxSnapshots?: number;
}

export class ToothDesignHistory {
  private undoStack: ToothDesignSnapshot[] = [];

  private redoStack: ToothDesignSnapshot[] = [];

  private maxSnapshots: number;

  constructor(
    options: ToothDesignHistoryOptions = {}
  ) {
    this.maxSnapshots =
      options.maxSnapshots ?? 30;
  }

  capture(
    toothNumber: number,
    mesh: THREE.Mesh
  ): ToothDesignSnapshot {
    return {
      id: crypto.randomUUID(),

      toothNumber,

      geometry:
        mesh.geometry.clone(),

      position:
        mesh.position.clone(),

      rotation:
        mesh.rotation.clone(),

      quaternion:
        mesh.quaternion.clone(),

      scale:
        mesh.scale.clone(),

      createdAt:
        Date.now(),
    };
  }

  save(
    toothNumber: number,
    mesh: THREE.Mesh
  ) {
    const snapshot =
      this.capture(
        toothNumber,
        mesh
      );

    this.undoStack.push(
      snapshot
    );

    this.clearSnapshots(
      this.redoStack
    );

    this.redoStack = [];

    while (
      this.undoStack.length >
      this.maxSnapshots
    ) {
      const removed =
        this.undoStack.shift();

      removed?.geometry.dispose();
    }

    return snapshot;
  }

  undo(
    toothNumber: number,
    mesh: THREE.Mesh
  ) {
    if (
      this.undoStack.length === 0
    ) {
      return false;
    }

    const current =
      this.capture(
        toothNumber,
        mesh
      );

    const previous =
      this.undoStack.pop();

    if (!previous) {
      current.geometry.dispose();

      return false;
    }

    this.redoStack.push(
      current
    );

    this.restore(
      mesh,
      previous
    );

    previous.geometry.dispose();

    return true;
  }

  redo(
    toothNumber: number,
    mesh: THREE.Mesh
  ) {
    if (
      this.redoStack.length === 0
    ) {
      return false;
    }

    const current =
      this.capture(
        toothNumber,
        mesh
      );

    const next =
      this.redoStack.pop();

    if (!next) {
      current.geometry.dispose();

      return false;
    }

    this.undoStack.push(
      current
    );

    this.restore(
      mesh,
      next
    );

    next.geometry.dispose();

    return true;
  }

  private restore(
    mesh: THREE.Mesh,
    snapshot: ToothDesignSnapshot
  ) {
    const previousGeometry =
      mesh.geometry;

    mesh.geometry =
      snapshot.geometry.clone();

    mesh.position.copy(
      snapshot.position
    );

    mesh.rotation.copy(
      snapshot.rotation
    );

    mesh.quaternion.copy(
      snapshot.quaternion
    );

    mesh.scale.copy(
      snapshot.scale
    );

    mesh.geometry.computeVertexNormals();

    mesh.geometry.computeBoundingBox();

    mesh.geometry.computeBoundingSphere();

    previousGeometry.dispose();

    mesh.updateMatrixWorld(
      true
    );
  }

  canUndo() {
    return (
      this.undoStack.length >
      0
    );
  }

  canRedo() {
    return (
      this.redoStack.length >
      0
    );
  }

  getUndoCount() {
    return this.undoStack.length;
  }

  getRedoCount() {
    return this.redoStack.length;
  }

  clear() {
    this.clearSnapshots(
      this.undoStack
    );

    this.clearSnapshots(
      this.redoStack
    );

    this.undoStack = [];

    this.redoStack = [];
  }

  private clearSnapshots(
    snapshots: ToothDesignSnapshot[]
  ) {
    snapshots.forEach(
      (snapshot) => {
        snapshot.geometry.dispose();
      }
    );
  }
}

export function createToothDesignHistory(
  options: ToothDesignHistoryOptions = {}
) {
  return new ToothDesignHistory(
    options
  );
}