import { Alert, Box, Button, Chip, Pagination, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { AD, AVISO_SIMULADO, DataList, FormDialog, LoadBox, Pick, Section, call, errMsg, itemsOf, label, qstr, useApi, useRunner, useToast, type FormField } from "./kit";

const SITUACOES = ["REGULAR", "DESCREDENCIADA", "EM_EXTINCAO", "SUSPENSA", "EM_DILIGENCIA"].map((value) => ({ value, label: label(value) }));
const FIELDS: FormField[] = [
  { key: "tipo", label: "Tipo", type: "select", required: true, options: [{ value: "IES", label: "IES (e-MEC)" }, { value: "ESCOLA", label: "Escola (secretaria estadual)" }] },
  { key: "codigo", label: "Código (3 a 10 dígitos)", required: true }, { key: "nome", label: "Nome", required: true, full: true }, { key: "sigla", label: "Sigla" },
  { key: "uf", label: "UF", required: true }, { key: "municipio", label: "Município" }, { key: "situacao", label: "Situação", type: "select", required: true, options: SITUACOES },
  { key: "secretariaEstadual", label: "Secretaria estadual (escolas)", full: true },
];

/** Consulta de veracidade (provedor SIMULADO) e base local de demonstração. */
export default function InstituicoesTab({ admin }: { admin: boolean }) {
  const [tipo, setTipo] = useState("IES");
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [curso, setCurso] = useState("");
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [novo, setNovo] = useState(false);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const l = useApi<any>(`${AD}/instituicoes?${qstr({ page, pageSize: 20, q, tipo: fTipo })}`, [rev]);
  const rows = itemsOf(l.data);
  async function consultar() {
    setErr(null); setRes(null);
    try { setRes(await call("GET", `${AD}/instituicoes-consulta?${qstr({ tipo, codigo, nome, curso })}`)); } catch (e: any) { setErr(errMsg(e)); }
  }
  return (
    <>
      {node}
      <Section title="Confirmação de veracidade da instituição de origem">
        <Alert severity="warning" sx={{ mb: 2 }}>{AVISO_SIMULADO}</Alert>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr) auto" }, gap: 1.5, alignItems: "start", mb: 2 }}>
          <Pick label="Tipo" value={tipo} onChange={setTipo} options={[{ value: "IES", label: "IES (cadastro e-MEC)" }, { value: "ESCOLA", label: "Escola (secretaria estadual)" }]} minWidth={0} />
          <TextField size="small" label="Código" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          <TextField size="small" label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          <TextField size="small" label="Curso (IES)" value={curso} onChange={(e) => setCurso(e.target.value)} disabled={tipo !== "IES"} />
          <Button variant="contained" onClick={consultar} disabled={!codigo && !nome}>Consultar</Button>
        </Box>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        {res && (
          <Alert severity={!res.encontrada ? "error" : res.situacao === "REGULAR" ? "success" : "warning"}>
            {!res.encontrada ? <b>Instituição não encontrada na base consultada. </b> : <><b>{res.instituicao.nome}</b> — código {res.instituicao.codigo} · {res.instituicao.uf} · situação <b>{label(res.situacao)}</b>{res.cursoReconhecido === true ? " · curso reconhecido" : res.cursoReconhecido === false ? " · CURSO NÃO RECONHECIDO" : ""}. </>}
            <Chip size="small" sx={{ ml: 1 }} variant="outlined" label={res.simulada ? "Consulta simulada (base de demonstração)" : `Provedor ${res.provedor}`} />
            {res.aviso && <Typography variant="caption" sx={{ display: "block" }}>{res.aviso}</Typography>}
          </Alert>
        )}
      </Section>
      <Section title="Base de demonstração (cadastro fictício)" actions={admin ? <Button variant="outlined" onClick={() => setNovo(true)}>Cadastrar instituição</Button> : undefined}>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
          <TextField size="small" label="Buscar" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} sx={{ flex: "1 1 200px" }} />
          <Pick label="Tipo" value={fTipo} onChange={(v) => { setFTipo(v); setPage(1); }} options={[{ value: "IES", label: "IES" }, { value: "ESCOLA", label: "Escolas" }]} all="Todos" minWidth={130} />
        </Box>
        <LoadBox loading={l.loading} error={l.error} empty={!rows.length} onRetry={l.reload}>
          <DataList rows={rows} columns={[
            { label: "Nome", primary: true, render: (r: any) => <span style={{ overflowWrap: "anywhere" }}>{r.nome}{r.sigla ? ` (${r.sigla})` : ""}</span> },
            { label: "Tipo", render: (r: any) => r.tipo }, { label: "Código", render: (r: any) => r.codigo }, { label: "UF", render: (r: any) => r.uf },
            { label: "Situação", render: (r: any) => <Chip size="small" color={r.situacao === "REGULAR" ? "success" : r.situacao === "EM_DILIGENCIA" ? "warning" : "error"} label={label(r.situacao)} /> },
            { label: "Cursos reconhecidos", hideOnMobile: true, render: (r: any) => (r.cursos || []).filter((c: any) => c.reconhecido).map((c: any) => c.nome).join(", ") || "—" },
          ]} />
          {(l.data?.total ?? 0) > 20 && <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}><Pagination count={Math.ceil(l.data.total / 20)} page={page} onChange={(_, p) => setPage(p)} /></Box>}
        </LoadBox>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>Integração real: ver README do módulo (variáveis EMEC_API_URL e EMEC_API_TOKEN; contrato JSON do gateway).</Typography>
      </Section>
      <FormDialog open={novo} title="Cadastrar instituição na base local" fields={FIELDS} initial={{ tipo: "IES", situacao: "REGULAR" }} onClose={() => setNovo(false)} onSubmit={async (b) => { await run(() => call("POST", `${AD}/instituicoes`, b), "Instituição cadastrada."); }} />
    </>
  );
}
