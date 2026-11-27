import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { Section, Stat, StateBox, useLoad, useToast } from "../admissoes/common";
import { FormDialog, Pill, dt, dth, iso } from "./ui";

const FUNCOES: Array<[string, string]> = [["PRESIDENTE", "Presidente"], ["VICE_PRESIDENTE", "Vice-presidente"], ["SECRETARIO", "Secretário(a)"], ["TITULAR", "Titular"], ["SUPLENTE", "Suplente"]];
const CAT_INSTR: Record<string, string> = { URGENCIA: "Urgência", EMERGENCIA: "Emergência", AUTOSSOCORRO: "Autossocorro", SOCORRO_PROXIMO: "Socorro ao próximo", LIMITES: "Limites de atuação" };

function useAcoes() {
  const { setMsg, node } = useToast();
  const [dlg, setDlg] = useState<string | null>(null);
  const run = async (fn: () => Promise<any>, ok: string, reload: () => void) => { try { await fn(); setMsg({ type: "success", text: ok }); setDlg(null); reload(); } catch (e: any) { setMsg({ type: "error", text: e.message }); } };
  return { node, dlg, setDlg, run, setMsg };
}

export function PainelCipa({ ir }: { ir: (a: string) => void }) {
  const { data, loading, error, reload } = useLoad<any>("/cipa/painel");
  return (
    <StateBox loading={loading} error={error} onRetry={reload}>
      {data && (<>
        <Stack direction="row" spacing={2} useFlexGap sx={{ mb: 3, flexWrap: "wrap" }}>
          <Stat label="Membros da CIPA" value={data.membros} /><Stat label="Brigadistas" value={data.brigadistas} />
          <Stat label="Certificados vencendo (60 dias)" value={data.certificadosVencendo} color={data.certificadosVencendo ? "#B45309" : undefined} />
          <Stat label="Registros de CAT" value={data.catsTotal} /><Stat label="CAT aguardando providência" value={data.catsAbertas} color={data.catsAbertas ? "#B91C1C" : "#15803D"} />
        </Stack>
        {data.catsAbertasLista.length > 0 && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => ir("cat")}>Tratar agora</Button>}>{data.catsAbertasLista.length} ocorrência(s) sem providência confirmada. Os responsáveis são avisados por vários canais até a confirmação.</Alert>}
        <Section title="Próximos treinamentos e reuniões">{data.proximosEventos.length ? data.proximosEventos.map((e: any) => <Typography key={e.id} sx={{ py: .4 }}><b>{dt(e.inicio)}</b> — {e.titulo} <Chip size="small" label={e.tipo} /></Typography>) : <Typography color="text.secondary">Nada agendado.</Typography>}</Section>
      </>)}
    </StateBox>
  );
}

