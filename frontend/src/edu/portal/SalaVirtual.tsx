import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, LinearProgress, MenuItem, Paper, Tab, Tabs, TextField, Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import LinkIcon from "@mui/icons-material/Link";
import OndemandVideoIcon from "@mui/icons-material/OndemandVideo";
import SensorsIcon from "@mui/icons-material/Sensors";
import TextSnippetOutlinedIcon from "@mui/icons-material/TextSnippetOutlined";
import { useState, type ReactNode } from "react";
import { eduApi } from "../../services/EduApi";
import { Empty, Feedback, Progress, Status, fmtDate, fmtDateTime, fmtNum, useLoad } from "../secretaria/util";
import { sid, useToast } from "./comum";

const ICONE: Record<string, ReactNode> = {
  ARQUIVO: <DescriptionOutlinedIcon />, VIDEO: <OndemandVideoIcon />, LINK: <LinkIcon />, TEXTO: <TextSnippetOutlinedIcon />,
  ATIVIDADE: <AssignmentOutlinedIcon />, AULA_GRAVADA: <OndemandVideoIcon />, AULA_AO_VIVO: <SensorsIcon color="error" />,
};
const ROTULO: Record<string, string> = { ARQUIVO: "Arquivo", VIDEO: "Vídeo", LINK: "Link", TEXTO: "Texto", ATIVIDADE: "Atividade", AULA_GRAVADA: "Aula gravada", AULA_AO_VIVO: "Aula ao vivo" };

/** Lista de salas virtuais (uma por disciplina) do aluno; ao abrir mostra a sala da turma. */
export function SalasDoAluno({ studentId, podeAgir }: { studentId?: string | null; podeAgir: boolean }) {
  const { data, loading, error, reload } = useLoad<any>(`/portal2/aluno/turmas${sid(studentId)}`);
  const [aberta, setAberta] = useState<string | null>(null);
  if (aberta) return <SalaTurma classSectionId={aberta} papel={podeAgir ? "ALUNO" : "LEITURA"} onVoltar={() => { setAberta(null); reload(); }} />;
  const itens: any[] = data?.itens || [];
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {!loading && !itens.length && !error && <Empty>Você não tem turmas neste período e ambiente.</Empty>}
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0,1fr)", sm: "repeat(2, minmax(0,1fr))", lg: "repeat(3, minmax(0,1fr))" } }}>
        {itens.map((t) => (
          <Paper key={t.classSectionId} variant="outlined" sx={{ p: 2, borderRadius: 3, display: "grid", gap: 0.75 }}>
            <Typography sx={{ fontWeight: 800 }}>{t.disciplina}</Typography>
            <Typography variant="caption" color="text.secondary">{t.turma} · {t.professor || "Professor a definir"} · {t.periodo}</Typography>
            <Box><Typography variant="caption">Progresso <b>{t.percentual}%</b> ({t.concluidos}/{t.materiais} itens)</Typography><Progress value={t.percentual} color="success" /></Box>
            <Button variant="contained" size="small" onClick={() => setAberta(t.classSectionId)}>Entrar na sala</Button>
          </Paper>
        ))}
      </Box>
    </Box>
  );
}

type Papel = "ALUNO" | "PROFESSOR" | "LEITURA";

