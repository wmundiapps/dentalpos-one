import { Box, Button, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import FaceIcon from "@mui/icons-material/Face";
import KeyboardIcon from "@mui/icons-material/Keyboard";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import { useState } from "react";
import FaceCamera from "./FaceCamera";
import QrLeitor from "./QrLeitor";
import type { EvidenciaLiveness } from "./motorFacial";

export interface Identificacao { metodo: "FACIAL" | "QR" | "CODIGO"; embedding?: number[]; liveness?: EvidenciaLiveness; credencial?: string }

/**
 * Três caminhos equivalentes para identificar a pessoa: rosto (no dispositivo), QR da carteirinha ou código.
 * A biometria nunca é a única opção.
 */
export default function IdentificaPessoa({ onIdentificar, pausado = false, inicial = "FACIAL", esperaMs }: {
  onIdentificar: (i: Identificacao) => Promise<void> | void; pausado?: boolean; inicial?: Identificacao["metodo"]; esperaMs?: number;
}) {
  const [metodo, setMetodo] = useState<Identificacao["metodo"]>(inicial);
  const [codigo, setCodigo] = useState("");
  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <ToggleButtonGroup exclusive fullWidth value={metodo} onChange={(_, v) => v && setMetodo(v)} size="large" color="primary" aria-label="Como se identificar">
        <ToggleButton value="FACIAL" sx={{ fontWeight: 800 }}><FaceIcon sx={{ mr: 1 }} />Rosto</ToggleButton>
        <ToggleButton value="QR" sx={{ fontWeight: 800 }}><QrCodeScannerIcon sx={{ mr: 1 }} />QR da carteirinha</ToggleButton>
        <ToggleButton value="CODIGO" sx={{ fontWeight: 800 }}><KeyboardIcon sx={{ mr: 1 }} />Código</ToggleButton>
      </ToggleButtonGroup>
      {metodo === "FACIAL" && (
        <FaceCamera modo="identificar" pausado={pausado} esperaMs={esperaMs} onCaptura={(c) => onIdentificar({ metodo: "FACIAL", embedding: c.embeddings[0], liveness: c.liveness })} />
      )}
      {metodo === "QR" && <QrLeitor camera="user" ativo={!pausado} onLer={(t) => onIdentificar({ metodo: "QR", credencial: t })} />}
      {metodo === "CODIGO" && (
        <Box component="form" onSubmit={(e) => { e.preventDefault(); const c = codigo.trim(); if (c) { setCodigo(""); onIdentificar({ metodo: "CODIGO", credencial: c }); } }} sx={{ display: "grid", gap: 1 }}>
          <Typography variant="body2" color="text.secondary">Digite o código impresso na carteirinha (8 letras/números) ou use um leitor USB.</Typography>
          <TextField autoFocus value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} label="Código da carteirinha" slotProps={{ htmlInput: { autoComplete: "off", maxLength: 12, style: { fontSize: 26, letterSpacing: 4, textAlign: "center" } } }} />
          <Button type="submit" variant="contained" size="large" disabled={!codigo.trim() || pausado}>Confirmar</Button>
        </Box>
      )}
    </Box>
  );
}
