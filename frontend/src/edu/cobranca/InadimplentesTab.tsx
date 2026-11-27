import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Checkbox, MenuItem, Pagination, Paper, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { COLORS, FormDialog, Kpi, KpiRow, LoadBox, Section, Status, call, fmtDate, fmtDateTime, fmtMoney, label, useApi, useRunner, useToast } from "../desempenho/kit";
import AcordoDialog from "./AcordoDialog";
import { CANAIS, FaixaChip, FAIXAS, ResponsiveTable, SEGMENTOS, baixarCsv, qstr } from "./common";

const STATUS = ["EM_COBRANCA", "EM_ACORDO", "PROMESSA", "JURIDICO", "NOVO"];

export default function InadimplentesTab() {
  const [f, setF] = useState<any>({ sort: "saldo", dir: "desc", page: 1 });
  const [aluno, setAluno] = useState<string | null>(null);
  const q = qstr({ ...f, pageSize: 25 });
  const lista = useApi<any>(`/cobranca/inadimplentes${q}`);
  const { toast, node } = useToast();
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value, page: 1 });
  const ordenar = (k: string) => setF({ ...f, sort: k, dir: f.sort === k && f.dir === "desc" ? "asc" : "desc", page: 1 });
  const d = lista.data;
  const fl = d?.filtros ?? { cursos: [], turmas: [], polos: [] };
  const sel = (lbl: string, k: string, opts: Array<{ value: string; label: string }>) => (
    <TextField select size="small" label={lbl} value={f[k] ?? ""} onChange={set(k)} sx={{ minWidth: { xs: "100%", sm: 150 } }}>
      <MenuItem value="">Todos</MenuItem>{opts.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
    </TextField>
  );
  return (
    <>
      {node}
      <Section title="Inadimplentes (planilha)" actions={<Button variant="outlined" onClick={() => baixarCsv(`/cobranca/inadimplentes${qstr({ ...f, formato: "csv" })}`, "inadimplentes.csv").catch((e) => toast({ type: "error", text: e.message }))}>Exportar CSV</Button>}>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
          <TextField size="small" label="Buscar aluno, RA ou curso" value={f.q ?? ""} onChange={set("q")} sx={{ minWidth: { xs: "100%", sm: 240 } }} />
          {sel("Faixa", "faixa", FAIXAS.map((x) => ({ value: x.k, label: x.label })))}
          {sel("Situação", "status", STATUS.map((s) => ({ value: s, label: label(s) })))}
          {sel("Segmento", "segmento", SEGMENTOS.filter((s) => s.value !== "TODOS"))}
          {sel("Curso", "cursoId", fl.cursos.map((x: any) => ({ value: x.id, label: x.nome })))}
          {sel("Turma", "turmaId", fl.turmas.map((x: any) => ({ value: x.id, label: x.nome })))}
          {sel("Polo", "poloId", fl.polos.map((x: any) => ({ value: x.id, label: x.nome })))}
          <TextField size="small" type="number" label="Saldo mínimo" value={f.min ?? ""} onChange={set("min")} sx={{ width: { xs: "100%", sm: 130 } }} />
          <FormControlLabel control={<Checkbox checked={!!f.semResponsavel} onChange={(e) => setF({ ...f, semResponsavel: e.target.checked, page: 1 })} />} label="Sem responsável" />
          <FormControlLabel control={<Checkbox checked={!!f.comPromessa} onChange={(e) => setF({ ...f, comPromessa: e.target.checked, page: 1 })} />} label="Com promessa" />
        </Box>
        <LoadBox loading={lista.loading && !d} error={lista.error} onRetry={lista.reload}>
          {d && (
            <>
              <KpiRow>
                <Kpi title="Alunos" value={d.totais.alunos} color={COLORS.bad} />
                <Kpi title="Principal vencido" value={fmtMoney(d.totais.principal)} />
                <Kpi title="Multa + juros + correção" value={fmtMoney(d.totais.multa + d.totais.juros + d.totais.correcao)} hint={`multa ${fmtMoney(d.totais.multa)} · juros ${fmtMoney(d.totais.juros)}`} />
                <Kpi title="Saldo atualizado" value={fmtMoney(d.totais.saldo)} color={COLORS.bad} />
                <Kpi title="Em acordo" value={fmtMoney(d.totais.emAcordoValor)} />
              </KpiRow>
              <ResponsiveTable
                rows={d.items} rowKey={(r: any) => r.studentId} onRow={(r: any) => setAluno(r.studentId)} sort={f.sort} dir={f.dir} onSort={ordenar} empty="Nenhum inadimplente com estes filtros."
                cols={[
                  { key: "nome", label: "Aluno", sortable: true, minWidth: 170, render: (r: any) => <Box><b>{r.nome}</b><Typography variant="caption" component="div" color="text.secondary">{r.ra}{r.temBolsa ? " · bolsista" : ""}</Typography></Box> },
                  { key: "curso", label: "Curso / turma / polo", sortable: true, hideMobile: false, minWidth: 160, render: (r: any) => <>{r.curso ?? "—"}<Typography variant="caption" component="div" color="text.secondary">{[r.turma, r.polo].filter(Boolean).join(" · ") || r.segmento}</Typography></> },
                  { key: "maiorAtraso", label: "Atraso", sortable: true, align: "right", render: (r: any) => <><FaixaChip faixa={r.faixa} /> <small>{r.maiorAtraso}d</small></> },
                  { key: "aVencer", label: "A vencer", sortable: true, align: "right", hideMobile: true, render: (r: any) => fmtMoney(r.aVencer) },
                  { key: "aging", label: "1-30 | 31-60 | 61-90 | 90+", hideMobile: true, align: "right", render: (r: any) => <small>{[r.aging.D1_30, r.aging.D31_60, r.aging.D61_90, r.aging.D90_MAIS].map((v: number) => Math.round(v)).join(" | ")}</small> },
                  { key: "principal", label: "Principal", sortable: true, align: "right", hideMobile: true, render: (r: any) => fmtMoney(r.principal) },
                  { key: "encargos", label: "Multa/juros", sortable: true, align: "right", hideMobile: true, render: (r: any) => fmtMoney(r.multa + r.juros + r.correcao) },
                  { key: "saldo", label: "Saldo", sortable: true, align: "right", render: (r: any) => <b>{fmtMoney(r.saldo)}</b> },
                  { key: "ultimoContatoEm", label: "Último contato", sortable: true, render: (r: any) => (r.ultimoContatoEm ? <>{fmtDate(r.ultimoContatoEm)} <small>{r.ultimoContatoCanal}</small></> : "—") },
                  { key: "promessaData", label: "Promessa", sortable: true, render: (r: any) => (r.promessaData ? `${fmtDate(r.promessaData)} · ${fmtMoney(r.promessaValor)}` : "—") },
                  { key: "responsavel", label: "Responsável", render: (r: any) => r.responsavel ?? "—" },
                  { key: "status", label: "Situação", sortable: true, render: (r: any) => <><Status value={r.status} />{r.naoContatar ? <Chip size="small" color="error" label="não contatar" sx={{ ml: 0.5 }} /> : null}</> },
                ]}
              />
              <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
                <Pagination count={Math.max(1, Math.ceil(d.total / 25))} page={f.page} onChange={(_, p) => setF({ ...f, page: p })} />
              </Box>
            </>
          )}
        </LoadBox>
      </Section>
      <DetalheAluno studentId={aluno} onClose={() => setAluno(null)} onChanged={lista.reload} />
    </>
  );
}

