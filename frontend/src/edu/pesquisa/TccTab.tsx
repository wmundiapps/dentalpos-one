import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Table, TableBody, TableCell, TableRow, Typography } from "@mui/material";
import { useState } from "react";
import { Bar, COLORS, FormDialog, Kanban, Kpi, KpiRow, LoadBox, Pick, Section, Status, call, fmtDate, fmtDateTime, fmtNum, itemsOf, openHtml, useApi, useCursos, useRunner, useToast } from "../desempenho/kit";

const COLS = ["TEMA", "ORIENTACAO", "PROJETO", "QUALIFICACAO", "BANCA_AGENDADA", "DEFESA", "VERSAO_FINAL", "DEPOSITADO", "REPROVADO", "CANCELADO"];
const COLOR: Record<string, string> = { TEMA: COLORS.mute, ORIENTACAO: COLORS.info, PROJETO: COLORS.info, QUALIFICACAO: "#7a5cff", BANCA_AGENDADA: COLORS.warn, DEFESA: "#e07a00", VERSAO_FINAL: "#5aa86b", DEPOSITADO: COLORS.ok, REPROVADO: COLORS.bad, CANCELADO: COLORS.bad };
const TIPOS = ["TCC", "MONOGRAFIA", "DISSERTACAO", "TESE"];
const CONVITE_COR: Record<string, "success" | "warning" | "error"> = { CONFIRMADO: "success", PENDENTE: "warning", RECUSADO: "error" };

type Dlg = null | "trans" | "banca" | "versao" | "simil" | "result" | "deposito" | "orient" | "dados";

