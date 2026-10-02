import { Box, Button } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import EduResourcePage, { StatusChip } from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import ListTable from "./ListTable";
import { FormDialog, type Opt, Tag, fmtDate, fmtDateTime, label, useToast } from "./kit";

const TIPOS_VAGA = ["COMUM", "PCD", "IDOSO", "MOTO", "DOCENTE", "VISITANTE", "ADMINISTRATIVO"];
const VINCULOS = ["ALUNO", "DOCENTE", "FUNCIONARIO", "VISITANTE", "TERCEIRIZADO"];
const BASE = "/infraestrutura/estacionamento";

export function VeiculosPanel() {
  const [key, setKey] = useState(0);
  const [form, setForm] = useState<{ kind: "novo" | "editar" | "credencial"; row?: any } | null>(null);
  const toast = useToast();
  const reload = () => setKey((k) => k + 1);
  const dados = (novo: boolean) => [
    ...(novo ? [{ key: "placa", label: "Placa", required: true, helper: "AAA9999 ou AAA9A99" }] : []),
    { key: "tipo", label: "Tipo", type: "select" as const, options: ["CARRO", "MOTO", "BICICLETA", "OUTRO"], def: "CARRO" },
    { key: "modelo", label: "Modelo" }, { key: "cor", label: "Cor" },
    { key: "vinculo", label: "Vínculo", type: "select" as const, options: VINCULOS, def: "ALUNO" },
    { key: "proprietarioNome", label: "Proprietário", required: true }, { key: "contato", label: "Contato" },
    { key: "credencial", label: "Nº da credencial" }, { key: "validade", label: "Validade da credencial", type: "date" as const },
    { key: "vagaEspecial", label: "Vaga especial", type: "select" as const, options: ["PCD", "IDOSO", "DOCENTE"] },
  ];
  return (
    <Box>
      <ListTable
        path={`${BASE}/veiculos`} refreshKey={key}
        filters={[{ key: "vinculo", label: "Vínculo", options: VINCULOS }, { key: "credencialStatus", label: "Credencial", options: ["ATIVA", "SUSPENSA", "REVOGADA", "VENCIDA"] }]}
        toolbar={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({ kind: "novo" })}>Novo veículo</Button>}
        columns={[
          { key: "placa", label: "Placa" }, { key: "modelo", label: "Veículo", render: (r) => [r.modelo, r.cor].filter(Boolean).join(" · ") || label(r.tipo) },
          { key: "proprietarioNome", label: "Proprietário" }, { key: "vinculo", label: "Vínculo", render: (r) => <Tag text={label(r.vinculo)} /> },
          { key: "credencialStatus", label: "Credencial", render: (r) => <StatusChip value={r.credencialStatus} /> }, { key: "validade", label: "Validade", render: (r) => fmtDate(r.validade) },
          { key: "vagaEspecial", label: "Vaga especial", render: (r) => (r.vagaEspecial ? <Tag text={r.vagaEspecial} tone="info" /> : "—") },
        ]}
        actions={(r) => (
          <>
            <Button size="small" onClick={() => setForm({ kind: "credencial", row: r })}>Credencial</Button>
            <Button size="small" onClick={() => setForm({ kind: "editar", row: r })}>Editar</Button>
          </>
        )}
      />
      <FormDialog open={!!form} onClose={() => setForm(null)}
        title={form?.kind === "novo" ? "Novo veículo" : form?.kind === "editar" ? `Editar ${form.row?.placa}` : `Credencial — ${form?.row?.placa || ""}`}
        initial={form?.kind === "editar" ? form.row : null}
        fields={form?.kind === "credencial"
          ? [{ key: "acao", label: "Ação", type: "select", options: ["SUSPENDER", "REVOGAR", "REATIVAR", "RENOVAR"], required: true }, { key: "validade", label: "Nova validade (renovação)", type: "date" }, { key: "motivo", label: "Motivo", full: true }]
          : dados(form?.kind === "novo")}
        onSubmit={async (b) => {
          if (form!.kind === "novo") await eduApi.post(`${BASE}/veiculos`, b);
          else if (form!.kind === "editar") await eduApi.put(`${BASE}/veiculos/${form!.row.id}`, b);
          else await eduApi.post(`${BASE}/veiculos/${form!.row.id}/credencial`, b);
          toast.ok("Salvo com sucesso."); reload();
        }} />
      {toast.node}
    </Box>
  );
}

