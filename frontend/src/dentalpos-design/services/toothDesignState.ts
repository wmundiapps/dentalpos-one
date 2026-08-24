import * as THREE from "three";

export type DentalDesignMode =
  | "idle"
  | "select"
  | "move"
  | "rotate"
  | "scale"
  | "margin"
  | "occlusion"
  | "morphology"
  | "measure";

export interface ToothDesignState {
  mode: DentalDesignMode;

  selectedToothNumber:
    | number
    | null;

  selectedMesh:
    | THREE.Mesh
    | null;

  active: boolean;

  modified: boolean;

  busy: boolean;
}

export class ToothDesignStateManager {
  private state: ToothDesignState = {
    mode: "idle",

    selectedToothNumber:
      null,

    selectedMesh:
      null,

    active: false,

    modified: false,

    busy: false,
  };

  private listeners =
    new Set<
      (
        state: ToothDesignState
      ) => void
    >();

  getState(): ToothDesignState {
    return {
      ...this.state,
    };
  }

  setMode(
    mode: DentalDesignMode
  ) {
    this.state.mode =
      mode;

    this.emit();
  }

  selectTooth(
    toothNumber: number,
    mesh: THREE.Mesh
  ) {
    this.state.selectedToothNumber =
      toothNumber;

    this.state.selectedMesh =
      mesh;

    this.state.active =
      true;

    this.emit();
  }

  clearSelection() {
    this.state.selectedToothNumber =
      null;

    this.state.selectedMesh =
      null;

    this.state.active =
      false;

    this.state.mode =
      "idle";

    this.emit();
  }

  setModified(
    modified = true
  ) {
    this.state.modified =
      modified;

    this.emit();
  }

  setBusy(
    busy: boolean
  ) {
    this.state.busy =
      busy;

    this.emit();
  }

  isToothSelected() {
    return Boolean(
      this.state.selectedMesh &&
      this.state.selectedToothNumber
    );
  }

  getSelectedMesh() {
    return this.state
      .selectedMesh;
  }

  getSelectedToothNumber() {
    return this.state
      .selectedToothNumber;
  }

  subscribe(
    listener: (
      state: ToothDesignState
    ) => void
  ) {
    this.listeners.add(
      listener
    );

    listener(
      this.getState()
    );

    return () => {
      this.listeners.delete(
        listener
      );
    };
  }

  reset() {
    this.state = {
      mode: "idle",

      selectedToothNumber:
        null,

      selectedMesh:
        null,

      active: false,

      modified: false,

      busy: false,
    };

    this.emit();
  }

  private emit() {
    const snapshot =
      this.getState();

    this.listeners.forEach(
      (listener) => {
        listener(
          snapshot
        );
      }
    );
  }
}

export function createToothDesignState() {
  return new ToothDesignStateManager();
}