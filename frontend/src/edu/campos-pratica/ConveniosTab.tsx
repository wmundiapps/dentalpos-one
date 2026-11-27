import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import { useState } from "react";
import Cadastro from "./Cadastro";
import { Etiqueta, Status, fmtDate, itemsOf, perfil, useCp, useCursosOpts, type Opt } from "./kit";

const TIPOS = ["EMPRESA", "ORGAO_PUBLICO", "HOSPITAL", "CLINICA", "ONG", "ESCOLA", "FAZENDA", "OUTRO"].map((t) => ({ value: t, label: t.replace(/_/g, " ").toLowerCase() }));

export default function ConveniosTab() {
  const [sub, setSub] = useState("concedentes");
  const pf = perfil();
  const conc = useCp<any>("/estagios/concedentes?pageSize=200");
  const conv = useCp<any>("/estagios/convenios?pageSize=200");
  const campos = useCp<any>("/estagios/campos?pageSize=200");
  const cursos = useCursosOpts();
  const concOpts: Opt[] = itemsOf(conc.data).map((c: any) => ({ value: c.id, label: c.nome }));
  const convOpts: Opt[] = itemsOf(conv.data).map((c: any) => ({ value: c.id, label: c.numero }));
  const campoOpts: Opt[] = itemsOf(campos.data).map((c: any) => ({ value: c.id, label: c.nome }));
  const nomeConc = (id: string) => concOpts.find((o) => o.value === id)?.label ?? "—";
  return (
    <>
      <ToggleButtonGroup exclusive size="small" value={sub} onChange={(_, v) => v && setSub(v)} sx={{ mb: 2, flexWrap: "wrap" }}>
        <ToggleButton value="concedentes">Instituições concedentes</ToggleButton>
        <ToggleButton value="convenios">Convênios e vigência</ToggleButton>
        <ToggleButton value="campos">Campos de estágio</ToggleButton>
        <ToggleButton value="vagas">Vagas por curso</ToggleButton>
      </ToggleButtonGroup>
      {sub === "concedentes" && <Cadastro key="c" titulo="Instituições concedentes" path="/estagios/concedentes" podeEditar={pf.secretaria} podeRemover={pf.gestor} novoLabel="Nova concedente"
        columns={[{ label: "Nome", primary: true, render: (r) => r.nome }, { label: "Tipo", render: (r) => String(r.tipo).replace(/_/g, " ").toLowerCase() }, { label: "Cidade", render: (r) => `${r.cidade ?? "—"}${r.uf ? "/" + r.uf : ""}` }, { label: "Contato", render: (r) => r.contatoNome ?? "—", hideOnMobile: true }, { label: "Ativa", render: (r) => (r.ativo ? "Sim" : "Não") }]}
        fields={[{ key: "nome", label: "Nome", required: true, full: true }, { key: "cnpj", label: "CNPJ" }, { key: "tipo", label: "Tipo", type: "select", required: true, options: TIPOS }, { key: "cidade", label: "Cidade" }, { key: "uf", label: "UF" }, { key: "endereco", label: "Endereço", full: true }, { key: "contatoNome", label: "Contato" }, { key: "contatoEmail", label: "E-mail do contato" }, { key: "contatoTelefone", label: "Telefone" }]} />}
      {sub === "convenios" && <Cadastro key="v" titulo="Convênios e vigência" path="/estagios/convenios" listPath="/estagios/convenios/situacao" podeEditar={pf.secretaria} podeRemover={pf.gestor} novoLabel="Novo convênio" busca={false}
        columns={[{ label: "Número", primary: true, render: (r) => r.numero }, { label: "Concedente", render: (r) => r.concedente ?? nomeConc(r.concedenteId) }, { label: "Vigência", render: (r) => `${fmtDate(r.inicio)} a ${fmtDate(r.fim)}` },
          { label: "Situação", render: (r) => <Etiqueta t={r.situacao === "VIGENTE" ? "Vigente" : r.situacao === "VENCENDO" ? `Vence em ${r.diasParaVencer} d` : r.situacao === "VENCIDO" ? "Vencido" : r.situacao} color={r.situacao === "VIGENTE" ? "success" : r.situacao === "VENCENDO" ? "warning" : "error"} /> }]}
        fields={[{ key: "concedenteId", label: "Concedente", type: "select", required: true, options: concOpts }, { key: "numero", label: "Número do convênio", required: true }, { key: "objeto", label: "Objeto", full: true }, { key: "inicio", label: "Início", type: "date", required: true }, { key: "fim", label: "Fim da vigência", type: "date", required: true }, { key: "documentoUrl", label: "Link do documento (https)", full: true }, { key: "status", label: "Situação", type: "select", options: ["ATIVO", "SUSPENSO", "ENCERRADO"] }]}
        intro={undefined} />}
      {sub === "campos" && <Cadastro key="ca" titulo="Campos de estágio" path="/estagios/campos" podeEditar={pf.secretaria} podeRemover={pf.gestor} novoLabel="Novo campo"
        columns={[{ label: "Campo", primary: true, render: (r) => r.nome }, { label: "Concedente", render: (r) => nomeConc(r.concedenteId) }, { label: "Área", render: (r) => r.area ?? "—" }, { label: "Supervisor de campo", render: (r) => r.supervisorNome ?? "—" }, { label: "Ativo", render: (r) => <Status value={r.ativo ? "ATIVO" : "INATIVO"} /> }]}
        fields={[{ key: "concedenteId", label: "Concedente", type: "select", required: true, options: concOpts }, { key: "convenioId", label: "Convênio", type: "select", options: convOpts }, { key: "nome", label: "Nome do campo", required: true, full: true }, { key: "area", label: "Área" }, { key: "local", label: "Local" }, { key: "supervisorNome", label: "Supervisor de campo" }, { key: "supervisorCargo", label: "Cargo" }, { key: "supervisorRegistro", label: "Registro profissional" }, { key: "supervisorEmail", label: "E-mail" }]} />}
      {sub === "vagas" && <Cadastro key="vg" titulo="Vagas por curso" path="/estagios/vagas" listPath="/estagios/vagas/disponibilidade" podeEditar={pf.secretaria} podeRemover={pf.gestor} novoLabel="Nova vaga" busca={false}
        columns={[{ label: "Curso", primary: true, render: (r) => r.curso }, { label: "Campo", render: (r) => `${r.campo ?? "—"} (${r.concedente ?? "—"})` }, { label: "Vagas", render: (r) => `${r.ocupadas}/${r.quantidade}` }, { label: "Livres", render: (r) => <Etiqueta t={r.disponiveis} color={r.disponiveis ? "success" : "error"} /> }, { label: "Convênio", render: (r) => (r.convenio ? `${r.convenio.numero} · ${r.convenio.situacao.toLowerCase()}` : "sem convênio") }]}
        fields={[{ key: "campoId", label: "Campo de estágio", type: "select", required: true, options: campoOpts }, { key: "programId", label: "Curso", type: "select", required: true, options: cursos }, { key: "quantidade", label: "Quantidade de vagas", type: "number", required: true }, { key: "requisitos", label: "Requisitos", type: "textarea" }]} />}
    </>
  );
}
