import { Alert, Box, Chip, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import EduResourcePage, { StatusChip } from "../EduResourcePage";
import { Card, Loadable, MiniTable, Section, Semaforo, fmtD, fmtDT, nameOf, useAsync, usePosProgramas } from "./kit";

const BASE = "/modalidades";
const NIVEIS = ["ESPECIALIZACAO", "MBA", "MESTRADO_ACADEMICO", "MESTRADO_PROFISSIONAL", "DOUTORADO"];
const brl = (v: any) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Conformidade() {
  const progs = usePosProgramas();
  const [id, setId] = useState("");
  const { data, loading, error } = useAsync(() => (id ? eduApi.get(`${BASE}/pos/programas/${id}/conformidade`) : Promise.resolve(null)), [id]);
  return (
    <Section title="Conformidade do programa" hint="Lato sensu: carga mínima, módulos e corpo docente. Stricto sensu: linhas de pesquisa, docentes permanentes, créditos e carga de orientação."
      actions={<TextField select size="small" label="Programa" value={id} onChange={(e) => setId(e.target.value)} sx={{ minWidth: 260 }}>{progs.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}</TextField>}>
      {!id ? <Typography color="text.secondary">Selecione um programa.</Typography> : (
        <Loadable loading={loading} error={error}>
          {data ? (
            <Box>
              <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 1.5 }}>
                <Card label={data.tipo === "STRICTO" ? "Stricto sensu" : "Lato sensu"} value={<Semaforo nivel={data.conforme ? "ok" : "critico"} label={data.conforme ? "Conforme" : "Não conforme"} />} color={data.conforme ? "#16a34a" : "#dc2626"} />
                {data.creditosOfertados != null ? <Card label="Créditos ofertados" value={data.creditosOfertados} /> : null}
                {data.docentesPermanentes != null ? <Card label="Docentes permanentes" value={data.docentesPermanentes} color="#7c3aed" /> : null}
                {data.somaModulos != null ? <Card label="Soma dos módulos (h)" value={data.somaModulos} /> : null}
              </Box>
              {(data.alertas || []).map((a: any, i: number) => <Alert key={i} sx={{ mb: 0.5 }} severity={a.severidade === "CRITICO" ? "error" : a.severidade === "ATENCAO" ? "warning" : "info"}>{a.mensagem}</Alert>)}
              {!(data.alertas || []).length ? <Alert severity="success">Sem pendências.</Alert> : null}
            </Box>
          ) : null}
        </Loadable>
      )}
    </Section>
  );
}

