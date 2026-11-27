import { Box, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { useState } from "react";
import EduResourcePage, { StatusChip } from "../EduResourcePage";
import { fmtDT, nameOf, useDisciplines, usePolos, usePrograms, useTerms } from "./kit";

const MODS = ["PRESENCIAL", "SEMIPRESENCIAL", "EAD", "HIBRIDO"];
const BASE = "/modalidades";

/** Ofertas por disciplina, encontros presenciais, aulas ao vivo, práticas e estágios. */
export default function OfertasTab() {
  const [sub, setSub] = useState("ofertas");
  const cursos = usePrograms(); const discs = useDisciplines(); const terms = useTerms(); const polos = usePolos();
  return (
    <Box>
      <ToggleButtonGroup exclusive size="small" color="primary" value={sub} onChange={(_, v) => v && setSub(v)} sx={{ mb: 2, flexWrap: "wrap" }}>
        <ToggleButton value="ofertas">Ofertas por disciplina</ToggleButton>
        <ToggleButton value="encontros">Encontros presenciais</ToggleButton>
        <ToggleButton value="lives">Aulas ao vivo</ToggleButton>
        <ToggleButton value="praticas">Práticas</ToggleButton>
        <ToggleButton value="estagios">Estágios</ToggleButton>
      </ToggleButtonGroup>

      {sub === "ofertas" && (
        <EduResourcePage title="Ofertas por disciplina" description="Distribuição de carga presencial/online por disciplina. A soma deve igualar a carga da disciplina." base={BASE} resource="/ofertas" dense searchable={false}
          filters={[{ key: "modalidade", label: "Modalidade", options: MODS }]}
          columns={[
            { key: "disciplineId", label: "Disciplina", render: (r) => nameOf(discs, r.disciplineId) },
            { key: "programId", label: "Curso", render: (r) => nameOf(cursos, r.programId) },
            { key: "modalidade", label: "Modalidade", render: (r) => <StatusChip value={r.modalidade} /> },
            { key: "cargaPresencial", label: "Presencial (h)" }, { key: "cargaOnline", label: "Online (h)" },
            { key: "minEncontros", label: "Encontros mín." }, { key: "ativo", label: "Ativa" },
          ]}
          fields={[
            { key: "disciplineId", label: "Disciplina", type: "select", options: discs, required: true },
            { key: "programId", label: "Curso", type: "select", options: cursos },
            { key: "termId", label: "Período letivo", type: "select", options: terms },
            { key: "modalidade", label: "Modalidade", type: "select", options: MODS, required: true },
            { key: "cargaPresencial", label: "Carga presencial (h)", type: "number" }, { key: "cargaOnline", label: "Carga online (h)", type: "number" },
            { key: "minEncontros", label: "Encontros presenciais mínimos", type: "number" }, { key: "avaliacoesPresenciais", label: "Avaliações presenciais", type: "number" },
            { key: "poloId", label: "Polo", type: "select", options: polos }, { key: "ativo", label: "Ativa", type: "bool" },
            { key: "observacoes", label: "Observações", type: "textarea" },
          ]} />
      )}

      {sub === "encontros" && (
        <EduResourcePage title="Encontros e provas presenciais" base={BASE} resource="/encontros" dense searchable={false}
          filters={[{ key: "status", label: "Situação", options: ["AGENDADO", "REALIZADO", "CANCELADO"] }, { key: "tipo", label: "Tipo", options: ["ENCONTRO_PRESENCIAL", "PROVA_PRESENCIAL", "AULA_PRATICA", "DEFESA_TCC", "OUTRO"] }]}
          columns={[
            { key: "titulo", label: "Título" }, { key: "tipo", label: "Tipo", render: (r) => String(r.tipo).replace(/_/g, " ") },
            { key: "inicio", label: "Início", render: (r) => fmtDT(r.inicio) }, { key: "fim", label: "Fim", render: (r) => fmtDT(r.fim) },
            { key: "poloId", label: "Polo", render: (r) => nameOf(polos, r.poloId) }, { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> },
          ]}
          fields={[
            { key: "ofertaId", label: "ID da oferta", required: true, createOnly: true, helper: "Copie o ID na lista de ofertas." },
            { key: "tipo", label: "Tipo", type: "select", options: ["ENCONTRO_PRESENCIAL", "PROVA_PRESENCIAL", "AULA_PRATICA", "DEFESA_TCC", "OUTRO"], required: true },
            { key: "titulo", label: "Título", required: true }, { key: "inicio", label: "Início", type: "datetime", required: true }, { key: "fim", label: "Fim", type: "datetime", required: true },
            { key: "poloId", label: "Polo", type: "select", options: polos }, { key: "obrigatorio", label: "Obrigatório", type: "bool" },
          ]}
          rowActions={[
            { label: "Realizado", path: "/encontros/:id/realizar", color: "success", hidden: (r) => r.status !== "AGENDADO" },
            { label: "Cancelar", path: "/encontros/:id/cancelar", color: "error", confirm: "Cancelar este encontro?", hidden: (r) => r.status !== "AGENDADO" },
          ]} />
      )}

      {sub === "lives" && (
        <EduResourcePage title="Aulas ao vivo (webconferência)" description="Controle de presença por eventos de entrada/saída e consolidação ao final." base={BASE} resource="/lives" dense searchable={false}
          filters={[{ key: "status", label: "Situação", options: ["AGENDADA", "AO_VIVO", "ENCERRADA"] }]}
          columns={[
            { key: "titulo", label: "Título" }, { key: "plataforma", label: "Plataforma" },
            { key: "inicio", label: "Início", render: (r) => fmtDT(r.inicio) }, { key: "presencaMinimaPct", label: "Presença mín. (%)" },
            { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> },
          ]}
          fields={[
            { key: "titulo", label: "Título", required: true }, { key: "plataforma", label: "Plataforma (Meet, Teams, Zoom…)" },
            { key: "inicio", label: "Início", type: "datetime", required: true }, { key: "fim", label: "Fim", type: "datetime", required: true },
            { key: "linkUrl", label: "Link da sala" }, { key: "sala", label: "Sala/ID" }, { key: "presencaMinimaPct", label: "Presença mínima (%)", type: "number" },
            { key: "ofertaId", label: "ID da oferta (opcional)" }, { key: "classSectionId", label: "ID da turma (opcional)" },
          ]}
          rowActions={[
            { label: "Iniciar", path: "/lives/:id/iniciar", hidden: (r) => r.status !== "AGENDADA" },
            { label: "Encerrar", path: "/lives/:id/encerrar", color: "warning", hidden: (r) => r.status !== "AO_VIVO" },
            { label: "Consolidar presença", path: "/lives/:id/consolidar-presenca", color: "success", hidden: (r) => r.status !== "ENCERRADA" },
          ]} />
      )}

      {sub === "praticas" && (
        <EduResourcePage title="Agenda de práticas" description="Aulas práticas, laboratórios, visitas técnicas e estágios supervisionados." base={BASE} resource="/agendas-praticas" dense searchable={false}
          filters={[{ key: "tipo", label: "Tipo", options: ["AULA_PRATICA", "LABORATORIO", "ESTAGIO_SUPERVISIONADO", "VISITA_TECNICA"] }]}
          columns={[
            { key: "titulo", label: "Título" }, { key: "tipo", label: "Tipo", render: (r) => String(r.tipo).replace(/_/g, " ") },
            { key: "inicio", label: "Início", render: (r) => fmtDT(r.inicio) }, { key: "vagas", label: "Vagas" }, { key: "supervisorNome", label: "Supervisor" },
            { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> },
          ]}
          fields={[
            { key: "tipo", label: "Tipo", type: "select", options: ["AULA_PRATICA", "LABORATORIO", "ESTAGIO_SUPERVISIONADO", "VISITA_TECNICA"], required: true },
            { key: "titulo", label: "Título", required: true }, { key: "programId", label: "Curso", type: "select", options: cursos },
            { key: "poloId", label: "Polo", type: "select", options: polos },
            { key: "inicio", label: "Início", type: "datetime", required: true }, { key: "fim", label: "Fim", type: "datetime", required: true },
            { key: "vagas", label: "Vagas", type: "number" }, { key: "supervisorNome", label: "Supervisor" },
          ]}
          />
      )}

      {sub === "estagios" && (
        <EduResourcePage title="Estágios" description="Horas exigidas e validação de horas realizadas." base={BASE} resource="/estagios" dense
          columns={[
            { key: "concedente", label: "Concedente" }, { key: "studentId", label: "Aluno (ID)", render: (r) => String(r.studentId).slice(0, 8) },
            { key: "horasExigidas", label: "Horas exigidas" }, { key: "inicio", label: "Início", render: (r) => fmtDT(r.inicio) },
            { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> },
          ]}
          fields={[
            { key: "studentId", label: "ID do aluno", required: true, createOnly: true }, { key: "programId", label: "Curso", type: "select", options: cursos },
            { key: "concedente", label: "Concedente", required: true }, { key: "concedenteCnpj", label: "CNPJ do concedente" }, { key: "supervisorNome", label: "Supervisor" },
            { key: "horasExigidas", label: "Horas exigidas", type: "number", required: true }, { key: "inicio", label: "Início", type: "date", required: true }, { key: "fim", label: "Fim", type: "date" },
            { key: "termoUrl", label: "Link do termo de compromisso" },
          ]}
          rowActions={[{ label: "Concluir", path: "/estagios/:id/concluir", color: "success", confirm: "Concluir o estágio?", hidden: (r) => r.status === "CONCLUIDO" || r.status === "CANCELADO" }]} />
      )}
    </Box>
  );
}
