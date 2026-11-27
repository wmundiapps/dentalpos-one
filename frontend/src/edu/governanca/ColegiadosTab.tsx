import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useState } from "react";
import EduResourcePage from "../EduResourcePage";
import { fmtDate, label, Status, useApi } from "../regulatorio/ui";
import DeliberacoesTab from "./DeliberacoesTab";
import ReunioesTab from "./ReunioesTab";
import { useOptions } from "./shared";

const TIPOS = ["CONSUP", "CONSEPE", "COLEGIADO_CURSO", "CONGREGACAO", "OUTRO"];

function Composicao({ orgao, onClose }: { orgao: any; onClose: () => void }) {
  const { data, loading, error, reload } = useApi<any>(`/governanca/orgaos/${orgao.id}/composicao`);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Composição — {orgao.nome}</DialogTitle>
      <DialogContent dividers>
        <Status loading={loading && !data} error={error} onRetry={reload} empty={!data}>
          {data && (<>
            <Box sx={{ display: "flex", gap: 1, mb: 1, flexWrap: "wrap" }}>
              <Chip label={`${data.vigentes.length} membro(s) vigente(s)`} /><Chip label={`${data.comVoto} com voto`} /><Chip color="primary" label={`Quórum: ${data.quorumNecessario}`} />
            </Box>
            {data.semPresidente && <Alert severity="warning" sx={{ mb: 1 }}>Órgão sem presidente vigente.</Alert>}
            {data.vigentes.map((m: any) => <Typography key={m.id} variant="body2">{m.nome} — {label(m.cargo)} (mandato até {fmtDate(m.fimMandato)}){m.temVoto ? "" : " · sem voto"}</Typography>)}
            {data.vencidos.length > 0 && <Alert severity="error" sx={{ mt: 1 }}>Mandatos vencidos: {data.vencidos.map((m: any) => m.nome).join(", ")}</Alert>}
          </>)}
        </Status>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

export default function ColegiadosTab() {
  const [v, setV] = useState("reunioes");
  const [comp, setComp] = useState<any | null>(null);
  const orgaos = useOptions("/governanca/orgaos?pageSize=100", (o) => o.nome);
  const programs = useOptions("/academico/programs", (p) => p.nome);
  const B = "/governanca";
  return (
    <Box>
      <ToggleButtonGroup size="small" exclusive value={v} onChange={(_, x) => x && setV(x)} sx={{ mb: 2 }}>
        <ToggleButton value="reunioes">Reuniões e atas</ToggleButton><ToggleButton value="delib">Deliberações</ToggleButton><ToggleButton value="orgaos">Órgãos</ToggleButton><ToggleButton value="membros">Membros</ToggleButton>
      </ToggleButtonGroup>
      {v === "reunioes" && <ReunioesTab />}
      {v === "delib" && <DeliberacoesTab />}
      {v === "orgaos" && <EduResourcePage title="Órgãos colegiados" base={B} resource="/orgaos" filters={[{ key: "tipo", label: "Tipo", options: TIPOS }]}
        fields={[{ key: "tipo", label: "Tipo", type: "select", options: TIPOS.map((t) => ({ value: t, label: label(t) })), required: true, createOnly: true }, { key: "nome", label: "Nome", required: true }, { key: "sigla", label: "Sigla" }, { key: "programId", label: "Curso (colegiado de curso)", type: "select", options: programs }, { key: "quorumPercent", label: "Quórum (%)", type: "number" }, { key: "maioria", label: "Maioria", type: "select", options: [{ value: "SIMPLES", label: "Simples" }, { value: "ABSOLUTA", label: "Absoluta" }] }]}
        columns={[{ key: "nome", label: "Órgão" }, { key: "tipo", label: "Tipo", render: (r) => label(r.tipo) }, { key: "quorumPercent", label: "Quórum", render: (r) => `${r.quorumPercent}%` }, { key: "maioria", label: "Maioria", render: (r) => label(r.maioria) }, { key: "composicao", label: "", render: (r) => <Button size="small" onClick={() => setComp(r)}>Composição</Button> }]} />}
      {v === "membros" && <EduResourcePage title="Membros dos órgãos" base={B} resource="/orgao-membros"
        fields={[{ key: "orgaoId", label: "Órgão", type: "select", options: orgaos, required: true, createOnly: true }, { key: "nome", label: "Nome", required: true }, { key: "cargo", label: "Cargo", type: "select", options: ["PRESIDENTE", "VICE_PRESIDENTE", "SECRETARIO", "MEMBRO"].map((c) => ({ value: c, label: label(c) })) }, { key: "representacao", label: "Representação" }, { key: "inicioMandato", label: "Início do mandato", type: "date", required: true }, { key: "fimMandato", label: "Fim do mandato", type: "date", required: true }]}
        columns={[{ key: "nome", label: "Nome" }, { key: "orgaoId", label: "Órgão", render: (r) => orgaos.find((o) => o.value === r.orgaoId)?.label || "—" }, { key: "cargo", label: "Cargo", render: (r) => label(r.cargo) }, { key: "fimMandato", label: "Mandato até", render: (r) => fmtDate(r.fimMandato) }]} />}
      {comp && <Composicao orgao={comp} onClose={() => setComp(null)} />}
    </Box>
  );
}
