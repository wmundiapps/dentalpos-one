import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Paper, TextField, Typography } from "@mui/material";
import AssignmentIndOutlinedIcon from "@mui/icons-material/AssignmentIndOutlined";
import CastForEducationOutlinedIcon from "@mui/icons-material/CastForEducationOutlined";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import EduShell from "../../edu/EduShell";
import { AmbienteCard, abrirSeletorAmbiente, selecionarAmbiente, useAmbiente, NIVEL_ROTULO } from "../../edu/ambiente/useAmbiente";
import { useToast } from "../../edu/portal/comum";
import { eduApi } from "../../services/EduApi";
import { Feedback, useLoad } from "../../edu/secretaria/util";

function papelDoUsuario(): string {
  try { return String(JSON.parse(localStorage.getItem("dentalpos.user") || "null")?.role || "").toUpperCase(); } catch { return ""; }
}

/** Tela inicial do EduMaster: escolha do ambiente de ensino e atalhos para os portais. */
export default function EduInicio() {
  const e = useAmbiente();
  const nav = useNavigate();
  const papel = papelDoUsuario();
  const gestao = ["ADMIN", "OWNER", "RECTOR", "BOARD", "COORDINATOR", "SECRETARY"].includes(papel);
  const atalhos = [
    { k: "aluno", t: "Portal do Aluno", d: "Notas, frequência, materiais, financeiro, requerimentos, carteirinha.", i: <SchoolOutlinedIcon fontSize="large" />, to: "/edu/portal-aluno", ver: papel === "STUDENT" || gestao || !papel },
    { k: "prof", t: "Portal do Professor", d: "Turmas, diário e chamada, notas, materiais, provas e desempenho.", i: <CastForEducationOutlinedIcon fontSize="large" />, to: "/edu/portal-professor", ver: papel === "TEACHER" || gestao || !papel },
    { k: "gestao", t: "Painel executivo", d: "Reitoria, secretaria, calendário e demais módulos.", i: <AssignmentIndOutlinedIcon fontSize="large" />, to: "/edu", ver: gestao },
  ].filter((a) => a.ver);
  return (
    <EduShell title="Início" subtitle="Escolha o ambiente de ensino em que vai trabalhar. Todas as telas passam a mostrar apenas os cursos, turmas e alunos desse ambiente.">
      <Box sx={{ display: "grid", gap: 3 }}>
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, flexWrap: "wrap" }}>
            <Typography variant="h6" sx={{ fontWeight: 800, flex: 1 }}>Ambientes de ensino</Typography>
            {e.ambiente ? <Chip color="success" label={`Atual: ${e.ambiente.nome}`} /> : <Chip label={e.todosPermitido ? "Vendo todos os ambientes" : "Nenhum ambiente escolhido"} />}
            {e.todosPermitido && e.atual && <Button size="small" onClick={() => void selecionarAmbiente(null)}>Ver todos</Button>}
            <Button size="small" variant="outlined" onClick={abrirSeletorAmbiente}>Trocar ambiente</Button>
          </Box>
          <Feedback loading={e.carregando && !e.carregado} error={e.erro} />
          {e.carregado && !e.itens.length && !e.erro && <Alert severity="info">Nenhum ambiente de ensino disponível para o seu perfil. {gestao ? "Crie os ambientes abaixo." : "Fale com a coordenação."}</Alert>}
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0,1fr)", sm: "repeat(2, minmax(0,1fr))", lg: "repeat(3, minmax(0,1fr))" } }}>
            {e.itens.map((a) => <AmbienteCard key={a.id} a={a} onEscolher={(x) => { if (!x.atual) void selecionarAmbiente(x.id); }} />)}
          </Box>
        </Box>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>Atalhos</Typography>
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0,1fr)", sm: "repeat(3, minmax(0,1fr))" } }}>
            {atalhos.map((a) => (
              <Paper key={a.k} variant="outlined" sx={{ p: 2, borderRadius: 3, cursor: "pointer", display: "flex", gap: 1.5, alignItems: "center" }} onClick={() => nav(a.to)} role="link" tabIndex={0} onKeyDown={(ev) => ev.key === "Enter" && nav(a.to)}>
                <Box sx={{ color: "primary.main" }}>{a.i}</Box>
                <Box><Typography sx={{ fontWeight: 800 }}>{a.t}</Typography><Typography variant="body2" color="text.secondary">{a.d}</Typography></Box>
              </Paper>
            ))}
          </Box>
        </Box>
        {gestao && <GestaoAmbientes />}
      </Box>
    </EduShell>
  );
}

