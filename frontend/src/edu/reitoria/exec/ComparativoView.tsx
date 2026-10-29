import { Alert, Box, Button, Chip, FormControlLabel, MenuItem, Paper, Switch, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { useRef, useState } from "react";
import EduResourcePage, { type FieldDef } from "../../EduResourcePage";
import { eduApi } from "../../../services/EduApi";
import { baixarArquivo, fetchTexto } from "../common";
import { Kpi, KpiGrid, Section, Status, label, useApi, useToast } from "../../regulatorio/ui";
import { Grafico, PALETA, fmtUn } from "./Charts";

const INDICADORES = ["CPC", "CC", "IGC", "ENADE", "IDD", "MENSALIDADE", "NUM_CURSOS", "NUM_ALUNOS", "NUM_DOCENTES", "PCT_DOUTORES", "INGRESSANTES", "CONCLUINTES"];
const ROT: Record<string, string> = { CPC: "CPC (contínuo)", CC: "Conceito de Curso", IGC: "IGC (contínuo)", ENADE: "ENADE (contínuo)", IDD: "IDD", MENSALIDADE: "Mensalidade média", NUM_CURSOS: "Nº de cursos", NUM_ALUNOS: "Nº de alunos", NUM_DOCENTES: "Nº de docentes", PCT_DOUTORES: "% de doutores", INGRESSANTES: "Ingressantes", CONCLUINTES: "Concluintes" };

function Ranking() {
  const [ano, setAno] = useState("");
  const [curso, setCurso] = useState("");
  const { data, loading, error, reload } = useApi<any>(`/reitoria/comparativo/painel${ano || curso ? `?${ano ? `ano=${ano}` : ""}${ano && curso ? "&" : ""}${curso ? `curso=${encodeURIComponent(curso)}` : ""}` : ""}`);
  const [ind, setInd] = useState("CPC");
  const { data: evo } = useApi<any>(`/reitoria/comparativo/evolucao?indicador=${ind}${curso ? `&curso=${encodeURIComponent(curso)}` : ""}`);
  const { toast, node } = useToast();
  const linhas: any[] = data?.indicadores || [];
  const atual = linhas.find((l) => l.indicador === ind);
  async function csv() { try { baixarArquivo("comparativo-ies.csv", await fetchTexto("/reitoria/comparativo/painel?formato=csv"), "text/csv;charset=utf-8"); } catch (e: any) { toast({ type: "error", text: e.message }); } }
  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2, alignItems: "center" }}>
        <TextField select size="small" label="Ano" value={ano} onChange={(e) => setAno(e.target.value)} sx={{ minWidth: 120 }}><MenuItem value="">Mais recente</MenuItem>{(data?.anosDisponiveis || []).map((a: number) => <MenuItem key={a} value={String(a)}>{a}</MenuItem>)}</TextField>
        <TextField size="small" label="Curso (opcional)" value={curso} onChange={(e) => setCurso(e.target.value)} />
        <Box sx={{ flex: 1 }} />
        <Button startIcon={<DownloadIcon />} onClick={csv}>Exportar CSV</Button>
      </Box>
      {data?.avisos?.map((a: string) => <Alert key={a} severity="info" sx={{ mb: 1 }}>{a}</Alert>)}
      <Status loading={loading && !data} error={error} onRetry={reload} empty={!linhas.length} emptyText="Sem indicadores. Importe o CSV do INEP ou lance valores manualmente na aba Indicadores.">
        <KpiGrid>
          {["CPC", "IGC", "NUM_ALUNOS", "MENSALIDADE"].map((k) => {
            const l = linhas.find((x) => x.indicador === k);
            return l ? <Kpi key={k} title={ROT[k]} value={fmtUn(l.valorProprio, l.unidade === "R$" ? "R$" : undefined)} hint={l.posicaoPropria ? `${l.posicaoPropria}º de ${l.participantes}${l.diferencaMedia != null ? ` · ${l.diferencaMedia >= 0 ? "+" : ""}${l.diferencaMedia.toLocaleString("pt-BR")} vs média` : ""}` : "sem valor da própria IES"} /> : null;
          })}
        </KpiGrid>
        <Box sx={{ display: "flex", gap: 0.8, flexWrap: "wrap", mb: 2 }}>
          {linhas.map((l) => <Chip key={l.indicador} label={ROT[l.indicador] || l.indicador} color={l.indicador === ind ? "primary" : "default"} onClick={() => setInd(l.indicador)} />)}
        </Box>
        {atual && (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Ranking — {ROT[atual.indicador]}</Typography>
              <Typography variant="caption" color="text.secondary">{atual.sentido === "NEUTRO" ? "Indicador informativo (sem melhor/pior)." : atual.sentido === "MAIOR" ? "Maior é melhor." : "Menor é melhor."} Valor mais recente de cada IES até {data.ano ?? "o ano atual"}.</Typography>
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead><TableRow><TableCell>#</TableCell><TableCell>IES</TableCell><TableCell align="right">Valor</TableCell><TableCell>Ano</TableCell></TableRow></TableHead>
                  <TableBody>
                    {atual.ranking.map((r: any) => (
                      <TableRow key={r.iesId} selected={r.tipo === "PROPRIA"}>
                        <TableCell>{r.posicao}</TableCell>
                        <TableCell><b>{r.nome}</b> {r.tipo === "PROPRIA" ? <Chip size="small" label="nossa" color="primary" /> : r.tipo === "REFERENCIA" ? <Chip size="small" label="referência" /> : null}</TableCell>
                        <TableCell align="right">{fmtUn(r.valor, atual.unidade === "R$" ? "R$" : undefined)}</TableCell><TableCell>{r.ano}{r.fonte === "INTERNO" ? " (interno)" : ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
              {atual.diferencaMelhor != null && <Typography variant="body2" sx={{ mt: 1 }}>Diferença para o melhor: <b>{atual.diferencaMelhor.toLocaleString("pt-BR")}</b> ({atual.melhor?.nome}).</Typography>}
            </Paper>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, minWidth: 0 }}>
              {evo && evo.series?.length ? <Grafico serie={{ chave: "evo", titulo: `Evolução — ${ROT[ind]}`, tipo: "linha", rotulos: evo.anos.map(String), dados: evo.series.map((s: any) => ({ nome: s.nome + (s.tipo === "PROPRIA" ? " (nossa)" : ""), valores: s.pontos.map((p: any) => p.valor) })) }} /> : <Typography color="text.secondary">Sem série histórica para este indicador.</Typography>}
            </Paper>
          </Box>
        )}
        <Box sx={{ mt: 2, display: "none" }}>{PALETA.length}</Box>
      </Status>
      {node}
    </Box>
  );
}

