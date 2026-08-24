import {
  checkDentalPosDesignHealth,
  type DentalPosDesignHealthStatus,
} from "./DentalPosDesignHealthCheck";

export interface DentalPosDesignDiagnosticReport {
  timestamp: string;

  health:
    DentalPosDesignHealthStatus;

  browser: string;

  online: boolean;

  localStorageAvailable: boolean;

  webGLAvailable: boolean;

  messages: string[];
}

export function runDentalPosDesignDiagnostics():
  DentalPosDesignDiagnosticReport {
  const health =
    checkDentalPosDesignHealth();

  const messages:
    string[] = [];

  const localStorageAvailable =
    checkLocalStorage();

  const webGLAvailable =
    checkWebGL();

  const online =
    typeof navigator !==
      "undefined"
      ? navigator.onLine
      : true;

  const browser =
    typeof navigator !==
      "undefined"
      ? navigator.userAgent
      : "unknown";

  if (!health.ok) {
    messages.push(
      ...health.issues
    );
  }

  if (
    !localStorageAvailable
  ) {
    messages.push(
      "LocalStorage não disponível."
    );
  }

  if (!webGLAvailable) {
    messages.push(
      "WebGL não disponível neste dispositivo ou navegador."
    );
  }

  if (!online) {
    messages.push(
      "Dispositivo sem conexão com a internet."
    );
  }

  if (
    messages.length === 0
  ) {
    messages.push(
      "DentalPos Design operacional."
    );
  }

  return {
    timestamp:
      new Date()
        .toISOString(),

    health,

    browser,

    online,

    localStorageAvailable,

    webGLAvailable,

    messages,
  };
}

function checkLocalStorage() {
  if (
    typeof window ===
    "undefined"
  ) {
    return false;
  }

  try {
    const key =
      "__dentalpos_test__";

    window.localStorage.setItem(
      key,
      "1"
    );

    window.localStorage.removeItem(
      key
    );

    return true;
  } catch {
    return false;
  }
}

function checkWebGL() {
  if (
    typeof document ===
    "undefined"
  ) {
    return false;
  }

  try {
    const canvas =
      document.createElement(
        "canvas"
      );

    return Boolean(
      canvas.getContext(
        "webgl2"
      ) ||
        canvas.getContext(
          "webgl"
        )
    );
  } catch {
    return false;
  }
}