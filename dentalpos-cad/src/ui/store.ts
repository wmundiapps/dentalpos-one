import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { onSculptReady } from "../core/sculptCache";
import { createProject, evaluate, type CadProject, type Evaluated } from "../core/project";
import { analyze, type Report } from "../core/rules";
import type { ToothAdjust } from "../core/arch";
import { SECURITY } from "../security/config";
import { getAutosave, putAutosave } from "../security/auth";

export interface HistoryState { past: CadProject[]; present: CadProject; future: CadProject[] }
type Action =
  | { type: "set"; fn: (p: CadProject) => CadProject; coalesce?: string }
  | { type: "replace"; project: CadProject }
  | { type: "undo" } | { type: "redo" };

let lastKey = "", lastTime = 0;
let persist = true;
function reducer(s: HistoryState, a: Action): HistoryState {
  switch (a.type) {
    case "set": {
      const now = Date.now();
      const merge = a.coalesce && a.coalesce === lastKey && now - lastTime < 800;
      lastKey = a.coalesce ?? ""; lastTime = now;
      const next = a.fn(s.present);
      if (persist) try { const j = JSON.stringify({ ...next, photo: undefined }); if (SECURITY.requireAuth) void putAutosave(j); else localStorage.setItem(AUTOSAVE, j); } catch { /* cota */ }
      return { past: merge ? s.past : [...s.past.slice(-59), s.present], present: next, future: [] };
    }
    case "replace": return { past: [], present: a.project, future: [] };
    case "undo": return s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s;
    case "redo": return s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s;
  }
}

const AUTOSAVE = "dentalpos-cad:autosave";
function load(): CadProject {
  try { const j = SECURITY.requireAuth ? getAutosave() : localStorage.getItem(AUTOSAVE); if (j) { const p = JSON.parse(j) as CadProject; if (p.version === 1) return { ...createProject(), ...p, smile: { ...createProject().smile, ...p.smile }, implants: p.implants ?? [] }; } } catch { /* ignora */ }
  return createProject({}, "Caso demonstração");
}

export function useCadStore(initial?: CadProject, pers = true) {
  persist = pers;
  const [h, dispatch] = useReducer(reducer, undefined, () => ({ past: [], present: initial ?? load(), future: [] }) as HistoryState);
  const project = h.present;
  const [libVer, setLibVer] = useState(0);
  useEffect(() => onSculptReady(() => setLibVer((v) => v + 1)), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ev: Evaluated = useMemo(() => evaluate(project), [project, libVer]);
  const report: Report = useMemo(() => analyze(project, ev), [project, ev]);
  const set = useCallback((fn: (p: CadProject) => CadProject, coalesce?: string) => {
    dispatch({ type: "set", fn, coalesce });
  }, []);
  const adjust = useCallback((fdi: number, patch: ToothAdjust, coalesce = `adj-${fdi}`) => set((p) => ({ ...p, adjust: { ...p.adjust, [fdi]: { ...(p.adjust[fdi] ?? {}), ...patch } } }), coalesce), [set]);
  return {
    project, ev, report, set, adjust,
    replace: (p: CadProject) => dispatch({ type: "replace", project: p }),
    undo: () => dispatch({ type: "undo" }), redo: () => dispatch({ type: "redo" }),
    canUndo: h.past.length > 0, canRedo: h.future.length > 0,
  };
}
export type Store = ReturnType<typeof useCadStore>;
