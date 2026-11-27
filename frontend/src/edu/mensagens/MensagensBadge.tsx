import { Badge, IconButton, Tooltip } from "@mui/material";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useResumo } from "./resumo";

/** Atalho do cabeçalho para o Mensageiro interno: contador de não lidas e destaque quando alguém pede uma pessoa. */
export default function MensagensBadge() {
  const nav = useNavigate();
  const { resumo, semAcesso } = useResumo();
  const [pulso, setPulso] = useState(false);
  useEffect(() => {
    const f = () => { setPulso(true); window.setTimeout(() => setPulso(false), 6000); };
    window.addEventListener("edu-msg-pedido-novo", f);
    return () => window.removeEventListener("edu-msg-pedido-novo", f);
  }, []);
  if (semAcesso) return null;
  const n = resumo?.naoLidas ?? 0;
  const pedidos = resumo?.pedidos.total ?? 0;
  const titulo = pedidos ? `Mensageiro: ${pedidos} pedido(s) para falar com uma pessoa` : n ? `Mensageiro: ${n} mensagem(ns) não lida(s)` : "Mensageiro interno";
  return (
    <Tooltip title={titulo}>
      <IconButton aria-label={titulo} onClick={() => nav("/edu/mensagens")} sx={pedidos ? { color: "error.main", ...(pulso ? { animation: "pulsoMsg 1s ease-in-out 5", "@keyframes pulsoMsg": { "50%": { transform: "scale(1.25)" } } } : {}) } : undefined}>
        <Badge badgeContent={n + pedidos} color={pedidos ? "error" : "primary"} max={99}>
          <ForumOutlinedIcon />
        </Badge>
      </IconButton>
    </Tooltip>
  );
}
