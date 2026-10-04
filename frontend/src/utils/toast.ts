// Aviso rápido global: toast.success("Salvo") / toast.error("Falhou"). Mostrado pelo ToastHost no Layout.
export type ToastKind = "success" | "error" | "info";
export const TOAST_EVENT = "dentalpos:toast";
export interface ToastDetail { kind: ToastKind; message: string }

const send = (kind: ToastKind, message: string) => {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { kind, message } }));
};

export const toast = {
  success: (message: string) => send("success", message),
  error: (message: string) => send("error", message),
  info: (message: string) => send("info", message),
};

export const errorMessage = (e: unknown, fallback = "Não foi possível concluir. Tente de novo.") => (e instanceof Error && e.message ? e.message : fallback);
