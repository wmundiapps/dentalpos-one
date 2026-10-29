import { Alert, Box, Button, Chip, MenuItem, TextField, Typography } from "@mui/material";
import DescriptionIcon from "@mui/icons-material/Description";
import { useEffect, useRef, useState } from "react";
import { eduApi } from "../../services/EduApi";
import ListTable from "./ListTable";
import QrScanner from "./QrScanner";
import { Async, FormDialog, Panel, ProgressBar, Stat, StatGrid, Tag, label, useApi, useSpaces, useToast } from "./kit";
import { abrirArquivo, baixarArquivo } from "./cppKit";

const tomRes = (r?: string) => (r === "CONTADO" ? "success" : r === "RECONTADO" ? "info" : r === "NAO_RECONHECIDO" ? "error" : "warning") as any;

function Leitura({ inv, onChanged }: { inv: any; onChanged: () => void }) {
  const spaces = useSpaces();
  const [spaceId, setSpaceId] = useState(inv.spaceId || "");
  const [texto, setTexto] = useState("");
  const [log, setLog] = useState<any[]>([]);
  const [prog, setProg] = useState<any>(null);
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => { campo.current?.focus(); }, []);

  async function ler(payload: string) {
    const p = payload.trim();
    if (!p) return;
    try {
      const r: any = await eduApi.post(`/infraestrutura/inventarios/${inv.id}/leitura`, { payload: p, spaceId: spaceId || undefined });
      setLog((l) => [{ ...r, payload: p, quando: new Date() }, ...l].slice(0, 30));
      setProg(r.progresso);
      if (navigator.vibrate) navigator.vibrate(r.divergencia && r.divergencia !== "NENHUMA" ? [80, 60, 80] : 40);
    } catch (e: any) { setLog((l) => [{ resultado: "NAO_RECONHECIDO", aviso: e?.message, payload: p, quando: new Date() }, ...l].slice(0, 30)); }
    setTexto(""); onChanged(); campo.current?.focus();
  }
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        <TextField select size="small" label="Local onde você está agora" value={spaceId} onChange={(e) => setSpaceId(e.target.value)} helperText="Itens lidos em local diferente do cadastro viram divergência">
          <MenuItem value="">Local do inventário</MenuItem>{spaces.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
        </TextField>
        <TextField inputRef={campo} size="small" label="Código lido / digitado (Enter)" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ler(texto); }} />
      </Box>
      <QrScanner onRead={ler} />
      {prog && <ProgressBar value={prog.pct} color="success" />}
      <Box sx={{ display: "grid", gap: 0.75 }}>
        {log.map((l, i) => (
          <Alert key={i} severity={l.resultado === "NAO_RECONHECIDO" ? "error" : l.divergencia && l.divergencia !== "NENHUMA" ? "warning" : "success"} icon={false} sx={{ py: 0.25 }}>
            <Chip size="small" color={tomRes(l.resultado)} label={label(l.resultado)} sx={{ mr: 1 }} />
            <b>{l.bem?.tombamento || l.payload}</b> {l.bem?.descricao} {l.divergencia && l.divergencia !== "NENHUMA" ? <Tag text={label(l.divergencia)} tone="warning" /> : null} {l.aviso ? <Typography component="span" variant="caption"> — {l.aviso}</Typography> : null}
          </Alert>
        ))}
      </Box>
    </Box>
  );
}

function Divergencias({ inv, onChanged }: { inv: any; onChanged: () => void }) {
  const st = useApi<any>(`/infraestrutura/inventarios/${inv.id}/divergencias`);
  const [dec, setDec] = useState<any | null>(null);
  const toast = useToast();
  return (
    <Async state={st}>
      {(d) => (
        <Box sx={{ overflowX: "auto" }}>
          <Typography variant="body2" sx={{ mb: 1 }}>{d.total} divergência(s), {d.pendentesDecisao} sem decisão.</Typography>
          {d.itens.map((i: any) => (
            <Box key={i.id} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", py: 0.75, borderBottom: "1px solid", borderColor: "divider" }}>
              <Tag text={label(i.divergencia)} tone="warning" /><b>{i.tombamento}</b><span>{i.bem?.descricao || i.observacao}</span>
              <Typography variant="caption" color="text.secondary">esperado: {i.esperado || "—"} · encontrado: {i.encontrado || "—"}</Typography>
              {i.decisao ? <Tag text={`Decidido: ${label(i.decisao.acao)}`} tone="success" /> : inv.status === "FECHADO" ? <Button size="small" onClick={() => setDec(i)}>Decidir</Button> : null}
            </Box>
          ))}
          {!d.itens.length && <Typography color="text.secondary">Sem divergências.</Typography>}
          <FormDialog open={!!dec} title={`Decidir — ${dec?.tombamento || ""}`} onClose={() => setDec(null)}
            fields={[{ key: "acao", label: "Ação", type: "select", required: true, options: ["AJUSTAR_LOCAL", "MANTER", "BAIXAR", "INVESTIGAR", "REGULARIZAR"] }, { key: "motivo", label: "Motivo", required: true, type: "textarea" }]}
            onSubmit={async (b) => { await eduApi.post(`/infraestrutura/inventarios/${inv.id}/itens/${dec.id}/decidir`, b); toast.ok("Decisão registrada."); st.reload(); onChanged(); }} />
          {toast.node}
        </Box>
      )}
    </Async>
  );
}

