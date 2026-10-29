import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useState } from "react";
import {
  Acoes, ActionsMenu, Aviso, type Col, DataList, Etiqueta, FormDialog, LoadBox, Pick, Section, Status, cp, fmtDateTime, hojeIso, itemsOf, localInput, perfil, useCp, useCursosOpts, useEquipe, useRunner, useToast, type Opt,
} from "./kit";

export default function AgendaTab() {
  const [sub, setSub] = useState("agenda");
  const pf = perfil();
  return (
    <>
      <ToggleButtonGroup exclusive size="small" value={sub} onChange={(_, v) => v && setSub(v)} sx={{ mb: 2, flexWrap: "wrap" }}>
        <ToggleButton value="agenda">Agenda de atendimentos</ToggleButton>
        {pf.recepcao && <ToggleButton value="fila">Fila de espera</ToggleButton>}
      </ToggleButtonGroup>
      {sub === "agenda" ? <Agenda /> : <Fila />}
    </>
  );
}

const STATUS_COR: Record<string, "default" | "success" | "warning" | "error" | "info"> = { AGENDADO: "info", CONFIRMADO: "success", CHEGOU: "warning", EM_ATENDIMENTO: "warning", REALIZADO: "success", FALTOU: "error", CANCELADO: "default", REMARCADO: "default" };

