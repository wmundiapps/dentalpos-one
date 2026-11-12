import { Box, Button, Checkbox, FormControlLabel, Pagination, TextField } from "@mui/material";
import { useState } from "react";
import CasoDetalhe from "./CasoDetalhe";
import NovoCasoDialog from "./NovoCasoDialog";
import { AD, DataList, GravidadeChip, LoadBox, ORIGENS, Pick, ResultadoChip, ROT_STATUS, Section, StatusChip, fmtDateTime, itemsOf, qstr, rotuloOrigem, slaTexto, useApi, label } from "./kit";

export default function FilaTab({ inicial, abrir, onAbrir }: { inicial?: Record<string, string>; abrir?: string | null; onAbrir: (id: string | null) => void }) {
  const [rev, setRev] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [origem, setOrigem] = useState(inicial?.novo ? "" : inicial?.origem || "");
  const [status, setStatus] = useState("");
  const [resultado, setResultado] = useState(inicial?.critico ? "CRITICO" : "");
  const [soFila, setSoFila] = useState(true);
  const [soBloq, setSoBloq] = useState(false);
  const [novo, setNovo] = useState(!!inicial?.novo);
  // atalhos das telas de financeiro/jurídico chegam com o formulário pré-preenchido pela URL (?novo=1&origem=...&refType=...)
  const preset = inicial?.novo ? { origem: inicial.origem, contexto: inicial.contexto, titulo: inicial.titulo, refType: inicial.refType, refId: inicial.refId, tipo: inicial.tipo } : undefined;
  const meta = useApi<any>(`${AD}/meta`);
  const url = `${AD}/casos?${qstr({ page, pageSize: 20, q, origem, status, resultado, fila: soFila && !status ? "true" : "", bloqueado: soBloq ? "true" : "" })}`;
  const l = useApi<any>(url, [rev]);
  const rows = itemsOf(l.data);
  const total = l.data?.total ?? 0;
  const origens = (meta.data?.origens || []).length ? ORIGENS.filter((o) => (meta.data.origens as string[]).includes(o.value)) : ORIGENS;
  return (
    <>
      <Section title="Fila de revisão humana" actions={<Button variant="contained" onClick={() => setNovo(true)}>Novo caso</Button>}>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2, alignItems: "center" }}>
          <TextField size="small" label="Buscar (código, título, titular)" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} sx={{ flex: "1 1 200px", minWidth: 0 }} />
          {origens.length > 1 && <Pick label="Setor" value={origem} onChange={(v) => { setOrigem(v); setPage(1); }} options={origens} all="Todos" minWidth={140} />}
          <Pick label="Resultado" value={resultado} onChange={(v) => { setResultado(v); setPage(1); }} all="Todos" minWidth={140} options={[{ value: "CRITICO", label: "Crítico" }, { value: "ATENCAO", label: "Atenção" }, { value: "OK", label: "Sem pendências" }]} />
          <Pick label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} all="Fila (abertos)" minWidth={170} options={Object.entries(ROT_STATUS).map(([value, lbl]) => ({ value, label: lbl }))} />
          <FormControlLabel control={<Checkbox checked={soBloq} onChange={(e) => { setSoBloq(e.target.checked); setPage(1); }} />} label="Só bloqueados" />
          <FormControlLabel control={<Checkbox checked={soFila} onChange={(e) => { setSoFila(e.target.checked); setPage(1); }} />} label="Só abertos" />
        </Box>
        <LoadBox loading={l.loading} error={l.error} empty={!rows.length} emptyText="Nenhum caso. Use “Novo caso” ou o botão “Analisar com o agente” nas telas de secretaria, financeiro e jurídico." onRetry={l.reload}>
          <DataList rows={rows} onRowClick={(r: any) => onAbrir(r.id)}
            columns={[
              { label: "Caso", primary: true, render: (r: any) => <Box sx={{ overflowWrap: "anywhere" }}><b>{r.codigo}</b> — {r.titulo}</Box> },
              { label: "Setor", render: (r: any) => rotuloOrigem(r.origem) },
              { label: "Contexto", hideOnMobile: true, render: (r: any) => label(r.contexto) },
              { label: "Resultado", render: (r: any) => <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", justifyContent: "flex-end" }}><ResultadoChip r={r.resultado} />{r.bloqueado && <GravidadeChip g="CRITICA" />}</Box> },
              { label: "Status", render: (r: any) => <StatusChip s={r.status} /> },
              { label: "Pendências", render: (r: any) => r.achadosAbertos },
              { label: "SLA", render: (r: any) => <span style={{ color: r.atrasado ? "#b91c1c" : undefined, fontWeight: r.atrasado ? 700 : undefined }}>{slaTexto(r)}</span> },
              { label: "Criado em", hideOnMobile: true, render: (r: any) => fmtDateTime(r.createdAt) },
            ]} />
          {total > 20 && <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}><Pagination count={Math.ceil(total / 20)} page={page} onChange={(_, p) => setPage(p)} /></Box>}
        </LoadBox>
      </Section>
      <NovoCasoDialog open={novo} preset={preset} onClose={() => setNovo(false)} onCreated={(id) => { setRev((x) => x + 1); onAbrir(id); }} />
      {abrir && <CasoDetalhe id={abrir} onClose={() => onAbrir(null)} onChanged={() => setRev((x) => x + 1)} />}
    </>
  );
}
