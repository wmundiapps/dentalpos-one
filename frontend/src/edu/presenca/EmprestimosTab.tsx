import { Alert, Box, Button, Chip, MenuItem, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { Async, Bars, FormDialog, Panel, Stat, StatGrid, SubNav, Tag, brl, fmtDateTime, label, num, useApi, useSpaces, useToast } from "../infraestrutura/kit";
import { STATUS_COR } from "./comum";

const SETORES = ["BIBLIOTECA", "LABORATORIO", "AUDIOVISUAL", "OUTRO"];

function Resumo() {
  const r = useApi<any>("/presenca/relatorios/emprestimos");
  return (
    <Async state={r}>
      {(d) => (
        <Box sx={{ display: "grid", gap: 2 }}>
          <StatGrid>
            <Stat label="Ativos" value={num(d.ativos, 0)} /><Stat label="Em atraso" value={num(d.atrasados, 0)} tone={d.atrasados ? "error" : "success"} />
            <Stat label="Devolvidos (30 dias)" value={num(d.devolvidos30d, 0)} /><Stat label="Multas em aberto" value={brl(d.valorMultasAbertas)} hint={`${d.multasAbertas} multa(s)`} tone={d.multasAbertas ? "warning" : "success"} />
            <Stat label="Bloqueios" value={num(d.bloqueiosAtivos, 0)} /><Stat label="Reservas" value={num(d.reservasAbertas, 0)} />
          </StatGrid>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            <Panel title="Itens por situação"><Bars items={Object.entries(d.itensPorStatus || {}).map(([k, v]) => ({ label: label(k), value: Number(v) }))} /></Panel>
            <Panel title="Mais emprestados (90 dias)"><Bars items={(d.maisEmprestados || []).map((i: any) => ({ label: i.descricao || i.codigo, value: i.emprestimos }))} /></Panel>
          </Box>
          <Alert severity="info">Livros usam a circulação da Biblioteca (a mesma leitura de QR/código); aqui entram equipamentos, materiais e audiovisual.</Alert>
        </Box>
      )}
    </Async>
  );
}

function Emprestimos() {
  const [rk, setRk] = useState(0);
  const toast = useToast();
  return (
    <Panel title="Empréstimos de itens">
      <ListTable path="/presenca/emprestimos" searchable={false} refreshKey={rk}
        filters={[{ key: "status", label: "Situação", options: ["ATIVO", "DEVOLVIDO", "PERDIDO"] }, { key: "atrasados", label: "Atraso", options: [{ value: "true", label: "Somente atrasados" }] }]}
        columns={[
          { key: "item", label: "Item", render: (r) => r.item?.descricao ?? "—" }, { key: "pessoa", label: "Com" }, { key: "retiradaEm", label: "Retirada", render: (r) => fmtDateTime(r.retiradaEm) },
          { key: "previstaEm", label: "Devolução prevista", render: (r) => fmtDateTime(r.previstaEm) },
          { key: "status", label: "Situação", render: (r) => <Chip size="small" color={r.atrasado ? "error" : STATUS_COR[r.status] || "default"} label={r.atrasado ? `Atrasado (${r.diasAtraso || ""}d)` : label(r.status)} /> },
          { key: "metodoRetirada", label: "Retirada por", render: (r) => label(r.metodoRetirada) },
        ]}
        actions={(r) => r.status === "ATIVO" ? (
          <>
            <Button size="small" onClick={() => toast.run(() => eduApi.post(`/presenca/emprestimos/${r.id}/renovar`, {}), "Renovado.", () => setRk((k) => k + 1))}>Renovar</Button>
            <Button size="small" color="error" onClick={() => { const m = window.prompt("Motivo da perda/extravio (mín. 5 caracteres):"); const v = m ? window.prompt("Valor a cobrar (R$):", "0") : null; if (m && v !== null) toast.run(() => eduApi.post(`/presenca/emprestimos/${r.id}/perdido`, { motivo: m, valor: Number(v.replace(",", ".")) || 0 }), "Perda registrada.", () => setRk((k) => k + 1)); }}>Perdido</Button>
          </>
        ) : null} />
      {toast.node}
    </Panel>
  );
}

function Itens() {
  const spaces = useSpaces();
  const [rk, setRk] = useState(0);
  const [novo, setNovo] = useState(false);
  const [edit, setEdit] = useState<any | null>(null);
  const [bemId, setBemId] = useState("");
  const toast = useToast();
  const campos = [
    { key: "codigo", label: "Código / QR do item", required: true }, { key: "descricao", label: "Descrição", required: true },
    { key: "categoria", label: "Categoria", type: "select" as const, options: ["EQUIPAMENTO", "MATERIAL", "AUDIOVISUAL", "LABORATORIO", "OUTRO"] },
    { key: "setor", label: "Setor", type: "select" as const, options: SETORES }, { key: "spaceId", label: "Local", type: "select" as const, options: spaces },
    { key: "prazoPadraoHoras", label: "Prazo padrão (horas)", type: "number" as const, def: 24 }, { key: "maxRenovacoes", label: "Renovações permitidas", type: "number" as const, def: 1 },
    { key: "observacoes", label: "Observações", type: "textarea" as const },
  ];
  return (
    <Panel title="Itens emprestáveis" subtitle="Equipamentos, materiais e audiovisual. Itens do patrimônio entram pelo tombamento (o status do bem acompanha o empréstimo)."
      actions={<Button variant="contained" onClick={() => setNovo(true)}>Novo item</Button>}>
      <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
        <TextField size="small" label="ID do bem patrimonial" value={bemId} onChange={(e) => setBemId(e.target.value)} sx={{ minWidth: 280 }} helperText="Cole o id do bem (Infraestrutura → Patrimônio) para torná-lo emprestável." />
        <Button disabled={!bemId.trim()} onClick={() => toast.run(() => eduApi.post(`/presenca/itens/de-bem/${bemId.trim()}`, { setor: "AUDIOVISUAL" }), "Item criado a partir do patrimônio.", () => { setBemId(""); setRk((k) => k + 1); })}>Criar a partir do patrimônio</Button>
      </Box>
      <ListTable path="/presenca/itens" refreshKey={rk}
        filters={[{ key: "setor", label: "Setor", options: SETORES }, { key: "status", label: "Situação", options: ["DISPONIVEL", "EMPRESTADO", "RESERVADO", "MANUTENCAO", "BAIXADO", "PERDIDO"] }]}
        columns={[{ key: "codigo", label: "Código" }, { key: "descricao", label: "Descrição" }, { key: "setor", label: "Setor", render: (r) => label(r.setor) }, { key: "prazoPadraoHoras", label: "Prazo (h)" },
          { key: "status", label: "Situação", render: (r) => <Chip size="small" color={STATUS_COR[r.status] || "default"} label={label(r.status)} /> }, { key: "bemId", label: "Patrimônio", render: (r) => (r.bemId ? "Vinculado" : "—") }]}
        actions={(r) => <Button size="small" onClick={() => setEdit(r)}>Editar</Button>} />
      <FormDialog open={novo} title="Novo item emprestável" fields={campos} onClose={() => setNovo(false)} onSubmit={async (b) => { await eduApi.post("/presenca/itens", b); setRk((k) => k + 1); }} />
      <FormDialog open={!!edit} title="Editar item" fields={[...campos.filter((c) => c.key !== "codigo"), { key: "status", label: "Situação", type: "select", options: ["DISPONIVEL", "MANUTENCAO", "BAIXADO"] }]} initial={edit} onClose={() => setEdit(null)} onSubmit={async (b) => { await eduApi.put(`/presenca/itens/${edit.id}`, b); setRk((k) => k + 1); }} />
      {toast.node}
    </Panel>
  );
}

function Multas() {
  const [rk, setRk] = useState(0);
  const toast = useToast();
  const bl = useApi<any>(`/presenca/bloqueios?x=${rk}`);
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Panel title="Multas">
        <ListTable path="/presenca/multas" searchable={false} refreshKey={rk} filters={[{ key: "status", label: "Situação", options: ["ABERTA", "PAGA", "ISENTA"] }]}
          columns={[{ key: "pessoa", label: "Pessoa" }, { key: "motivo", label: "Motivo" }, { key: "valor", label: "Valor", render: (r) => brl(r.valor) }, { key: "createdAt", label: "Data", render: (r) => fmtDateTime(r.createdAt) }, { key: "status", label: "Situação", render: (r) => <Tag text={label(r.status)} tone={r.status === "ABERTA" ? "warning" : "success"} /> }]}
          actions={(r) => r.status === "ABERTA" ? (<>
            <Button size="small" onClick={() => toast.run(() => eduApi.post(`/presenca/multas/${r.id}/baixar`, { acao: "PAGAR" }), "Multa baixada.", () => setRk((k) => k + 1))}>Baixar (paga)</Button>
            <Button size="small" onClick={() => { const m = window.prompt("Motivo da isenção (mín. 5 caracteres):"); if (m) toast.run(() => eduApi.post(`/presenca/multas/${r.id}/baixar`, { acao: "ISENTAR", motivo: m }), "Multa isentada.", () => setRk((k) => k + 1)); }}>Isentar</Button>
          </>) : null} />
      </Panel>
      <Panel title="Bloqueios ativos" subtitle="Automáticos por atraso prolongado ou manuais.">
        <Async state={bl}>
          {(d) => (<Box sx={{ display: "grid", gap: 1 }}>
            {(d.items || []).map((b: any) => <Box key={b.id} sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}><Tag text={b.origem} tone={b.origem === "MANUAL" ? "info" : "warning"} /><Typography variant="body2" sx={{ flex: 1, minWidth: 200 }}><b>{b.pessoa}</b> — {b.motivo}{b.ate ? ` (até ${fmtDateTime(b.ate)})` : ""}</Typography><Button size="small" onClick={() => toast.run(() => eduApi.post(`/presenca/bloqueios/${b.id}/liberar`, {}), "Bloqueio liberado.", () => setRk((k) => k + 1))}>Liberar</Button></Box>)}
            {!d.items?.length && <Typography color="text.secondary">Nenhum bloqueio.</Typography>}
          </Box>)}
        </Async>
      </Panel>
      {toast.node}
    </Box>
  );
}

