import { Box, MenuItem, TextField, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import { Status, useApi } from "../../regulatorio/ui";
import PainelRemoto from "./Painel";

/** Painéis executivos: financeiro, infraestrutura, implantação, investimentos, CIPA, provas, vestibular... */
export default function PaineisView({ ids, titulo }: { ids?: string[]; titulo?: string }) {
  const { data, loading, error, reload } = useApi<Array<{ id: string; titulo: string; grupo: string }>>("/reitoria/paineis");
  const lista = useMemo(() => (data || []).filter((p) => !ids || ids.includes(p.id)), [data, ids]);
  const [sel, setSel] = useState<string>("");
  const [meses, setMeses] = useState(12);
  const atual = sel || lista[0]?.id || "";
  const comMeses = ["financeiro", "infraestrutura", "investimentos"].includes(atual);
  return (
    <Box>
      <Status loading={loading && !data} error={error} onRetry={reload} empty={!lista.length} emptyText="Nenhum painel disponível.">
        <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
          <TextField select size="small" label={titulo || "Painel"} value={atual} onChange={(e) => setSel(e.target.value)} sx={{ minWidth: { xs: "100%", sm: 320 } }}>
            {lista.map((p) => <MenuItem key={p.id} value={p.id}>{p.grupo} · {p.titulo}</MenuItem>)}
          </TextField>
          {comMeses && (
            <TextField select size="small" label="Período" value={meses} onChange={(e) => setMeses(Number(e.target.value))} sx={{ minWidth: 140 }}>
              {[3, 6, 12, 24].map((m) => <MenuItem key={m} value={m}>Últimos {m} meses</MenuItem>)}
            </TextField>
          )}
        </Box>
        {atual ? <PainelRemoto key={`${atual}-${meses}`} id={atual} extra={comMeses ? `?meses=${meses}` : ""} /> : <Typography color="text.secondary">Selecione um painel.</Typography>}
      </Status>
    </Box>
  );
}
