import { Alert, Box, Button, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useState } from "react";
import { Acoes, Btn, perfil, FormDialog, Kpi, KpiRow, LoadBox, MesField, Pick, Section, Status, Tabela, fmtDate, fmtMin, hojeMes, itemsOf, mesAnterior, rh, useColabs, useRh, useRunner, useToast } from "./kit";

const TIPOS = ["ENTRADA", "SAIDA_INTERVALO", "RETORNO_INTERVALO", "SAIDA"];

function Espelho({ gestao }: { gestao: boolean }) {
  const colabs = useColabs();
  const [cid, setCid] = useState(""); const [comp, setComp] = useState(hojeMes());
  const [rev, setRev] = useState(0); const [ajuste, setAjuste] = useState<string | null>(null);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const e = useRh<any>(`/ponto/espelho?competencia=${comp}${cid ? `&colaboradorId=${cid}` : ""}`, [rev]);
  const r = e.data?.resumo;
  const nomeDia = (d: string) => ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][new Date(d + "T12:00:00").getDay()];
  return (
    <Section title="Espelho de ponto" actions={<Button size="small" onClick={() => window.print()}>Imprimir</Button>}>
      {node}
      <Acoes>
        {gestao && <Pick label="Colaborador" value={cid} onChange={setCid} all="Eu mesmo" options={colabs.opts} minWidth={240} />}
        <MesField value={comp} onChange={setComp} />
        <Btn onClick={() => setAjuste(cid || e.data?.colaborador?.id)}>Solicitar ajuste</Btn>
      </Acoes>
      <LoadBox loading={e.loading} error={e.error} onRetry={e.reload}>
        {e.data && r && (
          <>
            <Typography variant="body2" sx={{ mb: 1 }}>{e.data.colaborador.nome} · {e.data.competencia} · {e.data.fechado ? <b>fechado</b> : <i>provisório</i>}</Typography>
            <KpiRow>
              <Kpi title="Trabalhado" value={fmtMin(r.trabalhadoMin)} hint={`previsto ${fmtMin(r.esperadoMin)}`} /><Kpi title="Atrasos" value={fmtMin(r.atrasoMin)} /><Kpi title="Faltas" value={r.faltas} />
              <Kpi title="HE 50%" value={fmtMin(r.extra50Min)} /><Kpi title="HE 100%" value={fmtMin(r.extra100Min)} /><Kpi title="Noturno" value={fmtMin(r.noturnoMin)} /><Kpi title="Abonado" value={fmtMin(r.abonadoMin)} />
            </KpiRow>
            <Tabela rows={e.data.dias.map((d: any) => ({ ...d, id: d.data }))} cols={[
              { h: "Dia", r: (d: any) => `${d.data.slice(8)}/${d.data.slice(5, 7)} ${nomeDia(d.data)}` }, { h: "Marcações", r: (d: any) => d.marcacoes.map((m: string) => m.slice(1)).join(" · ") || "—" },
              { h: "Trab.", r: (d: any) => fmtMin(d.trabalhadoMin) }, { h: "Atraso", r: (d: any) => (d.atrasoMin ? fmtMin(d.atrasoMin) : "—"), hideMobile: true }, { h: "HE", r: (d: any) => (d.extra50Min + d.extra100Min ? `${fmtMin(d.extra50Min)} / ${fmtMin(d.extra100Min)}` : "—") },
              { h: "Ocorrência", r: (d: any) => (d.falta ? "FALTA" : d.abono ? String(d.abono).replace(/_/g, " ") : d.tipoDia === "FERIADO" ? "FERIADO" : d.inconsistencias.join(", ") || "") },
            ]} />
          </>
        )}
      </LoadBox>
      <FormDialog open={!!ajuste} title="Solicitar ajuste de ponto" intro={<Alert severity="info" sx={{ mb: 2 }}>O ajuste exige justificativa e aprovação do gestor ou do RH.</Alert>}
        fields={[{ key: "data", label: "Dia", type: "text", required: true, helper: "AAAA-MM-DD" }, { key: "tipo", label: "Tipo", type: "select", required: true, options: ["INCLUIR_MARCACOES", "ABONO_FALTA", "JUSTIFICAR_ATRASO"] },
          { key: "marcacoes", label: "Marcações (ex.: ENTRADA 08:00, SAIDA_INTERVALO 12:00, RETORNO_INTERVALO 13:00, SAIDA 17:00)", type: "textarea", hidden: (v) => v.tipo !== "INCLUIR_MARCACOES" }, { key: "justificativa", label: "Justificativa", type: "textarea", required: true }]}
        initial={{ tipo: "INCLUIR_MARCACOES" }} onClose={() => setAjuste(null)}
        onSubmit={(b) => run(() => rh("POST", "/ponto/ajustes", { ...b, colaboradorId: ajuste || undefined, marcacoes: b.marcacoes ? String(b.marcacoes).split(",").map((s: string) => { const [tipo, hora] = s.trim().split(/\s+/); return { tipo, hora }; }) : undefined }), "Ajuste solicitado.")} />
    </Section>
  );
}

