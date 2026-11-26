import { useMemo, useState } from "react";
import { Alert, Box, Button, MenuItem, Paper, TextField, Typography } from "@mui/material";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import { useLocation } from "react-router-dom";
import { createPlatformFeedback } from "../services/PlatformFeedbackApi";
import { navigationGroups } from "../config/navigation";
import { groupHelp } from "../config/menuHelp";

const DEPARTAMENTOS = Object.keys(groupHelp).filter((g) => g !== "Configurações");
const OUTRO = "Outro / não sei";

// Caixa de sugestões e relato de erros, fixa e bem visível no fim de cada página.
// Mostra em qual tela/funcionalidade o pedido se refere e pede o departamento para onde encaminhar.
export default function SuggestionBox() {
  const location = useLocation();
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState("");

  const telaAtual = useMemo(() => {
    const full = location.pathname + location.search;
    for (const g of navigationGroups) {
      const it = g.items.find((i) => i.path === full) ?? g.items.find((i) => i.path === location.pathname);
      if (it) return { titulo: it.label, grupo: g.label };
    }
    return null;
  }, [location.pathname, location.search]);

  const [departamento, setDepartamento] = useState(() => (telaAtual && DEPARTAMENTOS.includes(telaAtual.grupo) ? telaAtual.grupo : OUTRO));

  const enviar = async () => {
    if (texto.trim().length < 3) { setErro("Descreva com detalhes o problema ou a melhoria."); return; }
    setBusy(true); setErro("");
    try {
      const corpo = texto.trim();
      const titulo = corpo.length > 120 ? `${corpo.slice(0, 117)}...` : corpo;
      await createPlatformFeedback({
        type: "Sugestão", priority: "Média", title: titulo, description: corpo,
        module: telaAtual?.titulo, departamento: departamento === OUTRO ? undefined : departamento,
        pagePath: `${location.pathname}${location.search}`,
      } as any);
      setOk(true); setTexto("");
    } catch (e: any) { setErro(e?.message || "Não foi possível enviar agora. Tente novamente."); }
    finally { setBusy(false); }
  };

  return (
    <Paper variant="outlined" className="no-print" sx={{ mt: 4, p: { xs: 2, md: 3 }, borderRadius: 3, border: "2px solid", borderColor: "warning.main", bgcolor: "rgba(255,193,7,.10)" }}>
      <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
        <LightbulbIcon color="warning" sx={{ fontSize: 34, mt: 0.3 }} />
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 900, fontSize: { xs: 16, md: 19 }, lineHeight: 1.25 }}>QUAL MELHORIA VOCÊ GOSTARIA DE IMPLEMENTAR, NOS CONTE AQUI NA CAIXINHA DE SUGESTÕES</Typography>
          <Typography sx={{ fontWeight: 800, fontSize: { xs: 14, md: 16 }, mt: 0.5 }}>CASO QUEIRA RELATAR ALGUM ERRO, PODE USAR ESTA MESMA CAIXA</Typography>
        </Box>
      </Box>
      {ok ? <Alert severity="success" sx={{ mt: 2 }} onClose={() => setOk(false)}>Obrigado! Recebemos sua mensagem com a tela e o departamento indicados e vamos analisar.</Alert> : (
        <Box sx={{ mt: 2, display: "grid", gap: 1.5 }}>
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
            <TextField size="small" label="Tela / funcionalidade" value={telaAtual?.titulo || "Esta tela"} disabled sx={{ flex: "1 1 220px", bgcolor: "background.paper" }}
              helperText="Preenchido automaticamente com a tela onde você está" />
            <TextField select size="small" label="Para qual departamento é esta melhoria/erro?" value={departamento} onChange={(e) => setDepartamento(e.target.value)}
              sx={{ flex: "1 1 260px", bgcolor: "background.paper" }} helperText="Escolha o setor responsável; se não souber, deixe “Outro”">
              {DEPARTAMENTOS.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
              <MenuItem value={OUTRO}>{OUTRO}</MenuItem>
            </TextField>
          </Box>
          <Box sx={{ display: "flex", gap: 1.5, flexDirection: { xs: "column", md: "row" }, alignItems: { md: "flex-start" } }}>
            <TextField fullWidth multiline minRows={3} value={texto} onChange={(e) => setTexto(e.target.value)}
              placeholder="Descreva em detalhes o problema encontrado ou a melhoria que gostaria de implementar: o que acontece, o que era esperado, e em qual situação…"
              error={!!erro} helperText={erro || " "} slotProps={{ htmlInput: { maxLength: 2000 } }} sx={{ bgcolor: "background.paper" }} />
            <Button variant="contained" color="warning" size="large" disabled={busy} onClick={enviar} sx={{ fontWeight: 800, minWidth: 160 }}>{busy ? "Enviando…" : "Enviar"}</Button>
          </Box>
        </Box>
      )}
    </Paper>
  );
}