/** Pós-graduação lato e stricto sensu. */
export default function PosTab() {
  const [sub, setSub] = useState("programas");
  const progs = usePosProgramas();
  const posCol = { key: "posId", label: "Programa", render: (r: any) => nameOf(progs, r.posId) };
  const posField = { key: "posId", label: "Programa", type: "select" as const, options: progs, required: true, createOnly: true };
  return (
    <Box>
      <ToggleButtonGroup exclusive size="small" color="primary" value={sub} onChange={(_, v) => v && setSub(v)} sx={{ mb: 2, flexWrap: "wrap" }}>
        {[["programas", "Programas"], ["docentes", "Docentes"], ["turmas", "Turmas (lato)"], ["ofertas", "Ofertas"], ["alunos", "Alunos"], ["bancas", "Bancas"], ["bolsas", "Bolsas"]].map(([v, l]) => <ToggleButton key={v} value={v}>{l}</ToggleButton>)}
      </ToggleButtonGroup>

      {sub === "programas" && (
        <>
          <Conformidade />
          <EduResourcePage title="Programas de pós-graduação" base={BASE} resource="/pos/programas" dense
            filters={[{ key: "nivel", label: "Nível", options: NIVEIS }, { key: "status", label: "Situação", options: ["EM_ELABORACAO", "ATIVO", "SUSPENSO", "ENCERRADO"] }]}
            columns={[
              { key: "codigo", label: "Código" }, { key: "nome", label: "Programa" }, { key: "nivel", label: "Nível", render: (r) => String(r.nivel).replace(/_/g, " ") },
              { key: "cargaHoraria", label: "Carga (h)" }, { key: "conceitoCapes", label: "CAPES" }, { key: "alunos", label: "Alunos", render: (r) => r._count?.alunos ?? 0 },
              { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> },
            ]}
            fields={[
              { key: "codigo", label: "Código", required: true }, { key: "nome", label: "Nome", required: true },
              { key: "nivel", label: "Nível", type: "select", options: NIVEIS, required: true }, { key: "modalidade", label: "Modalidade", type: "select", options: ["PRESENCIAL", "SEMIPRESENCIAL", "EAD", "HIBRIDO"] },
              { key: "coordenadorNome", label: "Coordenador" }, { key: "cargaHoraria", label: "Carga horária (h)", type: "number" }, { key: "creditosMinimos", label: "Créditos mínimos", type: "number" },
              { key: "prazoMaxMeses", label: "Prazo máximo (meses)", type: "number" }, { key: "conceitoCapes", label: "Conceito CAPES (1-7)", type: "number" },
              { key: "portariaReconhecimento", label: "Portaria de reconhecimento" }, { key: "areaAvaliacao", label: "Área de avaliação" },
              { key: "exigeTcc", label: "Exige TCC", type: "bool" }, { key: "status", label: "Situação", type: "select", options: ["EM_ELABORACAO", "ATIVO", "SUSPENSO", "ENCERRADO"] },
            ]} />
        </>
      )}

      {sub === "docentes" && (
        <EduResourcePage title="Corpo docente" base={BASE} resource="/pos/docentes" dense
          filters={[{ key: "categoria", label: "Categoria", options: ["PERMANENTE", "COLABORADOR", "VISITANTE"] }]}
          columns={[posCol, { key: "nome", label: "Docente" }, { key: "titulacao", label: "Titulação" }, { key: "categoria", label: "Categoria" }, { key: "orientador", label: "Orientador" }, { key: "capacidadeOrientandos", label: "Capac. orient." }]}
          fields={[
            posField, { key: "nome", label: "Nome", required: true }, { key: "titulacao", label: "Titulação", type: "select", options: ["ESPECIALISTA", "MESTRE", "DOUTOR", "POS_DOUTOR"] },
            { key: "categoria", label: "Categoria", type: "select", options: ["PERMANENTE", "COLABORADOR", "VISITANTE"] }, { key: "orientador", label: "Orientador", type: "bool" },
            { key: "capacidadeOrientandos", label: "Capacidade de orientandos", type: "number" }, { key: "lattes", label: "Currículo Lattes (URL)" }, { key: "ativo", label: "Ativo", type: "bool" },
          ]} />
      )}

      {sub === "turmas" && (
        <EduResourcePage title="Turmas / ingressos" base={BASE} resource="/pos/turmas" dense searchable={false}
          filters={[{ key: "status", label: "Situação", options: ["PLANEJADA", "INSCRICOES", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"] }]}
          columns={[posCol, { key: "codigo", label: "Turma" }, { key: "inicio", label: "Início", render: (r) => fmtD(r.inicio) }, { key: "vagas", label: "Vagas" }, { key: "valorMensalidade", label: "Mensalidade", render: (r) => (r.valorMensalidade != null ? brl(r.valorMensalidade) : "—") }, { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> }]}
          fields={[
            posField, { key: "codigo", label: "Código", required: true }, { key: "inicio", label: "Início", type: "date", required: true }, { key: "fim", label: "Fim", type: "date" },
            { key: "vagas", label: "Vagas", type: "number" }, { key: "valorMensalidade", label: "Mensalidade (R$)", type: "number" }, { key: "parcelas", label: "Parcelas", type: "number" },
            { key: "status", label: "Situação", type: "select", options: ["PLANEJADA", "INSCRICOES", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"] },
          ]} />
      )}

      {sub === "ofertas" && (
        <EduResourcePage title="Ofertas de pós (captação)" description="Publique para aparecer nas ofertas divulgadas a candidatos." base={BASE} resource="/pos/ofertas" dense
          filters={[{ key: "status", label: "Situação", options: ["RASCUNHO", "PUBLICADA", "ENCERRADA"] }]}
          columns={[posCol, { key: "titulo", label: "Título" }, { key: "vagas", label: "Vagas" }, { key: "valor", label: "Valor", render: (r) => (r.valor != null ? brl(r.valor) : "—") }, { key: "inscricoesAte", label: "Inscrições até", render: (r) => fmtD(r.inscricoesAte) }, { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> }]}
          fields={[
            posField, { key: "titulo", label: "Título", required: true }, { key: "vagas", label: "Vagas", type: "number", required: true }, { key: "valor", label: "Valor (R$)", type: "number" },
            { key: "inscricoesDe", label: "Inscrições de", type: "date" }, { key: "inscricoesAte", label: "Inscrições até", type: "date" }, { key: "requisitos", label: "Requisitos", type: "textarea" },
          ]}
          rowActions={[
            { label: "Publicar", path: "/pos/ofertas/:id/publicar", color: "success", hidden: (r) => r.status === "PUBLICADA" || r.status === "ENCERRADA" },
            { label: "Encerrar", path: "/pos/ofertas/:id/encerrar", color: "warning", confirm: "Encerrar as inscrições desta oferta?", hidden: (r) => r.status !== "PUBLICADA" },
          ]} />
      )}

      {sub === "alunos" && (
        <Section title="Alunos de pós-graduação" hint="Prazos de qualificação, defesa e depósito. Ações (prorrogar, depositar, titular) via API /pos/alunos/:id/…">
          <MiniTable url={`${BASE}/pos/alunos`} empty="Nenhum aluno de pós matriculado."
            columns={[
              { label: "Aluno (ID)", render: (r) => String(r.studentId).slice(0, 8) }, { label: "Programa", render: (r) => nameOf(progs, r.posId) }, { label: "Situação", render: (r) => <StatusChip value={r.status} /> },
              { label: "Ingresso", render: (r) => fmtD(r.ingressoEm) }, { label: "Prazo qualificação", render: (r) => fmtD(r.prazoQualificacao) }, { label: "Prazo defesa", render: (r) => fmtD(r.prazoDefesa) },
              { label: "TCC", render: (r) => <Chip size="small" label={String(r.tccStatus || "").replace(/_/g, " ")} /> },
            ]} />
        </Section>
      )}

      {sub === "bancas" && (
        <Section title="Bancas de qualificação e defesa">
          <MiniTable url={`${BASE}/pos/bancas`} empty="Nenhuma banca agendada."
            columns={[{ label: "Tipo", render: (r) => r.tipo }, { label: "Data/hora", render: (r) => fmtDT(r.dataHora) }, { label: "Local", render: (r) => r.local || "—" }, { label: "Resultado", render: (r) => <StatusChip value={r.resultado || r.status} /> }]} />
        </Section>
      )}

      {sub === "bolsas" && (
        <BolsasPanel />
      )}
    </Box>
  );
}

function BolsasPanel() {
  const { data, loading, error } = useAsync(() => eduApi.get(`${BASE}/pos/bolsas`), []);
  return (
    <Section title="Bolsas de pós-graduação">
      <Loadable loading={loading} error={error}>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2 }}>
          <Card label="Bolsas ativas" value={data?.resumo?.ativas ?? 0} color="#16a34a" />
          <Card label="Custo mensal ativo" value={brl(data?.resumo?.custoMensalAtivo)} color="#7c3aed" />
        </Box>
        <MiniTable url={`${BASE}/pos/bolsas`} pick={(d) => d?.items || []} empty="Nenhuma bolsa."
          columns={[{ label: "Agência", render: (r) => r.agencia || "—" }, { label: "Aluno (ID)", render: (r) => String(r.alunoId || "").slice(0, 8) }, { label: "Valor mensal", render: (r) => brl(r.valorMensal), align: "right" }, { label: "Fim", render: (r) => fmtD(r.fim) }, { label: "Situação", render: (r) => <StatusChip value={r.status} /> }]} />
      </Loadable>
    </Section>
  );
}
