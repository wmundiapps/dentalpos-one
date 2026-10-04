import { Alert, Box, Button, Chip, Paper, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { eduApi } from "../../services/EduApi";
import FlowDiagram, { type DDiagrama } from "./FlowDiagram";
import { Loadable, papelLabel, useAsync } from "./common";
import { useState } from "react";

/** Fluxograma do template selecionado (GET /jornadas/templates/:id/diagrama) + modo texto Mermaid. */
export default function DiagramaTab({ templateId }: { templateId: string }) {
  const [dir, setDir] = useState<"LR" | "TB">("LR");
  const { data, loading, error, reload } = useAsync<(DDiagrama & { template?: any }) | null>(
    async () => (templateId ? await eduApi.get(`/jornadas/templates/${templateId}/diagrama?direcao=${dir}`) : null), [templateId, dir]);
  const [mermaid, setMermaid] = useState<string | null>(null);
  const [merr, setMerr] = useState<string | null>(null);

  async function verMermaid() {
    try { const r = await eduApi.get(`/jornadas/templates/${templateId}/mermaid?formato=json`); setMermaid(r.mermaid); setMerr(null); } catch (e: any) { setMerr(e.message); }
  }
  if (!templateId) return <Alert severity="info">Selecione uma jornada para visualizar o fluxograma.</Alert>;
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", mb: 2 }}>
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>{data?.template?.nome || "Fluxograma"}</Typography>
          <Typography variant="body2" color="text.secondary">Raias por papel, nós coloridos por tipo. Linhas tracejadas = condicional; vermelhas = retorno. Ctrl + roda do mouse amplia.</Typography>
        </Box>
        <ToggleButtonGroup size="small" exclusive value={dir} onChange={(_, v) => v && setDir(v)}>
          <ToggleButton value="LR">Horizontal</ToggleButton><ToggleButton value="TB">Vertical</ToggleButton>
        </ToggleButtonGroup>
        <Button size="small" onClick={verMermaid}>Ver Mermaid</Button>
        <Button size="small" onClick={reload}>Atualizar</Button>
      </Box>
      <Loadable loading={loading} error={error}>
        {data && data.nos?.length ? (
          <>
            <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 0.5 }}>
              <Chip size="small" label={`${data.nos.length} etapas`} />
              {(data.raias || []).map((r) => <Chip key={r.papel} size="small" variant="outlined" label={`${papelLabel(r.papel)}: ${r.nos}`} />)}
            </Stack>
            <FlowDiagram diagrama={data} height={dir === "TB" ? 2600 : 760} vertical={dir === "TB"} />
          </>
        ) : <Alert severity="info">Esta jornada não possui etapas.</Alert>}
      </Loadable>
      {merr ? <Alert severity="warning" sx={{ mt: 1 }}>{merr}</Alert> : null}
      {mermaid ? (
        <Box component="pre" sx={{ mt: 2, p: 1.5, borderRadius: 2, bgcolor: "action.hover", overflow: "auto", fontSize: 12, maxHeight: 280 }}>{mermaid}</Box>
      ) : null}
    </Paper>
  );
}
