import { Alert, Box, Button, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useState } from "react";
import EduResourcePage from "../EduResourcePage";
import { Bar, FormDialog, Kpi, KpiRow, LoadBox, Section, call, fmtNum, fmtPct, useApi, useCursos, useToast } from "../desempenho/kit";

const TIPOS = ["ARTIGO", "LIVRO", "CAPITULO", "TRABALHO_EVENTO", "PATENTE", "SOFTWARE", "OUTRO"];
const QUALIS = ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4", "C"];

function Indicadores() {
  const [de, setDe] = useState(""), [ate, setAte] = useState("");
  const q = new URLSearchParams({ ...(de ? { anoInicio: de } : {}), ...(ate ? { anoFim: ate } : {}) }).toString();
  const r = useApi<any>(`/pesquisa/indicadores/producao${q ? `?${q}` : ""}`);
  const d = r.data;
  const max = (o?: Record<string, number>) => Math.max(1, ...Object.values(o || {}));
  const anos = Object.entries(d?.porAno || {}).sort(([a], [b]) => a.localeCompare(b));
  return (
    <Section title="Indicadores de produção científica" actions={<>
      <TextField size="small" label="Ano inicial" type="number" value={de} onChange={(e) => setDe(e.target.value)} sx={{ width: 120 }} />
      <TextField size="small" label="Ano final" type="number" value={ate} onChange={(e) => setAte(e.target.value)} sx={{ width: 120 }} />
    </>}>
      <LoadBox loading={r.loading} error={r.error} onRetry={r.reload}>
        <KpiRow>
          <Kpi title="Publicações" value={d?.total ?? 0} />
          <Kpi title="Docentes ativos" value={d?.docentesAtivos ?? 0} hint={`${fmtNum(d?.mediaPorDocente)} por docente`} />
          <Kpi title="Qualis A1–A4" value={fmtPct(d?.percentualQualisAlto, 0)} hint="entre os artigos" color="#2e9e5b" />
          <Kpi title="Com DOI" value={fmtPct(d?.percentualComDoi, 0)} />
          <Kpi title="Coautoria discente" value={d?.comDiscentes ?? 0} />
          <Kpi title="Pontuação total" value={fmtNum(d?.pontuacaoTotal)} />
        </KpiRow>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" }, gap: 3 }}>
          <Box><Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Por ano</Typography>
            {anos.length ? anos.map(([k, v]) => <Bar key={k} label={k} value={Number(v)} max={max(d?.porAno)} right={String(v)} />) : <Typography color="text.secondary">Sem dados.</Typography>}</Box>
          <Box><Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Por tipo</Typography>
            {Object.entries(d?.porTipo || {}).map(([k, v]) => <Bar key={k} label={k.replace(/_/g, " ")} value={Number(v)} max={max(d?.porTipo)} right={String(v)} color="#7a5cff" />)}</Box>
          <Box><Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Por Qualis</Typography>
            {Object.entries(d?.porQualis || {}).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => <Bar key={k} label={k} value={Number(v)} max={max(d?.porQualis)} right={String(v)} color="#2e9e5b" />)}</Box>
        </Box>
        {(d?.porDocente || []).length > 0 && (
          <Box sx={{ mt: 2, overflowX: "auto" }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Produção por docente</Typography>
            <Table size="small"><TableHead><TableRow><TableCell>Docente</TableCell><TableCell>Total</TableCell><TableCell>Artigos</TableCell><TableCell>Pontuação</TableCell><TableCell>Pontuação fracionada</TableCell></TableRow></TableHead>
              <TableBody>{d.porDocente.slice(0, 15).map((x: any) => <TableRow key={x.userId}><TableCell>{x.nome ?? x.userId}</TableCell><TableCell>{x.total}</TableCell><TableCell>{x.artigos}</TableCell><TableCell>{fmtNum(x.pontuacao)}</TableCell><TableCell>{fmtNum(x.pontuacaoFracionada)}</TableCell></TableRow>)}</TableBody></Table>
          </Box>
        )}
      </LoadBox>
    </Section>
  );
}

