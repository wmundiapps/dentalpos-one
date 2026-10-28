import { useEffect, useRef, useState } from "react";
import { Alert, Avatar, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import { loadBrandKit, prepareLogo, saveBrandKit, saveClinicIdentity, type BrandKitData } from "../services/BrandKitApi";

const blank = { displayName: "", cnpj: "", phone: "", email: "", address: "", city: "", state: "", zipCode: "", logo: "", rtName: "", rtCro: "", tagline: "", whatsapp: "", site: "", instagram: "" };

// Dados da clínica que saem no cabeçalho (timbre) de todos os documentos: logo, contatos e responsável técnico.
export default function ClinicLetterheadDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: () => void }) {
  const [f, setF] = useState(blank);
  const [kit, setKit] = useState<BrandKitData>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => setF((v) => ({ ...v, [k]: e.target.value }));

  useEffect(() => {
    if (!open) return;
    setError("");
    loadBrandKit().then((r) => {
      const c = r.clinic; const k = r.kit || {};
      setKit(k);
      setF({ displayName: c.displayName || c.name || "", cnpj: c.cnpj || "", phone: c.phone || "", email: c.email || "", address: c.address || "", city: c.city || "", state: c.state || "", zipCode: c.zipCode || "", logo: c.logo || "", rtName: k.rtName || "", rtCro: k.rtCro || "", tagline: k.tagline || "", whatsapp: k.whatsapp || "", site: k.site || "", instagram: k.instagram || "" });
    }).catch((e) => setError(e instanceof Error ? e.message : "Não foi possível carregar os dados."));
  }, [open]);

  const pickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0]; e.target.value = "";
    if (!picked) return;
    try { setF((v) => ({ ...v, logo: "" })); const logo = await prepareLogo(picked); setF((v) => ({ ...v, logo })); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Imagem inválida."); }
  };

  const save = async () => {
    setBusy(true); setError("");
    try {
      await saveClinicIdentity({ displayName: f.displayName, cnpj: f.cnpj, phone: f.phone, email: f.email, address: f.address, city: f.city, state: f.state, zipCode: f.zipCode, logo: f.logo || null });
      await saveBrandKit({ ...kit, rtName: f.rtName, rtCro: f.rtCro, tagline: f.tagline, whatsapp: f.whatsapp, site: f.site, instagram: f.instagram });
      onSaved?.(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 900 }}>Dados da clínica no documento</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
        <Typography variant="body2" color="text.secondary">Estes dados formam o cabeçalho de receitas, atestados, termos e contratos. Envie a logo e preencha o que quiser que apareça; o que ficar em branco não é impresso.</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Avatar variant="rounded" src={f.logo || undefined} sx={{ width: 88, height: 88, bgcolor: "action.hover", color: "text.secondary" }}>{(f.displayName || "?").charAt(0)}</Avatar>
          <Box>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden onChange={(e) => void pickLogo(e)} />
            <Button variant="outlined" onClick={() => file.current?.click()}>{f.logo ? "Trocar logo" : "Anexar logo"}</Button>
            {f.logo && <Button color="error" onClick={() => setF((v) => ({ ...v, logo: "" }))}>Remover</Button>}
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>PNG, JPG ou SVG, até 5 MB. Fundo transparente fica melhor.</Typography>
          </Box>
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
          <TextField label="Nome da clínica" value={f.displayName} onChange={set("displayName")} />
          <TextField label="Frase / especialidade (opcional)" value={f.tagline} onChange={set("tagline")} />
          <TextField label="CNPJ" value={f.cnpj} onChange={set("cnpj")} />
          <TextField label="Telefone" value={f.phone} onChange={set("phone")} />
          <TextField label="WhatsApp" value={f.whatsapp} onChange={set("whatsapp")} />
          <TextField label="E-mail" value={f.email} onChange={set("email")} />
          <TextField label="Endereço" value={f.address} onChange={set("address")} sx={{ gridColumn: { md: "1 / -1" } }} />
          <TextField label="Cidade" value={f.city} onChange={set("city")} />
          <TextField label="UF" value={f.state} onChange={set("state")} />
          <TextField label="CEP" value={f.zipCode} onChange={set("zipCode")} />
          <TextField label="Site" value={f.site} onChange={set("site")} />
          <TextField label="Instagram" value={f.instagram} onChange={set("instagram")} />
          <TextField label="Responsável técnico" value={f.rtName} onChange={set("rtName")} />
          <TextField label="CRO do responsável" value={f.rtCro} onChange={set("rtCro")} />
        </Box>
      </DialogContent>
      <DialogActions><Button disabled={busy} onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={busy} onClick={() => void save()}>{busy ? "Salvando..." : "Salvar dados"}</Button></DialogActions>
    </Dialog>
  );
}
