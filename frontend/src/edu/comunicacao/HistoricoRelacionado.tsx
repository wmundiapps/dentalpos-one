import { Box, Chip, Collapse, Typography } from "@mui/material";
import { useState } from "react";
import { BASE, ROTULO_CANAL, StatusPill, fmtDateTime, useLoad } from "./common";

/**
 * Assuntos relacionados ao mesmo contato: outras conversas (de qualquer canal) já abertas por ele,
 * para o atendente ver o histórico e em que fase cada demanda está antes de responder.
 */
export default function HistoricoRelacionado({ id }: { id: string }) {
  const [aberto, setAberto] = useState(false);
  const hist = useLoad<{ items: any[] }>(aberto ? `${BASE}/conversas/${id}/historico` : null);
  const itens = hist.data?.items || [];
  return (
    <Box sx={{ px: 1.5, py: 1, borderTop: 1, borderColor: "divider" }}>
      <Typography
        variant="caption"
        sx={{ fontWeight: 800, cursor: "pointer", textDecoration: "underline" }}
        onClick={() => setAberto((v) => !v)}
      >
        {aberto ? "Ocultar" : "Ver"} assuntos relacionados deste contato
      </Typography>
      <Collapse in={aberto}>
        <Box sx={{ mt: 1, display: "grid", gap: 0.75 }}>
          {aberto && !itens.length ? <Typography variant="caption" color="text.secondary">Sem outras conversas deste contato.</Typography> : null}
          {itens.map((c) => (
            <Box key={c.id} sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
              <Chip size="small" variant="outlined" label={ROTULO_CANAL[c.canalTipo] || c.canalTipo} />
              <StatusPill value={c.status} />
              {c.departamento ? <Chip size="small" label={c.departamento} /> : null}
              <Typography variant="caption" color="text.secondary">{c.assunto ? `${c.assunto} · ` : ""}{fmtDateTime(c.ultimaMensagemEm)}</Typography>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}