function Detalhe({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const [rev, setRev] = useState(0);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [alvo, setAlvo] = useState("");
  const { toast, node } = useToast();
  const t = useApi<any>(`/pesquisa/trabalhos/${id}`, [rev]);
  const after = () => { setRev((x) => x + 1); onChange(); };
  const run = useRunner(toast, after);
  const d = t.data;
  const banca: any[] = d?.banca || [];
  const prox: Record<string, string[]> = d?.proximasEtapas || {};
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>{d ? `${d.tipo} — ${d.alunoNome}` : "Trabalho"}</DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={t.loading} error={t.error} onRetry={t.reload}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>{d?.titulo}</Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", my: 1, alignItems: "center" }}>
            <Status value={d?.status} /><Chip size="small" label={`Orientador: ${d?.orientadorNome ?? "a definir"}`} />
            {d?.dataDefesa && <Chip size="small" color="warning" label={`Defesa: ${fmtDateTime(d.dataDefesa)}${d.localDefesa ? ` · ${d.localDefesa}` : ""}`} />}
            {d?.similaridadeStatus && <Chip size="small" variant="outlined" label={`Similaridade: ${d.similaridadeStatus.replace(/_/g, " ")}${d.similaridadePct != null ? ` (${fmtNum(d.similaridadePct)}%)` : ""}`} />}
            {d?.resultado && <Chip size="small" color={d.resultado === "REPROVADO" ? "error" : "success"} label={`Resultado: ${d.resultado.replace(/_/g, " ")}${d.notaFinal != null ? ` · ${fmtNum(d.notaFinal)}` : ""}`} />}
          </Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2 }}>Próximas etapas e pendências</Typography>
          {Object.keys(prox).length === 0 ? <Typography color="text.secondary">Ciclo encerrado.</Typography> : Object.entries(prox).map(([para, pend]) => (
            <Box key={para} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", my: 0.5 }}>
              <Button size="small" variant={pend.length ? "outlined" : "contained"} color={/CANCEL|REPROV/.test(para) ? "warning" : "primary"} onClick={() => { setAlvo(para); setDlg("trans"); }}>{para.replace(/_/g, " ")}</Button>
              {pend.length ? pend.map((x) => <Chip key={x} size="small" color="warning" variant="outlined" label={x} />) : <Chip size="small" color="success" label="sem pendências" />}
            </Box>
          ))}
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", my: 2 }}>
            <Button size="small" variant="outlined" onClick={() => setDlg("dados")}>Editar dados / defesa</Button>
            <Button size="small" variant="outlined" onClick={() => setDlg("banca")}>Adicionar membro à banca</Button>
            <Button size="small" variant="outlined" onClick={() => setDlg("versao")}>Registrar versão</Button>
            <Button size="small" variant="outlined" onClick={() => setDlg("simil")}>Similaridade</Button>
            <Button size="small" variant="outlined" onClick={() => setDlg("orient")}>Registrar orientação</Button>
            <Button size="small" variant="outlined" disabled={!banca.length} onClick={() => setDlg("result")}>Resultado da defesa</Button>
            <Button size="small" variant="outlined" disabled={!banca.length} onClick={() => run(() => openHtml(`/pesquisa/trabalhos/${id}/ata?fase=DEFESA`), "Ata aberta em nova aba.")}>Ata da defesa</Button>
            <Button size="small" variant="outlined" disabled={d?.status !== "VERSAO_FINAL"} onClick={() => setDlg("deposito")}>Depositar no repositório</Button>
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Banca examinadora</Typography>
              {!banca.length ? <Typography color="text.secondary">Banca ainda não definida.</Typography> : (
                <Table size="small"><TableBody>
                  {banca.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.nome}<Typography variant="caption" color="text.secondary" component="div">{b.fase} · {b.papel.replace(/_/g, " ")}{b.instituicao ? ` · ${b.instituicao}` : ""}</Typography></TableCell>
                      <TableCell><Chip size="small" color={CONVITE_COR[b.convite] || "default"} label={b.convite} />{b.nota != null && ` ${fmtNum(b.nota)}`}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        {b.convite === "PENDENTE" && <Button size="small" onClick={() => run(() => call("POST", `/pesquisa/banca/${b.id}/convite`, { resposta: "CONFIRMADO" }), "Convite confirmado.")}>Confirmar</Button>}
                        {b.convite === "PENDENTE" && <Button size="small" color="warning" onClick={() => run(() => call("POST", `/pesquisa/banca/${b.id}/convite`, { resposta: "RECUSADO" }), "Recusa registrada.")}>Recusou</Button>}
                        <Button size="small" color="error" onClick={() => run(() => call("DELETE", `/pesquisa/trabalhos/${id}/banca/${b.id}`), "Membro removido.", `Remover ${b.nome} da banca?`)}>Remover</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody></Table>
              )}
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Versões e histórico</Typography>
              {(d?.versoes || []).map((v: any) => <Typography key={v.id} variant="body2">v{v.numero} · {v.tipo} · {fmtDate(v.createdAt)}{v.similaridadePct != null ? ` · similaridade ${fmtNum(v.similaridadePct)}%` : ""}</Typography>)}
              {!(d?.versoes || []).length && <Typography color="text.secondary" variant="body2">Nenhuma versão registrada.</Typography>}
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2 }}>Orientações ({(d?.orientacoes || []).length})</Typography>
              {(d?.orientacoes || []).slice(0, 5).map((o: any) => <Typography key={o.id} variant="body2">{fmtDate(o.data)} — {o.resumo}</Typography>)}
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2 }}>Linha do tempo</Typography>
              {(d?.eventos || []).map((e: any) => <Typography key={e.id} variant="caption" component="div" color="text.secondary">{fmtDate(e.createdAt)} — {e.de ? `${e.de} → ` : ""}{e.para}{e.observacao ? ` (${e.observacao})` : ""}</Typography>)}
            </Box>
          </Box>
        </LoadBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      <FormDialog open={dlg === "trans"} onClose={() => setDlg(null)} maxWidth="sm" title={`Avançar para ${alvo.replace(/_/g, " ")}`} submitLabel="Confirmar"
        fields={[{ key: "observacao", label: "Observação", type: "textarea", required: /CANCEL/.test(alvo), helper: /CANCEL/.test(alvo) ? "Motivo obrigatório para cancelar" : undefined }]}
        onSubmit={async (b) => { await call("POST", `/pesquisa/trabalhos/${id}/transicao`, { para: alvo, ...b }); toast({ type: "success", text: "Etapa registrada; aluno notificado." }); after(); }} />
      <FormDialog open={dlg === "dados"} onClose={() => setDlg(null)} maxWidth="sm" title="Dados do trabalho"
        fields={[{ key: "titulo", label: "Título" }, { key: "orientadorUserId", label: "ID do orientador (coordenação)" }, { key: "coorientadorNome", label: "Coorientador" }, { key: "prazoQualificacao", label: "Prazo de qualificação", type: "date" }, { key: "prazoDefesa", label: "Prazo final de defesa", type: "date" },
          { key: "dataDefesa", label: "Data/hora da defesa", type: "datetime" }, { key: "localDefesa", label: "Local" }, { key: "modoDefesa", label: "Modo", type: "select", options: ["PRESENCIAL", "REMOTA", "HIBRIDA"] }, { key: "linkSala", label: "Link da sala virtual" }, { key: "similaridadeLimite", label: "Limite de similaridade (%)", type: "number" }]}
        initial={d ? { titulo: d.titulo, coorientadorNome: d.coorientadorNome ?? "", localDefesa: d.localDefesa ?? "", modoDefesa: d.modoDefesa ?? "", linkSala: d.linkSala ?? "", similaridadeLimite: d.similaridadeLimite ?? "", prazoDefesa: d.prazoDefesa ? String(d.prazoDefesa).slice(0, 10) : "", prazoQualificacao: d.prazoQualificacao ? String(d.prazoQualificacao).slice(0, 10) : "", dataDefesa: d.dataDefesa ? String(d.dataDefesa).slice(0, 16) : "" } : {}}
        onSubmit={async (b) => { await call("PATCH", `/pesquisa/trabalhos/${id}`, b); after(); }} />
      <FormDialog open={dlg === "banca"} onClose={() => setDlg(null)} maxWidth="sm" title="Membro da banca" initial={{ fase: "DEFESA", papel: "EXAMINADOR_INTERNO" }}
        fields={[{ key: "fase", label: "Fase", type: "select", options: ["QUALIFICACAO", "DEFESA"], required: true }, { key: "papel", label: "Papel", type: "select", options: ["PRESIDENTE", "EXAMINADOR_INTERNO", "EXAMINADOR_EXTERNO", "SUPLENTE"], required: true },
          { key: "nome", label: "Nome", required: true }, { key: "email", label: "E-mail (convite)" }, { key: "instituicao", label: "Instituição" }, { key: "titulacao", label: "Titulação" }]}
        onSubmit={async (b) => { await call("POST", `/pesquisa/trabalhos/${id}/banca`, b); after(); }} />
      <FormDialog open={dlg === "versao"} onClose={() => setDlg(null)} maxWidth="sm" title="Registrar versão do texto" initial={{ tipo: "PROJETO" }}
        fields={[{ key: "tipo", label: "Tipo", type: "select", options: ["PROJETO", "QUALIFICACAO", "DEFESA", "FINAL"], required: true }, { key: "arquivoUrl", label: "Link do arquivo" }, { key: "texto", label: "Texto (para verificação de similaridade interna)", type: "textarea" }, { key: "observacoes", label: "Observações", type: "textarea" }]}
        onSubmit={async (b) => { await call("POST", `/pesquisa/trabalhos/${id}/versoes`, b); after(); }} />
      <FormDialog open={dlg === "simil"} onClose={() => setDlg(null)} maxWidth="sm" title="Verificação de similaridade" initial={{ auto: true }}
        fields={[{ key: "auto", label: "Calcular automaticamente com a última versão com texto (base interna)", type: "bool" }, { key: "percentual", label: "Ou informe o percentual (ferramenta externa)", type: "number", hidden: (v) => !!v.auto }, { key: "fonte", label: "Fonte da ferramenta", hidden: (v) => !!v.auto },
          { key: "justificativa", label: "Justificativa (se acima do limite)", type: "textarea" }]}
        onSubmit={async (b) => { const r = await call("POST", `/pesquisa/trabalhos/${id}/similaridade`, b); toast({ type: "info", text: `Similaridade: ${fmtNum(r.percentual)}% (limite ${fmtNum(r.limite, 0)}%) — ${(r.status ?? "registrada").toString().replace(/_/g, " ")}.` }); after(); }} />
      <FormDialog open={dlg === "orient"} onClose={() => setDlg(null)} maxWidth="sm" title="Registro de orientação"
        fields={[{ key: "data", label: "Data", type: "date", required: true }, { key: "duracaoMin", label: "Duração (min)", type: "number" }, { key: "resumo", label: "Resumo da orientação", type: "textarea", required: true }, { key: "encaminhamentos", label: "Encaminhamentos", type: "textarea" }]}
        onSubmit={async (b) => { await call("POST", `/pesquisa/trabalhos/${id}/orientacoes`, b); after(); }} />
      <FormDialog open={dlg === "deposito"} onClose={() => setDlg(null)} maxWidth="sm" title="Depósito no repositório institucional"
        fields={[{ key: "repositorioUrl", label: "URL do repositório", required: true }, { key: "handle", label: "Handle / identificador" }, { key: "autorizaPublicacao", label: "Autor autoriza a publicação aberta", type: "bool" }, { key: "embargoAte", label: "Embargo até", type: "date" }]}
        onSubmit={async (b) => { await call("POST", `/pesquisa/trabalhos/${id}/depositar`, b); toast({ type: "success", text: "Depósito registrado." }); after(); }} />
      <FormDialog open={dlg === "result"} onClose={() => setDlg(null)} maxWidth="sm" title="Resultado da defesa (notas da banca)"
        intro={<Alert severity="info" sx={{ mb: 2 }}>Informe a nota de cada membro titular da banca de defesa. A média e o resultado são calculados pelo sistema.</Alert>}
        fields={[...banca.filter((b) => b.fase === "DEFESA" && b.papel !== "SUPLENTE").map((b) => ({ key: `n_${b.id}`, label: `Nota — ${b.nome}`, type: "number" as const, required: true })), { key: "ressalvas", label: "Ressalvas / correções exigidas", type: "textarea" as const }]}
        onSubmit={async (_b, raw) => {
          const notas = banca.filter((b) => b.fase === "DEFESA" && b.papel !== "SUPLENTE").map((b) => ({ membroId: b.id, nota: Number(raw[`n_${b.id}`]) }));
          const r = await call("POST", `/pesquisa/trabalhos/${id}/resultado`, { notas, ressalvas: raw.ressalvas || undefined });
          toast({ type: "success", text: `Resultado: ${(r.resultado ?? "registrado").toString().replace(/_/g, " ")}${r.media != null ? ` (média ${fmtNum(r.media)})` : ""}.` }); after();
        }} />
    </Dialog>
  );
}

