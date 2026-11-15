import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Tab, Tabs, TextField, Typography } from "@mui/material";
import { useRef, useState } from "react";
import { AvisoSimulacao, Estado, Formulario, IR, Kpi, KpiRow, Lista, Secao, StatusChip, TextoImprimivel, brl, dataBr, host, rotulo, useApi, useRun, useToast } from "../comum2/kit";

const AVISO_IR = "Estimativa: o programa oficial da Receita Federal e seu contador devem conferir antes do envio. Este sistema não envia nada à Receita (simulação).";
const SECOES_PF: Array<[string, string]> = [["RENDIMENTO", "Rendimentos"], ["DEDUCAO", "Deduções (saúde, educação, previdência...)"], ["DEPENDENTE", "Dependentes"], ["BEM", "Bens e direitos"], ["DIVIDA", "Dívidas e ônus"], ["IMPOSTO", "Imposto pago / retido"]];
const SECOES_PJ: Array<[string, string]> = [["RENDIMENTO", "Receitas"], ["DEDUCAO", "Despesas e custos"]];
const CAT: Record<string, string[]> = { RENDIMENTO: ["SALARIO", "ALUGUEL", "AUTONOMO", "OUTROS_TRIBUTAVEIS", "ISENTO", "EXCLUSIVO"], DEDUCAO: ["PREVIDENCIA_OFICIAL", "PREVIDENCIA_PRIVADA", "SAUDE", "EDUCACAO", "PENSAO", "LIVRO_CAIXA"], IMPOSTO: ["IRRF", "CARNE_LEAO"], BEM: ["IMOVEL", "VEICULO", "APLICACAO", "CONTA", "OUTRO"], DIVIDA: ["FINANCIAMENTO", "EMPRESTIMO", "OUTRA"], DEPENDENTE: ["FILHO", "CONJUGE", "PAIS", "OUTRO"] };
const bytes = (b?: number) => (!b ? "" : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);

function Resultado({ r, tipo }: { r: any; tipo: string }) {
  if (!r) return <Typography color="text.secondary">Lance rendimentos para ver o cálculo.</Typography>;
  if (tipo === "PJ") return (
    <KpiRow><Kpi titulo="Receita bruta" valor={brl(r.receitaBruta)} /><Kpi titulo="Despesas" valor={brl(r.despesas)} /><Kpi titulo="Lucro contábil" valor={brl(r.lucroContabil)} /><Kpi titulo="IRPJ estimado" valor={brl(r.irpj)} cor="#c98a00" /><Kpi titulo="CSLL estimada" valor={brl(r.csll)} cor="#c98a00" dica={r.observacao} /></KpiRow>
  );
  const linha = (nome: string, x: any, rec: boolean) => (
    <Box sx={{ flex: "1 1 260px", p: 2, border: "1px solid", borderColor: rec ? "success.main" : "divider", borderRadius: 3 }}>
      <Typography sx={{ fontWeight: 800 }}>{nome} {rec ? <Chip size="small" color="success" label="recomendada" sx={{ ml: 1 }} /> : null}</Typography>
      <Typography variant="body2">Base de cálculo: {brl(x.baseCalculo)}</Typography>
      <Typography variant="body2">Imposto devido: <b>{brl(x.devido)}</b>{x.redutor ? ` (redutor ${brl(x.redutor)})` : ""}</Typography>
      <Typography variant="h6" sx={{ fontWeight: 800, color: x.situacao === "A_RESTITUIR" ? "success.main" : x.situacao === "A_PAGAR" ? "error.main" : undefined }}>{x.situacao === "A_RESTITUIR" ? "Restituir" : x.situacao === "A_PAGAR" ? "A pagar" : "Zerado"} {brl(Math.abs(x.saldo))}</Typography>
    </Box>
  );
  return (
    <Box>
      <KpiRow><Kpi titulo="Rend. tributáveis" valor={brl(r.rendimentos.tributaveis)} /><Kpi titulo="Isentos / exclusivos" valor={brl(r.rendimentos.isentos + r.rendimentos.exclusivos)} /><Kpi titulo="Deduções (completa)" valor={brl(r.deducoes.total)} dica={`${r.deducoes.quantidadeDependentes} dependente(s)`} /><Kpi titulo="Imposto já pago" valor={brl(r.imposto.totalPago)} /></KpiRow>
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>{linha("Declaração completa", r.completa, r.recomendado === "COMPLETA")}{linha("Declaração simplificada", r.simplificada, r.recomendado === "SIMPLIFICADA")}</Box>
      {r.parcelamento ? <Typography variant="body2" sx={{ mt: 1 }}>Pagamento em até {r.parcelamento.quotas} quota(s) de {brl(r.parcelamento.valorQuota)}. {r.parcelamento.observacao}</Typography> : null}
      {r.deducoes.educacaoExcedente > 0 ? <Alert severity="info" sx={{ mt: 1 }}>Educação acima do limite por pessoa: excedente de {brl(r.deducoes.educacaoExcedente)} não é dedutível.</Alert> : null}
    </Box>
  );
}

