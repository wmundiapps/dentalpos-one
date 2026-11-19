import { useCallback, useEffect, useState } from "react";
import { Badge, Box, Divider, Drawer, IconButton, List, ListItemButton, ListItemText, Tooltip, Typography } from "@mui/material";
import NotificationImportantIcon from "@mui/icons-material/NotificationImportant";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import { useNavigate } from "react-router-dom";
import { eduApi } from "../../services/EduApi";

interface Resumo { total: number; departamentos: Array<{ departamento: string; total: number }>; oculto?: boolean }

/**
 * Segundo campo do menu: "Alertas críticos". Clicar abre o painel por departamento; escolher o departamento lista os alertas;
 * escolher o alerta abre a tela própria dele, com o problema explicado e o que fazer.
 */
export default function AlertasMenu({ collapsed, offsetLeft }: { collapsed: boolean; offsetLeft: number }) {
  const navigate = useNavigate();
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [aberto, setAberto] = useState(false);
  const [dep, setDep] = useState<string | null>(null);
  const [lista, setLista] = useState<Array<{ chave: string; titulo: string; resumo: string }>>([]);

  const carregar = useCallback(() => { eduApi.get<Resumo>("/alertas/resumo").then(setResumo).catch(() => undefined); }, []);
  useEffect(() => { carregar(); const t = window.setInterval(carregar, 60_000); return () => window.clearInterval(t); }, [carregar]);

  async function abrirDep(d: string) {
    setDep(d); setLista([]);
    try { setLista(await eduApi.get(`/alertas?departamento=${encodeURIComponent(d)}`)); } catch { setLista([]); }
  }
  function fechar() { setAberto(false); setDep(null); }
  function verAlerta(chave: string) { fechar(); navigate(`/edu/alertas/ver?chave=${encodeURIComponent(chave)}`); }

  if (!resumo || resumo.oculto) return null;
  const total = resumo.total;
  const cor = total > 0 ? "#DC2626" : "#16A34A";

  const gatilho = collapsed ? (
    <Tooltip title={total ? `${total} alerta(s) crítico(s)` : "Nenhum alerta crítico"} placement="right" arrow>
      <IconButton onClick={() => { carregar(); setAberto(true); }} sx={{ mx: "auto", display: "flex", color: cor, bgcolor: total ? "rgba(220,38,38,.14)" : "rgba(22,163,74,.12)", my: .6, width: 40, height: 40 }} aria-label="Alertas críticos">
        <Badge badgeContent={total} color="error" max={99}><NotificationImportantIcon /></Badge>
      </IconButton>
    </Tooltip>
  ) : (
    <Box onClick={() => { carregar(); setAberto(true); }} role="button" tabIndex={0} aria-label="Alertas críticos"
      sx={{ mx: 1, my: .8, px: 1.2, py: 1, borderRadius: 2, cursor: "pointer", display: "flex", alignItems: "center", gap: 1, color: "#fff", bgcolor: total ? "rgba(220,38,38,.22)" : "rgba(22,163,74,.18)", border: `1px solid ${cor}`, "&:hover": { bgcolor: total ? "rgba(220,38,38,.34)" : "rgba(22,163,74,.28)" } }}>
      <NotificationImportantIcon sx={{ color: cor }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 800, fontSize: 13, lineHeight: 1.15 }}>Alertas críticos</Typography>
        <Typography sx={{ fontSize: 11, color: "#CBD5E1" }}>{total ? `${total} para resolver` : "Tudo em dia"}</Typography>
      </Box>
      <Box sx={{ minWidth: 26, height: 26, borderRadius: 13, bgcolor: cor, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, px: .8 }}>{total}</Box>
    </Box>
  );

  return (
    <>
      {gatilho}
      <Drawer anchor="left" open={aberto} onClose={fechar} ModalProps={{ slotProps: { backdrop: { invisible: true } } }}
        sx={{ "& .MuiDrawer-paper": { left: offsetLeft, width: { xs: "calc(100vw - 58px)", sm: 390 }, borderRadius: "0 16px 16px 0", boxShadow: "8px 0 30px rgba(15,23,42,.25)" } }}>
        <Box sx={{ p: 2, display: "flex", alignItems: "center", gap: 1, bgcolor: "#B91C1C", color: "#fff" }}>
          {dep && <IconButton size="small" sx={{ color: "#fff" }} onClick={() => setDep(null)} aria-label="Voltar"><ArrowBackIcon /></IconButton>}
          <NotificationImportantIcon />
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 800 }}>{dep ?? "Alertas críticos"}</Typography>
            <Typography variant="caption">{dep ? "Escolha o alerta para abrir o problema completo" : "Escolha o departamento"}</Typography>
          </Box>
          <IconButton size="small" sx={{ color: "#fff" }} onClick={fechar} aria-label="Fechar"><CloseIcon /></IconButton>
        </Box>
        <Divider />
        {!dep ? (
          total === 0 ? <Box sx={{ p: 4, textAlign: "center" }}><CheckCircleOutlineIcon sx={{ fontSize: 48, color: "#16A34A" }} /><Typography sx={{ fontWeight: 800, mt: 1 }}>Nenhum alerta crítico</Typography><Typography color="text.secondary">Todos os departamentos estão em dia.</Typography></Box> :
          <List>
            {resumo.departamentos.map((d) => (
              <ListItemButton key={d.departamento} onClick={() => abrirDep(d.departamento)} sx={{ py: 1.4 }}>
                <ListItemText primary={d.departamento} slotProps={{ primary: { sx: { fontWeight: 700 } } }} secondary={`${d.total} alerta(s)`} />
                <Box sx={{ minWidth: 26, height: 26, borderRadius: 13, bgcolor: "#DC2626", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, px: .8, mr: 1 }}>{d.total}</Box>
                <ChevronRightIcon color="action" />
              </ListItemButton>
            ))}
          </List>
        ) : (
          <List>
            {lista.map((a) => (
              <ListItemButton key={a.chave} onClick={() => verAlerta(a.chave)} sx={{ py: 1.4, alignItems: "flex-start" }}>
                <ListItemText primary={a.titulo} secondary={a.resumo} slotProps={{ primary: { sx: { fontWeight: 700 } } }} />
                <ChevronRightIcon color="action" sx={{ mt: 1 }} />
              </ListItemButton>
            ))}
            {!lista.length && <Typography color="text.secondary" sx={{ p: 3 }}>Carregando…</Typography>}
          </List>
        )}
      </Drawer>
    </>
  );
}