export default function TccTab() {
  const [rev, setRev] = useState(0);
  const [det, setDet] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [tipo, setTipo] = useState("");
  const cursos = useCursos();
  const { toast, node } = useToast();
  const l = useApi<any>(`/pesquisa/trabalhos?pageSize=100${tipo ? `&tipo=${tipo}` : ""}`, [rev]);
  const painel = useApi<any>("/pesquisa/trabalhos-painel", [rev]);
  const rows = itemsOf(l.data);
  const p = painel.data;
  return (
    <Box>
      {node}
      {p && (
        <KpiRow>
          <Kpi title="Defesas nos próximos 30 dias" value={(p.defesasProximas || []).length} color={COLORS.warn} />
          <Kpi title="Com prazo vencido" value={p.atrasados ?? 0} color={p.atrasados ? COLORS.bad : COLORS.ok} />
          <Kpi title="Sem orientador" value={p.semOrientador ?? 0} color={p.semOrientador ? COLORS.bad : COLORS.ok} />
          <Kpi title="Orientadores com carga" value={(p.cargaOrientadores || []).length} />
        </KpiRow>
      )}
      {(p?.defesasProximas || []).length > 0 && (
        <Section title="Agenda de defesas">
          <Table size="small"><TableBody>{p.defesasProximas.map((x: any) => <TableRow key={x.id} hover onClick={() => setDet(x.id)} sx={{ cursor: "pointer" }}><TableCell>{fmtDateTime(x.dataDefesa)}</TableCell><TableCell>{x.alunoNome}</TableCell><TableCell>{x.titulo}</TableCell><TableCell>{x.localDefesa ?? "—"}</TableCell></TableRow>)}</TableBody></Table>
        </Section>
      )}
      <Section title="Trabalhos de conclusão, dissertações e teses" actions={<><Pick label="Tipo" value={tipo} all="Todos" minWidth={140} onChange={setTipo} options={TIPOS.map((t) => ({ value: t, label: t }))} /><Button variant="contained" onClick={() => setNovo(true)}>Novo trabalho</Button></>}>
        <LoadBox loading={l.loading} error={l.error} empty={!rows.length} emptyText="Nenhum trabalho em andamento." onRetry={l.reload}>
          <Kanban columns={COLS} items={rows} getCol={(r) => r.status} colors={COLOR} onOpen={(r) => setDet(r.id)}
            title={(r) => r.alunoNome} subtitle={(r) => r.titulo} meta={(r) => <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}><Chip size="small" label={r.tipo} />{r.dataDefesa && <Chip size="small" color="warning" label={fmtDate(r.dataDefesa)} />}{!r.orientadorUserId && <Chip size="small" color="error" label="sem orientador" />}</Box>} />
        </LoadBox>
      </Section>
      {(p?.cargaOrientadores || []).length > 0 && (
        <Section title="Carga de orientação">{p.cargaOrientadores.slice(0, 10).map((o: any) => <Bar key={o.orientadorUserId} label={o.orientadorUserId} value={o.orientandos} max={Math.max(...p.cargaOrientadores.map((x: any) => x.orientandos), 1)} right={`${o.orientandos} orientando(s)`} />)}</Section>
      )}
      <FormDialog open={novo} onClose={() => setNovo(false)} title="Novo trabalho" submitLabel="Criar"
        fields={[{ key: "tipo", label: "Tipo", type: "select", options: TIPOS, required: true }, { key: "studentId", label: "Aluno", type: "student", helper: "Deixe em branco se você é o aluno" }, { key: "titulo", label: "Título (provisório)", required: true }, { key: "programId", label: "Curso", type: "select", options: cursos },
          { key: "tema", label: "Tema" }, { key: "coorientadorNome", label: "Coorientador" }, { key: "prazoQualificacao", label: "Prazo de qualificação", type: "date" }, { key: "prazoDefesa", label: "Prazo de defesa", type: "date" }, { key: "resumo", label: "Resumo", type: "textarea" }]}
        initial={{ tipo: "TCC" }} onSubmit={async (b) => { await call("POST", "/pesquisa/trabalhos", b); toast({ type: "success", text: "Trabalho criado na fase TEMA." }); setRev((x) => x + 1); }} />
      {det && <Detalhe id={det} onClose={() => setDet(null)} onChange={() => setRev((x) => x + 1)} />}
    </Box>
  );
}
