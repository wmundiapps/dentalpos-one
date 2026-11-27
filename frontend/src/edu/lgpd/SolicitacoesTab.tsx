import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Pagination, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { COLORS, FormDialog, Kpi, KpiRow, LoadBox, Pick, Section, Status, call, fmtDate, fmtDateTime, itemsOf, useApi, useRunner, useToast } from "../desempenho/kit";
import { PrazoChip, STATUS_SOLICITACAO, TIPOS_SOLICITACAO, baixar } from "./common";

const ABERTAS = ["ABERTA", "EM_ANALISE", "AGUARDANDO_TITULAR"];

function Plano({ plano }: { plano: any }) {
  return (
    <Box>
      <Alert severity="info" sx={{ mb: 1 }}>{plano.excecaoArt16}</Alert>
      <Table size="small">
        <TableHead><TableRow><TableCell>Dado</TableCell><TableCell>Ação</TableCell><TableCell align="right">Registros</TableCell><TableCell align="right">Alterados</TableCell><TableCell>Fundamento / observação</TableCell></TableRow></TableHead>
        <TableBody>
          {plano.itens.map((i: any) => (
            <TableRow key={i.model}>
              <TableCell>{i.titulo}{i.sensivel && <Chip size="small" color="warning" label="sensível" sx={{ ml: 0.5 }} />}</TableCell>
              <TableCell><Chip size="small" color={i.acaoPlanejada === "MANTER" ? "default" : i.acaoPlanejada === "ELIMINAR" ? "error" : "warning"} label={i.acaoPlanejada === "MANTER" ? "MANTIDO (art. 16)" : i.acaoPlanejada} /></TableCell>
              <TableCell align="right">{i.registros}</TableCell><TableCell align="right">{i.aplicaveis}</TableCell>
              <TableCell sx={{ maxWidth: 360 }}><Typography variant="caption">{i.motivo ?? ""}</Typography></TableCell>
            </TableRow>
          ))}
          {plano.aluno && <TableRow><TableCell>Cadastro do aluno</TableCell><TableCell>{plano.aluno.acao}</TableCell><TableCell align="right">1</TableCell><TableCell align="right">{plano.aluno.acao === "ANONIMIZAR" ? 1 : 0}</TableCell><TableCell><Typography variant="caption">{plano.aluno.motivo}</Typography></TableCell></TableRow>}
          {plano.usuario && <TableRow><TableCell>Conta de acesso</TableCell><TableCell>{plano.usuario.acao}</TableCell><TableCell align="right">1</TableCell><TableCell align="right">{plano.usuario.acao === "ANONIMIZAR" ? 1 : 0}</TableCell><TableCell><Typography variant="caption">{plano.usuario.motivo}</Typography></TableCell></TableRow>}
        </TableBody>
      </Table>
      <Typography variant="body2" sx={{ mt: 1 }}>Total de alterações: <b>{plano.totalAlteracoes}</b> · consentimentos ativos a revogar: <b>{plano.consentimentosAtivos}</b></Typography>
    </Box>
  );
}

