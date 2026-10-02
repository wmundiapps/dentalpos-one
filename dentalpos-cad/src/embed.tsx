// Integração: monte o DentalPos CAD dentro de qualquer página/sistema (React ou não).
//   import { mountDentalPosCad } from "@dentalpos/cad/embed";
//   const cad = mountDentalPosCad(document.getElementById("cad")!, { project, onChange: (p) => salvar(p) });
//   cad.getProject(); cad.setProject(outroProjeto); cad.unmount();
import { createRoot } from "react-dom/client";
import { createRef } from "react";
import App from "./ui/App";
import type { CadProject } from "./core/project";

export interface MountOptions { project?: CadProject; onChange?: (p: CadProject) => void; persist?: boolean }
export function mountDentalPosCad(el: HTMLElement, opts: MountOptions = {}) {
  const root = createRoot(el);
  const api = createRef<{ getProject: () => CadProject; setProject: (p: CadProject) => void } | null>() as React.MutableRefObject<{ getProject: () => CadProject; setProject: (p: CadProject) => void } | null>;
  api.current = null;
  root.render(<App initialProject={opts.project} onProjectChange={opts.onChange} persist={opts.persist ?? false} apiRef={api} />);
  return { getProject: () => api.current?.getProject(), setProject: (p: CadProject) => api.current?.setProject(p), unmount: () => root.unmount() };
}
export { default as DentalPosCadApp } from "./ui/App";
export type { CadProject };
