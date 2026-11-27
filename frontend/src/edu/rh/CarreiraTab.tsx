import { Alert, Button, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useState } from "react";
import { Acoes, Btn, FormDialog, LoadBox, Pick, Section, Status, Tabela, fmtDate, fmtMoney, itemsOf, mesAnterior, perfil, rh, useColabs, useRh, useRunner, useToast } from "./kit";

function Planos() {
  const P = perfil(); const [rev, setRev] = useState(0); const [novo, setNovo] = useState(false); const [niv, setNiv] = useState<any | null>(null); const [sel, setSel] = useState("");
  const { toast, node } = useToast(); const run = useRunner(toast, () => setRev((x) => x + 1));
  const pl = useRh<any>("/planos-carreira?pageSize=100", [rev]);
  const nv = useRh<any>(sel ? `/planos-carreira/${sel}/niveis` : null, [rev, sel]);
  return (
    <Section title="Planos de carreira" actions={P.rh ? <Button variant="contained" onClick={() => setNovo(true)}>Novo plano</Button> : undefined}>
      {node}
      <Pick label="Plano" value={sel} onChange={setSel} all="Selecione" options={itemsOf(pl.data).map((p: any) => ({ value: p.id, label: p.nome }))} minWidth={260} />
      {sel && <>
        <Acoes>{P.rh && <Btn onClick={() => setNiv({})}>Novo nível</Btn>}</Acoes>
        <LoadBox loading={nv.loading} error={nv.error} onRetry={nv.reload}>
          <Tabela rows={(nv.data?.niveis ?? [])} cols={[{ h: "Ordem", r: (n: any) => n.ordem }, { h: "Nível", r: (n: any) => n.nome }, { h: "Salário base", r: (n: any) => fmtMoney(n.salarioBase) }, { h: "Interstício", r: (n: any) => `${n.intersticioMeses} meses` }, { h: "Requisitos", r: (n: any) => n.requisitos ?? "—", hideMobile: true }]} />
        </LoadBox></>}
      <FormDialog open={novo} title="Novo plano de carreira" fields={[{ key: "nome", label: "Nome", required: true }, { key: "categoria", label: "Categoria", type: "select", options: ["DOCENTE", "TECNICO_ADMINISTRATIVO"] }]} initial={{ categoria: "TECNICO_ADMINISTRATIVO" }} onClose={() => setNovo(false)} onSubmit={(b) => run(() => rh("POST", "/planos-carreira", b), "Plano criado.")} maxWidth="sm" />
      <FormDialog open={!!niv} title="Novo nível" fields={[{ key: "ordem", label: "Ordem", type: "number", required: true }, { key: "nome", label: "Nome", required: true }, { key: "salarioBase", label: "Salário base", type: "number", required: true }, { key: "intersticioMeses", label: "Interstício (meses)", type: "number" }, { key: "requisitos", label: "Requisitos", type: "textarea" }]} initial={{ intersticioMeses: 12 }} onClose={() => setNiv(null)} onSubmit={(b) => run(() => rh("POST", `/planos-carreira/${sel}/niveis`, b), "Nível criado.")} maxWidth="sm" />
    </Section>
  );
}

function Movimentacoes() {
  const P = perfil(); const colabs = useColabs(); const [cid, setCid] = useState(""); const [rev, setRev] = useState(0); const [novo, setNovo] = useState(false);
  const { toast, node } = useToast(); const run = useRunner(toast, () => setRev((x) => x + 1));
  const l = useRh<any>(`/movimentacoes?pageSize=100${cid ? `&colaboradorId=${cid}` : ""}`, [rev]);
  const cargos = itemsOf(useRh<any>("/cargos?pageSize=100").data).map((c: any) => ({ value: c.id, label: c.nome }));
  return (
    <Section title="Histórico de cargo e salário" actions={P.rh ? <Button variant="contained" onClick={() => setNovo(true)}>Nova movimentação</Button> : undefined}>
      {node}
      <Acoes>{(P.rh || P.gestor) && <Pick label="Colaborador" value={cid} onChange={setCid} all={P.rh ? "Todos" : "Eu mesmo"} options={colabs.opts} minWidth={240} />}</Acoes>
      <LoadBox loading={l.loading} error={l.error} onRetry={l.reload}>
        <Tabela rows={itemsOf(l.data)} cols={[{ h: "Data", r: (m: any) => fmtDate(m.dataEfetiva) }, { h: "Colaborador", r: (m: any) => m.colaboradorNome }, { h: "Tipo", r: (m: any) => m.tipo }, { h: "Cargo", r: (m: any) => `${m.cargoDeNome ?? "—"} → ${m.cargoParaNome ?? "—"}` }, { h: "Salário", r: (m: any) => (m.salarioPara !== undefined ? `${fmtMoney(m.salarioDe)} → ${fmtMoney(m.salarioPara)}` : "restrito") }, { h: "Motivo", r: (m: any) => m.motivo ?? "—", hideMobile: true }]} />
      </LoadBox>
      <FormDialog open={novo} title="Nova movimentação (promoção, progressão, mérito...)" intro={<Alert severity="info" sx={{ mb: 2 }}>Não é permitido reduzir salário de CLT. Para níveis do plano de carreira o interstício mínimo é verificado.</Alert>}
        fields={[{ key: "colaboradorId", label: "Colaborador", type: "select", required: true, options: colabs.opts }, { key: "tipo", label: "Tipo", type: "select", required: true, options: ["PROMOCAO", "PROGRESSAO", "MERITO", "ENQUADRAMENTO", "TRANSFERENCIA", "REAJUSTE"] }, { key: "dataEfetiva", label: "Data efetiva", type: "date", required: true }, { key: "cargoParaId", label: "Novo cargo", type: "select", options: cargos }, { key: "nivelParaId", label: "ID do nível do plano (opcional)" }, { key: "salarioPara", label: "Novo salário", type: "number" }, { key: "forcarIntersticio", label: "Forçar interstício (justificar no motivo)", type: "bool" }, { key: "motivo", label: "Motivo", type: "textarea", required: true }]}
        onClose={() => setNovo(false)} onSubmit={(b) => run(() => rh("POST", "/movimentacoes", b), "Movimentação registrada.")} />
    </Section>
  );
}

