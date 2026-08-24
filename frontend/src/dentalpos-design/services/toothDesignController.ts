import * as THREE from "three";

import {
  createToothDesignHistory,
  type ToothDesignHistory,
} from "./toothDesignHistory";

import {
  createToothDesignState,
  type DentalDesignMode,
  type ToothDesignStateManager,
} from "./toothDesignState";

export class ToothDesignController {
  private state: ToothDesignStateManager;

  private history: ToothDesignHistory;

  constructor() {
    this.state =
      createToothDesignState();

    this.history =
      createToothDesignHistory({
        maxSnapshots: 40,
      });
  }

  selectTooth(
    toothNumber: number,
    mesh: THREE.Mesh
  ) {
    this.state.selectTooth(
      toothNumber,
      mesh
    );
  }

  clearSelection() {
    this.state.clearSelection();
  }

  setMode(
    mode: DentalDesignMode
  ) {
    this.state.setMode(
      mode
    );
  }

  getState() {
    return this.state.getState();
  }

  getSelectedMesh() {
    return this.state.getSelectedMesh();
  }

  getSelectedToothNumber() {
    return this.state.getSelectedToothNumber();
  }

  saveHistory() {
    const mesh =
      this.getSelectedMesh();

    const toothNumber =
      this.getSelectedToothNumber();

    if (
      !mesh ||
      toothNumber === null
    ) {
      return false;
    }

    this.history.save(
      toothNumber,
      mesh
    );

    return true;
  }

  undo() {
    const mesh =
      this.getSelectedMesh();

    const toothNumber =
      this.getSelectedToothNumber();

    if (
      !mesh ||
      toothNumber === null
    ) {
      return false;
    }

    const result =
      this.history.undo(
        toothNumber,
        mesh
      );

    if (result) {
      this.state.setModified(
        true
      );
    }

    return result;
  }

  redo() {
    const mesh =
      this.getSelectedMesh();

    const toothNumber =
      this.getSelectedToothNumber();

    if (
      !mesh ||
      toothNumber === null
    ) {
      return false;
    }

    const result =
      this.history.redo(
        toothNumber,
        mesh
      );

    if (result) {
      this.state.setModified(
        true
      );
    }

    return result;
  }

  canUndo() {
    return this.history.canUndo();
  }

  canRedo() {
    return this.history.canRedo();
  }

  beginModification() {
    const saved =
      this.saveHistory();

    if (saved) {
      this.state.setBusy(
        true
      );
    }

    return saved;
  }

  endModification() {
    this.state.setBusy(
      false
    );

    this.state.setModified(
      true
    );
  }

  cancelModification() {
    const restored =
      this.undo();

    this.state.setBusy(
      false
    );

    return restored;
  }

  moveSelected(
    movement: THREE.Vector3
  ) {
    const mesh =
      this.getSelectedMesh();

    if (!mesh) {
      return false;
    }

    this.beginModification();

    mesh.position.add(
      movement
    );

    mesh.updateMatrixWorld(
      true
    );

    this.endModification();

    return true;
  }

  rotateSelected(
    rotationDegrees: THREE.Vector3
  ) {
    const mesh =
      this.getSelectedMesh();

    if (!mesh) {
      return false;
    }

    this.beginModification();

    mesh.rotation.x +=
      THREE.MathUtils.degToRad(
        rotationDegrees.x
      );

    mesh.rotation.y +=
      THREE.MathUtils.degToRad(
        rotationDegrees.y
      );

    mesh.rotation.z +=
      THREE.MathUtils.degToRad(
        rotationDegrees.z
      );

    mesh.updateMatrixWorld(
      true
    );

    this.endModification();

    return true;
  }

  scaleSelected(
    scale: THREE.Vector3
  ) {
    const mesh =
      this.getSelectedMesh();

    if (!mesh) {
      return false;
    }

    this.beginModification();

    mesh.scale.multiply(
      scale
    );

    mesh.updateMatrixWorld(
      true
    );

    this.endModification();

    return true;
  }

  resetSelectedTransform() {
    const mesh =
      this.getSelectedMesh();

    if (!mesh) {
      return false;
    }

    this.beginModification();

    mesh.position.set(
      0,
      0,
      0
    );

    mesh.rotation.set(
      0,
      0,
      0
    );

    mesh.scale.set(
      1,
      1,
      1
    );

    mesh.updateMatrixWorld(
      true
    );

    this.endModification();

    return true;
  }

  subscribe(
    listener: Parameters<
      ToothDesignStateManager["subscribe"]
    >[0]
  ) {
    return this.state.subscribe(
      listener
    );
  }

  reset() {
    this.history.clear();

    this.state.reset();
  }

  dispose() {
    this.history.clear();

    this.state.reset();
  }
}

export function createToothDesignController() {
  return new ToothDesignController();
}