function Pendencias({ p }: { p: any[] }) {
  if (!p?.length) return <Alert severity="success">Nenhuma inconsistência encontrada nas checagens simples da malha.</Alert>;
  return <Box>{p.map((x, i) => <Alert key={i} severity={x.nivel === "ERRO" ? "error" : x.nivel === "ALERTA" ? "warning" : "info"} sx={{ py: 0, mb: 0.5 }}>{x.mensagem}</Alert>)}</Box>;
}

function Detalhe({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const d = useApi<any>(`${IR}/declaracoes/${id}`);
  const { toast, node } = useToast();
  const run = useRun(toast, () => { d.reload(); onChanged(); });
  const [aba, setAba] = useState(0);
  const [novoItem, setNovoItem] = useState<string | null>(null);
  const [recibo, setRecibo] = useState<{ titulo: string; texto: string } | null>(null);
  const [anexando, setAnexando] = useState<string | null>(null);
  const arq = useRef<HTMLInputElement>(null);
  const x = d.data;
  const secoes = x?.tipo === "PJ" ? SECOES_PJ : SECOES_PF;
  const secao = secoes[aba]?.[0];
  const itens: any[] = (x?.itens || []).filter((i: any) => i.secao === secao);
  const bloqueada = x && ["TRANSMITIDA_SIMULADA", "RETIFICADA", "CANCELADA"].includes(x.status);
  const comprovantes = (itemId: string) => (x?.anexos || []).filter((a: any) => a.itemId === itemId);

  const enviarArquivo = async (file: File) => {
    if (!anexando) return;
    if (file.size > 2_000_000) { toast({ type: "error", text: "Arquivo acima de 2 MB." }); return; }
    const b64: string = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1] || ""); fr.onerror = rej; fr.readAsDataURL(file); });
    await run(() => host.post(`${IR}/declaracoes/${id}/anexos`, { itemId: anexando, nome: file.name, mime: file.type || "application/pdf", conteudoBase64: b64 }), "Comprovante anexado.");
    setAnexando(null);
  };
  const campos = (s: string) => [
    ...(CAT[s] ? [{ nome: "categoria", rotulo: "Categoria", tipo: "select" as const, opcoes: CAT[s].map((c) => ({ value: c, label: rotulo(c) })), obrigatorio: s !== "DEPENDENTE" }] : []),
    { nome: "descricao", rotulo: s === "DEPENDENTE" ? "Nome do dependente" : "Descrição", obrigatorio: true },
    ...(s === "DEPENDENTE" ? [] : [{ nome: "valor", rotulo: s === "BEM" || s === "DIVIDA" ? "Valor em 31/12 do ano-calendário (R$)" : "Valor (R$)", tipo: "number" as const, obrigatorio: true }]),
    ...(s === "BEM" || s === "DIVIDA" ? [{ nome: "valorAnterior", rotulo: "Valor em 31/12 do ano anterior (R$)", tipo: "number" as const }] : []),
    { nome: "documento", rotulo: s === "DEPENDENTE" ? "CPF do dependente" : s === "DEDUCAO" ? "CPF/CNPJ do prestador ou fonte" : "CPF/CNPJ da fonte pagadora (quando houver)", ajuda: "Dado pessoal: informe somente o necessário." },
  ];
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg" fullScreen={typeof window !== "undefined" && window.innerWidth < 600}>
      <DialogTitle sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>{x ? `${x.tipo} — ${x.titularNome} — exercício ${x.exercicio}` : "Declaração"} {x ? <StatusChip v={x.status} /> : null}{x?.retificaDeId ? <Chip size="small" label="Retificadora" /> : null}</DialogTitle>
      <DialogContent dividers>
        {node}
        <Alert severity="warning" sx={{ mb: 2 }}>{AVISO_IR}</Alert>
        <Estado loading={d.loading && !x} error={d.error} onRetry={d.reload}>
          {x ? (
            <>
              <Secao titulo={x.tipo === "PF" ? "Resultado estimado (completa x simplificada)" : "Estimativa PJ"}><Resultado r={x.resultado} tipo={x.tipo} /></Secao>
              <Secao titulo="Pendências e malha de inconsistências (checagens simples)"><Pendencias p={x.pendencias || []} /></Secao>
              <Secao titulo="Lançamentos" acoes={!bloqueada ? <Button size="small" variant="contained" onClick={() => setNovoItem(secao)}>Adicionar</Button> : undefined}>
                <Tabs value={aba} onChange={(_, v) => setAba(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 1 }}>{secoes.map(([k, nome]) => <Tab key={k} label={`${nome} (${(x.itens || []).filter((i: any) => i.secao === k).length})`} />)}</Tabs>
                <Estado vazio={!itens.length} textoVazio="Nada lançado nesta seção.">
                  <Lista linhas={itens} colunas={[
                    { titulo: "Descrição", principal: true, render: (i: any) => <>{i.descricao}<Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{rotulo(i.categoria)}</Typography></> },
                    { titulo: "Valor", direita: true, render: (i: any) => (i.secao === "DEPENDENTE" ? "—" : brl(i.valor)) }, { titulo: "Ano anterior", direita: true, esconderNoCelular: true, render: (i: any) => (i.valorAnterior != null ? brl(i.valorAnterior) : "—") },
                    { titulo: "Comprovantes", render: (i: any) => comprovantes(i.id).length ? <Chip size="small" color="success" label={`${comprovantes(i.id).length} anexo(s)`} /> : "—" },
                  ]} acoes={(i: any) => !bloqueada ? (<>
                    {["DEDUCAO"].includes(i.secao) ? <Button size="small" onClick={() => { setAnexando(i.id); arq.current?.click(); }}>Anexar recibo</Button> : null}
                    <Button size="small" color="error" onClick={() => run(() => host.del(`${IR}/declaracoes/${id}/itens/${i.id}`), "Item removido.", "Remover este lançamento?")}>Remover</Button></>) : null} />
                </Estado>
                <input ref={arq} type="file" accept="application/pdf,image/png,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarArquivo(f); e.target.value = ""; }} />
                {(x.anexos || []).length ? <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>Anexos: {x.anexos.map((a: any) => `${a.nome} (${bytes(a.tamanho)})`).join(", ")}</Typography> : null}
              </Secao>
              <Secao titulo="Transmissão (SIMULADA) e acompanhamento">
                <AvisoSimulacao texto="A “transmissão” gera um recibo FICTÍCIO com protocolo simulado. Nada é enviado à Receita Federal: para entregar de verdade, use o programa oficial." />
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
                  {x.status === "RASCUNHO" || x.status === "EM_REVISAO" ? <Button variant="outlined" onClick={() => run(() => host.put(`${IR}/declaracoes/${id}`, { status: "PRONTA" }), "Declaração marcada como pronta.")}>Marcar como pronta</Button> : null}
                  {x.status === "PRONTA" ? <Button variant="contained" onClick={() => run(() => host.post(`${IR}/declaracoes/${id}/transmitir`, {}), "Transmissão SIMULADA registrada.", "Gerar a transmissão SIMULADA (recibo fictício)?")}>Transmitir (simulação)</Button> : null}
                  {x.status === "TRANSMITIDA_SIMULADA" ? <Button variant="outlined" onClick={() => run(async () => { const n: any = await host.post(`${IR}/declaracoes/${id}/retificar`, {}); return n; }, "Retificadora criada: abra-a na lista.", "Criar uma declaração retificadora a partir desta?")}>Criar retificadora</Button> : null}
                </Box>
                <Estado vazio={!x.transmissoes.length} textoVazio="Nenhuma transmissão simulada.">
                  <Lista linhas={x.transmissoes} colunas={[{ titulo: "Protocolo", principal: true, render: (t: any) => t.protocolo }, { titulo: "Tipo", render: (t: any) => rotulo(t.tipo) }, { titulo: "Status (simulado)", render: (t: any) => <StatusChip v={t.status} /> }, { titulo: "Data", render: (t: any) => dataBr(t.createdAt) }]}
                    acoes={(t: any) => (<><Button size="small" onClick={() => setRecibo({ titulo: `Recibo simulado ${t.protocolo}`, texto: t.recibo })}>Recibo</Button>{["RECEBIDA_SIMULADA", "EM_PROCESSAMENTO_SIMULADO"].includes(t.status) ? <Button size="small" onClick={() => run(() => host.post(`${IR}/transmissoes/${t.id}/avancar`, {}), "Status atualizado (simulação).")}>Avançar status</Button> : null}</>)} />
                </Estado>
              </Secao>
            </>
          ) : null}
        </Estado>
        <Formulario aberto={!!novoItem} titulo={`Novo lançamento — ${rotulo(novoItem)}`} campos={novoItem ? campos(novoItem) : []} aoFechar={() => setNovoItem(null)}
          aoEnviar={async (v) => { const r = await run(() => host.post(`${IR}/declaracoes/${id}/itens`, { ...v, secao: novoItem, valor: v.valor ?? 0 }), "Lançamento salvo e declaração recalculada."); if (r) setNovoItem(null); }} />
        <TextoImprimivel aberto={!!recibo} titulo={recibo?.titulo || ""} texto={recibo?.texto || ""} aoFechar={() => setRecibo(null)} />
      </DialogContent>
      <DialogActions><Button variant="contained" onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

