import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { useState } from "react";
import { StatusChip } from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { Async, Bars, FormDialog, Panel, Stat, StatGrid, Tag, fetchText, fmtDate, label, num, openBlob, openHtml, useApi, usePrograms, useToast, type Field } from "../infraestrutura/kit";

const TIPOS = ["TCC", "DISSERTACAO", "TESE", "ARTIGO", "NORMA", "MATERIAL_DIDATICO", "RELATORIO", "OUTRO"];
const STATUS = ["RASCUNHO", "EM_REVISAO", "PUBLICADO", "RETIRADO"];
const FLUXO = ["RASCUNHO", "EM_REVISAO", "PUBLICADO"];

function Detalhe({ id, onClose }: { id: string; onClose: () => void }) {
  const st = useApi<any>(`/biblioteca/repositorio/${id}`);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Item do repositório</DialogTitle>
      <DialogContent dividers>
        <Async state={st}>
          {(i) => (
            <Box sx={{ display: "grid", gap: 2 }}>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}><Typography variant="h6" sx={{ fontWeight: 800 }}>{i.titulo}</Typography><StatusChip value={i.status} /><Tag text={label(i.tipo)} /><Tag text={`Acesso ${label(i.acesso)}`} tone={i.acesso === "ABERTO" ? "success" : "warning"} /></Box>
              <Typography variant="body2" color="text.secondary">Handle: {i.handle} · {(i.criadores || []).join("; ") || "sem autor"}{i.orientador ? ` · orientador(a) ${i.orientador}` : ""}</Typography>
              <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
                {FLUXO.map((f, idx) => <Tag key={f} text={`${idx + 1}. ${label(f)}`} tone={FLUXO.indexOf(i.status) >= idx ? "success" : "default"} />)}
              </Box>
              <StatGrid min={130}><Stat label="Visualizações" value={num(i.visualizacoes, 0)} /><Stat label="Downloads" value={num(i.downloads, 0)} /><Stat label="Publicação" value={fmtDate(i.dataPublicacao)} /><Stat label="Embargo até" value={fmtDate(i.embargoAte)} /></StatGrid>
              {i.descricao && <Typography variant="body2">{i.descricao}</Typography>}
              {i.status !== "PUBLICADO" && (
                <Panel title="Checklist de publicação (Dublin Core)" sx={{ p: 2 }}>
                  {(i.pendenciasPublicacao || []).length ? (i.pendenciasPublicacao as string[]).map((p) => <Typography key={p} variant="body2" color="error">☐ {p}</Typography>) : <Typography variant="body2" color="success.main"><CheckCircleIcon fontSize="inherit" /> Metadados completos: pronto para publicar.</Typography>}
                </Panel>
              )}
              {i.motivoDevolucao && <Alert severity="warning">Devolvido: {i.motivoDevolucao}</Alert>}
            </Box>
          )}
        </Async>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

