import { Alert, Box, Button, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useState } from "react";
import EduResourcePage from "../EduResourcePage";
import { eduApi, qsOf } from "../../services/EduApi";
import { Async, FormDialog, Light, Panel, ProgressBar, Stat, StatGrid, SubNav, Tag, brl, label, num, openHtml, useApi, usePrograms, useToast } from "./kit";

const SPACE_TIPOS = ["SALA_AULA", "LABORATORIO", "AUDITORIO", "BIBLIOTECA", "CLINICA_ESCOLA", "QUADRA", "PATIO", "ESTACIONAMENTO", "SALA_REUNIAO", "SALA_PROFESSORES", "ADMINISTRATIVO", "POLO_EAD", "OUTRO"];
const SIT: Record<string, "success" | "warning" | "error"> = { ATENDE: "success", PARCIAL: "warning", NAO_ATENDE: "error" };

function Curso({ programId, programs }: { programId: string; programs: any[] }) {
  const [vagas, setVagas] = useState("");
  const st = useApi<any>(`/infraestrutura/adequacao/${programId}${qsOf({ vagas })}`);
  const toast = useToast();
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <TextField size="small" type="number" label="Vagas/alunos considerados" value={vagas} onChange={(e) => setVagas(e.target.value)} helperText="Vazio: usa as vagas do curso" sx={{ width: 230 }} />
        <Box sx={{ flex: 1 }} />
        <Button onClick={() => toast.run(() => openHtml(`/infraestrutura/adequacao/${programId}${qsOf({ vagas, format: "html" })}`), "Relatório aberto em nova aba.")}>Relatório imprimível</Button>
        <Button variant="contained" onClick={() => toast.run(() => eduApi.post(`/infraestrutura/adequacao/${programId}/gerar-projetos${qsOf({ vagas })}`, {}), "Projetos de melhoria gerados a partir das lacunas.", undefined, "Gerar projetos de melhoria (5W2H) para as lacunas encontradas?")}>Gerar projetos das lacunas</Button>
      </Box>
      <Async state={st}>
        {(r) => (
          <>
            {r.aviso && <Alert severity="info">{r.aviso}</Alert>}
            <StatGrid>
              <Stat label="Conceito sugerido" value={r.conceitoSugerido ?? "—"} tone={r.conceitoSugerido >= 4 ? "success" : r.conceitoSugerido >= 3 ? "warning" : "error"} />
              <Stat label="Obrigatórios atendidos" value={`${num(r.totais?.obrigatoriosAtendidosPct, 0)}%`} />
              <Stat label="Requisitos" value={`${r.totais?.atendem ?? 0} ok / ${r.totais?.parciais ?? 0} parc. / ${r.totais?.naoAtendem ?? 0} não`} />
              <Stat label="Investimento das lacunas" value={brl(r.investimentoEstimadoLacunas)} />
            </StatGrid>
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead><TableRow><TableCell>Requisito</TableCell><TableCell align="center">Obrig.</TableCell><TableCell align="right">Exigido</TableCell><TableCell align="right">Existente</TableCell><TableCell align="right">Lacuna</TableCell><TableCell sx={{ minWidth: 140 }}>Cobertura</TableCell><TableCell>Situação</TableCell><TableCell>Ref. MEC</TableCell></TableRow></TableHead>
                <TableBody>
                  {(r.linhas || []).map((l: any) => (
                    <TableRow key={l.requisitoId} hover>
                      <TableCell>{l.descricao}</TableCell><TableCell align="center">{l.obrigatorio ? "Sim" : "Não"}</TableCell>
                      <TableCell align="right">{l.exigido}</TableCell><TableCell align="right">{l.existente}{l.emManutencao ? ` (+${l.emManutencao} em manut.)` : ""}</TableCell>
                      <TableCell align="right">{l.lacuna}</TableCell><TableCell><ProgressBar value={l.coberturaPct} color={SIT[l.situacao] || "primary"} /></TableCell>
                      <TableCell><Light tone={SIT[l.situacao] || "default"} text={label(l.situacao)} /></TableCell><TableCell>{l.referenciaMec || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {!(r.linhas || []).length && <TableRow><TableCell colSpan={8}><Typography color="text.secondary" sx={{ textAlign: "center", py: 2 }}>Sem requisitos cadastrados para {programs.find((p) => p.value === programId)?.label}.</Typography></TableCell></TableRow>}
                </TableBody>
              </Table>
            </Box>
          </>
        )}
      </Async>
      {toast.node}
    </Box>
  );
}

function Visao({ onPick }: { onPick: (id: string) => void }) {
  const st = useApi<any>("/infraestrutura/adequacao");
  return (
    <Async state={st}>
      {(d) => (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 2 }}>
          {(d.cursos || []).map((c: any) => (
            <Panel key={c.programa?.id} title={c.programa?.nome} actions={<Tag text={`Conceito ${c.conceitoSugerido ?? "—"}`} tone={c.conceitoSugerido >= 4 ? "success" : c.conceitoSugerido >= 3 ? "warning" : "error"} />}>
              <ProgressBar value={c.totais?.obrigatoriosAtendidosPct || 0} color={c.totais?.obrigatoriosAtendidosPct >= 80 ? "success" : c.totais?.obrigatoriosAtendidosPct >= 50 ? "warning" : "error"} />
              <Typography variant="body2" sx={{ mt: 1 }}>{num(c.totais?.obrigatoriosAtendidosPct, 0)}% dos requisitos obrigatórios · lacunas: {brl(c.investimentoEstimadoLacunas)}</Typography>
              <Button size="small" sx={{ mt: 1 }} onClick={() => onPick(c.programa?.id)}>Ver detalhes</Button>
            </Panel>
          ))}
          {!(d.cursos || []).length && <Typography color="text.secondary">Nenhum curso com requisitos cadastrados. Cadastre-os na aba "Requisitos".</Typography>}
        </Box>
      )}
    </Async>
  );
}

export default function AdequacaoTab() {
  const [sub, setSub] = useState("visao");
  const [programId, setProgramId] = useState("");
  const [copia, setCopia] = useState(false);
  const programs = usePrograms();
  const toast = useToast();
  return (
    <Box>
      <SubNav value={sub} onChange={setSub} items={[{ key: "visao", label: "Visão geral" }, { key: "curso", label: "Por curso" }, { key: "requisitos", label: "Requisitos" }]} />
      {sub === "visao" && <Visao onPick={(id) => { setProgramId(id); setSub("curso"); }} />}
      {sub === "curso" && (
        <Box sx={{ display: "grid", gap: 2 }}>
          <TextField select size="small" label="Curso" value={programId} onChange={(e) => setProgramId(e.target.value)} sx={{ maxWidth: 420 }}>
            {programs.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
          </TextField>
          {programId ? <Curso key={programId} programId={programId} programs={programs} /> : <Typography color="text.secondary">Selecione um curso para ver a adequação da infraestrutura.</Typography>}
        </Box>
      )}
      {sub === "requisitos" && (
        <Box sx={{ display: "grid", gap: 2 }}>
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}><Button variant="outlined" onClick={() => setCopia(true)}>Copiar requisitos entre cursos</Button></Box>
          <EduResourcePage title="Requisitos de infraestrutura por curso" description="Equipamentos e espaços exigidos, usados no cálculo de adequação e na avaliação do MEC." base="/infraestrutura" resource="/requisitos-curso" dense
            filters={[{ key: "tipo", label: "Tipo", options: ["EQUIPAMENTO", "ESPACO"] }, { key: "obrigatorio", label: "Obrigatório", options: ["true", "false"] }]}
            columns={[{ key: "programId", label: "Curso", render: (r) => programs.find((p) => p.value === r.programId)?.label || r.programId }, { key: "descricao", label: "Requisito" }, { key: "tipo", label: "Tipo", render: (r) => <Tag text={label(r.tipo)} /> },
              { key: "quantidadeMinima", label: "Qtd mín." }, { key: "porVagas", label: "A cada N vagas" }, { key: "obrigatorio", label: "Obrigatório", render: (r) => (r.obrigatorio ? "Sim" : "Não") }, { key: "referenciaMec", label: "Ref. MEC" }]}
            fields={[{ key: "programId", label: "Curso", type: "select", options: programs, required: true }, { key: "descricao", label: "Descrição", required: true }, { key: "tipo", label: "Tipo", type: "select", options: ["EQUIPAMENTO", "ESPACO"] },
              { key: "categoriaCodigo", label: "Código da categoria de bens (equipamento)" }, { key: "spaceTipo", label: "Tipo de espaço (espaço)", type: "select", options: SPACE_TIPOS },
              { key: "quantidadeMinima", label: "Quantidade mínima", type: "number" }, { key: "porVagas", label: "1 unidade a cada N vagas", type: "number" }, { key: "capacidadeMinima", label: "Capacidade mínima do espaço", type: "number" },
              { key: "obrigatorio", label: "Obrigatório", type: "bool" }, { key: "referenciaMec", label: "Referência MEC (indicador/critério)" }, { key: "ativo", label: "Ativo", type: "bool" }]} />
        </Box>
      )}
      <FormDialog open={copia} title="Copiar requisitos entre cursos" onClose={() => setCopia(false)} submitLabel="Copiar"
        fields={[{ key: "origemProgramId", label: "Curso de origem", type: "select", options: programs, required: true }, { key: "destinoProgramId", label: "Curso de destino", type: "select", options: programs, required: true }]}
        onSubmit={async (b) => { await eduApi.post("/infraestrutura/requisitos-curso/copiar", b); toast.ok("Requisitos copiados."); }} />
      {toast.node}
    </Box>
  );
}
