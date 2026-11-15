import { Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { AvisoSimulacao, DP, Estado, Formulario, Kpi, KpiRow, Lista, Secao, StatusChip, brl, dataBr, host, qstr, rotulo, useApi, useRun, useToast } from "../comum2/kit";

const ETAPAS = ["TRIAGEM", "ENTREVISTA", "TESTE", "PROPOSTA", "APROVADO", "REPROVADO", "DESISTIU"];
export const SeletorEmpresa = ({ valor, onChange }: { valor: string; onChange: (v: string) => void }) => {
  const e = useApi<any>(`/contabil/societario/empresas-ref`);
  return (
    <TextField size="small" select label="Empresa do cliente" value={valor} onChange={(x) => onChange(x.target.value)} sx={{ minWidth: 240 }} helperText={e.data && !e.data.itens.length ? "Nenhuma empresa ainda: cadastre um funcionário ou vaga informando o código da empresa." : undefined}>
      <MenuItem value="">Todas</MenuItem>
      {(e.data?.itens || []).map((x: any) => <MenuItem key={x.id} value={x.id}>{x.nome || x.id}</MenuItem>)}
    </TextField>
  );
};

export function PainelDp() {
  const p = useApi<any>(`${DP}/painel`);
  const d = p.data;
  return (
    <Estado loading={p.loading} error={p.error} onRetry={p.reload}>
      {d ? (
        <KpiRow>
          <Kpi titulo="Vagas abertas" valor={d.vagasAbertas} cor="#0F5FDB" /><Kpi titulo="Candidatos em processo" valor={d.candidatosAtivos} />
          <Kpi titulo="Funcionários ativos" valor={d.funcionarios?.ATIVO ?? 0} cor="#2e9e5b" /><Kpi titulo="Em admissão" valor={d.funcionarios?.ADMISSAO ?? 0} />
          <Kpi titulo="Afastados" valor={d.funcionarios?.AFASTADO ?? 0} /><Kpi titulo="Folhas em rascunho" valor={d.folhasEmRascunho} cor={d.folhasEmRascunho ? "#c98a00" : undefined} />
          <Kpi titulo="Rescisões em rascunho" valor={d.rescisoesEmRascunho} /><Kpi titulo="Férias a vencer (90 d)" valor={d.feriasAVencer} cor={d.feriasAVencer ? "#d64545" : "#2e9e5b"} />
        </KpiRow>
      ) : null}
    </Estado>
  );
}

function Candidatos({ vaga, onClose, onChanged }: { vaga: any; onClose: () => void; onChanged: () => void }) {
  const r = useApi<any>(`${DP}/vagas/${vaga.id}/candidatos`);
  const { toast, node } = useToast();
  const run = useRun(toast, () => { r.reload(); onChanged(); });
  const [novo, setNovo] = useState(false); const [adm, setAdm] = useState<any | null>(null);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" fullScreen={typeof window !== "undefined" && window.innerWidth < 600}>
      <DialogTitle>Funil — {vaga.titulo}</DialogTitle>
      <DialogContent dividers>
        {node}
        <Estado loading={r.loading} error={r.error} onRetry={r.reload}>
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 2 }}>{(r.data?.funil || []).map((f: any) => <Chip key={f.etapa} label={`${rotulo(f.etapa)}: ${f.total}`} color={f.total ? "primary" : "default"} variant={f.total ? "filled" : "outlined"} />)}</Box>
          <Button size="small" variant="outlined" sx={{ mb: 1 }} onClick={() => setNovo(true)}>Adicionar candidato</Button>
          <Estado vazio={!r.data?.items?.length} textoVazio="Nenhum candidato nesta vaga.">
            <Lista linhas={r.data?.items || []} colunas={[
              { titulo: "Candidato", principal: true, render: (c: any) => c.nome }, { titulo: "E-mail", esconderNoCelular: true, render: (c: any) => c.email || "—" }, { titulo: "Nota", render: (c: any) => c.nota ?? "—" },
              { titulo: "Etapa", render: (c: any) => (
                <TextField size="small" select value={c.etapa} onChange={(e) => run(() => host.put(`${DP}/candidatos/${c.id}`, { etapa: e.target.value }), "Candidato movido.")} sx={{ minWidth: 150 }}>
                  {ETAPAS.map((x) => <MenuItem key={x} value={x}>{rotulo(x)}</MenuItem>)}
                </TextField>) },
            ]} acoes={(c: any) => (c.funcionarioId ? <Chip size="small" color="success" label="Admitido" /> : ["PROPOSTA", "APROVADO"].includes(c.etapa) ? <Button size="small" onClick={() => setAdm(c)}>Admitir</Button> : null)} />
          </Estado>
        </Estado>
        <Formulario aberto={novo} titulo="Novo candidato" campos={[{ nome: "nome", rotulo: "Nome", obrigatorio: true }, { nome: "email", rotulo: "E-mail" }, { nome: "telefone", rotulo: "Telefone" }, { nome: "nota", rotulo: "Nota (0 a 10)", tipo: "number" }, { nome: "observacao", rotulo: "Observação", tipo: "textarea" }]}
          aoFechar={() => setNovo(false)} aoEnviar={async (v) => { if (await run(() => host.post(`${DP}/vagas/${vaga.id}/candidatos`, v), "Candidato adicionado.")) setNovo(false); }} />
        <Formulario aberto={!!adm} titulo={`Admitir ${adm?.nome || ""}`} enviarRotulo="Iniciar admissão" campos={[
          { nome: "salarioBase", rotulo: "Salário base (R$)", tipo: "number", obrigatorio: true, padrao: vaga.salario }, { nome: "admissao", rotulo: "Data de admissão", tipo: "date", obrigatorio: true }, { nome: "cpf", rotulo: "CPF" },
          { nome: "dependentes", rotulo: "Dependentes (IRRF)", tipo: "number", padrao: 0 }, { nome: "optanteVt", rotulo: "Optante por vale-transporte", tipo: "checkbox" }, { nome: "vtMensal", rotulo: "Custo mensal do VT (R$)", tipo: "number" },
        ]} aoFechar={() => setAdm(null)} aoEnviar={async (v) => { if (await run(() => host.post(`${DP}/candidatos/${adm.id}/admitir`, v), "Admissão iniciada: veja em Funcionários.")) setAdm(null); }} />
      </DialogContent>
      <DialogActions><Button variant="contained" onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

