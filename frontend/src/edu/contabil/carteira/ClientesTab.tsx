import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Async, Empty, FormDialog, Panel, Tabela, Tag, useApi, useToast, type Field } from "./host";
import { ROTULO_REGIME, ROTULO_STATUS, Situacao, api, baixar, docFmt, ehContador, abrirHtml } from "./kit";
import ClienteFicha from "./ClienteFicha";

export const camposCliente = (op: any): Field[] => [
  { key: "tipo", label: "Tipo", type: "select", options: [{ value: "PJ", label: "Pessoa jurídica (CNPJ)" }, { value: "PF", label: "Pessoa física (CPF)" }], required: true, def: "PJ" },
  { key: "documento", label: "CNPJ / CPF", required: true, helper: "Validado pelos dígitos verificadores (aceita CNPJ alfanumérico)." },
  { key: "nome", label: "Razão social / nome", required: true }, { key: "nomeFantasia", label: "Nome fantasia" },
  { key: "status", label: "Situação", type: "select", options: Object.entries(ROTULO_STATUS).map(([value, label]) => ({ value, label })), def: "PROSPECTO" },
  { key: "regime", label: "Regime tributário", type: "select", options: Object.entries(ROTULO_REGIME).map(([value, label]) => ({ value, label })) },
  { key: "cnaePrincipal", label: "CNAE principal", helper: "Ex.: 6920-6/01" }, { key: "segmento", label: "Segmento", helper: (op?.segmentos || []).join(", ") },
  { key: "origem", label: "Origem" },
  { key: "responsavelId", label: "Contador responsável", type: "select", options: (op?.equipe || []).map((u: any) => ({ value: u.id, label: `${u.nome} (${u.cargo})` })) },
  { key: "analistaId", label: "Analista", type: "select", options: (op?.equipe || []).map((u: any) => ({ value: u.id, label: `${u.nome} (${u.cargo})` })) },
  { key: "dataAbertura", label: "Abertura da empresa / nascimento", type: "date" }, { key: "email", label: "E-mail" }, { key: "telefone", label: "Telefone" },
  { key: "tags", label: "Etiquetas (separe por vírgula)", type: "list" }, { key: "observacoes", label: "Observações", type: "textarea" },
];

