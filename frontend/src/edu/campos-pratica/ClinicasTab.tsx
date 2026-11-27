import { Button, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useState } from "react";
import Cadastro from "./Cadastro";
import {
  AREAS, Acoes, ActionsMenu, Aviso, Btn, DataList, Etiqueta, FormDialog, Kpi, KpiRow, LoadBox, Pick, Section, cp, fmtDateTime, hojeIso, itemsOf, perfil, useCp, useCursosOpts, useEquipe, useRunner, useToast, type Opt,
} from "./kit";

export default function ClinicasTab() {
  const [sub, setSub] = useState("escalas");
  const pf = perfil();
  return (
    <>
      <ToggleButtonGroup exclusive size="small" value={sub} onChange={(_, v) => v && setSub(v)} sx={{ mb: 2, flexWrap: "wrap" }}>
        <ToggleButton value="escalas">Escalas de supervisão</ToggleButton>
        <ToggleButton value="unidades">Unidades e consultórios</ToggleButton>
        {(pf.secretaria || pf.professor) && <ToggleButton value="relatorios">Relatórios por curso</ToggleButton>}
      </ToggleButtonGroup>
      {sub === "escalas" && <Escalas />}
      {sub === "unidades" && <Unidades />}
      {sub === "relatorios" && <Relatorios />}
    </>
  );
}

function Unidades() {
  const pf = perfil();
  const cursos = useCursosOpts();
  const un = useCp<any>("/clinicas/unidades?pageSize=100");
  const unOpts: Opt[] = itemsOf(un.data).map((u: any) => ({ value: u.id, label: u.nome }));
  return (
    <>
      <Cadastro titulo="Clínicas-escola, ambulatórios e hospital veterinário" path="/clinicas/unidades" podeEditar={pf.gestor} podeRemover={false} novoLabel="Nova unidade"
        columns={[{ label: "Unidade", primary: true, render: (u) => u.nome }, { label: "Área", render: (u) => AREAS.find((a) => a.value === u.area)?.label ?? u.area }, { label: "Tipo", render: (u) => String(u.tipo).replace(/_/g, " ").toLowerCase() }, { label: "Ativa", render: (u) => (u.ativo ? "Sim" : "Não") }]}
        fields={[{ key: "nome", label: "Nome", required: true, full: true }, { key: "tipo", label: "Tipo", type: "select", required: true, options: ["CLINICA_ESCOLA", "AMBULATORIO", "HOSPITAL_VET", "LABORATORIO"] }, { key: "area", label: "Área", type: "select", required: true, options: AREAS }, { key: "programId", label: "Curso", type: "select", options: cursos }, { key: "endereco", label: "Endereço", full: true }, { key: "telefone", label: "Telefone" }]} />
      <Cadastro titulo="Consultórios e salas" path="/clinicas/consultorios" podeEditar={pf.gestor} novoLabel="Novo consultório" busca={false}
        columns={[{ label: "Consultório", primary: true, render: (c) => c.nome }, { label: "Unidade", render: (c) => unOpts.find((u) => u.value === c.unidadeId)?.label ?? "—" }, { label: "Tipo", render: (c) => String(c.tipo).replace(/_/g, " ").toLowerCase() }, { label: "Capacidade", render: (c) => c.capacidade }]}
        fields={[{ key: "unidadeId", label: "Unidade", type: "select", required: true, options: unOpts }, { key: "nome", label: "Nome", required: true }, { key: "tipo", label: "Tipo", type: "select", options: ["CONSULTORIO", "SALA_ATENDIMENTO", "CENTRO_CIRURGICO", "A_CAMPO"] }, { key: "capacidade", label: "Atendimentos simultâneos", type: "number" }]} />
    </>
  );
}

