import { Box, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { useState } from "react";
import EduResourcePage, { StatusChip } from "../EduResourcePage";
import { fmtDate, label } from "../regulatorio/ui";
import { moeda, STATUS_ACAO, useOptions } from "./shared";

const PERIOD = ["MENSAL", "BIMESTRAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"];

export default function PdiCadastroTab() {
  const [v, setV] = useState("eixos");
  const pdis = useOptions("/governanca/pdis?pageSize=100", (p) => `${p.titulo} (${p.anoInicio}–${p.anoFim})`);
  const eixos = useOptions("/governanca/pdi-eixos?pageSize=200", (e) => e.nome);
  const objs = useOptions("/governanca/pdi-objetivos?pageSize=200", (o) => o.titulo);
  const metas = useOptions("/governanca/pdi-metas?pageSize=200", (m) => m.titulo);
  const B = "/governanca";
  return (
    <Box>
      <ToggleButtonGroup size="small" exclusive value={v} onChange={(_, x) => x && setV(x)} sx={{ mb: 2, flexWrap: "wrap" }}>
        <ToggleButton value="pdis">PDIs</ToggleButton><ToggleButton value="eixos">Eixos</ToggleButton><ToggleButton value="objetivos">Objetivos</ToggleButton><ToggleButton value="metas">Metas</ToggleButton><ToggleButton value="acoes">Ações</ToggleButton>
      </ToggleButtonGroup>
      {v === "pdis" && (
        <EduResourcePage title="PDIs" base={B} resource="/pdis" canDelete
          fields={[{ key: "titulo", label: "Título", required: true }, { key: "anoInicio", label: "Ano de início", type: "number", required: true, createOnly: true }, { key: "anoFim", label: "Ano de fim", type: "number", required: true, createOnly: true }, { key: "missao", label: "Missão", type: "textarea" }, { key: "visao", label: "Visão", type: "textarea" }, { key: "valores", label: "Valores", type: "textarea" }]}
          columns={[{ key: "titulo", label: "Título" }, { key: "periodo", label: "Período", render: (r) => `${r.anoInicio}–${r.anoFim}` }, { key: "status", label: "Status", render: (r) => <StatusChip value={r.status} /> }]}
          rowActions={[{ label: "Ativar", path: "/pdis/:id/ativar", confirm: "Ativar este PDI? Outro PDI vigente será encerrado.", color: "success", hidden: (r) => r.status === "VIGENTE" || r.status === "ENCERRADO" }]} />
      )}
      {v === "eixos" && (
        <EduResourcePage title="Eixos estratégicos" base={B} resource="/pdi-eixos"
          fields={[{ key: "pdiId", label: "PDI", type: "select", options: pdis, required: true, createOnly: true }, { key: "nome", label: "Nome", required: true }, { key: "descricao", label: "Descrição", type: "textarea" }, { key: "eixoSinaes", label: "Eixo SINAES (1-5)", type: "number" }, { key: "dimensaoSinaes", label: "Dimensão SINAES (1-10)", type: "number" }, { key: "peso", label: "Peso", type: "number" }, { key: "ordem", label: "Ordem", type: "number" }]}
          columns={[{ key: "nome", label: "Eixo" }, { key: "eixoSinaes", label: "SINAES" }, { key: "peso", label: "Peso" }]} />
      )}
      {v === "objetivos" && (
        <EduResourcePage title="Objetivos" base={B} resource="/pdi-objetivos"
          fields={[{ key: "eixoId", label: "Eixo", type: "select", options: eixos, required: true, createOnly: true }, { key: "titulo", label: "Título", required: true }, { key: "descricao", label: "Descrição", type: "textarea" }, { key: "peso", label: "Peso", type: "number" }, { key: "ordem", label: "Ordem", type: "number" }]}
          columns={[{ key: "titulo", label: "Objetivo" }, { key: "eixoId", label: "Eixo", render: (r) => eixos.find((e) => e.value === r.eixoId)?.label || "—" }, { key: "peso", label: "Peso" }]} />
      )}
      {v === "metas" && (
        <EduResourcePage title="Metas e indicadores" base={B} resource="/pdi-metas"
          fields={[{ key: "objetivoId", label: "Objetivo", type: "select", options: objs, required: true, createOnly: true }, { key: "titulo", label: "Meta", required: true }, { key: "indicador", label: "Indicador", required: true }, { key: "unidade", label: "Unidade" },
            { key: "sentido", label: "Sentido", type: "select", options: [{ value: "MAIOR_MELHOR", label: "Maior é melhor" }, { value: "MENOR_MELHOR", label: "Menor é melhor" }] },
            { key: "linhaBase", label: "Linha de base", type: "number", required: true, createOnly: true }, { key: "valorMeta", label: "Valor da meta", type: "number", required: true }, { key: "periodicidade", label: "Periodicidade de coleta", type: "select", options: PERIOD.map((p) => ({ value: p, label: label(p) })) }, { key: "prazo", label: "Prazo", type: "date" }, { key: "peso", label: "Peso", type: "number" }]}
          columns={[{ key: "titulo", label: "Meta" }, { key: "indicador", label: "Indicador" }, { key: "linhaBase", label: "Base" }, { key: "valorAtual", label: "Atual" }, { key: "valorMeta", label: "Meta" }, { key: "periodicidade", label: "Coleta", render: (r) => label(r.periodicidade) }]} />
      )}
      {v === "acoes" && (
        <EduResourcePage title="Ações do PDI" base={B} resource="/pdi-acoes" filters={[{ key: "status", label: "Status", options: STATUS_ACAO }]}
          fields={[{ key: "metaId", label: "Meta", type: "select", options: metas, required: true, createOnly: true }, { key: "titulo", label: "Ação", required: true }, { key: "descricao", label: "Descrição", type: "textarea" }, { key: "prazo", label: "Prazo", type: "date", required: true }, { key: "orcamento", label: "Orçamento (R$)", type: "number" }, { key: "gasto", label: "Gasto (R$)", type: "number" }, { key: "percentual", label: "% concluído", type: "number" }, { key: "status", label: "Status", type: "select", options: STATUS_ACAO.map((s) => ({ value: s, label: label(s) })) }]}
          columns={[{ key: "titulo", label: "Ação" }, { key: "prazo", label: "Prazo", render: (r) => fmtDate(r.prazo) }, { key: "percentual", label: "%" }, { key: "orcamento", label: "Orçamento", render: (r) => moeda(r.orcamento) }, { key: "status", label: "Status", render: (r) => <StatusChip value={r.status} /> }]} />
      )}
    </Box>
  );
}
