import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { StatusChip } from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import { Async, type Field, FormDialog, Kanban, Light, ProgressBar, Stat, StatGrid, Tag, brl, fmtDate, label, useApi, useSpaces, useToast } from "./kit";

const COLS = [
  { key: "PROPOSTO", title: "Propostos", color: "#0288d1" }, { key: "APROVADO", title: "Aprovados", color: "#7b1fa2" },
  { key: "EM_EXECUCAO", title: "Em execução", color: "#ed6c02" }, { key: "SUSPENSO", title: "Suspensos", color: "#9e9e9e" }, { key: "CONCLUIDO", title: "Concluídos", color: "#2e7d32" },
];
const NEXT: Record<string, Array<[string, string]>> = {
  PROPOSTO: [["APROVADO", "Aprovar"]], APROVADO: [["EM_EXECUCAO", "Iniciar"], ["SUSPENSO", "Suspender"]],
  EM_EXECUCAO: [["CONCLUIDO", "Concluir"], ["SUSPENSO", "Suspender"]], SUSPENSO: [["EM_EXECUCAO", "Retomar"]], CONCLUIDO: [], CANCELADO: [],
};

const W5H2 = (spaces: any[]): Field[] => [
  { key: "titulo", label: "Título", required: true, full: true },
  { key: "oQue", label: "O quê (What)", required: true, type: "textarea" }, { key: "porQue", label: "Por quê (Why)", required: true, type: "textarea" },
  { key: "onde", label: "Onde (Where)" }, { key: "spaceId", label: "Espaço", type: "select", options: spaces },
  { key: "quando", label: "Quando (When)" }, { key: "quem", label: "Quem (Who)" }, { key: "como", label: "Como (How)", type: "textarea" },
  { key: "quantoCusta", label: "Quanto custa (R$)", type: "number" }, { key: "inicioPrevisto", label: "Início previsto", type: "date" }, { key: "fimPrevisto", label: "Fim previsto", type: "date" },
  { key: "pdiMetaId", label: "Meta do PDI (ID)" }, { key: "recomendacaoMec", label: "Recomendação do MEC / avaliação" }, { key: "justificativa", label: "Justificativa", type: "textarea" },
];
const ETAPA: Field[] = [
  { key: "titulo", label: "Etapa", required: true, full: true }, { key: "inicio", label: "Início", type: "date" }, { key: "fim", label: "Fim", type: "date", required: true },
  { key: "peso", label: "Peso", type: "number", def: 1 }, { key: "custoPrevisto", label: "Custo previsto (R$)", type: "number" },
];

