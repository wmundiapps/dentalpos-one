import { Box, Button, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import EduResourcePage from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import OsDialog, { SLA_TONE } from "./OsDialog";
import { Async, type Field, FormDialog, Kanban, Light, SubNav, Tag, fmtDate, label, nameOf, useApi, useSpaces, useToast } from "./kit";

const PRIORIDADES = ["BAIXA", "MEDIA", "ALTA", "URGENTE"];
const TIPOS = ["CORRETIVA", "PREVENTIVA", "PREDITIVA", "MELHORIA"];
const COLS = [
  { key: "ABERTA", title: "Abertas", color: "#0288d1" },
  { key: "AGENDADA", title: "Agendadas", color: "#7b1fa2" },
  { key: "EM_EXECUCAO", title: "Em execução", color: "#ed6c02" },
  { key: "AGUARDANDO_PECA", title: "Aguardando peça", color: "#f9a825" },
  { key: "CONCLUIDA", title: "Concluídas", color: "#2e7d32" },
];
const NEXT: Record<string, string[]> = {
  ABERTA: ["AGENDADA", "EM_EXECUCAO"], AGENDADA: ["EM_EXECUCAO"], EM_EXECUCAO: ["AGUARDANDO_PECA", "CONCLUIDA"], AGUARDANDO_PECA: ["EM_EXECUCAO"], CONCLUIDA: [],
};
const NEXT_LABEL: Record<string, string> = { AGENDADA: "Agendar", EM_EXECUCAO: "Iniciar", AGUARDANDO_PECA: "Aguardar peça", CONCLUIDA: "Concluir" };

export default function ManutencaoTab() {
  const [sub, setSub] = useState("quadro");
  const [key, setKey] = useState(0);
  const [novaOs, setNovaOs] = useState(false);
  const [trans, setTrans] = useState<{ os: any; status: string } | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const spaces = useSpaces();
  const toast = useToast();
  const os = useApi<any>(`/infraestrutura/ordens-servico?pageSize=200&k=${key}`);
  const reload = () => { setKey((k) => k + 1); };

  const transFields = (): Field[] => {
    if (trans?.status === "AGENDADA") return [{ key: "agendadaPara", label: "Agendada para", type: "datetime", required: true }];
    if (trans?.status === "CONCLUIDA") return [{ key: "solucao", label: "Solução aplicada", type: "textarea", required: true }, { key: "custoMaoObra", label: "Custo de mão de obra (R$)", type: "number" }];
    return [];
  };
  function mover(row: any, status: string) {
    if (status === "AGENDADA" || status === "CONCLUIDA") { setTrans({ os: row, status }); return; }
    toast.run(() => eduApi.post(`/infraestrutura/ordens-servico/${row.id}/status`, { status }), "Status atualizado.", reload);
  }

  return (
    <Box>
      <SubNav value={sub} onChange={setSub} items={[{ key: "quadro", label: "Quadro de OS" }, { key: "planos", label: "Planos preventivos" }]} />
      {sub === "quadro" && (
        <>
          <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovaOs(true)}>Nova OS</Button>
          </Box>
          <Async state={os}>
            {(d) => {
              const rows: any[] = (d.items || []).filter((o: any) => o.status !== "CANCELADA");
              return (
                <Kanban columns={COLS} rows={rows} groupBy={(o) => o.status}
                  render={(o) => (
                    <Box sx={{ display: "grid", gap: 0.75 }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                        <Typography variant="caption" sx={{ fontWeight: 800 }}>{o.numero}</Typography>
                        <Tag text={label(o.prioridade)} tone={o.prioridade === "URGENTE" ? "error" : o.prioridade === "ALTA" ? "warning" : "default"} />
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{o.titulo}</Typography>
                      <Typography variant="caption" color="text.secondary">{label(o.tipo)} · {nameOf(spaces, o.spaceId)}</Typography>
                      <Light tone={SLA_TONE[o.sla] || "default"} text={`${label(o.sla)} · ${fmtDate(o.prazoSla)}`} />
                      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                        <Button size="small" onClick={() => setDetail(o.id)}>Abrir</Button>
                        {(NEXT[o.status] || []).map((n) => <Button key={n} size="small" variant="outlined" onClick={() => mover(o, n)}>{NEXT_LABEL[n]}</Button>)}
                        {!["CONCLUIDA", "CANCELADA"].includes(o.status) && <Button size="small" color="error" onClick={() => toast.run(() => eduApi.post(`/infraestrutura/ordens-servico/${o.id}/status`, { status: "CANCELADA" }), "OS cancelada.", reload, `Cancelar a OS ${o.numero}?`)}>Cancelar</Button>}
                      </Box>
                    </Box>
                  )} />
              );
            }}
          </Async>
        </>
      )}
      {sub === "planos" && (
        <EduResourcePage
          title="Planos de manutenção preventiva" base="/infraestrutura" resource="/planos-preventivos"
          description="Cada plano gera ordens de serviço automaticamente conforme a periodicidade."
          filters={[{ key: "ativo", label: "Ativo", options: ["true", "false"] }]}
          columns={[
            { key: "titulo", label: "Plano" }, { key: "periodicidadeDias", label: "A cada (dias)" },
            { key: "proximaExecucao", label: "Próxima execução", render: (r) => fmtDate(r.proximaExecucao) },
            { key: "prioridade", label: "Prioridade", render: (r) => <Tag text={label(r.prioridade)} /> }, { key: "ativo", label: "Ativo", render: (r) => (r.ativo ? "Sim" : "Não") },
          ]}
          fields={[
            { key: "titulo", label: "Título", required: true }, { key: "descricao", label: "Descrição", type: "textarea" },
            { key: "bemId", label: "ID do bem (opcional)", helper: "Informe bem, espaço ou categoria" }, { key: "spaceId", label: "Espaço", type: "select", options: spaces },
            { key: "categoriaId", label: "ID da categoria de bens (opcional)" },
            { key: "periodicidadeDias", label: "Periodicidade (dias)", type: "number", required: true }, { key: "antecedenciaDias", label: "Antecedência (dias)", type: "number" },
            { key: "proximaExecucao", label: "Próxima execução", type: "date", required: true }, { key: "prioridade", label: "Prioridade", type: "select", options: PRIORIDADES },
            { key: "ativo", label: "Ativo", type: "bool" },
          ]}
          rowActions={[{ label: "Gerar OS agora", path: "/planos-preventivos/:id/gerar-agora", confirm: "Gerar a ordem de serviço deste plano agora?", hidden: (r) => !r.ativo }]}
        />
      )}
      <FormDialog open={novaOs} title="Nova ordem de serviço" onClose={() => setNovaOs(false)}
        fields={[
          { key: "titulo", label: "Título", required: true, full: true }, { key: "descricao", label: "Descrição", type: "textarea" },
          { key: "tipo", label: "Tipo", type: "select", options: TIPOS, def: "CORRETIVA" }, { key: "prioridade", label: "Prioridade", type: "select", options: PRIORIDADES, def: "MEDIA" },
          { key: "spaceId", label: "Espaço", type: "select", options: spaces }, { key: "bemId", label: "ID do bem (opcional)" },
          { key: "agendadaPara", label: "Agendar para", type: "datetime" }, { key: "bemParado", label: "Bem fica parado durante a OS", type: "bool" },
        ]}
        onSubmit={async (b) => { await eduApi.post("/infraestrutura/ordens-servico", b); toast.ok("OS aberta."); reload(); }} />
      <FormDialog open={!!trans} title={trans ? `${NEXT_LABEL[trans.status]} — ${trans.os.numero}` : ""} fields={transFields()} onClose={() => setTrans(null)}
        onSubmit={async (b) => { await eduApi.post(`/infraestrutura/ordens-servico/${trans!.os.id}/status`, { status: trans!.status, ...b }); toast.ok("Status atualizado."); reload(); }} />
      {detail && <OsDialog id={detail} onClose={() => setDetail(null)} onChanged={reload} />}
      {toast.node}
    </Box>
  );
}
