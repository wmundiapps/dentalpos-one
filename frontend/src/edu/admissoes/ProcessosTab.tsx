import { Box, Tab, Tabs } from "@mui/material";
import { useState } from "react";
import EduResourcePage, { StatusChip, type FieldDef } from "../EduResourcePage";
import { BASE, asList, fmtDate, money, useLoad } from "./common";

export const TIPOS = ["VESTIBULAR_TRADICIONAL", "VESTIBULAR_AGENDADO", "ENEM", "TRANSFERENCIA_EXTERNA", "PORTADOR_DIPLOMA", "POS_LATO_SENSU", "POS_STRICTO_SENSU"];
const STATUS = ["RASCUNHO", "ABERTO", "ENCERRADO", "CLASSIFICADO", "EM_CONVOCACAO", "FINALIZADO", "CANCELADO"];

/** Opções de períodos letivos (GET /academico/terms) — tolerante a falha. */
export function useTermOptions() {
  const t = useLoad<any>("/academico/terms");
  return asList(t.data).map((x: any) => ({ value: x.id, label: x.codigo || x.nome || x.id }));
}

export default function ProcessosTab() {
  const [sub, setSub] = useState(0);
  const termOpts = useTermOptions();
  const procs = useLoad<any>(`${BASE}/processos?pageSize=200`);
  const procOpts = asList(procs.data).map((p: any) => ({ value: p.id, label: `${p.codigo} — ${p.nome}` }));

  const processoFields: FieldDef[] = [
    { key: "codigo", label: "Código", required: true },
    { key: "nome", label: "Nome do processo", required: true },
    { key: "tipo", label: "Tipo", type: "select", options: TIPOS.map((t) => ({ value: t, label: t.replace(/_/g, " ") })), required: true },
    { key: "nivel", label: "Nível", type: "select", options: [{ value: "GRADUACAO", label: "Graduação" }, { value: "POS_LATO", label: "Pós lato sensu" }, { value: "POS_STRICTO", label: "Pós stricto sensu" }] },
    { key: "termId", label: "Período letivo", type: "select", options: termOpts },
    { key: "inscricaoInicio", label: "Início das inscrições", type: "date", required: true },
    { key: "inscricaoFim", label: "Fim das inscrições", type: "date", required: true },
    { key: "provaData", label: "Data da prova", type: "date" },
    { key: "resultadoData", label: "Divulgação do resultado", type: "date" },
    { key: "matriculaInicio", label: "Início da matrícula", type: "date" },
    { key: "matriculaFim", label: "Fim da matrícula", type: "date" },
    { key: "taxaInscricao", label: "Taxa de inscrição (R$)", type: "number" },
    { key: "notaMinima", label: "Nota mínima (0-100)", type: "number" },
    { key: "diasPrazoMatricula", label: "Prazo de matrícula após convocação (dias)", type: "number" },
    { key: "criteriosDesempate", label: "Critérios de desempate", type: "json-list", helper: "Separados por vírgula" },
    { key: "edital", label: "Edital (número/título)" },
    { key: "editalUrl", label: "Link do edital" },
    { key: "observacoes", label: "Observações", type: "textarea" },
  ];

  const ofertaFields: FieldDef[] = [
    { key: "processoId", label: "Processo seletivo", type: "select", options: procOpts, required: true, createOnly: true },
    { key: "nomeCurso", label: "Curso", required: true },
    { key: "turno", label: "Turno", type: "select", options: ["MATUTINO", "VESPERTINO", "NOTURNO", "INTEGRAL", "FLEXIVEL"] },
    { key: "modalidade", label: "Modalidade", type: "select", options: ["PRESENCIAL", "SEMIPRESENCIAL", "EAD"] },
    { key: "poloNome", label: "Polo / campus" },
    { key: "vagas", label: "Vagas", type: "number", required: true },
    { key: "valorMensalidade", label: "Mensalidade (R$)", type: "number" },
    { key: "parcelas", label: "Parcelas", type: "number" },
  ];

  return (
    <Box>
      <Tabs value={sub} onChange={(_, v) => setSub(v)} sx={{ mb: 2 }}>
        <Tab label="Processos seletivos" />
        <Tab label="Ofertas de vagas" />
      </Tabs>
      {sub === 0 ? (
        <EduResourcePage
          title="Processos seletivos" description="Ciclo: Rascunho → Aberto → Encerrado → Classificado → Em convocação → Finalizado."
          base={BASE} resource="/processos" fields={processoFields} filters={[{ key: "status", label: "Situação", options: STATUS }, { key: "tipo", label: "Tipo", options: TIPOS }]}
          columns={[
            { key: "codigo", label: "Código" }, { key: "nome", label: "Nome" },
            { key: "tipo", label: "Tipo", render: (r) => String(r.tipo).replace(/_/g, " ") },
            { key: "inscricao", label: "Inscrições", render: (r) => `${fmtDate(r.inscricaoInicio)} a ${fmtDate(r.inscricaoFim)}` },
            { key: "taxaInscricao", label: "Taxa", render: (r) => money(r.taxaInscricao) },
            { key: "ofertas", label: "Ofertas", render: (r) => r.ofertas?.length ?? 0 },
            { key: "cands", label: "Candidatos", render: (r) => r._count?.candidatos ?? 0 },
            { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> },
          ]}
          rowActions={[
            { label: "Abrir", path: "/processos/:id/abrir", color: "success", hidden: (r) => r.status !== "RASCUNHO", confirm: "Abrir as inscrições deste processo?" },
            { label: "Encerrar", path: "/processos/:id/encerrar", color: "warning", hidden: (r) => r.status !== "ABERTO", confirm: "Encerrar as inscrições?" },
            { label: "Finalizar", path: "/processos/:id/finalizar", hidden: (r) => !["CLASSIFICADO", "EM_CONVOCACAO"].includes(r.status), confirm: "Finalizar o processo? Chamadas abertas serão encerradas." },
            { label: "Cancelar", path: "/processos/:id/cancelar", color: "error", hidden: (r) => ["CANCELADO", "FINALIZADO"].includes(r.status), confirm: "Cancelar este processo seletivo?" },
          ]}
        />
      ) : (
        <EduResourcePage
          title="Ofertas de vagas" description="Cursos, turnos e vagas disponíveis em cada processo."
          base={BASE} resource="/ofertas" fields={ofertaFields}
          filters={[{ key: "turno", label: "Turno", options: ["MATUTINO", "VESPERTINO", "NOTURNO", "INTEGRAL", "FLEXIVEL"] }, { key: "modalidade", label: "Modalidade", options: ["PRESENCIAL", "SEMIPRESENCIAL", "EAD"] }]}
          columns={[
            { key: "nomeCurso", label: "Curso" },
            { key: "processoId", label: "Processo", render: (r) => procOpts.find((p) => p.value === r.processoId)?.label || "—" },
            { key: "turno", label: "Turno" }, { key: "modalidade", label: "Modalidade" },
            { key: "vagas", label: "Vagas" },
            { key: "valorMensalidade", label: "Mensalidade", render: (r) => `${money(r.valorMensalidade)} × ${r.parcelas ?? "—"}` },
          ]}
        />
      )}
    </Box>
  );
}
