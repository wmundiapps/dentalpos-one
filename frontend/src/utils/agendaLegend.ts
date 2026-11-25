import { useEffect, useState } from "react";

// Cores e nomes dos dentistas da agenda. A agenda publica a lista; o menu lateral mostra a legenda (a tela fica só com as cores).
export type AgendaLegendItem = { name: string; color: string };
const EVENT = "dentalpos:agenda-legend";
let current: AgendaLegendItem[] = [];

export function setAgendaLegend(list: AgendaLegendItem[]) {
  if (JSON.stringify(list) === JSON.stringify(current)) return;
  current = list;
  window.dispatchEvent(new Event(EVENT));
}

export function useAgendaLegend() {
  const [list, setList] = useState(current);
  useEffect(() => { const on = () => setList(current); window.addEventListener(EVENT, on); return () => window.removeEventListener(EVENT, on); }, []);
  return list;
}
