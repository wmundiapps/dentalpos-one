import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, LinearProgress, MenuItem, Paper, Tab, Tabs, TextField, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useState } from "react";
import { openHtml } from "../desempenho/kit";
import {
  AD, AVISO_AGENTE, GravidadeChip, LoadBox, ResultadoChip, StatusChip, call, errMsg, fmtDateTime, label, rotuloOrigem, slaTexto, useApi, useRunner, useToast,
} from "./kit";

const DECISOES: Array<{ value: string; label: string }> = [
  { value: "APROVAR", label: "Aprovar" }, { value: "APROVAR_COM_RESSALVA", label: "Aprovar com ressalva" }, { value: "SOLICITAR_NOVO_DOCUMENTO", label: "Solicitar novo documento" }, { value: "REJEITAR", label: "Rejeitar" },
];
const CAMPOS_EDIT: Array<[string, string, "text" | "number" | "bool"]> = [
  ["nome", "Nome", "text"], ["cpf", "CPF", "text"], ["dataNascimento", "Data de nascimento (aaaa-mm-dd)", "text"], ["instituicao", "Instituição", "text"], ["codigoIes", "Código e-MEC / da escola", "text"], ["curso", "Curso", "text"],
  ["cargaHorariaTotal", "Carga horária total", "number"], ["dataEmissao", "Data de emissão", "text"], ["dataConclusao", "Data de conclusão", "text"], ["numeroDocumento", "Nº do documento/registro", "text"],
  ["assinaturaDigital", "Tem assinatura digital", "bool"], ["qrCode", "Tem QR Code", "bool"],
];

