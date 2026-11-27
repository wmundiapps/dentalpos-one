import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Tab, Tabs, TextField, Typography } from "@mui/material";
import QRCode from "qrcode";
import { useEffect, useState, type ReactNode } from "react";
import { readSessionUser } from "../../services/DemoAccess";
import { DataList, FormDialog, J, Kpi, KpiRow, LoadBox, ResourceTab, Section, Status, call, fmtDT, fmtDate, itemsOf, label, opts, useApi, usePessoas, useRunner, useToast, type FormField, type Opt } from "./kit2";

const B = `${J}/seguranca-patrimonial`;
const P = "/seguranca-patrimonial";
const CARGOS = ["SEGURANCA", "COORDENADOR_SALAS", "COORDENADOR_PATIO", "COORDENADOR_ESTACIONAMENTO", "PORTEIRO", "COORDENADOR_PORTARIA"];
const TURNOS = ["MANHA", "TARDE", "NOITE", "INTEGRAL", "PLANTAO_12X36"];
const HORAS: Record<string, [string, string]> = { MANHA: ["06:00", "14:00"], TARDE: ["14:00", "22:00"], NOITE: ["22:00", "06:00"], INTEGRAL: ["08:00", "18:00"], PLANTAO_12X36: ["07:00", "19:00"] };
const GESTORES = ["ADMIN", "OWNER", "RECTOR", "BOARD", "FACILITIES"];
const LEITORES = [...GESTORES, "COORDINATOR", "FINANCE", "SUPPLIES", "SECRETARY", "SUPPORT", "STAFF"];
const role = () => String(readSessionUser()?.role || "").toUpperCase();

function useOpts(path: string, f: (r: any) => Opt): Opt[] { const l = useApi<any>(`${B}${path}`); return itemsOf(l.data).map(f); }

function Painel() {
  const p = useApi<any>(`${B}/painel`);
  const cob = useApi<any>(`${B}/escalas/cobertura`);
  const x = p.data, u = x?.ultimos30Dias;
  return (
    <>
      <KpiRow>
        <Kpi title="Agentes ativos" value={x?.agentesAtivos ?? "—"} /><Kpi title="Postos" value={x?.postosAtivos ?? "—"} /><Kpi title="Assiduidade (30 d)" value={u?.assiduidadePct != null ? `${u.assiduidadePct}%` : "—"} />
        <Kpi title="Faltas / atrasos" value={u ? `${u.faltas} / ${u.atrasos}` : "—"} /><Kpi title="Rondas completas" value={u ? `${u.rondasCompletas}/${u.rondas}` : "—"} /><Kpi title="Ocorrências abertas" value={u?.ocorrenciasAbertas ?? "—"} color={u?.criticas ? "#d64545" : undefined} />
        <Kpi title="Passagens sem ciência" value={x?.passagensPendentesCiencia ?? "—"} />
      </KpiRow>
      <Section title="Cobertura dos postos hoje">
        <LoadBox loading={cob.loading} error={cob.error} empty={!(cob.data?.postos ?? []).length} emptyText="Cadastre postos e escalas." onRetry={cob.reload}>
          <DataList<any> rows={(cob.data?.postos ?? []).map((q: any) => ({ ...q, id: q.postoId }))} columns={[
            { label: "Posto", primary: true, render: (q) => q.nome }, { label: "Mínimo", render: (q) => q.efetivoMinimo }, { label: "Escalados", render: (q) => q.escalados }, { label: "Cobertura", render: (q) => <Status value={q.descoberto ? "CRITICO" : "ATIVO"} /> },
          ]} />
        </LoadBox>
      </Section>
    </>
  );
}

function QrCheckpoint({ c, onClose }: { c: any; onClose: () => void }) {
  const [img, setImg] = useState("");
  useEffect(() => { if (c) QRCode.toDataURL(c.token, { width: 320, margin: 1 }).then(setImg).catch(() => setImg("")); }, [c]);
  return (
    <Dialog open={!!c} onClose={onClose}><DialogTitle>{c?.nome}</DialogTitle>
      <DialogContent sx={{ textAlign: "center" }}>{img ? <img src={img} alt={`QR ${c?.nome}`} width={280} /> : <CircularProgress />}<Typography variant="caption" component="div"><code>{c?.token}</code></Typography></DialogContent>
      <DialogActions><Button onClick={() => window.print()}>Imprimir</Button><Button onClick={onClose}>Fechar</Button></DialogActions></Dialog>
  );
}