function Agenda() {
  const pf = perfil();
  const [unidade, setUnidade] = useState("");
  const [de, setDe] = useState(hojeIso());
  const [dias, setDias] = useState("7");
  const [status, setStatus] = useState("");
  const [rev, setRev] = useState(0);
  const [novo, setNovo] = useState(false);
  const [dlg, setDlg] = useState<null | { tipo: string; c: any }>(null);
  const { toast, node } = useToast();
  const reload = () => setRev((x) => x + 1);
  const run = useRunner(toast, reload);
  const un = useCp<any>("/clinicas/unidades?pageSize=100");
  const unOpts: Opt[] = itemsOf(un.data).map((u: any) => ({ value: u.id, label: u.nome }));
  const ate = new Date(new Date(`${de}T00:00:00`).getTime() + Number(dias) * 86_400_000).toISOString();
  const l = useCp<any>(`/clinicas/agenda?pageSize=200&de=${new Date(`${de}T00:00:00`).toISOString()}&ate=${ate}${unidade ? `&unidadeId=${unidade}` : ""}${status ? `&status=${status}` : ""}`, [rev]);
  const rows = itemsOf(l.data);
  const cols: Col[] = [
    { label: "Horário", primary: true, render: (c) => `${fmtDateTime(c.inicio)} – ${new Date(c.fim).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` },
    { label: pf.aluno ? "Paciente" : "Paciente / tutor", render: (c) => <>{c.paciente}{c.animal ? ` · ${c.animal.nome} (${String(c.animal.especie).toLowerCase()})` : ""}</> },
    { label: "Unidade", render: (c) => `${c.unidade} · ${c.consultorio}` },
    { label: "Supervisor", render: (c) => c.supervisor },
    { label: "Estagiário", render: (c) => c.aluno ?? "—" },
    { label: "Situação", render: (c) => <Etiqueta t={c.status.replace(/_/g, " ")} color={STATUS_COR[c.status]} /> },
  ];
  const ativa = (c: any) => ["AGENDADO", "CONFIRMADO", "CHEGOU"].includes(c.status);
  return (
    <Section title="Agenda por supervisor e aluno-estagiário" actions={pf.operacao ? <Button size="small" variant="contained" onClick={() => setNovo(true)}>Novo agendamento</Button> : undefined}>
      {node}
      <Aviso>Regra de supervisão: o aluno só atende com o supervisor escalado no mesmo horário e unidade. Conflitos de sala, supervisor, aluno e paciente são bloqueados.</Aviso>
      <Acoes>
        <Pick label="Unidade" value={unidade} onChange={setUnidade} all="Todas" options={unOpts} />
        <TextField size="small" type="date" label="A partir de" value={de} onChange={(e) => setDe(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <Pick label="Período" value={dias} onChange={setDias} minWidth={130} options={[{ value: "1", label: "1 dia" }, { value: "7", label: "7 dias" }, { value: "30", label: "30 dias" }]} />
        <Pick label="Situação" value={status} onChange={setStatus} all="Todas" minWidth={150} options={Object.keys(STATUS_COR).map((s) => ({ value: s, label: s.replace(/_/g, " ").toLowerCase() }))} />
      </Acoes>
      <LoadBox loading={l.loading} error={l.error} onRetry={l.reload} empty={!rows.length} emptyText="Nenhum atendimento neste período.">
        <DataList rows={rows} columns={cols} actions={(c) => (
          <ActionsMenu items={[
            { label: "Confirmar", show: pf.operacao && c.status === "AGENDADO", onClick: () => run(() => cp("POST", `/clinicas/agenda/${c.id}/confirmar`), "Atendimento confirmado.") },
            { label: "Enviar lembrete", show: pf.operacao && ["AGENDADO", "CONFIRMADO"].includes(c.status), onClick: () => run(() => cp("POST", `/clinicas/agenda/${c.id}/lembrete`), "Lembrete enviado (caixa de saída).") },
            { label: "Registrar chegada", show: pf.recepcao && ["AGENDADO", "CONFIRMADO"].includes(c.status), onClick: () => run(() => cp("POST", `/clinicas/agenda/${c.id}/chegada`), "Chegada registrada.") },
            { label: "Iniciar atendimento", show: !pf.recepcao || pf.gestor ? ativa(c) : false, onClick: () => run(() => cp("POST", `/clinicas/agenda/${c.id}/iniciar`), "Atendimento iniciado.") },
            { label: "Registro do atendimento", show: !pf.secretaria || pf.gestor ? ["EM_ATENDIMENTO", "REALIZADO"].includes(c.status) : false, onClick: () => setDlg({ tipo: "registros", c }) },
            { label: "Finalizar (supervisor)", show: pf.professor && c.status === "EM_ATENDIMENTO", onClick: () => run(() => cp("POST", `/clinicas/agenda/${c.id}/finalizar`), "Atendimento finalizado.") },
            { label: "Registrar falta", show: pf.operacao && ["AGENDADO", "CONFIRMADO"].includes(c.status), onClick: () => run(() => cp("POST", `/clinicas/agenda/${c.id}/falta`, {}), "Falta registrada.", "Registrar falta do paciente?") },
            { label: "Remarcar", show: pf.operacao && ["AGENDADO", "CONFIRMADO"].includes(c.status), onClick: () => setDlg({ tipo: "remarcar", c }) },
            { label: "Cancelar", color: "error", show: pf.operacao && ativa(c), onClick: () => setDlg({ tipo: "cancelar", c }) },
          ]} />
        )} />
      </LoadBox>
      {novo && <NovoAgendamento onClose={() => setNovo(false)} onDone={reload} unidades={unOpts} />}
      {dlg?.tipo === "cancelar" && <FormDialog open title="Cancelar atendimento" fields={[{ key: "motivo", label: "Motivo", type: "textarea", required: true }]} onClose={() => setDlg(null)}
        onSubmit={async (b) => { const r = await cp("POST", `/clinicas/agenda/${dlg.c.id}/cancelar`, b); toast({ type: "success", text: r.filaChamada ? "Cancelado. O primeiro da fila de espera foi chamado." : "Atendimento cancelado." }); reload(); }} />}
      {dlg?.tipo === "remarcar" && <FormDialog open title="Remarcar atendimento" fields={[{ key: "inicio", label: "Novo início", type: "datetime", required: true }, { key: "fim", label: "Novo fim", type: "datetime", required: true }]} initial={{ inicio: localInput(new Date(dlg.c.inicio).getTime()), fim: localInput(new Date(dlg.c.fim).getTime()) }} onClose={() => setDlg(null)}
        onSubmit={async (b) => { await cp("POST", `/clinicas/agenda/${dlg.c.id}/remarcar`, b); toast({ type: "success", text: "Atendimento remarcado." }); reload(); }} />}
      {dlg?.tipo === "registros" && <Registros c={dlg.c} onClose={() => { setDlg(null); reload(); }} />}
    </Section>
  );
}

function NovoAgendamento({ onClose, onDone, unidades }: { onClose: () => void; onDone: () => void; unidades: Opt[] }) {
  const [vals, setVals] = useState<Record<string, any>>({});
  const eq = useEquipe();
  const salas = useCp<any>(vals.unidadeId ? `/clinicas/consultorios?unidadeId=${vals.unidadeId}&pageSize=100` : null);
  const pacs = useCp<any>("/clinicas/pacientes?pageSize=200&consentimento=ATIVO");
  const animais = useCp<any>(vals.pacienteId ? `/animal/animais?tutorId=${vals.pacienteId}&pageSize=50` : null);
  const pacOpts: Opt[] = itemsOf(pacs.data).map((p: any) => ({ value: p.id, label: `${p.nome} · ${p.tipo === "TUTOR" ? "tutor" : "paciente"}${p.cpf ? " · " + p.cpf : ""}` }));
  return (
    <FormDialog open title="Novo agendamento" maxWidth="md" submitLabel="Agendar" onClose={onClose} onValues={setVals}
      intro={<Aviso>Somente pacientes com consentimento (LGPD) ativo aparecem na lista.</Aviso>}
      fields={[
        { key: "unidadeId", label: "Unidade", type: "select", required: true, options: unidades },
        { key: "consultorioId", label: "Consultório / sala", type: "select", required: true, options: itemsOf(salas.data).map((s: any) => ({ value: s.id, label: s.nome })) },
        { key: "pacienteId", label: "Paciente ou tutor", type: "select", required: true, options: pacOpts, full: true },
        { key: "animalId", label: "Animal (hospital veterinário)", type: "select", options: itemsOf(animais.data).map((a: any) => ({ value: a.id, label: `${a.nome} (${String(a.especie).toLowerCase()})` })) },
        { key: "supervisorUserId", label: "Supervisor", type: "select", required: true, options: eq.opts },
        { key: "alunoStudentId", label: "Aluno-estagiário (opcional)", type: "student" },
        { key: "categoria", label: "Tipo", type: "select", required: true, options: ["TRIAGEM", "CONSULTA", "RETORNO", "AVALIACAO", "PROCEDIMENTO", "VACINACAO", "CIRURGIA"] },
        { key: "inicio", label: "Início", type: "datetime", required: true }, { key: "fim", label: "Fim", type: "datetime", required: true },
        { key: "local", label: "Local (atendimento a campo)" },
      ]}
      initial={{ categoria: "CONSULTA" }}
      onSubmit={async (b) => { await cp("POST", "/clinicas/agenda", { ...b, inicio: b.inicio, fim: b.fim }); onDone(); }} />
  );
}

function Registros({ c, onClose }: { c: any; onClose: () => void }) {
  const pf = perfil();
  const [motivo, setMotivo] = useState("");
  const [consulta, setConsulta] = useState("");
  const [rev, setRev] = useState(0);
  const [novo, setNovo] = useState(false);
  const l = useCp<any>(`/clinicas/agenda/${c.id}/registros${consulta ? `?motivo=${encodeURIComponent(consulta)}` : ""}`, [rev]);
  const items = itemsOf(l.data);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Registro do atendimento — {c.paciente}</DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>Conteúdo cifrado e protegido por nível de confidencialidade. Todo acesso é registrado (LGPD, art. 11).</Alert>
        <LoadBox loading={l.loading} error={l.error} onRetry={l.reload} empty={!items.length} emptyText="Nenhum registro neste atendimento.">
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.2 }}>
            {items.map((r: any) => (
              <Box key={r.id} sx={{ p: 1.5, border: 1, borderColor: r.bloqueado ? "warning.main" : "divider", borderRadius: 2 }}>
                <Box sx={{ display: "flex", gap: 1, mb: 0.5 }}><Etiqueta t={r.nivel} color={r.nivel === "SIGILOSO" ? "error" : r.nivel === "RESTRITO" ? "warning" : "default"} />{r.quebraDeSigilo && <Etiqueta t="acesso excepcional" color="error" />}{r.revisado && <Etiqueta t="revisado" color="success" />}</Box>
                {r.bloqueado ? <Typography variant="body2" color="text.secondary">{r.mensagem}</Typography> : <><Typography variant="body2">{r.resumo}</Typography>{r.conduta && <Typography variant="caption" color="text.secondary">Conduta: {r.conduta}</Typography>}</>}
              </Box>
            ))}
          </Box>
        </LoadBox>
        {pf.gestor && items.some((r: any) => r.bloqueado) && (
          <Box sx={{ mt: 2, display: "flex", gap: 1, flexWrap: "wrap" }}>
            <TextField size="small" fullWidth label="Justificativa para acesso excepcional (mín. 15 caracteres)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            <Button variant="outlined" disabled={motivo.trim().length < 15} onClick={() => { setConsulta(motivo.trim()); setRev((x) => x + 1); }}>Acessar com justificativa</Button>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {(pf.professor || pf.aluno) && ["EM_ATENDIMENTO", "REALIZADO"].includes(c.status) && <Button onClick={() => setNovo(true)}>Novo registro</Button>}
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
      {novo && <FormDialog open title="Novo registro" fields={[{ key: "resumo", label: "Resumo do atendimento (somente o necessário)", type: "textarea", required: true }, { key: "conduta", label: "Conduta / encaminhamento" }, { key: "nivel", label: "Nível de confidencialidade", type: "select", required: true, options: pf.aluno ? ["NORMAL", "RESTRITO"] : ["NORMAL", "RESTRITO", "SIGILOSO"] }]} initial={{ nivel: "NORMAL" }} onClose={() => setNovo(false)} onSubmit={async (b) => { await cp("POST", `/clinicas/agenda/${c.id}/registro`, b); setRev((x) => x + 1); }} />}
    </Dialog>
  );
}

function Fila() {
  const [rev, setRev] = useState(0);
  const [novo, setNovo] = useState(false);
  const [ag, setAg] = useState<any>(null);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const eq = useEquipe();
  const l = useCp<any>("/clinicas/fila", [rev]);
  const pacs = useCp<any>("/clinicas/pacientes?pageSize=200&consentimento=ATIVO");
  const un = useCp<any>("/clinicas/unidades?pageSize=100");
  const salas = useCp<any>(ag ? `/clinicas/consultorios?pageSize=100${ag.unidadeId ? `&unidadeId=${ag.unidadeId}` : ""}` : null);
  const cursosOpts = useCursosOpts();
  const rows = itemsOf(l.data);
  const pacOpts: Opt[] = itemsOf(pacs.data).map((p: any) => ({ value: p.id, label: p.nome }));
  const unOpts: Opt[] = itemsOf(un.data).map((u: any) => ({ value: u.id, label: u.nome }));
  return (
    <Section title="Fila de espera" actions={<Button size="small" variant="contained" onClick={() => setNovo(true)}>Incluir na fila</Button>}>
      {node}
      <LoadBox loading={l.loading} error={l.error} onRetry={l.reload} empty={!rows.length} emptyText="Fila vazia.">
        <DataList rows={rows} columns={[
          { label: "#", render: (r) => r.posicao }, { label: "Paciente", primary: true, render: (r) => r.paciente }, { label: "Curso", render: (r) => r.curso },
          { label: "Prioridade", render: (r) => <Etiqueta t={r.prioridade} color={r.prioridade === "URGENTE" ? "error" : r.prioridade === "ALTA" ? "warning" : "default"} /> },
          { label: "Espera", render: (r) => `${r.esperaDias} dia(s)` }, { label: "Situação", render: (r) => <Status value={r.status} /> },
        ]} actions={(r) => (
          <ActionsMenu items={[
            { label: "Agendar", onClick: () => setAg(r) },
            { label: "Desistiu", color: "error", onClick: () => run(() => cp("POST", `/clinicas/fila/${r.id}/desistir`), "Removido da fila.", "Marcar como desistência?") },
          ]} />
        )} />
      </LoadBox>
      {novo && <FormDialog open title="Incluir na fila de espera" submitLabel="Incluir" onClose={() => setNovo(false)}
        fields={[{ key: "pacienteId", label: "Paciente", type: "select", required: true, options: pacOpts, full: true }, { key: "programId", label: "Curso", type: "select", required: true, options: cursosOpts }, { key: "unidadeId", label: "Unidade preferencial", type: "select", options: unOpts }, { key: "prioridade", label: "Prioridade", type: "select", required: true, options: ["NORMAL", "ALTA", "URGENTE"] }, { key: "observacao", label: "Observação", type: "textarea" }]}
        initial={{ prioridade: "NORMAL" }} onSubmit={async (b) => { await cp("POST", "/clinicas/fila", b); setRev((x) => x + 1); }} />}
      {ag && <FormDialog open title={`Agendar ${ag.paciente}`} submitLabel="Agendar" onClose={() => setAg(null)}
        fields={[{ key: "unidadeId", label: "Unidade", type: "select", required: true, options: unOpts }, { key: "consultorioId", label: "Consultório", type: "select", required: true, options: itemsOf(salas.data).map((s: any) => ({ value: s.id, label: s.nome })) }, { key: "supervisorUserId", label: "Supervisor", type: "select", required: true, options: eq.opts }, { key: "alunoStudentId", label: "Aluno-estagiário", type: "student" }, { key: "inicio", label: "Início", type: "datetime", required: true }, { key: "fim", label: "Fim", type: "datetime", required: true }]}
        initial={{ unidadeId: ag.unidadeId ?? "" }} onValues={(v) => { if (v.unidadeId !== ag.unidadeId) setAg((x: any) => ({ ...x, unidadeId: v.unidadeId })); }}
        onSubmit={async (b) => { await cp("POST", `/clinicas/fila/${ag.id}/agendar`, b); setRev((x) => x + 1); }} />}
    </Section>
  );
}
