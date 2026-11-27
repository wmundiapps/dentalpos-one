import { Box, Button, Pagination, TextField } from "@mui/material";
import { useState } from "react";
import { Kpi, KpiRow, LoadBox, Pick, Section, Status, fmtDateTime, label, useApi, useToast } from "../desempenho/kit";
import { CANAIS, ResponsiveTable, baixarCsv, qstr } from "./common";

const RESULTADOS = ["ENFILEIRADO", "ENVIADO", "ENTREGUE", "LIDO", "FALHA", "SIMULADO", "BLOQUEADO_OPTOUT", "BLOQUEADO_JANELA", "BLOQUEADO_LIMITE", "BLOQUEADO_NAO_CONTATAR", "SEM_DESTINO", "ATENDEU", "NAO_ATENDEU", "PROMESSA", "ACORDO", "REGISTRADO"].map((v) => ({ value: v, label: label(v) }));

export default function HistoricoTab() {
  const [f, setF] = useState<any>({ page: 1 });
  const q = qstr({ ...f, pageSize: 30 });
  const h = useApi<any>(`/cobranca/contatos${q}`);
  const { toast, node } = useToast();
  const set = (k: string) => (v: any) => setF({ ...f, [k]: v, page: 1 });
  const d = h.data;
  return (
    <Section title="Histórico de contatos e tentativas" actions={<Button variant="outlined" onClick={() => baixarCsv(`/cobranca/contatos${qstr({ ...f, formato: "csv" })}`, "historico-contatos.csv").catch((e) => toast({ type: "error", text: e.message }))}>Exportar CSV</Button>}>
      {node}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
        <TextField size="small" type="date" label="De" value={f.de ?? ""} onChange={(e) => set("de")(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" type="date" label="Até" value={f.ate ?? ""} onChange={(e) => set("ate")(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <Pick label="Canal" value={f.canal ?? ""} onChange={set("canal")} options={[...CANAIS, { value: "TELEFONE", label: "Telefone" }, { value: "PRESENCIAL", label: "Presencial" }]} all="Todos" minWidth={140} />
        <Pick label="Resultado" value={f.resultado ?? ""} onChange={set("resultado")} options={RESULTADOS} all="Todos" minWidth={200} />
        <Pick label="Origem" value={f.automatico ?? ""} onChange={set("automatico")} options={[{ value: "true", label: "Automático (régua)" }, { value: "false", label: "Manual" }]} all="Todas" minWidth={160} />
      </Box>
      <LoadBox loading={h.loading && !d} error={h.error} onRetry={h.reload}>
        {d && (
          <>
            <KpiRow>{Object.entries(d.resumo).slice(0, 6).map(([k, v]) => <Kpi key={k} title={label(k)} value={v as number} />)}</KpiRow>
            <ResponsiveTable rows={d.items} rowKey={(c: any) => c.id} empty="Nenhum contato no período."
              cols={[
                { key: "aluno", label: "Aluno", render: (c: any) => <><b>{c.aluno}</b><small style={{ display: "block", opacity: 0.7 }}>{c.ra}</small></> },
                { key: "createdAt", label: "Quando", render: (c: any) => fmtDateTime(c.createdAt) },
                { key: "tipo", label: "Tipo / canal", render: (c: any) => `${label(c.tipo)} · ${label(c.canal)}${c.automatico ? " (régua)" : ""}` },
                { key: "resultado", label: "Resultado", render: (c: any) => <Status value={c.resultado} /> },
                { key: "destino", label: "Destino", hideMobile: true, render: (c: any) => c.destino ?? "—" },
                { key: "baseLegal", label: "Base legal", hideMobile: true, render: (c: any) => (c.baseLegal ? label(c.baseLegal) : "—") },
                { key: "mensagem", label: "Conteúdo / motivo", minWidth: 260, render: (c: any) => c.erro || c.observacao || c.mensagem || "—" },
              ]} />
            <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}><Pagination count={Math.max(1, Math.ceil(d.total / 30))} page={f.page} onChange={(_, p) => setF({ ...f, page: p })} /></Box>
          </>
        )}
      </LoadBox>
    </Section>
  );
}