function Bonificacoes() {
  const P = perfil(); const colabs = useColabs(); const [rev, setRev] = useState(0); const [novo, setNovo] = useState(false);
  const { toast, node } = useToast(); const run = useRunner(toast, () => setRev((x) => x + 1));
  const l = useRh<any>("/bonificacoes?pageSize=100", [rev]);
  return (
    <Section title="Bonificações e premiações" actions={P.rh || P.gestor ? <Button variant="contained" onClick={() => setNovo(true)}>Propor</Button> : undefined}>
      {node}
      <LoadBox loading={l.loading} error={l.error} onRetry={l.reload}>
        <Tabela rows={itemsOf(l.data)} cols={[{ h: "Colaborador", r: (b: any) => b.colaboradorNome }, { h: "Tipo", r: (b: any) => b.tipo }, { h: "Descrição", r: (b: any) => b.descricao }, { h: "Valor", r: (b: any) => fmtMoney(b.valor) }, { h: "Competência", r: (b: any) => b.competencia }, { h: "Status", r: (b: any) => <Status value={b.status} /> },
          { h: "Ação", r: (b: any) => (P.rh && b.status === "PROPOSTA" ? <><Btn color="success" onClick={() => run(() => rh("POST", `/bonificacoes/${b.id}/decidir`, { aprovar: true }), "Aprovada.")}>Aprovar</Btn> <Btn color="error" onClick={() => run(() => rh("POST", `/bonificacoes/${b.id}/decidir`, { aprovar: false, motivo: "Não aprovada" }), "Reprovada.")}>Reprovar</Btn></> : "") }]} />
      </LoadBox>
      <Typography variant="caption" color="text.secondary">Aprovadas entram como proventos na folha da competência (PLR sem INSS/FGTS).</Typography>
      <FormDialog open={novo} title="Propor bonificação" fields={[{ key: "colaboradorId", label: "Colaborador", type: "select", required: true, options: colabs.opts }, { key: "tipo", label: "Tipo", type: "select", required: true, options: ["BONUS", "PREMIO", "PLR", "COMISSAO", "RECONHECIMENTO"] }, { key: "descricao", label: "Descrição", required: true }, { key: "valor", label: "Valor (R$)", type: "number", required: true }, { key: "competencia", label: "Competência (AAAA-MM)", required: true }, { key: "incideEncargos", label: "Incide encargos", type: "bool" }, { key: "motivo", label: "Justificativa", type: "textarea" }]}
        initial={{ tipo: "BONUS", competencia: mesAnterior(), incideEncargos: true }} onClose={() => setNovo(false)} onSubmit={(b) => run(() => rh("POST", "/bonificacoes", b), "Bonificação proposta.")} />
    </Section>
  );
}

export default function CarreiraTab() {
  const [sec, setSec] = useState("mov");
  return (
    <>
      <ToggleButtonGroup exclusive size="small" value={sec} onChange={(_, v) => v && setSec(v)} sx={{ mb: 2, flexWrap: "wrap" }}>
        <ToggleButton value="mov">Histórico / promoções</ToggleButton><ToggleButton value="planos">Plano de carreira</ToggleButton><ToggleButton value="bon">Bonificações</ToggleButton>
      </ToggleButtonGroup>
      {sec === "mov" && <Movimentacoes />}{sec === "planos" && <Planos />}{sec === "bon" && <Bonificacoes />}
    </>
  );
}
