import {
  runDentalPosDesignDiagnostics,
} from "./DentalPosDesignDiagnostics";

export interface DentalPosDesignReadyResult {
  ready: boolean;

  timestamp: string;

  messages: string[];
}

export function isDentalPosDesignReady():
  DentalPosDesignReadyResult {
  const diagnostics =
    runDentalPosDesignDiagnostics();

  const ready =
    diagnostics.health.ok &&
    diagnostics.webGLAvailable &&
    diagnostics.localStorageAvailable;

  const messages =
    ready
      ? [
          "DentalPos Design pronto para iniciar.",
        ]
      : diagnostics.messages;

  return {
    ready,

    timestamp:
      new Date().toISOString(),

    messages,
  };
}