export function Vagas() {
  const [empresa, setEmpresa] = useState("");
  const r = useApi<any>(`${DP}/vagas?${qstr({ pageSize: 100, empresaId: empresa })}`);
  const { toast, node } = useToast();
  const run = useRun(toast, r.reload);
  const [novo, setNovo] = useState(false); const [sel, setSel] = useState<any | null>(null);
  const items: any[] = r.data?.items || [];
  return (
    <Secao titulo="Vagas e candidatos (recrutamento)" acoes={<Button variant="contained" onClick={() => setNovo(true)}>Nova vaga</Button>}>
      {node}
      <Box sx={{ mb: 2 }}><SeletorEmpresa valor={empresa} onChange={setEmpresa} /></Box>
      <Estado loading={r.loading} error={r.error} onRetry={r.reload} vazio={!items.length} textoVazio="Nenhuma vaga cadastrada.">
        <Lista linhas={items} aoClicar={setSel} colunas={[
          { titulo: "Vaga", principal: true, render: (v: any) => <>{v.titulo}<Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{v.empresaNome || v.empresaId}</Typography></> },
          { titulo: "Salário", render: (v: any) => brl(v.salario) }, { titulo: "Funil", render: (v: any) => ETAPAS.slice(0, 5).map((e) => `${v.funil[e]}`).join(" · "), esconderNoCelular: true },
          { titulo: "Situação", render: (v: any) => <StatusChip v={v.status} /> },
        ]} acoes={(v: any) => <><Button size="small" onClick={() => setSel(v)}>Candidatos</Button>{v.status !== "PREENCHIDA" ? <Button size="small" onClick={() => run(() => host.put(`${DP}/vagas/${v.id}`, { status: "PREENCHIDA" }), "Vaga marcada como preenchida.")}>Preenchida</Button> : null}</>} />
      </Estado>
      <Formulario aberto={novo} titulo="Nova vaga" campos={[
        { nome: "empresaId", rotulo: "Código da empresa (empresaId)", obrigatorio: true, ajuda: "Identificador da empresa do cliente" }, { nome: "empresaNome", rotulo: "Nome da empresa" }, { nome: "titulo", rotulo: "Título da vaga", obrigatorio: true },
        { nome: "cargo", rotulo: "Cargo" }, { nome: "salario", rotulo: "Salário (R$)", tipo: "number" }, { nome: "quantidade", rotulo: "Quantidade de vagas", tipo: "number", padrao: 1 }, { nome: "requisitos", rotulo: "Requisitos", tipo: "textarea" },
      ]} aoFechar={() => setNovo(false)} aoEnviar={async (v) => { if (await run(() => host.post(`${DP}/vagas`, v), "Vaga criada.")) setNovo(false); }} />
      {sel ? <Candidatos vaga={sel} onClose={() => setSel(null)} onChanged={r.reload} /> : null}
    </Secao>
  );
}

