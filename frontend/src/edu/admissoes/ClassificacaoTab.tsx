import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import { eduApi } from "../../services/EduApi";
import { StatusChip } from "../EduResourcePage";
import { Bar, BASE, Section, Stat, StateBox, asList, fmtDate, pct, useLoad, type Toast } from "./common";

const SITUACAO: Record<string, "success" | "warning" | "error"> = { CLASSIFICADO: "success", LISTA_ESPERA: "warning", DESCLASSIFICADO: "error" };
const COMPONENTES = ["PROVA", "REDACAO", "ENEM", "ENTREVISTA", "HISTORICO", "ANALISE_CURRICULAR", "PROJETO"];

function NotasLoteDialog({ processoId, open, onClose, toast, onDone }: { processoId: string; open: boolean; onClose: () => void; toast: (t: Toast) => void; onDone: () => void }) {
  const [texto, setTexto] = useState("");
  const [comp, setComp] = useState("PROVA");
  const [res, setRes] = useState<any>(null);

  async function enviar() {
    // Uma linha por candidato: "protocolo ou CPF;nota" (ex.: ADM-2026-0001;78,5)
    const itens = texto.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const [chave, nota] = l.split(/[;\t]/).map((s) => s.trim());
      const n = Number((nota || "").replace(",", "."));
      const digits = (chave || "").replace(/\D/g, "");
      const ehCpf = digits.length === 11 && !/[A-Za-z]/.test(chave || "");
      return { ...(ehCpf ? { cpf: digits } : { protocolo: chave }), componente: comp, nota: n };
    });
    if (!itens.length || itens.some((i) => Number.isNaN(i.nota))) { toast({ type: "error", text: "Confira o formato: uma linha por candidato, “protocolo ou CPF;nota”." }); return; }
    try {
      const r = await eduApi.post(`${BASE}/processos/${processoId}/notas-lote`, { itens });
      setRes(r);
      toast({ type: r.erros?.length ? "error" : "success", text: `${r.lancados} nota(s) lançada(s), ${r.erros?.length || 0} erro(s).` });
      onDone();
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Lançar notas em lote</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
        <TextField select size="small" label="Componente" value={comp} onChange={(e) => setComp(e.target.value)}>
          {COMPONENTES.map((c) => <MenuItem key={c} value={c}>{c.replace(/_/g, " ")}</MenuItem>)}
        </TextField>
        <TextField multiline minRows={6} label="Notas (0 a 100)" placeholder={"ADM-2026-0001;78,5\n123.456.789-09;64"} value={texto} onChange={(e) => setTexto(e.target.value)}
          helperText="Uma linha por candidato: protocolo ou CPF, ponto e vírgula e a nota." />
        {res?.erros?.length ? (
          <Box>{res.erros.map((e: any) => <Typography key={e.linha} variant="caption" color="error" component="div">Linha {e.linha}: {e.erro}</Typography>)}</Box>
        ) : null}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button><Button variant="contained" onClick={enviar}>Lançar</Button></DialogActions>
    </Dialog>
  );
}

