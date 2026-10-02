import {
  type DentalPosDesignProject,
  updateProjectFromScene,
} from "./toothProject";

import {
  type ToothDesignSession,
} from "./toothDesignSession";

export interface ToothProjectAutosaveOptions {
  interval?: number;

  storageKey?: string;

  enabled?: boolean;
}

export interface AutosaveStatus {
  enabled: boolean;

  running: boolean;

  lastSavedAt:
    | string
    | null;

  storageKey: string;
}

export class ToothProjectAutosave {
  private session:
    ToothDesignSession;

  private project:
    DentalPosDesignProject;

  private interval: number;

  private storageKey: string;

  private enabled: boolean;

  private timer:
    | ReturnType<
        typeof setInterval
      >
    | null = null;

  private lastSavedAt:
    | string
    | null = null;

  constructor(
    session: ToothDesignSession,
    project: DentalPosDesignProject,
    options: ToothProjectAutosaveOptions = {}
  ) {
    this.session =
      session;

    this.project =
      project;

    this.interval =
      Math.max(
        5000,
        options.interval ??
          30000
      );

    this.storageKey =
      options.storageKey ??
      "dentalpos-design-autosave";

    this.enabled =
      options.enabled ??
      true;
  }

  setProject(
    project: DentalPosDesignProject
  ) {
    this.project =
      project;
  }

  getProject() {
    return this.project;
  }

  start() {
    if (
      !this.enabled ||
      this.timer
    ) {
      return false;
    }

    this.timer =
      setInterval(
        () => {
          this.save();
        },
        this.interval
      );

    return true;
  }

  stop() {
    if (!this.timer) {
      return false;
    }

    clearInterval(
      this.timer
    );

    this.timer = null;

    return true;
  }

  save() {
    if (!this.enabled) {
      return null;
    }

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

    const serialized =
      JSON.stringify(
        this.project
      );

    try {
      localStorage.setItem(
        this.storageKey,
        serialized
      );

      this.lastSavedAt =
        new Date()
          .toISOString();

      return this.project;
    } catch {
      return null;
    }
  }

  load():
    DentalPosDesignProject
    | null {
    try {
      const content =
        localStorage.getItem(
          this.storageKey
        );

      if (!content) {
        return null;
      }

      const parsed =
        JSON.parse(
          content
        ) as DentalPosDesignProject;

      if (
        !parsed ||
        typeof parsed !==
          "object" ||
        !Array.isArray(
          parsed.teeth
        )
      ) {
        return null;
      }

      this.project =
        parsed;

      return parsed;
    } catch {
      return null;
    }
  }

  hasAutosave() {
    try {
      return (
        localStorage.getItem(
          this.storageKey
        ) !== null
      );
    } catch {
      return false;
    }
  }

  clear() {
    try {
      localStorage.removeItem(
        this.storageKey
      );

      this.lastSavedAt =
        null;

      return true;
    } catch {
      return false;
    }
  }

  setEnabled(
    enabled: boolean
  ) {
    this.enabled =
      enabled;

    if (!enabled) {
      this.stop();
    }

    return this.enabled;
  }

  isEnabled() {
    return this.enabled;
  }

  getStatus():
    AutosaveStatus {
    return {
      enabled:
        this.enabled,

      running:
        this.timer !== null,

      lastSavedAt:
        this.lastSavedAt,

      storageKey:
        this.storageKey,
    };
  }

  dispose() {
    this.stop();
  }
}

export function createToothProjectAutosave(
  session: ToothDesignSession,
  project: DentalPosDesignProject,
  options: ToothProjectAutosaveOptions = {}
) {
  return new ToothProjectAutosave(
    session,
    project,
    options
  );
}