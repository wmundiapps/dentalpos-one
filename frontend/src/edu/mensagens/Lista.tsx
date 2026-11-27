import { Alert, Badge, Box, Button, Chip, CircularProgress, InputAdornment, List, ListItemButton, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import AlternateEmailIcon from "@mui/icons-material/AlternateEmail";
import LinkIcon from "@mui/icons-material/Link";
import NotificationsOffOutlinedIcon from "@mui/icons-material/NotificationsOffOutlined";
import PushPinIcon from "@mui/icons-material/PushPin";
import SearchIcon from "@mui/icons-material/Search";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import { useCallback, useEffect, useState } from "react";
import { eduApi } from "../../services/EduApi";
import { Foto, M, ROTULO_MOTIVO, ROTULO_TIPO, dataHora, errMsg, horaCurta, type Conversa } from "./kit";
import { atualizarResumo } from "./resumo";

export type Aba = "conversas" | "diretorio" | "pedidos";
type Filtro = "todas" | "naolidas" | "DEPARTAMENTO" | "GRUPO" | "DIRETA";

interface Props {
  aba: Aba; onAba: (a: Aba) => void; conversas: Conversa[]; diretorio: Conversa[]; carregando: boolean; erro: string | null; onRecarregar: () => void;
  selecionada: string | null; onSelecionar: (id: string) => void; pedidosTotal: number; naoLidasTotal: number;
  busca: string; onBusca: (v: string) => void;
}

function Item({ c, ativo, onClick }: { c: Conversa; ativo: boolean; onClick: () => void }) {
  return (
    <ListItemButton selected={ativo} onClick={onClick} sx={{ alignItems: "flex-start", gap: 1.2, py: 1, borderRadius: 2, mb: 0.3 }} aria-label={`${c.nome}${c.naoLidas ? `, ${c.naoLidas} não lidas` : ""}`}>
      <Badge color="primary" variant="dot" invisible={!c.naoLidas || c.silenciado} overlap="circular"><Foto nome={c.nome} tipo={c.tipo} size={42} /></Badge>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
          <Typography sx={{ fontWeight: c.naoLidas ? 800 : 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</Typography>
          {c.fixado ? <PushPinIcon sx={{ fontSize: 14 }} color="action" titleAccess="Fixada" /> : null}
          {c.silenciado ? <NotificationsOffOutlinedIcon sx={{ fontSize: 14 }} color="action" titleAccess="Silenciada" /> : null}
          <Typography variant="caption" color={c.naoLidas ? "primary" : "text.secondary"} sx={{ flexShrink: 0 }}>{horaCurta(c.ultimaMensagemEm)}</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.ultimaMensagem ? `${c.ultimaMensagem.autor ? c.ultimaMensagem.autor.split(" ")[0] + ": " : ""}${c.ultimaMensagem.trecho}` : c.descricao || "Sem mensagens"}
          </Typography>
          {c.mencoesNaoLidas ? <AlternateEmailIcon sx={{ fontSize: 16 }} color="error" titleAccess="Você foi mencionado" /> : null}
          {c.naoLidas ? <Chip size="small" color={c.silenciado ? "default" : "primary"} label={c.naoLidas > 99 ? "99+" : c.naoLidas} sx={{ height: 20, minWidth: 24, fontWeight: 700 }} /> : null}
        </Box>
        <Box sx={{ display: "flex", gap: 0.5, mt: 0.3, flexWrap: "wrap", alignItems: "center" }}>
          <Typography variant="caption" color="text.secondary">{ROTULO_TIPO[c.tipo]}</Typography>
          {c.respostaAutomatica ? <SmartToyOutlinedIcon sx={{ fontSize: 14 }} color="info" titleAccess="Resposta automática ligada" /> : null}
          {c.contexto ? <Chip size="small" variant="outlined" icon={<LinkIcon />} label={c.contexto.rotulo} sx={{ height: 20, maxWidth: 190, "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" } }} /> : null}
        </Box>
      </Box>
    </ListItemButton>
  );
}

function Pedidos({ onAbrir }: { onAbrir: (id: string) => void }) {
  const [status, setStatus] = useState("PENDENTE");
  const [dados, setDados] = useState<any | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const carregar = useCallback(async () => {
    try { setDados(await eduApi.get<any>(`${M}/pedidos?status=${status}`)); setErro(null); } catch (e) { setErro(errMsg(e)); } finally { setCarregando(false); }
  }, [status]);
  useEffect(() => { setCarregando(true); void carregar(); const t = window.setInterval(() => { if (!document.hidden) void carregar(); }, 10000); return () => window.clearInterval(t); }, [carregar]);
  const acao = async (id: string, a: "assumir" | "resolver") => { try { await eduApi.post(`${M}/pedidos/${id}/${a}`, {}); await carregar(); atualizarResumo(); } catch (e) { setErro(errMsg(e)); } };
  return (
    <Box sx={{ p: 1.5 }}>
      <ToggleButtonGroup size="small" exclusive value={status} onChange={(_, v) => v && setStatus(v)} sx={{ mb: 1.5, flexWrap: "wrap" }}>
        <ToggleButton value="PENDENTE">Pendentes</ToggleButton><ToggleButton value="ASSUMIDO">Em atendimento</ToggleButton><ToggleButton value="RESOLVIDO">Resolvidos</ToggleButton>
      </ToggleButtonGroup>
      {erro ? <Alert severity="error" action={<Button size="small" color="inherit" onClick={carregar}>Tentar de novo</Button>}>{erro}</Alert> : carregando ? <Box sx={{ textAlign: "center", py: 3 }}><CircularProgress size={24} /></Box> : !dados?.items.length ? (
        <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>{status === "PENDENTE" ? "Nenhum pedido aguardando uma pessoa. Tudo em dia." : "Nenhum pedido neste estado."}</Typography>
      ) : dados.items.map((p: any) => (
        <Box key={p.id} sx={{ border: 1, borderColor: p.status === "PENDENTE" ? "warning.main" : "divider", borderRadius: 2, p: 1.2, mb: 1 }}>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}><SupportAgentIcon color={p.status === "PENDENTE" ? "warning" : "action"} /><Typography sx={{ fontWeight: 700, flex: 1 }}>{p.solicitante.nome}</Typography><Typography variant="caption" color="text.secondary">{dataHora(p.createdAt)}</Typography></Box>
          <Typography variant="body2" color="text.secondary">{p.canalNome} · {ROTULO_MOTIVO[p.motivo] ?? p.motivo}{p.confianca ? ` (${Math.round(p.confianca * 100)}% de confiança)` : ""}{p.assumidoPor ? ` · ${p.assumidoPor}` : ""}</Typography>
          <Box sx={{ display: "flex", gap: 1, mt: 0.8, flexWrap: "wrap" }}>
            <Button size="small" variant="outlined" onClick={() => onAbrir(p.canalId)}>Abrir conversa</Button>
            {p.status === "PENDENTE" ? <Button size="small" variant="contained" onClick={() => acao(p.id, "assumir")}>Assumir</Button> : null}
            {p.status !== "RESOLVIDO" ? <Button size="small" onClick={() => acao(p.id, "resolver")}>Marcar resolvido</Button> : null}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

export default function Lista({ aba, onAba, conversas, diretorio, carregando, erro, onRecarregar, selecionada, onSelecionar, pedidosTotal, naoLidasTotal, busca, onBusca }: Props) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const base = aba === "diretorio" ? diretorio : conversas;
  const itens = base.filter((c) => (filtro === "todas" ? true : filtro === "naolidas" ? c.naoLidas > 0 : c.tipo === filtro));
  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <Tabs value={aba} onChange={(_, v) => onAba(v)} variant="fullWidth" sx={{ borderBottom: 1, borderColor: "divider", minHeight: 44 }}>
        <Tab value="conversas" label={<Badge color="primary" badgeContent={naoLidasTotal} max={99}><Box sx={{ pr: naoLidasTotal ? 1.5 : 0 }}>Conversas</Box></Badge>} sx={{ minHeight: 44 }} />
        <Tab value="diretorio" label="Diretório" sx={{ minHeight: 44 }} />
        <Tab value="pedidos" label={<Badge color="error" badgeContent={pedidosTotal} max={99}><Box sx={{ pr: pedidosTotal ? 1.5 : 0 }}>Pedidos</Box></Badge>} sx={{ minHeight: 44 }} />
      </Tabs>
      {aba === "pedidos" ? <Box sx={{ overflowY: "auto", flex: 1 }}><Pedidos onAbrir={onSelecionar} /></Box> : (<>
        <Box sx={{ p: 1.2, pb: 0.5 }}>
          <TextField size="small" fullWidth placeholder="Buscar conversas" value={busca} onChange={(e) => onBusca(e.target.value)} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }, htmlInput: { "aria-label": "Buscar conversas" } }} />
          <Box sx={{ display: "flex", gap: 0.6, mt: 1, overflowX: "auto", pb: 0.5 }}>
            {([["todas", "Todas"], ["naolidas", "Não lidas"], ["DEPARTAMENTO", "Departamentos"], ["GRUPO", "Grupos"], ["DIRETA", "Diretas"]] as Array<[Filtro, string]>).map(([v, l]) => <Chip key={v} size="small" label={l} clickable color={filtro === v ? "primary" : "default"} variant={filtro === v ? "filled" : "outlined"} onClick={() => setFiltro(v)} />)}
          </Box>
        </Box>
        <Box sx={{ overflowY: "auto", flex: 1, px: 0.8, pb: 1 }}>
          {erro ? <Alert severity="error" sx={{ m: 1 }} action={<Button size="small" color="inherit" onClick={onRecarregar}>Tentar de novo</Button>}>{erro}</Alert>
            : carregando && !base.length ? <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress size={26} /></Box>
              : !itens.length ? <Box sx={{ textAlign: "center", color: "text.secondary", py: 4, px: 2 }}><Typography sx={{ fontWeight: 700 }}>{aba === "diretorio" ? "Nenhum canal aberto para entrar." : busca ? "Nenhuma conversa encontrada." : filtro === "naolidas" ? "Nada não lido. Bom trabalho!" : "Nenhuma conversa ainda."}</Typography>{aba === "conversas" && !busca && filtro === "todas" ? <Typography variant="body2">Use “Nova conversa” para falar com uma pessoa ou departamento.</Typography> : null}</Box>
                : <List disablePadding>{itens.map((c) => <Item key={c.id} c={c} ativo={c.id === selecionada} onClick={() => onSelecionar(c.id)} />)}</List>}
        </Box>
      </>)}
    </Box>
  );
}