export default function ClassificacaoTab({ toast }: { toast: (t: Toast) => void }) {
  const procs = useLoad<any>(`${BASE}/processos?pageSize=200`);
  const lista = asList(procs.data);
  const [pid, setPid] = useState("");
  const proc = lista.find((p) => p.id === pid);
  const ocup = useLoad<any[]>(pid ? `${BASE}/processos/${pid}/ocupacao` : null);
  const classif = useLoad<any[]>(pid ? `${BASE}/processos/${pid}/classificacao` : null);
  const chamadas = useLoad<any[]>(pid ? `${BASE}/processos/${pid}/chamadas` : null);
  const [sim, setSim] = useState<any>(null);
  const [notas, setNotas] = useState(false);
  const [prazo, setPrazo] = useState("");
  const [busy, setBusy] = useState(false);
  const nomeOferta = useMemo(() => new Map((proc?.ofertas || []).map((o: any) => [o.id, o.nomeCurso])), [proc]);

  function reloadAll() { ocup.reload(); classif.reload(); chamadas.reload(); procs.reload(); }

  async function run(fn: () => Promise<any>, ok: string) {
    setBusy(true);
    try { const r = await fn(); toast({ type: "success", text: ok }); return r; } catch (e: any) { toast({ type: "error", text: e.message }); } finally { setBusy(false); }
  }

  async function classificar(simular: boolean) {
    if (!simular && !window.confirm("Gravar a classificação oficial? Ela não poderá ser refeita depois que houver chamadas.")) return;
    const r = await run(() => eduApi.post(`${BASE}/processos/${pid}/classificar${simular ? "?simular=true" : ""}`), simular ? "Simulação concluída." : "Classificação gravada.");
    if (r) { setSim(simular ? r : null); if (!simular) reloadAll(); }
  }
  async function chamada(simular: boolean) {
    const body: any = { simular };
    if (prazo) body.prazoMatricula = new Date(`${prazo}T23:59:00`).toISOString();
    const r = await run(() => eduApi.post(`${BASE}/processos/${pid}/chamadas`, body), simular ? "Simulação de chamada pronta." : "Chamada gerada e candidatos convocados.");
    if (r) { if (simular) setSim({ chamadaSim: r }); else { setSim(null); reloadAll(); } }
  }
  async function encerrar(id: string) {
    if (!window.confirm("Encerrar a chamada? Convocações pendentes serão expiradas.")) return;
    await run(() => eduApi.post(`${BASE}/chamadas/${id}/encerrar`), "Chamada encerrada."); reloadAll();
  }
  async function renunciar(id: string) {
    const motivo = window.prompt("Motivo da renúncia (opcional):");
    if (motivo === null) return;
    await run(() => eduApi.post(`${BASE}/convocacoes/${id}/renunciar`, motivo ? { motivo } : {}), "Renúncia registrada. Gere nova chamada para preencher a vaga."); reloadAll();
  }

  return (
    <>
      <Section title="Processo seletivo" description="Escolha o processo para lançar notas, classificar e convocar candidatos.">
        <StateBox loading={procs.loading} error={procs.error} onRetry={procs.reload} empty={!lista.length} emptyText="Cadastre um processo seletivo na aba Processos.">
          <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
            <TextField select size="small" label="Processo" sx={{ minWidth: 320 }} value={pid} onChange={(e) => { setPid(e.target.value); setSim(null); }}>
              {lista.map((p) => <MenuItem key={p.id} value={p.id}>{p.codigo} — {p.nome}</MenuItem>)}
            </TextField>
            {proc ? <StatusChip value={proc.status} /> : null}
            {proc ? <Typography variant="body2" color="text.secondary">Nota mínima {proc.notaMinima ?? 0} · prazo de matrícula {proc.diasPrazoMatricula} dia(s)</Typography> : null}
          </Box>
        </StateBox>
      </Section>

      {pid ? (
        <>
          <Section title="Vagas por curso" description="Inscritos, convocados e matriculados em cada oferta.">
            <StateBox loading={ocup.loading} error={ocup.error} onRetry={ocup.reload} empty={!ocup.data?.length} emptyText="Este processo ainda não tem ofertas.">
              <Box sx={{ display: "grid", gap: 2 }}>
                {(ocup.data || []).map((o) => (
                  <Box key={o.ofertaId}>
                    <Bar value={o.matriculados + o.convocadosPendentes} max={o.vagas} color={o.vagasLivres === 0 ? "success" : "primary"}
                      label={`${o.nomeCurso} (${String(o.turno).toLowerCase()}) — ${o.matriculados} matriculados + ${o.convocadosPendentes} convocados de ${o.vagas} vagas · ${o.inscritos} inscritos · ocupação ${pct(o.ocupacaoPct)}`} />
                  </Box>
                ))}
              </Box>
            </StateBox>
          </Section>

          <Section title="Classificação" description="Notas finais, simulação e gravação do resultado."
            actions={<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Button size="small" variant="outlined" onClick={() => setNotas(true)}>Lançar notas em lote</Button>
              <Button size="small" variant="outlined" disabled={busy} onClick={() => classificar(true)}>Simular</Button>
              <Button size="small" variant="contained" disabled={busy} onClick={() => classificar(false)}>Classificar</Button>
            </Box>}>
            {sim?.resumo ? (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Resultado da simulação (nada foi gravado)</Typography>
                <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", my: 1 }}>
                  <Stat label="Classificados" value={sim.resumo.classificados} color="#2e7d32" />
                  <Stat label="Lista de espera" value={sim.resumo.listaEspera} color="#ed6c02" />
                  <Stat label="Desclassificados" value={sim.resumo.desclassificados} color="#d32f2f" />
                </Box>
              </Box>
            ) : null}
            <StateBox loading={classif.loading} error={classif.error} onRetry={classif.reload} empty={!classif.data?.length} emptyText="Sem classificação gravada. Lance as notas, simule e classifique.">
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead><TableRow>{["Pos.", "Protocolo", "Candidato", "Nota", "Curso alocado", "Situação", "Status"].map((h) => <TableCell key={h} sx={{ fontWeight: 800 }}>{h}</TableCell>)}</TableRow></TableHead>
                  <TableBody>
                    {(classif.data || []).map((c) => (
                      <TableRow key={c.id} hover>
                        <TableCell>{c.classificacao}º</TableCell><TableCell>{c.protocolo}</TableCell><TableCell>{c.nome}</TableCell>
                        <TableCell>{c.notaFinal != null ? Number(c.notaFinal).toFixed(1) : "—"}</TableCell>
                        <TableCell>{String(nomeOferta.get(c.ofertaAlocadaId) || "—")}</TableCell>
                        <TableCell><Chip size="small" color={SITUACAO[c.situacaoClassificacao] || "default"} label={String(c.situacaoClassificacao || "—").replace(/_/g, " ")} /></TableCell>
                        <TableCell><StatusChip value={c.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </StateBox>
          </Section>

          <Section title="Chamadas e convocações" description="Cada chamada convoca os próximos da fila para as vagas livres."
            actions={<Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              <TextField size="small" type="date" label="Prazo de matrícula" value={prazo} onChange={(e) => setPrazo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              <Button size="small" variant="outlined" disabled={busy} onClick={() => chamada(true)}>Simular chamada</Button>
              <Button size="small" variant="contained" disabled={busy} onClick={() => chamada(false)}>Gerar chamada</Button>
            </Box>}>
            {sim?.chamadaSim ? (
              <Typography variant="body2" sx={{ mb: 2 }}>Simulação: {sim.chamadaSim.convocacoes?.length || 0} candidato(s) seriam convocados.</Typography>
            ) : null}
            <StateBox loading={chamadas.loading} error={chamadas.error} onRetry={chamadas.reload} empty={!chamadas.data?.length} emptyText="Nenhuma chamada gerada.">
              <Box sx={{ display: "grid", gap: 2 }}>
                {(chamadas.data || []).map((ch) => (
                  <Box key={ch.id} sx={{ border: 1, borderColor: "divider", borderRadius: 3, p: 2 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                      <Typography sx={{ fontWeight: 800 }}>{ch.numero}ª chamada</Typography>
                      <StatusChip value={ch.status} />
                      <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>prazo de matrícula: {fmtDate(ch.prazoMatricula)}</Typography>
                      {ch.status === "ABERTA" ? <Button size="small" color="warning" onClick={() => encerrar(ch.id)}>Encerrar chamada</Button> : null}
                    </Box>
                    <Table size="small" sx={{ mt: 1 }}>
                      <TableBody>
                        {(ch.convocacoes || []).map((cv: any) => (
                          <TableRow key={cv.id}>
                            <TableCell>{cv.candidato?.classificacao}º</TableCell><TableCell>{cv.candidato?.nome}</TableCell>
                            <TableCell>{String(nomeOferta.get(cv.ofertaId) || "")}</TableCell>
                            <TableCell><StatusChip value={cv.status} /></TableCell>
                            <TableCell align="right">{cv.status === "CONVOCADO" ? <Button size="small" color="error" onClick={() => renunciar(cv.id)}>Registrar renúncia</Button> : null}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                ))}
              </Box>
            </StateBox>
          </Section>
          <NotasLoteDialog processoId={pid} open={notas} onClose={() => setNotas(false)} toast={toast} onDone={reloadAll} />
        </>
      ) : null}
    </>
  );
}
