/**
 * Feedback visual global de ações: toda gravação (POST/PUT/PATCH/DELETE) na API mostra a barra de progresso no topo
 * e, ao terminar, um aviso discreto de sucesso ou de falha de conexão/servidor. Erros 4xx (validação) continuam sendo
 * explicados pela própria tela. Instalado uma única vez em main.tsx.
 */
export type ActionToast = { id: number; severity: "success" | "error"; message: string };
type State = { pending: number; toast: ActionToast | null };

let state: State = { pending: 0, toast: null };
const listeners = new Set<() => void>();
const emit = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
export const getActionState = () => state;
export const subscribeActions = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const dismissActionToast = () => emit({ toast: null });

let seq = 0;
const SKIP = /\/(auth|ai|ceo-ia|chat|revah-chat|track|heartbeat|feedback|platform-feedback|dpd|evaluations?|preview|simulat\w*|calcul\w*|search|query|export|verify|validate|lookup)(\/|\?|$)/i;
let installed = false;

export function installActionFeedback() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const api = String(import.meta.env.VITE_API_URL || "http://localhost:3000/api");
  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method || (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET") || "GET").toUpperCase();
    const track = method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && url.startsWith(api) && !SKIP.test(url.slice(api.length));
    if (!track) return original(input, init);

    emit({ pending: state.pending + 1 });
    try {
      const res = await original(input, init);
      if (res.ok) emit({ toast: { id: ++seq, severity: "success", message: method === "DELETE" ? "Removido com sucesso." : method === "POST" ? "Ação concluída com sucesso." : "Alterações salvas com sucesso." } });
      else if (res.status >= 500) emit({ toast: { id: ++seq, severity: "error", message: "O servidor não conseguiu concluir a ação. Tente novamente." } });
      return res;
    } catch (e) {
      emit({ toast: { id: ++seq, severity: "error", message: "Sem conexão com o servidor. Verifique a internet e tente novamente." } });
      throw e;
    } finally {
      emit({ pending: Math.max(0, state.pending - 1) });
    }
  };
}
