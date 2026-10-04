import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./ui/App";
import { parseProject } from "./core/io";
import { AuthGate } from "./security/AuthGate";
import type { CadProject } from "./core/project";

// Modo incorporado (iframe): ?embed=1 — troca de mensagens com o sistema hospedeiro.
//   hospedeiro → módulo: { type: "dpcad:load", project }     módulo → hospedeiro: { type: "dpcad:ready" } | { type: "dpcad:change", project }
const qs = new URLSearchParams(location.search);
const embed = qs.get("embed") === "1";
// origem do hospedeiro: ?origin=https://app.exemplo.com (padrão: origem do referrer). Mensagens de outras origens são ignoradas.
const hostOrigin = qs.get("origin") ?? (document.referrer ? new URL(document.referrer).origin : location.origin);
let initial: CadProject | undefined;
const api: { current: { getProject: () => CadProject; setProject: (p: CadProject) => void } | null } = { current: null };
if (embed) {
  window.addEventListener("message", (e) => {
    if (e.origin !== hostOrigin) return;
    const d = e.data as { type?: string; project?: unknown } | null;
    if (d?.type === "dpcad:load" && d.project) { try { api.current?.setProject(typeof d.project === "string" ? parseProject(d.project) : (d.project as CadProject)); } catch { /* ignora */ } }
  });
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
   <AuthGate>
    <App initialProject={initial} persist={!embed} apiRef={api}
      onProjectChange={embed ? (p) => window.parent?.postMessage({ type: "dpcad:change", project: p }, hostOrigin) : undefined} />
   </AuthGate>
  </StrictMode>,
);
if (embed) window.parent?.postMessage({ type: "dpcad:ready" }, hostOrigin);