function Reservas() {
  const rs = useApi<any>("/presenca/reservas");
  return (
    <Panel title="Reservas de itens" subtitle="Fila automática: ao devolver, o item fica separado por 24 h para o primeiro da fila.">
      <Async state={rs}>
        {(d) => (<Box sx={{ display: "grid", gap: 1 }}>
          {(d.items || []).map((r: any) => <Box key={r.id} sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}><Chip size="small" color={STATUS_COR[r.status] || "default"} label={label(r.status)} /><Typography variant="body2">{r.pessoa} · {fmtDateTime(r.createdAt)}{r.expiraEm ? ` · retirar até ${fmtDateTime(r.expiraEm)}` : ""}</Typography></Box>)}
          {!d.items?.length && <Typography color="text.secondary">Sem reservas.</Typography>}
        </Box>)}
      </Async>
    </Panel>
  );
}

function Inventario() {
  const lista = useApi<any>("/presenca/inventarios");
  const [sel, setSel] = useState<string | null>(null);
  const det = useApi<any>(sel ? `/presenca/inventarios/${sel}` : null);
  const [cod, setCod] = useState("");
  const [setor, setSetor] = useState("LABORATORIO");
  const toast = useToast();
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Panel title="Inventário por leitura de QR/código" subtitle="Abra um inventário por setor, leia os itens e conclua para ver faltantes e códigos não cadastrados."
        actions={<Box sx={{ display: "flex", gap: 1 }}><TextField select size="small" value={setor} onChange={(e) => setSetor(e.target.value)} sx={{ minWidth: 160 }}>{SETORES.map((s) => <MenuItem key={s} value={s}>{label(s)}</MenuItem>)}</TextField><Button variant="contained" onClick={() => toast.run(() => eduApi.post<any>("/presenca/inventarios", { setor }), "Inventário aberto.", (i) => { lista.reload(); setSel(i.id); })}>Novo inventário</Button></Box>}>
        <Async state={lista}>
          {(d) => (<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>{(d.items || []).map((i: any) => <Chip key={i.id} clickable color={sel === i.id ? "primary" : "default"} label={`${fmtDateTime(i.iniciadoEm)} · ${label(i.setor)} · ${i.status}`} onClick={() => setSel(i.id)} />)}</Box>)}
        </Async>
      </Panel>
      {sel && (
        <Panel title="Conferência">
          <Async state={det}>
            {(d) => {
              const r = d.resultado || {};
              return (
                <Box sx={{ display: "grid", gap: 1.5 }}>
                  {d.inventario.status === "ABERTO" && (
                    <Box component="form" onSubmit={(e) => { e.preventDefault(); if (cod.trim()) toast.run(() => eduApi.post(`/presenca/inventarios/${sel}/leituras`, { codigo: cod.trim(), via: "CODIGO" }), "", () => { setCod(""); det.reload(); }); }} sx={{ display: "flex", gap: 1 }}>
                      <TextField size="small" autoFocus label="Leia ou digite o código do item" value={cod} onChange={(e) => setCod(e.target.value)} fullWidth /><Button type="submit" variant="contained">Registrar</Button>
                    </Box>
                  )}
                  <StatGrid><Stat label="Esperados" value={r.esperados ?? "—"} /><Stat label="Conferidos" value={r.conferidos ?? "—"} tone="success" /><Stat label="Faltantes" value={r.faltantes?.length ?? "—"} tone={r.faltantes?.length ? "error" : "success"} /><Stat label="Emprestados" value={r.emprestadosForaDoLocal?.length ?? 0} /><Stat label="Não cadastrados" value={r.naoCadastrados?.length ?? 0} tone={r.naoCadastrados?.length ? "warning" : "default"} /></StatGrid>
                  {(r.faltantes || []).slice(0, 15).map((f: any) => <Typography key={f.id} variant="body2" color="error">Faltando: {f.codigo} — {f.descricao}</Typography>)}
                  {(r.naoCadastrados || []).map((c: string) => <Typography key={c} variant="body2" color="warning.main">Código não cadastrado: {c}</Typography>)}
                  {d.inventario.status === "ABERTO" && <Box><Button color="success" variant="contained" onClick={() => toast.run(() => eduApi.post(`/presenca/inventarios/${sel}/concluir`, {}), "Inventário concluído.", () => { det.reload(); lista.reload(); }, "Concluir o inventário?")}>Concluir</Button></Box>}
                </Box>
              );
            }}
          </Async>
        </Panel>
      )}
      {toast.node}
    </Box>
  );
}

export default function EmprestimosTab() {
  const [sub, setSub] = useState("resumo");
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <SubNav value={sub} onChange={setSub} items={[{ key: "resumo", label: "Resumo" }, { key: "emp", label: "Empréstimos" }, { key: "itens", label: "Itens" }, { key: "multas", label: "Multas e bloqueios" }, { key: "reservas", label: "Reservas" }, { key: "inv", label: "Inventário" }]} />
      {sub === "resumo" && <Resumo />}{sub === "emp" && <Emprestimos />}{sub === "itens" && <Itens />}{sub === "multas" && <Multas />}{sub === "reservas" && <Reservas />}{sub === "inv" && <Inventario />}
    </Box>
  );
}