const F_IES: FieldDef[] = [
  { key: "tipo", label: "Tipo", type: "select", options: [{ value: "PROPRIA", label: "Própria" }, { value: "CONCORRENTE", label: "Concorrente" }, { value: "REFERENCIA", label: "Referência" }], defaultValue: "CONCORRENTE" },
  { key: "nome", label: "Nome", required: true },
  { key: "sigla", label: "Sigla" },
  { key: "cnpj", label: "CNPJ" },
  { key: "codigoEmec", label: "Código e-MEC" },
  { key: "uf", label: "UF" },
  { key: "municipio", label: "Município" },
  { key: "categoria", label: "Categoria administrativa" },
  { key: "organizacao", label: "Organização acadêmica" },
  { key: "site", label: "Site" },
  { key: "ativo", label: "Ativa", type: "bool", defaultValue: true },
  { key: "observacoes", label: "Observações", type: "textarea" },
];

function Cadastro() {
  const { toast, node } = useToast();
  return (
    <Box>
      <Box sx={{ mb: 2 }}><Button variant="outlined" onClick={async () => { try { await eduApi.post("/reitoria/comparativo/ies/propria"); toast({ type: "success", text: "IES própria cadastrada a partir da Identidade." }); } catch (e: any) { toast({ type: "error", text: e.message }); } }}>Cadastrar nossa instituição (a partir da Identidade)</Button></Box>
      <EduResourcePage title="Instituições comparadas" base="/reitoria/comparativo" resource="/ies" fields={F_IES} filters={[{ key: "tipo", label: "Tipo", options: ["PROPRIA", "CONCORRENTE", "REFERENCIA"] }]}
        columns={[{ key: "nome", label: "IES", render: (r) => <b>{r.sigla ? `${r.sigla} — ` : ""}{r.nome}</b> }, { key: "tipo", label: "Tipo", render: (r) => label(r.tipo) }, { key: "codigoEmec", label: "e-MEC" }, { key: "cnpj", label: "CNPJ" }, { key: "uf", label: "UF" }, { key: "_count", label: "Indicadores", render: (r) => r._count?.indicadores ?? 0 }]} />
      {node}
    </Box>
  );
}