function Rondas({ postos }: { postos: Opt[] }) {
  const [rev, setRev] = useState(0);
  const [tok, setTok] = useState("");
  const [obs, setObs] = useState("");
  const [anorm, setAnorm] = useState(false);
  const { toast, node } = useToast();
  const eu = useApi<any>(`${B}/eu`, [rev]);
  const list = useApi<any>(`${B}/rondas?pageSize=15`, [rev]);
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const [posto, setPosto] = useState("");
  const em = eu.data?.rondaEmAndamento;
  const sou = eu.data?.agente;
  return (
    <>
      {node}
      <Section title="Ronda com checkpoints QR">
        {!sou ? <Alert severity="info">Seu usuário não está vinculado a um agente. A gestão pode iniciar rondas informando o agente via API; os registros abaixo mostram as rondas realizadas.</Alert> : em ? (
          <Box>
            <Alert severity="success" sx={{ mb: 1.5 }}>Ronda em andamento desde {fmtDT(em.inicio)} — {em.lidos}/{em.esperados} checkpoints.</Alert>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "2fr 2fr auto" }, gap: 1, alignItems: "center" }}>
              <TextField size="small" label="Código do QR lido" value={tok} onChange={(e) => setTok(e.target.value.trim())} />
              <TextField size="small" label="Observação" value={obs} onChange={(e) => setObs(e.target.value)} />
              <Button variant="contained" disabled={tok.length < 4} onClick={() => run(async () => { await call("POST", `${B}/rondas/${em.id}/leitura`, { token: tok, observacao: obs || undefined, anormalidade: anorm }); setTok(""); setObs(""); setAnorm(false); }, "Checkpoint registrado.")}>Registrar</Button>
            </Box>
            <Button size="small" color={anorm ? "error" : "inherit"} onClick={() => setAnorm(!anorm)} sx={{ mt: 1 }}>{anorm ? "Anormalidade marcada (gera ocorrência)" : "Marcar anormalidade"}</Button>
            <Button sx={{ mt: 1, ml: 1 }} variant="outlined" onClick={() => run(() => call("POST", `${B}/rondas/${em.id}/encerrar`, {}), "Ronda encerrada.", "Encerrar a ronda?")}>Encerrar ronda</Button>
          </Box>
        ) : (
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
            <TextField select size="small" label="Posto (opcional)" value={posto} onChange={(e) => setPosto(e.target.value)} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} sx={{ minWidth: 220 }}><option value="">Todos os checkpoints</option>{postos.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</TextField>
            <Button variant="contained" onClick={() => run(() => call("POST", `${B}/rondas`, { postoId: posto || undefined }), "Ronda iniciada.")}>Iniciar ronda</Button>
          </Box>
        )}
      </Section>
      <Section title="Rondas recentes">
        <LoadBox loading={list.loading} error={list.error} empty={!itemsOf(list.data).length} emptyText="Sem rondas." onRetry={list.reload}>
          <DataList<any> rows={itemsOf(list.data)} columns={[{ label: "Início", primary: true, render: (r) => fmtDT(r.inicio) }, { label: "Fim", render: (r) => fmtDT(r.fim) }, { label: "Checkpoints", render: (r) => `${r.lidos}/${r.esperados}` }, { label: "Situação", render: (r) => <Status value={r.status} /> }]} />
        </LoadBox>
      </Section>
    </>
  );
}