function GestaoAmbientes() {
  const { data, loading, error, reload } = useLoad<any>("/portal2/ambientes");
  const [ed, setEd] = useState<any>(null);
  const t = useToast();
  const cursos: any[] = data?.cursos || [];
  async function salvar() {
    try {
      const b = { codigo: ed.codigo, nome: ed.nome, nivel: ed.nivel, modalidade: ed.modalidade, variante: ed.variante || null, unidade: ed.unidade || null, cor: ed.cor || null, descricao: ed.descricao || null, ativo: ed.ativo !== false };
      const r: any = ed.id ? await eduApi.patch(`/portal2/ambientes/${ed.id}`, b) : await eduApi.post("/portal2/ambientes", b);
      await eduApi.put(`/portal2/ambientes/${r.id}/cursos`, { programIds: ed.programIds || [] });
      setEd(null); t.ok("Ambiente salvo."); reload();
    } catch (x: any) { t.err(x.message); }
  }
  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, flex: 1 }}>Gerenciar ambientes</Typography>
        {!(data?.itens || []).length && !loading && <Button size="small" onClick={async () => { try { const r: any = await eduApi.post("/portal2/ambientes/bootstrap"); t.ok(`${r.criados} ambiente(s) criado(s).`); reload(); } catch (x: any) { t.err(x.message); } }}>Criar ambientes padrão</Button>}
        <Button size="small" variant="contained" onClick={() => setEd({ codigo: "", nome: "", nivel: "GRADUACAO", modalidade: "PRESENCIAL", programIds: [] })}>Novo ambiente</Button>
      </Box>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {(data?.itens || []).map((a: any) => (
        <Paper key={a.id} variant="outlined" sx={{ p: 1.25, borderRadius: 2, mb: 1, display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", opacity: a.ativo ? 1 : 0.55 }}>
          <Box sx={{ width: 12, height: 32, borderRadius: 1, bgcolor: a.cor || "primary.main" }} />
          <Box sx={{ flex: 1, minWidth: 200 }}><Typography sx={{ fontWeight: 700 }}>{a.nome} <Typography component="span" variant="caption" color="text.secondary">({a.codigo})</Typography></Typography><Typography variant="caption" color="text.secondary">{NIVEL_ROTULO[a.nivel]} · {a.modalidade} · {a.programIds.length} curso(s){a.ativo ? "" : " · inativo"}</Typography></Box>
          <Button size="small" onClick={() => setEd({ ...a })}>Editar</Button>
        </Paper>
      ))}
      <Dialog open={!!ed} onClose={() => setEd(null)} fullWidth maxWidth="sm">
        <DialogTitle>{ed?.id ? "Editar ambiente" : "Novo ambiente"}</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 2fr" } }}>
            <TextField size="small" label="Código" value={ed?.codigo || ""} onChange={(x) => setEd({ ...ed, codigo: x.target.value.toUpperCase() })} />
            <TextField size="small" label="Nome" value={ed?.nome || ""} onChange={(x) => setEd({ ...ed, nome: x.target.value })} />
          </Box>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            <TextField select size="small" label="Nível" value={ed?.nivel || ""} onChange={(x) => setEd({ ...ed, nivel: x.target.value })}>{Object.entries(NIVEL_ROTULO).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}</TextField>
            <TextField select size="small" label="Modalidade" value={ed?.modalidade || ""} onChange={(x) => setEd({ ...ed, modalidade: x.target.value })}><MenuItem value="PRESENCIAL">Presencial</MenuItem><MenuItem value="EAD">EAD</MenuItem><MenuItem value="HIBRIDO">Híbrido</MenuItem></TextField>
            <TextField size="small" label="Variante (ex.: +A)" value={ed?.variante || ""} onChange={(x) => setEd({ ...ed, variante: x.target.value })} />
            <TextField size="small" label="Unidade / polo" value={ed?.unidade || ""} onChange={(x) => setEd({ ...ed, unidade: x.target.value })} />
            <TextField size="small" label="Cor (#RRGGBB)" value={ed?.cor || ""} onChange={(x) => setEd({ ...ed, cor: x.target.value })} />
          </Box>
          <TextField size="small" multiline minRows={2} label="Descrição" value={ed?.descricao || ""} onChange={(x) => setEd({ ...ed, descricao: x.target.value })} />
          <Typography sx={{ fontWeight: 800 }}>Cursos deste ambiente</Typography>
          <Box sx={{ maxHeight: 220, overflow: "auto", border: 1, borderColor: "divider", borderRadius: 1, px: 1 }}>
            {cursos.map((c) => <FormControlLabel key={c.id} sx={{ display: "flex" }} control={<Checkbox size="small" checked={(ed?.programIds || []).includes(c.id)} onChange={(x) => setEd({ ...ed, programIds: x.target.checked ? [...(ed.programIds || []), c.id] : (ed.programIds || []).filter((p: string) => p !== c.id) })} />} label={`${c.nome} (${c.modalidade})`} />)}
          </Box>
          {ed?.id && <FormControlLabel control={<Checkbox checked={ed.ativo !== false} onChange={(x) => setEd({ ...ed, ativo: x.target.checked })} />} label="Ambiente ativo" />}
        </DialogContent>
        <DialogActions><Button onClick={() => setEd(null)}>Cancelar</Button><Button variant="contained" disabled={!(ed?.codigo || "").trim() || !(ed?.nome || "").trim()} onClick={salvar}>Salvar</Button></DialogActions>
      </Dialog>
      {t.node}
    </Box>
  );
}