/** Sala virtual de uma turma: trilhas, aulas gravadas/ao vivo, atividades com entrega, fórum e recados. */
export function SalaTurma({ classSectionId, papel, onVoltar }: { classSectionId: string; papel: Papel; onVoltar?: () => void }) {
  const sala = useLoad<any>(`/portal2/turmas/${classSectionId}/sala`);
  const mats = useLoad<any>(`/portal2/turmas/${classSectionId}/materiais`);
  const [tab, setTab] = useState(0);
  const [novo, setNovo] = useState<any>(null);
  const [entrega, setEntrega] = useState<any>(null);
  const [corrigir, setCorrigir] = useState<any>(null);
  const t = useToast();
  const prof = papel === "PROFESSOR";
  const itens: any[] = mats.data?.itens || [];
  const reload = () => { sala.reload(); mats.reload(); };
  const abas = ["Trilhas e materiais", "Aulas", "Atividades", "Fórum", "Recados", ...(prof ? ["Progresso e acessos"] : [])];

  async function abrir(m: any) {
    if (m.url) window.open(m.url, "_blank", "noopener,noreferrer");
    if (papel === "ALUNO") { try { await eduApi.post(`/portal2/materiais/${m.id}/acesso`, m.tipo === "VIDEO" || m.tipo === "AULA_GRAVADA" ? { percentual: Math.max(50, m.meuProgresso?.percentual ?? 0) } : { concluido: true }); mats.reload(); sala.reload(); } catch (e: any) { t.err(e.message); } }
  }
  async function concluir(m: any) { try { await eduApi.post(`/portal2/materiais/${m.id}/acesso`, { concluido: true }); t.ok("Marcado como concluído."); reload(); } catch (e: any) { t.err(e.message); } }
  async function arquivar(m: any) { if (!window.confirm(`Remover "${m.titulo}" da sala?`)) return; try { await eduApi.del(`/portal2/materiais/${m.id}`); t.ok("Material removido."); reload(); } catch (e: any) { t.err(e.message); } }
  async function alternarPublicacao(m: any) { try { await eduApi.patch(`/portal2/materiais/${m.id}`, { status: m.status === "PUBLICADO" ? "RASCUNHO" : "PUBLICADO" }); reload(); } catch (e: any) { t.err(e.message); } }

  const Linha = ({ m }: { m: any }) => (
    <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2, display: "flex", gap: 1.25, alignItems: "center", flexWrap: "wrap" }}>
      <Box sx={{ color: "primary.main", display: "flex" }}>{ICONE[m.tipo]}</Box>
      <Box sx={{ flex: 1, minWidth: 180 }}>
        <Typography sx={{ fontWeight: 700 }}>{m.titulo}</Typography>
        <Typography variant="caption" color="text.secondary">
          {ROTULO[m.tipo]}{m.duracaoMin ? ` · ${m.duracaoMin} min` : ""}{m.inicioEm && m.tipo === "AULA_AO_VIVO" ? ` · ${fmtDateTime(m.inicioEm)}` : ""}{m.prazoEntrega ? ` · entrega até ${fmtDateTime(m.prazoEntrega)}` : ""}{prof && m.status !== "PUBLICADO" ? ` · ${m.status}` : ""}{prof && m.entregas != null ? ` · ${m.entregas} entrega(s)` : ""}
        </Typography>
        {m.descricao && <Typography variant="body2" color="text.secondary">{m.descricao}</Typography>}
        {m.conteudo && <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 0.5 }}>{m.conteudo}</Typography>}
        {papel === "ALUNO" && m.meuProgresso && m.meuProgresso.percentual > 0 && !m.meuProgresso.concluido && <LinearProgress variant="determinate" value={m.meuProgresso.percentual} sx={{ mt: 0.5, height: 6, borderRadius: 3 }} />}
      </Box>
      {papel === "ALUNO" && (m.meuProgresso?.concluido || m.minhaEntrega) && <Chip size="small" color="success" label={m.minhaEntrega ? (m.minhaEntrega.status === "CORRIGIDA" ? `Nota ${fmtNum(m.minhaEntrega.nota)}` : "Entregue") : "Concluído"} />}
      {m.url && <Button size="small" onClick={() => abrir(m)}>{m.tipo === "AULA_AO_VIVO" ? "Entrar" : "Abrir"}</Button>}
      {papel === "ALUNO" && !m.meuProgresso?.concluido && !m.minhaEntrega && !["ATIVIDADE", "AULA_AO_VIVO"].includes(m.tipo) && <Button size="small" onClick={() => concluir(m)}>Marcar concluído</Button>}
      {papel === "ALUNO" && m.aceitaEntrega && m.minhaEntrega?.status !== "CORRIGIDA" && (
        <Button size="small" variant="contained" onClick={() => setEntrega({ m, texto: m.minhaEntrega?.texto || "", url: m.minhaEntrega?.url || "" })}>{m.minhaEntrega ? "Reenviar" : "Entregar"}</Button>
      )}
      {prof && m.aceitaEntrega && <Button size="small" onClick={() => setCorrigir(m)}>Entregas e correção</Button>}
      {prof && <Button size="small" onClick={() => alternarPublicacao(m)}>{m.status === "PUBLICADO" ? "Despublicar" : "Publicar"}</Button>}
      {prof && <Button size="small" color="error" onClick={() => arquivar(m)}>Remover</Button>}
    </Paper>
  );

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        {onVoltar && <IconButton onClick={onVoltar} aria-label="Voltar"><ArrowBackIcon /></IconButton>}
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>{sala.data?.turma?.disciplina || "Sala virtual"}</Typography>
          <Typography variant="caption" color="text.secondary">{sala.data?.turma ? `${sala.data.turma.nome} · ${sala.data.turma.periodo}${sala.data.turma.professor ? ` · ${sala.data.turma.professor}` : ""}` : ""}</Typography>
        </Box>
        {prof && <Button variant="contained" onClick={() => setNovo({ tipo: "ARQUIVO", status: "PUBLICADO" })}>Publicar material</Button>}
      </Box>
      <Feedback loading={sala.loading || mats.loading} error={sala.error || mats.error} onRetry={reload} />
      {papel === "ALUNO" && sala.data?.progresso && (
        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
          <Typography variant="body2">Seu progresso: <b>{sala.data.progresso.percentual}%</b> ({sala.data.progresso.concluidos}/{sala.data.progresso.total}) {sala.data.progresso.ultimoAcesso ? `· último acesso ${fmtDateTime(sala.data.progresso.ultimoAcesso)}` : ""}</Typography>
          <Progress value={sala.data.progresso.percentual} color="success" />
          {(sala.data.progresso.pendentes || []).map((p: any) => <Alert key={p.id} severity="warning" sx={{ mt: 1, py: 0 }}>Atividade pendente: <b>{p.titulo}</b>{p.prazoEntrega ? ` — até ${fmtDateTime(p.prazoEntrega)}` : ""}</Alert>)}
        </Paper>
      )}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">{abas.map((a) => <Tab key={a} label={a} />)}</Tabs>

      {tab === 0 && (
        <Box sx={{ display: "grid", gap: 2 }}>
          {!itens.length && !mats.loading && <Empty>Nenhum material publicado ainda.</Empty>}
          {(mats.data?.trilhas || []).map((tr: any) => (
            <Box key={tr.nome} sx={{ display: "grid", gap: 1 }}>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                <Typography sx={{ fontWeight: 800, flex: 1 }}>{tr.nome}</Typography>
                {papel === "ALUNO" && <Chip size="small" label={`${tr.concluidos}/${tr.total}`} color={tr.concluidos === tr.total ? "success" : "default"} />}
              </Box>
              {itens.filter((m) => (m.trilha || "Geral") === tr.nome).map((m) => <Linha key={m.id} m={m} />)}
            </Box>
          ))}
        </Box>
      )}
      {tab === 1 && (
        <Box sx={{ display: "grid", gap: 1.5 }}>
          <Typography sx={{ fontWeight: 800 }}>Ao vivo</Typography>
          {!(sala.data?.aulasAoVivo || []).length && <Empty>Nenhum encontro ao vivo agendado.</Empty>}
          {(sala.data?.aulasAoVivo || []).map((m: any) => <Linha key={m.id} m={{ ...m, ...(itens.find((i) => i.id === m.id) || {}) }} />)}
          <Typography sx={{ fontWeight: 800, mt: 1 }}>Gravadas</Typography>
          {!(sala.data?.aulasGravadas || []).length && <Empty>Nenhuma aula gravada ainda.</Empty>}
          {(sala.data?.aulasGravadas || []).map((m: any) => <Linha key={m.id} m={{ ...m, ...(itens.find((i) => i.id === m.id) || {}) }} />)}
        </Box>
      )}
      {tab === 2 && (
        <Box sx={{ display: "grid", gap: 1.5 }}>
          {!itens.some((m) => m.tipo === "ATIVIDADE") && <Empty>Nenhuma atividade publicada.</Empty>}
          {itens.filter((m) => m.tipo === "ATIVIDADE").map((m) => (
            <Box key={m.id} sx={{ display: "grid", gap: 0.5 }}>
              <Linha m={m} />
              {papel === "ALUNO" && m.minhaEntrega?.feedback && <Alert severity="info" sx={{ py: 0 }}>Retorno do professor: {m.minhaEntrega.feedback}</Alert>}
              {papel === "ALUNO" && m.minhaEntrega?.status === "DEVOLVIDA" && <Alert severity="warning" sx={{ py: 0 }}>Devolvida para refazer.</Alert>}
              {papel === "ALUNO" && !m.minhaEntrega && m.prazoVencido && <Alert severity="error" sx={{ py: 0 }}>Prazo encerrado — a entrega será marcada como atrasada.</Alert>}
            </Box>
          ))}
        </Box>
      )}
      {tab === 3 && <Forum classSectionId={classSectionId} podeEscrever={papel !== "LEITURA"} prof={prof} />}
      {tab === 4 && <Recados classSectionId={classSectionId} prof={prof} />}
      {tab === 5 && prof && <ProgressoTurma classSectionId={classSectionId} />}

      <Dialog open={!!novo} onClose={() => setNovo(null)} fullWidth maxWidth="sm">
        <DialogTitle>Publicar na sala virtual</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          <TextField select size="small" label="Tipo" value={novo?.tipo || "ARQUIVO"} onChange={(e) => setNovo({ ...novo, tipo: e.target.value })}>{Object.entries(ROTULO).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}</TextField>
          <TextField size="small" label="Título" value={novo?.titulo || ""} onChange={(e) => setNovo({ ...novo, titulo: e.target.value })} />
          <TextField size="small" label="Trilha / módulo (ex.: Unidade 1)" value={novo?.trilha || ""} onChange={(e) => setNovo({ ...novo, trilha: e.target.value })} />
          <TextField size="small" label="Descrição" multiline minRows={2} value={novo?.descricao || ""} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} />
          {novo?.tipo !== "TEXTO" && <TextField size="small" label="URL (arquivo, vídeo, link ou sala ao vivo)" placeholder="https://" value={novo?.url || ""} onChange={(e) => setNovo({ ...novo, url: e.target.value })} />}
          {novo?.tipo === "TEXTO" && <TextField label="Conteúdo" multiline minRows={4} value={novo?.conteudo || ""} onChange={(e) => setNovo({ ...novo, conteudo: e.target.value })} />}
          {novo?.tipo === "AULA_AO_VIVO" && <TextField size="small" type="datetime-local" label="Início" slotProps={{ inputLabel: { shrink: true } }} value={novo?.inicioEm || ""} onChange={(e) => setNovo({ ...novo, inicioEm: e.target.value })} />}
          {novo?.tipo === "ATIVIDADE" && (
            <>
              <FormControlLabel control={<Checkbox checked={!!novo.aceitaEntrega} onChange={(e) => setNovo({ ...novo, aceitaEntrega: e.target.checked })} />} label="Receber entregas dos alunos" />
              {novo.aceitaEntrega && <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
                <TextField size="small" type="datetime-local" label="Prazo de entrega" slotProps={{ inputLabel: { shrink: true } }} value={novo.prazoEntrega || ""} onChange={(e) => setNovo({ ...novo, prazoEntrega: e.target.value })} />
                <TextField size="small" type="number" label="Nota máxima" value={novo.notaMaxima ?? ""} onChange={(e) => setNovo({ ...novo, notaMaxima: e.target.value })} />
              </Box>}
            </>
          )}
          <FormControlLabel control={<Checkbox checked={novo?.status !== "RASCUNHO"} onChange={(e) => setNovo({ ...novo, status: e.target.checked ? "PUBLICADO" : "RASCUNHO" })} />} label="Publicar agora (os alunos serão avisados)" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNovo(null)}>Cancelar</Button>
          <Button variant="contained" disabled={(novo?.titulo || "").trim().length < 2} onClick={async () => {
            const b: any = { ...novo };
            for (const k of Object.keys(b)) if (b[k] === "" || b[k] === undefined) delete b[k];
            if (b.inicioEm) b.inicioEm = new Date(b.inicioEm).toISOString();
            if (b.prazoEntrega) b.prazoEntrega = new Date(b.prazoEntrega).toISOString();
            if (b.notaMaxima != null) b.notaMaxima = Number(b.notaMaxima);
            try { await eduApi.post(`/portal2/turmas/${classSectionId}/materiais`, b); setNovo(null); t.ok("Publicado."); reload(); } catch (e: any) { t.err(e.message); }
          }}>Salvar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!entrega} onClose={() => setEntrega(null)} fullWidth maxWidth="sm">
        <DialogTitle>Entregar: {entrega?.m?.titulo}</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          {entrega?.m?.prazoVencido && <Alert severity="warning">O prazo terminou: a entrega ficará marcada como atrasada.</Alert>}
          <TextField multiline minRows={4} label="Sua resposta" value={entrega?.texto || ""} onChange={(e) => setEntrega({ ...entrega, texto: e.target.value })} />
          <TextField size="small" label="Link do arquivo (nuvem, Drive…)" placeholder="https://" value={entrega?.url || ""} onChange={(e) => setEntrega({ ...entrega, url: e.target.value })} />
        </DialogContent>
        <DialogActions><Button onClick={() => setEntrega(null)}>Cancelar</Button>
          <Button variant="contained" disabled={!(entrega?.texto || "").trim() && !(entrega?.url || "").trim()} onClick={async () => { try { await eduApi.post(`/portal2/materiais/${entrega.m.id}/entrega`, { texto: entrega.texto || undefined, url: entrega.url || undefined }); setEntrega(null); t.ok("Trabalho entregue."); reload(); } catch (e: any) { t.err(e.message); } }}>Enviar</Button></DialogActions>
      </Dialog>
      <Correcao material={corrigir} onClose={() => { setCorrigir(null); reload(); }} toast={t} />
      {t.node}
    </Box>
  );
}

