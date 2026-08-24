import * as THREE from "three";

import {
  createToothDesignEngineManager,
  type ToothDesignEngineManager,
} from "./services";

export interface DentalPosDesignOptions {
  projectName?: string;
  autosave?: boolean;
}

export class DentalPosDesign {
  private scene: THREE.Scene;

  private engine:
    ToothDesignEngineManager;

  private initialized = false;

  constructor(
    scene: THREE.Scene,
    options: DentalPosDesignOptions = {}
  ) {
    this.scene = scene;

    this.engine =
      createToothDesignEngineManager(
        scene,
        options.projectName ??
          "Novo Projeto"
      );

    if (
      options.autosave !== false
    ) {
      this.engine.start();
    }

    this.initialized = true;
  }

  isInitialized() {
    return this.initialized;
  }

  async addTooth(
    toothNumber: number
  ) {
    return this.engine.insertTooth(
      toothNumber
    );
  }

  selectTooth(
    toothNumber: number
  ) {
    return this.engine.selectTooth(
      toothNumber
    );
  }

  removeSelected() {
    return this.engine.removeSelected();
  }

  getSelectedTooth() {
    return {
      toothNumber:
        this.engine.getSelectedToothNumber(),

      mesh:
        this.engine.getSelectedMesh(),
    };
  }

  analyzeSelected() {
    return this.engine.analyzeSelected();
  }

  autoPlaceSelected() {
    return this.engine.autoPlaceSelected();
  }

  applyGoldenProportion() {
    return this.engine.applyGoldenProportion();
  }

  undo() {
    return this.engine.undo();
  }

  redo() {
    return this.engine.redo();
  }

  saveProject() {
    return this.engine.saveProject();
  }

  newProject(
    name = "Novo Projeto"
  ) {
    return this.engine.newProject(
      name
    );
  }

  async openProject(
    file: File
  ) {
    return this.engine.openProject(
      file
    );
  }

  hasRecovery() {
    return this.engine.hasRecovery();
  }

  async recoverProject() {
    return this.engine.recoverProject();
  }

  generateReport() {
    return this.engine.generateReport();
  }

  finalizeForManufacturing(
    exportSTL = false
  ) {
    return this.engine.finalize({
      exportSTL,
      minimumQualityScore: 70,
      allowWarnings: true,
    });
  }

  getScene() {
    return this.scene;
  }

  getEngine() {
    return this.engine;
  }

  getSession() {
    return this.engine.getSession();
  }

  getProjectManager() {
    return this.engine.getProjectManager();
  }

  clear() {
    this.engine.newProject(
      "Novo Projeto"
    );
  }

  dispose() {
    if (!this.initialized) {
      return;
    }

    this.engine.dispose();

    this.initialized = false;
  }
}

export function createDentalPosDesign(
  scene: THREE.Scene,
  options: DentalPosDesignOptions = {}
) {
  return new DentalPosDesign(
    scene,
    options
  );
}