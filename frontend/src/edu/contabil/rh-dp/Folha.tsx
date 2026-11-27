import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { DP, Estado, Formulario, Kpi, KpiRow, Lista, Secao, StatusChip, TextoImprimivel, brl, host, qstr, rotulo, useApi, useRun, useToast } from "../comum2/kit";
import { SeletorEmpresa } from "./Pessoas";

const ESTIMATIVA = "Estimativa a conferir: cálculo geral da CLT com tabelas parametrizadas; não considera convenção coletiva, médias de variáveis, DSR sobre horas extras e particularidades do contrato.";
const mesAtual = () => new Date().toISOString().slice(0, 7);

function DetalheFolha({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const r = useApi<any>(`${DP}/folhas/${id}`);
  const { toast, node } = useToast();
  const run = useRun(toast, () => { r.reload(); onChanged(); });
  const [hol, setHol] = useState<{ titulo: string; texto: string } | null>(null);
  const [ent, setEnt] = useState<any | null>(null);
  const f = r.data;
  const verHolerite = async (i: any) => { try { const h: any = await host.get(`${DP}/folhas/${id}/itens/${i.funcionarioId}/holerite`); setHol({ titulo: `Holerite — ${i.funcionarioNome}`, texto: h.texto }); } catch (e: any) { toast({ type: "error", text: e.message }); } };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg" fullScreen={typeof window !== "undefined" && window.innerWidth < 600}>
      <DialogTitle>Folha {f ? `${rotulo(f.tipo)} — ${f.competencia}` : ""} {f ? <StatusChip v={f.status} /> : null}</DialogTitle>
      <DialogContent dividers>
        {node}
        <Alert severity="warning" sx={{ mb: 2 }}>{ESTIMATIVA}</Alert>
        <Estado loading={r.loading && !f} error={r.error} onRetry={r.reload}>
          {f ? (
            <>
              <KpiRow><Kpi titulo="Funcionários" valor={f.totais?.funcionarios ?? 0} /><Kpi titulo="Bruto" valor={brl(f.totais?.bruto)} /><Kpi titulo="INSS" valor={brl(f.totais?.inss)} /><Kpi titulo="IRRF" valor={brl(f.totais?.irrf)} /><Kpi titulo="FGTS (encargo)" valor={brl(f.totais?.fgts)} /><Kpi titulo="Líquido" valor={brl(f.totais?.liquido)} cor="#2e9e5b" /></KpiRow>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>Tabelas usadas (vigência): {Object.entries(f.versaoTabelas || {}).map(([k, v]) => `${k} ${v}`).join(" · ")}</Typography>
              <Lista linhas={f.itens.map((i: any) => ({ ...i, id: i.id }))} colunas={[
                { titulo: "Funcionário", principal: true, render: (i: any) => i.funcionarioNome }, { titulo: "Bruto", direita: true, render: (i: any) => brl(i.bruto) }, { titulo: "INSS", direita: true, render: (i: any) => brl(i.inss) },
                { titulo: "IRRF", direita: true, render: (i: any) => brl(i.irrf) }, { titulo: "FGTS", direita: true, esconderNoCelular: true, render: (i: any) => brl(i.fgts) }, { titulo: "Líquido", direita: true, render: (i: any) => <b>{brl(i.liquido)}</b> },
              ]} acoes={(i: any) => (<><Button size="small" onClick={() => verHolerite(i)}>Holerite</Button>{f.status === "RASCUNHO" && f.tipo === "MENSAL" ? <Button size="small" onClick={() => setEnt(i)}>Lançamentos</Button> : null}</>)} />
              {f.status === "RASCUNHO" ? <Box sx={{ mt: 2 }}><Button variant="contained" onClick={() => run(() => host.post(`${DP}/folhas/${id}/fechar`, {}), "Folha fechada.", "Fechar a folha? Depois disso não será possível alterar os lançamentos.")}>Fechar folha</Button></Box> : null}
            </>
          ) : null}
        </Estado>
        <Formulario aberto={!!ent} titulo={`Lançamentos — ${ent?.funcionarioNome || ""}`} campos={[
          { nome: "faltas", rotulo: "Faltas (dias)", tipo: "number", padrao: ent?.entradas?.faltas ?? 0 }, { nome: "horasExtras50", rotulo: "Horas extras 50%", tipo: "number", padrao: ent?.entradas?.horasExtras50 ?? 0 }, { nome: "horasExtras100", rotulo: "Horas extras 100%", tipo: "number", padrao: ent?.entradas?.horasExtras100 ?? 0 },
          { nome: "adicionalNoturno", rotulo: "Adicional noturno (R$)", tipo: "number" }, { nome: "outrosProventos", rotulo: "Outros proventos (R$)", tipo: "number" }, { nome: "outrosDescontos", rotulo: "Outros descontos (R$)", tipo: "number" },
        ]} inicial={ent?.entradas || {}} aoFechar={() => setEnt(null)} aoEnviar={async (v) => { if (await run(() => host.put(`${DP}/folhas/${id}/itens/${ent.funcionarioId}`, v), "Folha recalculada.")) setEnt(null); }} />
        <TextoImprimivel aberto={!!hol} titulo={hol?.titulo || ""} texto={hol?.texto || ""} aoFechar={() => setHol(null)} />
      </DialogContent>
      <DialogActions><Button variant="contained" onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

export function Folhas() {
  const [empresa, setEmpresa] = useState("");
  const r = useApi<any>(`${DP}/folhas?${qstr({ pageSize: 100, empresaId: empresa })}`);
  const { toast, node } = useToast();
  const run = useRun(toast, r.reload);
  const [novo, setNovo] = useState(false); const [sel, setSel] = useState<string | null>(null);
  const items: any[] = r.data?.items || [];
  return (
    <Secao titulo="Folha de pagamento, 13º e encargos" acoes={<Button variant="contained" onClick={() => setNovo(true)}>Calcular folha</Button>}>
      {node}
      <Alert severity="warning" sx={{ mb: 2 }}>{ESTIMATIVA}</Alert>
      <Box sx={{ mb: 2 }}><SeletorEmpresa valor={empresa} onChange={setEmpresa} /></Box>
      <Estado loading={r.loading} error={r.error} onRetry={r.reload} vazio={!items.length} textoVazio="Nenhuma folha calculada. Clique em “Calcular folha”.">
        <Lista linhas={items} aoClicar={(f) => setSel(f.id)} colunas={[
          { titulo: "Competência", principal: true, render: (f: any) => `${f.competencia} — ${rotulo(f.tipo)}` }, { titulo: "Empresa", render: (f: any) => f.empresaNome || f.empresaId },
          { titulo: "Funcionários", render: (f: any) => f.totais?.funcionarios ?? "—" }, { titulo: "Líquido", direita: true, render: (f: any) => brl(f.totais?.liquido) }, { titulo: "Situação", render: (f: any) => <StatusChip v={f.status} /> },
        ]} acoes={(f: any) => <Button size="small" onClick={() => setSel(f.id)}>Abrir</Button>} />
      </Estado>
      <Formulario aberto={novo} titulo="Calcular folha" enviarRotulo="Calcular" campos={[
        { nome: "empresaId", rotulo: "Código da empresa (empresaId)", obrigatorio: true }, { nome: "empresaNome", rotulo: "Nome da empresa" }, { nome: "competencia", rotulo: "Competência (AAAA-MM)", obrigatorio: true, padrao: mesAtual() },
        { nome: "tipo", rotulo: "Tipo", tipo: "select", obrigatorio: true, padrao: "MENSAL", opcoes: [{ value: "MENSAL", label: "Mensal" }, { value: "DECIMO_1", label: "13º — 1ª parcela (competência AAAA-11)" }, { value: "DECIMO_2", label: "13º — 2ª parcela (competência AAAA-12)" }] },
      ]} aoFechar={() => setNovo(false)} aoEnviar={async (v) => { const x: any = await run(() => host.post(`${DP}/folhas`, v), "Folha calculada."); if (x) { setNovo(false); setSel(x.id); } }} />
      {sel ? <DetalheFolha id={sel} onClose={() => setSel(null)} onChanged={r.reload} /> : null}
    </Secao>
  );
}

/** Calculadora avulsa (não grava): folha, férias e rescisão com a tabela vigente. */
export function Calculadoras() {
  const [modo, setModo] = useState<"folha" | "ferias" | "rescisao">("folha");
  const [f, setF] = useState<any>({ salarioBase: 3000, dependentes: 0, admissao: "2024-03-10", optanteVt: false });
  const [extra, setExtra] = useState<any>({ competencia: mesAtual(), faltas: 0, horasExtras50: 0, dias: 30, abono: false, tipo: "SEM_JUSTA_CAUSA", dataDesligamento: new Date().toISOString().slice(0, 10), avisoPrevio: "INDENIZADO", periodosFeriasVencidos: 0 });
  const [res, setRes] = useState<any>(null); const [erro, setErro] = useState<string | null>(null); const [carr, setCarr] = useState(false);
  const calc = async () => {
    setCarr(true); setErro(null);
    const func = { salarioBase: Number(f.salarioBase), dependentes: Number(f.dependentes) || 0, admissao: f.admissao, optanteVt: !!f.optanteVt };
    try {
      if (modo === "folha") setRes(await host.post(`${DP}/calculos/folha`, { funcionario: func, competencia: extra.competencia, entradas: { faltas: Number(extra.faltas) || 0, horasExtras50: Number(extra.horasExtras50) || 0 } }));
      else if (modo === "ferias") setRes(await host.post(`${DP}/calculos/ferias`, { funcionario: func, dias: Number(extra.dias), abono: !!extra.abono }));
      else setRes(await host.post(`${DP}/calculos/rescisao`, { funcionario: func, tipo: extra.tipo, dataDesligamento: extra.dataDesligamento, avisoPrevio: extra.avisoPrevio, periodosFeriasVencidos: Number(extra.periodosFeriasVencidos) || 0 }));
    } catch (e: any) { setErro(e.message); setRes(null); } finally { setCarr(false); }
  };
  return (
    <Secao titulo="Calculadoras (não gravam dados)">
      <Alert severity="warning" sx={{ mb: 2 }}>{ESTIMATIVA}</Alert>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
        <TextField size="small" select label="Cálculo" value={modo} onChange={(e) => { setModo(e.target.value as any); setRes(null); }} sx={{ minWidth: 160 }}><MenuItem value="folha">Folha mensal</MenuItem><MenuItem value="ferias">Férias</MenuItem><MenuItem value="rescisao">Rescisão</MenuItem></TextField>
        <TextField size="small" type="number" label="Salário base (R$)" value={f.salarioBase} onChange={(e) => setF({ ...f, salarioBase: e.target.value })} />
        <TextField size="small" type="number" label="Dependentes" value={f.dependentes} onChange={(e) => setF({ ...f, dependentes: e.target.value })} sx={{ width: 120 }} />
        <TextField size="small" type="date" label="Admissão" slotProps={{ inputLabel: { shrink: true } }} value={f.admissao} onChange={(e) => setF({ ...f, admissao: e.target.value })} />
        {modo === "folha" ? (<>
          <TextField size="small" label="Competência (AAAA-MM)" value={extra.competencia} onChange={(e) => setExtra({ ...extra, competencia: e.target.value })} sx={{ width: 170 }} />
          <TextField size="small" type="number" label="Faltas (dias)" value={extra.faltas} onChange={(e) => setExtra({ ...extra, faltas: e.target.value })} sx={{ width: 120 }} />
          <TextField size="small" type="number" label="Horas extras 50%" value={extra.horasExtras50} onChange={(e) => setExtra({ ...extra, horasExtras50: e.target.value })} sx={{ width: 150 }} />
        </>) : null}
        {modo === "ferias" ? (<><TextField size="small" type="number" label="Dias de férias" value={extra.dias} onChange={(e) => setExtra({ ...extra, dias: e.target.value })} sx={{ width: 130 }} /><label style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" checked={extra.abono} onChange={(e) => setExtra({ ...extra, abono: e.target.checked })} /> Vender 10 dias (abono)</label></>) : null}
        {modo === "rescisao" ? (<>
          <TextField size="small" select label="Tipo" value={extra.tipo} onChange={(e) => setExtra({ ...extra, tipo: e.target.value })} sx={{ minWidth: 200 }}>{[["SEM_JUSTA_CAUSA", "Sem justa causa"], ["PEDIDO_DEMISSAO", "Pedido de demissão"], ["ACORDO_484A", "Acordo (art. 484-A)"], ["JUSTA_CAUSA", "Justa causa"], ["TERMINO_CONTRATO", "Término de contrato"]].map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}</TextField>
          <TextField size="small" type="date" label="Desligamento" slotProps={{ inputLabel: { shrink: true } }} value={extra.dataDesligamento} onChange={(e) => setExtra({ ...extra, dataDesligamento: e.target.value })} />
          <TextField size="small" select label="Aviso prévio" value={extra.avisoPrevio} onChange={(e) => setExtra({ ...extra, avisoPrevio: e.target.value })} sx={{ minWidth: 160 }}>{["INDENIZADO", "TRABALHADO", "DISPENSADO", "NAO_CUMPRIDO"].map((x) => <MenuItem key={x} value={x}>{rotulo(x)}</MenuItem>)}</TextField>
          <TextField size="small" type="number" label="Períodos de férias vencidos" value={extra.periodosFeriasVencidos} onChange={(e) => setExtra({ ...extra, periodosFeriasVencidos: e.target.value })} sx={{ width: 190 }} />
        </>) : null}
        <Button variant="contained" onClick={calc} disabled={carr}>{carr ? "Calculando..." : "Calcular"}</Button>
      </Box>
      {erro ? <Alert severity="error">{erro}</Alert> : null}
      {res ? <ResultadoCalc modo={modo} r={res} /> : null}
    </Secao>
  );
}

function ResultadoCalc({ modo, r }: { modo: string; r: any }) {
  if (modo === "folha") return (
    <Box>
      <KpiRow><Kpi titulo="Bruto" valor={brl(r.bruto)} /><Kpi titulo="INSS" valor={brl(r.inss)} /><Kpi titulo="IRRF" valor={brl(r.irrf)} dica={r.irrfDetalhe?.redutor ? `redutor ${brl(r.irrfDetalhe.redutor)}` : undefined} /><Kpi titulo="FGTS (encargo)" valor={brl(r.fgts)} /><Kpi titulo="Líquido" valor={brl(r.liquido)} cor="#2e9e5b" /></KpiRow>
      <Lista linhas={[...r.proventos.map((p: any, i: number) => ({ ...p, id: `p${i}`, t: "Provento" })), ...r.descontos.map((p: any, i: number) => ({ ...p, id: `d${i}`, t: "Desconto" }))]} colunas={[{ titulo: "Verba", principal: true, render: (x: any) => x.descricao }, { titulo: "Tipo", render: (x: any) => x.t }, { titulo: "Ref.", render: (x: any) => x.referencia || "—" }, { titulo: "Valor", direita: true, render: (x: any) => brl(x.valor) }]} />
      <Typography variant="caption" color="text.secondary">Tabelas: {Object.entries(r.tabelas || {}).map(([k, v]) => `${k} ${v}`).join(" · ")}</Typography>
    </Box>
  );
  if (modo === "ferias") return (
    <KpiRow><Kpi titulo="Férias" valor={brl(r.valorFerias)} /><Kpi titulo="1/3 constitucional" valor={brl(r.tercoConstitucional)} /><Kpi titulo="Abono + 1/3" valor={brl((r.abonoPecuniario || 0) + (r.tercoAbono || 0))} /><Kpi titulo="INSS" valor={brl(r.inss)} /><Kpi titulo="IRRF" valor={brl(r.irrf)} /><Kpi titulo="Líquido" valor={brl(r.liquido)} cor="#2e9e5b" /></KpiRow>
  );
  return (
    <Box>
      <KpiRow><Kpi titulo="Proventos" valor={brl(r.totalProventos)} /><Kpi titulo="Descontos" valor={brl(r.totalDescontos)} /><Kpi titulo="Líquido" valor={brl(r.liquido)} cor="#2e9e5b" /><Kpi titulo={`Multa FGTS ${Math.round(r.fgts.percentualMulta * 100)}%`} valor={brl(r.fgts.multa)} dica={r.fgts.saldoEstimado ? "saldo estimado" : undefined} /></KpiRow>
      <Lista linhas={r.verbas.map((v: any, i: number) => ({ ...v, id: String(i) }))} colunas={[{ titulo: "Verba", principal: true, render: (v: any) => v.descricao }, { titulo: "Ref.", render: (v: any) => v.referencia || "—" }, { titulo: "Tipo", render: (v: any) => rotulo(v.tipo) }, { titulo: "Valor", direita: true, render: (v: any) => brl(v.valor) }]} />
      <Typography variant="body2" sx={{ mt: 1 }}>{r.seguroDesemprego} {r.prazoPagamento}</Typography>
    </Box>
  );
}