export function CatTab() {
  const { data, loading, error, reload } = useLoad<any[]>("/cipa/cat");
  const { node, dlg, setDlg, run } = useAcoes();
  const [sel, setSel] = useState<any>(null);
  const [det, setDet] = useState<any>(null);
  async function abrir(c: any) { setSel(c); setDet(await eduApi.get(`/cipa/cat/${c.id}`)); }
  return (
    <>
      <Section title="Registro de CAT e ocorrências" description="Ao registrar, os responsáveis recebem aviso no sistema, por e-mail e WhatsApp. Sem confirmação da providência, o aviso é reforçado (4 h) e escalonado (24 h)." actions={<Button variant="contained" color="error" onClick={() => setDlg("cat")}>Comunicar acidente / ocorrência</Button>}>
        <StateBox loading={loading} error={error} onRetry={reload} empty={!data?.length} emptyText="Nenhuma ocorrência registrada.">
          <Table size="small"><TableHead><TableRow><TableCell>Protocolo</TableCell><TableCell>Colaborador</TableCell><TableCell>Data</TableCell><TableCell>Gravidade</TableCell><TableCell>Situação</TableCell><TableCell>Avisos</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>{data?.map((c) => (<TableRow key={c.id}><TableCell>{c.protocolo}</TableCell><TableCell>{c.colaboradorNome}<br /><Typography variant="caption" color="text.secondary">{c.setor}</Typography></TableCell><TableCell>{dt(c.dataOcorrencia)}</TableCell><TableCell><Pill v={c.gravidade} /></TableCell><TableCell><Pill v={c.status} /></TableCell>
              <TableCell>{c.avisos.reduce((s: number, a: any) => s + a.total, 0)}</TableCell><TableCell><Button size="small" onClick={() => abrir(c)}>Abrir</Button></TableCell></TableRow>))}</TableBody></Table>
        </StateBox>
      </Section>
      <Dialog open={!!sel} onClose={() => { setSel(null); setDet(null); }} fullWidth maxWidth="md">
        <DialogTitle>{sel?.protocolo} — {sel?.colaboradorNome}</DialogTitle>
        <DialogContent dividers>
          {det && (<Stack spacing={1.5} useFlexGap>
            <Stack direction="row" spacing={1} useFlexGap><Pill v={det.status} /><Pill v={det.gravidade} /><Chip size="small" label={det.tipo.replace(/_/g, " ")} />{det.afastamento && <Chip size="small" color="warning" label="Com afastamento" />}</Stack>
            <Typography>{det.descricao}</Typography>
            <Typography variant="body2" color="text.secondary">Local: {det.local ?? "—"} · Ocorrência: {dth(det.dataOcorrencia)} · Prazo da providência: {dth(det.prazoProvidenciaEm)}</Typography>
            {det.providencia && <Alert severity="success"><b>Providência confirmada</b> por {det.confirmadoPor} em {dth(det.confirmadoEm)}: {det.providencia}{det.comunicadoOrgaoEm ? ` · CAT comunicada ao órgão em ${dt(det.comunicadoOrgaoEm)}` : ""}</Alert>}
            <Typography sx={{ fontWeight: 700 }}>Avisos enviados</Typography>
            <Table size="small"><TableHead><TableRow><TableCell>Quando</TableCell><TableCell>Canal</TableCell><TableCell>Quem</TableCell><TableCell>Tipo</TableCell><TableCell>Reconhecido</TableCell></TableRow></TableHead>
              <TableBody>{det.avisos.map((a: any) => (<TableRow key={a.id}><TableCell>{dth(a.enviadoEm)}</TableCell><TableCell>{a.canal}</TableCell><TableCell>{a.destinatario}</TableCell><TableCell>{["Inicial", "Reforço", "Escalonamento"][a.nivel]}</TableCell><TableCell>{a.reconhecidoEm ? dth(a.reconhecidoEm) : "Aguardando"}</TableCell></TableRow>))}</TableBody></Table>
          </Stack>)}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setSel(null); setDet(null); }}>Fechar</Button>
          {det && det.status === "REGISTRADA" && <Button onClick={() => run(() => eduApi.post(`/cipa/cat/${det.id}/reconhecer`), "Recebimento reconhecido.", () => { reload(); setSel(null); })}>Reconheço o aviso</Button>}
          {det && ["REGISTRADA", "EM_TRATATIVA"].includes(det.status) && <Button variant="contained" onClick={() => setDlg("prov")}>Registrar providência</Button>}
          {det && det.status === "PROVIDENCIA_CONFIRMADA" && <Button variant="contained" color="success" onClick={() => run(() => eduApi.post(`/cipa/cat/${det.id}/encerrar`), "Ocorrência encerrada.", () => { reload(); setSel(null); })}>Encerrar</Button>}
        </DialogActions>
      </Dialog>
      <FormDialog open={dlg === "cat"} title="Comunicar acidente / ocorrência" onClose={() => setDlg(null)} texto="Registrar e avisar responsáveis" campos={[
        { k: "colaboradorNome", label: "Quem se acidentou", required: true }, { k: "setor", label: "Setor" }, { k: "dataOcorrencia", label: "Data e hora", type: "datetime-local" }, { k: "local", label: "Local" },
        { k: "tipo", label: "Tipo", type: "select", options: [["TIPICO", "Acidente típico"], ["TRAJETO", "Acidente de trajeto"], ["DOENCA_OCUPACIONAL", "Doença ocupacional"], ["INCIDENTE", "Incidente (sem lesão)"]] },
        { k: "gravidade", label: "Gravidade", type: "select", options: [["LEVE", "Leve"], ["MODERADA", "Moderada"], ["GRAVE", "Grave"], ["FATAL", "Fatal"]] },
        { k: "afastamento", label: "Houve afastamento?", type: "select", options: [["", "Não"], ["true", "Sim"]] }, { k: "descricao", label: "O que aconteceu", multiline: true, required: true }]}
        onSave={(v) => run(() => eduApi.post("/cipa/cat", { ...v, afastamento: v.afastamento === "true", dataOcorrencia: iso(v.dataOcorrencia) }), "Ocorrência registrada e responsáveis avisados.", reload)} />
      <FormDialog open={dlg === "prov"} title="Providência tomada" onClose={() => setDlg(null)} texto="Confirmar providência" campos={[{ k: "providencia", label: "O que foi feito para resolver e evitar repetição", multiline: true, required: true }, { k: "comunicadoOrgao", label: "CAT comunicada ao INSS/eSocial?", type: "select", options: [["", "Ainda não"], ["true", "Sim"]] }]}
        onSave={(v) => run(() => eduApi.post(`/cipa/cat/${det.id}/providencia`, { providencia: v.providencia, comunicadoOrgao: v.comunicadoOrgao === "true" }), "Providência confirmada.", () => { reload(); setSel(null); })} />
      {node}
    </>
  );
}

