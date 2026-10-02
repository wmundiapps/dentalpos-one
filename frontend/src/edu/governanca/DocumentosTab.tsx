import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { StatusChip } from "../EduResourcePage";
import { fmtDate, label, Section, Status, toIso, useApi, useToast } from "../regulatorio/ui";
import { toArr, usePrograms } from "./shared";

const TIPOS = ["REGIMENTO", "ESTATUTO", "PPI", "PPC", "POLITICA", "MANUAL", "OUTRO"];

function Versoes({ doc, onClose, onChanged }: { doc: any; onClose: () => void; onChanged: () => void }) {
  const { data, loading, error, reload } = useApi<any>(`/governanca/documentos/${doc.id}/versoes`);
  const items = toArr(data);
  const [nova, setNova] = useState<Record<string, string> | null>(null);
  const [pub, setPub] = useState<any | null>(null);
  const [pf, setPf] = useState<Record<string, string>>({});
  const [cmp, setCmp] = useState<{ de: string; para: string }>({ de: "", para: "" });
  const [diff, setDiff] = useState<any>(null);
  const [ver, setVer] = useState<any>(null);
  const { toast, node } = useToast();
  const done = (m: string) => { toast({ type: "success", text: m }); reload(); onChanged(); };

  async function criar() {
    try {
      const body: any = { resumoAlteracoes: nova!.resumo || undefined };
      if (nova!.html) body.conteudoHtml = nova!.html;
      if (nova!.url) body.arquivoUrl = nova!.url;
      if (nova!.base) body.baseadoEmVersao = Number(nova!.base);
      await eduApi.post(`/governanca/documentos/${doc.id}/versoes`, body); setNova(null); done("Versão criada em rascunho.");
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function publicar() {
    try { await eduApi.post(`/governanca/documentos-versoes/${pub.id}/publicar`, { vigenciaInicio: pf.ini ? toIso(pf.ini) : undefined, vigenciaFim: pf.fim ? toIso(pf.fim) : undefined, deliberacaoId: pf.delib || undefined }); setPub(null); setPf({}); done("Versão publicada."); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function revogar(v: any) {
    if (!window.confirm(`Revogar a versão ${v.versao}?`)) return;
    try { await eduApi.post(`/governanca/documentos-versoes/${v.id}/revogar`, {}); done("Versão revogada."); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function comparar() {
    try { setDiff(await eduApi.get(`/governanca/documentos/${doc.id}/comparar?de=${cmp.de}&para=${cmp.para}`)); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function abrir(v: any) { try { setVer(await eduApi.get(`/governanca/documentos-versoes/${v.id}`)); } catch (e: any) { toast({ type: "error", text: e.message }); } }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{doc.titulo} — versões</DialogTitle>
      <DialogContent dividers>
        <Button size="small" startIcon={<AddIcon />} onClick={() => setNova({})} sx={{ mb: 1 }}>Nova versão</Button>
        <Status loading={loading && !data} error={error} onRetry={reload} empty={!items.length} emptyText="Nenhuma versão.">
          <Table size="small">
            <TableHead><TableRow><TableCell>Versão</TableCell><TableCell>Status</TableCell><TableCell>Vigência</TableCell><TableCell>Alterações</TableCell><TableCell align="right" /></TableRow></TableHead>
            <TableBody>
              {items.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>v{v.versao}</TableCell><TableCell><StatusChip value={v.status} /></TableCell>
                  <TableCell>{fmtDate(v.vigenciaInicio)} → {v.vigenciaFim ? fmtDate(v.vigenciaFim) : "indeterminada"}</TableCell>
                  <TableCell>{v.resumoAlteracoes || "—"}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    <Button size="small" onClick={() => abrir(v)}>Ver</Button>
                    {v.status === "RASCUNHO" && <Button size="small" color="success" onClick={() => setPub(v)}>Publicar</Button>}
                    {v.status === "VIGENTE" && <Button size="small" color="error" onClick={() => revogar(v)}>Revogar</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {items.length > 1 && (
            <Box sx={{ display: "flex", gap: 1, mt: 2, alignItems: "center", flexWrap: "wrap" }}>
              <Typography variant="body2">Comparar:</Typography>
              {(["de", "para"] as const).map((k) => (
                <TextField key={k} select size="small" label={k === "de" ? "De" : "Para"} value={cmp[k]} onChange={(e) => setCmp({ ...cmp, [k]: e.target.value })} sx={{ minWidth: 90 }}>
                  {items.map((v) => <MenuItem key={v.id} value={String(v.versao)}>v{v.versao}</MenuItem>)}
                </TextField>
              ))}
              <Button size="small" variant="outlined" disabled={!cmp.de || !cmp.para} onClick={comparar}>Comparar</Button>
            </Box>
          )}
        </Status>
        {diff && (
          <Paper variant="outlined" sx={{ p: 1.5, mt: 1.5, maxHeight: 280, overflow: "auto", fontFamily: "monospace", fontSize: 12 }}>
            <Typography variant="caption" sx={{ fontWeight: 800 }}>v{diff.de} → v{diff.para}</Typography>
            <Typography variant="caption" sx={{ display: "block" }}>{(diff.adicionadas || []).length} adicionada(s), {(diff.removidas || []).length} removida(s), {diff.inalteradas ?? 0} inalterada(s)</Typography>
            {(diff.removidas || []).map((l: string, i: number) => <Box key={`r${i}`} sx={{ bgcolor: "#dc262622", whiteSpace: "pre-wrap" }}>- {l}</Box>)}
            {(diff.adicionadas || []).map((l: string, i: number) => <Box key={`a${i}`} sx={{ bgcolor: "#16a34a22", whiteSpace: "pre-wrap" }}>+ {l}</Box>)}
          </Paper>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>

      <Dialog open={!!nova} onClose={() => setNova(null)} fullWidth maxWidth="md">
        <DialogTitle>Nova versão (rascunho)</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
          <TextField size="small" label="Resumo das alterações" value={nova?.resumo || ""} onChange={(e) => setNova({ ...nova, resumo: e.target.value })} />
          <TextField size="small" select label="Basear em versão anterior (copia o conteúdo)" value={nova?.base || ""} onChange={(e) => setNova({ ...nova, base: e.target.value })}>
            <MenuItem value="">—</MenuItem>{items.map((v) => <MenuItem key={v.id} value={String(v.versao)}>v{v.versao}</MenuItem>)}
          </TextField>
          <TextField size="small" multiline minRows={8} label="Conteúdo (HTML ou texto)" value={nova?.html || ""} onChange={(e) => setNova({ ...nova, html: e.target.value })} />
          <TextField size="small" label="URL do arquivo (opcional)" value={nova?.url || ""} onChange={(e) => setNova({ ...nova, url: e.target.value })} />
        </DialogContent>
        <DialogActions><Button onClick={() => setNova(null)}>Cancelar</Button><Button variant="contained" disabled={!nova?.html && !nova?.url && !nova?.base} onClick={criar}>Criar versão</Button></DialogActions>
      </Dialog>
      <Dialog open={!!pub} onClose={() => setPub(null)} fullWidth maxWidth="sm">
        <DialogTitle>Publicar v{pub?.versao}</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
          <Typography variant="body2">A versão vigente atual (se houver) será marcada como substituída.</Typography>
          <TextField size="small" type="date" label="Início da vigência (padrão: hoje)" value={pf.ini || ""} onChange={(e) => setPf({ ...pf, ini: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="date" label="Fim da vigência (opcional)" value={pf.fim || ""} onChange={(e) => setPf({ ...pf, fim: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" label="ID da deliberação aprovada (opcional)" value={pf.delib || ""} onChange={(e) => setPf({ ...pf, delib: e.target.value })} />
        </DialogContent>
        <DialogActions><Button onClick={() => setPub(null)}>Cancelar</Button><Button variant="contained" onClick={publicar}>Publicar</Button></DialogActions>
      </Dialog>
      <Dialog open={!!ver} onClose={() => setVer(null)} fullWidth maxWidth="md">
        <DialogTitle>v{ver?.versao} — {ver?.documento?.titulo}</DialogTitle>
        <DialogContent dividers>
          {ver?.arquivoUrl && <Typography variant="body2" sx={{ mb: 1 }}>Arquivo: <a href={ver.arquivoUrl} target="_blank" rel="noreferrer">{ver.arquivoUrl}</a></Typography>}
          <Box sx={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{(ver?.conteudoHtml || "").replace(/<[^>]+>/g, " ") || "Sem conteúdo textual."}</Box>
        </DialogContent>
        <DialogActions><Button onClick={() => setVer(null)}>Fechar</Button></DialogActions>
      </Dialog>
      {node}
    </Dialog>
  );
}

export default function DocumentosTab() {
  const [tipo, setTipo] = useState("");
  const { data, loading, error, reload } = useApi<any>(`/governanca/documentos?pageSize=100${tipo ? `&tipo=${tipo}` : ""}`);
  const progs = usePrograms();
  const [novo, setNovo] = useState<Record<string, string> | null>(null);
  const [sel, setSel] = useState<any | null>(null);
  const { toast, node } = useToast();
  const items = toArr(data);

  async function criar() {
    try { await eduApi.post("/governanca/documentos", { tipo: novo!.tipo, titulo: novo!.titulo, codigo: novo!.codigo || undefined, programId: novo!.programId || undefined, descricao: novo!.descricao || undefined }); setNovo(null); toast({ type: "success", text: "Documento criado." }); reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function remover(d: any) {
    if (!window.confirm(`Remover o documento "${d.titulo}" e suas versões?`)) return;
    try { await eduApi.del(`/governanca/documentos/${d.id}`); reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Section title="Documentos institucionais e PPCs" action={<>
      <TextField select size="small" label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} sx={{ minWidth: 150 }}><MenuItem value="">Todos</MenuItem>{TIPOS.map((t) => <MenuItem key={t} value={t}>{label(t)}</MenuItem>)}</TextField>
      <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo({ tipo: "PPC" })}>Novo documento</Button></>}>
      <Status loading={loading && !data} error={error} onRetry={reload} empty={!items.length} emptyText="Nenhum documento cadastrado.">
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Título</TableCell><TableCell>Tipo</TableCell><TableCell>Curso</TableCell><TableCell>Versão vigente</TableCell><TableCell align="right" /></TableRow></TableHead>
            <TableBody>
              {items.map((d) => {
                const vig = (d.versoes || []).find((v: any) => v.status === "VIGENTE");
                return (
                  <TableRow key={d.id} hover>
                    <TableCell><b>{d.titulo}</b>{d.codigo ? <Typography variant="caption" color="text.secondary"> · {d.codigo}</Typography> : null}</TableCell>
                    <TableCell>{label(d.tipo)}</TableCell>
                    <TableCell>{progs.find((p) => p.value === d.programId)?.label || "—"}</TableCell>
                    <TableCell>{vig ? <Chip size="small" color="success" label={`v${vig.versao} desde ${fmtDate(vig.vigenciaInicio)}`} /> : <Chip size="small" label="Sem versão vigente" />}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}><Button size="small" onClick={() => setSel(d)}>Versões ({(d.versoes || []).length})</Button><Button size="small" color="error" onClick={() => remover(d)}>Remover</Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      </Status>
      {sel && <Versoes doc={sel} onClose={() => setSel(null)} onChanged={reload} />}
      <Dialog open={!!novo} onClose={() => setNovo(null)} fullWidth maxWidth="sm">
        <DialogTitle>Novo documento</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
          <TextField size="small" select required label="Tipo" value={novo?.tipo || ""} onChange={(e) => setNovo({ ...novo, tipo: e.target.value })}>{TIPOS.map((t) => <MenuItem key={t} value={t}>{label(t)}</MenuItem>)}</TextField>
          <TextField size="small" required label="Título" value={novo?.titulo || ""} onChange={(e) => setNovo({ ...novo, titulo: e.target.value })} />
          <TextField size="small" label="Código" value={novo?.codigo || ""} onChange={(e) => setNovo({ ...novo, codigo: e.target.value })} />
          <TextField size="small" select label={novo?.tipo === "PPC" ? "Curso (obrigatório para PPC)" : "Curso"} value={novo?.programId || ""} onChange={(e) => setNovo({ ...novo, programId: e.target.value })}><MenuItem value="">—</MenuItem>{progs.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}</TextField>
          <TextField size="small" multiline minRows={2} label="Descrição" value={novo?.descricao || ""} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} />
        </DialogContent>
        <DialogActions><Button onClick={() => setNovo(null)}>Cancelar</Button><Button variant="contained" disabled={!novo?.titulo || !novo?.tipo} onClick={criar}>Criar</Button></DialogActions>
      </Dialog>
      {node}
    </Section>
  );
}
