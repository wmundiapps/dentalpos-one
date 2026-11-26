import { createContext, useContext } from "react";
import { Box, Tooltip } from "@mui/material";

export type MarkerDot = { name: string; color: string };
// Marcadores coloridos de cada agendamento (chave = id do agendamento no servidor).
export const AgendaMarkersContext = createContext<Map<string, MarkerDot[]>>(new Map());

export function MarkerDots({ backendId }: { backendId?: string }) {
  const dots = useContext(AgendaMarkersContext).get(backendId || "");
  if (!dots?.length) return null;
  return (
    <Box component="span" sx={{ display: "inline-flex", gap: 0.4, ml: 0.5, verticalAlign: "middle" }}>
      {dots.map((d) => (
        <Tooltip key={d.name} title={d.name}>
          <Box component="span" sx={{ width: 11, height: 11, borderRadius: "50%", bgcolor: d.color, border: "1px solid rgba(0,0,0,.35)", display: "inline-block" }} />
        </Tooltip>
      ))}
    </Box>
  );
}
