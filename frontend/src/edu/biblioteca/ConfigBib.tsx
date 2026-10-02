import { Box, Button } from "@mui/material";
import { useState } from "react";
import EduResourcePage from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import { Async, FormDialog, Panel, Stat, StatGrid, brl, label, num, useApi, useToast } from "../infraestrutura/kit";

export default function ConfigBib() {
  const cfg = useApi<any>("/biblioteca/config");
  const [edit, setEdit] = useState(false);
  const toast = useToast();
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Panel title="Parâmetros da biblioteca" subtitle="Valem para multas, tombamento e para o cálculo de adequação da bibliografia."
        actions={<><Button onClick={() => toast.run(() => eduApi.post("/biblioteca/bootstrap", {}), "Políticas padrão carregadas.", cfg.reload, "Carregar as políticas de circulação padrão (aluno, professor, funcionário, externo)?")}>Carregar políticas padrão</Button>
          <Button onClick={() => toast.run(() => eduApi.post("/biblioteca/jobs/executar", {}), "Rotinas de atrasos, reservas e multas executadas.")}>Executar rotinas agora</Button>
          <Button variant="contained" onClick={() => setEdit(true)}>Editar</Button></>}>
        <Async state={cfg}>
          {(c) => (
            <StatGrid>
              <Stat label="Multa por dia" value={brl(c.valorMultaDiaPadrao)} /><Stat label="Bloqueio acima de" value={c.valorMaxMultaAberta ? brl(c.valorMaxMultaAberta) : "Sem limite"} /><Stat label="Tolerância" value={`${c.diasTolerancia} dia(s)`} />
              <Stat label="Contagem de prazo" value={c.considerarDiasUteis ? "Dias úteis" : "Dias corridos"} /><Stat label="Mín. títulos básicos" value={num(c.minTitulosBasicos, 0)} /><Stat label="Mín. títulos compl." value={num(c.minTitulosComplementares, 0)} />
              <Stat label="Vagas por exemplar" value={num(c.vagasPorExemplar)} /><Stat label="Próximo tombo" value={`${c.prefixoTombo || ""}${c.proximoTombo}`} /><Stat label="Bibliotecário(a)" value={c.bibliotecarioNome || "—"} hint={c.bibliotecarioCrb || undefined} />
            </StatGrid>
          )}
        </Async>
      </Panel>
      <FormDialog open={edit} onClose={() => setEdit(false)} title="Parâmetros da biblioteca" initial={cfg.data}
        fields={[{ key: "valorMultaDiaPadrao", label: "Multa por dia de atraso (R$)", type: "number" }, { key: "valorMaxMultaAberta", label: "Bloquear leitor com multas acima de (R$, 0 = sem limite)", type: "number" }, { key: "diasTolerancia", label: "Dias de tolerância", type: "number" },
          { key: "considerarDiasUteis", label: "Contar prazos e multas só em dias úteis", type: "bool" }, { key: "feriados", label: "Feriados (AAAA-MM-DD, separados por vírgula)", type: "list", full: true },
          { key: "minTitulosBasicos", label: "Mín. de títulos na bibliografia básica", type: "number" }, { key: "minTitulosComplementares", label: "Mín. de títulos na complementar", type: "number" }, { key: "vagasPorExemplar", label: "1 exemplar a cada N vagas", type: "number" },
          { key: "prefixoTombo", label: "Prefixo do tombo" }, { key: "proximoTombo", label: "Próximo número de tombo", type: "number" }, { key: "bibliotecarioNome", label: "Bibliotecário(a) responsável" }, { key: "bibliotecarioCrb", label: "CRB" }]}
        onSubmit={async (b) => { await eduApi.put("/biblioteca/config", b); toast.ok("Parâmetros salvos."); cfg.reload(); }} />
      <EduResourcePage title="Políticas de circulação por perfil" description="Prazo, limite de empréstimos, renovações e multas para cada tipo de leitor." base="/biblioteca" resource="/politicas" dense searchable={false}
        columns={[{ key: "perfil", label: "Perfil", render: (r) => label(r.perfil) }, { key: "prazoDias", label: "Prazo (dias)" }, { key: "limiteEmprestimos", label: "Limite" }, { key: "maxRenovacoes", label: "Renovações" }, { key: "multaDia", label: "Multa/dia", render: (r) => brl(r.multaDia) }, { key: "limiteReservas", label: "Reservas" }, { key: "ativo", label: "Ativa" }]}
        fields={[{ key: "perfil", label: "Perfil", type: "select", options: ["ALUNO", "PROFESSOR", "FUNCIONARIO", "EXTERNO"], required: true }, { key: "prazoDias", label: "Prazo (dias)", type: "number", required: true }, { key: "limiteEmprestimos", label: "Limite de empréstimos", type: "number", required: true },
          { key: "maxRenovacoes", label: "Máx. de renovações", type: "number", required: true }, { key: "diasRenovacao", label: "Dias por renovação", type: "number" }, { key: "multaDia", label: "Multa por dia (R$)", type: "number", required: true }, { key: "multaMaxima", label: "Multa máxima (R$)", type: "number" },
          { key: "limiteReservas", label: "Limite de reservas", type: "number", required: true }, { key: "diasRetiradaReserva", label: "Dias para retirar reserva", type: "number", required: true }, { key: "bloqueioDiasPorAtraso", label: "Dias de bloqueio por atraso", type: "number" }, { key: "ativo", label: "Ativa", type: "bool" }]} />
      {toast.node}
    </Box>
  );
}
