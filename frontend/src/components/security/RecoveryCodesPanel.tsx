import { useState } from "react";
import { Alert, Box, Button, Checkbox, FormControlLabel, Paper, Stack, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadIcon from "@mui/icons-material/Download";

/** Mostra os códigos de recuperação UMA vez, com copiar/baixar. O pai decide o que fazer ao concluir. */
export default function RecoveryCodesPanel({ codes, onDone, doneLabel = "Concluir" }: { codes: string[]; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const text = codes.join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  function download() {
    const body = `DentalPos One — códigos de recuperação do 2FA\nCada código vale uma única vez. Guarde em local seguro.\n\n${text}\n`;
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "dentalpos-codigos-de-recuperacao.txt";
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <Stack spacing={2}>
      <Alert severity="warning">
        Estes códigos aparecem <strong>somente agora</strong>. Cada um vale uma vez e substitui o app autenticador se você perder o celular. Guarde-os em local seguro.
      </Alert>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4,1fr)" }, gap: 1 }}>
        {codes.map((c) => (
          <Typography key={c} sx={{ fontFamily: "ui-monospace,Menlo,Consolas,monospace", fontWeight: 800, letterSpacing: 1, textAlign: "center" }}>{c}</Typography>
        ))}
      </Paper>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={() => void copy()}>{copied ? "Copiado" : "Copiar códigos"}</Button>
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={download}>Baixar .txt</Button>
      </Box>
      <FormControlLabel control={<Checkbox checked={saved} onChange={(e) => setSaved(e.target.checked)} />} label="Guardei os códigos em local seguro" />
      <Box>
        <Button variant="contained" disabled={!saved} onClick={onDone}>{doneLabel}</Button>
      </Box>
    </Stack>
  );
}
