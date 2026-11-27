import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Paper, TextField, Tooltip, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import AddAPhotoIcon from "@mui/icons-material/AddAPhoto";
import { useRef, useState } from "react";
import { eduApi } from "../../services/EduApi";
import { Async, Tag, useApi, useToast } from "./kit";
import { reduzirImagem, useBlobUrl } from "./cppKit";

function Miniatura({ f, onPrincipal, onExcluir, onLegenda, podeEditar }: { f: any; onPrincipal: () => void; onExcluir: () => void; onLegenda: (v: string) => void; podeEditar: boolean }) {
  const url = useBlobUrl(f.url.replace("/api", ""));
  const [leg, setLeg] = useState(f.legenda || "");
  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
      <Box sx={{ position: "relative", bgcolor: "action.hover", aspectRatio: "4 / 3", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {url ? <Box component="img" src={url} alt={f.legenda || f.nome} sx={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Typography variant="caption">Carregando…</Typography>}
        {f.principal && <Box sx={{ position: "absolute", top: 6, left: 6 }}><Tag text="Principal" tone="success" /></Box>}
      </Box>
      <Box sx={{ p: 1, display: "flex", gap: 0.5, alignItems: "center" }}>
        <TextField size="small" variant="standard" placeholder="Legenda" value={leg} onChange={(e) => setLeg(e.target.value)} onBlur={() => leg !== (f.legenda || "") && onLegenda(leg)} disabled={!podeEditar} sx={{ flex: 1 }} />
        {podeEditar && (
          <>
            <Tooltip title="Definir como principal"><span><IconButton size="small" disabled={f.principal} onClick={onPrincipal}>{f.principal ? <StarIcon color="warning" fontSize="small" /> : <StarBorderIcon fontSize="small" />}</IconButton></span></Tooltip>
            <Tooltip title="Excluir"><IconButton size="small" color="error" onClick={onExcluir}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
          </>
        )}
      </Box>
    </Paper>
  );
}

export default function GaleriaFotos({ bemId, titulo, onClose, podeEditar = true }: { bemId: string; titulo: string; onClose: () => void; podeEditar?: boolean }) {
  const st = useApi<any>(`/infraestrutura/bens/${bemId}/fotos`);
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(files: FileList | null) {
    if (!files?.length) return;
    setEnviando(true);
    try {
      for (const f of Array.from(files)) {
        const dataUrl = await reduzirImagem(f);
        await eduApi.post(`/infraestrutura/bens/${bemId}/fotos`, { nome: f.name.replace(/\.\w+$/, "") + ".jpg", dataUrl });
      }
      toast.ok("Foto(s) enviada(s) e verificadas pela segurança.");
      st.reload();
    } catch (e: any) { toast.err(e?.message || "Falha no envio."); } finally { setEnviando(false); if (input.current) input.current.value = ""; }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Fotos — {titulo}</DialogTitle>
      <DialogContent dividers>
        <Async state={st}>
          {(d) => (
            <Box sx={{ display: "grid", gap: 2 }}>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>{d.total} de {d.limite} fotos. As imagens são reduzidas no aparelho antes do envio e passam pela varredura de segurança.</Typography>
                {podeEditar && (
                  <>
                    <input ref={input} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => enviar(e.target.files)} />
                    <Button variant="contained" startIcon={<AddAPhotoIcon />} disabled={enviando || d.total >= d.limite} onClick={() => input.current?.click()}>{enviando ? "Enviando…" : "Adicionar fotos"}</Button>
                  </>
                )}
              </Box>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)" }, gap: 1.5 }}>
                {d.items.map((f: any) => (
                  <Miniatura key={f.id} f={f} podeEditar={podeEditar}
                    onPrincipal={() => toast.run(() => eduApi.post(`/infraestrutura/fotos-bem/${f.id}/principal`, {}), "Foto principal definida.", st.reload)}
                    onExcluir={() => toast.run(() => eduApi.del(`/infraestrutura/fotos-bem/${f.id}`), "Foto excluída.", st.reload, "Excluir esta foto?")}
                    onLegenda={(v) => toast.run(() => eduApi.patch(`/infraestrutura/fotos-bem/${f.id}`, { legenda: v }), "", st.reload)} />
                ))}
              </Box>
              {!d.items.length && <Typography color="text.secondary" sx={{ textAlign: "center", py: 3 }}>Nenhuma foto cadastrada.</Typography>}
            </Box>
          )}
        </Async>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      {toast.node}
    </Dialog>
  );
}
