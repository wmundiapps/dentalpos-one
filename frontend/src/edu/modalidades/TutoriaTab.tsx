import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, MenuItem, Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import EduResourcePage, { StatusChip } from "../EduResourcePage";
import { Card, Loadable, Section, Semaforo, fmtDT, itemsOf, nameOf, useAsync, usePolos, usePrograms, useTutores } from "./kit";

const BASE = "/modalidades";
const slaNivel = (e?: string) => (e === "VENCIDO" || e === "VIOLADO" ? "critico" : e === "EM_RISCO" ? "atencao" : "ok") as "ok" | "atencao" | "critico";

function Atendimento({ id, onClose, onChanged, tutores }: { id: string; onClose: () => void; onChanged: () => void; tutores: Array<{ value: string; label: string }> }) {
  const { data, loading, error, reload } = useAsync(() => eduApi.get(`${BASE}/atendimentos/${id}`), [id]);
  const [texto, setTexto] = useState(""); const [tutor, setTutor] = useState(""); const [err, setErr] = useState<string | null>(null);
  async function run(fn: () => Promise<any>) { try { await fn(); setErr(null); reload(); onChanged(); } catch (e: any) { setErr(e.message); } }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{data?.assunto || "Atendimento"} {data ? <StatusChip value={data.status} /> : null}</DialogTitle>
      <DialogContent dividers>
        <Loadable loading={loading} error={error}>
          {err ? <Alert severity="error" sx={{ mb: 1 }} onClose={() => setErr(null)}>{err}</Alert> : null}
          {(data?.mensagens || []).map((m: any) => (
            <Paper key={m.id} variant="outlined" sx={{ p: 1.2, mb: 1, borderRadius: 2, ml: m.autorTipo === "ALUNO" ? 0 : 4, mr: m.autorTipo === "ALUNO" ? 4 : 0, bgcolor: m.autorTipo === "ALUNO" ? "action.hover" : "background.paper" }}>
              <Typography variant="caption" color="text.secondary">{m.autorTipo} · {fmtDT(m.createdAt)}</Typography>
              <Typography sx={{ whiteSpace: "pre-wrap" }}>{m.texto}</Typography>
            </Paper>
          ))}
          {data && data.status !== "ENCERRADO" ? (
            <Box sx={{ mt: 2 }}>
              <TextField fullWidth multiline minRows={2} label="Responder" value={texto} onChange={(e) => setTexto(e.target.value)} />
              <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap", alignItems: "center" }}>
                <Button variant="contained" disabled={!texto.trim()} onClick={() => run(async () => { await eduApi.post(`${BASE}/atendimentos/${id}/mensagens`, { texto }); setTexto(""); })}>Enviar</Button>
                <TextField select size="small" label="Reatribuir a" value={tutor} onChange={(e) => setTutor(e.target.value)} sx={{ minWidth: 200 }}>{tutores.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}</TextField>
                <Button disabled={!tutor} onClick={() => run(() => eduApi.post(`${BASE}/atendimentos/${id}/reatribuir`, { tutorId: tutor }))}>Reatribuir</Button>
                <Button color="success" onClick={() => { if (window.confirm("Encerrar este atendimento?")) run(() => eduApi.post(`${BASE}/atendimentos/${id}/encerrar`, {})); }}>Encerrar</Button>
              </Box>
            </Box>
          ) : null}
        </Loadable>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

function Relacao() {
  const [mod, setMod] = useState("EAD");
  const { data, loading, error } = useAsync(() => eduApi.get(`${BASE}/relacao-aluno-tutor?modalidade=${mod}`), [mod]);
  const nivel = data?.status === "CRITICO" ? "critico" : data?.status === "ATENCAO" ? "atencao" : "ok";
  return (
    <Section title="Relação aluno / tutor" hint="Compara alunos ativos com tutores alocados e o limite configurado."
      actions={<ToggleButtonGroup size="small" exclusive value={mod} onChange={(_, v) => v && setMod(v)}><ToggleButton value="EAD">EAD</ToggleButton><ToggleButton value="SEMIPRESENCIAL">Semipresencial</ToggleButton></ToggleButtonGroup>}>
      <Loadable loading={loading} error={error}>
        {data ? (
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "stretch" }}>
            <Card label="Alunos ativos" value={data.alunos} />
            <Card label="Tutores alocados" value={data.tutores} color="#7c3aed" />
            <Card label="Relação atual" value={data.relacao ?? "—"} hint={`limite ${data.limite} alunos/tutor`} color={nivel === "critico" ? "#dc2626" : nivel === "atencao" ? "#ca8a04" : "#16a34a"} />
            <Card label="Tutores faltantes" value={data.tutoresFaltantes} hint={`necessários: ${data.tutoresNecessarios}`} color="#dc2626" />
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, display: "flex", alignItems: "center" }}><Semaforo nivel={nivel} label={data.status} /></Paper>
          </Box>
        ) : null}
      </Loadable>
    </Section>
  );
}