export default function RepositorioTab() {
  const [key, setKey] = useState(0);
  const [dlg, setDlg] = useState<{ kind: "novo" | "editar" | "devolver" | "retirar"; row?: any } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [arq, setArq] = useState<{ dataUrl: string; nome: string } | null>(null);
  const programs = usePrograms();
  const rel = useApi<any>("/biblioteca/relatorios/repositorio");
  const toast = useToast();
  const reload = () => { setKey((k) => k + 1); rel.reload(); };

  const campos: Field[] = [
    { key: "tipo", label: "Tipo", type: "select", options: TIPOS, def: "TCC" }, { key: "titulo", label: "Título", required: true, full: true }, { key: "criadores", label: "Autores (separe por vírgula)", type: "list" },
    { key: "orientador", label: "Orientador(a)" }, { key: "coorientador", label: "Coorientador(a)" }, { key: "banca", label: "Banca (separe por vírgula)", type: "list" }, { key: "assuntos", label: "Palavras-chave (separe por vírgula)", type: "list" },
    { key: "programId", label: "Curso", type: "select", options: programs }, { key: "idioma", label: "Idioma", def: "pt-BR" }, { key: "paginas", label: "Páginas", type: "number" }, { key: "dataPublicacao", label: "Data de defesa/publicação", type: "date" },
    { key: "descricao", label: "Resumo (mín. 20 caracteres para publicar)", type: "textarea" }, { key: "abstractEn", label: "Abstract", type: "textarea" }, { key: "licenca", label: "Licença (ex.: CC BY-NC 4.0)" }, { key: "direitos", label: "Direitos" },
    { key: "arquivoUrl", label: "URL do arquivo (alternativa ao envio)" }, { key: "embargoAte", label: "Embargo até", type: "date" }, { key: "restrito", label: "Acesso restrito à comunidade", type: "bool" },
  ];
  async function editar(r: any) {
    await toast.run(async () => { const full = await eduApi.get(`/biblioteca/repositorio/${r.id}`); setArq(null); setDlg({ kind: "editar", row: full }); }, "");
  }
  function lerArquivo(f: File | undefined) {
    if (!f) return;
    if (f.size > 9 * 1024 * 1024) { toast.err("O arquivo deve ter no máximo ~9 MB (limite de 12 MB após codificação)."); return; }
    const rd = new FileReader();
    rd.onload = () => setArq({ dataUrl: String(rd.result), nome: f.name });
    rd.readAsDataURL(f);
  }
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Async state={rel}>
        {(d) => {
          const por: Record<string, number> = {};
          for (const x of d.porTipoStatus || []) por[x.status] = (por[x.status] || 0) + x.total;
          return (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              <Panel title="Fluxo do repositório"><Bars items={STATUS.map((s) => ({ label: label(s), value: por[s] || 0, color: s === "PUBLICADO" ? "#2e7d32" : s === "EM_REVISAO" ? "#ed6c02" : s === "RETIRADO" ? "#9e9e9e" : "#0288d1" }))} /></Panel>
              <Panel title="Mais baixados"><Bars items={(d.maisBaixados || []).slice(0, 6).map((i: any) => ({ label: i.titulo, value: i.downloads, hint: `${i.visualizacoes} visualização(ões)`, color: "#7b1fa2" }))} empty="Nenhum download registrado." /></Panel>
            </Box>
          );
        }}
      </Async>
      <ListTable path="/biblioteca/repositorio" refreshKey={key}
        filters={[{ key: "status", label: "Situação", options: STATUS }, { key: "tipo", label: "Tipo", options: TIPOS }]}
        toolbar={<Button variant="contained" startIcon={<AddIcon />} onClick={() => { setArq(null); setDlg({ kind: "novo" }); }}>Novo item</Button>}
        columns={[
          { key: "titulo", label: "Título" }, { key: "tipo", label: "Tipo", render: (r) => <Tag text={label(r.tipo)} /> }, { key: "criadores", label: "Autores", render: (r) => (r.criadores || []).join("; ") || "—" }, { key: "orientador", label: "Orientador(a)" },
          { key: "downloads", label: "Downloads", align: "right" }, { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> },
        ]}
        actions={(r, rl) => (
          <>
            <Button size="small" onClick={() => setOpen(r.id)}>Abrir</Button>
            {["RASCUNHO", "EM_REVISAO", "PUBLICADO"].includes(r.status) && <Button size="small" onClick={() => editar(r)}>Editar</Button>}
            {r.status === "RASCUNHO" && <Button size="small" onClick={() => toast.run(() => eduApi.post(`/biblioteca/repositorio/${r.id}/enviar-revisao`, {}), "Enviado para revisão da biblioteca.", rl)}>Enviar p/ revisão</Button>}
            {r.status === "EM_REVISAO" && <Button size="small" color="warning" onClick={() => setDlg({ kind: "devolver", row: r })}>Devolver</Button>}
            {["EM_REVISAO", "RASCUNHO"].includes(r.status) && <Button size="small" color="success" onClick={() => toast.run(() => eduApi.post(`/biblioteca/repositorio/${r.id}/publicar`, {}), "Item publicado.", () => { rl(); reload(); }, "Publicar este item? Ele ficará visível conforme o acesso definido.")}>Publicar</Button>}
            {r.status === "PUBLICADO" && <Button size="small" color="error" onClick={() => setDlg({ kind: "retirar", row: r })}>Retirar</Button>}
            <Button size="small" onClick={() => toast.run(() => openHtml(`/biblioteca/repositorio/${r.id}/ficha-catalografica`), "Ficha aberta em nova aba.")}>Ficha</Button>
            <Button size="small" onClick={() => toast.run(async () => setXml(await fetchText(`/biblioteca/repositorio/${r.id}/dublin-core`)), "")}>Dublin Core</Button>
            <Button size="small" onClick={() => toast.run(() => openBlob(`/biblioteca/repositorio/${r.id}/arquivo`), "Arquivo aberto em nova aba.")}>Arquivo</Button>
          </>
        )} />
      <FormDialog open={!!dlg} onClose={() => setDlg(null)} initial={dlg?.kind === "editar" ? dlg.row : null}
        title={dlg ? { novo: "Novo item do repositório", editar: "Editar item", devolver: "Devolver ao autor", retirar: "Retirar do repositório" }[dlg.kind] : ""}
        fields={dlg && ["devolver", "retirar"].includes(dlg.kind) ? [{ key: "motivo", label: "Motivo (mín. 5 caracteres)", type: "textarea", required: true }] : campos}
        intro={dlg && ["novo", "editar"].includes(dlg.kind) ? (
          <Box sx={{ mb: 2, p: 1.5, borderRadius: 2, bgcolor: "action.hover" }}>
            <Button component="label" size="small" variant="outlined">Anexar arquivo (PDF)<input hidden type="file" accept=".pdf,application/pdf,.doc,.docx" onChange={(e) => lerArquivo(e.target.files?.[0])} /></Button>
            <Typography variant="caption" sx={{ ml: 1 }}>{arq ? arq.nome : "Nenhum arquivo selecionado"}</Typography>
          </Box>
        ) : undefined}
        onSubmit={async (b) => {
          const k = dlg!.kind, r = dlg!.row;
          if (k === "novo" || k === "editar") {
            const body = { ...b, ...(arq ? { arquivoDataUrl: arq.dataUrl, arquivoNome: arq.nome } : {}) };
            if (k === "novo") await eduApi.post("/biblioteca/repositorio", body); else await eduApi.put(`/biblioteca/repositorio/${r.id}`, body);
          } else await eduApi.post(`/biblioteca/repositorio/${r.id}/${k === "devolver" ? "devolver" : "retirar"}`, b);
          toast.ok("Operação concluída."); reload();
        }} />
      {open && <Detalhe id={open} onClose={() => setOpen(null)} />}
      <Dialog open={xml !== null} onClose={() => setXml(null)} fullWidth maxWidth="md">
        <DialogTitle sx={{ fontWeight: 800 }}>Metadados Dublin Core (XML)</DialogTitle>
        <DialogContent dividers><Box component="pre" sx={{ m: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{xml}</Box></DialogContent>
        <DialogActions><Button onClick={() => navigator.clipboard?.writeText(xml || "")}>Copiar</Button><Button onClick={() => setXml(null)}>Fechar</Button></DialogActions>
      </Dialog>
      {toast.node}
    </Box>
  );
}