function Indicadores() {
  const { data: ies } = useApi<any>("/reitoria/comparativo/ies");
  const [f, setF] = useState<any>({ iesId: "", ano: String(new Date().getFullYear() - 1), indicador: "CPC", valor: "", cursoNome: "" });
  const { data, reload } = useApi<any>("/reitoria/comparativo/indicadores");
  const { toast, node } = useToast();
  async function salvar() {
    try { await eduApi.put("/reitoria/comparativo/indicadores", { iesId: f.iesId, ano: Number(f.ano), indicador: f.indicador, valor: Number(String(f.valor).replace(",", ".")), cursoNome: f.cursoNome }); toast({ type: "success", text: "Indicador salvo." }); reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Box>
      <Section title="Lançar indicador">
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "2fr 1fr 1fr 1fr 1fr auto" }, gap: 1.5, alignItems: "center" }}>
          <TextField select size="small" label="IES" value={f.iesId} onChange={(e) => setF({ ...f, iesId: e.target.value })} sx={{ gridColumn: { xs: "1 / -1", md: "auto" } }}>{(ies?.items || []).map((i: any) => <MenuItem key={i.id} value={i.id}>{i.sigla || i.nome}</MenuItem>)}</TextField>
          <TextField select size="small" label="Indicador" value={f.indicador} onChange={(e) => setF({ ...f, indicador: e.target.value })}>{INDICADORES.map((i) => <MenuItem key={i} value={i}>{ROT[i]}</MenuItem>)}</TextField>
          <TextField size="small" type="number" label="Ano" value={f.ano} onChange={(e) => setF({ ...f, ano: e.target.value })} />
          <TextField size="small" label="Valor" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} />
          <TextField size="small" label="Curso (opcional)" value={f.cursoNome} onChange={(e) => setF({ ...f, cursoNome: e.target.value })} />
          <Button variant="contained" disabled={!f.iesId || f.valor === ""} onClick={salvar}>Salvar</Button>
        </Box>
      </Section>
      <Section title="Indicadores lançados">
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>IES</TableCell><TableCell>Indicador</TableCell><TableCell>Ano</TableCell><TableCell>Curso</TableCell><TableCell align="right">Valor</TableCell><TableCell>Fonte</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>
              {(data?.items || []).map((r: any) => (
                <TableRow key={r.id}><TableCell>{r.ies?.sigla || r.ies?.nome}</TableCell><TableCell>{ROT[r.indicador] || r.indicador}</TableCell><TableCell>{r.ano}</TableCell><TableCell>{r.cursoNome || "—"}</TableCell><TableCell align="right">{r.valor.toLocaleString("pt-BR")}</TableCell><TableCell>{label(r.fonte)}</TableCell>
                  <TableCell><Button size="small" color="error" onClick={async () => { if (window.confirm("Excluir este valor?")) { await eduApi.del(`/reitoria/comparativo/indicadores/${r.id}`); reload(); } }}>Excluir</Button></TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Section>
      {node}
    </Box>
  );
}

function ImportarCsv() {
  const [conteudo, setConteudo] = useState("");
  const [dry, setDry] = useState(true);
  const [criar, setCriar] = useState(true);
  const [res, setRes] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const arq = useRef<HTMLInputElement>(null);
  async function enviar() {
    setErro(null); setRes(null);
    try { setRes(await eduApi.post("/reitoria/comparativo/importar-csv", { conteudo, dryRun: dry, criarIes: criar })); } catch (e: any) { setErro(e.message + (e.data?.cabecalhos ? ` Colunas lidas: ${e.data.cabecalhos.join(", ")}` : "")); }
  }
  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>Cole ou carregue o CSV dos microdados públicos do INEP (CPC, IGC, Censo da Educação Superior). Colunas reconhecidas: <code>CO_IES, NO_IES, SG_UF, NU_ANO_CENSO, CPC_CONTINUO, CC, IGC_CONTINUO, ENADE_CONTINUO, QT_CURSO, QT_MAT, MENSALIDADE</code> (ou o formato longo <code>codigo_ies, ano, indicador, valor, curso</code>). Separador ; , ou tab; vírgula decimal.</Alert>
      <TextField fullWidth multiline minRows={8} maxRows={18} label="Conteúdo do CSV" value={conteudo} onChange={(e) => setConteudo(e.target.value)} sx={{ mb: 1, "& textarea": { fontFamily: "monospace", fontSize: 12 } }} />
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <input ref={arq} type="file" accept=".csv,.txt" hidden onChange={async (e) => { const fl = e.target.files?.[0]; if (fl) setConteudo(await fl.text()); e.target.value = ""; }} />
        <Button startIcon={<UploadFileIcon />} onClick={() => arq.current?.click()}>Carregar arquivo</Button>
        <FormControlLabel control={<Switch checked={dry} onChange={(e) => setDry(e.target.checked)} />} label="Apenas simular" />
        <FormControlLabel control={<Switch checked={criar} onChange={(e) => setCriar(e.target.checked)} />} label="Criar IES novas" />
        <Button variant="contained" disabled={conteudo.length < 10} onClick={enviar}>{dry ? "Simular" : "Importar"}</Button>
      </Box>
      {erro && <Alert severity="error" sx={{ mt: 2 }}>{erro}</Alert>}
      {res && <Alert severity="success" sx={{ mt: 2 }}>Formato {res.formato}: {res.linhasLidas} linha(s) válida(s); {res.importados} valor(es) {res.dryRun ? "seriam novos" : "novos"}, {res.atualizados} atualizado(s), {res.iesCriadas} IES {res.dryRun ? "seriam criadas" : "criada(s)"}. {res.totalIgnoradas ? `${res.totalIgnoradas} linha(s) ignorada(s): ` : ""}{res.ignoradas?.slice(0, 5).map((x: any) => `linha ${x.linha} (${x.motivo})`).join("; ")}</Alert>}
    </Box>
  );
}

export default function ComparativoView() {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
        <Tab label="Ranking e evolução" /><Tab label="Instituições" /><Tab label="Indicadores" /><Tab label="Importar CSV (INEP)" />
      </Tabs>
      {tab === 0 && <Ranking />}{tab === 1 && <Cadastro />}{tab === 2 && <Indicadores />}{tab === 3 && <ImportarCsv />}
    </Box>
  );
}