function Escalas() {
  const pf = perfil();
  const [rev, setRev] = useState(0);
  const [novo, setNovo] = useState(false);
  const [add, setAdd] = useState<any>(null);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const eq = useEquipe();
  const cursos = useCursosOpts();
  const un = useCp<any>("/clinicas/unidades?pageSize=100");
  const unOpts: Opt[] = itemsOf(un.data).map((u: any) => ({ value: u.id, label: u.nome }));
  const l = useCp<any>(`/clinicas/escalas?de=${new Date(Date.now() - 86_400_000).toISOString()}`, [rev]);
  const rows = itemsOf(l.data);
  return (
    <Section title="Escalas de supervisor e alunos-estagiários" actions={pf.secretaria ? <Button size="small" variant="contained" onClick={() => setNovo(true)}>Nova escala</Button> : undefined}>
      {node}
      <Aviso>Um supervisor só pode estar em uma escala por horário, e cada aluno só atende nas escalas em que está incluído. O supervisor registra a presença no início do turno: sem ela o aluno não inicia atendimentos sozinho.</Aviso>
      <LoadBox loading={l.loading} error={l.error} onRetry={l.reload} empty={!rows.length} emptyText="Nenhuma escala futura.">
        <DataList rows={rows} columns={[
          { label: "Turno", primary: true, render: (e) => `${fmtDateTime(e.inicio)} – ${new Date(e.fim).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` }, { label: "Unidade", render: (e) => e.unidade }, { label: "Curso", render: (e) => e.curso },
          { label: "Supervisor", render: (e) => e.supervisor }, { label: "Alunos", render: (e) => (e.alunos.map((a: any) => a.nome).join(", ") || "—"), hideOnMobile: true },
          { label: "Atendimentos", render: (e) => `${e.atendimentos}/${e.capacidadeSimultanea} simult.` }, { label: "Presença", render: (e) => <Etiqueta t={e.supervisorPresenteEm ? "Supervisor presente" : "Aguardando"} color={e.supervisorPresenteEm ? "success" : "default"} /> },
        ]} actions={(e) => (
          <ActionsMenu items={[
            { label: "Marcar minha presença", show: pf.professor || pf.gestor, onClick: () => run(() => cp("POST", `/clinicas/escalas/${e.id}/presenca`), "Presença do supervisor registrada.") },
            { label: "Incluir aluno", show: pf.secretaria, onClick: () => setAdd(e) },
            { label: "Cancelar escala", color: "error", show: pf.secretaria, onClick: async () => { if (!window.confirm("Cancelar a escala? Os atendimentos agendados nela também serão cancelados.")) return; await run(() => cp("POST", `/clinicas/escalas/${e.id}/cancelar`, { cancelarAtendimentos: true }), "Escala cancelada."); } },
          ]} />
        )} />
      </LoadBox>
      {novo && <FormDialog open title="Nova escala" submitLabel="Criar escala" onClose={() => setNovo(false)}
        fields={[{ key: "unidadeId", label: "Unidade", type: "select", required: true, options: unOpts }, { key: "programId", label: "Curso", type: "select", required: true, options: cursos }, { key: "supervisorUserId", label: "Supervisor", type: "select", required: true, options: eq.opts }, { key: "capacidadeSimultanea", label: "Atendimentos simultâneos por supervisor", type: "number", required: true }, { key: "inicio", label: "Início", type: "datetime", required: true }, { key: "fim", label: "Fim", type: "datetime", required: true }, { key: "observacao", label: "Observação", full: true }]}
        initial={{ capacidadeSimultanea: 3 }} onSubmit={async (b) => { await cp("POST", "/clinicas/escalas", b); setRev((x) => x + 1); }} />}
      {add && <FormDialog open title="Incluir aluno-estagiário na escala" fields={[{ key: "studentId", label: "Aluno", type: "student", required: true }]} onClose={() => setAdd(null)} onSubmit={async (b) => { await cp("POST", `/clinicas/escalas/${add.id}/alunos`, b); setRev((x) => x + 1); }} />}
    </Section>
  );
}

function Relatorios() {
  const [de, setDe] = useState(new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10));
  const [ate, setAte] = useState(hojeIso());
  const l = useCp<any>(`/clinicas/relatorios?de=${new Date(`${de}T00:00:00`).toISOString()}&ate=${new Date(`${ate}T23:59:59`).toISOString()}`);
  const d = l.data;
  const painel = useCp<any>("/clinicas/painel");
  async function csv() {
    const API = (import.meta as any).env?.VITE_API_URL || "http://localhost:3000/api";
    const r = await fetch(`${API}/edu/campos-pratica/clinicas/relatorios?formato=csv&de=${new Date(`${de}T00:00:00`).toISOString()}&ate=${new Date(`${ate}T23:59:59`).toISOString()}`, { headers: { Authorization: `Bearer ${localStorage.getItem("dentalpos.token") || ""}` } });
    const url = URL.createObjectURL(new Blob([await r.text()], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "atendimentos-por-curso.csv"; a.click();
  }
  return (
    <>
      {painel.data && (
        <KpiRow>
          <Kpi title="Atendimentos hoje" value={painel.data.atendimentosHoje} /><Kpi title="Em atendimento" value={painel.data.emAtendimento} /><Kpi title="Fila de espera" value={painel.data.filaEspera} />
          <Kpi title="Faltas (7 dias)" value={painel.data.faltasUltimos7Dias} hint={`taxa ${painel.data.taxaFaltaSemana}%`} /><Kpi title="Sem consentimento ativo" value={painel.data.semConsentimentoAtivo} />
        </KpiRow>
      )}
      <Section title="Atendimentos, faltas e tempo de espera por curso" actions={<Button size="small" onClick={csv}>Exportar CSV</Button>}>
        <Acoes>
          <TextField size="small" type="date" label="De" value={de} onChange={(e) => setDe(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="date" label="Até" value={ate} onChange={(e) => setAte(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Acoes>
        <LoadBox loading={l.loading} error={l.error} onRetry={l.reload} empty={!d?.cursos?.length} emptyText="Sem atendimentos no período.">
          {d && <DataList rows={d.cursos.map((c: any) => ({ ...c, id: c.programId }))} columns={[
            { label: "Curso", primary: true, render: (c: any) => c.curso }, { label: "Total", render: (c: any) => c.total }, { label: "Realizados", render: (c: any) => c.realizados }, { label: "Faltas", render: (c: any) => c.faltas },
            { label: "Taxa de falta", render: (c: any) => <Etiqueta t={`${c.taxaFalta}%`} color={c.taxaFalta > 25 ? "error" : c.taxaFalta > 12 ? "warning" : "success"} /> }, { label: "Cancelados", render: (c: any) => c.cancelados },
            { label: "Espera na fila", render: (c: any) => (c.tempoMedioEsperaFilaDias === null ? "—" : `${c.tempoMedioEsperaFilaDias} dia(s)`) }, { label: "Espera na sala", render: (c: any) => (c.tempoMedioEsperaSalaMin === null ? "—" : `${c.tempoMedioEsperaSalaMin} min`) }, { label: "Alunos atuantes", render: (c: any) => c.alunosAtuantes },
          ]} />}
        </LoadBox>
        {d && <Typography variant="caption" color="text.secondary">Fila aguardando agora: {d.fila.aguardando} pessoa(s){d.fila.esperaMediaDias !== null ? `, espera média de ${d.fila.esperaMediaDias} dia(s)` : ""}.</Typography>}
      </Section>
    </>
  );
}
void Pick; void Btn;
