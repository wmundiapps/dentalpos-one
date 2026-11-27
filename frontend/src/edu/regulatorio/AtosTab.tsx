import { Box, Button, Chip } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import EduResourcePage, { type FieldDef } from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import { fmtDate, label, SEMAFORO, Status, useApi, useToast } from "./ui";

const TIPOS = ["PORTARIA_CREDENCIAMENTO", "PORTARIA_RECREDENCIAMENTO", "PORTARIA_AUTORIZACAO", "PORTARIA_RECONHECIMENTO", "PORTARIA_RENOVACAO", "PORTARIA_ADITAMENTO", "RESOLUCAO", "PARECER", "OUTRO"];
const SIT_COR: Record<string, string> = { VIGENTE: SEMAFORO.VERDE, SEM_PRAZO: SEMAFORO.CINZA, RENOVACAO_ABERTA: SEMAFORO.AMARELO, VENCENDO: "#ea580c", VENCIDO: SEMAFORO.VERMELHO };

const FIELDS: FieldDef[] = [
  { key: "tipo", label: "Tipo de ato", type: "select", options: TIPOS.map((t) => ({ value: t, label: label(t) })), required: true },
  { key: "numero", label: "Número", required: true },
  { key: "escopo", label: "Escopo", type: "select", options: [{ value: "CURSO", label: "Curso" }, { value: "INSTITUICAO", label: "Instituição" }] },
  { key: "cursoNome", label: "Curso" },
  { key: "dataPublicacao", label: "Data de publicação", type: "date", required: true },
  { key: "referenciaDou", label: "Referência DOU" },
  { key: "vigenciaInicio", label: "Início da vigência", type: "date" },
  { key: "vencimento", label: "Vencimento", type: "date" },
  { key: "vagasAutorizadas", label: "Vagas autorizadas", type: "number" },
  { key: "cicloAvaliativoAnos", label: "Ciclo avaliativo (anos)", type: "number" },
  { key: "conceito", label: "Conceito (1 a 5)", type: "number" },
  { key: "revogado", label: "Revogado", type: "bool" },
  { key: "observacoes", label: "Observações", type: "textarea" },
];

export default function AtosTab() {
  const { data, loading, error, reload } = useApi<any>("/regulatorio/atos/situacao");
  const { toast, node } = useToast();
  const items: any[] = data?.items || [];
  const cont = items.reduce((m: Record<string, number>, a) => ({ ...m, [a.situacao]: (m[a.situacao] || 0) + 1 }), {});
  const porId: Record<string, any> = Object.fromEntries(items.map((a) => [a.id, a]));

  async function reavaliar() {
    try { const r = await eduApi.post("/regulatorio/atos/reavaliar"); toast({ type: "success", text: `Reavaliação concluída${r?.atos != null ? ` (${r.atos} ato(s))` : ""}.` }); reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Box>
      <Status error={error} onRetry={reload} loading={loading && !data} empty={false}>
        <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
          {Object.entries(cont).map(([k, v]) => <Chip key={k} label={`${label(k)}: ${v}`} sx={{ bgcolor: `${SIT_COR[k] || "#94a3b8"}22`, fontWeight: 700 }} />)}
          <Box sx={{ flex: 1 }} />
          <Button size="small" startIcon={<RefreshIcon />} onClick={reavaliar}>Reavaliar prazos de todos os atos</Button>
        </Box>
      </Status>
      <EduResourcePage title="Atos regulatórios (portarias)" base="/regulatorio" resource="/atos" fields={FIELDS}
        description="Repositório de atos; os lembretes de vencimento (D-180 a D-7) são gerados automaticamente."
        filters={[{ key: "tipo", label: "Tipo", options: TIPOS }]}
        rowActions={[{ label: "Reavaliar", path: "/atos/:id/reavaliar" }]}
        columns={[
          { key: "tipo", label: "Tipo", render: (r) => label(r.tipo) }, { key: "numero", label: "Nº" },
          { key: "cursoNome", label: "Curso", render: (r) => r.cursoNome || (r.escopo === "INSTITUICAO" ? "Instituição" : "—") },
          { key: "dataPublicacao", label: "Publicação", render: (r) => fmtDate(r.dataPublicacao) },
          { key: "vencimento", label: "Vencimento", render: (r) => fmtDate(r.vencimento) },
          { key: "situacao", label: "Situação", render: (r) => { const s = porId[r.id]; return s ? <Chip size="small" label={`${label(s.situacao)}${s.diasRestantes != null ? ` (${s.diasRestantes}d)` : ""}`} sx={{ bgcolor: `${SIT_COR[s.situacao] || "#94a3b8"}22`, fontWeight: 700 }} /> : r.revogado ? "Revogado" : "—"; } },
        ]} />
      {node}
    </Box>
  );
}
