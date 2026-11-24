import { useEffect } from "react";

/**
 * Deterrente leve contra copiar a tela: bloqueia o menu de clique direito e Ctrl+C/Ctrl+S/Ctrl+P fora de
 * campos de texto. É só um obstáculo a mais (como em qualquer site comercial) — não impede print/captura
 * nem alguém com conhecimento técnico; a rastreabilidade real vem da marca d'água (ScreenWatermark).
 */
export default function CopyDeterrent() {
  useEffect(() => {
    const ehCampoDeTexto = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    };

    const onContextMenu = (e: MouseEvent) => { if (!ehCampoDeTexto(e.target)) e.preventDefault(); };
    const onKeyDown = (e: KeyboardEvent) => {
      if (ehCampoDeTexto(e.target)) return;
      const tecla = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ["s", "p"].includes(tecla)) e.preventDefault();
    };

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return null;
}