function Admissao({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const d = useApi<any>(`${DP}/funcionarios/${id}`);
  const { toast, node } = useToast();
  const run = useRun(toast, () => { d.reload(); onChanged(); });
  const [lista, setLista] = useState<Array<{ item: string; ok: boolean }> | null>(null);
  const [exame, setExame] = useState("");
  const f = d.data;
  const cl = lista ?? f?.checklistAdmissao ?? [];
  const salvar = () => run(() => host.put(`${DP}/funcionarios/${id}/checklist`, { checklist: cl, exameAdmissionalEm: exame || (f?.exameAdmissionalEm ? f.exameAdmissionalEm.slice(0, 10) : undefined) }), "Checklist salvo.");
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" fullScreen={typeof window !== "undefined" && window.innerWidth < 600}>
      <DialogTitle>{f?.nome || "Funcionário"} {f ? <StatusChip v={f.status} /> : null}</DialogTitle>
      <DialogContent dividers>
        {node}
        <Estado loading={d.loading && !f} error={d.error} onRetry={d.reload}>
          {f ? (
            <>
              <KpiRow><Kpi titulo="Cargo" valor={f.cargo || "—"} /><Kpi titulo="Salário base" valor={brl(f.salarioBase)} /><Kpi titulo="Admissão" valor={dataBr(f.admissao)} /><Kpi titulo="CPF" valor={f.cpf ? (f.cpf.includes("*") ? f.cpf : `***.${f.cpf.slice(3, 6)}.${f.cpf.slice(6, 9)}-**`) : "—"} /></KpiRow>
              {f.status === "ADMISSAO" ? (
                <Secao titulo="Checklist de admissão">
                  {cl.map((c: any, i: number) => <FormControlLabel key={i} sx={{ display: "flex" }} control={<Checkbox checked={c.ok} onChange={(e) => setLista(cl.map((x: any, k: number) => (k === i ? { ...x, ok: e.target.checked } : x)))} />} label={c.item} />)}
                  <TextField size="small" type="date" label="Data do exame admissional (ASO)" slotProps={{ inputLabel: { shrink: true } }} value={exame || (f.exameAdmissionalEm ? f.exameAdmissionalEm.slice(0, 10) : "")} onChange={(e) => setExame(e.target.value)} sx={{ mt: 1 }} />
                  <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap" }}>
                    <Button variant="outlined" onClick={salvar}>Salvar checklist</Button>
                    <Button variant="contained" onClick={async () => { await salvar(); await run(() => host.post(`${DP}/funcionarios/${id}/concluir-admissao`, {}), "Admissão concluída; evento S-2200 SIMULADO registrado."); }}>Concluir admissão (eSocial S-2200 simulado)</Button>
                  </Box>
                </Secao>
              ) : null}
              <Secao titulo="Eventos do eSocial (simulados)">
                <AvisoSimulacao texto="Os eventos abaixo são fictícios: nada foi enviado ao eSocial." />
                <Estado vazio={!f.esocial.length} textoVazio="Nenhum evento."><Lista linhas={f.esocial} colunas={[{ titulo: "Evento", principal: true, render: (e: any) => e.evento }, { titulo: "Protocolo", render: (e: any) => e.protocolo }, { titulo: "Status", render: (e: any) => rotulo(e.status) }, { titulo: "Data", render: (e: any) => dataBr(e.createdAt) }]} /></Estado>
              </Secao>
            </>
          ) : null}
        </Estado>
      </DialogContent>
      <DialogActions><Button variant="contained" onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

export function Funcionarios() {
  const [empresa, setEmpresa] = useState(""); const [status, setStatus] = useState(""); const [q, setQ] = useState("");
  const r = useApi<any>(`${DP}/funcionarios?${qstr({ pageSize: 100, empresaId: empresa, status, q })}`);
  const { toast, node } = useToast();
  const run = useRun(toast, r.reload);
  const [novo, setNovo] = useState(false); const [sel, setSel] = useState<string | null>(null); const [afast, setAfast] = useState<any | null>(null);
  const items: any[] = r.data?.items || [];
  return (
    <Secao titulo="Funcionários e admissão" acoes={<Button variant="contained" onClick={() => setNovo(true)}>Nova admissão</Button>}>
      {node}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
        <SeletorEmpresa valor={empresa} onChange={setEmpresa} />
        <TextField size="small" select label="Situação" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 150 }}><MenuItem value="">Todas</MenuItem>{["ADMISSAO", "ATIVO", "AFASTADO", "DESLIGADO"].map((s) => <MenuItem key={s} value={s}>{rotulo(s)}</MenuItem>)}</TextField>
        <TextField size="small" label="Buscar pelo nome" value={q} onChange={(e) => setQ(e.target.value)} />
      </Box>
      <Estado loading={r.loading} error={r.error} onRetry={r.reload} vazio={!items.length} textoVazio="Nenhum funcionário cadastrado.">
        <Lista linhas={items} aoClicar={(f) => setSel(f.id)} colunas={[
          { titulo: "Nome", principal: true, render: (f: any) => <>{f.nome}<Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{f.empresaNome || f.empresaId}</Typography></> },
          { titulo: "Cargo", render: (f: any) => f.cargo || "—" }, { titulo: "Salário", render: (f: any) => brl(f.salarioBase) }, { titulo: "Admissão", render: (f: any) => dataBr(f.admissao) }, { titulo: "Situação", render: (f: any) => <StatusChip v={f.status} /> },
        ]} acoes={(f: any) => <><Button size="small" onClick={() => setSel(f.id)}>Abrir</Button>{f.status === "ATIVO" ? <Button size="small" onClick={() => setAfast(f)}>Afastar</Button> : null}</>} />
      </Estado>
      <Formulario aberto={novo} titulo="Nova admissão" campos={[
        { nome: "empresaId", rotulo: "Código da empresa (empresaId)", obrigatorio: true }, { nome: "empresaNome", rotulo: "Nome da empresa" }, { nome: "nome", rotulo: "Nome completo", obrigatorio: true }, { nome: "cpf", rotulo: "CPF" }, { nome: "cargo", rotulo: "Cargo" },
        { nome: "salarioBase", rotulo: "Salário base (R$)", tipo: "number", obrigatorio: true }, { nome: "admissao", rotulo: "Data de admissão", tipo: "date", obrigatorio: true }, { nome: "dependentes", rotulo: "Dependentes (IRRF)", tipo: "number", padrao: 0 },
        { nome: "optanteVt", rotulo: "Optante por vale-transporte", tipo: "checkbox" }, { nome: "vtMensal", rotulo: "Custo mensal do VT (R$)", tipo: "number" },
      ]} aoFechar={() => setNovo(false)} aoEnviar={async (v) => { if (await run(() => host.post(`${DP}/funcionarios`, v), "Admissão iniciada.")) setNovo(false); }} />
      <Formulario aberto={!!afast} titulo={`Afastamento — ${afast?.nome || ""}`} campos={[
        { nome: "tipo", rotulo: "Tipo", tipo: "select", obrigatorio: true, opcoes: ["DOENCA", "ACIDENTE", "MATERNIDADE", "PATERNIDADE", "LICENCA_NAO_REMUNERADA", "OUTRO"].map((x) => ({ value: x, label: rotulo(x) })) },
        { nome: "inicio", rotulo: "Início", tipo: "date", obrigatorio: true }, { nome: "fim", rotulo: "Fim previsto (opcional)", tipo: "date" }, { nome: "observacao", rotulo: "Observação (sem CID nem dados de saúde)", tipo: "textarea", ajuda: "Dados de saúde são sensíveis (LGPD): registre só o necessário." },
      ]} aoFechar={() => setAfast(null)} aoEnviar={async (v) => { if (await run(() => host.post(`${DP}/afastamentos`, { ...v, funcionarioId: afast.id }), "Afastamento registrado (S-2230 simulado).")) setAfast(null); }} />
      {sel ? <Admissao id={sel} onClose={() => setSel(null)} onChanged={r.reload} /> : null}
    </Secao>
  );
}
