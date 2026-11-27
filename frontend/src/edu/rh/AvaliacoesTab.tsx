import { Alert, Box, Button, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useState } from "react";
import { Acoes, Btn, FormDialog, Kpi, KpiRow, LoadBox, Pick, Section, Status, Tabela, fmtDate, fmtNum, itemsOf, perfil, rh, useRh, useRunner, useToast, type FormField } from "./kit";

function Formulario({ av, papel, onClose, onDone }: { av: any | null; papel: "auto" | "gestor"; onClose: () => void; onDone: () => void }) {
  const crit = useRh<any>(av ? `/ciclos/${av.cicloId}/criterios` : null, [av?.id]);
  const lista = itemsOf(crit.data);
  const esc = av?.ciclo?.escalaMax ?? 5;
  const fields: FormField[] = [
    ...lista.flatMap((c: any): FormField[] => [{ key: `n_${c.id}`, label: `${c.nome} (peso ${c.peso}) — nota 1 a ${esc}`, type: "number", required: true }, { key: `c_${c.id}`, label: "Comentário" }]),
    ...(papel === "gestor" ? ([{ key: "parecer", label: "Parecer do gestor", type: "textarea", required: true }, { key: "plano", label: "Plano de ação (uma ação por linha; obrigatório se o resultado for baixo)", type: "textarea" }, { key: "semAuto", label: "Dispensar autoavaliação (RH)", type: "bool" }] as FormField[]) : []),
  ];
  const { toast, node } = useToast(); const run = useRunner(toast, onDone);
  return (
    <>
      {node}
      <FormDialog open={!!av} title={papel === "auto" ? "Autoavaliação" : `Avaliar ${av?.colaboradorNome ?? ""}`} fields={fields} onClose={onClose}
        onSubmit={(_b, raw) => {
          const notas: Record<string, any> = {}; for (const c of lista) notas[c.id] = { nota: Number(raw[`n_${c.id}`]), comentario: raw[`c_${c.id}`] || undefined };
          return papel === "auto" ? run(() => rh("POST", `/avaliacoes/${av.id}/autoavaliacao`, { notas }), "Autoavaliação enviada.")
            : run(() => rh("POST", `/avaliacoes/${av.id}/avaliacao-gestor`, { notas, parecer: raw.parecer, semAutoavaliacao: !!raw.semAuto, planoAcao: String(raw.plano || "").split("\n").map((s) => s.trim()).filter(Boolean).map((acao) => ({ acao })) }), "Avaliação concluída.");
        }} />
    </>
  );
}