function Lista({ rota, titulo, descricao, colunas, campos, novo, ok }: { rota: string; titulo: string; descricao: string; colunas: Array<[string, (r: any) => any]>; campos: any[]; novo: string; ok: string }) {
  const { data, loading, error, reload } = useLoad<any[]>(`/cipa/${rota}`);
  const { node, dlg, setDlg, run } = useAcoes();
  return (
    <Section title={titulo} description={descricao} actions={<Button variant="contained" onClick={() => setDlg("novo")}>{novo}</Button>}>
      <StateBox loading={loading} error={error} onRetry={reload} empty={!data?.length}>
        <Table size="small"><TableHead><TableRow>{colunas.map(([h]) => <TableCell key={h}>{h}</TableCell>)}<TableCell /></TableRow></TableHead>
          <TableBody>{data?.map((r) => (<TableRow key={r.id}>{colunas.map(([h, f]) => <TableCell key={h}>{f(r)}</TableCell>)}<TableCell><Button size="small" color="error" onClick={() => run(() => eduApi.del(`/cipa/${rota}/${r.id}`), "Removido.", reload)}>Remover</Button></TableCell></TableRow>))}</TableBody></Table>
      </StateBox>
      <FormDialog open={dlg === "novo"} title={novo} campos={campos} onClose={() => setDlg(null)} onSave={(v) => run(() => eduApi.post(`/cipa/${rota}`, Object.fromEntries(Object.entries(v).map(([k, x]) => [k, /^(mandato|certificado|inicio|fim)/.test(k) ? iso(x) : x]))), ok, reload)} />
      {node}
    </Section>
  );
}

export const MembrosTab = () => <Lista rota="membros" titulo="Membros da CIPA" descricao="Composição, representação e mandato." novo="Novo membro" ok="Membro cadastrado." colunas={[["Nome", (r) => r.nome], ["Função", (r) => FUNCOES.find((f) => f[0] === r.funcao)?.[1] ?? r.funcao], ["Representa", (r) => r.representacao === "EMPREGADOR" ? "Empregador" : "Empregados"], ["Setor", (r) => r.setor ?? "—"], ["Mandato até", (r) => dt(r.mandatoFim)]]}
  campos={[{ k: "nome", label: "Nome", required: true }, { k: "funcao", label: "Função", type: "select", options: FUNCOES }, { k: "representacao", label: "Representação", type: "select", options: [["EMPREGADOR", "Empregador"], ["EMPREGADOS", "Empregados"]] }, { k: "setor", label: "Setor" }, { k: "mandatoInicio", label: "Início do mandato", type: "date" }, { k: "mandatoFim", label: "Fim do mandato", type: "date" }, { k: "contato", label: "Contato" }]} />;
export const BrigadaTab = () => <Lista rota="brigada" titulo="Brigada de incêndio e emergência" descricao="Brigadistas, socorristas, turnos e validade do certificado." novo="Novo brigadista" ok="Brigadista cadastrado." colunas={[["Nome", (r) => r.nome], ["Função", (r) => r.funcao.replace(/_/g, " ")], ["Setor", (r) => r.setor ?? "—"], ["Turno", (r) => r.turno ?? "—"], ["Certificado até", (r) => r.certificadoAte && new Date(r.certificadoAte).getTime() < Date.now() + 60 * 86400000 ? <Chip size="small" color="warning" label={dt(r.certificadoAte)} /> : dt(r.certificadoAte)]]}
  campos={[{ k: "nome", label: "Nome", required: true }, { k: "funcao", label: "Função", type: "select", options: [["CHEFE", "Chefe da brigada"], ["LIDER_ANDAR", "Líder de andar/bloco"], ["BRIGADISTA", "Brigadista"], ["SOCORRISTA", "Socorrista"]] }, { k: "setor", label: "Setor" }, { k: "turno", label: "Turno" }, { k: "contato", label: "Contato" }, { k: "certificadoAte", label: "Certificado válido até", type: "date" }]} />;
