import { Alert, Button, MenuItem, TextField } from "@mui/material";
import { useState } from "react";
import { AvisoSimulacao, DP, Estado, Formulario, Lista, Secao, StatusChip, TextoImprimivel, brl, dataBr, host, rotulo, useApi, useRun, useToast } from "../comum2/kit";

const ESTIMATIVA = "Estimativa a conferir: cálculo geral da CLT com tabelas parametrizadas; não considera convenção coletiva, médias de variáveis e particularidades do contrato.";
const TIPOS = [["SEM_JUSTA_CAUSA", "Dispensa sem justa causa"], ["PEDIDO_DEMISSAO", "Pedido de demissão"], ["ACORDO_484A", "Acordo entre as partes (art. 484-A)"], ["JUSTA_CAUSA", "Dispensa por justa causa"], ["TERMINO_CONTRATO", "Término de contrato de experiência"]];

export function Rescisoes() {
  const r = useApi<any>(`${DP}/rescisoes?pageSize=100`);
  const func = useApi<any>(`${DP}/funcionarios?pageSize=200&status=ATIVO`);
  const { toast, node } = useToast();
  const run = useRun(toast, r.reload);
  const [novo, setNovo] = useState(false); const [termo, setTermo] = useState<{ titulo: string; texto: string } | null>(null);
  const items: any[] = r.data?.items || [];
  const ver = async (x: any) => { try { const d: any = await host.get(`${DP}/rescisoes/${x.id}`); setTermo({ titulo: `Termo de rescisão — ${x.funcionarioNome}`, texto: d.termo }); } catch (e: any) { toast({ type: "error", text: e.message }); } };
  return (
    <Secao titulo="Rescisões (todos os tipos)" acoes={<Button variant="contained" onClick={() => setNovo(true)}>Nova rescisão</Button>}>
      {node}
      <Alert severity="warning" sx={{ mb: 2 }}>{ESTIMATIVA} O termo gerado é uma minuta para conferência, não o TRCT oficial.</Alert>
      <Estado loading={r.loading} error={r.error} onRetry={r.reload} vazio={!items.length} textoVazio="Nenhuma rescisão calculada.">
        <Lista linhas={items} colunas={[
          { titulo: "Funcionário", principal: true, render: (x: any) => x.funcionarioNome }, { titulo: "Tipo", render: (x: any) => rotulo(x.tipo) }, { titulo: "Desligamento", render: (x: any) => dataBr(x.dataDesligamento) },
          { titulo: "Líquido estimado", direita: true, render: (x: any) => brl(x.total) }, { titulo: "Situação", render: (x: any) => <StatusChip v={x.status} /> },
        ]} acoes={(x: any) => (<><Button size="small" onClick={() => ver(x)}>Termo</Button>{x.status === "RASCUNHO" ? (<><Button size="small" onClick={() => run(() => host.post(`${DP}/rescisoes/${x.id}/homologar`, {}), "Rescisão homologada; S-2299 SIMULADO registrado.", "Homologar a rescisão? O funcionário passa a DESLIGADO.")}>Homologar</Button><Button size="small" color="error" onClick={() => run(() => host.del(`${DP}/rescisoes/${x.id}`), "Rescisão cancelada.", "Cancelar este rascunho?")}>Cancelar</Button></>) : null}</>)} />
      </Estado>
      <Formulario aberto={novo} titulo="Nova rescisão" enviarRotulo="Calcular" campos={[
        { nome: "funcionarioId", rotulo: "Funcionário", tipo: "select", obrigatorio: true, opcoes: (func.data?.items || []).map((f: any) => ({ value: f.id, label: `${f.nome} — ${f.empresaNome || f.empresaId}` })) },
        { nome: "tipo", rotulo: "Tipo de rescisão", tipo: "select", obrigatorio: true, opcoes: TIPOS.map(([value, label]) => ({ value, label })), padrao: "SEM_JUSTA_CAUSA" },
        { nome: "dataDesligamento", rotulo: "Data do desligamento", tipo: "date", obrigatorio: true },
        { nome: "avisoPrevio", rotulo: "Aviso prévio", tipo: "select", opcoes: ["INDENIZADO", "TRABALHADO", "DISPENSADO", "NAO_CUMPRIDO"].map((x) => ({ value: x, label: rotulo(x) })), padrao: "INDENIZADO" },
        { nome: "saldoFgts", rotulo: "Saldo do FGTS (R$) — se vazio, será estimado", tipo: "number" }, { nome: "periodosFeriasVencidos", rotulo: "Períodos de férias vencidos (vazio = automático)", tipo: "number" },
      ]} aoFechar={() => setNovo(false)} aoEnviar={async (v) => { if (await run(() => host.post(`${DP}/rescisoes`, v), "Rescisão calculada (rascunho).")) setNovo(false); }} />
      <TextoImprimivel aberto={!!termo} titulo={termo?.titulo || ""} texto={termo?.texto || ""} aoFechar={() => setTermo(null)} />
    </Secao>
  );
}