export default function Declaracoes() {
  const [tipo, setTipo] = useState("");
  const r = useApi<any>(`${IR}/declaracoes?pageSize=100${tipo ? `&tipo=${tipo}` : ""}`);
  const { toast, node } = useToast();
  const run = useRun(toast, r.reload);
  const [novo, setNovo] = useState<"PF" | "PJ" | null>(null); const [sel, setSel] = useState<string | null>(null);
  const items: any[] = r.data?.items || [];
  const ano = new Date().getFullYear();
  return (
    <Secao titulo="Declarações de imposto de renda" acoes={<><Button variant="contained" onClick={() => setNovo("PF")}>Nova PF</Button><Button variant="outlined" onClick={() => setNovo("PJ")}>Nova PJ</Button></>}>
      {node}
      <TextField size="small" select label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} sx={{ minWidth: 140, mb: 2 }}><MenuItem value="">Todas</MenuItem><MenuItem value="PF">Pessoa física</MenuItem><MenuItem value="PJ">Pessoa jurídica</MenuItem></TextField>
      <Estado loading={r.loading} error={r.error} onRetry={r.reload} vazio={!items.length} textoVazio="Nenhuma declaração. Crie uma PF ou PJ para usar o assistente de lançamento.">
        <Lista linhas={items} aoClicar={(d) => setSel(d.id)} colunas={[
          { titulo: "Titular", principal: true, render: (d: any) => <>{d.titularNome}{d.retificaDeId ? <Chip size="small" sx={{ ml: 1 }} label="Retificadora" /> : null}</> }, { titulo: "Tipo", render: (d: any) => d.tipo }, { titulo: "Documento", esconderNoCelular: true, render: (d: any) => d.titularDoc || "—" },
          { titulo: "Exercício", render: (d: any) => `${d.exercicio} (AC ${d.anoCalendario})` }, { titulo: "Modelo/regime", render: (d: any) => rotulo(d.modelo) },
          { titulo: "Resultado estimado", direita: true, render: (d: any) => (d.tipo === "PF" && d.resultado ? ((d.modelo === "COMPLETA" ? d.resultado.completa : d.resultado.simplificada).saldo < 0 ? `Restituir ${brl(-(d.modelo === "COMPLETA" ? d.resultado.completa : d.resultado.simplificada).saldo)}` : `Pagar ${brl((d.modelo === "COMPLETA" ? d.resultado.completa : d.resultado.simplificada).saldo)}`) : d.tipo === "PJ" && d.resultado ? `IRPJ ${brl(d.resultado.irpj)}` : "—") },
          { titulo: "Situação", render: (d: any) => <StatusChip v={d.status} /> },
        ]} acoes={(d: any) => <Button size="small" onClick={() => setSel(d.id)}>Abrir</Button>} />
      </Estado>
      <Formulario aberto={novo === "PF"} titulo="Nova declaração — pessoa física" campos={[{ nome: "titularNome", rotulo: "Nome do contribuinte", obrigatorio: true }, { nome: "titularDoc", rotulo: "CPF", obrigatorio: true }, { nome: "exercicio", rotulo: "Exercício (ano da entrega)", tipo: "number", obrigatorio: true, padrao: ano }, { nome: "modelo", rotulo: "Modelo", tipo: "select", opcoes: [{ value: "COMPLETA", label: "Completa" }, { value: "SIMPLIFICADA", label: "Simplificada" }], padrao: "COMPLETA" }]}
        aoFechar={() => setNovo(null)} aoEnviar={async (v) => { const x: any = await run(() => host.post(`${IR}/declaracoes`, { ...v, tipo: "PF" }), "Declaração criada."); if (x) { setNovo(null); setSel(x.id); } }} />
      <Formulario aberto={novo === "PJ"} titulo="Nova declaração — pessoa jurídica" campos={[{ nome: "titularNome", rotulo: "Razão social", obrigatorio: true }, { nome: "titularDoc", rotulo: "CNPJ" }, { nome: "empresaId", rotulo: "Código da empresa (empresaId)", obrigatorio: true }, { nome: "exercicio", rotulo: "Exercício", tipo: "number", obrigatorio: true, padrao: ano }, { nome: "modelo", rotulo: "Regime", tipo: "select", obrigatorio: true, opcoes: ["MEI", "SIMPLES", "PRESUMIDO", "REAL"].map((x) => ({ value: x, label: rotulo(x) })), padrao: "PRESUMIDO" }]}
        aoFechar={() => setNovo(null)} aoEnviar={async (v) => { const x: any = await run(() => host.post(`${IR}/declaracoes`, { ...v, tipo: "PJ" }), "Declaração criada."); if (x) { setNovo(null); setSel(x.id); } }} />
      {sel ? <Detalhe id={sel} onClose={() => setSel(null)} onChanged={r.reload} /> : null}
    </Secao>
  );
}
