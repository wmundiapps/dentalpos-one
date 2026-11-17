import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import VisibilityIcon from "@mui/icons-material/Visibility";
import EditIcon from "@mui/icons-material/Edit";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { Section, Stat, StateBox, StatusPill, fmtDateTime, useLoad, type Toast } from "./common";

const BASE = "/acompanhamento";
const ROTULO: Record<string, string> = {
  INATIVIDADE: "Volta aos estudos", VIDEOAULA: "Videoaulas", ATIVIDADE: "Atividades", PROVA: "Provas", AULA_PRATICA: "Aulas práticas", ESTAGIO: "Estágios", EVENTO: "Calendário (ENADE, PIESC...)", RESUMO_SEMANAL: "Resumo semanal",
};
const VARIAVEIS = "{{nome}} {{curso}} {{instituicao}} {{dias_sem_acesso}} {{qtd_videos}} {{atividade}} {{prazo}} {{prova}} {{disciplina}} {{data}} {{hora}} {{aula}} {{concedente}} {{horas_faltantes}} {{evento}} {{itens}}";
const RESULTADO: Record<string, string> = { ENFILEIRADO: "ENVIADO", SEM_DESTINO: "SEM E-MAIL", BLOQUEADO_OPTOUT: "NÃO QUIS RECEBER", LIMITE_DIARIO: "LIMITE ATINGIDO" };

