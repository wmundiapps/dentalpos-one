import { Box, Button, Chip, Typography } from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import EduResourcePage, { type FieldDef } from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import { fmtNum, label, Progress, Section, Status, useApi, useToast } from "./ui";

const DIMS = ["ORGANIZACAO_DIDATICO_PEDAGOGICA", "CORPO_DOCENTE_TUTORIAL", "INFRAESTRUTURA", "DOCUMENTAL", "GESTAO_INSTITUCIONAL"];
const INSTR = ["INSTITUCIONAL", "CURSO_AUTORIZACAO", "CURSO_RECONHECIMENTO", "CURSO_RENOVACAO", "DOCUMENTAL"];
const FIELDS: FieldDef[] = [
  { key: "instrumento", label: "Instrumento", type: "select", options: INSTR.map((i) => ({ value: i, label: label(i) })), required: true, createOnly: true },
  { key: "dimensao", label: "Dimensão", type: "select", options: DIMS.map((i) => ({ value: i, label: label(i) })), required: true },
  { key: "codigo", label: "Código", required: true }, { key: "nome", label: "Indicador", required: true },
  { key: "conceito", label: "Conceito (1 a 5)", type: "number", helper: "Exige justificativa; 1 ou 2 exige plano de melhoria e prazo." },
  { key: "justificativa", label: "Justificativa", type: "textarea" },
  { key: "planoMelhoria", label: "Plano de melhoria", type: "textarea" },
  { key: "prazoMelhoria", label: "Prazo da melhoria", type: "date" },
];

export default function IndicadoresTab() {
  const { data, loading, error, reload } = useApi<any>("/regulatorio/indicadores/resumo");
  const { toast, node } = useToast();
  async function gerar() {
    try { const r = await eduApi.post("/regulatorio/indicadores/gerar", {}); toast({ type: "success", text: `${r?.criados ?? 0} indicador(es) institucional(is) criado(s).` }); reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Box>
      <Section title="Autoavaliação institucional (resumo)" action={<Button size="small" startIcon={<AutoFixHighIcon />} onClick={gerar}>Gerar indicadores padrão</Button>}>
        <Status loading={loading && !data} error={error} onRetry={reload} empty={!data}>
          {data && (<>
            <Typography variant="body2" sx={{ mb: 1 }}>{data.avaliados}/{data.total} avaliados · média geral <b>{fmtNum(data.mediaGeral, 2)}</b> · {data.naoAvaliados} sem conceito</Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1 }}>
              {DIMS.map((d) => (
                <Box key={d}><Typography variant="caption" color="text.secondary">{label(d)}</Typography><Progress value={data.mediaPorDimensao?.[d] != null ? data.mediaPorDimensao[d] * 20 : null} showLabel={false} /><Typography variant="caption">{fmtNum(data.mediaPorDimensao?.[d], 2)} / 5</Typography></Box>
              ))}
            </Box>
            {(data.criticos || []).length > 0 && <Box sx={{ mt: 1.5, display: "flex", gap: 1, flexWrap: "wrap" }}>{data.criticos.map((c: any) => <Chip key={c.id} color="error" size="small" label={`${c.codigo} — conceito ${c.conceito}`} />)}</Box>}
          </>)}
        </Status>
      </Section>
      <EduResourcePage title="Indicadores" base="/regulatorio" resource="/indicadores" fields={FIELDS}
        filters={[{ key: "instrumento", label: "Instrumento", options: INSTR }, { key: "dimensao", label: "Dimensão", options: DIMS }]}
        columns={[{ key: "codigo", label: "Cód." }, { key: "nome", label: "Indicador" }, { key: "dimensao", label: "Dimensão", render: (r) => label(r.dimensao) }, { key: "conceito", label: "Conceito" }]} />
      {node}
    </Box>
  );
}
