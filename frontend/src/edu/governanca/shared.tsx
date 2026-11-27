import { useEffect, useState } from "react";
import { eduApi } from "../../services/EduApi";

export interface Opt { value: string; label: string }

/** Carrega uma lista (array ou {items}) e devolve opções {value,label} para campos select. Tolera erro. */
export function useOptions(path: string, labelOf: (r: any) => string): Opt[] {
  const [opts, setOpts] = useState<Opt[]>([]);
  useEffect(() => {
    let alive = true;
    eduApi.get(path).then((r: any) => {
      const items = Array.isArray(r) ? r : r?.items || [];
      if (alive) setOpts(items.map((x: any) => ({ value: x.id, label: labelOf(x) })));
    }).catch(() => { if (alive) setOpts([]); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  return opts;
}

export const usePrograms = () => useOptions("/academico/programs", (p) => p.nome);

export const STATUS_ACAO = ["PLANEJADA", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"];
export const TITULACOES = ["GRADUADO", "ESPECIALISTA", "MESTRE", "DOUTOR"];
export const SEGMENTOS = ["DOCENTE", "DISCENTE", "TECNICO_ADMINISTRATIVO", "SOCIEDADE_CIVIL"];
export const moeda = (v: any) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const toArr = (r: any): any[] => (Array.isArray(r) ? r : r?.items || []);