function Correcao({ material, onClose, toast }: { material: any; onClose: () => void; toast: ReturnType<typeof useToast> }) {
  const { data, loading, error, reload } = useLoad<any>(material ? `/portal2/materiais/${material.id}/entregas` : null);
  const [f, setF] = useState<any>({});
  return (
    <Dialog open={!!material} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Entregas — {material?.titulo}</DialogTitle>
      <DialogContent dividers>
        <Feedback loading={loading} error={error} onRetry={reload} />
        {data && <Typography variant="body2" sx={{ mb: 1 }}>{data.resumo.entregues}/{data.resumo.alunos} entregues · {data.resumo.corrigidas} corrigidas · {data.resumo.atrasadas} atrasadas{material?.componenteId ? " · a nota é lançada no diário" : ""}</Typography>}
        <Box sx={{ display: "grid", gap: 1 }}>
          {(data?.itens || []).map(({ aluno, entrega }: any) => (
            <Paper key={aluno.id} variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <Typography sx={{ fontWeight: 700, flex: 1, minWidth: 160 }}>{aluno.nomeCompleto} <Typography component="span" variant="caption" color="text.secondary">RA {aluno.ra}</Typography></Typography>
                {entrega ? <><Status value={entrega.status} />{entrega.atrasada && <Chip size="small" color="error" label="Atrasada" />}{entrega.nota != null && <Chip size="small" label={`Nota ${fmtNum(entrega.nota)}`} />}</> : <Chip size="small" label="Não entregou" />}
              </Box>
              {entrega && (
                <Box sx={{ mt: 0.75, display: "grid", gap: 0.75 }}>
                  <Typography variant="caption" color="text.secondary">Enviada em {fmtDate(entrega.enviadaEm)} (versão {entrega.versao})</Typography>
                  {entrega.texto && <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{entrega.texto}</Typography>}
                  {entrega.url && <Button size="small" href={entrega.url} target="_blank" rel="noopener noreferrer" sx={{ justifySelf: "start" }}>Abrir arquivo</Button>}
                  {entrega.status !== "CORRIGIDA" && (
                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                      <TextField size="small" type="number" label="Nota" sx={{ width: 100 }} value={f[entrega.id]?.nota ?? ""} onChange={(e) => setF({ ...f, [entrega.id]: { ...f[entrega.id], nota: e.target.value } })} />
                      <TextField size="small" label="Retorno ao aluno" sx={{ flex: 1, minWidth: 160 }} value={f[entrega.id]?.feedback ?? ""} onChange={(e) => setF({ ...f, [entrega.id]: { ...f[entrega.id], feedback: e.target.value } })} />
                      <Button size="small" variant="contained" disabled={f[entrega.id]?.nota === undefined || f[entrega.id]?.nota === ""} onClick={async () => { try { await eduApi.post(`/portal2/entregas/${entrega.id}/corrigir`, { nota: Number(f[entrega.id].nota), feedback: f[entrega.id]?.feedback || undefined }); toast.ok("Correção salva."); reload(); } catch (e: any) { toast.err(e.message); } }}>Corrigir</Button>
                      <Button size="small" onClick={async () => { try { await eduApi.post(`/portal2/entregas/${entrega.id}/corrigir`, { devolver: true, feedback: f[entrega.id]?.feedback || "Refaça conforme orientação." }); toast.ok("Devolvida ao aluno."); reload(); } catch (e: any) { toast.err(e.message); } }}>Devolver</Button>
                    </Box>
                  )}
                  {entrega.feedback && entrega.status === "CORRIGIDA" && <Typography variant="caption">Retorno: {entrega.feedback}</Typography>}
                </Box>
              )}
            </Paper>
          ))}
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

function Forum({ classSectionId, podeEscrever, prof }: { classSectionId: string; podeEscrever: boolean; prof: boolean }) {
  const { data, loading, error, reload } = useLoad<any>(`/portal2/turmas/${classSectionId}/forum`);
  const [aberto, setAberto] = useState<string | null>(null);
  const [novo, setNovo] = useState<any>(null);
  const t = useToast();
  if (aberto) return <Topico id={aberto} podeEscrever={podeEscrever} prof={prof} onVoltar={() => { setAberto(null); reload(); }} />;
  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {podeEscrever && <Button startIcon={<ForumOutlinedIcon />} variant="outlined" sx={{ justifySelf: "start" }} onClick={() => setNovo({ titulo: "", corpo: "" })}>Novo tópico</Button>}
      {!loading && !(data?.itens || []).length && <Empty>Nenhum tópico ainda. Seja o primeiro a perguntar!</Empty>}
      {(data?.itens || []).map((tp: any) => (
        <Paper key={tp.id} variant="outlined" onClick={() => setAberto(tp.id)} sx={{ p: 1.5, borderRadius: 2, cursor: "pointer" }}>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <Typography sx={{ fontWeight: 700, flex: 1 }}>{tp.fixado ? "📌 " : ""}{tp.titulo}</Typography>
            {tp.fechado && <Chip size="small" label="Fechado" />}<Chip size="small" variant="outlined" label={`${tp.respostas} resposta(s)`} />
          </Box>
          <Typography variant="caption" color="text.secondary">{tp.autorNome} ({tp.autorPapel === "PROFESSOR" ? "professor" : tp.autorPapel === "ALUNO" ? "aluno" : "coordenação"}) · {fmtDateTime(tp.createdAt)}</Typography>
        </Paper>
      ))}
      <Dialog open={!!novo} onClose={() => setNovo(null)} fullWidth maxWidth="sm">
        <DialogTitle>Novo tópico</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          <TextField size="small" label="Título" value={novo?.titulo || ""} onChange={(e) => setNovo({ ...novo, titulo: e.target.value })} />
          <TextField multiline minRows={4} label="Mensagem" value={novo?.corpo || ""} onChange={(e) => setNovo({ ...novo, corpo: e.target.value })} />
          {prof && <FormControlLabel control={<Checkbox checked={!!novo?.fixado} onChange={(e) => setNovo({ ...novo, fixado: e.target.checked })} />} label="Fixar no topo" />}
        </DialogContent>
        <DialogActions><Button onClick={() => setNovo(null)}>Cancelar</Button><Button variant="contained" disabled={(novo?.titulo || "").trim().length < 3 || (novo?.corpo || "").trim().length < 2} onClick={async () => { try { await eduApi.post(`/portal2/turmas/${classSectionId}/forum`, novo); setNovo(null); reload(); } catch (e: any) { t.err(e.message); } }}>Publicar</Button></DialogActions>
      </Dialog>
      {t.node}
    </Box>
  );
}

function Topico({ id, podeEscrever, prof, onVoltar }: { id: string; podeEscrever: boolean; prof: boolean; onVoltar: () => void }) {
  const { data, loading, error, reload } = useLoad<any>(`/portal2/forum/${id}`);
  const [txt, setTxt] = useState("");
  const t = useToast();
  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Button startIcon={<ArrowBackIcon />} onClick={onVoltar} sx={{ justifySelf: "start" }}>Voltar ao fórum</Button>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {data && (
        <>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>{data.topico.titulo}</Typography>
            <Typography variant="caption" color="text.secondary">{data.topico.autorNome} · {fmtDateTime(data.topico.createdAt)}</Typography>
            <Typography sx={{ whiteSpace: "pre-wrap", mt: 1 }}>{data.topico.corpo}</Typography>
            {prof && <Button size="small" sx={{ mt: 1 }} onClick={async () => { try { await eduApi.post(`/portal2/forum/${id}/fechar`, { fechado: !data.topico.fechado }); reload(); } catch (e: any) { t.err(e.message); } }}>{data.topico.fechado ? "Reabrir tópico" : "Fechar tópico"}</Button>}
          </Paper>
          {data.respostas.map((r: any) => (
            <Paper key={r.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2, ml: { xs: 1, sm: 3 }, borderLeft: r.autorPapel === "PROFESSOR" ? "4px solid" : undefined, borderLeftColor: "primary.main" }}>
              <Typography variant="caption" color="text.secondary"><b>{r.autorNome}</b> {r.autorPapel === "PROFESSOR" ? "(professor)" : ""} · {fmtDateTime(r.createdAt)}</Typography>
              <Typography sx={{ whiteSpace: "pre-wrap" }}>{r.corpo}</Typography>
            </Paper>
          ))}
          {podeEscrever && !data.topico.fechado && (
            <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
              <TextField size="small" fullWidth multiline minRows={2} label="Sua resposta" value={txt} onChange={(e) => setTxt(e.target.value)} />
              <Button variant="contained" disabled={!txt.trim()} onClick={async () => { try { await eduApi.post(`/portal2/forum/${id}/respostas`, { corpo: txt }); setTxt(""); reload(); } catch (e: any) { t.err(e.message); } }}>Responder</Button>
            </Box>
          )}
          {data.topico.fechado && <Alert severity="info">Este tópico está fechado.</Alert>}
        </>
      )}
      {t.node}
    </Box>
  );
}