export default function AvaliacoesTab() {
  const P = perfil(); const [sec, setSec] = useState("minhas"); const [rev, setRev] = useState(0);
  const [form, setForm] = useState<{ av: any; papel: "auto" | "gestor" } | null>(null); const [ciclo, setCiclo] = useState(false); const [crit, setCrit] = useState<string | null>(null); const [cicloSel, setCicloSel] = useState("");
  const { toast, node } = useToast(); const run = useRunner(toast, () => setRev((x) => x + 1));
  const mine = useRh<any>("/avaliacoes/minhas", [rev]);
  const ciclos = useRh<any>("/ciclos", [rev]);
  const todas = useRh<any>(sec === "todas" && (P.rh || P.gestor) ? `/avaliacoes?pageSize=100${cicloSel ? `&cicloId=${cicloSel}` : ""}` : null, [rev, sec, cicloSel]);
  const resumo = useRh<any>(sec === "resumo" && P.rh ? `/avaliacoes/resumo-reitoria${cicloSel ? `?cicloId=${cicloSel}` : ""}` : null, [rev, sec, cicloSel]);
  return (
    <>
      {node}
      <ToggleButtonGroup exclusive size="small" value={sec} onChange={(_, v) => v && setSec(v)} sx={{ mb: 2, flexWrap: "wrap" }}>
        <ToggleButton value="minhas">Minhas avaliações</ToggleButton>{(P.rh || P.gestor) && <ToggleButton value="todas">Equipe / todas</ToggleButton>}{P.rh && <ToggleButton value="ciclos">Ciclos e critérios</ToggleButton>}{P.rh && <ToggleButton value="resumo">Resumo (Reitoria)</ToggleButton>}
      </ToggleButtonGroup>
      {sec === "minhas" && (
        <Section title="Minhas avaliações">
          <LoadBox loading={mine.loading} error={mine.error} onRetry={mine.reload}>
            <Tabela rows={mine.data?.minhas ?? []} cols={[{ h: "Ciclo", r: (a: any) => a.ciclo?.nome }, { h: "Status", r: (a: any) => <Status value={a.status} /> }, { h: "Nota final", r: (a: any) => (a.notaFinal != null ? fmtNum(a.notaFinal, 2) : "—") }, { h: "Classificação", r: (a: any) => a.classificacao?.replace(/_/g, " ") ?? "—" },
              { h: "Ação", r: (a: any) => (a.status === "PENDENTE" ? <Btn variant="contained" onClick={() => setForm({ av: a, papel: "auto" })}>Autoavaliar</Btn> : "") }]} vazio="Nenhuma avaliação." />
            {(mine.data?.aAvaliar?.length ?? 0) > 0 && <><Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2 }}>Colaboradores que aguardam a sua avaliação</Typography>
              <Tabela rows={mine.data.aAvaliar} cols={[{ h: "Colaborador", r: (a: any) => a.colaboradorNome }, { h: "Status", r: (a: any) => <Status value={a.status} /> }, { h: "Ação", r: (a: any) => <Btn variant="contained" disabled={a.status === "PENDENTE"} onClick={() => setForm({ av: a, papel: "gestor" })}>{a.status === "PENDENTE" ? "Aguardando autoavaliação" : "Avaliar"}</Btn> }]} /></>}
          </LoadBox>
        </Section>
      )}
      {sec === "todas" && (
        <Section title="Avaliações da equipe">
          <Acoes><Pick label="Ciclo" value={cicloSel} onChange={setCicloSel} all="Todos" options={itemsOf(ciclos.data).map((c: any) => ({ value: c.id, label: c.nome }))} minWidth={220} /></Acoes>
          <LoadBox loading={todas.loading} error={todas.error} onRetry={todas.reload}>
            <Tabela rows={itemsOf(todas.data)} cols={[{ h: "Colaborador", r: (a: any) => a.colaboradorNome }, { h: "Status", r: (a: any) => <Status value={a.status} /> }, { h: "Auto", r: (a: any) => fmtNum(a.notaAuto, 2) }, { h: "Gestor", r: (a: any) => fmtNum(a.notaGestor, 2) }, { h: "Final", r: (a: any) => fmtNum(a.notaFinal, 2) }, { h: "Classificação", r: (a: any) => a.classificacao?.replace(/_/g, " ") ?? "—" },
              { h: "Plano de ação", r: (a: any) => (a.planoAcao?.length ? a.planoAcao.map((p: any) => p.acao).join("; ") : "—"), hideMobile: true }]} />
          </LoadBox>
        </Section>
      )}
      {sec === "ciclos" && P.rh && (
        <Section title="Ciclos de avaliação" actions={<Button variant="contained" onClick={() => setCiclo(true)}>Novo ciclo</Button>}>
          <Tabela rows={itemsOf(ciclos.data)} cols={[{ h: "Ciclo", r: (c: any) => c.nome }, { h: "Período", r: (c: any) => `${fmtDate(c.inicio)} a ${fmtDate(c.fim)}` }, { h: "Pesos", r: (c: any) => `auto ${c.pesoAuto}% · gestor ${c.pesoGestor}%` }, { h: "Critérios", r: (c: any) => c.criterios }, { h: "Status", r: (c: any) => <Status value={c.status} /> },
            { h: "Ação", r: (c: any) => (<Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>{c.status === "RASCUNHO" && <><Btn onClick={() => setCrit(c.id)}>+ Critério</Btn><Btn variant="contained" onClick={() => run(() => rh("POST", `/ciclos/${c.id}/abrir`, {}), "Ciclo aberto.", "Abrir o ciclo e gerar as avaliações?")}>Abrir</Btn></>}{c.status === "ABERTO" && <Btn color="warning" onClick={() => run(() => rh("POST", `/ciclos/${c.id}/encerrar`, {}), "Ciclo encerrado.", "Encerrar o ciclo?")}>Encerrar</Btn>}</Box>) }]} />
        </Section>
      )}
      {sec === "resumo" && P.rh && (
        <Section title="Resumo agregado para a Reitoria">
          <Alert severity="info" sx={{ mb: 2 }}>Sem nomes nem notas individuais; grupos com menos de 3 avaliações concluídas são suprimidos.</Alert>
          <LoadBox loading={resumo.loading} error={resumo.error} onRetry={resumo.reload}>
            {resumo.data?.ciclo ? (<>
              <KpiRow><Kpi title="Ciclo" value={resumo.data.ciclo.nome} /><Kpi title="Participação" value={`${resumo.data.participacao.taxa}%`} hint={`${resumo.data.participacao.concluidas}/${resumo.data.participacao.total}`} /><Kpi title="Nota média" value={resumo.data.geral.notaMedia != null ? fmtNum(resumo.data.geral.notaMedia, 2) : "suprimida"} /></KpiRow>
              <Tabela rows={resumo.data.porDepartamento.map((g: any) => ({ ...g, id: g.grupo }))} cols={[{ h: "Departamento", r: (g: any) => g.grupo }, { h: "Concluídas", r: (g: any) => (g.suprimido ? "—" : g.concluidas) }, { h: "Nota média", r: (g: any) => (g.suprimido ? "suprimido (grupo pequeno)" : fmtNum(g.notaMedia, 2)) }]} />
            </>) : <Typography color="text.secondary">Nenhum ciclo.</Typography>}
          </LoadBox>
        </Section>
      )}
      <Formulario av={form?.av ?? null} papel={form?.papel ?? "auto"} onClose={() => setForm(null)} onDone={() => setRev((x) => x + 1)} />
      <FormDialog open={ciclo} title="Novo ciclo de avaliação" fields={[{ key: "nome", label: "Nome", required: true }, { key: "inicio", label: "Início", type: "date", required: true }, { key: "fim", label: "Fim", type: "date", required: true }, { key: "pesoAuto", label: "Peso da autoavaliação (%)", type: "number" }, { key: "pesoGestor", label: "Peso do gestor (%)", type: "number" }, { key: "escalaMax", label: "Escala máxima", type: "number" }]} initial={{ pesoAuto: 30, pesoGestor: 70, escalaMax: 5 }} onClose={() => setCiclo(false)} onSubmit={(b) => run(() => rh("POST", "/ciclos", b), "Ciclo criado.")} />
      <FormDialog open={!!crit} title="Novo critério" fields={[{ key: "nome", label: "Critério", required: true }, { key: "descricao", label: "Descrição" }, { key: "peso", label: "Peso", type: "number" }, { key: "categoria", label: "Categoria", type: "select", options: ["COMPETENCIA", "RESULTADO", "VALORES"] }]} initial={{ peso: 1, categoria: "COMPETENCIA" }} onClose={() => setCrit(null)} onSubmit={(b) => run(() => rh("POST", `/ciclos/${crit}/criterios`, b), "Critério adicionado.")} maxWidth="sm" />
    </>
  );
}