function EditarRegra({ regra, onClose, onDone, toast }: { regra: any | null; onClose: () => void; onDone: () => void; toast: (t: Toast) => void }) {
  const [f, setF] = useState<any>({});
  const [last, setLast] = useState("");
  if ((regra?.id || "") !== last) { setLast(regra?.id || ""); setF(regra ? { ...regra } : {}); }
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  async function salvar() {
    try {
      await eduApi.patch(`${BASE}/regras/${regra.id}`, { nome: f.nome, assunto: f.assunto, corpo: f.corpo, antecedenciaDias: Number(f.antecedenciaDias), cooldownDias: Number(f.cooldownDias), limiarDias: f.limiarDias === "" || f.limiarDias == null ? null : Number(f.limiarDias) });
      toast({ type: "success", text: "Regra salva." }); onClose(); onDone();
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Dialog open={!!regra} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Editar regra · {regra ? ROTULO[regra.tipo] : ""}</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
        <TextField size="small" label="Nome da regra" value={f.nome || ""} onChange={set("nome")} />
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {regra?.tipo === "INATIVIDADE" && <TextField size="small" type="number" label="Dias sem acessar" value={f.limiarDias ?? ""} onChange={set("limiarDias")} />}
          {regra?.tipo !== "INATIVIDADE" && regra?.tipo !== "VIDEOAULA" && <TextField size="small" type="number" label="Avisar quantos dias antes" value={f.antecedenciaDias ?? 0} onChange={set("antecedenciaDias")} />}
          <TextField size="small" type="number" label="Intervalo mínimo entre e-mails (dias)" value={f.cooldownDias ?? 7} onChange={set("cooldownDias")} />
        </Box>
        <TextField size="small" label="Assunto do e-mail" value={f.assunto || ""} onChange={set("assunto")} />
        <TextField size="small" label="Texto do e-mail" value={f.corpo || ""} onChange={set("corpo")} multiline minRows={9} helperText={`Variáveis: ${VARIAVEIS}`} />
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" onClick={salvar}>Salvar</Button></DialogActions>
    </Dialog>
  );
}

export default function AcompanhamentoTab({ toast }: { toast: (t: Toast) => void }) {
  const { data, loading, error, reload } = useLoad<any>(`${BASE}/painel`);
  const [edit, setEdit] = useState<any | null>(null);
  const [sim, setSim] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  async function ativar(r: any, ativa: boolean) {
    try { await eduApi.patch(`${BASE}/regras/${r.id}`, { ativa }); reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function ligarTudo() {
    try { await eduApi.post(`${BASE}/bootstrap`); toast({ type: "success", text: "Regras padrão criadas." }); reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function simular(regraId?: string) {
    setBusy(true);
    try { setSim(await eduApi.post(`${BASE}/simular`, { regraId })); } catch (e: any) { toast({ type: "error", text: e.message }); } finally { setBusy(false); }
  }
  async function executar() {
    setBusy(true);
    try { const r = await eduApi.post(`${BASE}/executar`, {}); toast({ type: "success", text: `${r.enfileiradas} e-mail(s) enfileirados para envio.` }); reload(); } catch (e: any) { toast({ type: "error", text: e.message }); } finally { setBusy(false); }
  }

  const r30 = data?.resumo30d;
  const porRes = r30?.porResultado || {};
  return (
    <StateBox loading={loading} error={error} onRetry={reload}>
      <Alert severity="info" sx={{ mb: 2 }}>
        Acompanhamento virtual do aluno: o sistema envia sozinho e-mails de incentivo e lembretes (volta aos estudos, videoaulas, prazos de atividades, provas, aulas práticas, estágios, ENADE, PIESC e resumo semanal). Cada aluno recebe no máximo {data?.config?.maxPorAlunoDia ?? 2} por dia e quem pedir para sair deixa de receber.
      </Alert>
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 3 }}>
        <Stat label="E-mails nos últimos 30 dias" value={r30?.total ?? 0} />
        <Stat label="Enviados" value={porRes.ENFILEIRADO ?? 0} color="#2e7d32" />
        <Stat label="Sem e-mail cadastrado" value={porRes.SEM_DESTINO ?? 0} />
        <Stat label="Pediram para não receber" value={porRes.BLOQUEADO_OPTOUT ?? 0} />
        <Stat label="Regras ativas" value={(data?.regras || []).filter((r: any) => r.ativa).length} hint={`de ${(data?.regras || []).length}`} />
      </Box>

      <Section
        title="Regras de acompanhamento"
        description="Cada regra liga ou desliga sozinha por tipo de lembrete. Clique no lápis para mudar o texto, o prazo de antecedência e o intervalo."
        actions={
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {!(data?.regras || []).length && <Button variant="outlined" onClick={ligarTudo}>Criar regras padrão</Button>}
            <Button variant="outlined" startIcon={<VisibilityIcon />} disabled={busy} onClick={() => simular()}>Ver quem receberia agora</Button>
            <Button variant="contained" startIcon={<PlayArrowIcon />} disabled={busy} onClick={executar}>Enviar agora</Button>
          </Box>
        }
      >
        <Table size="small">
          <TableHead><TableRow><TableCell>Regra</TableCell><TableCell>Quando dispara</TableCell><TableCell align="right">Últimos 30 dias</TableCell><TableCell align="center">Ativa</TableCell><TableCell /></TableRow></TableHead>
          <TableBody>
            {(data?.regras || []).map((r: any) => (
              <TableRow key={r.id} hover>
                <TableCell><Typography sx={{ fontWeight: 700 }}>{r.nome}</Typography><Typography variant="caption" color="text.secondary">{r.descricao}</Typography></TableCell>
                <TableCell>
                  <Chip size="small" label={ROTULO[r.tipo] || r.tipo} sx={{ mr: 0.5 }} />
                  {r.tipo === "INATIVIDADE" ? `${r.limiarDias} dias sem acesso` : r.tipo === "VIDEOAULA" || r.tipo === "RESUMO_SEMANAL" ? "semanal" : `${r.antecedenciaDias} dias antes`}
                </TableCell>
                <TableCell align="right">{r.enviados30d}</TableCell>
                <TableCell align="center"><Switch size="small" checked={r.ativa} onChange={(_, v) => ativar(r, v)} /></TableCell>
                <TableCell align="right"><Button size="small" startIcon={<EditIcon />} onClick={() => setEdit(r)}>Editar</Button><Button size="small" onClick={() => simular(r.id)}>Prévia</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Últimos e-mails do acompanhamento" description="Histórico de cada aviso: quem recebeu, qual regra disparou e o resultado.">
        <StateBox empty={!(data?.ultimos || []).length} emptyText="Os envios aparecem aqui assim que as regras rodarem.">
          <Table size="small">
            <TableHead><TableRow><TableCell>Quando</TableCell><TableCell>Aluno</TableCell><TableCell>Regra</TableCell><TableCell>Assunto</TableCell><TableCell>Resultado</TableCell></TableRow></TableHead>
            <TableBody>
              {(data?.ultimos || []).map((u: any) => (
                <TableRow key={u.id}><TableCell>{fmtDateTime(u.em)}</TableCell><TableCell>{u.aluno}</TableCell><TableCell>{u.regra}</TableCell><TableCell>{u.assunto}</TableCell><TableCell><StatusPill value={RESULTADO[u.resultado] || u.resultado} /></TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </StateBox>
      </Section>

      <EditarRegra regra={edit} onClose={() => setEdit(null)} onDone={reload} toast={toast} />
      <Dialog open={!!sim} onClose={() => setSim(null)} fullWidth maxWidth="md">
        <DialogTitle>Prévia: quem receberia agora</DialogTitle>
        <DialogContent dividers>
          {sim && <Typography variant="body2" sx={{ mb: 2 }}>{sim.simulacao.length ? `Mostrando ${sim.simulacao.length} e-mail(s). Nada foi enviado.` : "Nenhum aluno entra nos critérios neste momento (ou todos já foram avisados)."}</Typography>}
          {(sim?.simulacao || []).slice(0, 25).map((s: any, i: number) => (
            <Paper key={i} variant="outlined" sx={{ p: 1.5, mb: 1.5, borderRadius: 2 }}>
              <Typography variant="caption" color="text.secondary">{s.regra} · para {s.aluno} {s.destino ? `<${s.destino}>` : ""} · <StatusPill value={RESULTADO[s.resultado] || s.resultado} /></Typography>
              <Typography sx={{ fontWeight: 700 }}>{s.assunto}</Typography>
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{s.mensagem}</Typography>
            </Paper>
          ))}
        </DialogContent>
        <DialogActions><Button onClick={() => setSim(null)}>Fechar</Button></DialogActions>
      </Dialog>
    </StateBox>
  );
}