export function Ferias() {
  const [so, setSo] = useState("");
  const r = useApi<any>(`${DP}/ferias?pageSize=100${so ? "&alerta=true" : ""}`);
  const { toast, node } = useToast();
  const run = useRun(toast, r.reload);
  const [prog, setProg] = useState<any | null>(null);
  const items: any[] = r.data?.items || [];
  return (
    <Secao titulo="Férias: períodos aquisitivos e vencimentos" acoes={<TextField size="small" select label="Filtro" value={so} onChange={(e) => setSo(e.target.value)} sx={{ minWidth: 180 }}><MenuItem value="">Todos</MenuItem><MenuItem value="a">Só vencidas ou a vencer</MenuItem></TextField>}>
      {node}
      <Estado loading={r.loading} error={r.error} onRetry={r.reload} vazio={!items.length} textoVazio="Nenhum período de férias a acompanhar.">
        <Lista linhas={items} colunas={[
          { titulo: "Funcionário", principal: true, render: (x: any) => x.funcionarioNome || x.funcionarioId }, { titulo: "Período aquisitivo", render: (x: any) => `${dataBr(x.aquisitivoInicio)} a ${dataBr(x.aquisitivoFim)}` },
          { titulo: "Limite para conceder", render: (x: any) => dataBr(x.concessivoFim) },
          { titulo: "Prazo", render: (x: any) => (x.diasParaVencer == null ? "—" : <StatusChip v={x.situacao} />) }, { titulo: "Situação", render: (x: any) => <StatusChip v={x.status} /> },
        ]} acoes={(x: any) => (x.status === "A_PROGRAMAR" || x.status === "VENCIDA" ? (x.aquisitivoFim < new Date().toISOString() ? <Button size="small" onClick={() => setProg(x)}>Programar</Button> : <span style={{ fontSize: 12 }}>Período em curso</span>) : x.status === "PROGRAMADA" ? <Button size="small" onClick={() => run(() => host.post(`${DP}/ferias/${x.id}/gozar`, {}), "Gozo registrado.")}>Registrar gozo</Button> : null)} />
      </Estado>
      <Formulario aberto={!!prog} titulo={`Programar férias — ${prog?.funcionarioNome || ""}`} campos={[{ nome: "gozoInicio", rotulo: "Início do gozo", tipo: "date", obrigatorio: true, ajuda: "Não pode começar em sábado/domingo" }, { nome: "dias", rotulo: "Dias", tipo: "number", padrao: 30 }, { nome: "abono", rotulo: "Vender 10 dias (abono pecuniário)", tipo: "checkbox" }]}
        aoFechar={() => setProg(null)} aoEnviar={async (v) => { if (await run(() => host.post(`${DP}/funcionarios/${prog.funcionarioId}/ferias/programar`, { ...v, feriasId: prog.id }), "Férias programadas.")) setProg(null); }} />
      <Alert severity="info" sx={{ mt: 2 }}>Férias não concedidas até o fim do período concessivo são devidas em dobro. O pagamento deve ocorrer até 2 dias antes do início do gozo.</Alert>
    </Secao>
  );
}

