import * as THREE from "three";

export interface MeshHistoryState {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

export class MeshHistory {
  private undoStack: MeshHistoryState[] = [];

  private redoStack: MeshHistoryState[] = [];

  private maxHistory = 50;

  capture(
    object: THREE.Object3D
  ): MeshHistoryState {
    return {
      position:
        object.position.clone(),

      rotation:
        object.rotation.clone(),

      scale:
        object.scale.clone(),
    };
  }

  save(
    object: THREE.Object3D
  ) {
    const state =
      this.capture(object);

    this.undoStack.push(
      state
    );

    if (
      this.undoStack.length >
      this.maxHistory
    ) {
      this.undoStack.shift();
    }

    this.redoStack = [];
  }

  undo(
    object: THREE.Object3D
  ): boolean {
    if (
      this.undoStack.length === 0
    ) {
      return false;
    }

    const current =
      this.capture(object);

    const previous =
      this.undoStack.pop();

    if (!previous) {
      return false;
    }

    this.redoStack.push(
      current
    );

    this.applyState(
      object,
      previous
    );

    return true;
  }

  redo(
    object: THREE.Object3D
  ): boolean {
    if (
      this.redoStack.length === 0
    ) {
      return false;
    }

    const current =
      this.capture(object);

    const next =
      this.redoStack.pop();

    if (!next) {
      return false;
    }

    this.undoStack.push(
      current
    );

    this.applyState(
      object,
      next
    );

    return true;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }

  canUndo() {
    return (
      this.undoStack.length > 0
    );
  }

  canRedo() {
    return (
      this.redoStack.length > 0
    );
  }

  private applyState(
    object: THREE.Object3D,
    state: MeshHistoryState
  ) {
    object.position.copy(
      state.position
    );

    object.rotation.copy(
      state.rotation
    );

    object.scale.copy(
      state.scale
    );

    object.updateMatrixWorld(
      true
    );
  }
}

export function createMeshHistory() {
  return new MeshHistory();
}