export function AreasVagasPanel({ areas }: { areas: Opt[] }) {
  const [lote, setLote] = useState(false);
  const [key, setKey] = useState(0);
  const toast = useToast();
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <EduResourcePage title="Áreas de estacionamento" base="/infraestrutura" resource="/estacionamento/areas" dense
        columns={[{ key: "nome", label: "Nome" }, { key: "descricao", label: "Descrição" }, { key: "ativo", label: "Ativa" }]}
        fields={[{ key: "nome", label: "Nome", required: true }, { key: "descricao", label: "Descrição" }, { key: "ativo", label: "Ativa", type: "bool" }]} />
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="outlined" onClick={() => setLote(true)}>Gerar vagas em lote</Button>
      </Box>
      <EduResourcePage key={key} title="Vagas" base="/infraestrutura" resource="/estacionamento/vagas" dense searchable={false}
        filters={[{ key: "tipo", label: "Tipo", options: TIPOS_VAGA }]}
        columns={[{ key: "areaId", label: "Área", render: (r) => areas.find((a) => a.value === r.areaId)?.label || r.areaId }, { key: "codigo", label: "Código" }, { key: "tipo", label: "Tipo", render: (r) => <Tag text={label(r.tipo)} /> }, { key: "ativo", label: "Ativa" }]}
        fields={[{ key: "areaId", label: "Área", type: "select", options: areas, required: true }, { key: "codigo", label: "Código", required: true }, { key: "tipo", label: "Tipo", type: "select", options: TIPOS_VAGA }, { key: "ativo", label: "Ativa", type: "bool" }]} />
      <FormDialog open={lote} title="Gerar vagas em lote" onClose={() => setLote(false)}
        fields={[
          { key: "areaId", label: "Área", type: "select", options: areas, required: true }, { key: "prefixo", label: "Prefixo", def: "V" },
          { key: "inicio", label: "Número inicial", type: "number", def: 1 }, { key: "quantidade", label: "Quantidade", type: "number", required: true }, { key: "tipo", label: "Tipo", type: "select", options: TIPOS_VAGA, def: "COMUM" },
        ]}
        onSubmit={async ({ areaId, ...b }) => { await eduApi.post(`${BASE}/areas/${areaId}/vagas-lote`, b); toast.ok("Vagas criadas."); setKey((k) => k + 1); }} />
      {toast.node}
    </Box>
  );
}

export function OcorrenciasPanel({ areas }: { areas: Opt[] }) {
  const [key, setKey] = useState(0);
  const [form, setForm] = useState<{ kind: "nova" | "resolver"; row?: any } | null>(null);
  const toast = useToast();
  const reload = () => setKey((k) => k + 1);
  return (
    <Box>
      <ListTable
        path={`${BASE}/ocorrencias`} refreshKey={key}
        filters={[{ key: "status", label: "Situação", options: ["ABERTA", "EM_ANALISE", "RESOLVIDA", "ARQUIVADA"] }, { key: "gravidade", label: "Gravidade", options: ["LEVE", "MEDIA", "GRAVE"] }]}
        toolbar={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({ kind: "nova" })}>Registrar ocorrência</Button>}
        columns={[
          { key: "createdAt", label: "Data", render: (r) => fmtDateTime(r.createdAt) }, { key: "tipo", label: "Tipo", render: (r) => label(r.tipo) }, { key: "placa", label: "Placa" },
          { key: "descricao", label: "Descrição" }, { key: "gravidade", label: "Gravidade", render: (r) => <Tag text={r.gravidade} tone={r.gravidade === "GRAVE" ? "error" : r.gravidade === "MEDIA" ? "warning" : "default"} /> },
          { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> },
        ]}
        actions={(r) => (r.status === "RESOLVIDA" || r.status === "ARQUIVADA" ? null : <Button size="small" color="success" onClick={() => setForm({ kind: "resolver", row: r })}>Resolver</Button>)}
      />
      <FormDialog open={!!form} onClose={() => setForm(null)} title={form?.kind === "nova" ? "Registrar ocorrência" : "Resolver ocorrência"}
        fields={form?.kind === "nova"
          ? [{ key: "tipo", label: "Tipo", type: "select", options: ["MAU_ESTACIONAMENTO", "VAGA_INDEVIDA", "DANO", "FURTO", "ACIDENTE", "CREDENCIAL_VENCIDA", "OUTRO"], required: true },
            { key: "gravidade", label: "Gravidade", type: "select", options: ["LEVE", "MEDIA", "GRAVE"], def: "LEVE" }, { key: "areaId", label: "Área", type: "select", options: areas }, { key: "placa", label: "Placa" },
            { key: "descricao", label: "Descrição", type: "textarea", required: true }]
          : [{ key: "resolucao", label: "Resolução adotada", type: "textarea", required: true }, { key: "suspenderCredencial", label: "Suspender a credencial do veículo", type: "bool" }]}
        onSubmit={async (b) => {
          if (form!.kind === "nova") await eduApi.post(`${BASE}/ocorrencias`, b);
          else await eduApi.post(`${BASE}/ocorrencias/${form!.row.id}/resolver`, b);
          toast.ok("Ocorrência salva."); reload();
        }} />
      {toast.node}
    </Box>
  );
}
