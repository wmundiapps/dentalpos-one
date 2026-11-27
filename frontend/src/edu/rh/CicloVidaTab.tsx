import { Alert, Box, Button, Checkbox, FormControlLabel, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useState } from "react";
import { Acoes, Btn, FormDialog, Kpi, KpiRow, LoadBox, ModeloAviso, Pick, Section, Status, Tabela, fmtDate, fmtMoney, itemsOf, rh, useColabs, useRh, useRunner, useToast } from "./kit";

function Admissao() {
  const emAd = useRh<any>("/colaboradores?status=EM_ADMISSAO&pageSize=100");
  const [cid, setCid] = useState(""); const [rev, setRev] = useState(0); const [aso, setAso] = useState(false);
  const { toast, node } = useToast(); const run = useRunner(toast, () => setRev((x) => x + 1));
  const ad = useRh<any>(cid ? `/admissao/${cid}` : null, [cid, rev]);
  return (
    <Section title="Admissão: documentos e exame admissional (ASO)">
      {node}
      <Alert severity="info" sx={{ mb: 2 }}>Cadastre o colaborador em <b>Colaboradores</b> sem data de admissão (ou com data futura): ele entra em admissão com o checklist de documentos. A admissão só conclui com documentos obrigatórios, ASO <b>apto</b>, cargo, jornada e data.</Alert>
      <Acoes><Pick label="Colaborador em admissão" value={cid} onChange={setCid} all="Selecione" options={itemsOf(emAd.data).map((c: any) => ({ value: c.id, label: c.nome }))} minWidth={280} /></Acoes>
      <LoadBox loading={ad.loading && !!cid} error={ad.error} onRetry={ad.reload}>
        {ad.data && (
          <>
            <KpiRow><Kpi title="Pendências" value={ad.data.pendencias.length} /><Kpi title="ASO" value={ad.data.exameAdmissional?.resultado?.replace(/_/g, " ") ?? "pendente"} /></KpiRow>
            <Box>{ad.data.itens.map((i: any) => (
              <FormControlLabel key={i.id} sx={{ display: "flex" }} control={<Checkbox checked={i.status !== "PENDENTE"} onChange={(e) => run(() => rh("POST", `/checklist/${i.id}`, { status: e.target.checked ? "RECEBIDO" : "PENDENTE" }), "Item atualizado.")} />} label={`${i.titulo}${i.obrigatorio ? " *" : ""}`} />
            ))}</Box>
            {ad.data.pendencias.length > 0 && <Alert severity="warning" sx={{ my: 2 }}>{ad.data.pendencias.join(" · ")}</Alert>}
            <Acoes><Btn onClick={() => setAso(true)}>Registrar ASO admissional</Btn><Btn variant="contained" onClick={() => run(() => rh("POST", `/admissao/${cid}/concluir`, {}), "Admissão concluída.")}>Concluir admissão</Btn></Acoes>
          </>
        )}
      </LoadBox>
      <FormDialog open={aso} title="ASO admissional" fields={[{ key: "realizadoEm", label: "Realizado em", type: "date", required: true }, { key: "resultado", label: "Resultado", type: "select", required: true, options: ["APTO", "INAPTO", "APTO_COM_RESTRICAO"] }, { key: "restricoes", label: "Restrições", type: "textarea" }, { key: "medico", label: "Médico" }]} onClose={() => setAso(false)} onSubmit={(b) => run(() => rh("POST", "/exames", { ...b, colaboradorId: cid, tipo: "ADMISSIONAL" }), "ASO registrado.")} maxWidth="sm" />
    </Section>
  );
}

