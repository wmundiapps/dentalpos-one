import * as THREE from "three";

import {
  createToothDesignSession,
  type ToothDesignSession,
} from "./toothDesignSession";

import {
  createToothDesignWorkflow,
  type ToothDesignWorkflow,
} from "./toothDesignWorkflow";

import {
  createToothProjectManager,
  type ToothProjectManager,
} from "./toothProjectManager";

import {
  createToothProjectAutosave,
  type ToothProjectAutosave,
} from "./toothProjectAutosave";

import {
  recoverAutosavedProject,
} from "./toothProjectRecovery";

import {
  generateToothDesignReport,
} from "./toothDesignReport";

import {
  finalizeDentalDesign,
  type FinalizationOptions,
} from "./toothDesignFinalizer";

export class ToothDesignEngineManager {
  private scene: THREE.Scene;

  private session: ToothDesignSession;

  private workflow: ToothDesignWorkflow;

  private projectManager: ToothProjectManager;

  private autosave: ToothProjectAutosave;

  constructor(
    scene: THREE.Scene,
    projectName = "Novo Projeto"
  ) {
    this.scene =
      scene;

    this.session =
      createToothDesignSession(
        scene
      );

    this.workflow =
      createToothDesignWorkflow(
        this.session
      );

    this.projectManager =
      createToothProjectManager(
        this.session,
        projectName
      );

    this.autosave =
      createToothProjectAutosave(
        this.session,
        this.projectManager.getProject(),
        {
          interval: 30000,
          enabled: true,
        }
      );
  }

  start() {
    this.autosave.start();

    return this;
  }

  async insertTooth(
    toothNumber: number
  ) {
    const instance =
      await this.session.insertTooth(
        toothNumber
      );

    this.syncAutosaveProject();

    return instance;
  }

  selectTooth(
    toothNumber: number
  ) {
    return this.session.selectTooth(
      toothNumber
    );
  }

  removeSelected() {
    const result =
      this.session.removeSelected();

    if (result) {
      this.syncAutosaveProject();
    }

    return result;
  }

  analyzeSelected() {
    return this.workflow.analyzeSelected();
  }

  autoPlaceSelected() {
    const result =
      this.workflow.autoPlaceSelected();

    this.syncAutosaveProject();

    return result;
  }

  applyGoldenProportion() {
    const result =
      this.workflow.applyGoldenProportionToSelected();

    this.syncAutosaveProject();

    return result;
  }

  undo() {
    const result =
      this.workflow.undo();

    if (result) {
      this.syncAutosaveProject();
    }

    return result;
  }

  redo() {
    const result =
      this.workflow.redo();

    if (result) {
      this.syncAutosaveProject();
    }

    return result;
  }

  saveProject() {
    const project =
      this.projectManager.saveProject();

    this.autosave.setProject(
      project
    );

    return project;
  }

  newProject(
    name = "Novo Projeto"
  ) {
    const project =
      this.projectManager.newProject(
        name
      );

    this.autosave.clear();

    this.autosave.setProject(
      project
    );

    return project;
  }

  async openProject(
    file: File
  ) {
    const result =
      await this.projectManager.openProjectFile(
        file
      );

    this.autosave.setProject(
      result.project
    );

    this.autosave.save();

    return result;
  }

  async recoverProject() {
    const result =
      await recoverAutosavedProject(
        this.autosave,
        this.session
      );

    if (
      result.recovered &&
      result.project
    ) {
      await this.projectManager.loadProject(
        result.project
      );

      this.autosave.setProject(
        this.projectManager.getProject()
      );
    }

    return result;
  }

  hasRecovery() {
    return this.autosave.hasAutosave();
  }

  generateReport() {
    return generateToothDesignReport(
      this.session
    );
  }

  finalize(
    options: FinalizationOptions = {}
  ) {
    return finalizeDentalDesign(
      this.session,
      options
    );
  }

  getSession() {
    return this.session;
  }

  getWorkflow() {
    return this.workflow;
  }

  getProjectManager() {
    return this.projectManager;
  }

  getAutosave() {
    return this.autosave;
  }

  getScene() {
    return this.scene;
  }

  getSelectedToothNumber() {
    return this.session.getSelectedToothNumber();
  }

  getSelectedMesh() {
    return this.session.getSelectedMesh();
  }

  private syncAutosaveProject() {
    const project =
      this.projectManager.syncFromSession();

    this.autosave.setProject(
      project
    );

    this.autosave.save();
  }

  dispose() {
    this.autosave.dispose();

    this.session.dispose();
  }
}

export function createToothDesignEngineManager(
  scene: THREE.Scene,
  projectName = "Novo Projeto"
) {
  return new ToothDesignEngineManager(
    scene,
    projectName
  );
}