export default function SegurancaTab() {
  const [sub, setSub] = useState(0);
  const [rev, setRev] = useState(0);
  const [dlg, setDlg] = useState<null | { kind: string; row?: any }>(null);
  const [qr, setQr] = useState<any>(null);
  const pessoas = usePessoas();
  const postos = useOpts("/postos?pageSize=100&ativo=true", (p) => ({ value: p.id, label: `${p.codigo} · ${p.nome}` }));
  const agentes = useOpts("/agentes?pageSize=200&ativo=true", (a) => ({ value: a.id, label: `${a.nome} (${label(a.cargo)})` }));
  const gestor = GESTORES.includes(role());
  const leitor = LEITORES.includes(role());
  if (!leitor) return <Alert severity="info">A área de segurança patrimonial é restrita à equipe de infraestrutura, segurança e coordenação.</Alert>;
  const bump = () => setRev((x) => x + 1);
  const nomeAg = Object.fromEntries(agentes.map((a) => [a.value, a.label])); const nomePosto = Object.fromEntries(postos.map((p) => [p.value, p.label]));
  const telas: Array<{ k: string; l: string; el: ReactNode }> = [
    { k: "painel", l: "Painel", el: <Painel /> },
    { k: "postos", l: "Postos", el: <ResourceTab title="Postos (portaria, pátio, estacionamento, salas)" path={`${P}/postos`} newLabel="Novo posto" editable={false} canCreate={gestor} extraQuery="" refreshKey={rev}
      fields={[{ key: "codigo", label: "Código", required: true }, { key: "nome", label: "Nome", required: true }, { key: "tipo", label: "Tipo", type: "select", required: true, options: opts(["PORTARIA", "PATIO", "ESTACIONAMENTO", "SALAS", "RONDA_MOVEL"]) }, { key: "efetivoMinimo", label: "Efetivo mínimo", type: "number" }]}
      columns={[{ label: "Posto", primary: true, render: (p) => `${p.codigo} · ${p.nome}` }, { label: "Tipo", render: (p) => label(p.tipo) }, { label: "Efetivo mínimo", render: (p) => p.efetivoMinimo }, { label: "Situação", render: (p) => <Status value={p.ativo ? "ATIVO" : "INATIVO"} /> }]} /> },
    { k: "agentes", l: "Seguranças e coordenadores", el: <ResourceTab title="Seguranças e coordenadores (salas, pátio, estacionamento, portaria)" path={`${P}/agentes`} newLabel="Novo agente" canCreate={gestor} editable={gestor} refreshKey={rev}
      intro={<Alert severity="info" sx={{ mb: 1.5 }}>O vínculo com o cadastro do RH é pelo ID do colaborador; sem RH, use o usuário do sistema.</Alert>}
      fields={[{ key: "nome", label: "Nome", required: true, full: true }, { key: "cargo", label: "Cargo", type: "select", required: true, options: opts(CARGOS) }, { key: "userId", label: "Usuário do sistema", type: "select", options: pessoas }, { key: "colaboradorId", label: "ID do colaborador (RH)" },
        { key: "matricula", label: "Matrícula" }, { key: "terceirizado", label: "Terceirizado", type: "bool" }, { key: "empresa", label: "Empresa" }, { key: "telefone", label: "Telefone" }]}
      filters={[{ key: "cargo", label: "Cargo", options: opts(CARGOS) }]}
      columns={[{ label: "Nome", primary: true, render: (a) => a.nome }, { label: "Cargo", render: (a) => label(a.cargo) }, { label: "Vínculo", hideOnMobile: true, render: (a) => (a.colaboradorId ? "RH" : a.userId ? "Usuário" : "—") }, { label: "Terceirizado", hideOnMobile: true, render: (a) => (a.terceirizado ? a.empresa || "sim" : "não") }, { label: "Situação", render: (a) => <Status value={a.ativo ? "ATIVO" : "INATIVO"} /> }]} /> },
    { k: "escalas", l: "Escalas e plantões", el: <ResourceTab title="Escala de plantão" path={`${P}/escalas`} newLabel="Nova escala" editable={false} canCreate={gestor} refreshKey={rev} pageSize={25}
      extraActions={gestor ? <Button onClick={() => setDlg({ kind: "lote" })}>Escala em lote</Button> : undefined}
      fields={ESCALA_FIELDS(postos, agentes)} filters={[{ key: "postoId", label: "Posto", options: postos }, { key: "agenteId", label: "Agente", options: agentes }, { key: "status", label: "Situação", options: opts(["PREVISTA", "CUMPRIDA", "FALTA", "TROCA", "ATRASO"]) }]}
      columns={[{ label: "Data", primary: true, render: (e) => `${fmtDate(e.data)} ${e.inicio}-${e.fim}` }, { label: "Posto", render: (e) => e.postoNome }, { label: "Agente", render: (e) => e.agenteNome }, { label: "Turno", hideOnMobile: true, render: (e) => label(e.turno) }, { label: "Entrada/saída", hideOnMobile: true, render: (e) => `${e.entradaEm ? new Date(e.entradaEm).toLocaleTimeString("pt-BR", { timeStyle: "short" }) : "—"} / ${e.saidaEm ? new Date(e.saidaEm).toLocaleTimeString("pt-BR", { timeStyle: "short" }) : "—"}` }, { label: "Situação", render: (e) => <Status value={e.status} /> }]}
      rowActions={(e, { run }) => [
        { label: "Registrar entrada", show: !e.entradaEm && e.status === "PREVISTA", onClick: () => { void run(() => call("POST", `${B}/escalas/${e.id}/ponto`, { acao: "ENTRADA" }), "Entrada registrada."); } },
        { label: "Registrar saída", show: !!e.entradaEm && !e.saidaEm, onClick: () => { void run(() => call("POST", `${B}/escalas/${e.id}/ponto`, { acao: "SAIDA" }), "Saída registrada."); } },
        { label: "Marcar falta", color: "error", show: gestor && !e.entradaEm && e.status === "PREVISTA", onClick: () => { void run(() => call("POST", `${B}/escalas/${e.id}/falta`, {}), "Falta registrada.", "Registrar falta?"); } },
        { label: "Trocar agente", show: gestor && !e.entradaEm && e.status === "PREVISTA", onClick: () => setDlg({ kind: "troca", row: e }) },
      ]} /> },
    { k: "rondas", l: "Rondas e checkpoints", el: <><Rondas postos={postos} />
      <ResourceTab title="Checkpoints (QR)" path={`${P}/checkpoints`} newLabel="Novo checkpoint" editable={false} canCreate={gestor} refreshKey={rev}
        fields={[{ key: "nome", label: "Nome do ponto", required: true, full: true }, { key: "postoId", label: "Posto", type: "select", options: postos }, { key: "ordem", label: "Ordem", type: "number" }]}
        columns={[{ label: "Ponto", primary: true, render: (c) => c.nome }, { label: "Posto", render: (c) => nomePosto[c.postoId] || "—" }, { label: "Ordem", render: (c) => c.ordem }, { label: "Ativo", render: (c) => (c.ativo ? "sim" : "não") }]}
        rowActions={(c) => [{ label: "Ver / imprimir QR", onClick: () => setQr(c) }]} /></> },
    { k: "ocorrencias", l: "Ocorrências", el: <ResourceTab title="Ocorrências de segurança" path={`${P}/ocorrencias`} newLabel="Registrar ocorrência" editable={false} anexoRef="OcorrenciaSeg" refreshKey={rev}
      fields={[{ key: "tipo", label: "Tipo", type: "select", required: true, options: opts(["FURTO", "DANO", "ACESSO_INDEVIDO", "BRIGA", "INCENDIO", "ACIDENTE", "VEICULO", "ALARME", "OUTRO"]) }, { key: "gravidade", label: "Gravidade", type: "select", options: opts(["BAIXA", "MEDIA", "ALTA", "CRITICA"]) },
        { key: "descricao", label: "Descrição", type: "textarea", required: true, full: true }, { key: "local", label: "Local" }, { key: "postoId", label: "Posto", type: "select", options: postos }]}
      filters={[{ key: "status", label: "Situação", options: opts(["ABERTA", "EM_APURACAO", "ENCAMINHADA", "ENCERRADA"]) }, { key: "gravidade", label: "Gravidade", options: opts(["BAIXA", "MEDIA", "ALTA", "CRITICA"]) }]}
      columns={[{ label: "Ocorrência", primary: true, render: (o) => <><b>{label(o.tipo)}</b> {o.numero}<Typography variant="caption" component="div" color="text.secondary">{o.descricao.slice(0, 90)}</Typography></> }, { label: "Quando", render: (o) => fmtDT(o.ocorridaEm) }, { label: "Agente", hideOnMobile: true, render: (o) => nomeAg[o.agenteId] || "—" }, { label: "Gravidade", render: (o) => <Status value={o.gravidade} /> }, { label: "Situação", render: (o) => <Status value={o.status} /> }]}
      rowActions={(o) => [{ label: "Atualizar situação", show: gestor && o.status !== "ENCERRADA", onClick: () => setDlg({ kind: "ocorrencia", row: o }) }]} /> },
    { k: "passagens", l: "Passagem de serviço", el: <ResourceTab title="Passagem de serviço" path={`${P}/passagens`} newLabel="Nova passagem" editable={false} refreshKey={rev}
      fields={[{ key: "postoId", label: "Posto", type: "select", required: true, options: postos }, { key: "paraAgenteId", label: "Quem assume", type: "select", required: true, options: agentes }, { key: "resumo", label: "Resumo do turno", type: "textarea", required: true, full: true }, { key: "pendencias", label: "Pendências", type: "textarea", full: true }, { key: "chaves", label: "Chaves / equipamentos" }]}
      columns={[{ label: "Posto", primary: true, render: (p) => nomePosto[p.postoId] || "—" }, { label: "De", render: (p) => nomeAg[p.deAgenteId] || "—" }, { label: "Para", render: (p) => nomeAg[p.paraAgenteId] || "—" }, { label: "Em", render: (p) => fmtDT(p.createdAt) }, { label: "Ciência", render: (p) => <Status value={p.status === "RECEBIDA" ? "RECEBIDA" : "AGUARDANDO"} /> }]}
      rowActions={(p, { run }) => [{ label: "Dar ciência", show: p.status !== "RECEBIDA", onClick: () => { void run(() => call("POST", `${B}/passagens/${p.id}/ciencia`, {}), "Ciência registrada."); } }]} /> },
  ];
  const t = telas[Math.min(sub, telas.length - 1)];
  const R = dlg?.row;
  const fin = async (path: string, body: any) => { await call("POST", `${B}${path}`, body); setDlg(null); bump(); };
  return (
    <>
      <Tabs value={Math.min(sub, telas.length - 1)} onChange={(_, v) => setSub(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>{telas.map((x) => <Tab key={x.k} label={x.l} sx={{ textTransform: "none", fontWeight: 700 }} />)}</Tabs>
      <Box key={t.k + rev}>{t.el}</Box>
      <QrCheckpoint c={qr} onClose={() => setQr(null)} />
      <FormDialog open={dlg?.kind === "lote"} title="Escala em lote" onClose={() => setDlg(null)} maxWidth="sm" fields={[
        { key: "postoId", label: "Posto", type: "select", required: true, options: postos }, { key: "agenteId", label: "Agente", type: "select", required: true, options: agentes }, { key: "turno", label: "Turno", type: "select", required: true, options: opts(TURNOS) },
        { key: "de", label: "De", type: "date", required: true }, { key: "ate", label: "Até", type: "date", required: true }, { key: "diasSemana", label: "Dias da semana (0=dom … 6=sáb, separados por vírgula)", type: "list", helper: "Vazio = todos os dias (12x36 alterna os dias)." }]}
        onSubmit={async (b, raw) => { const t0 = HORAS[b.turno] ?? ["08:00", "18:00"]; const r: any = await call("POST", `${B}/escalas/lote`, { ...b, de: String(raw.de).slice(0, 10), ate: String(raw.ate).slice(0, 10), inicio: t0[0], fim: t0[1], diasSemana: Array.isArray(b.diasSemana) ? b.diasSemana.map(Number) : undefined }); setDlg(null); bump(); window.alert(`${r.criadas} escalas criadas${r.conflitos.length ? `; ${r.conflitos.length} conflitos ignorados` : ""}.`); }} />
      <FormDialog open={dlg?.kind === "troca"} title="Trocar agente do plantão" onClose={() => setDlg(null)} maxWidth="sm" fields={[{ key: "novoAgenteId", label: "Novo agente", type: "select", required: true, options: agentes }]} onSubmit={(b) => fin(`/escalas/${R.id}/troca`, b)} />
      <FormDialog open={dlg?.kind === "ocorrencia"} title="Atualizar ocorrência" onClose={() => setDlg(null)} maxWidth="sm" fields={[{ key: "status", label: "Situação", type: "select", required: true, options: opts(["EM_APURACAO", "ENCAMINHADA", "ENCERRADA"]) }, { key: "encaminhamento", label: "Encaminhamento", type: "textarea", full: true }]} onSubmit={(b) => fin(`/ocorrencias/${R.id}/status`, b)} />
    </>
  );
}

const ESCALA_FIELDS = (postos: Opt[], agentes: Opt[]): FormField[] => [
  { key: "data", label: "Data", type: "date", required: true }, { key: "postoId", label: "Posto", type: "select", required: true, options: postos }, { key: "agenteId", label: "Agente", type: "select", required: true, options: agentes },
  { key: "turno", label: "Turno", type: "select", required: true, options: opts(TURNOS) }, { key: "inicio", label: "Início (HH:MM)", required: true }, { key: "fim", label: "Fim (HH:MM)", required: true },
];
