import { useCallback, useEffect, useState } from "react";
import { Box, Button, ButtonGroup, Divider, IconButton, Paper, Switch, Typography } from "@mui/material";
import AccessibilityNewIcon from "@mui/icons-material/AccessibilityNew";
import CloseIcon from "@mui/icons-material/Close";

// Acessibilidade: barra própria (tamanho do texto, contraste, cinza, sublinhar links, espaçamento) e tradutor de Libras (VLibras, do governo).
// Nada é carregado de fora até a pessoa tocar em "Tradutor de Libras". A barra só muda classes no <html> e não mexe nas telas.
const STORAGE_KEY = "completodonto.a11y";
type Prefs = { font: 0 | 1 | 2 | 3; contrast: boolean; gray: boolean; links: boolean; spacing: boolean };
const DEFAULTS: Prefs = { font: 0, contrast: false, gray: false, links: false, spacing: false };

function readPrefs(): Prefs {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Partial<Prefs>) }; } catch { return DEFAULTS; }
}

function applyPrefs(p: Prefs) {
  const c = document.documentElement.classList;
  [1, 2, 3].forEach((n) => c.toggle(`a11y-font-${n}`, p.font === n));
  c.toggle("a11y-contrast", p.contrast);
  c.toggle("a11y-gray", p.gray);
  c.toggle("a11y-links", p.links);
  c.toggle("a11y-spacing", p.spacing);
}

const VLIBRAS_APP = "https://vlibras.gov.br/app";
let vlibrasLoading: Promise<void> | null = null;

function loadVLibras(): Promise<void> {
  if (vlibrasLoading) return vlibrasLoading;
  vlibrasLoading = new Promise<void>((resolve, reject) => {
    const host = document.createElement("div");
    host.setAttribute("vw", "");
    host.className = "enabled";
    host.innerHTML = '<div vw-access-button class="active"></div><div vw-plugin-wrapper><div class="vw-plugin-top-wrapper"></div></div>';
    document.body.appendChild(host);
    const script = document.createElement("script");
    script.src = `${VLIBRAS_APP}/vlibras-plugin.js`;
    script.async = true;
    script.onload = () => {
      try {
        const w = window as unknown as { VLibras?: { Widget: new (url: string) => unknown } };
        if (!w.VLibras) throw new Error("VLibras indisponível");
        new w.VLibras.Widget(VLIBRAS_APP);
        window.setTimeout(() => (document.querySelector("[vw-access-button]") as HTMLElement | null)?.click(), 800);
        resolve();
      } catch (e) { reject(e); }
    };
    script.onerror = () => reject(new Error("Não foi possível carregar o VLibras."));
    document.body.appendChild(script);
  });
  vlibrasLoading.catch(() => { vlibrasLoading = null; document.querySelector("[vw]")?.remove(); });
  return vlibrasLoading;
}

export default function AccessibilityTools() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const [libras, setLibras] = useState<"idle" | "loading" | "on" | "error">("idle");

  useEffect(() => { applyPrefs(prefs); try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* sem armazenamento */ } }, [prefs]);

  const update = useCallback((patch: Partial<Prefs>) => setPrefs((p) => ({ ...p, ...patch })), []);
  const startLibras = async () => {
    setLibras("loading");
    try { await loadVLibras(); setLibras("on"); } catch { setLibras("error"); }
  };

  return (
    <Box className="a11y-root" sx={{ position: "fixed", left: 12, bottom: 12, zIndex: 1500, "@media print": { display: "none" } }}>
      {open && (
        <Paper elevation={6} role="dialog" aria-label="Acessibilidade" sx={{ p: 2, mb: 1, width: 290, borderRadius: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
            <Typography sx={{ fontWeight: 800 }}>Acessibilidade</Typography>
            <IconButton size="small" aria-label="Fechar" onClick={() => setOpen(false)}><CloseIcon fontSize="small" /></IconButton>
          </Box>
          <Typography variant="body2" sx={{ mb: 0.5 }}>Tamanho do texto</Typography>
          <ButtonGroup fullWidth size="small" sx={{ mb: 1.5 }}>
            {[0, 1, 2, 3].map((n) => (
              <Button key={n} variant={prefs.font === n ? "contained" : "outlined"} aria-pressed={prefs.font === n} onClick={() => update({ font: n as Prefs["font"] })}>{n === 0 ? "A" : "A" + "+".repeat(n)}</Button>
            ))}
          </ButtonGroup>
          {([["contrast", "Alto contraste"], ["gray", "Tons de cinza"], ["links", "Sublinhar links"], ["spacing", "Mais espaço entre letras e linhas"]] as const).map(([key, label]) => (
            <Box key={key} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Typography variant="body2">{label}</Typography>
              <Switch size="small" checked={prefs[key]} onChange={(_, v) => update({ [key]: v })} slotProps={{ input: { "aria-label": label } }} />
            </Box>
          ))}
          <Divider sx={{ my: 1.5 }} />
          <Button fullWidth variant="outlined" disabled={libras === "loading" || libras === "on"} onClick={() => void startLibras()}>
            {libras === "loading" ? "Carregando…" : libras === "on" ? "Tradutor de Libras ativo" : "Tradutor de Libras (VLibras)"}
          </Button>
          {libras === "error" && <Typography variant="caption" color="error">Não foi possível carregar o tradutor agora. Tente de novo mais tarde.</Typography>}
          <Button fullWidth size="small" sx={{ mt: 1 }} onClick={() => setPrefs(DEFAULTS)}>Restaurar o padrão</Button>
        </Paper>
      )}
      <IconButton aria-label="Abrir opções de acessibilidade" aria-expanded={open} onClick={() => setOpen((v) => !v)} sx={{ bgcolor: "primary.main", color: "#fff", boxShadow: 3, "&:hover": { bgcolor: "primary.dark" } }}>
        <AccessibilityNewIcon />
      </IconButton>
    </Box>
  );
}