function DetalheAluno({ studentId, onClose, onChanged }: { studentId: string | null; onClose: () => void; onChanged: () => void }) {
  const [rev, setRev] = useState(0);
  const det = useApi<any>(studentId ? `/cobranca/inadimplentes/${studentId}` : null, [rev]);
  const { toast, node } = useToast();
  const after = () => { setRev((x) => x + 1); onChanged(); };
  const run = useRunner(toast, after);
  const [dlg, setDlg] = useState<string | null>(null);
  const [pag, setPag] = useState<any>(null);
  const d = det.data;
  const caso = d?.caso;
  return (
    <Dialog open={!!studentId} onClose={onClose} fullWidth maxWidth="lg" scroll="paper">
      <DialogTitle>{d ? `${d.aluno.nomeCompleto} · RA ${d.aluno.ra}` : "Aluno"}</DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={det.loading && !d} error={det.error} onRetry={det.reload}>
          {d && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{[d.aluno.curso, d.aluno.turma, d.aluno.polo, d.aluno.segmento].filter(Boolean).join(" · ")}{d.aluno.temBolsa ? " · bolsista (sem desconto de quitação no principal)" : ""} · política: {d.politica.nome}</Typography>
              {caso?.naoContatar && <Alert severity="error" sx={{ mb: 1 }}>Contato bloqueado: {caso.naoContatarMotivo}</Alert>}
              {caso?.pausadoAte && new Date(caso.pausadoAte) > new Date() && <Alert severity="info" sx={{ mb: 1 }}>Régua pausada até {fmtDate(caso.pausadoAte)} ({caso.pausaMotivo}).</Alert>}
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
                <Button size="small" variant="contained" onClick={() => setDlg("acordo")}>Simular / propor acordo</Button>
                <Button size="small" onClick={() => setDlg("contato")}>Registrar contato</Button>
                <Button size="small" onClick={() => setDlg("promessa")}>Promessa de pagamento</Button>
                <Button size="small" onClick={() => setDlg("mensagem")}>Enviar mensagem</Button>
                <Button size="small" onClick={() => setDlg("pausa")}>Pausar régua</Button>
                {caso && <Button size="small" color="warning" onClick={() => setDlg("optout")}>Registrar opt-out</Button>}
                {caso && <Button size="small" color="warning" onClick={() => run(() => call("PATCH", `/cobranca/casos/${caso.id}`, caso.naoContatar ? { naoContatar: false } : { naoContatar: true, naoContatarMotivo: window.prompt("Motivo do bloqueio de contato:") || "bloqueio manual" }), "Atualizado.")}>{caso.naoContatar ? "Liberar contato" : "Não contatar"}</Button>}
              </Box>
              <KpiRow>
                <Kpi title="Saldo vencido" value={fmtMoney(d.linha?.saldo ?? 0)} color={COLORS.bad} />
                <Kpi title="Principal" value={fmtMoney(d.linha?.principal ?? 0)} />
                <Kpi title="Multa / juros / correção" value={`${fmtMoney(d.linha?.multa ?? 0)} / ${fmtMoney(d.linha?.juros ?? 0)} / ${fmtMoney(d.linha?.correcao ?? 0)}`} />
                {d.quitacaoAVista && <Kpi title="Quitação à vista" value={fmtMoney(d.quitacaoAVista.total)} hint={`desconto ${fmtMoney(d.quitacaoAVista.desconto)}`} color={COLORS.ok} />}
              </KpiRow>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Títulos em aberto</Typography>
              <ResponsiveTable rows={d.titulos} rowKey={(t: any) => t.id}
                cols={[
                  { key: "descricao", label: "Título" },
                  { key: "vencimento", label: "Vencimento", render: (t: any) => fmtDate(t.vencimento) },
                  { key: "diasAtraso", label: "Atraso", align: "right", render: (t: any) => <><FaixaChip faixa={t.faixa} /> {t.diasAtraso > 0 ? `${t.diasAtraso}d` : ""}</> },
                  { key: "principalRestante", label: "Principal", align: "right", render: (t: any) => fmtMoney(t.principalRestante) },
                  { key: "multa", label: "Multa", align: "right", hideMobile: true, render: (t: any) => fmtMoney(t.multa) },
                  { key: "juros", label: "Juros", align: "right", hideMobile: true, render: (t: any) => fmtMoney(t.juros) },
                  { key: "saldo", label: "Saldo", align: "right", render: (t: any) => <b>{fmtMoney(t.saldo)}</b> },
                  { key: "acao", label: "", render: (t: any) => (t.emAcordo ? <Chip size="small" label="em acordo" /> : t.diasAtraso > 0 ? <Button size="small" onClick={(e) => { e.stopPropagation(); setPag(t); }}>Baixar</Button> : null) },
                ]} />
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2 }}>Histórico de contatos</Typography>
              <ResponsiveTable rows={d.contatos.slice(0, 15)} rowKey={(c: any) => c.id} empty="Nenhum contato registrado."
                cols={[
                  { key: "createdAt", label: "Quando", render: (c: any) => fmtDateTime(c.createdAt) },
                  { key: "canal", label: "Canal", render: (c: any) => `${label(c.tipo)} · ${label(c.canal)}${c.automatico ? " (auto)" : ""}` },
                  { key: "resultado", label: "Resultado", render: (c: any) => <Status value={c.resultado} /> },
                  { key: "observacao", label: "Detalhe", hideMobile: true, minWidth: 220, render: (c: any) => c.observacao || c.mensagem || c.erro || "—" },
                ]} />
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2 }}>Acordos e promessas</Typography>
              {d.acordos.map((a: any) => <Typography key={a.id} variant="body2">• {a.numero} · <Status value={a.status} /> · {fmtMoney(a.valorNegociado)} em {a.numeroParcelas}x</Typography>)}
              {d.promessas.map((p: any) => <Typography key={p.id} variant="body2">• Promessa {fmtMoney(p.valor)} para {fmtDate(p.dataPrometida)} · <Status value={p.status} /></Typography>)}
              {!d.acordos.length && !d.promessas.length && <Typography variant="body2" color="text.secondary">Nenhum acordo ou promessa.</Typography>}
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2 }}>Escalonamento</Typography>
              {d.encaminhamentos.map((e: any) => <Typography key={e.id} variant="body2">• {e.numero} {label(e.tipo)} <Status value={e.status} />{e.simulado ? " (simulado)" : ""}</Typography>)}
              {!d.encaminhamentos.length && <Typography variant="body2" color="text.secondary">Nenhum encaminhamento.</Typography>}
              <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button size="small" color="inherit" onClick={() => run(() => call("POST", "/cobranca/encaminhamentos", { studentId, tipo: "NOTIFICACAO_EXTRAJUDICIAL" }), "Notificação extrajudicial gerada.", "Gerar notificação extrajudicial para este aluno?")}>Gerar notificação extrajudicial</Button>
                <Button size="small" color="inherit" onClick={() => run(() => call("POST", "/cobranca/encaminhamentos", { studentId, tipo: "JURIDICO" }), "Solicitação de execução criada (aguarda aprovação).", "Criar solicitação de execução ao Jurídico?")}>Encaminhar ao Jurídico</Button>
              </Box>
            </>
          )}
        </LoadBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>

      <AcordoDialog open={dlg === "acordo"} studentId={studentId} onClose={() => setDlg(null)} onDone={after} />
      <FormDialog open={dlg === "contato"} title="Registrar contato (ligação, visita, mensagem)" onClose={() => setDlg(null)} initial={{ tipo: "LIGACAO", canal: "TELEFONE", resultado: "ATENDEU" }}
        fields={[
          { key: "tipo", label: "Tipo", type: "select", required: true, options: ["LIGACAO", "VISITA", "MENSAGEM", "EMAIL", "NOTA"] },
          { key: "canal", label: "Canal", type: "select", required: true, options: ["TELEFONE", "PRESENCIAL", "WHATSAPP", "SMS", "EMAIL", "TELEGRAM", "SISTEMA"] },
          { key: "resultado", label: "Resultado", type: "select", required: true, options: ["ATENDEU", "NAO_ATENDEU", "CAIXA_POSTAL", "NUMERO_ERRADO", "RECUSOU", "PROMESSA", "ACORDO", "REGISTRADO"] },
          { key: "observacao", label: "O que foi tratado", type: "textarea", required: true },
        ]}
        onSubmit={async (b) => { await call("POST", "/cobranca/contatos/registrar", { ...b, studentId }); toast({ type: "success", text: "Contato registrado." }); after(); }} />
      <FormDialog open={dlg === "promessa"} title="Promessa de pagamento" onClose={() => setDlg(null)} initial={{ valor: d?.linha?.saldo }}
        fields={[{ key: "valor", label: "Valor prometido", type: "number", required: true }, { key: "dataPrometida", label: "Data prometida", type: "date", required: true, helper: "Até 45 dias; acima disso formalize um acordo." }, { key: "canal", label: "Por onde", type: "select", options: ["TELEFONE", "PRESENCIAL", "WHATSAPP", "EMAIL"] }, { key: "observacao", label: "Observação", type: "textarea" }]}
        onSubmit={async (b) => { await call("POST", "/cobranca/promessas", { ...b, studentId }); toast({ type: "success", text: "Promessa registrada. A régua fica pausada até a data." }); after(); }} />
      <FormDialog open={dlg === "mensagem"} title="Enviar mensagem de cobrança" onClose={() => setDlg(null)} initial={{ canal: "WHATSAPP" }}
        intro={<Alert severity="info" sx={{ mb: 2 }}>Respeita opt-out, janela de horário e limite de contatos. Texto neutro, sem exposição (CDC art. 42).</Alert>}
        fields={[{ key: "canal", label: "Canal", type: "select", required: true, options: CANAIS }, { key: "canalFallback", label: "Canal alternativo", type: "select", options: CANAIS }, { key: "mensagem", label: "Mensagem", type: "textarea", required: true }]}
        onSubmit={async (b) => { await call("POST", "/cobranca/contatos/enviar", { ...b, studentId }); toast({ type: "success", text: "Mensagem enfileirada na caixa de saída." }); after(); }} />
      <FormDialog open={dlg === "pausa"} title="Pausar a régua" onClose={() => setDlg(null)}
        fields={[{ key: "ate", label: "Até", type: "date", required: true, helper: "Máximo 90 dias." }, { key: "motivo", label: "Motivo", required: true }]}
        onSubmit={async (b) => { await call("POST", `/cobranca/casos/${caso.id}/pausar`, b); toast({ type: "success", text: "Régua pausada." }); after(); }} />
      <FormDialog open={dlg === "optout"} title="Opt-out de cobrança (LGPD)" onClose={() => setDlg(null)} initial={{ canal: "*" }}
        fields={[{ key: "canal", label: "Canal", type: "select", required: true, options: [{ value: "*", label: "Todos os canais" }, ...CANAIS] }, { key: "motivo", label: "Motivo" }]}
        onSubmit={async (b) => { await call("POST", `/cobranca/casos/${caso.id}/optout`, b); toast({ type: "success", text: "Opt-out registrado: nenhum contato será feito neste canal." }); after(); }} />
      <PagarDialog titulo={pag} onClose={() => setPag(null)} onDone={after} toast={toast} />
    </Dialog>
  );
}

