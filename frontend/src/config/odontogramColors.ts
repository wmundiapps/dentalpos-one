import { useEffect, useState } from "react";

// Cores do odontograma: claras para planejado / a fazer e escuras para concluído (escolhidas pelo usuário neste navegador).
export const PLANNED_PALETTE = [
  { name: "Rosa claro", value: "#f48fb1", text: "#ad1457" },
  { name: "Laranja claro", value: "#ffcc80", text: "#e65100" },
  { name: "Azul claro", value: "#90caf9", text: "#0d47a1" },
  { name: "Verde claro", value: "#a5d6a7", text: "#1b5e20" },
  { name: "Amarelo claro", value: "#fff59d", text: "#827717" },
  { name: "Roxo claro", value: "#ce93d8", text: "#6a1b9a" },
  { name: "Ciano claro", value: "#80deea", text: "#006064" },
];
export const DONE_PALETTE = [
  { name: "Preto", value: "#111111", text: "#111111" },
  { name: "Verde escuro", value: "#1b5e20", text: "#1b5e20" },
  { name: "Azul escuro", value: "#0d47a1", text: "#0d47a1" },
  { name: "Vinho", value: "#880e4f", text: "#880e4f" },
  { name: "Marrom", value: "#4e342e", text: "#4e342e" },
  { name: "Roxo escuro", value: "#4a148c", text: "#4a148c" },
  { name: "Grafite", value: "#37474f", text: "#37474f" },
];

export type OdontogramColors = { todo: string; todoText: string; done: string };
const KEY = "completodonto.odontogramColors";
const EVENT = "odontogram-colors-changed";
// Padrão: laranja claro para planejado e verde escuro para concluído (claras = planejado, escuras = realizado).
export const DEFAULT_PLANNED = PLANNED_PALETTE[1];
export const DEFAULT_DONE = DONE_PALETTE[1];
const DEFAULTS: OdontogramColors = { todo: DEFAULT_PLANNED.value, todoText: DEFAULT_PLANNED.text, done: DEFAULT_DONE.value };

export function loadOdontogramColors(): OdontogramColors {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null") as { todo?: string; done?: string } | null;
    const planned = PLANNED_PALETTE.find((c) => c.value === raw?.todo) || DEFAULT_PLANNED;
    const done = DONE_PALETTE.find((c) => c.value === raw?.done) || DEFAULT_DONE;
    return { todo: planned.value, todoText: planned.text, done: done.value };
  } catch {
    return DEFAULTS;
  }
}

export function saveOdontogramColors(todo: string, done: string) {
  if (todo === done) return false; // planejado e concluído nunca podem ter a mesma cor
  try { localStorage.setItem(KEY, JSON.stringify({ todo, done })); } catch { /* sem armazenamento */ }
  window.dispatchEvent(new Event(EVENT));
  return true;
}

export function useOdontogramColors(): OdontogramColors {
  const [colors, setColors] = useState(loadOdontogramColors);
  useEffect(() => {
    const update = () => setColors(loadOdontogramColors());
    window.addEventListener(EVENT, update);
    return () => window.removeEventListener(EVENT, update);
  }, []);
  return colors;
}
