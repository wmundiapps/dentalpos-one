import { Box, Button, FormControlLabel, Checkbox, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { StatusChip } from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { FormDialog, Light, SubNav, Tag, brl, fmtDate, fmtDateTime, label, useToast } from "../infraestrutura/kit";
import BalcaoPanel from "./BalcaoPanel";
import LeitoresPanel from "./LeitoresPanel";
import { LeitorPicker, ObraPicker } from "./pickers";

function Emprestimos({ rk }: { rk: number }) {
  const [key, setKey] = useState(0);
  const [atr, setAtr] = useState(false);
  const toast = useToast();
  return (
    <Box>
      <ListTable path="/biblioteca/emprestimos" refreshKey={key + rk} searchable={false} extraQuery={atr ? { atrasados: "true" } : {}}
        filters={[{ key: "status", label: "Situação", options: ["ATIVO", "DEVOLVIDO", "PERDIDO"] }]}
        toolbar={<FormControlLabel control={<Checkbox checked={atr} onChange={(e) => setAtr(e.target.checked)} />} label="Somente atrasados" />}
        columns={[
          { key: "leitor", label: "Leitor", render: (r) => r.leitor?.nome || "—" }, { key: "exemplar", label: "Obra / tombo", render: (r) => <span>{r.exemplar?.obra?.titulo} <Typography component="span" variant="caption" color="text.secondary">({r.exemplar?.tombo})</Typography></span> },
          { key: "dataEmprestimo", label: "Emprestado", render: (r) => fmtDate(r.dataEmprestimo) },
          { key: "dataPrevista", label: "Devolução prevista", render: (r) => { const late = r.status === "ATIVO" && new Date(r.dataPrevista) < new Date(); return <Light tone={r.status !== "ATIVO" ? "default" : late ? "error" : "success"} text={fmtDate(r.dataPrevista)} />; } },
          { key: "renovacoes", label: "Renov." }, { key: "multaPrevista", label: "Multa prevista", align: "right", render: (r) => (r.multaPrevista ? brl(r.multaPrevista) : "—") }, { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> },
        ]}
        actions={(r, rl) => (r.status === "ATIVO" ? (
          <>
            <Button size="small" onClick={() => toast.run(() => eduApi.post(`/biblioteca/emprestimos/${r.id}/renovar`, {}), "Empréstimo renovado.", rl)}>Renovar</Button>
            <Button size="small" color="error" onClick={() => toast.run(() => eduApi.post(`/biblioteca/emprestimos/${r.id}/perdido`, {}), "Registrado como perdido; multa de extravio gerada.", rl, "Registrar o exemplar como PERDIDO? Será gerada multa de extravio.")}>Perdido</Button>
          </>
        ) : null)} />
      {toast.node}
    </Box>
  );
}

function Reservas() {
  const [key, setKey] = useState(0);
  const [nova, setNova] = useState(false);
  const [leitor, setLeitor] = useState<any | null>(null);
  const [obra, setObra] = useState<any | null>(null);
  const toast = useToast();
  return (
    <Box>
      <ListTable path="/biblioteca/reservas" refreshKey={key} searchable={false} filters={[{ key: "status", label: "Situação", options: ["AGUARDANDO", "DISPONIVEL", "ATENDIDA", "CANCELADA", "EXPIRADA"] }]}
        toolbar={<Button variant="contained" startIcon={<AddIcon />} onClick={() => { setLeitor(null); setObra(null); setNova(true); }}>Nova reserva</Button>}
        columns={[
          { key: "createdAt", label: "Pedida em", render: (r) => fmtDateTime(r.createdAt) }, { key: "leitor", label: "Leitor", render: (r) => r.leitor?.nome || "—" }, { key: "obra", label: "Obra", render: (r) => r.obra?.titulo || "—" },
          { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> }, { key: "expiraEm", label: "Retirar até", render: (r) => (r.status === "DISPONIVEL" ? <Tag text={fmtDateTime(r.expiraEm)} tone="warning" /> : "—") },
        ]}
        actions={(r, rl) => (["AGUARDANDO", "DISPONIVEL"].includes(r.status) ? <Button size="small" color="error" onClick={() => toast.run(() => eduApi.post(`/biblioteca/reservas/${r.id}/cancelar`, {}), "Reserva cancelada.", rl, "Cancelar esta reserva?")}>Cancelar</Button> : null)} />
      <FormDialog open={nova} onClose={() => setNova(false)} title="Nova reserva" fields={[]}
        intro={<Box sx={{ display: "grid", gap: 2, mb: 1 }}><LeitorPicker label="Leitor" value={leitor} onChange={setLeitor} required /><ObraPicker label="Obra" value={obra} onChange={setObra} required /></Box>}
        onSubmit={async () => { if (!leitor || !obra) throw new Error("Selecione o leitor e a obra."); await eduApi.post("/biblioteca/reservas", { leitorId: leitor.id, obraId: obra.id }); toast.ok("Reserva registrada."); setKey((k) => k + 1); }} />
      {toast.node}
    </Box>
  );
}

function Multas() {
  const [key, setKey] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [dlg, setDlg] = useState<{ kind: "nova" | "baixar"; row?: any } | null>(null);
  const [leitor, setLeitor] = useState<any | null>(null);
  const toast = useToast();
  return (
    <Box>
      {total !== null && <Typography sx={{ mb: 1 }}>Total em aberto no filtro: <b>{brl(total)}</b></Typography>}
      <ListTable path="/biblioteca/multas" refreshKey={key} searchable={false} onLoaded={(r) => setTotal(r?.totalEmAberto ?? null)}
        filters={[{ key: "status", label: "Situação", options: ["ABERTA", "EM_COBRANCA", "PAGA", "ISENTA", "CANCELADA"] }, { key: "tipo", label: "Tipo", options: ["ATRASO", "DANO", "EXTRAVIO"] }]}
        toolbar={<Button variant="contained" startIcon={<AddIcon />} onClick={() => { setLeitor(null); setDlg({ kind: "nova" }); }}>Nova multa</Button>}
        columns={[
          { key: "createdAt", label: "Data", render: (r) => fmtDate(r.createdAt) }, { key: "leitor", label: "Leitor", render: (r) => r.leitor?.nome || "—" }, { key: "tipo", label: "Tipo", render: (r) => <Tag text={label(r.tipo)} /> },
          { key: "descricao", label: "Descrição" }, { key: "valor", label: "Valor", align: "right", render: (r) => brl(r.valor) }, { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> },
        ]}
        actions={(r) => (["ABERTA", "EM_COBRANCA"].includes(r.status) ? <Button size="small" onClick={() => setDlg({ kind: "baixar", row: r })}>Baixar</Button> : null)} />
      <FormDialog open={!!dlg} onClose={() => setDlg(null)} title={dlg?.kind === "nova" ? "Nova multa" : `Baixar multa de ${dlg?.row?.leitor?.nome || ""}`}
        intro={dlg?.kind === "nova" ? <Box sx={{ mb: 2 }}><LeitorPicker label="Leitor" value={leitor} onChange={setLeitor} required /></Box> : undefined}
        fields={dlg?.kind === "nova"
          ? [{ key: "tipo", label: "Tipo", type: "select", options: ["DANO", "EXTRAVIO", "ATRASO"], def: "DANO" }, { key: "valor", label: "Valor (R$)", type: "number", required: true }, { key: "descricao", label: "Descrição", required: true, full: true }]
          : [{ key: "acao", label: "Ação", type: "select", required: true, def: "PAGAR", options: [{ value: "PAGAR", label: "Registrar pagamento" }, { value: "ISENTAR", label: "Isentar" }, { value: "CANCELAR", label: "Cancelar" }, { value: "COBRAR", label: "Enviar para cobrança (contas a receber)" }] },
            { key: "forma", label: "Forma de pagamento" }, { key: "vencimento", label: "Vencimento (cobrança)", type: "date" }, { key: "justificativa", label: "Justificativa", type: "textarea" }]}
        onSubmit={async (b) => {
          if (dlg!.kind === "nova") { if (!leitor) throw new Error("Selecione o leitor."); await eduApi.post("/biblioteca/multas", { ...b, leitorId: leitor.id }); }
          else await eduApi.post(`/biblioteca/multas/${dlg!.row.id}/baixar`, b);
          toast.ok("Operação concluída."); setKey((k) => k + 1);
        }} />
      {toast.node}
    </Box>
  );
}

export default function CirculacaoTab() {
  const [sub, setSub] = useState("balcao");
  const [rk, setRk] = useState(0);
  return (
    <Box>
      <SubNav value={sub} onChange={setSub} items={[{ key: "balcao", label: "Balcão" }, { key: "emprestimos", label: "Empréstimos" }, { key: "reservas", label: "Reservas" }, { key: "multas", label: "Multas" }, { key: "leitores", label: "Leitores" }]} />
      {sub === "balcao" && <BalcaoPanel onChanged={() => setRk((k) => k + 1)} />}
      {sub === "emprestimos" && <Emprestimos rk={rk} />}
      {sub === "reservas" && <Reservas />}
      {sub === "multas" && <Multas />}
      {sub === "leitores" && <LeitoresPanel />}
    </Box>
  );
}
