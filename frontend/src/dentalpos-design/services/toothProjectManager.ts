import {
  createDentalPosProject,
  updateProjectFromScene,
  downloadDentalPosProject,
  readDentalPosProjectFile,
  type DentalPosDesignProject,
} from "./toothProject";

import {
  loadProjectIntoSession,
  validateProjectStructure,
} from "./toothProjectLoader";

import {
  type ToothDesignSession,
} from "./toothDesignSession";

export class ToothProjectManager {
  private project:
    DentalPosDesignProject;

  private session:
    ToothDesignSession;

  constructor(
    session: ToothDesignSession,
    projectName = "Novo Projeto"
  ) {
    this.session =
      session;

    this.project =
      createDentalPosProject(
        projectName
      );
  }

  getProject() {
    return {
      ...this.project,

      teeth:
        this.project.teeth.map(
          (tooth) => ({
            ...tooth,

            position: [
              ...tooth.position,
            ] as [
              number,
              number,
              number
            ],

            rotation: [
              ...tooth.rotation,
            ] as [
              number,
              number,
              number
            ],

            scale: [
              ...tooth.scale,
            ] as [
              number,
              number,
              number
            ],
          })
        ),
    };
  }

  getProjectName() {
    return this.project.name;
  }

  setProjectName(
    name: string
  ) {
    const trimmed =
      name.trim();

    if (!trimmed) {
      return false;
    }

    this.project.name =
      trimmed;

    this.project.updatedAt =
      new Date().toISOString();

    return true;
  }

  newProject(
    name = "Novo Projeto"
  ) {
    this.session.clear();

    this.project =
      createDentalPosProject(
        name
      );

    return this.getProject();
  }

  syncFromSession() {
    const teeth =
      this.session
        .getAllTeeth()
        .map(
          (instance) => ({
            toothNumber:
              instance.toothNumber,

            mesh:
              instance.mesh,
          })
        );

    this.project =
      updateProjectFromScene(
        this.project,
        teeth
      );

    return this.getProject();
  }

  saveProject() {
    this.syncFromSession();

    downloadDentalPosProject(
      this.project
    );

    return this.getProject();
  }

  async openProjectFile(
    file: File
  ) {
    const project =
      await readDentalPosProjectFile(
        file
      );

    const validation =
      validateProjectStructure(
        project
      );

    if (!validation.valid) {
      throw new Error(
        validation.errors.join(
          "\n"
        )
      );
    }

    const result =
      await loadProjectIntoSession(
        project,
        this.session
      );

    this.project = {
      ...project,

      updatedAt:
        new Date().toISOString(),
    };

    return {
      project:
        this.getProject(),

      result,
    };
  }

  async loadProject(
    project: DentalPosDesignProject
  ) {
    const validation =
      validateProjectStructure(
        project
      );

    if (!validation.valid) {
      throw new Error(
        validation.errors.join(
          "\n"
        )
      );
    }

    const result =
      await loadProjectIntoSession(
        project,
        this.session
      );

    this.project = {
      ...project,
    };

    return result;
  }

  hasChanges() {
    const currentTeeth =
      this.session.getAllTeeth();

    if (
      currentTeeth.length !==
      this.project.teeth.length
    ) {
      return true;
    }

    for (
      const instance of currentTeeth
    ) {
      const saved =
        this.project.teeth.find(
          (item) =>
            item.toothNumber ===
            instance.toothNumber
        );

      if (!saved) {
        return true;
      }

      const mesh =
        instance.mesh;

      const tolerance =
        0.000001;

      if (
        Math.abs(
          mesh.position.x -
            saved.position[0]
        ) > tolerance ||
        Math.abs(
          mesh.position.y -
            saved.position[1]
        ) > tolerance ||
        Math.abs(
          mesh.position.z -
            saved.position[2]
        ) > tolerance
      ) {
        return true;
      }

      if (
        Math.abs(
          mesh.rotation.x -
            saved.rotation[0]
        ) > tolerance ||
        Math.abs(
          mesh.rotation.y -
            saved.rotation[1]
        ) > tolerance ||
        Math.abs(
          mesh.rotation.z -
            saved.rotation[2]
        ) > tolerance
      ) {
        return true;
      }

      if (
        Math.abs(
          mesh.scale.x -
            saved.scale[0]
        ) > tolerance ||
        Math.abs(
          mesh.scale.y -
            saved.scale[1]
        ) > tolerance ||
        Math.abs(
          mesh.scale.z -
            saved.scale[2]
        ) > tolerance
      ) {
        return true;
      }

      if (
        mesh.visible !==
        saved.visible
      ) {
        return true;
      }
    }

    return false;
  }
}

export function createToothProjectManager(
  session: ToothDesignSession,
  projectName = "Novo Projeto"
) {
  return new ToothProjectManager(
    session,
    projectName
  );
}