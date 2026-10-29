import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useState } from "react";
import { Acoes, Btn, FormDialog, Kpi, KpiRow, LoadBox, MesField, ModeloAviso, Pick, Section, Status, Tabela, fmtDate, fmtMoney, itemsOf, mesAnterior, perfil, rh, useRh, useRunner, useToast } from "./kit";

function Holerite({ id, onClose }: { id: string | null; onClose: () => void }) {
  const h = useRh<any>(id ? `/folha/holerite/${id}` : null, [id]);
  const d = h.data;
  return (
    <Dialog open={!!id} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Holerite {d?.folha?.competencia} {d?.folha?.tipo !== "MENSAL" ? `(${String(d?.folha?.tipo).replace(/_/g, " ")})` : ""}</DialogTitle>
      <DialogContent dividers>
        <LoadBox loading={h.loading} error={h.error}>
          {d && <>
            <Typography variant="body2" sx={{ mb: 1 }}><b>{d.colaborador.nome}</b> · matrícula {d.colaborador.matricula} · CPF {d.colaborador.cpfMascarado ?? "—"}</Typography>
            <Tabela rows={d.itens.map((i: any, n: number) => ({ ...i, id: `${i.codigo}${n}` }))} cols={[{ h: "Evento", r: (i: any) => i.nome }, { h: "Ref.", r: (i: any) => i.referencia ?? "" }, { h: "Provento", r: (i: any) => (i.tipo === "PROVENTO" ? fmtMoney(i.valor) : "") }, { h: "Desconto", r: (i: any) => (i.tipo === "DESCONTO" ? fmtMoney(i.valor) : "") }, { h: "Informativo", r: (i: any) => (i.tipo === "INFO" ? fmtMoney(i.valor) : ""), hideMobile: true }]} />
            <KpiRow><Kpi title="Bruto" value={fmtMoney(d.bruto)} /><Kpi title="Descontos" value={fmtMoney(d.descontos)} /><Kpi title="Líquido" value={fmtMoney(d.liquido)} /></KpiRow>
            <Alert severity="warning">{d.aviso}</Alert>
          </>}
        </LoadBox>
      </DialogContent>
      <DialogActions><Button onClick={() => window.print()}>Imprimir</Button><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

function Calculo() {
  const P = perfil(); const [comp, setComp] = useState(mesAnterior()); const [tipo, setTipo] = useState("MENSAL"); const [rev, setRev] = useState(0); const [hid, setHid] = useState<string | null>(null); const [man, setMan] = useState(false); const [reab, setReab] = useState<string | null>(null);
  const { toast, node } = useToast(); const run = useRunner(toast, () => setRev((x) => x + 1));
  const fl = useRh<any>(`/folha?competencia=${comp}`, [rev]);
  const folha = itemsOf(fl.data).find((f: any) => f.tipo === tipo);
  const hs = useRh<any>(folha ? `/folha/${folha.id}/holerites` : null, [folha?.id, rev]);
  const evs = itemsOf(useRh<any>(P.rh ? "/folha/eventos" : null).data);
  const colabs = itemsOf(useRh<any>(P.rh ? "/colaboradores?pageSize=200" : null).data);
  const t = folha?.totais;
  return (
    <Section title="Folha de pagamento">
      {node}<ModeloAviso />
      <Acoes>
        <MesField value={comp} onChange={setComp} />
        <Pick label="Folha" value={tipo} onChange={setTipo} options={[{ value: "MENSAL", label: "Mensal" }, { value: "DECIMO_1A", label: "13º - 1ª parcela" }, { value: "DECIMO_2A", label: "13º - 2ª parcela" }]} minWidth={170} />
        {P.rh && <><Btn variant="contained" disabled={folha?.status === "FECHADA"} onClick={() => run(() => rh("POST", "/folha/calcular", { competencia: comp, tipo }), "Folha calculada.")}>Calcular</Btn>
          <Btn color="success" disabled={!folha || folha.status !== "CALCULADA"} onClick={() => run(() => rh("POST", `/folha/${folha.id}/fechar`, {}), "Folha fechada; lançamentos a pagar gerados para o Financeiro.", "Fechar a folha? Os lançamentos a pagar serão gerados para conferência no Financeiro.")}>Fechar folha</Btn>
          <Btn color="warning" disabled={folha?.status !== "FECHADA"} onClick={() => setReab(folha.id)}>Reabrir</Btn><Btn onClick={() => setMan(true)}>Lançar evento manual</Btn></>}
      </Acoes>
      {folha && <Typography variant="body2" sx={{ mb: 1 }}>Status: <Status value={folha.status} /> {folha.fechadaEm ? `· fechada em ${fmtDate(folha.fechadaEm)}` : ""}</Typography>}
      {t && <KpiRow><Kpi title="Colaboradores" value={t.colaboradores} /><Kpi title="Bruto" value={fmtMoney(t.bruto)} /><Kpi title="Líquido" value={fmtMoney(t.liquido)} /><Kpi title="INSS retido" value={fmtMoney(t.inss)} /><Kpi title="IRRF" value={fmtMoney(t.irrf)} /><Kpi title="FGTS" value={fmtMoney(t.fgts)} /><Kpi title="Pró-labore (líq.)" value={fmtMoney(t.proLabore?.liquido)} /><Kpi title="Custo total estimado" value={fmtMoney(t.custoTotalEstimado)} /></KpiRow>}
      {(folha?.avisos?.length ?? 0) > 0 && <Alert severity="warning" sx={{ mb: 2 }}>{folha.avisos.slice(0, 4).join(" · ")}{folha.avisos.length > 4 ? ` (+${folha.avisos.length - 4})` : ""}</Alert>}
      <LoadBox loading={hs.loading && !!folha} error={hs.error} onRetry={hs.reload}>
        {hs.data && <Tabela rows={hs.data.holerites} onRow={(x: any) => setHid(x.id)} cols={[{ h: "Colaborador", r: (x: any) => x.colaboradorNome }, { h: "Vínculo", r: (x: any) => String(x.vinculo).replace(/_/g, " "), hideMobile: true }, { h: "Bruto", r: (x: any) => fmtMoney(x.bruto) }, { h: "INSS", r: (x: any) => fmtMoney(x.inss), hideMobile: true }, { h: "IRRF", r: (x: any) => fmtMoney(x.irrf), hideMobile: true }, { h: "Líquido", r: (x: any) => fmtMoney(x.liquido) }]} />}
      </LoadBox>
      <Holerite id={hid} onClose={() => setHid(null)} />
      <FormDialog open={man} title="Evento manual na folha" fields={[{ key: "colaboradorId", label: "Colaborador", type: "select", required: true, options: colabs.map((c: any) => ({ value: c.id, label: c.nome })) }, { key: "eventoCodigo", label: "Evento", type: "select", required: true, options: evs.filter((e: any) => !["INSS", "IRRF", "SAL"].includes(e.codigo)).map((e: any) => ({ value: e.codigo, label: `${e.codigo} · ${e.nome} (${e.tipo.toLowerCase()})` })) }, { key: "valor", label: "Valor (R$)", type: "number", required: true }, { key: "descricao", label: "Descrição" }]} onClose={() => setMan(false)} onSubmit={(b) => run(() => rh("POST", "/folha/lancamentos", { ...b, competencia: comp }), "Evento lançado; recalcule a folha.")} maxWidth="sm" />
      <FormDialog open={!!reab} title="Reabrir folha" fields={[{ key: "motivo", label: "Motivo (mín. 10 caracteres)", type: "textarea", required: true }]} onClose={() => setReab(null)} onSubmit={(b) => run(() => rh("POST", `/folha/${reab}/reabrir`, b), "Folha reaberta.")} maxWidth="sm" />
    </Section>
  );
}

function Lancamentos() {
  const [comp, setComp] = useState(mesAnterior());
  const l = useRh<any>(`/folha/${comp}/lancamentos`, [comp]);
  return (
    <Section title="Lançamentos a pagar (para conferência no Financeiro)">
      <Alert severity="info" sx={{ mb: 2 }}>Gerados a partir da folha <b>fechada</b>. O Financeiro confere e autoriza. Dados bancários não vão no lançamento (consulta própria, com log).</Alert>
      <Acoes><MesField value={comp} onChange={setComp} />{l.data && <Typography><b>Total: {fmtMoney(l.data.total)}</b></Typography>}</Acoes>
      <LoadBox loading={l.loading} error={l.error} onRetry={l.reload}>
        {l.data && <Tabela rows={l.data.items.map((i: any) => ({ ...i, id: i.chaveIdempotencia }))} cols={[{ h: "Vencimento", r: (i: any) => fmtDate(i.vencimento) }, { h: "Tipo", r: (i: any) => String(i.tipo).replace(/_/g, " ") }, { h: "Descrição", r: (i: any) => i.descricao }, { h: "Beneficiário", r: (i: any) => `${i.beneficiario.nome}${i.beneficiario.documentoMascarado ? ` (${i.beneficiario.documentoMascarado})` : ""}`, hideMobile: true }, { h: "Valor", r: (i: any) => fmtMoney(i.valor) }, { h: "Status", r: (i: any) => <Status value={i.status} /> }]} />}
      </LoadBox>
    </Section>
  );
}

function Tabelas() {
  const t = useRh<any>("/folha/tabelas");
  return (
    <Section title="Tabelas fiscais por vigência (modelo a validar por contador)">
      <ModeloAviso />
      <LoadBox loading={t.loading} error={t.error} onRetry={t.reload}>
        <Tabela rows={itemsOf(t.data)} cols={[{ h: "Tipo", r: (x: any) => x.tipo }, { h: "Vigência", r: (x: any) => fmtDate(x.vigenciaInicio) }, { h: "Faixas", r: (x: any) => (x.faixas ? x.faixas.map((f: any) => `${f.ate ?? "∞"}: ${f.aliquota}%`).join(" · ") : "—"), hideMobile: true }, { h: "Parâmetros", r: (x: any) => JSON.stringify(x.parametros ?? {}).slice(0, 110) }, { h: "Situação", r: (x: any) => (x.modeloAValidar ? "Modelo a validar" : "Validada") }]} />
      </LoadBox>
    </Section>
  );
}

function MeusHolerites() {
  const [hid, setHid] = useState<string | null>(null);
  const l = useRh<any>("/meus/holerites");
  return (
    <Section title="Meus holerites">
      <LoadBox loading={l.loading} error={l.error} onRetry={l.reload}>
        <Tabela rows={itemsOf(l.data)} onRow={(x: any) => setHid(x.id)} cols={[{ h: "Competência", r: (x: any) => x.competencia }, { h: "Folha", r: (x: any) => String(x.tipoFolha).replace(/_/g, " ") }, { h: "Bruto", r: (x: any) => fmtMoney(x.bruto) }, { h: "Líquido", r: (x: any) => fmtMoney(x.liquido) }]} vazio="Nenhum holerite disponível." />
      </LoadBox>
      <Holerite id={hid} onClose={() => setHid(null)} />
    </Section>
  );
}

export default function FolhaTab() {
  const P = perfil(); const gest = P.rh || P.fin;
  const [sec, setSec] = useState(gest ? "folha" : "meus");
  return (
    <>
      <ToggleButtonGroup exclusive size="small" value={sec} onChange={(_, v) => v && setSec(v)} sx={{ mb: 2, flexWrap: "wrap" }}>
        {gest && <ToggleButton value="folha">Folha</ToggleButton>}{gest && <ToggleButton value="lanc">A pagar</ToggleButton>}{P.rh && <ToggleButton value="tab">Tabelas fiscais</ToggleButton>}<ToggleButton value="meus">Meus holerites</ToggleButton>
      </ToggleButtonGroup>
      {sec === "folha" && gest && <Calculo />}{sec === "lanc" && gest && <Lancamentos />}{sec === "tab" && <Tabelas />}{sec === "meus" && <MeusHolerites />}
    </>
  );
}
void Box;