function Desligamento() {
  const colabs = useColabs("&status=ATIVO"); const [rev, setRev] = useState(0); const [novo, setNovo] = useState(false); const [sel, setSel] = useState("");
  const [exame, setExame] = useState(false);
  const { toast, node } = useToast(); const run = useRunner(toast, () => setRev((x) => x + 1));
  const l = useRh<any>("/desligamentos?pageSize=100", [rev]);
  const d = useRh<any>(sel ? `/desligamentos/${sel}` : null, [sel, rev]);
  const R = d.data?.rescisao;
  return (
    <Section title="Desligamento" actions={<Button variant="contained" onClick={() => setNovo(true)}>Iniciar desligamento</Button>}>
      {node}
      <ModeloAviso />
      <LoadBox loading={l.loading} error={l.error} onRetry={l.reload}>
        <Tabela rows={itemsOf(l.data)} onRow={(x: any) => setSel(x.id)} cols={[{ h: "Colaborador", r: (x: any) => x.colaboradorNome }, { h: "Tipo", r: (x: any) => String(x.tipo).replace(/_/g, " ") }, { h: "Desligamento", r: (x: any) => fmtDate(x.dataDesligamento) }, { h: "Aviso", r: (x: any) => `${x.avisoTipo.toLowerCase()} (${x.avisoDias}d)` }, { h: "Status", r: (x: any) => <Status value={x.status} /> }]} />
      </LoadBox>
      {d.data && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>{d.data.colaborador.nome} — {String(d.data.status).replace(/_/g, " ")}</Typography>
          <Acoes>
            <Btn onClick={() => setExame(true)}>Exame demissional</Btn><Btn onClick={() => run(() => rh("POST", `/desligamentos/${sel}/rescisao`, {}), "Rescisão simulada.")}>Calcular termo de rescisão (simulação)</Btn>
            <Btn onClick={() => run(() => rh("POST", `/desligamentos/${sel}/acerto`, { acao: "CONFERIR" }), "Acerto conferido.")}>Conferir acerto</Btn>
            <Btn onClick={() => run(() => rh("POST", `/desligamentos/${sel}/acerto`, { acao: "PAGAR" }), "Pagamento registrado.")}>Registrar pagamento</Btn>
            <Btn variant="contained" color="success" onClick={() => run(() => rh("POST", `/desligamentos/${sel}/concluir`, {}), "Desligamento concluído; acesso revogado.", "Concluir o desligamento? O acesso do usuário será desativado.")}>Concluir</Btn>
          </Acoes>
          {d.data.pendencias.length > 0 && <Alert severity="warning" sx={{ mb: 2 }}>{d.data.pendencias.join(" · ")}</Alert>}
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Devolução de patrimônio e encerramento</Typography>
          {d.data.checklist.map((i: any) => <FormControlLabel key={i.id} sx={{ display: "flex" }} control={<Checkbox checked={i.status !== "PENDENTE"} onChange={(e) => run(() => rh("POST", `/desligamentos/${sel}/itens/${i.id}`, { status: e.target.checked ? "RECEBIDO" : "PENDENTE" }), "Item atualizado.")} />} label={`${i.titulo}${i.obrigatorio ? " *" : ""}`} />)}
          {R && (
            <Box sx={{ mt: 2 }}>
              <Alert severity="warning" sx={{ mb: 1 }}>{R.aviso}</Alert>
              <Tabela rows={R.itens.map((i: any) => ({ ...i, id: i.codigo }))} cols={[{ h: "Verba", r: (i: any) => i.nome }, { h: "Tipo", r: (i: any) => i.tipo }, { h: "Valor", r: (i: any) => fmtMoney(i.valor) }]} />
              <KpiRow><Kpi title="Proventos" value={fmtMoney(R.totalProventos)} /><Kpi title="Descontos" value={fmtMoney(R.totalDescontos)} /><Kpi title="Líquido (simulado)" value={fmtMoney(R.liquido)} /><Kpi title="Multa FGTS (fora do líquido)" value={fmtMoney(R.fgts.multa)} /></KpiRow>
              <Typography variant="caption">Acerto: {d.data.acertoStatus}</Typography>
            </Box>
          )}
        </Box>
      )}
      <FormDialog open={novo} title="Iniciar desligamento" fields={[{ key: "colaboradorId", label: "Colaborador", type: "select", required: true, options: colabs.opts }, { key: "tipo", label: "Tipo", type: "select", required: true, options: ["SEM_JUSTA_CAUSA", "JUSTA_CAUSA", "PEDIDO_DEMISSAO", "ACORDO", "TERMINO_CONTRATO", "APOSENTADORIA", "TERMINO_ESTAGIO"] }, { key: "dataComunicacao", label: "Data da comunicação", type: "date", required: true }, { key: "dataDesligamento", label: "Data do desligamento", type: "date", required: true }, { key: "avisoTipo", label: "Aviso prévio", type: "select", options: ["TRABALHADO", "INDENIZADO", "DISPENSADO", "NAO_APLICA"], helper: "Obrigatório em sem justa causa, pedido e acordo" }, { key: "motivo", label: "Motivo", type: "textarea" }]}
        initial={{ avisoTipo: "NAO_APLICA" }} onClose={() => setNovo(false)} onSubmit={(b) => run(() => rh("POST", "/desligamentos", b), "Desligamento iniciado: exame demissional e checklist criados.")} />
      <FormDialog open={exame} title="Exame demissional" fields={[{ key: "dispensar", label: "Dispensar (último ASO com até 135 dias)", type: "bool" }, { key: "realizadoEm", label: "Realizado em", type: "date", hidden: (v) => !!v.dispensar }, { key: "resultado", label: "Resultado", type: "select", options: ["APTO", "INAPTO", "APTO_COM_RESTRICAO"], hidden: (v) => !!v.dispensar }]} onClose={() => setExame(false)} onSubmit={(b) => run(() => rh("POST", `/desligamentos/${sel}/exame`, b), "Exame registrado.")} maxWidth="sm" />
    </Section>
  );
}

export default function CicloVidaTab() {
  const [sec, setSec] = useState("adm");
  return (
    <>
      <ToggleButtonGroup exclusive size="small" value={sec} onChange={(_, v) => v && setSec(v)} sx={{ mb: 2 }}><ToggleButton value="adm">Admissão</ToggleButton><ToggleButton value="des">Desligamento</ToggleButton></ToggleButtonGroup>
      {sec === "adm" ? <Admissao /> : <Desligamento />}
    </>
  );
}
