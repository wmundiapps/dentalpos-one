import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useState } from "react";
import { FormDialog, LoadBox, Status, call, fmtDate, fmtNum, itemsOf, useApi, useRunner, useToast, errMsg } from "../desempenho/kit";

type Dlg = null | "triagem" | "revisores" | "decisao" | "editoracao" | "revisao" | "versao";

function Revisores({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const s = useApi<any>(`/pesquisa/submissoes/${id}/sugestao-revisores`);
  const [sel, setSel] = useState<string[]>([]);
  const [forcar, setForcar] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const list: any[] = s.data?.sugestoes || [];
  async function go() {
    try { await call("POST", `/pesquisa/submissoes/${id}/revisores`, { equipeIds: sel, forcarConflito: forcar }); onDone(); onClose(); } catch (e: any) { setErr(errMsg(e)); }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Designar pareceristas</DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>Sugestões por área e carga. Conflitos de interesse (autor, mesma instituição, carga máxima) aparecem bloqueados.</Alert>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        <LoadBox loading={s.loading} error={s.error} empty={!list.length} emptyText="Nenhum parecerista cadastrado na equipe do periódico. Cadastre-os na aba Cadastros." onRetry={s.reload}>
          <Table size="small">
            <TableHead><TableRow><TableCell /><TableCell>Parecerista</TableCell><TableCell>Áreas</TableCell><TableCell>Carga</TableCell><TableCell>Situação</TableCell></TableRow></TableHead>
            <TableBody>
              {list.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell padding="checkbox"><Checkbox disabled={c.bloqueado && !forcar} checked={sel.includes(c.id)} onChange={(_, ck) => setSel(ck ? [...sel, c.id] : sel.filter((x) => x !== c.id))} /></TableCell>
                  <TableCell>{c.nome}<Typography variant="caption" color="text.secondary" component="div">{c.instituicao ?? ""}</Typography></TableCell>
                  <TableCell>{(c.areas || []).join(", ") || "—"}</TableCell><TableCell>{c.cargaAtual}</TableCell>
                  <TableCell>{c.bloqueado ? <Chip size="small" color="error" label={(c.motivos || []).join("; ")} /> : <Chip size="small" color="success" label={`afinidade ${c.afinidade}`} />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </LoadBox>
        <Box sx={{ mt: 1 }}><Checkbox checked={forcar} onChange={(_, v) => setForcar(v)} /> Forçar designação apesar de conflito (coordenação)</Box>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={!sel.length} onClick={go}>Convidar {sel.length || ""} parecerista(s)</Button></DialogActions>
    </Dialog>
  );
}

export default function SubmissaoDetalhe({ id, periodicoId, onClose, onChange }: { id: string; periodicoId: string; onClose: () => void; onChange: () => void }) {
  const [rev, setRev] = useState(0);
  const [dlg, setDlg] = useState<Dlg>(null);
  const { toast, node } = useToast();
  const after = () => { setRev((x) => x + 1); onChange(); };
  const run = useRunner(toast, after);
  const s = useApi<any>(`/pesquisa/submissoes/${id}`, [rev]);
  const edicoes = useApi<any>(`/pesquisa/edicoes?periodicoId=${periodicoId}&pageSize=50`);
  const d = s.data;
  const st = d?.status as string | undefined;
  const editor = Array.isArray(d?.revisoes);
  const cons = d?.consolidado;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>{d ? `${d.codigo} — ${d.titulo}` : "Submissão"}</DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={s.loading} error={s.error} onRetry={s.reload}>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
            <Status value={st} /><Chip size="small" label={`Rodada ${d?.rodada ?? 1}`} /><Typography variant="body2" color="text.secondary">Submetido em {fmtDate(d?.dataSubmissao)}</Typography>
            {d?.prazoAutorAte && <Chip size="small" color="warning" label={`Prazo do autor: ${fmtDate(d.prazoAutorAte)}`} />}
            {d?.doi && <Chip size="small" variant="outlined" label={`DOI ${d.doi}`} />}
          </Box>
          {d?.resumo && <Typography variant="body2" sx={{ mb: 1 }}>{d.resumo}</Typography>}
          {(d?.palavrasChave || []).length > 0 && <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 2 }}>{d.palavrasChave.map((k: string) => <Chip key={k} size="small" label={k} />)}</Box>}
          {Array.isArray(d?.autores) && <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 2 }}>Autores: {d.autores.map((a: any) => a.nome).join("; ")}</Typography>}
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
            {editor && ["SUBMETIDO", "TRIAGEM"].includes(st || "") && <Button variant="contained" size="small" onClick={() => setDlg("triagem")}>Triagem editorial</Button>}
            {editor && st === "TRIAGEM" && <Button variant="contained" size="small" onClick={() => setDlg("revisores")}>Designar pareceristas</Button>}
            {editor && st === "EM_REVISAO" && <Button variant="outlined" size="small" onClick={() => setDlg("revisores")}>Convidar mais pareceristas</Button>}
            {editor && ["TRIAGEM", "EM_REVISAO"].includes(st || "") && <Button variant="contained" color="success" size="small" onClick={() => setDlg("decisao")}>Registrar decisão</Button>}
            {editor && st === "ACEITO" && <Button variant="contained" size="small" onClick={() => setDlg("editoracao")}>Encaminhar à editoração</Button>}
            {editor && ["ACEITO", "EDITORACAO"].includes(st || "") && <Button variant="outlined" size="small" onClick={() => setDlg("versao")}>Versão final / editoração</Button>}
            {st === "REVISOES_SOLICITADAS" && <Button variant="contained" size="small" onClick={() => setDlg("revisao")}>Enviar revisão do autor</Button>}
            {!["REJEITADO", "RETIRADO", "PUBLICADO"].includes(st || "") && <Button color="error" size="small" onClick={() => run(() => call("POST", `/pesquisa/submissoes/${id}/retirar`, { motivo: "Retirada pela equipe/autor" }), "Submissão retirada.", "Retirar esta submissão do fluxo editorial?")}>Retirar</Button>}
          </Box>
          {editor && (
            <>
              {cons?.sugestao && <Alert severity={cons.divergente ? "warning" : "info"} sx={{ mb: 2 }}>Sugestão consolidada dos pareceres: <b>{String(cons.sugestao).replace(/_/g, " ")}</b>{cons.divergente ? " (pareceres divergentes)" : ""}. {cons.motivo}</Alert>}
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Revisões por pares</Typography>
              {!itemsOf({ items: d.revisoes }).length ? <Typography color="text.secondary" variant="body2">Nenhum parecerista designado ainda.</Typography> : (
                <Table size="small">
                  <TableHead><TableRow><TableCell>Parecerista</TableCell><TableCell>Rodada</TableCell><TableCell>Status</TableCell><TableCell>Prazo</TableCell><TableCell>Recomendação</TableCell><TableCell>Nota média</TableCell><TableCell /></TableRow></TableHead>
                  <TableBody>
                    {d.revisoes.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.revisorNome}</TableCell><TableCell>{r.rodada}</TableCell><TableCell><Status value={r.status} /></TableCell><TableCell>{fmtDate(r.prazo)}</TableCell>
                        <TableCell>{r.recomendacao ? String(r.recomendacao).replace(/_/g, " ") : "—"}</TableCell><TableCell>{fmtNum(r.notaMedia)}</TableCell>
                        <TableCell align="right">{["CONVIDADO", "ACEITO"].includes(r.status) && <Button size="small" color="warning" onClick={() => run(() => call("POST", `/pesquisa/revisoes/${r.id}/cancelar`, { motivo: "Cancelado pelo editor" }), "Revisão cancelada.", "Cancelar este convite/revisão?")}>Cancelar</Button>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
          {!editor && Array.isArray(d?.pareceres) && d.pareceres.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Pareceres recebidos (anônimos)</Typography>
              {d.pareceres.map((p: any, i: number) => <Alert key={i} severity="info" sx={{ my: 1 }}><b>{p.parecerista}</b> — {String(p.recomendacao ?? "").replace(/_/g, " ")}<br />{p.comentarioAutor}</Alert>)}
            </Box>
          )}
          {(d?.decisoes || []).length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Decisões editoriais</Typography>
              {d.decisoes.map((x: any) => <Typography key={x.id} variant="body2">{fmtDate(x.createdAt)} · rodada {x.rodada} · <b>{String(x.decisao).replace(/_/g, " ")}</b> — {x.justificativa}</Typography>)}
            </Box>
          )}
          {(d?.versoes || []).length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Versões do manuscrito</Typography>
              {d.versoes.map((v: any) => <Typography key={v.id} variant="body2">v{v.numero} · {v.tipo} · {fmtDate(v.createdAt)}{v.arquivoUrl ? ` · ${v.arquivoUrl}` : ""}</Typography>)}
            </Box>
          )}
        </LoadBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      <FormDialog open={dlg === "triagem"} onClose={() => setDlg(null)} maxWidth="sm" title="Triagem editorial (desk review)" initial={{ aprovar: true }}
        fields={[{ key: "aprovar", label: "Aprovar para revisão por pares (checklist formal)", type: "bool" }, { key: "similaridadePct", label: "Similaridade apurada (%)", type: "number", helper: "Acima de 30% reprova o checklist" }, { key: "observacao", label: "Observação / justificativa", type: "textarea", helper: "Obrigatória para rejeitar" }]}
        onSubmit={async (b) => { await call("POST", `/pesquisa/submissoes/${id}/triagem`, b); toast({ type: "success", text: b.aprovar ? "Aprovado na triagem." : "Rejeitado na triagem; autores notificados." }); after(); }} />
      <FormDialog open={dlg === "decisao"} onClose={() => setDlg(null)} maxWidth="md" title="Decisão editorial" initial={{ decisao: cons?.sugestao || "REVISOES_MENORES" }}
        fields={[{ key: "decisao", label: "Decisão", type: "select", options: ["ACEITAR", "REVISOES_MENORES", "REVISOES_MAIORES", "REJEITAR"], required: true }, { key: "prazoRevisaoDias", label: "Prazo de revisão (dias)", type: "number", hidden: (v) => !String(v.decisao || "").startsWith("REVISOES") },
          { key: "justificativa", label: "Justificativa (interna)", type: "textarea", required: true, helper: "Mín. 10 caracteres" }, { key: "cartaAutor", label: "Carta ao autor", type: "textarea", required: true, helper: "Os comentários anônimos dos pareceristas são anexados automaticamente" },
          { key: "forcar", label: "Forçar decisão sem pareceres suficientes (coordenação)", type: "bool" }]}
        onSubmit={async (b) => { await call("POST", `/pesquisa/submissoes/${id}/decisao`, b); toast({ type: "success", text: "Decisão registrada; autores notificados." }); after(); }} />
      <FormDialog open={dlg === "editoracao"} onClose={() => setDlg(null)} maxWidth="sm" title="Encaminhar à editoração"
        fields={[{ key: "edicaoId", label: "Edição", type: "select", required: true, options: itemsOf(edicoes.data).filter((e) => e.status !== "PUBLICADA").map((e) => ({ value: e.id, label: `v.${e.volume} n.${e.numero} (${e.ano})${e.titulo ? " — " + e.titulo : ""}` })) },
          { key: "doi", label: "DOI" }, { key: "paginaInicial", label: "Página inicial", type: "number" }, { key: "paginaFinal", label: "Página final", type: "number" }, { key: "ordemNaEdicao", label: "Ordem na edição", type: "number" }]}
        onSubmit={async (b) => { await call("POST", `/pesquisa/submissoes/${id}/editoracao`, b); after(); }} />
      <FormDialog open={dlg === "versao"} onClose={() => setDlg(null)} maxWidth="sm" title="Registrar versão" initial={{ tipo: "FINAL" }}
        fields={[{ key: "tipo", label: "Tipo", type: "select", options: ["FINAL", "EDITORACAO"], required: true }, { key: "arquivoUrl", label: "Link do arquivo", required: true }, { key: "resumoAlteracoes", label: "Resumo das alterações", type: "textarea" }]}
        onSubmit={async (b) => { await call("POST", `/pesquisa/submissoes/${id}/versoes`, b); after(); }} />
      <FormDialog open={dlg === "revisao"} onClose={() => setDlg(null)} maxWidth="sm" title="Enviar manuscrito revisado" initial={{ reconvidarAnteriores: true }}
        fields={[{ key: "arquivoUrl", label: "Link do manuscrito revisado", required: true }, { key: "cartaResposta", label: "Carta-resposta aos pareceristas", type: "textarea", required: true, helper: "Detalhe as alterações (mín. 30 caracteres)" }, { key: "resumoAlteracoes", label: "Resumo das alterações", type: "textarea" }, { key: "reconvidarAnteriores", label: "Reconvidar os pareceristas anteriores", type: "bool" }]}
        onSubmit={async (b) => { await call("POST", `/pesquisa/submissoes/${id}/revisao-autor`, b); toast({ type: "success", text: "Revisão enviada." }); after(); }} />
      {dlg === "revisores" && <Revisores id={id} onClose={() => setDlg(null)} onDone={() => { toast({ type: "success", text: "Pareceristas convidados." }); after(); }} />}
    </Dialog>
  );
}
