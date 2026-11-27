import { Box, Button, Card, CardContent, MenuItem, TextField, Typography } from "@mui/material";
import { useState } from "react";
import EduResourcePage from "../EduResourcePage";
import { eduApi, qsOf } from "../../services/EduApi";
import { Async, Bars, Light, Panel, Stat, StatGrid, SubNav, Tag, fmtDate, itemsOf, label, num, useApi, useToast } from "../infraestrutura/kit";
import ListTable from "../infraestrutura/ListTable";

const TIPOS = ["EBOOK", "PERIODICO", "BASE_DADOS", "VIDEO", "OUTRO"];
const ACESSOS = ["ASSINATURA_INSTITUCIONAL", "URL_PESSOAL", "ACESSO_LIVRE"];

function Catalogo() {
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("");
  const st = useApi<any>(`/biblioteca/virtual/catalogo${qsOf({ q, tipo })}`);
  const toast = useToast();
  async function abrir(r: any) {
    await toast.run(async () => { const x = await eduApi.post(`/biblioteca/virtual/recursos/${r.id}/acessar`, {}); if (x?.url) window.open(x.url, "_blank", "noopener"); }, "Acesso registrado. Abrindo o recurso…");
  }
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
        <TextField size="small" placeholder="Buscar no catálogo virtual…" value={q} onChange={(e) => setQ(e.target.value)} sx={{ minWidth: 280 }} />
        <TextField select size="small" label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} sx={{ minWidth: 170 }}>
          <MenuItem value="">Todos os tipos</MenuItem>{TIPOS.map((t) => <MenuItem key={t} value={t}>{label(t)}</MenuItem>)}
        </TextField>
      </Box>
      <Async state={st}>
        {(d) => (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 2 }}>
            {itemsOf(d).map((r: any) => (
              <Card key={r.id} variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent sx={{ display: "grid", gap: 1 }}>
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}><Tag text={label(r.tipo)} tone="info" /><Tag text={label(r.tipoAcesso)} /></Box>
                  <Typography sx={{ fontWeight: 800 }}>{r.titulo}</Typography>
                  {r.autores && <Typography variant="body2" color="text.secondary">{r.autores}</Typography>}
                  {r.provedor && <Typography variant="caption" color="text.secondary">Provedor: {r.provedor}</Typography>}
                  {r.permitido ? <Button variant="contained" size="small" onClick={() => abrir(r)}>Acessar</Button> : <Light tone="warning" text={r.motivo || "Acesso não liberado"} />}
                </CardContent>
              </Card>
            ))}
            {!itemsOf(d).length && <Typography color="text.secondary">Nenhum recurso encontrado.</Typography>}
          </Box>
        )}
      </Async>
      {toast.node}
    </Box>
  );
}

function Uso() {
  const st = useApi<any>("/biblioteca/relatorios/virtual-uso");
  return (
    <Async state={st}>
      {(d) => (
        <Box sx={{ display: "grid", gap: 2 }}>
          <StatGrid min={150}><Stat label="Acessos (12 meses)" value={num(d.totalAcessos, 0)} /><Stat label="Usuários distintos" value={num(d.usuariosDistintos, 0)} /><Stat label="Recursos sem uso" value={num(d.recursosSemUsoNoTopN, 0)} tone={d.recursosSemUsoNoTopN ? "warning" : "success"} /></StatGrid>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            <Panel title="Recursos mais acessados"><Bars items={(d.ranking || []).slice(0, 10).map((r: any) => ({ label: r.titulo || r.recursoId, value: r.acessos }))} /></Panel>
            <Panel title="Acessos por provedor"><Bars items={Object.entries(d.porProvedor || {}).map(([k, v]: any) => ({ label: k, value: v, color: "#7b1fa2" }))} /></Panel>
          </Box>
        </Box>
      )}
    </Async>
  );
}

export default function VirtualTab() {
  const [sub, setSub] = useState("catalogo");
  return (
    <Box>
      <SubNav value={sub} onChange={setSub} items={[{ key: "catalogo", label: "Catálogo" }, { key: "recursos", label: "Gerir recursos" }, { key: "provedores", label: "Provedores" }, { key: "uso", label: "Uso" }]} />
      {sub === "catalogo" && <Catalogo />}
      {sub === "recursos" && (
        <EduResourcePage title="Recursos da biblioteca virtual" base="/biblioteca" resource="/virtual/recursos" dense filters={[{ key: "tipo", label: "Tipo", options: TIPOS }, { key: "tipoAcesso", label: "Acesso", options: ACESSOS }]}
          columns={[{ key: "titulo", label: "Título" }, { key: "tipo", label: "Tipo", render: (r) => label(r.tipo) }, { key: "provedor", label: "Provedor" }, { key: "tipoAcesso", label: "Acesso", render: (r) => label(r.tipoAcesso) }, { key: "vigenciaFim", label: "Vigência até", render: (r) => fmtDate(r.vigenciaFim) }, { key: "ativo", label: "Ativo" }]}
          fields={[{ key: "titulo", label: "Título", required: true }, { key: "tipo", label: "Tipo", type: "select", options: TIPOS }, { key: "autores", label: "Autores" }, { key: "provedor", label: "Provedor" }, { key: "url", label: "URL de acesso", required: true },
            { key: "tipoAcesso", label: "Tipo de acesso", type: "select", options: ACESSOS }, { key: "libraryProviderId", label: "ID do provedor (módulo conteúdo)" }, { key: "obraId", label: "ID da obra física equivalente" }, { key: "isbn", label: "ISBN" }, { key: "issn", label: "ISSN" },
            { key: "assuntos", label: "Assuntos" }, { key: "vigenciaFim", label: "Fim da assinatura", type: "date" }, { key: "descricao", label: "Descrição", type: "textarea" }, { key: "ativo", label: "Ativo", type: "bool" }]} />
      )}
      {sub === "provedores" && (
        <ListTable path="/biblioteca/virtual/provedores" searchable={false}
          columns={[{ key: "nome", label: "Provedor" }, { key: "tipoAcesso", label: "Acesso", render: (r) => label(r.tipoAcesso) }, { key: "ativo", label: "Situação", render: (r) => <Light tone={r.ativo ? "success" : "default"} text={r.ativo ? "Ativo" : "Inativo"} /> }, { key: "alunosAtivos", label: "Alunos com acesso", align: "right" }, { key: "recursosCatalogados", label: "Recursos catalogados", align: "right" }]} />
      )}
      {sub === "uso" && <Uso />}
    </Box>
  );
}