function Ajustes() {
  const [rev, setRev] = useState(0);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const a = useRh<any>("/ponto/ajustes?status=PENDENTE", [rev]);
  const [dec, setDec] = useState<{ id: string; aprovar: boolean } | null>(null);
  return (
    <Section title="Ajustes pendentes de aprovação">
      {node}
      <LoadBox loading={a.loading} error={a.error} onRetry={a.reload}>
        <Tabela rows={itemsOf(a.data)} cols={[
          { h: "Colaborador", r: (x: any) => x.colaboradorNome }, { h: "Dia", r: (x: any) => fmtDate(x.data) }, { h: "Tipo", r: (x: any) => String(x.tipo).replace(/_/g, " ") }, { h: "Justificativa", r: (x: any) => x.justificativa },
          { h: "Ação", r: (x: any) => <Box sx={{ display: "flex", gap: 0.5 }}><Button size="small" color="success" onClick={() => setDec({ id: x.id, aprovar: true })}>Aprovar</Button><Button size="small" color="error" onClick={() => setDec({ id: x.id, aprovar: false })}>Rejeitar</Button></Box> },
        ]} vazio="Nenhum ajuste pendente." />
      </LoadBox>
      <FormDialog open={!!dec} title={dec?.aprovar ? "Aprovar ajuste" : "Rejeitar ajuste"} fields={[{ key: "motivo", label: "Motivo / conferência", type: "textarea", required: true }]} onClose={() => setDec(null)} onSubmit={(b) => run(() => rh("POST", `/ponto/ajustes/${dec!.id}/decidir`, { aprovar: dec!.aprovar, motivo: b.motivo }), "Decisão registrada.")} maxWidth="sm" />
    </Section>
  );
}

function Banco({ rhGestao }: { rhGestao: boolean }) {
  const [rev, setRev] = useState(0);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const colabs = useColabs();
  const meu = useRh<any>("/banco-horas/saldo", [rev]);
  const todos = useRh<any>(rhGestao ? "/banco-horas/saldos" : null, [rev]);
  const [lanc, setLanc] = useState(false);
  return (
    <Section title="Banco de horas" actions={rhGestao ? <Button variant="outlined" onClick={() => setLanc(true)}>Novo lançamento</Button> : undefined}>
      {node}
      {meu.data && (
        <KpiRow><Kpi title="Meu saldo" value={meu.data.saldo} /><Kpi title="Vencido" value={fmtMin(meu.data.vencidoMin)} /><Kpi title="A vencer (30 dias)" value={fmtMin(meu.data.aVencerMin)} /></KpiRow>
      )}
      {meu.data?.creditos?.length > 0 && <Tabela rows={meu.data.creditos} cols={[{ h: "Crédito de", r: (c: any) => fmtDate(c.data) }, { h: "Restante", r: (c: any) => fmtMin(c.restanteMin) }, { h: "Vence em", r: (c: any) => fmtDate(c.venceEm) }, { h: "Situação", r: (c: any) => <Status value={c.vencido ? "VENCIDO" : "EM_DIA"} /> }]} />}
      {rhGestao && todos.data && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Saldos da instituição · total {fmtMin(todos.data.totais.saldoMin)} · vencido {fmtMin(todos.data.totais.vencidoMin)}</Typography>
          <Tabela rows={todos.data.items.map((i: any) => ({ ...i, id: i.colaboradorId }))} cols={[{ h: "Colaborador", r: (i: any) => i.nome }, { h: "Saldo", r: (i: any) => i.saldo }, { h: "Vencido", r: (i: any) => fmtMin(i.vencidoMin) }, { h: "A vencer", r: (i: any) => fmtMin(i.aVencerMin) }]} vazio="Nenhum saldo." />
        </Box>
      )}
      <FormDialog open={lanc} title="Lançamento no banco de horas" fields={[{ key: "colaboradorId", label: "Colaborador", type: "select", required: true, options: colabs.opts }, { key: "tipo", label: "Tipo", type: "select", required: true, options: ["CREDITO", "DEBITO", "COMPENSACAO", "PAGAMENTO", "AJUSTE"] }, { key: "minutos", label: "Minutos", type: "number", required: true, helper: "AJUSTE aceita valor negativo." }, { key: "observacao", label: "Observação", type: "textarea", required: true }]} onClose={() => setLanc(false)} onSubmit={(b) => run(() => rh("POST", "/banco-horas/lancamentos", b), "Lançamento registrado.")} maxWidth="sm" />
    </Section>
  );
}