export function EsocialSimulado() {
  const r = useApi<any>(`${DP}/esocial?pageSize=100`);
  const items: any[] = r.data?.items || [];
  return (
    <Secao titulo="Eventos do eSocial (SIMULADOS)">
      <AvisoSimulacao texto="Não há envio ao eSocial. Os eventos S-2200 (admissão), S-2230 (afastamento) e S-2299 (desligamento) abaixo são registros fictícios de acompanhamento." />
      <Estado loading={r.loading} error={r.error} onRetry={r.reload} vazio={!items.length} textoVazio="Nenhum evento registrado.">
        <Lista linhas={items} colunas={[{ titulo: "Evento", principal: true, render: (e: any) => e.evento }, { titulo: "Protocolo (fictício)", render: (e: any) => e.protocolo }, { titulo: "Status", render: (e: any) => rotulo(e.status) }, { titulo: "Data", render: (e: any) => dataBr(e.createdAt) }]} />
      </Estado>
    </Secao>
  );
}

/** Tabelas fiscais parametrizadas e versionadas (INSS, IRRF, IRPF anual, salário mínimo, FGTS). */
export function Tabelas() {
  const r = useApi<any>(`${DP}/parametros`);
  const { toast, node } = useToast();
  const run = useRun(toast, r.reload);
  const [novo, setNovo] = useState(false);
  const todas: any[] = [...(r.data?.tenant || []), ...(r.data?.padrao || [])].sort((a, b) => (a.chave === b.chave ? (a.vigenciaInicio < b.vigenciaInicio ? 1 : -1) : a.chave.localeCompare(b.chave)));
  return (
    <Secao titulo="Tabelas fiscais (versionadas por vigência)" acoes={<Button variant="contained" onClick={() => setNovo(true)}>Cadastrar nova vigência</Button>}>
      {node}
      <Alert severity="warning" sx={{ mb: 2 }}>{r.data?.aviso || "Valores padrão são referenciais e podem estar desatualizados: confira nas normas oficiais."} Cada cálculo guarda a vigência usada.</Alert>
      <Estado loading={r.loading} error={r.error} onRetry={r.reload} vazio={!todas.length}>
        <Lista linhas={todas.map((t, i) => ({ ...t, id: `${t.chave}${t.vigenciaInicio}${t.origem}${i}` }))} colunas={[
          { titulo: "Tabela", principal: true, render: (t: any) => rotulo(t.chave) }, { titulo: "Vigência desde", render: (t: any) => dataBr(t.vigenciaInicio) },
          { titulo: "Origem", render: (t: any) => t.origem === "TENANT" ? "Cadastrada pelo escritório" : "Padrão do sistema" }, { titulo: "Fonte", esconderNoCelular: true, render: (t: any) => t.fonte || "—" },
          { titulo: "Resumo", esconderNoCelular: true, render: (t: any) => (t.dados?.faixas ? `${t.dados.faixas.length} faixas${t.dados.teto ? `, teto ${brl(t.dados.teto)}` : ""}` : JSON.stringify(t.dados)) },
        ]} />
      </Estado>
      <Formulario aberto={novo} titulo="Cadastrar nova vigência" campos={[
        { nome: "chave", rotulo: "Tabela", tipo: "select", obrigatorio: true, opcoes: ["INSS", "IRRF", "IRPF_ANUAL", "SALARIO_MINIMO", "FGTS"].map((x) => ({ value: x, label: rotulo(x) })) },
        { nome: "vigenciaInicio", rotulo: "Vigência a partir de", tipo: "date", obrigatorio: true }, { nome: "fonte", rotulo: "Fonte (portaria/lei)" },
        { nome: "dadosJson", rotulo: "Dados em JSON", tipo: "textarea", obrigatorio: true, ajuda: 'INSS: {"teto":8475.55,"faixas":[{"ate":1621,"aliquota":0.075},...]} · IRRF: {"faixas":[{"ate":2428.8,"aliquota":0,"deducao":0},...],"dedDependente":189.59,"descontoSimplificado":607.2} · Salário mínimo: {"valor":1621}' },
      ]} aoFechar={() => setNovo(false)} aoEnviar={async (v) => {
        let dados: any; try { dados = JSON.parse(v.dadosJson); } catch { toast({ type: "error", text: "JSON inválido." }); return; }
        if (await run(() => host.post(`${DP}/parametros`, { chave: v.chave, vigenciaInicio: v.vigenciaInicio, fonte: v.fonte, dados }), "Vigência cadastrada.")) setNovo(false);
      }} />
    </Secao>
  );
}