export default function CasoDetalhe({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const theme = useTheme();
  const full = useMediaQuery(theme.breakpoints.down("md"));
  const [rev, setRev] = useState(0);
  const d = useApi<any>(`${AD}/casos/${id}`, [rev]);
  const [aba, setAba] = useState(0);
  const { toast, node } = useToast();
  const reload = () => { setRev((x) => x + 1); onChanged(); };
  const run = useRunner(toast, reload);
  const [decOpen, setDecOpen] = useState(false);
  const [dec, setDec] = useState({ decisao: "APROVAR", justificativa: "" });
  const [dadosOpen, setDadosOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [dados, setDados] = useState<any>(null);
  const [errD, setErrD] = useState<string | null>(null);
  const [editDoc, setEditDoc] = useState<any>(null);
  const [vals, setVals] = useState<Record<string, any>>({});
  const [novoDoc, setNovoDoc] = useState(false);
  const [coment, setComent] = useState("");
  const [resolver, setResolver] = useState<any>(null);
  const [nota, setNota] = useState("");
  const c = d.data;

  async function verDados() {
    setErrD(null);
    try { setDados(await call("GET", `${AD}/casos/${id}/campos?motivo=${encodeURIComponent(motivo)}`)); } catch (e: any) { setErrD(errMsg(e)); }
  }
  async function salvarCampos() {
    const campos: Record<string, any> = {};
    for (const [k, , t] of CAMPOS_EDIT) { const v = vals[k]; if (v === undefined || v === "") continue; campos[k] = t === "number" ? Number(v) : v; }
    if (!Object.keys(campos).length) { toast({ type: "info", text: "Nenhum campo preenchido." }); return; }
    const r = await run(() => call("PATCH", `${AD}/casos/${id}/documentos/${editDoc.id}/campos`, { campos }), "Campos salvos e caso reanalisado.");
    if (r) setEditDoc(null);
  }
  const bloqueado = c?.bloqueado;

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg" fullScreen={full}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="overline" color="text.secondary">{c ? `${c.codigo} · ${rotuloOrigem(c.origem)} · ${label(c.contexto)}` : "Caso"}</Typography>
          <Typography variant="h6" sx={{ fontWeight: 800, overflowWrap: "anywhere" }}>{c?.titulo ?? "Carregando…"}</Typography>
        </Box>
        <Button onClick={onClose} startIcon={<CloseIcon />}>Fechar</Button>
      </DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={d.loading && !c} error={d.error} onRetry={d.reload}>
          {c && (
            <>
              {bloqueado && <Alert severity="error" sx={{ mb: 2 }}><b>Processo bloqueado.</b> Há achado CRÍTICO sem decisão humana registrada. A reitoria e a diretoria do setor ({label(c.diretoria)}) foram avisadas{c.criticoNotificadoEm ? ` em ${fmtDateTime(c.criticoNotificadoEm)}` : ""}.</Alert>}
              {c.aviso && <Alert severity="warning" sx={{ mb: 2 }}>{c.aviso}</Alert>}
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", mb: 1.5 }}>
                <ResultadoChip r={c.resultado} /> <StatusChip s={c.status} />
                <Chip size="small" variant="outlined" label={`Risco ${c.score ?? "—"}/100`} />
                <Chip size="small" variant="outlined" label={`SLA: ${slaTexto(c)}`} color={c.status && ["EM_FILA", "EM_REVISAO"].includes(c.status) && new Date(c.slaEm) < new Date() ? "error" : "default"} />
                {c.sujeitoNome && <Chip size="small" variant="outlined" label={`Titular: ${c.sujeitoNome}`} />}
                {c.responsavelNome && <Chip size="small" variant="outlined" label={`Revisor: ${c.responsavelNome}`} />}
                <Chip size="small" variant="outlined" label={c.modoAnalise === "REGRAS+IA" ? "Regras + IA" : "Regras (sem IA)"} />
              </Box>
              <LinearProgress variant="determinate" value={c.score ?? 0} color={c.score >= 60 ? "error" : c.score >= 25 ? "warning" : "success"} sx={{ height: 8, borderRadius: 4, mb: 1.5 }} />
              <Typography sx={{ mb: 1.5, overflowWrap: "anywhere" }}>{c.resumo}</Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
                <Button variant="contained" onClick={() => setDecOpen(true)} disabled={["APROVADO", "REJEITADO"].includes(c.status)}>Registrar decisão</Button>
                <Button variant="outlined" onClick={() => run(() => call("POST", `${AD}/casos/${id}/analisar`), "Caso reanalisado.")} disabled={c.status === "APROVADO"}>Reanalisar</Button>
                <Button variant="outlined" onClick={() => setNovoDoc(true)} disabled={c.status === "APROVADO"}>Adicionar documento</Button>
                <Button variant="outlined" onClick={() => openHtml(`${AD}/casos/${id}/laudo`).catch((e) => toast({ type: "error", text: errMsg(e) }))}>Laudo imprimível</Button>
                {c.permissoes.verDados && !c.dadosApagadosEm && <Button variant="outlined" color="warning" onClick={() => { setDados(null); setMotivo(""); setDadosOpen(true); }}>Ver dados completos</Button>}
              </Box>
              {c.decisao && <Alert severity={c.decisao.startsWith("APROVAR") ? "success" : "warning"} sx={{ mb: 2 }}>Decisão: <b>{label(c.decisao)}</b> por {c.decididoPorNome || "—"} em {fmtDateTime(c.decididoEm)}. {c.decisaoJustificativa}</Alert>}
              {c.dadosApagadosEm && <Alert severity="info" sx={{ mb: 2 }}>Os dados pessoais cifrados foram apagados em {fmtDateTime(c.dadosApagadosEm)} (política de retenção). Permanecem o laudo, os achados e o histórico.</Alert>}

              <Tabs value={aba} onChange={(_, v) => setAba(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
                <Tab label={`Achados (${c.achados.filter((a: any) => !a.resolvido && a.gravidade !== "INFO").length})`} />
                <Tab label={`Documentos (${c.documentos.length})`} />
                <Tab label={`Equivalências (${c.equivalencias.length})`} />
                <Tab label={`Instituição (${c.consultas.length})`} />
                <Tab label="Histórico" />
              </Tabs>

              {aba === 0 && (
                <Box sx={{ display: "grid", gap: 1.2 }}>
                  {!c.achados.length && <Typography color="text.secondary">Nenhum achado.</Typography>}
                  {c.achados.map((a: any) => (
                    <Paper key={a.id} variant="outlined" sx={{ p: 1.5, borderRadius: 3, opacity: a.resolvido ? 0.6 : 1, borderLeft: `5px solid ${a.gravidade === "CRITICA" ? "#b91c1c" : a.gravidade === "ALTA" ? "#c2410c" : a.gravidade === "MEDIA" ? "#a16207" : "#94a3b8"}` }}>
                      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                        <GravidadeChip g={a.gravidade} /><Typography sx={{ fontWeight: 700, flex: 1, minWidth: 180, overflowWrap: "anywhere" }}>{a.titulo}</Typography>
                        <Chip size="small" variant="outlined" label={label(a.categoria)} />{a.resolvido && <Chip size="small" color="success" label="Resolvido" />}
                      </Box>
                      <Typography variant="body2" sx={{ mt: 0.8, overflowWrap: "anywhere" }}>{a.explicacao}</Typography>
                      {a.sugestao && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}><i>Sugestão: {a.sugestao}</i></Typography>}
                      {a.evidencia && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, overflowWrap: "anywhere" }}>Evidência: {JSON.stringify(a.evidencia)}</Typography>}
                      {a.resolvido && a.resolucaoNota && <Typography variant="caption" sx={{ display: "block", mt: 0.5 }}>Resolução: {a.resolucaoNota}</Typography>}
                      {!a.resolvido && a.gravidade !== "INFO" && !["APROVADO", "REJEITADO"].includes(c.status) && <Button size="small" sx={{ mt: 0.8 }} onClick={() => { setResolver(a); setNota(""); }}>Marcar como resolvido…</Button>}
                    </Paper>
                  ))}
                </Box>
              )}

              {aba === 1 && (
                <Box sx={{ display: "grid", gap: 1.5 }}>
                  {c.documentos.map((x: any, i: number) => (
                    <Paper key={x.id} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mb: 0.5 }}>
                        <Typography sx={{ fontWeight: 800 }}>{i + 1}. {label(x.tipo)}</Typography>
                        <Chip size="small" variant="outlined" label={`Extração: ${label(x.modoExtracao)}`} />
                        <Chip size="small" variant="outlined" label={`Confiança ${Math.round((x.confianca ?? 0) * 100)}%`} />
                        {x.arquivoNome && <Chip size="small" variant="outlined" label={`${x.arquivoNome}${x.tamanho ? ` · ${Math.round(x.tamanho / 1024)} KB` : ""}`} />}
                      </Box>
                      {x.hashArquivo && <Typography variant="caption" color="text.secondary" sx={{ display: "block", overflowWrap: "anywhere" }}>SHA-256: {x.hashArquivo}</Typography>}
                      <Divider sx={{ my: 1 }} />
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>CHECKLIST</Typography>
                      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 0.3, mb: 1 }}>
                        {(x.checklist || []).map((k: any) => <Typography key={k.campo} variant="body2" color={k.ok ? "success.main" : k.obrigatorio ? "error.main" : "text.secondary"}>{k.ok ? "✔" : k.obrigatorio ? "✖" : "–"} {k.item}</Typography>)}
                      </Box>
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>CAMPOS EXTRAÍDOS (mascarados)</Typography>
                      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 0.3 }}>
                        {Object.entries(x.camposResumo || {}).filter(([k]) => k !== "disciplinas").map(([k, v]) => <Typography key={k} variant="body2" sx={{ overflowWrap: "anywhere" }}><b>{label(k)}:</b> {String(v)}</Typography>)}
                      </Box>
                      {x.camposResumo?.disciplinas?.length > 0 && <Typography variant="body2" sx={{ mt: 0.5 }}><b>Disciplinas:</b> {x.camposResumo.disciplinas.map((s: any) => `${s.nome} (${s.cargaHoraria ?? "?"} h${s.nota != null ? `, nota ${s.nota}` : ""})`).join("; ")}</Typography>}
                      {x.metadados && Object.keys(x.metadados).length > 0 && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, overflowWrap: "anywhere" }}>Metadados do arquivo: {JSON.stringify(x.metadados)}</Typography>}
                      {!c.dadosApagadosEm && !["APROVADO", "REJEITADO"].includes(c.status) && <Button size="small" sx={{ mt: 1 }} onClick={() => { setEditDoc(x); setVals({}); }}>Conferir / corrigir campos</Button>}
                    </Paper>
                  ))}
                </Box>
              )}

              {aba === 2 && (
                <Box sx={{ display: "grid", gap: 1.2 }}>
                  {!c.equivalencias.length && <Typography color="text.secondary">Sem sugestões de equivalência: informe o curso de destino e um histórico com disciplinas (Disciplina | CH | Nota | Situação | Ano).</Typography>}
                  {c.equivalencias.map((e: any) => (
                    <Paper key={e.id} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                        <Typography sx={{ fontWeight: 800, flex: 1, minWidth: 200, overflowWrap: "anywhere" }}>{e.origemDisciplina} <small>({e.origemCargaHoraria ?? "—"} h{e.origemNota != null ? `, nota ${e.origemNota}` : ""}{e.origemAno ? `, ${e.origemAno}` : ""})</small></Typography>
                        <Chip size="small" color={e.sugestao === "EQUIVALENCIA" ? "success" : e.sugestao === "DISPENSA_PARCIAL" ? "warning" : "default"} label={label(e.sugestao)} />
                        <Chip size="small" variant="outlined" label={e.decisao === "PENDENTE" ? "Decisão pendente" : label(e.decisao)} color={e.decisao === "ACEITA" ? "success" : e.decisao === "REJEITADA" ? "error" : "default"} />
                      </Box>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>{e.disciplinaNome ? <>Disciplina da matriz: <b>{e.disciplinaNome}</b> ({e.cargaDestino} h) · similaridade {e.similaridade}% · carga coberta {e.razaoCarga}%</> : "Sem disciplina correspondente na matriz."}</Typography>
                      {(e.avisos || []).map((a: any, i: number) => <Alert key={i} severity={a.gravidade === "ALTA" ? "error" : a.gravidade === "MEDIA" ? "warning" : "info"} sx={{ mt: 0.7, py: 0 }}>{a.texto}</Alert>)}
                      {e.decisao === "PENDENTE" && e.sugestao !== "NAO_EQUIVALENTE" && !["APROVADO", "REJEITADO"].includes(c.status) && (
                        <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
                          <Button size="small" variant="outlined" color="success" onClick={() => {
                            const alta = (e.avisos || []).some((a: any) => a.gravidade === "ALTA");
                            const n = alta ? window.prompt("Há avisos de gravidade alta. Informe a justificativa para aceitar (mín. 10 caracteres):") : undefined;
                            if (alta && !n) return;
                            void run(() => call("POST", `${AD}/casos/${id}/equivalencias/${e.id}/decisao`, { decisao: "ACEITA", nota: n || undefined }), "Equivalência aceita.");
                          }}>Aceitar</Button>
                          <Button size="small" variant="outlined" color="error" onClick={() => run(() => call("POST", `${AD}/casos/${id}/equivalencias/${e.id}/decisao`, { decisao: "REJEITADA" }), "Equivalência rejeitada.")}>Rejeitar</Button>
                        </Box>
                      )}
                    </Paper>
                  ))}
                </Box>
              )}

              {aba === 3 && (
                <Box sx={{ display: "grid", gap: 1.2 }}>
                  <Alert severity="info">Verificação de instituições <b>SIMULADA</b> (base local de demonstração, cadastro fictício). Para consulta real ao MEC (e-MEC) e às secretarias estaduais é preciso configurar a integração e credenciais.</Alert>
                  {!c.consultas.length && <Typography color="text.secondary">Nenhuma instituição consultada neste caso.</Typography>}
                  {c.consultas.map((q: any) => (
                    <Paper key={q.id} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                        <Chip size="small" label={q.tipo === "IES" ? "IES (e-MEC)" : "Escola (secretaria estadual)"} />
                        <Typography sx={{ fontWeight: 700 }}>{q.termo}</Typography>
                        <Chip size="small" color={!q.encontrada ? "error" : q.situacao === "REGULAR" ? "success" : "warning"} label={!q.encontrada ? "Não encontrada" : label(q.situacao)} />
                        <Chip size="small" variant="outlined" label={q.simulada ? "Consulta simulada" : `Provedor ${q.provedor}`} />
                      </Box>
                      {q.resultado?.instituicao && <Typography variant="body2" sx={{ mt: 0.5 }}>{q.resultado.instituicao.nome} · código {q.resultado.instituicao.codigo} · {q.resultado.instituicao.uf}{q.resultado.instituicao.secretariaEstadual ? ` · ${q.resultado.instituicao.secretariaEstadual}` : ""}</Typography>}
                    </Paper>
                  ))}
                </Box>
              )}

              {aba === 4 && (
                <Box>
                  <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
                    <TextField size="small" label="Comentário" value={coment} onChange={(e) => setComent(e.target.value)} sx={{ flex: 1, minWidth: 220 }} />
                    <Button variant="outlined" disabled={coment.trim().length < 2} onClick={async () => { const r = await run(() => call("POST", `${AD}/casos/${id}/comentarios`, { texto: coment }), "Comentário registrado."); if (r) setComent(""); }}>Comentar</Button>
                  </Box>
                  {c.eventos.map((e: any) => (
                    <Box key={e.id} sx={{ py: 0.8, borderBottom: "1px solid", borderColor: "divider" }}>
                      <Typography variant="caption" color="text.secondary">{fmtDateTime(e.createdAt)} · {label(e.tipo)} · {e.usuarioNome || "sistema"}</Typography>
                      <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{e.texto}</Typography>
                    </Box>
                  ))}
                </Box>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>{AVISO_AGENTE}</Typography>
            </>
          )}
        </LoadBox>
      </DialogContent>

      {/* decisão humana */}
      <Dialog open={decOpen} onClose={() => setDecOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Registrar decisão humana</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
          {c?.permissoes?.exigeAlcada && !c.permissoes.decidir && <Alert severity="error">Caso CRÍTICO: a decisão cabe à reitoria/administração ou à diretoria do setor.</Alert>}
          {c?.permissoes?.outraPessoaDecide && <Alert severity="warning">Caso CRÍTICO: quem enviou o documento não pode decidir. Peça a outra pessoa.</Alert>}
          {c?.permissoes?.exigeAlcada && c.permissoes.decidir && <Alert severity="info">Decisão sobre caso crítico: a justificativa (mín. 20 caracteres) fica registrada na trilha de auditoria e libera o processo bloqueado.</Alert>}
          <TextField select size="small" label="Decisão" value={dec.decisao} onChange={(e) => setDec({ ...dec, decisao: e.target.value })}>{DECISOES.map((x) => <MenuItem key={x.value} value={x.value}>{x.label}</MenuItem>)}</TextField>
          <TextField size="small" multiline minRows={3} label="Justificativa" required value={dec.justificativa} onChange={(e) => setDec({ ...dec, justificativa: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDecOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={async () => { const r = await run(() => call("POST", `${AD}/casos/${id}/decisao`, dec), "Decisão registrada."); if (r) { setDecOpen(false); setDec({ decisao: "APROVAR", justificativa: "" }); } }}>Registrar</Button>
        </DialogActions>
      </Dialog>

      {/* dados completos (LGPD: motivo + log) */}
      <Dialog open={dadosOpen} onClose={() => setDadosOpen(false)} fullWidth maxWidth="sm" fullScreen={full}>
        <DialogTitle>Dados pessoais completos</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
          <Alert severity="warning">Por padrão o agente mostra dados mascarados. O acesso completo exige um motivo e fica registrado (LGPD).</Alert>
          {errD && <Alert severity="error">{errD}</Alert>}
          {!dados && <TextField size="small" label="Motivo do acesso" value={motivo} onChange={(e) => setMotivo(e.target.value)} />}
          {dados && dados.documentos.map((x: any) => (
            <Paper key={x.id} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
              <Typography sx={{ fontWeight: 800 }}>{label(x.tipo)}</Typography>
              {Object.entries(x.campos || {}).filter(([k]) => k !== "disciplinas").map(([k, v]) => <Typography key={k} variant="body2" sx={{ overflowWrap: "anywhere" }}><b>{label(k)}:</b> {String(v)}</Typography>)}
            </Paper>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDadosOpen(false)}>Fechar</Button>
          {!dados && <Button variant="contained" disabled={motivo.trim().length < 5} onClick={verDados}>Ver dados</Button>}
        </DialogActions>
      </Dialog>

      {/* corrigir campos */}
      <Dialog open={!!editDoc} onClose={() => setEditDoc(null)} fullWidth maxWidth="sm" fullScreen={full}>
        <DialogTitle>Conferir / corrigir campos</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }}>Preencha apenas o que deseja informar ou corrigir (digitação manual substitui a extração). O caso é reanalisado e a edição registra no histórico quais campos mudaram (sem os valores).</Alert>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
            {CAMPOS_EDIT.map(([k, rot, t]) => t === "bool"
              ? <TextField key={k} size="small" select label={rot} value={vals[k] === undefined ? "" : String(vals[k])} onChange={(e) => setVals({ ...vals, [k]: e.target.value === "" ? undefined : e.target.value === "true" })}><MenuItem value="">—</MenuItem><MenuItem value="true">Sim</MenuItem><MenuItem value="false">Não</MenuItem></TextField>
              : <TextField key={k} size="small" type={t === "number" ? "number" : "text"} label={rot} value={vals[k] ?? ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />)}
          </Box>
        </DialogContent>
        <DialogActions><Button onClick={() => setEditDoc(null)}>Cancelar</Button><Button variant="contained" onClick={salvarCampos}>Salvar e reanalisar</Button></DialogActions>
      </Dialog>

      {/* resolver achado */}
      <Dialog open={!!resolver} onClose={() => setResolver(null)} fullWidth maxWidth="sm">
        <DialogTitle>Marcar achado como resolvido</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
          <Typography variant="body2">{resolver?.titulo}</Typography>
          {resolver?.gravidade === "CRITICA" && <Alert severity="warning">Achado crítico: só reitoria/administração ou diretoria do setor.</Alert>}
          <TextField size="small" multiline minRows={2} label="Como foi resolvido (mín. 10 caracteres)" value={nota} onChange={(e) => setNota(e.target.value)} />
        </DialogContent>
        <DialogActions><Button onClick={() => setResolver(null)}>Cancelar</Button><Button variant="contained" onClick={async () => { const r = await run(() => call("POST", `${AD}/casos/${id}/achados/${resolver.id}/resolver`, { nota }), "Achado resolvido."); if (r) setResolver(null); }}>Confirmar</Button></DialogActions>
      </Dialog>

      <NovoDocumento open={novoDoc} origem={c?.origem} onClose={() => setNovoDoc(false)} onSubmit={async (b) => { const r = await run(() => call("POST", `${AD}/casos/${id}/documentos`, b), "Documento adicionado e caso reanalisado."); if (r) setNovoDoc(false); }} />
    </Dialog>
  );
}

function NovoDocumento({ open, origem, onClose, onSubmit }: { open: boolean; origem?: string; onClose: () => void; onSubmit: (b: any) => Promise<void> }) {
  const meta = useApi<any>(open ? `${AD}/meta` : null);
  const [tipo, setTipo] = useState("");
  const [texto, setTexto] = useState("");
  const tipos: any[] = (meta.data?.tipos || []).filter((t: any) => !origem || t.origens.includes(origem));
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Adicionar documento ao caso</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
        <TextField select size="small" label="Tipo" value={tipo || tipos[0]?.codigo || ""} onChange={(e) => setTipo(e.target.value)}>{tipos.map((t) => <MenuItem key={t.codigo} value={t.codigo}>{t.nome}</MenuItem>)}</TextField>
        <TextField size="small" multiline minRows={6} label="Texto do documento / OCR" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={"Nome: ...\nCPF: ...\nData de nascimento: ..."} />
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={!texto.trim()} onClick={() => onSubmit({ tipo: tipo || tipos[0]?.codigo, texto })}>Adicionar</Button></DialogActions>
    </Dialog>
  );
}