function Fechamento() {
  const [comp, setComp] = useState(mesAnterior());
  const [rev, setRev] = useState(0); const [imp, setImp] = useState(false);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const f = useRh<any>(`/ponto/fechamentos?competencia=${comp}`, [rev]);
  const [reabrir, setReabrir] = useState(false);
  return (
    <Section title="Fechamento mensal e importação">
      {node}
      <Acoes>
        <MesField value={comp} onChange={setComp} />
        <Btn variant="contained" onClick={() => run(() => rh("POST", "/ponto/fechamento", { competencia: comp }), "Fechamento concluído.", `Fechar o ponto de ${comp} para todos os colaboradores?`)}>Fechar ponto</Btn>
        <Btn color="warning" onClick={() => setReabrir(true)}>Reabrir</Btn><Btn onClick={() => setImp(true)}>Importar marcações</Btn>
      </Acoes>
      <KpiRow><Kpi title="Fechados na competência" value={itemsOf(f.data).filter((x: any) => x.status === "FECHADO").length} /></KpiRow>
      <Tabela rows={itemsOf(f.data)} cols={[{ h: "Colaborador", r: (x: any) => x.colaboradorNome }, { h: "Status", r: (x: any) => <Status value={x.status} /> }, { h: "Faltas", r: (x: any) => x.resumo?.faltas }, { h: "Atraso", r: (x: any) => fmtMin(x.resumo?.atrasoMin) }, { h: "HE 50/100", r: (x: any) => `${fmtMin(x.resumo?.extra50Min)} / ${fmtMin(x.resumo?.extra100Min)}` }]} />
      <FormDialog open={reabrir} title={`Reabrir ponto ${comp}`} fields={[{ key: "motivo", label: "Motivo (mín. 10 caracteres)", type: "textarea", required: true }]} onClose={() => setReabrir(false)} onSubmit={(b) => run(() => rh("POST", "/ponto/fechamento/reabrir", { competencia: comp, motivo: b.motivo }), "Ponto reaberto.")} maxWidth="sm" />
      <FormDialog open={imp} title="Importar marcações (relógio/AFD simplificado)" intro={<Alert severity="info" sx={{ mb: 2 }}>Uma marcação por linha: <code>matricula;AAAA-MM-DDTHH:MM;TIPO</code> (horário de Brasília). Tipos: {TIPOS.join(", ")}.</Alert>}
        fields={[{ key: "linhas", label: "Marcações", type: "textarea", required: true }]} onClose={() => setImp(false)}
        onSubmit={(b) => run(async () => { const marcacoes = String(b.linhas).split("\n").map((s) => s.trim()).filter(Boolean).map((s) => { const [matricula, dh, tipo] = s.split(";"); return { matricula: matricula.trim(), dataHora: new Date(`${dh.trim()}:00-03:00`).toISOString(), tipo: tipo.trim() }; }); const r = await rh("POST", "/ponto/importar", { marcacoes }); toast({ type: "info", text: `${r.importadas} importadas, ${r.rejeitadas.length} rejeitadas.` }); return r; }, "Importação concluída.")} />
    </Section>
  );
}

export default function PontoTab() {
  const P = perfil(); const gestao = P.rh || P.gestor;
  const [sec, setSec] = useState("espelho");
  return (
    <>
      <ToggleButtonGroup exclusive size="small" value={sec} onChange={(_, v) => v && setSec(v)} sx={{ mb: 2, flexWrap: "wrap" }}>
        <ToggleButton value="espelho">Espelho</ToggleButton><ToggleButton value="banco">Banco de horas</ToggleButton>
        {gestao && <ToggleButton value="ajustes">Ajustes</ToggleButton>}{P.rh && <ToggleButton value="fechamento">Fechamento</ToggleButton>}
      </ToggleButtonGroup>
      {sec === "espelho" && <Espelho gestao={gestao} />}
      {sec === "banco" && <Banco rhGestao={P.rh} />}
      {sec === "ajustes" && <Ajustes />}
      {sec === "fechamento" && <Fechamento />}
    </>
  );
}
void TextField;