export const CalendarioTab = () => <Lista rota="eventos" titulo="Calendário de treinamentos, reuniões e simulados" descricao="Agende treinamentos, reuniões da CIPA, simulados de abandono, inspeções e a SIPAT." novo="Novo evento" ok="Evento agendado." colunas={[["Data", (r) => dth(r.inicio)], ["Tipo", (r) => r.tipo], ["Título", (r) => r.titulo], ["Local", (r) => r.local ?? "—"], ["Carga", (r) => r.cargaHoras ? `${r.cargaHoras} h` : "—"], ["Situação", (r) => <Pill v={r.status} />]]}
  campos={[{ k: "tipo", label: "Tipo", type: "select", options: [["TREINAMENTO", "Treinamento"], ["REUNIAO", "Reunião da CIPA"], ["SIMULADO", "Simulado de abandono"], ["SIPAT", "SIPAT"], ["INSPECAO", "Inspeção"]] }, { k: "titulo", label: "Título", required: true }, { k: "inicio", label: "Início", type: "datetime-local", required: true }, { k: "local", label: "Local" }, { k: "instrutor", label: "Instrutor" }, { k: "cargaHoras", label: "Carga horária", type: "number" }, { k: "publico", label: "Público" }]} />;
export const TelefonesTab = () => <Lista rota="contatos" titulo="Números de emergência" descricao="Exibidos para todos os colaboradores." novo="Novo número" ok="Número cadastrado." colunas={[["Nome", (r) => r.nome], ["Número", (r) => <b>{r.numero}</b>], ["Tipo", (r) => r.categoria]]}
  campos={[{ k: "nome", label: "Nome", required: true }, { k: "numero", label: "Número / ramal", required: true }, { k: "categoria", label: "Tipo", type: "select", options: [["EMERGENCIA", "Emergência"], ["INTERNO", "Interno"], ["SAUDE", "Saúde"], ["SEGURANCA", "Segurança"]] }]} />;

export function InstrucoesTab() {
  const { data, loading, error, reload } = useLoad<any[]>("/cipa/instrucoes");
  const tel = useLoad<any[]>("/cipa/contatos");
  const { node, dlg, setDlg, run } = useAcoes();
  return (
    <Section title="Urgência, emergência e primeiros socorros" description="O que fazer, até onde ir e quem chamar. Leitura para todos." actions={<Button variant="contained" onClick={() => setDlg("n")}>Nova instrução</Button>}>
      {(tel.data ?? []).length > 0 && <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: "error.50" }}><Typography sx={{ fontWeight: 800, mb: .5 }}>Números de emergência</Typography><Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>{tel.data!.filter((t) => t.categoria === "EMERGENCIA").map((t) => <Typography key={t.id}><b>{t.numero}</b> {t.nome}</Typography>)}</Stack></Paper>}
      <StateBox loading={loading} error={error} onRetry={reload} empty={!data?.length}>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { md: "repeat(2, 1fr)" } }}>
          {data?.map((i) => (<Paper key={i.id} variant="outlined" sx={{ p: 2 }}><Chip size="small" label={CAT_INSTR[i.categoria] ?? i.categoria} sx={{ mb: 1 }} /><Typography sx={{ fontWeight: 800 }}>{i.titulo}</Typography><Typography variant="body2" sx={{ whiteSpace: "pre-line", mt: .5 }}>{i.passos}</Typography></Paper>))}
        </Box>
      </StateBox>
      <FormDialog open={dlg === "n"} title="Nova instrução" onClose={() => setDlg(null)} campos={[{ k: "categoria", label: "Categoria", type: "select", options: Object.entries(CAT_INSTR) as Array<[string, string]> }, { k: "titulo", label: "Título", required: true }, { k: "passos", label: "Passo a passo", multiline: true, required: true }]} onSave={(v) => run(() => eduApi.post("/cipa/instrucoes", v), "Instrução publicada.", reload)} />
      {node}
    </Section>
  );
}