function Importar({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [csv, setCsv] = useState("");
  const [atualizar, setAtualizar] = useState(false);
  const [previa, setPrevia] = useState<any>(null);
  const [res, setRes] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fechar = () => { setCsv(""); setPrevia(null); setRes(null); setErro(null); onClose(); };
  const run = async (modo: "previa" | "importar") => {
    setBusy(true); setErro(null);
    try {
      if (modo === "previa") { setPrevia(await api.post("/clientes/importar/previa", { csv, atualizarExistentes: atualizar })); setRes(null); }
      else { setRes(await api.post("/clientes/importar", { csv, atualizarExistentes: atualizar })); setPrevia(null); onDone(); }
    } catch (e: any) { setErro(e?.message || "Falha ao processar o CSV."); } finally { setBusy(false); }
  };
  const baixarErros = (txt: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" })); a.download = "relatorio-importacao.csv"; a.click(); };
  return (
    <Dialog open={open} onClose={fechar} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Importar clientes (CSV)</DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>Colunas: tipo, documento, nome, nome_fantasia, regime, cnae, segmento, origem, email, telefone, status, tags, responsavel_email, cep, cidade, uf, data_abertura. Só <b>documento</b> e <b>nome</b> são obrigatórios. <Button size="small" onClick={() => baixar("/clientes/modelo.csv", "modelo-clientes.csv").catch((e) => setErro(e.message))}>Baixar modelo</Button></Alert>
        <Box sx={{ display: "flex", gap: 1, mb: 1, flexWrap: "wrap", alignItems: "center" }}>
          <Button component="label" size="small" variant="outlined" startIcon={<UploadFileOutlinedIcon />}>Escolher arquivo<input hidden type="file" accept=".csv,text/csv,text/plain" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setCsv(await f.text()); setPrevia(null); setRes(null); } }} /></Button>
          <label style={{ fontSize: 14 }}><input type="checkbox" checked={atualizar} onChange={(e) => setAtualizar(e.target.checked)} /> Atualizar clientes já cadastrados</label>
        </Box>
        <TextField fullWidth multiline minRows={4} maxRows={10} size="small" placeholder="Cole o CSV aqui ou escolha um arquivo" value={csv} onChange={(e) => { setCsv(e.target.value); setPrevia(null); }} />
        {erro ? <Alert severity="error" sx={{ mt: 2 }}>{erro}</Alert> : null}
        {previa ? (
          <Box sx={{ mt: 2 }}>
            <Alert severity={previa.resumo.comErro ? "warning" : "success"} sx={{ mb: 1 }}>Prévia (nada foi gravado): <b>{previa.resumo.criar}</b> a criar · <b>{previa.resumo.atualizar}</b> a atualizar · <b>{previa.resumo.ignorar}</b> ignorada(s) · <b>{previa.resumo.comErro}</b> com erro de {previa.resumo.total}.{previa.colunasIgnoradas.length ? ` Colunas ignoradas: ${previa.colunasIgnoradas.join(", ")}.` : ""}</Alert>
            <Tabela rows={previa.linhas.map((l: any) => ({ ...l, id: String(l.linha) }))} cols={[
              { h: "Linha", r: (l: any) => l.linha }, { h: "Documento", r: (l: any) => docFmt(l.dados.documento) }, { h: "Nome", r: (l: any) => l.dados.nome },
              { h: "Ação", r: (l: any) => <Tag text={l.acao} tone={l.acao === "ERRO" ? "error" : l.acao === "CRIAR" ? "success" : l.acao === "ATUALIZAR" ? "info" : "warning"} /> },
              { h: "Detalhes", r: (l: any) => [...l.erros, ...l.avisos].join(" · ") || "—" },
            ]} />
            {previa.comErro || previa.resumo.comErro ? <Button size="small" sx={{ mt: 1 }} onClick={() => baixarErros(previa.relatorioErrosCsv)}>Baixar relatório de erros (CSV)</Button> : null}
          </Box>
        ) : null}
        {res ? (
          <Alert severity={res.erros.length ? "warning" : "success"} sx={{ mt: 2 }}>
            Importação concluída: <b>{res.resumo.criados}</b> criado(s), <b>{res.resumo.atualizados}</b> atualizado(s), {res.resumo.ignorar} ignorado(s), {res.erros.length} com erro.
            {res.erros.length ? <Box><Button size="small" onClick={() => baixarErros(res.relatorioErrosCsv)}>Baixar relatório de erros</Button></Box> : null}
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={fechar}>Fechar</Button>
        <Button disabled={!csv.trim() || busy} onClick={() => run("previa")}>Pré-visualizar</Button>
        <Button variant="contained" disabled={!previa || busy || (previa.resumo.criar + previa.resumo.atualizar === 0)} onClick={() => run("importar")}>Importar válidas</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function ClientesTab() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [regime, setRegime] = useState("");
  const [resp, setResp] = useState("");
  const [page, setPage] = useState(1);
  const [novo, setNovo] = useState(false);
  const [imp, setImp] = useState(false);
  const toast = useToast();
  const op = useApi<any>(`/contabil/carteira/clientes/opcoes`);
  const qsx = new URLSearchParams({ page: String(page), pageSize: "25", ...(q ? { q } : {}), ...(status ? { status } : {}), ...(regime ? { regime } : {}), ...(resp ? { responsavelId: resp } : {}) }).toString();
  const st = useApi<any>(`/contabil/carteira/clientes?${qsx}`);
  const abrir = params.get("cliente");
  return (
    <>
      <Panel title="Clientes" subtitle="Banco de clientes do escritório (PF e PJ)." actions={
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button size="small" startIcon={<FileDownloadOutlinedIcon />} onClick={() => toast.run(() => baixar(`/clientes/exportar${status ? `?status=${status}` : ""}`, "clientes.csv"), "Exportação gerada.")}>Exportar CSV</Button>
          {ehContador() ? <Button size="small" startIcon={<UploadFileOutlinedIcon />} onClick={() => setImp(true)}>Importar CSV</Button> : null}
          <Button size="small" variant="outlined" onClick={() => toast.run(() => abrirHtml("/relatorios/carteira-regime?format=html"))}>Imprimir carteira</Button>
          {ehContador() ? <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setNovo(true)}>Novo cliente</Button> : null}
        </Box>}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr 1fr 1.5fr" }, gap: 1, mb: 2 }}>
          <TextField size="small" label="Buscar (nome, CNPJ/CPF, e-mail)" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          <TextField size="small" select label="Situação" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><MenuItem value="">Todas</MenuItem>{Object.entries(ROTULO_STATUS).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}</TextField>
          <TextField size="small" select label="Regime" value={regime} onChange={(e) => { setRegime(e.target.value); setPage(1); }}><MenuItem value="">Todos</MenuItem>{Object.entries(ROTULO_REGIME).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}</TextField>
          <TextField size="small" select label="Responsável" value={resp} onChange={(e) => { setResp(e.target.value); setPage(1); }}><MenuItem value="">Todos</MenuItem>{(op.data?.equipe || []).map((u: any) => <MenuItem key={u.id} value={u.id}>{u.nome}</MenuItem>)}</TextField>
        </Box>
        <Async state={st}>
          {(d) => (
            <>
              <Tabela rows={d.items} vazio="Nenhum cliente encontrado. Cadastre o primeiro ou importe um CSV." onRow={(r: any) => setParams({ aba: "clientes", cliente: r.id })} cols={[
                { h: "Cliente", r: (r: any) => <><b>{r.nome}</b>{r.nomeFantasia ? <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{r.nomeFantasia}</Typography> : null}</> },
                { h: "CNPJ / CPF", r: (r: any) => (r.anonimizadoEm ? "—" : docFmt(r.documento)) },
                { h: "Situação", r: (r: any) => <Situacao value={r.status} /> }, { h: "Regime", r: (r: any) => ROTULO_REGIME[r.regime] || "—" },
                { h: "Segmento", r: (r: any) => r.segmento || "—", hideMobile: true }, { h: "Responsável", r: (r: any) => r.responsavelNome || "—" },
                { h: "Etiquetas", r: (r: any) => (r.tags || []).map((t: string) => <Tag key={t} text={t} />), hideMobile: true },
              ]} />
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1.5 }}>
                <Typography variant="caption" color="text.secondary">{d.total} cliente(s)</Typography>
                <Box><Button size="small" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button><Button size="small" disabled={page * 25 >= d.total} onClick={() => setPage(page + 1)}>Próxima</Button></Box>
              </Box>
              {!d.items.length && !q && !status ? <Empty text="A carteira está vazia." /> : null}
            </>
          )}
        </Async>
      </Panel>
      <FormDialog open={novo} title="Novo cliente" fields={camposCliente(op.data)} onClose={() => setNovo(false)} onSubmit={async (b) => { const c = await api.post("/clientes", b); toast.ok("Cliente cadastrado."); st.reload(); setParams({ aba: "clientes", cliente: c.id }); }} />
      <Importar open={imp} onClose={() => setImp(false)} onDone={st.reload} />
      {abrir ? <ClienteFicha id={abrir} opcoes={op.data} onClose={() => { const p = new URLSearchParams(params); p.delete("cliente"); setParams(p); }} onChanged={st.reload} /> : null}
      {toast.node}
    </>
  );
}
