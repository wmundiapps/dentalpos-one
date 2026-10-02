import { Alert, Box, Button, MenuItem, TextField, ToggleButton, ToggleButtonGroup } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import { useEffect, useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import { PERSONAS, useAsync } from "./common";

export interface Tpl { id: string; chave: string; nome: string; persona: string; versao: number; status: string; _count?: { nos: number; instancias: number } }

interface Props {
  persona: string; setPersona: (p: string) => void;
  templateId: string; setTemplateId: (id: string) => void;
  onTemplates?: (t: Tpl[]) => void;
}

/** Seletor de persona + jornada, com botão para carregar os templates padrão (bootstrap). */
export default function PersonaBar({ persona, setPersona, templateId, setTemplateId, onTemplates }: Props) {
  const { data, loading, error, reload } = useAsync(async () => {
    const r = await eduApi.get(`/jornadas/templates${qsOf({ persona, pageSize: 100 })}`);
    const items: Tpl[] = (Array.isArray(r) ? r : r.items || []).filter((t: Tpl) => t.status !== "ARQUIVADO");
    return items;
  }, [persona]);
  const [msg, setMsg] = useState<{ t: "success" | "error"; s: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const items = data || [];

  // seleciona automaticamente a primeira jornada da persona
  useEffect(() => {
    if (loading || !data) return;
    if (data.length && !data.some((t) => t.id === templateId)) setTemplateId(data[0].id);
    if (!data.length && templateId) setTemplateId("");
    onTemplates?.(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, loading]);

  async function bootstrap() {
    setBusy(true); setMsg(null);
    try {
      const r = await eduApi.post("/jornadas/bootstrap", {});
      setMsg({ t: "success", s: `Templates padrão carregados: ${r.criados?.length ?? 0} novo(s), ${r.existentes?.length ?? 0} já existente(s).` });
      reload();
    } catch (e: any) { setMsg({ t: "error", s: e.message || "Falha ao carregar os templates (requer perfil Administrador)." }); } finally { setBusy(false); }
  }

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
        <ToggleButtonGroup exclusive size="small" color="primary" value={persona} onChange={(_, v) => v && setPersona(v)} sx={{ flexWrap: "wrap" }}>
          {PERSONAS.map((p) => <ToggleButton key={p.value} value={p.value} sx={{ px: 2, fontWeight: 700 }}>{p.label}</ToggleButton>)}
        </ToggleButtonGroup>
        <TextField select size="small" label="Jornada" value={items.some((t) => t.id === templateId) ? templateId : ""} onChange={(e) => setTemplateId(e.target.value)} sx={{ minWidth: 280 }} disabled={!items.length}>
          {items.map((t) => <MenuItem key={t.id} value={t.id}>{t.nome} (v{t.versao}{t.status !== "PUBLICADO" ? ` · ${t.status.toLowerCase()}` : ""})</MenuItem>)}
        </TextField>
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={bootstrap} disabled={busy}>Carregar templates padrão</Button>
      </Box>
      {error ? <Alert severity="warning" sx={{ mt: 1.5 }}>{error}</Alert> : null}
      {!loading && !error && !items.length ? <Alert severity="info" sx={{ mt: 1.5 }}>Nenhuma jornada cadastrada para esta persona. Use “Carregar templates padrão” para criar os modelos prontos.</Alert> : null}
      {msg ? <Alert severity={msg.t} sx={{ mt: 1.5 }} onClose={() => setMsg(null)}>{msg.s}</Alert> : null}
    </Box>
  );
}