function Recados({ classSectionId, prof }: { classSectionId: string; prof: boolean }) {
  const { data, loading, error, reload } = useLoad<any>(`/portal2/turmas/${classSectionId}/recados`);
  const [novo, setNovo] = useState<any>(null);
  const t = useToast();
  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {prof && <Button variant="outlined" sx={{ justifySelf: "start" }} onClick={() => setNovo({ titulo: "", mensagem: "" })}>Novo recado à turma</Button>}
      {!loading && !(data?.itens || []).length && <Empty>Nenhum recado.</Empty>}
      {(data?.itens || []).map((r: any) => (
        <Paper key={r.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}><Typography sx={{ fontWeight: 800, flex: 1 }}>{r.fixado ? "📌 " : ""}{r.titulo}</Typography>{prof && <Button size="small" color="error" onClick={async () => { try { await eduApi.del(`/portal2/recados/${r.id}`); reload(); } catch (e: any) { t.err(e.message); } }}>Apagar</Button>}</Box>
          <Typography variant="caption" color="text.secondary">{r.autorNome} · {fmtDateTime(r.createdAt)}</Typography>
          <Typography sx={{ whiteSpace: "pre-wrap" }}>{r.mensagem}</Typography>
        </Paper>
      ))}
      <Dialog open={!!novo} onClose={() => setNovo(null)} fullWidth maxWidth="sm">
        <DialogTitle>Recado à turma</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          <Alert severity="info">Todos os alunos da turma recebem um aviso no portal.</Alert>
          <TextField size="small" label="Título" value={novo?.titulo || ""} onChange={(e) => setNovo({ ...novo, titulo: e.target.value })} />
          <TextField multiline minRows={4} label="Mensagem" value={novo?.mensagem || ""} onChange={(e) => setNovo({ ...novo, mensagem: e.target.value })} />
          <FormControlLabel control={<Checkbox checked={!!novo?.fixado} onChange={(e) => setNovo({ ...novo, fixado: e.target.checked })} />} label="Fixar" />
        </DialogContent>
        <DialogActions><Button onClick={() => setNovo(null)}>Cancelar</Button><Button variant="contained" disabled={(novo?.titulo || "").trim().length < 2 || (novo?.mensagem || "").trim().length < 2} onClick={async () => { try { await eduApi.post(`/portal2/turmas/${classSectionId}/recados`, novo); setNovo(null); t.ok("Recado enviado."); reload(); } catch (e: any) { t.err(e.message); } }}>Enviar</Button></DialogActions>
      </Dialog>
      {t.node}
    </Box>
  );
}

