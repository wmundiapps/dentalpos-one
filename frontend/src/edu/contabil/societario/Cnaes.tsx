import { Box, Button, Chip, MenuItem, Paper, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { Estado, SOC, qstr, rotulo, useApi } from "../comum2/kit";

export interface CnaeItem { codigo: string; codigoFormatado: string; descricao: string; setor: string; anexoSimples: string; iss: boolean; icms: boolean; risco: string; mei: boolean; vigilanciaSanitaria: boolean; bombeiros: boolean; ambiental: boolean; conselhoClasse: boolean; educacaoRegulada: boolean }

export function CnaeChips({ c }: { c: CnaeItem }) {
  return (
    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
      <Chip size="small" label={`Simples: Anexo ${c.anexoSimples}`} />
      {c.iss ? <Chip size="small" label="ISS" /> : null}{c.icms ? <Chip size="small" label="ICMS" /> : null}
      <Chip size="small" color={c.risco === "ALTO" ? "error" : c.risco === "MEDIO" ? "warning" : "success"} label={`Risco ${rotulo(c.risco)}`} />
      {c.mei ? <Chip size="small" color="info" label="Permitido ao MEI" /> : null}
      {c.vigilanciaSanitaria ? <Chip size="small" variant="outlined" label="Vig. sanitária" /> : null}{c.bombeiros ? <Chip size="small" variant="outlined" label="Bombeiros" /> : null}
      {c.ambiental ? <Chip size="small" variant="outlined" label="Ambiental" /> : null}{c.conselhoClasse ? <Chip size="small" variant="outlined" label="Conselho de classe" /> : null}
      {c.educacaoRegulada ? <Chip size="small" variant="outlined" label="Educação regulada" /> : null}
    </Box>
  );
}

/** Busca de CNAEs com seleção (principal e secundários). `onAdd` recebe o CNAE escolhido. */
export function BuscaCnae({ onAdd, rotuloAcao = "Adicionar", mei }: { onAdd?: (c: CnaeItem) => void; rotuloAcao?: string; mei?: boolean }) {
  const [q, setQ] = useState("");
  const [qDeb, setQDeb] = useState("");
  const [setor, setSetor] = useState("");
  useEffect(() => { const t = setTimeout(() => setQDeb(q), 250); return () => clearTimeout(t); }, [q]);
  const meta = useApi<any>(`${SOC}/meta`);
  const r = useApi<{ itens: CnaeItem[]; total: number; aviso: string }>(`${SOC}/cnaes?${qstr({ q: qDeb, setor, mei: mei ? "true" : "", limite: 40 })}`);
  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
        <TextField size="small" label="Buscar por código ou atividade" value={q} onChange={(e) => setQ(e.target.value)} sx={{ flex: "1 1 220px" }} placeholder="ex.: ensino de idiomas, 8630, cabeleireiro" />
        <TextField size="small" select label="Setor" value={setor} onChange={(e) => setSetor(e.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="">Todos</MenuItem>
          {(meta.data?.setores || []).map((s: any) => <MenuItem key={s.setor} value={s.setor}>{s.nome}</MenuItem>)}
        </TextField>
      </Box>
      <Estado loading={r.loading} error={r.error} onRetry={r.reload} vazio={!r.data?.itens.length} textoVazio="Nenhum CNAE encontrado para a busca.">
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, maxHeight: onAdd ? 360 : undefined, overflowY: onAdd ? "auto" : undefined }}>
          {(r.data?.itens || []).map((c) => (
            <Paper key={c.codigo} variant="outlined" sx={{ p: 1.2, borderRadius: 2, display: "flex", gap: 1, alignItems: "flex-start", flexWrap: "wrap" }}>
              <Box sx={{ flex: "1 1 260px", minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{c.codigoFormatado} — {c.descricao}</Typography>
                <CnaeChips c={c} />
              </Box>
              {onAdd ? <Button size="small" variant="outlined" onClick={() => onAdd(c)}>{rotuloAcao}</Button> : null}
            </Paper>
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>{r.data?.aviso}</Typography>
      </Estado>
    </Box>
  );
}