function ProjetoDialog({ id, spaces, onClose, onChanged }: { id: string; spaces: any[]; onClose: () => void; onChanged: () => void }) {
  const st = useApi<any>(`/infraestrutura/projetos/${id}`);
  const toast = useToast();
  const [form, setForm] = useState<{ kind: "etapa" | "evidencia" | "editar" | "etapaAvanco"; etapa?: any } | null>(null);
  const after = () => { st.reload(); onChanged(); };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Projeto de melhoria (5W2H)</DialogTitle>
      <DialogContent dividers>
        <Async state={st}>
          {(p) => (
            <Box sx={{ display: "grid", gap: 2 }}>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>{p.titulo}</Typography><StatusChip value={p.status} />
                {p.atrasado && <Light tone="error" text="Atrasado" />}{p.estouroOrcamento && <Light tone="warning" text="Estouro de orçamento" />}
              </Box>
              <ProgressBar value={p.percentual || 0} color={p.atrasado ? "error" : "success"} />
              <StatGrid min={140}>
                <Stat label="Orçamento" value={brl(p.quantoCusta)} /><Stat label="Gasto real" value={brl(p.gastoReal)} /><Stat label="Saldo" value={brl(p.saldoOrcamento)} tone={p.saldoOrcamento < 0 ? "error" : "success"} />
                <Stat label="Etapas atrasadas" value={p.etapasAtrasadas ?? 0} tone={p.etapasAtrasadas ? "error" : "success"} />
              </StatGrid>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1 }}>
                {([["O quê", p.oQue], ["Por quê", p.porQue], ["Onde", p.onde], ["Quando", p.quando], ["Quem", p.quem], ["Como", p.como], ["Meta do PDI", p.pdiMetaId], ["Recomendação MEC", p.recomendacaoMec]] as Array<[string, string]>).filter((x) => x[1]).map(([k, v]) => (
                  <Box key={k}><Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>{k}</Typography><Typography variant="body2">{v}</Typography></Box>
                ))}
              </Box>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {(NEXT[p.status] || []).map(([s, l]) => (
                  <Button key={s} variant="contained" size="small" onClick={() => toast.run(() => eduApi.post(`/infraestrutura/projetos/${id}/status`, { status: s }), `Projeto: ${l.toLowerCase()} concluído.`, after, `${l} este projeto?`)}>{l}</Button>
                ))}
                {!["CONCLUIDO", "CANCELADO"].includes(p.status) && <Button size="small" onClick={() => setForm({ kind: "editar" })}>Editar 5W2H</Button>}
                {!["CONCLUIDO", "CANCELADO"].includes(p.status) && <Button size="small" color="error" onClick={() => toast.run(() => eduApi.post(`/infraestrutura/projetos/${id}/status`, { status: "CANCELADO" }), "Projeto cancelado.", after, "Cancelar este projeto?")}>Cancelar projeto</Button>}
              </Box>
              {p.status === "PROPOSTO" && <Alert severity="info">Cadastre ao menos uma etapa antes de aprovar o projeto.</Alert>}
              <Divider />
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>Cronograma de etapas</Typography>
                {!["CONCLUIDO", "CANCELADO"].includes(p.status) && <Button size="small" startIcon={<AddIcon />} onClick={() => setForm({ kind: "etapa" })}>Etapa</Button>}
              </Box>
              {(p.etapas || []).map((e: any) => (
                <Box key={e.id} sx={{ display: "grid", gap: 0.5, p: 1, borderRadius: 2, bgcolor: "action.hover" }}>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                    <b>{e.ordem}. {e.titulo}</b><StatusChip value={e.status} /><Typography variant="caption">até {fmtDate(e.fim)}</Typography>
                    <Box sx={{ flex: 1 }} />
                    {!["CONCLUIDO", "CANCELADO", "SUSPENSO"].includes(p.status) && (
                      <>
                        {p.status !== "PROPOSTO" && <Button size="small" onClick={() => setForm({ kind: "etapaAvanco", etapa: e })}>Registrar avanço</Button>}
                        {["PROPOSTO", "APROVADO"].includes(p.status) && <Button size="small" color="error" onClick={() => toast.run(() => eduApi.del(`/infraestrutura/etapas/${e.id}`), "Etapa removida.", after, "Remover esta etapa?")}>Remover</Button>}
                      </>
                    )}
                  </Box>
                  <ProgressBar value={e.percentual || 0} />
                </Box>
              ))}
              {!(p.etapas || []).length && <Typography variant="body2" color="text.secondary">Nenhuma etapa cadastrada.</Typography>}
              <Divider />
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>Evidências</Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={() => setForm({ kind: "evidencia" })}>Evidência</Button>
              </Box>
              {(Array.isArray(p.evidencias) ? p.evidencias : []).map((ev: any, i: number) => (
                <Typography key={i} variant="body2"><Tag text={label(ev.tipo)} /> <a href={ev.url} target="_blank" rel="noreferrer">{ev.legenda || ev.url}</a> · {fmtDate(ev.data)}</Typography>
              ))}
              <FormDialog open={form?.kind === "etapa"} title="Nova etapa" fields={ETAPA} onClose={() => setForm(null)} onSubmit={async (b) => { await eduApi.post(`/infraestrutura/projetos/${id}/etapas`, b); toast.ok("Etapa criada."); after(); }} />
              <FormDialog open={form?.kind === "etapaAvanco"} title={`Avanço — ${form?.etapa?.titulo || ""}`} initial={form?.etapa}
                fields={[{ key: "percentual", label: "Percentual concluído (0-100)", type: "number" }, { key: "status", label: "Situação", type: "select", options: ["PENDENTE", "EM_ANDAMENTO", "CONCLUIDA", "BLOQUEADA"] }, { key: "custoReal", label: "Custo real (R$)", type: "number" }]}
                onClose={() => setForm(null)} onSubmit={async (b) => { await eduApi.patch(`/infraestrutura/etapas/${form!.etapa.id}`, b); toast.ok("Etapa atualizada."); after(); }} />
              <FormDialog open={form?.kind === "evidencia"} title="Nova evidência" onClose={() => setForm(null)}
                fields={[{ key: "url", label: "URL do arquivo", required: true, full: true }, { key: "legenda", label: "Legenda" }, { key: "tipo", label: "Tipo", type: "select", options: ["FOTO", "DOCUMENTO", "VIDEO", "NOTA_FISCAL"], def: "FOTO" }]}
                onSubmit={async (b) => { await eduApi.post(`/infraestrutura/projetos/${id}/evidencias`, b); toast.ok("Evidência anexada."); after(); }} />
              <FormDialog open={form?.kind === "editar"} title="Editar projeto" fields={W5H2(spaces)} initial={p} onClose={() => setForm(null)}
                onSubmit={async (b) => { await eduApi.patch(`/infraestrutura/projetos/${id}`, b); toast.ok("Projeto atualizado."); after(); }} />
            </Box>
          )}
        </Async>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      {toast.node}
    </Dialog>
  );
}

export default function MelhoriasTab() {
  const [key, setKey] = useState(0);
  const [novo, setNovo] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const spaces = useSpaces();
  const toast = useToast();
  const list = useApi<any>(`/infraestrutura/projetos?pageSize=100&k=${key}`);
  const reload = () => setKey((k) => k + 1);
  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo(true)}>Novo projeto 5W2H</Button>
      </Box>
      <Async state={list}>
        {(d) => (
          <Kanban columns={COLS} rows={(d.items || []) as any[]} groupBy={(p) => p.status}
            render={(p) => (
              <Box sx={{ display: "grid", gap: 0.75, cursor: "pointer" }} onClick={() => setOpen(p.id)}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{p.titulo}</Typography>
                <ProgressBar value={p.percentual || 0} color={p.atrasado ? "error" : "success"} />
                <Typography variant="caption" color="text.secondary">{brl(p.gastoReal)} de {brl(p.quantoCusta)}</Typography>
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                  {p.atrasado && <Tag text="Atrasado" tone="error" />}{p.estouroOrcamento && <Tag text="Estouro" tone="warning" />}{p.recomendacaoMec && <Tag text="MEC" tone="info" />}
                </Box>
              </Box>
            )} />
        )}
      </Async>
      <FormDialog open={novo} title="Novo projeto de melhoria (5W2H)" fields={W5H2(spaces)} onClose={() => setNovo(false)}
        onSubmit={async (b) => { await eduApi.post("/infraestrutura/projetos", b); toast.ok("Projeto proposto."); reload(); }} />
      {open && <ProjetoDialog id={open} spaces={spaces} onClose={() => setOpen(null)} onChanged={reload} />}
      {toast.node}
    </Box>
  );
}
