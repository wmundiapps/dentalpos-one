import { Alert, Button, Chip } from "@mui/material";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import NovoCasoDialog, { type Preset } from "./NovoCasoDialog";
import { AD, call, errMsg, useApi } from "./kit";

/**
 * Botão "Analisar com o agente" para as telas da secretaria, financeiro e jurídico.
 * Com `protocoloId` (secretaria) lê os anexos do protocolo; nos demais casos abre o formulário já preenchido.
 */
export default function AnalisarComAgente({ preset, protocoloId, label = "Analisar com o agente", size = "small", variant = "outlined", onDone }: {
  preset: Preset; protocoloId?: string; label?: string; size?: "small" | "medium"; variant?: "outlined" | "contained" | "text"; onDone?: () => void;
}) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ir = (id: string) => { onDone?.(); nav(`/edu/analise-docs?secao=fila&caso=${id}`); };

  async function clicar() {
    setMsg(null);
    if (!protocoloId) { setOpen(true); return; }
    setBusy(true);
    try {
      const c = await call<any>("POST", `${AD}/casos/de-protocolo`, { protocoloId, contexto: preset.contexto, programId: preset.programId });
      ir(c.id);
    } catch (e: any) {
      if (e?.status === 422) setOpen(true); // protocolo sem anexos: abre o formulário para colar o texto
      else setMsg(errMsg(e));
    } finally { setBusy(false); }
  }

  return (
    <>
      <Button size={size} variant={variant} startIcon={<SmartToyOutlinedIcon />} onClick={clicar} disabled={busy}>{busy ? "Analisando…" : label}</Button>
      {msg && <Alert severity="error" sx={{ mt: 1 }} onClose={() => setMsg(null)}>{msg}</Alert>}
      <NovoCasoDialog open={open} onClose={() => setOpen(false)} onCreated={ir} preset={{ ...preset, protocoloId: protocoloId ?? preset.protocoloId, refType: preset.refType ?? (protocoloId ? "SecProtocolo" : undefined), refId: preset.refId ?? protocoloId }} />
    </>
  );
}

/** Sinaliza que o processo está bloqueado por documento crítico (ou decisão desfavorável) no Agente de documentos. */
export function BloqueioChip({ refType, refId }: { refType: string; refId: string }) {
  const nav = useNavigate();
  const b = useApi<any>(`${AD}/bloqueio?refType=${encodeURIComponent(refType)}&refId=${encodeURIComponent(refId)}`);
  if (!b.data?.bloqueado) return null;
  return (
    <Chip color="error" size="small" clickable onClick={() => nav(`/edu/analise-docs?secao=fila&caso=${b.data.caso?.id}`)}
      label={b.data.motivo === "CRITICO_SEM_DECISAO" ? "Bloqueado: documento crítico aguarda decisão" : "Bloqueado: análise de documentos desfavorável"} />
  );
}