function PagarDialog({ titulo, onClose, onDone, toast }: { titulo: any; onClose: () => void; onDone: () => void; toast: (m: any) => void }) {
  const [quit, setQuit] = useState(false);
  const [forma, setForma] = useState("PIX");
  const [valor, setValor] = useState("");
  const calc = useApi<any>(titulo ? `/cobranca/pagamentos/calcular?receivableId=${titulo.id}&quitacao=${quit}` : null);
  const c = calc.data;
  async function pagar() {
    try {
      const r = await call("POST", "/cobranca/pagamentos", { receivableId: titulo.id, forma, quitacao: quit, ...(valor ? { valor: Number(valor) } : {}) });
      toast({ type: "success", text: r.quitado ? "Título baixado e lançado no contas a receber." : `Pagamento parcial registrado. Resta ${fmtMoney(r.saldoRestante)}.` });
      onClose(); onDone();
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Dialog open={!!titulo} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Baixar título</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
        {titulo && <Typography variant="body2">{titulo.descricao} · venc. {fmtDate(titulo.vencimento)}</Typography>}
        <LoadBox loading={calc.loading && !c} error={calc.error}>
          {c && (
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="body2">Principal: {fmtMoney(c.principalRestante)} · encargos: {fmtMoney(c.encargos)}</Typography>
              {quit && <Typography variant="body2" color="success.main">Desconto de quitação: {fmtMoney(c.desconto.desconto)}</Typography>}
              {c.descontoBloqueadoPorBolsa && <Typography variant="caption" color="warning.main">Aluno bolsista: sem desconto sobre o principal.</Typography>}
              <Typography variant="h6">Total: {fmtMoney(c.totalAPagar)}</Typography>
            </Paper>
          )}
        </LoadBox>
        <FormControlLabel control={<Checkbox checked={quit} onChange={(e) => { setQuit(e.target.checked); setValor(""); }} />} label="Quitação à vista com desconto da política" />
        <TextField size="small" select label="Forma" value={forma} onChange={(e) => setForma(e.target.value)}>{["PIX", "BOLETO", "CARTAO", "DINHEIRO", "TRANSFERENCIA"].map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField>
        {!quit && <TextField size="small" type="number" label="Valor pago (vazio = total; menor = parcial)" value={valor} onChange={(e) => setValor(e.target.value)} />}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" onClick={pagar}>Confirmar baixa</Button></DialogActions>
    </Dialog>
  );
}