export default function ProducaoTab() {
  const [sub, setSub] = useState("pubs");
  const [imp, setImp] = useState(false);
  const [rev, setRev] = useState(0);
  const cursos = useCursos();
  const { toast, node } = useToast();
  return (
    <Box>
      {node}
      <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
        <ToggleButtonGroup size="small" exclusive value={sub} onChange={(_, v) => v && setSub(v)}>
          <ToggleButton value="pubs">Publicações</ToggleButton><ToggleButton value="ind">Indicadores</ToggleButton><ToggleButton value="grupos">Grupos de pesquisa</ToggleButton>
        </ToggleButtonGroup>
        {sub === "pubs" && <Button variant="outlined" size="small" onClick={() => setImp(true)}>Importar BibTeX</Button>}
      </Box>
      {sub === "pubs" && (
        <EduResourcePage key={`p${rev}`} title="Produção científica" base="/pesquisa" resource="/publicacoes" description="Artigos, livros, capítulos, trabalhos em eventos, patentes e software. DOI, ISSN e ORCID são validados."
          filters={[{ key: "tipo", label: "Tipo", options: TIPOS }, { key: "qualis", label: "Qualis", options: QUALIS }]}
          columns={[{ key: "ano", label: "Ano", width: 70 }, { key: "titulo", label: "Título" }, { key: "tipo", label: "Tipo", render: (r) => String(r.tipo).replace(/_/g, " ") },
            { key: "veiculo", label: "Veículo" }, { key: "qualis", label: "Qualis" }, { key: "autores", label: "Autores", render: (r) => (r.autores || []).map((a: any) => a.nome).join("; ") || "—" }]}
          fields={[
            { key: "tipo", label: "Tipo", type: "select", options: TIPOS, required: true }, { key: "titulo", label: "Título", required: true }, { key: "ano", label: "Ano", type: "number", required: true },
            { key: "veiculo", label: "Veículo (periódico/editora/evento)" }, { key: "issn", label: "ISSN" }, { key: "isbn", label: "ISBN" }, { key: "volume", label: "Volume" }, { key: "numero", label: "Número" }, { key: "paginas", label: "Páginas" },
            { key: "doi", label: "DOI" }, { key: "url", label: "URL" }, { key: "qualis", label: "Qualis", type: "select", options: QUALIS }, { key: "jcr", label: "JCR (fator de impacto)", type: "number" },
            { key: "citacoes", label: "Citações", type: "number" }, { key: "palavrasChave", label: "Palavras-chave", type: "json-list", helper: "Separe por vírgulas" }, { key: "resumo", label: "Resumo", type: "textarea" },
          ]} />
      )}
      {sub === "ind" && <Indicadores />}
      {sub === "grupos" && (
        <EduResourcePage key={`g${rev}${cursos.length}`} title="Grupos de pesquisa" base="/pesquisa" resource="/grupos" searchable
          columns={[{ key: "sigla", label: "Sigla" }, { key: "nome", label: "Grupo" }, { key: "areaConhecimento", label: "Área" }, { key: "liderNome", label: "Líder" }, { key: "membros", label: "Membros", render: (r) => (r.membros || []).length }]}
          fields={[
            { key: "nome", label: "Nome", required: true }, { key: "sigla", label: "Sigla" }, { key: "areaConhecimento", label: "Área do conhecimento" }, { key: "liderNome", label: "Líder" },
            { key: "viceLiderNome", label: "Vice-líder" }, { key: "programId", label: "Curso", type: "select", options: cursos }, { key: "descricao", label: "Descrição", type: "textarea" }, { key: "ativo", label: "Ativo", type: "bool" },
          ]} />
      )}
      <FormDialog open={imp} onClose={() => setImp(false)} title="Importar publicações (BibTeX)" submitLabel="Importar"
        intro={<Alert severity="info" sx={{ mb: 2 }}>Cole o conteúdo BibTeX. Marque “apenas validar” para ver o que seria criado, sem gravar. Duplicadas (mesmo DOI ou título/ano) são ignoradas.</Alert>}
        fields={[{ key: "conteudo", label: "Conteúdo BibTeX", type: "textarea", required: true }, { key: "programId", label: "Curso", type: "select", options: cursos }, { key: "dryRun", label: "Apenas validar (não grava)", type: "bool" }]} initial={{ dryRun: true }}
        onSubmit={async (b) => {
          const r = await call("POST", "/pesquisa/publicacoes/importar", { formato: "BIBTEX", vincularDocentes: true, ...b });
          toast({ type: r.invalidas?.length ? "info" : "success", text: `${r.dryRun ? "Validação" : "Importação"}: ${r.lidas} lida(s), ${r.criadas} ${r.dryRun ? "a criar" : "criada(s)"}, ${r.duplicadas?.length ?? 0} duplicada(s), ${r.invalidas?.length ?? 0} inválida(s).${r.invalidas?.[0] ? `\n1ª inválida: ${r.invalidas[0].titulo} — ${r.invalidas[0].erro}` : ""}` });
          if (!r.dryRun) setRev((x) => x + 1);
        }} />
    </Box>
  );
}
