import { Alert, Box, Button, Chip, Paper, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import { useState } from "react";
import EduResourcePage from "../EduResourcePage";
import { fmtDate, Kpi, KpiGrid, label, Progress, Section, SEMAFORO, Status, useApi } from "../regulatorio/ui";
import { TITULACOES, toArr, useOptions, usePrograms } from "./shared";

const REGIMES = ["INTEGRAL", "PARCIAL", "HORISTA"];

function Metrica({ nome, valor, minimo }: { nome: string; valor: number; minimo: number }) {
  const ok = valor >= minimo;
  return (
    <Box sx={{ mb: 0.8 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between" }}><Typography variant="caption">{nome} (mín. {minimo}%)</Typography><Typography variant="caption" sx={{ fontWeight: 800, color: ok ? SEMAFORO.VERDE : SEMAFORO.VERMELHO }}>{valor}%</Typography></Box>
      <Box sx={{ position: "relative" }}>
        <Progress value={valor} showLabel={false} color={ok ? SEMAFORO.VERDE : SEMAFORO.VERMELHO} height={8} />
        <Box sx={{ position: "absolute", left: `${minimo}%`, top: -2, bottom: -2, width: 2, bgcolor: "text.primary", opacity: 0.6 }} />
      </Box>
    </Box>
  );
}

function Conformidade() {
  const { data, loading, error, reload } = useApi<any>("/governanca/ndes-conformidade");
  const ndes = useApi<any>("/governanca/ndes?pageSize=100");
  const items: any[] = data?.items || [];
  const progLabel = (programId: string) => toArr(ndes.data).find((n: any) => n.programId === programId)?.nome;
  return (
    <Box>
      <Status loading={loading && !data} error={error} onRetry={reload} empty={false}>
        {data && <KpiGrid><Kpi title="NDEs ativos" value={data.total} /><Kpi title="Não conformes" value={data.naoConformes} color={data.naoConformes ? SEMAFORO.VERMELHO : SEMAFORO.VERDE} /></KpiGrid>}
        {!items.length && <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>Nenhum NDE ativo. Cadastre um NDE por curso na aba Cadastro.</Typography>}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
          {items.map((n) => (
            <Paper key={n.nde.id} variant="outlined" sx={{ p: 2, borderRadius: 3, borderTop: `5px solid ${n.conforme ? SEMAFORO.VERDE : SEMAFORO.VERMELHO}` }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                {n.conforme ? <CheckCircleIcon color="success" /> : <ErrorIcon color="error" />}
                <Typography sx={{ fontWeight: 800, flex: 1 }}>{n.nde.nome || progLabel(n.nde.programId)}</Typography>
                <Chip size="small" label={`${n.ativos} docente(s)`} />
              </Box>
              <Metrica nome="Mestres/doutores" valor={n.metricas.pctStricto} minimo={60} />
              <Metrica nome="Tempo integral" valor={n.metricas.pctIntegral} minimo={20} />
              <Typography variant="caption" color="text.secondary">Doutores {n.metricas.pctDoutor}% · permanência média {n.metricas.tempoMedioMeses} meses</Typography>
              {n.violacoes.map((v: any, i: number) => <Alert key={i} severity={v.gravidade === "ERRO" ? "error" : "warning"} sx={{ mt: 0.8, py: 0 }}>{v.mensagem}</Alert>)}
              {!n.violacoes.length && <Alert severity="success" sx={{ mt: 1, py: 0 }}>Todos os requisitos atendidos.</Alert>}
            </Paper>
          ))}
        </Box>
        <Button size="small" sx={{ mt: 2 }} onClick={() => { reload(); ndes.reload(); }}>Revalidar agora</Button>
      </Status>
    </Box>
  );
}

export default function NdeTab() {
  const [v, setV] = useState("conf");
  const progs = usePrograms();
  const ndes = useOptions("/governanca/ndes?pageSize=100", (n) => n.nome);
  const B = "/governanca";
  return (
    <Box>
      <Section title="Núcleo Docente Estruturante (NDE)">
        <Typography variant="body2" color="text.secondary">Requisitos (Resolução CONAES nº 1/2010): mínimo de 5 docentes, 60% com mestrado/doutorado e 20% em tempo integral. Os valores são conferidos a cada alteração de membro.</Typography>
      </Section>
      <ToggleButtonGroup size="small" exclusive value={v} onChange={(_, x) => x && setV(x)} sx={{ mb: 2 }}>
        <ToggleButton value="conf">Conformidade</ToggleButton><ToggleButton value="ndes">NDEs</ToggleButton><ToggleButton value="membros">Membros</ToggleButton><ToggleButton value="reunioes">Reuniões</ToggleButton>
      </ToggleButtonGroup>
      {v === "conf" && <Conformidade />}
      {v === "ndes" && <EduResourcePage title="NDEs por curso" base={B} resource="/ndes"
        fields={[{ key: "programId", label: "Curso", type: "select", options: progs, required: true, createOnly: true }, { key: "nome", label: "Nome", required: true }, { key: "portaria", label: "Portaria de designação" }]}
        columns={[{ key: "nome", label: "NDE" }, { key: "programId", label: "Curso", render: (r) => progs.find((p) => p.value === r.programId)?.label || "—" }, { key: "conforme", label: "Conforme", render: (r) => r.conforme == null ? "—" : r.conforme ? <Chip size="small" color="success" label="Sim" /> : <Chip size="small" color="error" label="Não" /> }]} />}
      {v === "membros" && <EduResourcePage title="Membros do NDE" base={B} resource="/nde-membros"
        description="Informe o ID do docente (identificador externo do cadastro de docentes)."
        fields={[{ key: "ndeId", label: "NDE", type: "select", options: ndes, required: true, createOnly: true }, { key: "docenteId", label: "ID do docente", required: true, createOnly: true }, { key: "nome", label: "Nome", required: true }, { key: "titulacao", label: "Titulação", type: "select", options: TITULACOES.map((t) => ({ value: t, label: label(t) })), required: true }, { key: "regime", label: "Regime de trabalho", type: "select", options: REGIMES.map((t) => ({ value: t, label: label(t) })), required: true }, { key: "inicio", label: "Início do mandato", type: "date", required: true, createOnly: true }, { key: "fim", label: "Fim do mandato", type: "date" }, { key: "presidente", label: "Presidente", type: "bool" }]}
        columns={[{ key: "nome", label: "Nome" }, { key: "titulacao", label: "Titulação", render: (r) => label(r.titulacao) }, { key: "regime", label: "Regime", render: (r) => label(r.regime) }, { key: "inicio", label: "Início", render: (r) => fmtDate(r.inicio) }, { key: "presidente", label: "Presidente" }]} />}
      {v === "reunioes" && <EduResourcePage title="Reuniões do NDE" base={B} resource="/nde-reunioes"
        fields={[{ key: "ndeId", label: "NDE", type: "select", options: ndes, required: true, createOnly: true }, { key: "data", label: "Data", type: "datetime", required: true }, { key: "pauta", label: "Pauta", type: "textarea" }, { key: "ata", label: "Ata", type: "textarea" }, { key: "realizada", label: "Realizada", type: "bool" }]}
        columns={[{ key: "data", label: "Data", render: (r) => fmtDate(r.data) }, { key: "pauta", label: "Pauta" }, { key: "realizada", label: "Realizada" }]} />}
    </Box>
  );
}