function Detalhe({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const [rev, setRev] = useState(0);
  const [dlg, setDlg] = useState<null | "identidade" | "responder" | "info" | "prorrogar" | "cancelar" | "corrigir" | "vincular">(null);
  const [plano, setPlano] = useState<any>(null);
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<any[]>([]);
  const { toast, node } = useToast();
  const after = () => { setRev((x) => x + 1); onChange(); };
  const run = useRunner(toast, after);
  const s = useApi<any>(`/lgpd/solicitacoes/${id}`, [rev]);
  const d = s.data;
  const aberta = d && ABERTAS.includes(d.status);
  const base = `/lgpd/solicitacoes/${id}`;
  async function procurar() { const r = await call("GET", `/lgpd/titulares/buscar?q=${encodeURIComponent(busca)}`); setAchados(r.items || []); }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>{d ? `${d.protocolo} — ${d.tipoRotulo}` : "Solicitação"}</DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={s.loading} error={s.error} onRetry={s.reload}>
          {d && (
            <>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
                <Status value={d.status} /><PrazoChip estado={d.prazoEstado} dias={d.diasRestantes} />
                <Chip size="small" variant="outlined" label={`Prazo: ${fmtDate(d.prorrogadoEm ?? d.prazoEm)}`} />
                {d.menor && <Chip size="small" color="warning" label="Titular menor de 18 anos" />}
                {d.identidadeVerificadaEm ? <Chip size="small" color="success" label={`Identidade verificada (${d.identidadeMetodo})`} /> : <Chip size="small" color="error" label="Identidade NÃO verificada" />}
              </Box>
              <Typography variant="body2"><b>Solicitante:</b> {d.nome} · {d.email}{d.telefone ? ` · ${d.telefone}` : ""}{d.documento ? ` · CPF ${d.documento}` : ""}</Typography>
              {d.responsavelNome && <Typography variant="body2"><b>Responsável legal:</b> {d.responsavelNome} ({d.responsavelParentesco})</Typography>}
              <Typography sx={{ whiteSpace: "pre-wrap", my: 1.5 }}>{d.descricao || "—"}</Typography>
              <Box sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 2, mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Cadastro vinculado</Typography>
                {d.titularId ? <Typography variant="body2">{d.titularTipo} · {d.titularId}</Typography> : (
                  <>
                    <Typography variant="body2" color="text.secondary">Ainda não vinculada. Sugestões pelo e-mail/nome informados:</Typography>
                    {(d.sugestoes || []).map((x: any) => <Box key={x.id} sx={{ display: "flex", gap: 1, alignItems: "center" }}><Typography variant="body2">{x.tipo} · {x.nome} · {x.detalhe}</Typography><Button size="small" onClick={() => run(() => call("POST", `${base}/vincular`, { titularTipo: x.tipo, titularId: x.id }), "Vinculada.")}>Vincular</Button></Box>)}
                    <Box sx={{ display: "flex", gap: 1, mt: 1 }}><TextField size="small" label="Buscar por nome, RA, CPF ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} sx={{ minWidth: 280 }} /><Button onClick={procurar} disabled={busca.length < 3}>Buscar</Button></Box>
                    {achados.map((x) => <Box key={x.id} sx={{ display: "flex", gap: 1, alignItems: "center" }}><Typography variant="body2">{x.tipo} · {x.nome} · {x.detalhe}</Typography><Button size="small" onClick={() => run(() => call("POST", `${base}/vincular`, { titularTipo: x.tipo, titularId: x.id }), "Vinculada.")}>Vincular</Button></Box>)}
                  </>
                )}
              </Box>
              {aberta && (
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
                  <Button size="small" variant="outlined" onClick={() => run(() => call("POST", `${base}/atribuir`, {}), "Atribuída a você.")}>Assumir</Button>
                  {d.titularId && !d.identidadeVerificadaEm && <Button size="small" variant="contained" onClick={() => setDlg("identidade")}>Verificar identidade</Button>}
                  {d.titularId && d.identidadeVerificadaEm && ["ACESSO", "PORTABILIDADE", "CONFIRMACAO", "INFO_COMPARTILHAMENTO"].includes(d.tipo) && (
                    <Button size="small" variant="contained" onClick={() => run(() => baixar(`${base}/pacote`, `pacote-titular-${d.protocolo}.json`), "Pacote gerado e baixado (guarde com segurança).")}>Gerar e baixar pacote (JSON)</Button>
                  )}
                  {d.titularId && d.identidadeVerificadaEm && ["ANONIMIZACAO", "ELIMINACAO", "REVOGACAO_CONSENTIMENTO", "OPOSICAO"].includes(d.tipo) && (
                    <>
                      <Button size="small" variant="outlined" onClick={async () => { const r = await run(() => call("POST", `${base}/executar`, { dryRun: true }), "Simulação concluída (nada foi alterado)."); if (r?.plano) setPlano(r.plano); else if (r) toast({ type: "info", text: `Consentimentos ativos: ${r.consentimentosAtivos}` }); }}>Simular (dry-run)</Button>
                      <Button size="small" color="error" variant="contained" onClick={async () => { const r = await run(() => call("POST", `${base}/executar`, { dryRun: false, confirmar: true }), "Executado.", "Executar de forma IRREVERSÍVEL? Registros de guarda obrigatória serão mantidos (art. 16)."); if (r?.resultado) setPlano(null); }}>Executar</Button>
                    </>
                  )}
                  {d.titularId && d.identidadeVerificadaEm && d.tipo === "CORRECAO" && <Button size="small" variant="outlined" onClick={() => setDlg("corrigir")}>Aplicar correção</Button>}
                  <Button size="small" onClick={() => setDlg("info")}>Pedir informação ao titular</Button>
                  {!d.prorrogadoEm && <Button size="small" color="warning" onClick={() => setDlg("prorrogar")}>Prorrogar prazo</Button>}
                  <Button size="small" variant="contained" color="success" onClick={() => setDlg("responder")}>Responder</Button>
                  <Button size="small" color="error" onClick={() => setDlg("cancelar")}>Cancelar</Button>
                </Box>
              )}
              {plano && <Section title="Simulação (nada foi alterado)"><Plano plano={plano} /></Section>}
              {d.resultadoExecucao && <Alert severity="success" sx={{ mb: 2 }}>Executado em {fmtDateTime(d.executadoEm)} — {JSON.stringify(d.resultadoExecucao).slice(0, 400)}</Alert>}
              {d.resposta && <Alert severity="success" sx={{ mb: 2, whiteSpace: "pre-wrap" }}><b>Resposta enviada:</b> {d.resposta}{d.justificativaNegativa ? `\n\nJustificativa: ${d.justificativaNegativa}` : ""}</Alert>}
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Trilha de auditoria</Typography>
              {(d.trilha || []).map((t: any) => <Typography key={t.id} variant="body2">• {fmtDateTime(t.createdAt)} — {t.acao}{t.ator ? ` (${t.ator})` : ""}{t.detalhe?.texto ? `: ${t.detalhe.texto}` : ""}</Typography>)}
            </>
          )}
        </LoadBox>
        <FormDialog open={dlg === "identidade"} title="Verificar identidade do titular" intro={<Alert severity="info" sx={{ mb: 2 }}>Confirme que quem pede é o titular (ou seu representante legal) antes de entregar ou alterar dados.</Alert>}
          fields={[{ key: "metodo", label: "Método", type: "select", required: true, options: ["DOCUMENTO_COM_FOTO", "CONFIRMACAO_POR_EMAIL_CADASTRADO", "PRESENCIAL", "PERGUNTAS_DE_CONFERENCIA", "CERTIFICADO_DIGITAL"] }, { key: "observacao", label: "Observação", type: "textarea" }]}
          onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", `${base}/verificar-identidade`, b); after(); }} />
        <FormDialog open={dlg === "responder"} title="Responder ao titular" fields={[{ key: "resultado", label: "Resultado", type: "select", required: true, options: ["ATENDIDA", "ATENDIDA_PARCIALMENTE", "NEGADA"] }, { key: "resposta", label: "Resposta (linguagem simples)", type: "textarea", required: true }, { key: "justificativa", label: "Justificativa/fundamento legal (obrigatória em negativa ou atendimento parcial; ex.: art. 16)", type: "textarea" }]}
          onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", `${base}/responder`, b); after(); }} />
        <FormDialog open={dlg === "info"} title="Pedir informação ao titular" fields={[{ key: "mensagem", label: "O que falta?", type: "textarea", required: true }]} onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", `${base}/status`, { status: "AGUARDANDO_TITULAR", ...b }); after(); }} />
        <FormDialog open={dlg === "prorrogar"} title="Prorrogar prazo (uma vez)" fields={[{ key: "motivo", label: "Motivo (fica na trilha e é mostrado ao titular)", type: "textarea", required: true }]} onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", `${base}/prorrogar`, b); after(); }} />
        <FormDialog open={dlg === "cancelar"} title="Cancelar solicitação" fields={[{ key: "motivo", label: "Motivo", type: "textarea", required: true }]} onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", `${base}/cancelar`, b); after(); }} />
        <FormDialog open={dlg === "corrigir"} title="Aplicar correção" intro={<Alert severity="info" sx={{ mb: 2 }}>Informe o ID do registro (ver pacote/ cadastro vinculado), o campo e o novo valor.</Alert>}
          fields={[{ key: "entidade", label: "Entidade", type: "select", required: true, options: ["student", "admCandidato", "apoEgresso", "comContato", "user"] }, { key: "registroId", label: "ID do registro", required: true, helper: d?.titularId }, { key: "campo", label: "Campo (ex.: nomeCompleto, email, telefone)", required: true }, { key: "valor", label: "Novo valor", required: true }]}
          onClose={() => setDlg(null)} onSubmit={async (b) => { await call("POST", `${base}/corrigir`, { alteracoes: [b] }); after(); }} />
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

export default function SolicitacoesTab() {
  const [rev, setRev] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [tipo, setTipo] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const { toast, node } = useToast();
  const fila = useApi<any>("/lgpd/fila", [rev]);
  const l = useApi<any>(`/lgpd/solicitacoes?page=${page}&pageSize=25${status ? `&status=${status}` : ""}${tipo ? `&tipo=${tipo}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`, [rev]);
  const rs = fila.data?.resumo;
  return (
    <Section title="Solicitações dos titulares (art. 18) — fila do encarregado" actions={<Button variant="contained" onClick={() => setNova(true)}>Registrar solicitação (balcão/telefone)</Button>}>
      {node}
      <KpiRow>
        <Kpi title="Abertas" value={rs?.abertas ?? 0} /><Kpi title="Vencidas" value={rs?.vencidas ?? 0} color={COLORS.bad} /><Kpi title="Vencendo (≤5 dias)" value={rs?.vencendo ?? 0} color={COLORS.warn} />
        <Kpi title="Sem responsável" value={rs?.semResponsavel ?? 0} /><Kpi title="Identidade a verificar" value={rs?.semVerificacaoDeIdentidade ?? 0} /><Kpi title="Incidentes abertos" value={rs?.incidentesAbertos ?? 0} color={COLORS.info} />
      </KpiRow>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
        <Pick label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={STATUS_SOLICITACAO.map((s) => ({ value: s, label: s.replace(/_/g, " ") }))} all="Todos" />
        <Pick label="Tipo" value={tipo} onChange={(v) => { setTipo(v); setPage(1); }} options={TIPOS_SOLICITACAO} all="Todos" minWidth={240} />
        <TextField size="small" label="Buscar (protocolo, nome, e-mail)" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} sx={{ minWidth: 260 }} />
      </Box>
      <LoadBox loading={l.loading} error={l.error} empty={!itemsOf(l.data).length} emptyText="Nenhuma solicitação." onRetry={l.reload}>
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Protocolo</TableCell><TableCell>Tipo</TableCell><TableCell>Titular</TableCell><TableCell>Status</TableCell><TableCell>Prazo</TableCell><TableCell>Aberta em</TableCell></TableRow></TableHead>
            <TableBody>
              {itemsOf(l.data).map((s: any) => (
                <TableRow key={s.id} hover sx={{ cursor: "pointer" }} onClick={() => setOpen(s.id)}>
                  <TableCell><b>{s.protocolo}</b></TableCell><TableCell>{s.tipoRotulo}</TableCell><TableCell>{s.nome}<Typography variant="caption" component="div" color="text.secondary">{s.email}</Typography></TableCell>
                  <TableCell><Status value={s.status} /></TableCell><TableCell><PrazoChip estado={s.prazoEstado} dias={s.diasRestantes} /></TableCell><TableCell>{fmtDate(s.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
        <Pagination sx={{ mt: 2 }} count={Math.max(1, Math.ceil((l.data?.total ?? 0) / 25))} page={page} onChange={(_, p) => setPage(p)} />
      </LoadBox>
      {open && <Detalhe id={open} onClose={() => setOpen(null)} onChange={() => setRev((x) => x + 1)} />}
      <FormDialog open={nova} title="Registrar solicitação em nome do titular" fields={[
        { key: "tipo", label: "Tipo", type: "select", required: true, options: TIPOS_SOLICITACAO }, { key: "canal", label: "Canal", type: "select", required: true, options: ["PRESENCIAL", "TELEFONE", "EMAIL", "PORTAL"] },
        { key: "nome", label: "Nome completo", required: true }, { key: "email", label: "E-mail", required: true }, { key: "telefone", label: "Telefone" }, { key: "documento", label: "CPF" },
        { key: "descricao", label: "Descrição", type: "textarea" }, { key: "menor", label: "Titular menor de 18 anos", type: "bool" },
        { key: "responsavelNome", label: "Responsável legal", hidden: (v) => !v.menor }, { key: "responsavelParentesco", label: "Parentesco", hidden: (v) => !v.menor },
      ]} initial={{ canal: "PRESENCIAL" }} onClose={() => setNova(false)} onSubmit={async (b) => { const r = await call("POST", "/lgpd/solicitacoes", b); toast({ type: "success", text: `Protocolo ${r.protocolo}. Código de acompanhamento (entregue ao titular): ${r.codigoAcompanhamento}` }); setRev((x) => x + 1); }} />
    </Section>
  );
}
