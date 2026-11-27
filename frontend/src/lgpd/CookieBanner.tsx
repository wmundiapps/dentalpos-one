import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, Paper, Switch, Typography } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { CATEGORIAS, type CategoriaCookie, lerEscolha, salvarEscolha } from "./cookies";
import { instituicaoRef, pub, visitanteId } from "./publicApi";

const VAZIO: Record<CategoriaCookie, boolean> = { COOKIES_PREFERENCIAS: false, COOKIES_ANALITICOS: false, COOKIES_MARKETING: false };

/** Registra a escolha na API (prova do consentimento). Falhas não impedem o uso do site. */
async function registrar(escolha: Record<CategoriaCookie, boolean>) {
  if (!instituicaoRef()) return;
  try {
    const { textos } = await pub<{ textos: Array<{ finalidade: string; versao: string }> }>("GET", "/textos");
    for (const c of CATEGORIAS) {
      const t = textos.find((x) => x.finalidade === c.codigo);
      if (!t) continue;
      if (escolha[c.codigo]) await pub("POST", "/consentimentos", { finalidade: c.codigo, versao: t.versao, titularTipo: "VISITANTE", titularRef: visitanteId() });
      else await pub("POST", "/consentimentos/revogar", { titularRef: visitanteId(), finalidade: c.codigo, motivo: "Escolha no aviso de cookies" });
    }
  } catch { /* melhor esforço */ }
}

/**
 * Aviso de cookies. Regras: nada pré-marcado; "Somente necessários" e "Aceitar todos" têm o mesmo destaque;
 * cookies estritamente necessários não pedem consentimento; a escolha pode ser revista a qualquer momento.
 * Texto-modelo: a instituição deve validar com seu advogado.
 */
export default function CookieBanner() {
  const [decidido, setDecidido] = useState<boolean>(() => !!lerEscolha());
  const [personalizar, setPersonalizar] = useState(false);
  const [sel, setSel] = useState<Record<CategoriaCookie, boolean>>({ ...VAZIO, ...(lerEscolha()?.opcionais ?? {}) });

  useEffect(() => {
    const abrir = () => { setSel({ ...VAZIO, ...(lerEscolha()?.opcionais ?? {}) }); setPersonalizar(true); };
    window.addEventListener("dentalpos:abrir-cookies", abrir);
    return () => window.removeEventListener("dentalpos:abrir-cookies", abrir);
  }, []);

  const gravar = useCallback((escolha: Record<CategoriaCookie, boolean>) => {
    salvarEscolha(escolha);
    setDecidido(true);
    setPersonalizar(false);
    void registrar(escolha);
  }, []);

  const link = (p: string) => `${p}${instituicaoRef() ? `?i=${encodeURIComponent(instituicaoRef()!)}` : ""}`;

  return (
    <>
      {!decidido && !personalizar && (
        <Paper role="dialog" aria-label="Aviso de cookies" elevation={8} sx={{ position: "fixed", left: 16, right: 16, bottom: 16, zIndex: 1600, p: 2.5, maxWidth: 760, mx: "auto", borderRadius: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Sua privacidade</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ my: 1 }}>
            Usamos cookies estritamente necessários para o site funcionar e manter você conectado com segurança. Os cookies de preferências, estatísticas e campanhas são <b>opcionais</b> e só serão usados se você permitir.
            Saiba mais na <Link href={link("/privacidade")}>Política de Privacidade</Link>.
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Button variant="outlined" onClick={() => setPersonalizar(true)}>Escolher categorias</Button>
            <Button variant="contained" color="inherit" onClick={() => gravar({ ...VAZIO })}>Somente necessários</Button>
            <Button variant="contained" color="inherit" onClick={() => gravar({ COOKIES_PREFERENCIAS: true, COOKIES_ANALITICOS: true, COOKIES_MARKETING: true })}>Aceitar todos</Button>
          </Box>
        </Paper>
      )}
      {decidido && !personalizar && (
        <Button size="small" onClick={() => setPersonalizar(true)} sx={{ position: "fixed", left: 8, bottom: 8, zIndex: 1300, bgcolor: "background.paper", border: 1, borderColor: "divider", fontSize: 11 }}>
          Cookies
        </Button>
      )}
      <Dialog open={personalizar} onClose={() => setPersonalizar(false)} fullWidth maxWidth="sm">
        <DialogTitle>Preferências de cookies</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontWeight: 700 }}>Estritamente necessários</Typography>
              <Typography variant="body2" color="text.secondary">Mantêm você conectado, protegem contra fraudes e lembram esta escolha. Não podem ser desativados e não exigem consentimento.</Typography>
            </Box>
            <Switch checked disabled slotProps={{ input: { "aria-label": "Necessários (sempre ativos)" } }} />
          </Box>
          {CATEGORIAS.map((c) => (
            <Box key={c.codigo} sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 700 }}>{c.titulo} <Typography component="span" variant="caption" color="text.secondary">(opcional)</Typography></Typography>
                <Typography variant="body2" color="text.secondary">{c.descricao}</Typography>
              </Box>
              <Switch checked={!!sel[c.codigo]} onChange={(e) => setSel((p) => ({ ...p, [c.codigo]: e.target.checked }))} slotProps={{ input: { "aria-label": c.titulo } }} />
            </Box>
          ))}
          <Typography variant="caption" color="text.secondary">Você pode mudar de ideia a qualquer momento pelo botão “Cookies”. Texto-modelo — validar com advogado.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPersonalizar(false)}>Fechar</Button>
          <Button variant="contained" onClick={() => gravar(sel)}>Salvar minhas escolhas</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
