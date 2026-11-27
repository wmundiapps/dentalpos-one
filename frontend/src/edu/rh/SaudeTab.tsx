import { Alert, Button, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { useState } from "react";
import { Acoes, Btn, FormDialog, LoadBox, Pick, Section, Status, Tabela, fmtDate, itemsOf, perfil, rh, useColabs, useRh, useRunner, useToast } from "./kit";

function Atestados() {
  const P = perfil(); const colabs = useColabs();
  const [rev, setRev] = useState(0); const [novo, setNovo] = useState(false);
  const { toast, node } = useToast(); const run = useRunner(toast, () => setRev((x) => x + 1));
  const l = useRh<any>("/atestados?pageSize=100", [rev]);
  return (
    <Section title="Atestados" actions={<Button variant="contained" onClick={() => setNovo(true)}>Registrar atestado</Button>}>
      {node}
      <Alert severity="info" sx={{ mb: 2 }}>O CID é opcional e <b>dado de saúde sensível</b>: fica cifrado e só o RH o visualiza (cada consulta é registrada). Gestores veem apenas período e situação.</Alert>
      <LoadBox loading={l.loading} error={l.error} onRetry={l.reload}>
        <Tabela rows={itemsOf(l.data)} cols={[
          { h: "Colaborador", r: (a: any) => a.colaboradorNome }, { h: "Início", r: (a: any) => fmtDate(a.dataInicio) }, { h: "Dias", r: (a: any) => a.dias }, { h: "Tipo", r: (a: any) => a.tipo ?? "—", hideMobile: true },
          { h: "CID", r: (a: any) => (a.dadosDeSaudeRestritos ? "restrito" : a.cid ?? "—") }, { h: "Afastamento", r: (a: any) => (a.afastamento ? "Sim (INSS após 15 dias)" : "Não"), hideMobile: true }, { h: "Status", r: (a: any) => <Status value={a.status} /> },
          { h: "Ação", r: (a: any) => (P.rh && a.status === "REGISTRADO" ? <><Btn color="success" onClick={() => run(() => rh("POST", `/atestados/${a.id}/validar`, { aceitar: true }), "Atestado validado.")}>Validar</Btn> <Btn color="error" onClick={() => run(() => rh("POST", `/atestados/${a.id}/validar`, { aceitar: false }), "Atestado rejeitado.")}>Rejeitar</Btn></> : "") },
        ]} />
      </LoadBox>
      <FormDialog open={novo} title="Registrar atestado" fields={[{ key: "colaboradorId", label: "Colaborador", type: "select", options: colabs.opts, helper: "Em branco = você mesmo" }, { key: "tipo", label: "Tipo", type: "select", options: ["MEDICO", "COMPARECIMENTO", "ACOMPANHAMENTO_FAMILIAR", "ODONTOLOGICO"] }, { key: "dataInicio", label: "Início", type: "date", required: true }, { key: "dias", label: "Dias", type: "number", required: true }, { key: "cid", label: "CID (opcional)", helper: "Ex.: J11 ou M54.5" }, { key: "medico", label: "Médico" }, { key: "crm", label: "CRM" }, { key: "abonaPonto", label: "Abona o ponto", type: "bool" }, { key: "observacao", label: "Observação", type: "textarea" }]} initial={{ tipo: "MEDICO", abonaPonto: true, dias: 1 }} onClose={() => setNovo(false)} onSubmit={(b) => run(() => rh("POST", "/atestados", b), "Atestado registrado.")} />
    </Section>
  );
}

const DEC = (run: any, base: string) => ({ decidir: (id: string, aprovar: boolean) => run(() => rh("POST", `${base}/${id}/decidir`, { aprovar, motivo: aprovar ? "Aprovado" : "Não aprovado" }), aprovar ? "Aprovado." : "Rejeitado.") });

function Licencas() {
  const P = perfil(); const colabs = useColabs();
  const [rev, setRev] = useState(0); const [novo, setNovo] = useState(false);
  const { toast, node } = useToast(); const run = useRunner(toast, () => setRev((x) => x + 1));
  const l = useRh<any>("/licencas?pageSize=100", [rev]); const d = DEC(run, "/licencas");
  return (
    <Section title="Licenças" actions={<Button variant="contained" onClick={() => setNovo(true)}>Solicitar licença</Button>}>
      {node}
      <LoadBox loading={l.loading} error={l.error} onRetry={l.reload}>
        <Tabela rows={itemsOf(l.data)} cols={[
          { h: "Colaborador", r: (x: any) => x.colaboradorNome }, { h: "Tipo", r: (x: any) => String(x.tipo).replace(/_/g, " ") }, { h: "Período", r: (x: any) => `${fmtDate(x.inicio)} a ${fmtDate(x.fim)}` }, { h: "Dias", r: (x: any) => x.dias },
          { h: "Remunerada", r: (x: any) => (x.remunerada ? "Sim" : "Não"), hideMobile: true }, { h: "Status", r: (x: any) => <Status value={x.status} /> },
          { h: "Ação", r: (x: any) => (x.status === "SOLICITADA" && (P.rh || P.gestor) ? <><Btn color="success" onClick={() => d.decidir(x.id, true)}>Aprovar</Btn> <Btn color="error" onClick={() => d.decidir(x.id, false)}>Rejeitar</Btn></> : ["SOLICITADA", "APROVADA"].includes(x.status) ? <Btn onClick={() => run(() => rh("POST", `/licencas/${x.id}/cancelar`, {}), "Cancelada.")}>Cancelar</Btn> : "") },
        ]} />
      </LoadBox>
      <FormDialog open={novo} title="Solicitar licença" intro={<Alert severity="info" sx={{ mb: 2 }}>Maternidade 120 dias (180 Empresa Cidadã), paternidade 5 (20), nojo 2, gala 3 — duração legal fixa. Médica, sem vencimento e outras: informe os dias.</Alert>}
        fields={[{ key: "colaboradorId", label: "Colaborador", type: "select", options: colabs.opts, helper: "Em branco = você mesmo" }, { key: "tipo", label: "Tipo", type: "select", required: true, options: ["MATERNIDADE", "PATERNIDADE", "MEDICA", "NOJO", "GALA", "SEM_VENCIMENTO", "OUTRA"] }, { key: "inicio", label: "Início", type: "date", required: true }, { key: "dias", label: "Dias (licenças sem duração fixa)", type: "number" }, { key: "empresaCidada", label: "Empresa Cidadã", type: "bool" }, { key: "observacao", label: "Observação", type: "textarea" }]}
        onClose={() => setNovo(false)} onSubmit={(b) => run(() => rh("POST", "/licencas", b), "Licença solicitada.")} />
    </Section>
  );
}

function Exames() {
  const colabs = useColabs(); const P = perfil();
  const [rev, setRev] = useState(0); const [novo, setNovo] = useState(false); const [res, setRes] = useState<any | null>(null);
  const [cid, setCid] = useState("");
  const { toast, node } = useToast(); const run = useRunner(toast, () => setRev((x) => x + 1));
  const l = useRh<any>(`/exames?pageSize=100${cid ? `&colaboradorId=${cid}` : ""}`, [rev]);
  const v = useRh<any>(P.rh ? "/exames/vencimentos" : null, [rev]);
  return (
    <Section title="Exames ocupacionais (ASO)" actions={P.rh ? <Button variant="contained" onClick={() => setNovo(true)}>Registrar exame</Button> : undefined}>
      {node}
      {v.data?.items?.length > 0 && <Alert severity="warning" sx={{ mb: 2 }}>{v.data.items.length} colaborador(es) com exame vencido, a vencer em {v.data.dias} dias ou inexistente: {v.data.items.slice(0, 6).map((x: any) => `${x.nome} (${x.situacao.replace("_", " ").toLowerCase()})`).join(" · ")}</Alert>}
      <Acoes>{(P.rh || P.gestor) && <Pick label="Colaborador" value={cid} onChange={setCid} all="Todos" options={colabs.opts} minWidth={240} />}</Acoes>
      <LoadBox loading={l.loading} error={l.error} onRetry={l.reload}>
        <Tabela rows={itemsOf(l.data)} cols={[
          { h: "Colaborador", r: (e: any) => e.colaboradorNome }, { h: "Tipo", r: (e: any) => e.tipo }, { h: "Realizado", r: (e: any) => fmtDate(e.realizadoEm) }, { h: "Vence", r: (e: any) => fmtDate(e.venceEm) },
          { h: "Resultado", r: (e: any) => (e.dadosDeSaudeRestritos ? "restrito" : e.resultado ?? "—") }, { h: "Situação", r: (e: any) => <Status value={e.situacao} /> },
          { h: "Ação", r: (e: any) => (P.rh && e.status === "AGENDADO" ? <Btn onClick={() => setRes(e)}>Lançar resultado</Btn> : "") },
        ]} />
      </LoadBox>
      <FormDialog open={novo} title="Registrar exame ocupacional" fields={[{ key: "colaboradorId", label: "Colaborador", type: "select", required: true, options: colabs.opts }, { key: "tipo", label: "Tipo", type: "select", required: true, options: ["ADMISSIONAL", "PERIODICO", "RETORNO_TRABALHO", "MUDANCA_FUNCAO", "DEMISSIONAL"] }, { key: "agendadoPara", label: "Agendado para", type: "date" }, { key: "realizadoEm", label: "Realizado em", type: "date" }, { key: "resultado", label: "Resultado", type: "select", options: ["APTO", "INAPTO", "APTO_COM_RESTRICAO"] }, { key: "restricoes", label: "Restrições", type: "textarea" }, { key: "medico", label: "Médico" }, { key: "clinica", label: "Clínica" }]} onClose={() => setNovo(false)} onSubmit={(b) => run(() => rh("POST", "/exames", b), "Exame registrado.")} />
      <FormDialog open={!!res} title="Resultado do exame" fields={[{ key: "realizadoEm", label: "Realizado em", type: "date", required: true }, { key: "resultado", label: "Resultado", type: "select", required: true, options: ["APTO", "INAPTO", "APTO_COM_RESTRICAO"] }, { key: "restricoes", label: "Restrições", type: "textarea" }, { key: "medico", label: "Médico" }]} onClose={() => setRes(null)} onSubmit={(b) => run(() => rh("POST", `/exames/${res.id}/resultado`, b), "Resultado lançado.")} maxWidth="sm" />
    </Section>
  );
}

export default function SaudeTab() {
  const [sec, setSec] = useState("atestados");
  return (
    <>
      <ToggleButtonGroup exclusive size="small" value={sec} onChange={(_, v) => v && setSec(v)} sx={{ mb: 2, flexWrap: "wrap" }}>
        <ToggleButton value="atestados">Atestados</ToggleButton><ToggleButton value="licencas">Licenças</ToggleButton><ToggleButton value="exames">Exames (ASO)</ToggleButton>
      </ToggleButtonGroup>
      {sec === "atestados" && <Atestados />}{sec === "licencas" && <Licencas />}{sec === "exames" && <Exames />}
    </>
  );
}
