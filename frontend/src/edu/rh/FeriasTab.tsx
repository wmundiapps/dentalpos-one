import { Alert, Box, Typography } from "@mui/material";
import { useState } from "react";
import { Acoes, Btn, FormDialog, LoadBox, Pick, Section, Status, Tabela, fmtDate, fmtMoney, itemsOf, perfil, rh, useColabs, useRh, useRunner, useToast, type FormField } from "./kit";

const CAMPOS_PROG: FormField[] = [
  ...[1, 2, 3].flatMap((n): FormField[] => [{ key: `i${n}`, label: `Início ${n}º período`, type: "date", required: n === 1 }, { key: `d${n}`, label: `Dias ${n}º período`, type: "number", required: n === 1 }]),
  { key: "diasAbono", label: "Dias vendidos (abono, máx. 1/3)", type: "number" }, { key: "adiantaDecimo", label: "Adiantar 1ª parcela do 13º", type: "bool" },
]

export default function FeriasTab() {
  const P = perfil(); const gestao = P.rh || P.gestor; const colabs = useColabs();
  const [cid, setCid] = useState(""); const [rev, setRev] = useState(0); const [prog, setProg] = useState<any | null>(null); const [sim, setSim] = useState<any | null>(null);
  const { toast, node } = useToast(); const run = useRunner(toast, () => setRev((x) => x + 1));
  const per = useRh<any>(`/ferias/periodos${cid ? `?colaboradorId=${cid}` : ""}`, [rev]);
  const al = useRh<any>(gestao ? "/ferias/alertas" : null, [rev]);
  const pr = useRh<any>("/ferias/programacoes", [rev]);
  const decidir = (id: string, aprovar: boolean) => run(() => rh("POST", `/ferias/programacoes/${id}/decidir`, { aprovar, motivo: aprovar ? "Escala aprovada" : "Não aprovado" }), aprovar ? "Aprovada." : "Rejeitada.");
  return (
    <>
      {node}
      {gestao && itemsOf(al.data).length > 0 && (
        <Section title="Alertas de vencimento de férias">
          {itemsOf(al.data).map((a: any) => <Alert key={a.periodoId} severity={a.severidade === "CRITICO" ? "error" : "warning"} sx={{ mb: 1 }}><b>{a.nome}</b> — {a.mensagem} (concessivo até {fmtDate(a.concessivoFim)})</Alert>)}
          {P.rh && <Acoes><Btn onClick={() => run(() => rh("POST", "/ferias/periodos/gerar", {}), "Períodos atualizados.")}>Atualizar períodos aquisitivos</Btn></Acoes>}
        </Section>
      )}
      <Section title="Períodos aquisitivos e saldo">
        <Acoes>{gestao && <Pick label="Colaborador" value={cid} onChange={setCid} all="Eu mesmo" options={colabs.opts} minWidth={240} />}{P.rh && cid && <Btn onClick={async () => { try { setSim(await rh("GET", `/ferias/simular?colaboradorId=${cid}&dias=30`)); } catch (e: any) { toast({ type: "error", text: e.message }); } }}>Simular valor (30 dias)</Btn>}</Acoes>
        {sim && <Alert severity="info" sx={{ mb: 2 }} onClose={() => setSim(null)}>Férias {fmtMoney(sim.ferias)} + 1/3 {fmtMoney(sim.terco)} = <b>{fmtMoney(sim.total)}</b> (média de variáveis {fmtMoney(sim.mediaVariaveis)}). {sim.aviso}</Alert>}
        <LoadBox loading={per.loading} error={per.error} onRetry={per.reload}>
          <Tabela rows={itemsOf(per.data)} cols={[
            { h: "Aquisitivo", r: (p: any) => `${fmtDate(p.aquisitivoInicio)} a ${fmtDate(p.aquisitivoFim)}` }, { h: "Concessivo até", r: (p: any) => fmtDate(p.concessivoFim) }, { h: "Direito", r: (p: any) => `${p.diasDireito} dias` },
            { h: "Saldo", r: (p: any) => `${p.saldoDias} dias` }, { h: "Status", r: (p: any) => <Status value={p.status} /> },
            { h: "Ação", r: (p: any) => (["DISPONIVEL", "PARCIAL", "VENCIDO"].includes(p.status) && p.saldoDias > 0 ? <Btn variant="contained" onClick={() => setProg(p)}>Programar</Btn> : "") },
          ]} />
        </LoadBox>
      </Section>
      <Section title="Programação de férias">
        <LoadBox loading={pr.loading} error={pr.error} onRetry={pr.reload}>
          <Tabela rows={itemsOf(pr.data)} cols={[
            { h: "Colaborador", r: (p: any) => p.colaboradorNome }, { h: "Período", r: (p: any) => `${fmtDate(p.inicio)} a ${fmtDate(p.fim)}` }, { h: "Dias", r: (p: any) => `${p.dias}${p.diasAbono ? ` + ${p.diasAbono} vendidos` : ""}` },
            ...(P.rh ? [{ h: "Valor", r: (p: any) => (p.valores ? fmtMoney(p.valores.total) : "—"), hideMobile: true }] : []), { h: "Status", r: (p: any) => <Status value={p.status} /> },
            { h: "Ação", r: (p: any) => (<Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
              {p.status === "PROGRAMADA" && gestao && <><Btn color="success" onClick={() => decidir(p.id, true)}>Aprovar</Btn><Btn color="error" onClick={() => decidir(p.id, false)}>Rejeitar</Btn></>}
              {["PROGRAMADA", "APROVADA"].includes(p.status) && <Btn onClick={() => run(() => rh("POST", `/ferias/programacoes/${p.id}/cancelar`, {}), "Cancelada.")}>Cancelar</Btn>}
              {["APROVADA", "EM_GOZO"].includes(p.status) && P.rh && <Btn onClick={() => run(() => rh("POST", `/ferias/programacoes/${p.id}/concluir`, {}), "Concluída.")}>Concluir</Btn>}</Box>) },
          ]} />
        </LoadBox>
      </Section>
      <Section title="Regras aplicadas"><Typography variant="body2">Até 3 períodos (um com 14+ dias, os demais com 5+); venda de até 1/3; início não pode ocorrer nos 2 dias antes de feriado ou repouso semanal; período concessivo vencido gera pagamento em dobro.</Typography></Section>
      <FormDialog open={!!prog} title="Programar férias" intro={<Alert severity="info" sx={{ mb: 2 }}>Saldo do período: {prog?.saldoDias} dias. Informe até 3 períodos (data de início e dias).</Alert>}
        fields={CAMPOS_PROG}
        onClose={() => setProg(null)}
        onSubmit={(_b, raw) => run(() => rh("POST", "/ferias/programacoes", { colaboradorId: cid || undefined, periodoId: prog.id, parcelas: [1, 2, 3].filter((n) => raw[`i${n}`] && raw[`d${n}`]).map((n) => ({ inicio: raw[`i${n}`], dias: Number(raw[`d${n}`]) })), diasAbono: Number(raw.diasAbono || 0), adiantaDecimo: !!raw.adiantaDecimo }), "Férias programadas.")} />
    </>
  );
}
