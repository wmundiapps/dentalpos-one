import { Alert, Box, Button, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import EduResourcePage, { StatusChip } from "../EduResourcePage";
import { eduApi, qsOf } from "../../services/EduApi";
import ListTable from "./ListTable";
import { Async, FormDialog, Panel, SubNav, Tag, fmtDateTime, nameOf, useApi, useSpaces, useToast } from "./kit";

function Agenda({ spaces, rk }: { spaces: any[]; rk: number }) {
  const de = new Date().toISOString().slice(0, 10);
  const st = useApi<any>(`/infraestrutura/reservas/agenda${qsOf({ de, k: rk })}`);
  return (
    <Async state={st}>
      {(d) => {
        const dias: Record<string, any[]> = {};
        for (const r of d.items || []) (dias[String(r.inicio).slice(0, 10)] ||= []).push(r);
        const keys = Object.keys(dias).sort();
        if (!keys.length) return <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>Nenhuma reserva aprovada nos próximos 30 dias.</Typography>;
        return (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 2 }}>
            {keys.map((k) => (
              <Panel key={k} title={new Date(`${k}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}>
                <Box sx={{ display: "grid", gap: 1 }}>
                  {dias[k].map((r) => (
                    <Box key={r.id} sx={{ borderLeft: "4px solid", borderColor: "primary.main", pl: 1.25 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{r.titulo}</Typography>
                      <Typography variant="caption" color="text.secondary">{nameOf(spaces, r.spaceId)} · {new Date(r.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} – {new Date(r.fim).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</Typography>
                    </Box>
                  ))}
                </Box>
              </Panel>
            ))}
          </Box>
        );
      }}
    </Async>
  );
}

export default function PatioTab() {
  const [sub, setSub] = useState("agenda");
  const [key, setKey] = useState(0);
  const [nova, setNova] = useState(false);
  const [disp, setDisp] = useState(false);
  const [recusa, setRecusa] = useState<any | null>(null);
  const spaces = useSpaces();
  const toast = useToast();
  const reload = () => setKey((k) => k + 1);

  async function solicitar(b: any) {
    const { aceiteRegras, ...rest } = b;
    try { await eduApi.post("/infraestrutura/reservas", { ...rest, aceiteRegras: !!aceiteRegras }); }
    catch (e: any) { throw new Error(e?.message || "Falha ao solicitar a reserva."); }
    toast.ok("Reserva solicitada. Aguarde a análise da infraestrutura."); reload();
  }
  async function disponibilidade(b: any) {
    const r = await eduApi.get(`/infraestrutura/reservas/disponibilidade${qsOf({ spaceId: b.spaceId, inicio: b.inicio, fim: b.fim })}`);
    if (!r.disponivel) throw new Error(`Período indisponível. Conflito com: ${(r.conflitos || []).map((c: any) => `${c.titulo} (${fmtDateTime(c.inicio)})`).join("; ")}`);
    toast.ok("Período disponível para reserva.");
  }

  const cols = [
    { key: "titulo", label: "Evento" }, { key: "spaceId", label: "Espaço", render: (r: any) => nameOf(spaces, r.spaceId) },
    { key: "inicio", label: "Início", render: (r: any) => fmtDateTime(r.inicio) }, { key: "fim", label: "Fim", render: (r: any) => fmtDateTime(r.fim) },
    { key: "publicoEstimado", label: "Público" }, { key: "status", label: "Situação", render: (r: any) => <StatusChip value={r.status} /> },
  ];
  return (
    <Box>
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        <SubNav value={sub} onChange={setSub} items={[{ key: "agenda", label: "Agenda" }, { key: "reservas", label: "Reservas (gestão)" }, { key: "minhas", label: "Minhas reservas" }, { key: "regras", label: "Regras de uso" }]} />
        <Box sx={{ flex: 1 }} />
        <Button onClick={() => setDisp(true)} sx={{ mb: 2 }}>Verificar disponibilidade</Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNova(true)} sx={{ mb: 2 }}>Solicitar reserva</Button>
      </Box>
      {sub === "agenda" && <Agenda spaces={spaces} rk={key} />}
      {sub === "reservas" && (
        <ListTable path="/infraestrutura/reservas" refreshKey={key} searchable={false} columns={cols}
          filters={[{ key: "status", label: "Situação", options: ["SOLICITADA", "APROVADA", "RECUSADA", "CANCELADA", "REALIZADA"] }, { key: "spaceId", label: "Espaço", options: spaces }]}
          actions={(r, rl) => (
            <>
              {r.status === "SOLICITADA" && <Button size="small" color="success" onClick={() => toast.run(() => eduApi.post(`/infraestrutura/reservas/${r.id}/decidir`, { aprovar: true }), "Reserva aprovada.", rl, `Aprovar a reserva "${r.titulo}"?`)}>Aprovar</Button>}
              {r.status === "SOLICITADA" && <Button size="small" color="error" onClick={() => setRecusa(r)}>Recusar</Button>}
              {["SOLICITADA", "APROVADA"].includes(r.status) && <Button size="small" onClick={() => toast.run(() => eduApi.post(`/infraestrutura/reservas/${r.id}/cancelar`, {}), "Reserva cancelada.", rl, "Cancelar esta reserva?")}>Cancelar</Button>}
            </>
          )} />
      )}
      {sub === "minhas" && (
        <ListTable path="/infraestrutura/reservas/minhas" refreshKey={key} searchable={false} columns={cols}
          actions={(r, rl) => (["SOLICITADA", "APROVADA"].includes(r.status) ? <Button size="small" onClick={() => toast.run(() => eduApi.post(`/infraestrutura/reservas/${r.id}/cancelar`, {}), "Reserva cancelada.", rl, "Cancelar esta reserva?")}>Cancelar</Button> : null)} />
      )}
      {sub === "regras" && (
        <EduResourcePage title="Regras de uso das áreas" description="O solicitante precisa aceitar estas regras ao reservar." base="/infraestrutura" resource="/regras-uso" searchable={false}
          columns={[{ key: "ordem", label: "Ordem" }, { key: "titulo", label: "Título" }, { key: "texto", label: "Texto" }, { key: "spaceId", label: "Espaço", render: (r) => (r.spaceId ? nameOf(spaces, r.spaceId) : <Tag text="Todos" />) }]}
          fields={[{ key: "titulo", label: "Título", required: true }, { key: "ordem", label: "Ordem", type: "number" }, { key: "spaceId", label: "Espaço (vazio = todos)", type: "select", options: spaces }, { key: "texto", label: "Texto", type: "textarea", required: true }, { key: "ativo", label: "Ativa", type: "bool" }]} />
      )}
      <FormDialog open={nova} title="Solicitar reserva de área" onClose={() => setNova(false)} onSubmit={solicitar}
        intro={<Alert severity="info" sx={{ mb: 2 }}>Aceite as regras de uso para concluir. Conflitos com reservas aprovadas são bloqueados automaticamente.</Alert>}
        fields={[
          { key: "spaceId", label: "Espaço", type: "select", options: spaces, required: true }, { key: "titulo", label: "Título do evento", required: true },
          { key: "inicio", label: "Início", type: "datetime", required: true }, { key: "fim", label: "Fim", type: "datetime", required: true },
          { key: "publicoEstimado", label: "Público estimado", type: "number" }, { key: "necessidades", label: "Necessidades (separe por vírgula)", type: "list", helper: "Ex.: som, cadeiras, tenda" },
          { key: "finalidade", label: "Finalidade", type: "textarea" }, { key: "aceiteRegras", label: "Li e aceito as regras de uso", type: "bool" },
        ]} />
      <FormDialog open={disp} title="Verificar disponibilidade" onClose={() => setDisp(false)} submitLabel="Verificar" onSubmit={disponibilidade}
        fields={[{ key: "spaceId", label: "Espaço", type: "select", options: spaces, required: true }, { key: "inicio", label: "Início", type: "datetime", required: true }, { key: "fim", label: "Fim", type: "datetime", required: true }]} />
      <FormDialog open={!!recusa} title={`Recusar: ${recusa?.titulo || ""}`} onClose={() => setRecusa(null)} submitLabel="Recusar reserva"
        fields={[{ key: "motivo", label: "Motivo da recusa", type: "textarea", required: true }]}
        onSubmit={async (b) => { await eduApi.post(`/infraestrutura/reservas/${recusa.id}/decidir`, { aprovar: false, ...b }); toast.ok("Reserva recusada."); reload(); }} />
      {toast.node}
    </Box>
  );
}
