import {
  type DentalPosDesignProject,
} from "./toothProject";

import {
  type ToothDesignSession,
} from "./toothDesignSession";

import {
  loadProjectIntoSession,
  validateProjectStructure,
} from "./toothProjectLoader";

import {
  type ToothProjectAutosave,
} from "./toothProjectAutosave";

export interface ProjectRecoveryResult {
  recovered: boolean;

  project:
    | DentalPosDesignProject
    | null;

  loaded: number;

  failed: number;

  failedTeeth: number[];

  message: string;
}

export async function recoverAutosavedProject(
  autosave: ToothProjectAutosave,
  session: ToothDesignSession
): Promise<ProjectRecoveryResult> {
  const project =
    autosave.load();

  if (!project) {
    return {
      recovered: false,

      project: null,

      loaded: 0,

      failed: 0,

      failedTeeth: [],

      message:
        "Nenhum projeto de recuperação encontrado.",
    };
  }

  const validation =
    validateProjectStructure(
      project
    );

  if (!validation.valid) {
    return {
      recovered: false,

      project,

      loaded: 0,

      failed: 0,

      failedTeeth: [],

      message:
        validation.errors.join(
          "\n"
        ),
    };
  }

  try {
    const result =
      await loadProjectIntoSession(
        project,
        session
      );

    return {
      recovered: true,

      project,

      loaded:
        result.loaded,

      failed:
        result.failed,

      failedTeeth:
        result.failedTeeth,

      message:
        result.failed === 0
          ? "Projeto recuperado com sucesso."
          : "Projeto recuperado parcialmente.",
    };
  } catch {
    return {
      recovered: false,

      project,

      loaded: 0,

      failed:
        project.teeth.length,

      failedTeeth:
        project.teeth.map(
          (item) =>
            item.toothNumber
        ),

      message:
        "Não foi possível recuperar o projeto.",
    };
  }
}

export function getRecoveryProjectInfo(
  autosave: ToothProjectAutosave
) {
  const project =
    autosave.load();

  if (!project) {
    return null;
  }

  return {
    name:
      project.name,

    version:
      project.version,

    createdAt:
      project.createdAt,

    updatedAt:
      project.updatedAt,

    toothCount:
      project.teeth.length,
  };
}

export function hasRecoverableProject(
  autosave: ToothProjectAutosave
) {
  if (
    !autosave.hasAutosave()
  ) {
    return false;
  }

  const project =
    autosave.load();

  if (!project) {
    return false;
  }

  const validation =
    validateProjectStructure(
      project
    );

  return validation.valid;
}

export function discardRecoveryProject(
  autosave: ToothProjectAutosave
) {
  return autosave.clear();
}