function ProgressoTurma({ classSectionId }: { classSectionId: string }) {
  const { data, loading, error, reload } = useLoad<any>(`/portal2/turmas/${classSectionId}/progresso`);
  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {data && <Alert severity={data.resumo.inativos ? "warning" : "success"}>{data.resumo.alunos} aluno(s) · progresso médio {data.resumo.mediaPercentual}% · {data.resumo.inativos} sem acesso há mais de 7 dias.</Alert>}
      {(data?.itens || []).map((i: any) => (
        <Paper key={i.aluno.id} variant="outlined" sx={{ p: 1.25, borderRadius: 2, display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
          <Typography sx={{ fontWeight: 700, flex: 1, minWidth: 160 }}>{i.aluno.nomeCompleto}</Typography>
          <Box sx={{ width: { xs: "100%", sm: 200 } }}><Typography variant="caption">{i.concluidos}/{i.total} itens · {i.percentual}%</Typography><Progress value={i.percentual} color={i.percentual >= 60 ? "success" : i.percentual >= 30 ? "warning" : "error"} /></Box>
          <Typography variant="caption" color="text.secondary">{i.acessos} acesso(s) · {i.ultimoAcesso ? `último ${fmtDate(i.ultimoAcesso)}` : "nunca acessou"}</Typography>
          {i.inativo && <Chip size="small" color="warning" label="Inativo" />}
        </Paper>
      ))}
    </Box>
  );
}
