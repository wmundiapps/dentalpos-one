import { Alert, Button, TextField, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { useState } from "react";
import { Acoes, Btn, FormDialog, LoadBox, MesField, ModeloAviso, Pick, Section, Status, Tabela, fmtMoney, hojeMes, itemsOf, mesAnterior, perfil, rh, useRh, useRunner, useToast } from "./kit";

function Socios() {
  const P = perfil(); const [rev, setRev] = useState(0); const [novo, setNovo] = useState(false); const [sim, setSim] = useState<any>(null); const [v, setV] = useState("10000"); const [comp, setComp] = useState(hojeMes());
  const { toast, node } = useToast(); const run = useRunner(toast, () => setRev((x) => x + 1));
  const s = useRh<any>("/socios", [rev]); const pl = useRh<any>("/pro-labore", [rev]);
  return (
    <>
      <Section title="Sócios" actions={P.rh ? <Button variant="contained" onClick={() => setNovo(true)}>Novo sócio</Button> : undefined}>
        {node}<ModeloAviso />
        <LoadBox loading={s.loading} error={s.error} onRetry={s.reload}>
          <Tabela rows={itemsOf(s.data)} cols={[{ h: "Sócio", r: (x: any) => x.nome }, { h: "CPF", r: (x: any) => x.cpfMascarado ?? "—" }, { h: "Participação", r: (x: any) => `${x.participacaoPct}%` }, ...(P.rh ? [{ h: "Pró-labore mensal", r: (x: any) => fmtMoney(x.proLaboreMensal) }] : []), { h: "Ativo", r: (x: any) => (x.ativo ? "Sim" : "Não") }]} />
        </LoadBox>
        <FormDialog open={novo} title="Novo sócio" fields={[{ key: "nome", label: "Nome", required: true }, { key: "cpf", label: "CPF" }, { key: "participacaoPct", label: "Participação (%)", type: "number" }, { key: "proLaboreMensal", label: "Pró-labore mensal (R$)", type: "number" }, { key: "dependentesIrrf", label: "Dependentes (IRRF)", type: "number" }]} onClose={() => setNovo(false)} onSubmit={(b) => run(() => rh("POST", "/socios", b), "Sócio cadastrado.")} maxWidth="sm" />
      </Section>
      {P.rh && <Section title="Simulador de pró-labore (INSS 11% + IRRF)">
        <Acoes><TextField size="small" type="number" label="Valor bruto" value={v} onChange={(e) => setV(e.target.value)} /><MesField value={comp} onChange={setComp} /><Btn variant="contained" onClick={async () => { try { setSim(await rh("GET", `/pro-labore/simular?valor=${v}&competencia=${comp}`)); } catch (e: any) { toast({ type: "error", text: e.message }); } }}>Simular</Btn></Acoes>
        {sim && <Alert severity="info">Bruto {fmtMoney(sim.bruto)} · INSS {fmtMoney(sim.inss)} · IRRF {fmtMoney(sim.irrf)} ({sim.metodoIrrf}) · <b>Líquido {fmtMoney(sim.liquido)}</b> · INSS patronal estimado {fmtMoney(sim.patronalEstimado)}</Alert>}
      </Section>}
      <Section title="Pró-labore processado na folha">
        <Tabela rows={itemsOf(pl.data)} cols={[{ h: "Competência", r: (x: any) => x.competencia }, { h: "Sócio", r: (x: any) => x.socioNome }, { h: "Bruto", r: (x: any) => fmtMoney(x.bruto) }, { h: "INSS", r: (x: any) => fmtMoney(x.inss) }, { h: "IRRF", r: (x: any) => fmtMoney(x.irrf) }, { h: "Líquido", r: (x: any) => fmtMoney(x.liquido) }]} vazio="Calcule a folha para gerar o pró-labore." />
      </Section>
    </>
  );
}

function Terceiros() {
  const P = perfil(); const [rev, setRev] = useState(0); const [novoT, setNovoT] = useState(false); const [novoP, setNovoP] = useState(false); const [comp, setComp] = useState(mesAnterior());
  const { toast, node } = useToast(); const run = useRunner(toast, () => setRev((x) => x + 1));
  const t = useRh<any>("/terceiros?pageSize=100", [rev]); const p = useRh<any>(`/terceiros/pagamentos?competencia=${comp}&pageSize=100`, [rev, comp]);
  return (
    <>
      <Section title="Terceiros (RPA / PJ)" actions={P.rh ? <Button variant="contained" onClick={() => setNovoT(true)}>Novo terceiro</Button> : undefined}>
        {node}
        <Tabela rows={itemsOf(t.data)} cols={[{ h: "Nome", r: (x: any) => x.nome }, { h: "Tipo", r: (x: any) => x.tipo }, { h: "Documento", r: (x: any) => x.documentoMascarado ?? "—" }, { h: "Serviço", r: (x: any) => x.servico ?? "—", hideMobile: true }]} />
      </Section>
      <Section title="Pagamentos a terceiros" actions={P.rh ? <Button variant="contained" onClick={() => setNovoP(true)}>Novo pagamento</Button> : undefined}>
        <Acoes><MesField value={comp} onChange={setComp} /></Acoes>
        <LoadBox loading={p.loading} error={p.error} onRetry={p.reload}>
          <Tabela rows={itemsOf(p.data)} cols={[{ h: "Terceiro", r: (x: any) => `${x.terceiroNome} (${x.terceiroTipo})` }, { h: "Descrição", r: (x: any) => x.descricao, hideMobile: true }, { h: "Bruto", r: (x: any) => fmtMoney(x.bruto) }, { h: "Retenções", r: (x: any) => fmtMoney(x.inss + x.irrf + x.iss + x.outrasRetencoes) }, { h: "Líquido", r: (x: any) => fmtMoney(x.liquido) }, { h: "NF", r: (x: any) => x.notaFiscal ?? "—", hideMobile: true }, { h: "Status", r: (x: any) => <Status value={x.status} /> },
            { h: "Ação", r: (x: any) => (<>{P.rh && x.status === "RASCUNHO" && <Btn color="success" onClick={() => run(() => rh("POST", `/terceiros/pagamentos/${x.id}/aprovar`, {}), "Aprovado.")}>Aprovar</Btn>}{(P.rh || P.fin) && x.status === "APROVADO" && <Btn onClick={() => run(() => rh("POST", `/terceiros/pagamentos/${x.id}/pago`, {}), "Baixa registrada.")}>Baixar</Btn>}{P.rh && ["RASCUNHO", "APROVADO"].includes(x.status) && <Btn color="error" onClick={() => run(() => rh("POST", `/terceiros/pagamentos/${x.id}/cancelar`, {}), "Cancelado.")}>Cancelar</Btn>}</>) }]} />
        </LoadBox>
        <Alert severity="info" sx={{ mt: 2 }}>RPA: INSS 11% (teto), IRRF e ISS informado; PJ exige nota fiscal. Pagamentos aprovados saem nos lançamentos a pagar da competência. Aprovador e quem dá baixa devem ser pessoas diferentes.</Alert>
      </Section>
      <FormDialog open={novoT} title="Novo terceiro" fields={[{ key: "tipo", label: "Tipo", type: "select", required: true, options: ["RPA", "PJ"] }, { key: "nome", label: "Nome / razão social", required: true }, { key: "documento", label: "CPF (RPA) ou CNPJ (PJ)", required: true }, { key: "email", label: "E-mail" }, { key: "servico", label: "Serviço" }, { key: "pix", label: "Chave PIX (cifrada)" }]} onClose={() => setNovoT(false)} onSubmit={(b) => run(() => rh("POST", "/terceiros", b), "Terceiro cadastrado.")} maxWidth="sm" />
      <FormDialog open={novoP} title="Novo pagamento a terceiro" fields={[{ key: "terceiroId", label: "Terceiro", type: "select", required: true, options: itemsOf(t.data).map((x: any) => ({ value: x.id, label: `${x.nome} (${x.tipo})` })) }, { key: "competencia", label: "Competência (AAAA-MM)", required: true }, { key: "descricao", label: "Descrição", required: true }, { key: "bruto", label: "Valor bruto (R$)", type: "number", required: true }, { key: "issPct", label: "ISS (%) — RPA", type: "number" }, { key: "notaFiscal", label: "Nota fiscal (PJ)" }, { key: "dataPrevista", label: "Data prevista", type: "date" }]} initial={{ competencia: comp }} onClose={() => setNovoP(false)} onSubmit={(b) => run(() => rh("POST", "/terceiros/pagamentos", b), "Pagamento criado.")} />
    </>
  );
}

export default function SociosTab() {
  const [sec, setSec] = useState("socios");
  return (
    <>
      <ToggleButtonGroup exclusive size="small" value={sec} onChange={(_, v) => v && setSec(v)} sx={{ mb: 2 }}><ToggleButton value="socios">Sócios e pró-labore</ToggleButton><ToggleButton value="terceiros">Terceiros (RPA/PJ)</ToggleButton></ToggleButtonGroup>
      {sec === "socios" ? <Socios /> : <Terceiros />}
    </>
  );
}
void Pick;
