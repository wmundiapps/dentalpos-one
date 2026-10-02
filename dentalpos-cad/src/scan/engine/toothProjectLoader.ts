import {
  type DentalPosDesignProject,
  type ToothProjectItem,
  applyProjectItemTransform,
} from "./toothProject";

import {
  type ToothDesignSession,
} from "./toothDesignSession";

export interface ProjectLoadResult {
  loaded: number;

  failed: number;

  failedTeeth: number[];
}

export async function loadProjectIntoSession(
  project: DentalPosDesignProject,
  session: ToothDesignSession
): Promise<ProjectLoadResult> {
  session.clear();

  let loaded = 0;

  let failed = 0;

  const failedTeeth:
    number[] = [];

  for (
    const item of project.teeth
  ) {
    try {
      const instance =
        await session.insertTooth(
          item.toothNumber
        );

      applyProjectItemTransform(
        instance.mesh,
        item
      );

      loaded += 1;
    } catch {
      failed += 1;

      failedTeeth.push(
        item.toothNumber
      );
    }
  }

  return {
    loaded,

    failed,

    failedTeeth,
  };
}

export async function loadSingleProjectTooth(
  item: ToothProjectItem,
  session: ToothDesignSession
) {
  const instance =
    await session.insertTooth(
      item.toothNumber
    );

  applyProjectItemTransform(
    instance.mesh,
    item
  );

  return instance;
}

export function validateProjectStructure(
  project: DentalPosDesignProject
) {
  const errors:
    string[] = [];

  if (!project.name) {
    errors.push(
      "Projeto sem nome."
    );
  }

  if (
    !Array.isArray(
      project.teeth
    )
  ) {
    errors.push(
      "Lista de dentes inválida."
    );
  }

  if (
    Array.isArray(
      project.teeth
    )
  ) {
    project.teeth.forEach(
      (
        item,
        index
      ) => {
        if (
          !Number.isFinite(
            item.toothNumber
          )
        ) {
          errors.push(
            `Dente inválido na posição ${index}.`
          );
        }

        if (
          !Array.isArray(
            item.position
          ) ||
          item.position.length !==
            3
        ) {
          errors.push(
            `Posição inválida no dente ${item.toothNumber}.`
          );
        }

        if (
          !Array.isArray(
            item.rotation
          ) ||
          item.rotation.length !==
            3
        ) {
          errors.push(
            `Rotação inválida no dente ${item.toothNumber}.`
          );
        }

        if (
          !Array.isArray(
            item.scale
          ) ||
          item.scale.length !==
            3
        ) {
          errors.push(
            `Escala inválida no dente ${item.toothNumber}.`
          );
        }
      }
    );
  }

  return {
    valid:
      errors.length === 0,

    errors,
  };
}