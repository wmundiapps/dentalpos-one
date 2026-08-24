import {
  Box,
  Typography,
} from "@mui/material";

import type {
  MeshDiagnosticResult,
} from "../services/meshDiagnostics";

interface MeshDiagnosticsPanelProps {
  result:
    | MeshDiagnosticResult
    | null;
}

export default function MeshDiagnosticsPanel({
  result,
}: MeshDiagnosticsPanelProps) {
  if (!result) {
    return (
      <Box
        sx={{
          p: 2,
          bgcolor: "#101820",
          border:
            "1px solid #243447",
          borderRadius: 2,
        }}
      >
        <Typography
          variant="body2"
          sx={{
            color: "#94a3b8",
          }}
        >
          Nenhum diagnóstico disponível.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        p: 2,
        bgcolor: "#101820",
        border:
          "1px solid #243447",
        borderRadius: 2,
        color: "#ffffff",
      }}
    >
      <Typography
        variant="subtitle2"
        sx={{
          color: "#38bdf8",
          fontWeight: 700,
          mb: 1,
        }}
      >
        Diagnóstico da malha
      </Typography>

      <Typography
        component="pre"
        sx={{
          m: 0,
          fontSize: 12,
          lineHeight: 1.5,
          color: "#cbd5e1",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {JSON.stringify(
          result,
          null,
          2
        )}
      </Typography>
    </Box>
  );
}