export default function InventarioQrTab() {
  const [sel, setSel] = useState<any | null>(null);
  const [key, setKey] = useState(0);
  const [novo, setNovo] = useState(false);
  const spaces = useSpaces();
  const toast = useToast();
  const det = useApi<any>(sel ? `/infraestrutura/inventarios/${sel.id}` : null);
  const reload = () => { setKey((k) => k + 1); det.reload(); };

  if (!sel) {
    return (
      <Box>
        <ListTable path="/infraestrutura/inventarios" refreshKey={key} searchable={false} filters={[{ key: "status", label: "Situação", options: ["ABERTO", "FECHADO", "CANCELADO"] }]}
          toolbar={<Button variant="contained" onClick={() => setNovo(true)}>Novo inventário</Button>}
          columns={[{ key: "titulo", label: "Inventário" }, { key: "spaceId", label: "Local", render: (r) => spaces.find((s) => s.value === r.spaceId)?.label || "Todos" }, { key: "status", label: "Situação", render: (r) => <Tag text={label(r.status)} tone={r.status === "ABERTO" ? "warning" : "success"} /> }, { key: "n", label: "Itens", render: (r) => r._count?.itens }]}
          actions={(r) => <Button size="small" variant="outlined" onClick={() => setSel(r)}>Abrir</Button>} />
        <FormDialog open={novo} title="Novo inventário físico" onClose={() => setNovo(false)}
          fields={[{ key: "titulo", label: "Título", required: true, full: true }, { key: "spaceId", label: "Local (em branco = todos)", type: "select", options: spaces }, { key: "prazoEm", label: "Prazo", type: "date" }]}
          onSubmit={async (b) => { await eduApi.post("/infraestrutura/inventarios", b); toast.ok("Inventário aberto."); reload(); }} />
        {toast.node}
      </Box>
    );
  }
  const inv = det.data || sel;
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
        <Button onClick={() => setSel(null)}>← Voltar</Button><Typography variant="h6" sx={{ fontWeight: 800, flex: 1 }}>{inv.titulo}</Typography><Tag text={label(inv.status)} tone={inv.status === "ABERTO" ? "warning" : "success"} />
        <Button startIcon={<DescriptionIcon />} onClick={() => toast.run(() => abrirArquivo("GET", `/infraestrutura/inventarios/${inv.id}/relatorio?format=html`), "Relatório aberto.")}>Relatório</Button>
        <Button onClick={() => toast.run(() => baixarArquivo(`/infraestrutura/inventarios/${inv.id}/relatorio?format=csv`, "inventario.csv"), "CSV gerado.")}>CSV</Button>
        {inv.status === "ABERTO" && <Button variant="contained" color="success" onClick={() => toast.run(async () => { try { return await eduApi.post(`/infraestrutura/inventarios/${inv.id}/fechar`, {}); } catch (e: any) { if (window.confirm(`${e.message}\n\nFechar mesmo assim (não lidos viram “não encontrados”)?`)) return eduApi.post(`/infraestrutura/inventarios/${inv.id}/fechar`, { permitirIncompleto: true }); throw e; } }, "Inventário fechado.", reload)}>Fechar inventário</Button>}
      </Box>
      <Async state={det}>
        {(d) => (
          <>
            <StatGrid min={140}><Stat label="Itens" value={d.progresso.total} /><Stat label="Lidos" value={d.progresso.contados} tone="success" /><Stat label="Progresso" value={`${d.progresso.pct}%`} /></StatGrid>
            {d.status === "ABERTO" && <Panel title="Leitura por QR Code / código de barras"><Leitura inv={d} onChanged={det.reload} /></Panel>}
            <Panel title="Divergências e decisões" subtitle={d.status === "ABERTO" ? "Feche o inventário para decidir (ajustar local, manter, baixar ou investigar)." : undefined}><Divergencias inv={d} onChanged={reload} /></Panel>
          </>
        )}
      </Async>
      {toast.node}
    </Box>
  );
}
