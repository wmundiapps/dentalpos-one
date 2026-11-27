import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Table, TableBody, TableCell, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useState } from "react";
import { Bar, FormDialog, Kpi, KpiRow, LoadBox, Pick, Section, Status, call, fmtDate, fmtDateTime, fmtNum, itemsOf, useApi, useExames, useRunner, useToast, useTurmas } from "./kit";

const TIPOS_KIT = ["QUESTOES_CONTEXTUALIZADAS", "ESTUDO_CASO", "PECA_PRATICA_OAB", "CASO_CLINICO", "LISTA_EXERCICIOS", "REVISAO_TEORICA"];

function Acompanhamento({ id, onClose }: { id: string; onClose: () => void }) {
  const r = useApi<any>(`/desempenho/atribuicoes/${id}/acompanhamento`);
  const [corr, setCorr] = useState<any | null>(null);
  const d = r.data;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Acompanhamento — {d?.atribuicao?.kit?.titulo ?? "Atividade"}</DialogTitle>
      <DialogContent dividers>
        <LoadBox loading={r.loading} error={r.error} onRetry={r.reload}>
          <KpiRow>
            <Kpi title="Entregues" value={`${d?.entregues ?? 0}/${d?.total ?? 0}`} color="#2e9e5b" />
            <Kpi title="Pendentes" value={d?.pendentes ?? 0} color="#e0a100" />
            <Kpi title="Atrasadas" value={d?.atrasadas ?? 0} color="#d64545" />
            <Kpi title="Corrigidas" value={d?.corrigidas ?? 0} hint={`Nota média ${fmtNum(d?.mediaNota)}`} />
          </KpiRow>
          <Bar label="Progresso de entregas" value={d?.entregues ?? 0} max={d?.total || 1} right={`Prazo: ${fmtDate(d?.atribuicao?.prazo)}`} />
          <Table size="small" sx={{ mt: 1 }}>
            <TableHead><TableRow><TableCell>Aluno</TableCell><TableCell>Situação</TableCell><TableCell>Entregue em</TableCell><TableCell>Nota</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>
              {(d?.itens || []).map((e: any) => (
                <TableRow key={e.id} hover>
                  <TableCell>{e.aluno?.nome ?? e.studentId}</TableCell><TableCell><Status value={e.situacao} />{e.foraDoPrazo && <Chip size="small" sx={{ ml: 1 }} color="warning" label="fora do prazo" />}</TableCell>
                  <TableCell>{fmtDateTime(e.entregueEm)}</TableCell><TableCell>{e.nota ?? "—"}</TableCell>
                  <TableCell align="right">{e.entregueEm && <Button size="small" onClick={() => setCorr(e)}>{e.status === "CORRIGIDA" ? "Reavaliar" : "Corrigir"}</Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </LoadBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      <FormDialog open={!!corr} onClose={() => setCorr(null)} title={`Corrigir — ${corr?.aluno?.nome ?? ""}`} maxWidth="sm"
        intro={corr?.texto ? <Alert severity="info" sx={{ mb: 2, whiteSpace: "pre-wrap" }}>{corr.texto}</Alert> : undefined}
        fields={[{ key: "nota", label: "Nota (0-100)", type: "number", required: true }, { key: "feedback", label: "Feedback ao aluno", type: "textarea" }]} initial={corr ? { nota: corr.nota ?? "", feedback: corr.feedback ?? "" } : {}}
        onSubmit={async (b) => { await call("PATCH", `/desempenho/entregas/${corr.id}/corrigir`, b); r.reload(); }} />
    </Dialog>
  );
}

export default function AtividadesTab() {
  const exames = useExames(), turmas = useTurmas();
  const [sub, setSub] = useState("kits");
  const [escopo, setEscopo] = useState("");
  const [rev, setRev] = useState(0);
  const [kitDlg, setKitDlg] = useState<null | { row?: any; prefill?: any }>(null);
  const [iaDlg, setIaDlg] = useState(false);
  const [atrib, setAtrib] = useState<any | null>(null);
  const [acomp, setAcomp] = useState<string | null>(null);
  const [turmaSug, setTurmaSug] = useState("");
  const [exameSug, setExameSug] = useState("");
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const kits = useApi<any>(`/desempenho/kits?pageSize=50${escopo ? `&escopo=${escopo}` : ""}`, [rev]);
  const atrs = useApi<any>(sub === "atribuicoes" ? "/desempenho/atribuicoes?pageSize=50" : null, [rev, sub]);
  const sug = useApi<any>(turmaSug && exameSug ? `/desempenho/sugestoes/turma/${turmaSug}?exameId=${exameSug}` : null);

  const kitFields = [
    { key: "titulo", label: "Título", required: true }, { key: "tipo", label: "Tipo", type: "select" as const, options: TIPOS_KIT, required: true },
    { key: "exameId", label: "Exame relacionado", type: "select" as const, options: exames }, { key: "tempoEstimadoMin", label: "Tempo estimado (min)", type: "number" as const },
    { key: "visibilidade", label: "Visibilidade", type: "select" as const, options: ["PRIVADA", "COMPARTILHADA"] }, { key: "descricao", label: "Descrição", type: "textarea" as const },
    { key: "conteudo", label: "Conteúdo (enunciado, caso, peça…)", type: "textarea" as const, required: true }, { key: "gabaritoComentado", label: "Gabarito comentado", type: "textarea" as const },
  ];

  return (
    <Box>
      {node}
      <ToggleButtonGroup size="small" exclusive value={sub} onChange={(_, v) => v && setSub(v)} sx={{ mb: 2 }}>
        <ToggleButton value="kits">Biblioteca de kits</ToggleButton><ToggleButton value="atribuicoes">Atribuições às turmas</ToggleButton><ToggleButton value="sugestoes">Sugestões por turma</ToggleButton>
      </ToggleButtonGroup>
      {sub === "kits" && (
        <Section title="Kits de atividades (estudos de caso, peças práticas, listas)" actions={<>
          <Pick label="Escopo" value={escopo} all="Todos visíveis" minWidth={160} options={[{ value: "meus", label: "Meus kits" }, { value: "biblioteca", label: "Biblioteca compartilhada" }]} onChange={setEscopo} />
          <Button variant="outlined" onClick={() => setIaDlg(true)}>Gerar com IA</Button>
          <Button variant="contained" onClick={() => setKitDlg({})}>Novo kit</Button>
        </>}>
          <LoadBox loading={kits.loading} error={kits.error} empty={!itemsOf(kits.data).length} emptyText="Nenhum kit ainda. Crie o primeiro ou gere um rascunho com IA." onRetry={kits.reload}>
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead><TableRow><TableCell>Título</TableCell><TableCell>Tipo</TableCell><TableCell>Usos</TableCell><TableCell>Visibilidade</TableCell><TableCell /></TableRow></TableHead>
                <TableBody>
                  {itemsOf(kits.data).map((k) => (
                    <TableRow key={k.id} hover>
                      <TableCell>{k.titulo}</TableCell><TableCell>{k.tipo?.replace(/_/g, " ")}</TableCell><TableCell>{k.usos ?? 0}</TableCell>
                      <TableCell><Chip size="small" label={k.visibilidade === "COMPARTILHADA" ? "Compartilhado" : "Privado"} color={k.visibilidade === "COMPARTILHADA" ? "primary" : "default"} /></TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        <Button size="small" color="success" onClick={() => setAtrib(k)}>Atribuir</Button>
                        <Button size="small" onClick={() => setKitDlg({ row: k })}>Editar</Button>
                        <Button size="small" onClick={() => run(() => call("POST", `/desempenho/kits/${k.id}/compartilhar`, { visibilidade: k.visibilidade === "COMPARTILHADA" ? "PRIVADA" : "COMPARTILHADA" }), "Visibilidade atualizada.")}>{k.visibilidade === "COMPARTILHADA" ? "Tornar privado" : "Compartilhar"}</Button>
                        <Button size="small" onClick={() => run(() => call("POST", `/desempenho/kits/${k.id}/duplicar`), "Kit duplicado.")}>Duplicar</Button>
                        <Button size="small" color="error" onClick={() => run(() => call("DELETE", `/desempenho/kits/${k.id}`), "Kit removido (ou arquivado, se já foi atribuído).", "Remover este kit?")}>Excluir</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </LoadBox>
        </Section>
      )}
      {sub === "atribuicoes" && (
        <Section title="Atribuições às turmas">
          <LoadBox loading={atrs.loading} error={atrs.error} empty={!itemsOf(atrs.data).length} emptyText="Nenhuma atividade atribuída." onRetry={atrs.reload}>
            <Table size="small">
              <TableHead><TableRow><TableCell>Atividade</TableCell><TableCell>Turma</TableCell><TableCell>Prazo</TableCell><TableCell>Entregas</TableCell><TableCell>Status</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>
                {itemsOf(atrs.data).map((a) => (
                  <TableRow key={a.id} hover>
                    <TableCell>{a.kit?.titulo}</TableCell><TableCell>{turmas.find((t) => t.value === a.classSectionId)?.label ?? "—"}</TableCell><TableCell>{fmtDate(a.prazo)}</TableCell>
                    <TableCell>{a._count?.entregas ?? 0}</TableCell><TableCell><Status value={a.status} /></TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <Button size="small" onClick={() => setAcomp(a.id)}>Acompanhar</Button>
                      {a.status === "ABERTA" && <Button size="small" color="warning" onClick={() => run(() => call("POST", `/desempenho/atribuicoes/${a.id}/encerrar`), "Atribuição encerrada.", "Encerrar? Entregas pendentes serão marcadas como não entregues.")}>Encerrar</Button>}
                      {a.status === "ABERTA" && <Button size="small" color="error" onClick={() => run(() => call("POST", `/desempenho/atribuicoes/${a.id}/cancelar`), "Atribuição cancelada.", "Cancelar esta atribuição?")}>Cancelar</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </LoadBox>
        </Section>
      )}
      {sub === "sugestoes" && (
        <Section title="Sugestão de atividades pelas lacunas da turma" actions={<><Pick label="Turma" value={turmaSug} onChange={setTurmaSug} options={turmas} minWidth={240} /><Pick label="Exame" value={exameSug} onChange={setExameSug} options={exames} /></>}>
          {!turmaSug || !exameSug ? <Typography color="text.secondary">Escolha a turma e o exame para cruzar as lacunas dos simulados com os kits da biblioteca.</Typography> : (
            <LoadBox loading={sug.loading} error={sug.error} onRetry={sug.reload}>
              {sug.data?.aviso && <Alert severity="warning" sx={{ mb: 2 }}>{sug.data.aviso}</Alert>}
              <Typography variant="body2" sx={{ mb: 1 }}>{sug.data?.alunos} aluno(s) · {sug.data?.comSimulado} com simulado realizado</Typography>
              {(sug.data?.semKitParaLacunas || []).length > 0 && <Alert severity="info" sx={{ mb: 1 }}>Há {sug.data.semKitParaLacunas.length} eixo(s) com lacuna e sem kit na biblioteca: crie atividades para eles.</Alert>}
              {(sug.data?.lacunas || []).map((l: any) => <Bar key={l.eixoId} label={l.nome ?? l.eixoId} value={l.atual} meta={l.meta} color="#d64545" right={`lacuna de ${fmtNum(l.gap)} pontos`} />)}
              {(sug.data?.sugestoes || []).length > 0 && <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2 }}>Kits sugeridos</Typography>}
              {(sug.data?.sugestoes || []).map((s: any, i: number) => <Typography key={i} variant="body2">• <b>{s.titulo}</b> — {s.motivo}</Typography>)}
            </LoadBox>
          )}
        </Section>
      )}
      <FormDialog open={!!kitDlg} onClose={() => setKitDlg(null)} title={kitDlg?.row ? "Editar kit" : "Novo kit de atividade"} fields={kitFields}
        initial={kitDlg?.row ? { ...kitDlg.row, tempoEstimadoMin: kitDlg.row.tempoEstimadoMin ?? "" } : { visibilidade: "PRIVADA", ...(kitDlg?.prefill || {}) }}
        onSubmit={async (b) => { if (kitDlg?.row) await call("PATCH", `/desempenho/kits/${kitDlg.row.id}`, b); else await call("POST", "/desempenho/kits", b); setRev((x) => x + 1); }} />
      <FormDialog open={iaDlg} onClose={() => setIaDlg(false)} title="Gerar kit com IA (rascunho para revisão)" maxWidth="sm" submitLabel="Gerar"
        fields={[{ key: "tipo", label: "Tipo", type: "select", options: TIPOS_KIT, required: true }, { key: "tema", label: "Tema", required: true }, { key: "exameId", label: "Exame", type: "select", options: exames }, { key: "nivel", label: "Nível", type: "select", options: ["FACIL", "MEDIO", "DIFICIL"] }]}
        initial={{ nivel: "MEDIO" }}
        onSubmit={async (b) => {
          const r = await call("POST", "/desempenho/kits/gerar-ia", b);
          if (r.ia) { toast({ type: "success", text: "Kit gerado como rascunho privado. Revise antes de atribuir." }); setRev((x) => x + 1); }
          else { toast({ type: "info", text: r.mensagem }); setKitDlg({ prefill: r.modelo }); }
        }} />
      <FormDialog open={!!atrib} onClose={() => setAtrib(null)} title={`Atribuir — ${atrib?.titulo ?? ""}`} maxWidth="sm" submitLabel="Atribuir"
        fields={[{ key: "classSectionId", label: "Turma", type: "select", options: turmas, required: true }, { key: "prazo", label: "Prazo de entrega", type: "datetime", required: true }, { key: "instrucoes", label: "Instruções", type: "textarea" }]}
        onSubmit={async (b) => { await call("POST", "/desempenho/atribuicoes", { ...b, kitId: atrib.id }); toast({ type: "success", text: "Atividade atribuída; alunos notificados." }); setRev((x) => x + 1); }} />
      {acomp && <Acompanhamento id={acomp} onClose={() => setAcomp(null)} />}
    </Box>
  );
}
