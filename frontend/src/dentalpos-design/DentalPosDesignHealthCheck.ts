import {
  DENTALPOS_DESIGN_CONFIG,
} from "./DentalPosDesignConfig";

import {
  getDentalPosDesignInstance,
  isDentalPosDesignInitialized,
} from "./DentalPosDesignBootstrap";

export interface DentalPosDesignHealthStatus {
  ok: boolean;

  initialized: boolean;

  sceneAvailable: boolean;

  sessionAvailable: boolean;

  projectManagerAvailable: boolean;

  autosaveEnabled: boolean;

  productName: string;

  version: string;

  issues: string[];
}

export function checkDentalPosDesignHealth():
  DentalPosDesignHealthStatus {
  const issues: string[] = [];

  const initialized =
    isDentalPosDesignInitialized();

  const instance =
    getDentalPosDesignInstance();

  const sceneAvailable =
    Boolean(
      instance?.getScene()
    );

  const sessionAvailable =
    Boolean(
      instance?.getSession()
    );

  const projectManagerAvailable =
    Boolean(
      instance?.getProjectManager()
    );

  if (!initialized) {
    issues.push(
      "DentalPos Design ainda não foi inicializado."
    );
  }

  if (
    initialized &&
    !sceneAvailable
  ) {
    issues.push(
      "Cena 3D não disponível."
    );
  }

  if (
    initialized &&
    !sessionAvailable
  ) {
    issues.push(
      "Sessão de design não disponível."
    );
  }

  if (
    initialized &&
    !projectManagerAvailable
  ) {
    issues.push(
      "Gerenciador de projeto não disponível."
    );
  }

  return {
    ok:
      initialized &&
      sceneAvailable &&
      sessionAvailable &&
      projectManagerAvailable &&
      issues.length === 0,

    initialized,

    sceneAvailable,

    sessionAvailable,

    projectManagerAvailable,

    autosaveEnabled:
      DENTALPOS_DESIGN_CONFIG
        .autosave
        .enabled,

    productName:
      DENTALPOS_DESIGN_CONFIG
        .productName,

    version:
      DENTALPOS_DESIGN_CONFIG
        .version,

    issues,
  };
}