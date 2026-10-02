import { Autocomplete, TextField } from "@mui/material";
import { useEffect, useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import { itemsOf } from "../infraestrutura/kit";

interface Props { label: string; value: any | null; onChange: (v: any | null) => void; size?: "small" | "medium"; required?: boolean }

function useRemote(path: string, input: string) {
  const [opts, setOpts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let on = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try { const r = await eduApi.get(`${path}${qsOf({ q: input, pageSize: 15 })}`); if (on) setOpts(itemsOf(r)); }
      catch { if (on) setOpts([]); }
      finally { if (on) setLoading(false); }
    }, 300);
    return () => { on = false; clearTimeout(t); };
  }, [path, input]);
  return { opts, loading };
}

export function LeitorPicker({ label, value, onChange, size = "small", required }: Props) {
  const [input, setInput] = useState("");
  const { opts, loading } = useRemote("/biblioteca/leitores", input);
  return (
    <Autocomplete size={size} options={opts} loading={loading} value={value} filterOptions={(x) => x} isOptionEqualToValue={(a, b) => a.id === b.id}
      getOptionLabel={(o) => `${o.nome}${o.documento ? ` (${o.documento})` : ""} — ${String(o.perfil || "").toLowerCase()}`}
      onChange={(_, v) => onChange(v)} onInputChange={(_, v) => setInput(v)} noOptionsText="Digite para buscar leitores" loadingText="Buscando…"
      renderInput={(p) => <TextField {...p} label={label} required={required} />} />
  );
}

export function ObraPicker({ label, value, onChange, size = "small", required }: Props) {
  const [input, setInput] = useState("");
  const { opts, loading } = useRemote("/biblioteca/obras", input);
  return (
    <Autocomplete size={size} options={opts} loading={loading} value={value} filterOptions={(x) => x} isOptionEqualToValue={(a, b) => a.id === b.id}
      getOptionLabel={(o) => `${o.titulo}${o.autoresTexto ? ` — ${o.autoresTexto}` : ""}`}
      onChange={(_, v) => onChange(v)} onInputChange={(_, v) => setInput(v)} noOptionsText="Digite para buscar obras" loadingText="Buscando…"
      renderInput={(p) => <TextField {...p} label={label} required={required} />} />
  );
}
