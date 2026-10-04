import { Alert, Box, Button, Chip, Pagination, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography } from "@mui/material";
import { useState } from "react";
import { Dot, FormDialog, KpiRow, Kpi, LoadBox, Pick, Section, Status, call, fmtNum, fmtPct, itemsOf, semaforo, useApi, useExames, useRunner, useToast, type FormField } from "./kit";

const NIVEIS = ["FACIL", "MEDIO", "DIFICIL"];
const STATUS = ["RASCUNHO", "REVISADO", "PUBLICADO", "ARQUIVADO"];
const TIPOS = ["OBJETIVA", "DISCURSIVA", "PECA_PRATICA", "CASO_CLINICO"];
const LETRAS = ["A", "B", "C", "D", "E"];

function Qualidade({ exameId }: { exameId: string }) {
  const q = useApi<any>(`/desempenho/questoes/qualidade${exameId ? `?exameId=${exameId}` : ""}`);
  const sus = q.data?.suspeitas || [], div = q.data?.nivelDivergente || [];
  return (
    <Section title="Qualidade do banco (estatística das respostas)">
      <LoadBox loading={q.loading} error={q.error} onRetry={q.reload}>
        <KpiRow>
          <Kpi title="Questões analisadas" value={q.data?.total ?? 0} hint="com 6+ respostas" />
          <Kpi title="Gabarito/discriminação suspeitos" value={sus.length} color={sus.length ? "#d64545" : "#2e9e5b"} />
          <Kpi title="Nível divergente" value={div.length} color={div.length ? "#e0a100" : "#2e9e5b"} />
        </KpiRow>
        {!q.data?.total ? <Typography color="text.secondary">Ainda não há respostas suficientes para avaliar as questões.</Typography> : (
          <Table size="small">
            <TableHead><TableRow><TableCell>Enunciado</TableCell><TableCell>Acerto</TableCell><TableCell>Discriminação</TableCell><TableCell>Avaliação</TableCell><TableCell>Nível (declarado → observado)</TableCell></TableRow></TableHead>
            <TableBody>
              {[...sus, ...div.filter((d: any) => !sus.some((s: any) => s.id === d.id))].map((r: any) => (
                <TableRow key={r.id}><TableCell sx={{ maxWidth: 380 }}>{r.enunciado}</TableCell><TableCell>{fmtPct(r.taxaAcerto, 0)}</TableCell><TableCell>{fmtNum(r.indiceDiscriminacao, 2)}</TableCell>
                  <TableCell><Status value={r.avaliacao} /></TableCell><TableCell>{r.nivelDeclarado} → {r.nivelObservado ?? "—"}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </LoadBox>
    </Section>
  );
}

export default function QuestoesTab() {
  const exames = useExames();
  const [f, setF] = useState({ exameId: "", status: "", nivel: "", q: "" });
  const [page, setPage] = useState(1);
  const [rev, setRev] = useState(0);
  const [dlg, setDlg] = useState<null | { mode: "new" | "edit" | "ia"; row?: any }>(null);
  const [view, setView] = useState<any | null>(null);
  const [formExame, setFormExame] = useState("");
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const qs = new URLSearchParams({ page: String(page), pageSize: "20", ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }).toString();
  const list = useApi<any>(`/desempenho/questoes?${qs}`, [rev]);
  const eixos = useApi<any>(formExame ? `/desempenho/eixos?exameId=${formExame}&pageSize=200` : null);
  const eixoOpts = itemsOf(eixos.data).map((e) => ({ value: e.id, label: `${e.codigo} — ${e.nome}` }));
  const exameLabel = (id: string) => exames.find((e) => e.value === id)?.label ?? "—";
  const total = list.data?.total ?? 0;

  const baseFields: FormField[] = [
    { key: "exameId", label: "Exame", type: "select", options: exames, required: true },
    { key: "eixoId", label: "Eixo / competência", type: "select", options: eixoOpts, helper: formExame ? undefined : "Escolha o exame primeiro" },
  ];
  const manual: FormField[] = [
    ...baseFields,
    { key: "tipo", label: "Tipo", type: "select", options: TIPOS, required: true }, { key: "nivel", label: "Nível", type: "select", options: NIVEIS, required: true },
    { key: "enunciado", label: "Enunciado", type: "textarea", required: true },
    ...LETRAS.map((l): FormField => ({ key: `alt${l}`, label: `Alternativa ${l}`, full: true, hidden: (v) => (v.tipo ?? "OBJETIVA") !== "OBJETIVA" && !v[`alt${l}`] })),
    { key: "gabarito", label: "Gabarito (letra) / padrão de resposta" }, { key: "fonte", label: "Fonte (ex.: Exame OAB XXXV)" }, { key: "anoFonte", label: "Ano da fonte", type: "number" },
    { key: "comentario", label: "Comentário / resolução", type: "textarea" },
  ];
  const ia: FormField[] = [
    ...baseFields, { key: "tema", label: "Tema (opcional)" }, { key: "quantidade", label: "Quantidade (1-10)", type: "number" },
    { key: "nivel", label: "Nível", type: "select", options: NIVEIS }, { key: "tipo", label: "Tipo", type: "select", options: TIPOS }, { key: "numAlternativas", label: "Nº de alternativas (4-5)", type: "number" },
  ];

  function initialFor(row?: any) {
    if (!row) return { tipo: "OBJETIVA", nivel: "MEDIO" };
    const v: Record<string, any> = { ...row };
    (row.alternativas || []).forEach((a: any) => { v[`alt${a.letra}`] = a.texto; });
    return v;
  }
  async function submit(b: Record<string, any>) {
    if (dlg?.mode === "ia") {
      const r = await call("POST", "/desempenho/questoes/gerar-ia", { quantidade: 5, nivel: "MEDIO", tipo: "OBJETIVA", numAlternativas: 4, ...b });
      toast({ type: "info", text: r?.mensagem || `Questões geradas como RASCUNHO: ${r?.criadas ?? r?.questoes?.length ?? "ok"}. Revisão humana obrigatória.` });
    } else {
      const body: Record<string, any> = { ...b };
      const alts = LETRAS.filter((l) => body[`alt${l}`]).map((l) => ({ letra: l, texto: body[`alt${l}`] }));
      LETRAS.forEach((l) => delete body[`alt${l}`]);
      if ((body.tipo ?? "OBJETIVA") === "OBJETIVA") body.alternativas = alts;
      if (dlg?.mode === "edit") { const r = await call("PATCH", `/desempenho/questoes/${dlg.row.id}`, body); if (r?.aviso) toast({ type: "info", text: r.aviso }); }
      else await call("POST", "/desempenho/questoes", body);
    }
    setRev((x) => x + 1);
  }

  return (
    <Box>
      {node}
      <Section title="Banco de questões" actions={<>
        <Button variant="outlined" onClick={() => { setFormExame(""); setDlg({ mode: "ia" }); }}>Gerar com IA</Button>
        <Button variant="contained" onClick={() => { setFormExame(""); setDlg({ mode: "new" }); }}>Nova questão</Button>
      </>}>
        <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
          <Pick label="Exame" value={f.exameId} all="Todos" options={exames} onChange={(v) => { setPage(1); setF({ ...f, exameId: v }); }} />
          <Pick label="Status" value={f.status} all="Todos" minWidth={150} options={STATUS.map((s) => ({ value: s, label: s }))} onChange={(v) => { setPage(1); setF({ ...f, status: v }); }} />
          <Pick label="Nível" value={f.nivel} all="Todos" minWidth={130} options={NIVEIS.map((s) => ({ value: s, label: s }))} onChange={(v) => { setPage(1); setF({ ...f, nivel: v }); }} />
          <TextField size="small" label="Buscar no enunciado" value={f.q} onChange={(e) => { setPage(1); setF({ ...f, q: e.target.value }); }} />
        </Box>
        <Alert severity="info" sx={{ mb: 2 }}>Fluxo: RASCUNHO → REVISADO (por outro docente) → PUBLICADO (coordenação). Questões geradas por IA entram sempre como rascunho.</Alert>
        <LoadBox loading={list.loading} error={list.error} empty={!itemsOf(list.data).length} emptyText="Nenhuma questão encontrada." onRetry={list.reload}>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead><TableRow><TableCell>Enunciado</TableCell><TableCell>Exame</TableCell><TableCell>Nível</TableCell><TableCell>Acerto</TableCell><TableCell>Status</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>
                {itemsOf(list.data).map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ maxWidth: 360 }}><Typography variant="body2" sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.enunciado}</Typography></TableCell>
                    <TableCell>{exameLabel(r.exameId)}</TableCell>
                    <TableCell><Chip size="small" label={r.nivel} /></TableCell>
                    <TableCell><Tooltip title={`Dificuldade observada: ${r.dificuldadeObservada ?? "sem dados"} (${r.totalRespostas ?? 0} respostas)`}><span><Dot color={semaforo(r.taxaAcerto, 60, 30)} />{fmtPct(r.taxaAcerto, 0)}</span></Tooltip></TableCell>
                    <TableCell><Status value={r.status} /></TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <Button size="small" onClick={() => setView(r)}>Ver</Button>
                      <Button size="small" onClick={() => { setFormExame(r.exameId); setDlg({ mode: "edit", row: r }); }}>Editar</Button>
                      {r.status === "RASCUNHO" && <Button size="small" color="success" onClick={() => run(() => call("POST", `/desempenho/questoes/${r.id}/revisar`), "Questão revisada.")}>Revisar</Button>}
                      {r.status === "REVISADO" && <Button size="small" color="success" onClick={() => run(() => call("POST", `/desempenho/questoes/${r.id}/publicar`), "Questão publicada.")}>Publicar</Button>}
                      {r.status !== "ARQUIVADO" && <Button size="small" color="warning" onClick={() => run(() => call("POST", `/desempenho/questoes/${r.id}/arquivar`), "Questão arquivada.", "Arquivar esta questão?")}>Arquivar</Button>}
                      {r.status !== "PUBLICADO" && <Button size="small" color="error" onClick={() => run(() => call("DELETE", `/desempenho/questoes/${r.id}`), "Questão removida.", "Remover definitivamente esta questão?")}>Excluir</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          {total > 20 && <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}><Pagination count={Math.ceil(total / 20)} page={page} onChange={(_, v) => setPage(v)} /></Box>}
          <Typography variant="caption" color="text.secondary">{total} questão(ões)</Typography>
        </LoadBox>
      </Section>
      <Qualidade exameId={f.exameId} />
      <FormDialog open={!!dlg} onClose={() => setDlg(null)} onValues={(v) => setFormExame(v.exameId || "")}
        title={dlg?.mode === "ia" ? "Gerar questões com IA (rascunho)" : dlg?.mode === "edit" ? "Editar questão" : "Nova questão"} fields={dlg?.mode === "ia" ? ia : manual}
        initial={dlg?.mode === "ia" ? { quantidade: 5, nivel: "MEDIO", tipo: "OBJETIVA", numAlternativas: 4 } : initialFor(dlg?.row)} submitLabel={dlg?.mode === "ia" ? "Gerar" : "Salvar"} onSubmit={submit} />
      {view && (
        <FormDialog open onClose={() => setView(null)} title="Questão" fields={[]} submitLabel="Fechar" onSubmit={async () => undefined}
          intro={<Box>
            <Typography sx={{ whiteSpace: "pre-wrap", mb: 2 }}>{view.enunciado}</Typography>
            {(view.alternativas || []).map((a: any) => <Typography key={a.letra} sx={{ fontWeight: a.letra === view.gabarito ? 800 : 400, color: a.letra === view.gabarito ? "success.main" : undefined }}>{a.letra}) {a.texto}</Typography>)}
            {view.gabarito && !(view.alternativas || []).length && <Typography><b>Padrão de resposta:</b> {view.gabarito}</Typography>}
            {view.comentario && <Typography sx={{ mt: 2 }} color="text.secondary"><b>Comentário:</b> {view.comentario}</Typography>}
          </Box>} />
      )}
    </Box>
  );
}