function Atendimentos() {
  const [status, setStatus] = useState(""); const [venc, setVenc] = useState(false); const [open, setOpen] = useState<string | null>(null);
  const tutores = useTutores();
  const { data, loading, error, reload } = useAsync(() => eduApi.get(`${BASE}/atendimentos${venc ? "?vencidos=true" : status ? `?status=${status}` : ""}`), [status, venc]);
  const rows = itemsOf(data);
  return (
    <Section title="Atendimentos de tutoria (SLA)" hint="Fila ordenada pelo prazo de resposta. Vermelho = SLA vencido."
      actions={<>
        <TextField select size="small" label="Situação" sx={{ minWidth: 160 }} value={status} onChange={(e) => { setVenc(false); setStatus(e.target.value); }}>
          <MenuItem value="">Todas</MenuItem>{["ABERTO", "EM_ATENDIMENTO", "ESCALADO", "ENCERRADO"].map((s) => <MenuItem key={s} value={s}>{s.replace(/_/g, " ")}</MenuItem>)}
        </TextField>
        <Button size="small" variant={venc ? "contained" : "outlined"} color="error" onClick={() => setVenc(!venc)}>Só SLA vencido</Button>
      </>}>
      <Loadable loading={loading} error={error}>
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow><TableCell /><TableCell>Assunto</TableCell><TableCell>Prioridade</TableCell><TableCell>Tutor</TableCell><TableCell sx={{ minWidth: 130 }}>Prazo (SLA)</TableCell><TableCell>Situação</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id} hover>
                  <TableCell><Semaforo nivel={slaNivel(a.sla?.estado)} /></TableCell>
                  <TableCell>{a.assunto}</TableCell>
                  <TableCell><Chip size="small" color={a.prioridade === "URGENTE" ? "error" : a.prioridade === "ALTA" ? "warning" : "default"} label={a.prioridade} /></TableCell>
                  <TableCell>{nameOf(tutores, a.tutorId)}</TableCell>
                  <TableCell>
                    <LinearProgress variant="determinate" value={Math.min(100, a.sla?.consumidoPct ?? 0)} color={slaNivel(a.sla?.estado) === "critico" ? "error" : slaNivel(a.sla?.estado) === "atencao" ? "warning" : "primary"} sx={{ height: 6, borderRadius: 3 }} />
                    <Typography variant="caption">{fmtDT(a.slaLimite)}</Typography>
                  </TableCell>
                  <TableCell><StatusChip value={a.status} /></TableCell>
                  <TableCell align="right"><Button size="small" onClick={() => setOpen(a.id)}>Abrir</Button></TableCell>
                </TableRow>
              ))}
              {!rows.length && <TableRow><TableCell colSpan={7}><Typography color="text.secondary" sx={{ py: 2, textAlign: "center" }}>Nenhum atendimento.</Typography></TableCell></TableRow>}
            </TableBody>
          </Table>
        </Box>
      </Loadable>
      {open ? <Atendimento id={open} tutores={tutores} onClose={() => setOpen(null)} onChanged={reload} /> : null}
    </Section>
  );
}

/** Tutoria: relação aluno/tutor, atendimentos com SLA, tutores e alocações. */
export default function TutoriaTab() {
  const tutores = useTutores(); const polos = usePolos(); const cursos = usePrograms();
  return (
    <Box>
      <Relacao />
      <Atendimentos />
      <EduResourcePage title="Tutores" base={BASE} resource="/tutores" dense
        filters={[{ key: "tipo", label: "Tipo", options: ["PRESENCIAL", "DISTANCIA"] }]}
        columns={[{ key: "nome", label: "Nome" }, { key: "tipo", label: "Tipo" }, { key: "poloId", label: "Polo", render: (r) => nameOf(polos, r.poloId) }, { key: "capacidadeAlunos", label: "Capacidade" }, { key: "ativo", label: "Ativo" }]}
        fields={[
          { key: "nome", label: "Nome", required: true }, { key: "email", label: "E-mail" }, { key: "telefone", label: "Telefone" },
          { key: "tipo", label: "Tipo", type: "select", options: ["PRESENCIAL", "DISTANCIA"] }, { key: "poloId", label: "Polo", type: "select", options: polos },
          { key: "capacidadeAlunos", label: "Capacidade (alunos)", type: "number" }, { key: "titulacao", label: "Titulação" }, { key: "ativo", label: "Ativo", type: "bool" },
        ]} />
      <Box sx={{ height: 16 }} />
      <EduResourcePage title="Alocações de tutores" base={BASE} resource="/alocacoes" dense searchable={false}
        columns={[
          { key: "tutorId", label: "Tutor", render: (r) => nameOf(tutores, r.tutorId) }, { key: "programId", label: "Curso", render: (r) => nameOf(cursos, r.programId) },
          { key: "poloId", label: "Polo", render: (r) => nameOf(polos, r.poloId) }, { key: "alunosPrevistos", label: "Alunos previstos" }, { key: "ativo", label: "Ativa" },
        ]}
        fields={[
          { key: "tutorId", label: "Tutor", type: "select", options: tutores, required: true, createOnly: true }, { key: "programId", label: "Curso", type: "select", options: cursos },
          { key: "poloId", label: "Polo", type: "select", options: polos }, { key: "classSectionId", label: "ID da turma (opcional)" },
          { key: "alunosPrevistos", label: "Alunos previstos", type: "number" }, { key: "inicio", label: "Início", type: "date" }, { key: "fim", label: "Fim", type: "date" }, { key: "ativo", label: "Ativa", type: "bool" },
        ]} />
    </Box>
  );
}
