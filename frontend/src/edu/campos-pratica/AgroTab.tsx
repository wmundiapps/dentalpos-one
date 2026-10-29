import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Paper, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";
import { useState } from "react";
import Cadastro from "./Cadastro";
import { Acoes, ActionsMenu, Aviso, Btn, COLORS, type Col, DataList, Etiqueta, FormDialog, Kpi, KpiRow, LoadBox, Section, Status, cp, corSeveridade, fmtDate, fmtMoney, fmtNum, itemsOf, perfil, useCp, useEquipe, useRunner, useToast, type Opt } from "./kit";

export default function AgroTab() {
  const [sub, setSub] = useState("ciclos");
  const pf = perfil();
  return (
    <>
      <ToggleButtonGroup exclusive size="small" value={sub} onChange={(_, v) => v && setSub(v)} sx={{ mb: 2, flexWrap: "wrap" }}>
        <ToggleButton value="ciclos">Ciclos e safras</ToggleButton>
        <ToggleButton value="calendario">Calendário agrícola</ToggleButton>
        <ToggleButton value="produtividade">Produtividade</ToggleButton>
        <ToggleButton value="aulas">Aulas práticas</ToggleButton>
        <ToggleButton value="alertas">Alertas</ToggleButton>
        <ToggleButton value="cadastros">Áreas e culturas</ToggleButton>
      </ToggleButtonGroup>
      {sub === "ciclos" && <Ciclos podeEditar={pf.escreveCampo} />}
      {sub === "calendario" && <Calendario />}
      {sub === "produtividade" && <Produtividade />}
      {sub === "aulas" && <Aulas />}
      {sub === "alertas" && <Alertas />}
      {sub === "cadastros" && <Cadastros podeEditar={pf.escreveCampo} />}
    </>
  );
}

function Ciclos({ podeEditar }: { podeEditar: boolean }) {
  const [rev, setRev] = useState(0);
  const [novo, setNovo] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const l = useCp<any>("/agro/ciclos", [rev]);
  const p = useCp<any>("/agro/painel", [rev]);
  const rows = itemsOf(l.data);
  const tal = useCp<any>("/agro/talhoes?pageSize=200"), cul = useCp<any>("/agro/culturas?pageSize=200"), cvr = useCp<any>("/agro/cultivares?pageSize=200"), eq = useEquipe(), turmas = useCp<any>("/academico/class-sections");
  const o = (r: any, f: (x: any) => string): Opt[] => itemsOf(r.data).map((x: any) => ({ value: x.id, label: f(x) }));
  const cols: Col[] = [
    { label: "Cultura", primary: true, render: (c) => `${c.cultura} · ${c.safra}` }, { label: "Talhão", render: (c) => `${c.talhao} (${c.areaHa} ha)` },
    { label: "Plantio", render: (c) => fmtDate(c.plantioReal ?? c.plantioPrevisto) }, { label: "Colheita", render: (c) => fmtDate(c.colheitaReal ?? c.colheitaPrevista) },
    { label: "Custo", render: (c) => fmtMoney(c.custoTotal) }, { label: "Produtividade", render: (c) => (c.produtividadeKgHa ? `${fmtNum(c.produtividadeKgHa, 0)} kg/ha` : "—") },
    { label: "Turma", render: (c) => c.turma ?? "—", hideOnMobile: true }, { label: "Situação", render: (c) => <Status value={c.status} /> },
  ];
  return (
    <>
      {p.data && <KpiRow><Kpi title="Áreas / talhões" value={`${p.data.areas} / ${p.data.talhoes}`} hint={`${p.data.hectares} ha`} /><Kpi title="Em cultivo" value={p.data.emAndamento} hint={`${fmtNum(p.data.hectaresEmCultivo)} ha`} color={COLORS.ok} /><Kpi title="Planejados" value={p.data.planejados} /><Kpi title="Colhidos" value={p.data.colhidos} /><Kpi title="Custo acumulado" value={fmtMoney(p.data.custoTotal)} /><Kpi title="Alertas" value={p.data.alertas} color={p.data.alertasCriticos ? COLORS.bad : COLORS.ok} /></KpiRow>}
      <Section title="Ciclos: plantio, manejo e colheita" actions={podeEditar ? <Button size="small" variant="contained" onClick={() => setNovo(true)}>Novo ciclo</Button> : undefined}>
        <LoadBox loading={l.loading} error={l.error} onRetry={l.reload} empty={!rows.length} emptyText="Nenhum ciclo cadastrado.">
          <DataList rows={rows} columns={cols} onRowClick={(c) => setSel(c.id)} />
        </LoadBox>
        {novo && <FormDialog open title="Novo ciclo de cultivo" maxWidth="md" submitLabel="Planejar" onClose={() => setNovo(false)}
          intro={<Aviso>O sistema avisa se o plantio estiver fora da janela recomendada da cultura e impede dois ciclos no mesmo talhão e período.</Aviso>}
          fields={[{ key: "talhaoId", label: "Talhão", type: "select", required: true, options: o(tal, (t) => `${t.nome} (${t.hectares} ha)`) }, { key: "culturaId", label: "Cultura", type: "select", required: true, options: o(cul, (c) => c.nome) }, { key: "cultivarId", label: "Cultivar", type: "select", options: o(cvr, (c) => c.nome) }, { key: "safra", label: "Safra (ex.: 2026/27)", required: true }, { key: "plantioPrevisto", label: "Plantio previsto", type: "date", required: true }, { key: "areaHa", label: "Área do ciclo (ha) — vazio = talhão inteiro", type: "number" }, { key: "responsavelUserId", label: "Responsável", type: "select", options: eq.opts }, { key: "classSectionId", label: "Turma da aula prática", type: "select", options: o(turmas, (t) => t.nome) }, { key: "confirmarForaJanela", label: "Confirmar mesmo fora da janela de plantio", type: "bool" }]}
          onSubmit={async (b) => { const r = await cp("POST", "/agro/ciclos", b); if (r?.avisos?.length) window.alert(r.avisos.join("\n")); setRev((x) => x + 1); }} />}
        {sel && <CicloDetalhe id={sel} onClose={() => { setSel(null); setRev((x) => x + 1); }} podeEditar={podeEditar} />}
      </Section>
    </>
  );
}

function CicloDetalhe({ id, onClose, podeEditar }: { id: string; onClose: () => void; podeEditar: boolean }) {
  const pf = perfil();
  const [rev, setRev] = useState(0);
  const d = useCp<any>(`/agro/ciclos/${id}`, [rev]);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const [dlg, setDlg] = useState<string | null>(null);
  const c = d.data;
  const aberto = c && ["PLANEJADO", "PLANTADO", "EM_MANEJO"].includes(c.status);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>{c ? `${c.cultura} · ${c.talhao} · safra ${c.safra}` : "Ciclo"}</DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={d.loading} error={d.error} onRetry={d.reload}>
          {c && (
            <>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}><Status value={c.status} />{c.foraDaJanela && <Etiqueta t="plantio fora da janela" color="warning" />}{c.turma && <Etiqueta t={`aula prática: ${c.turma}`} color="info" />}</Box>
              <Typography variant="body2">Área {c.areaHa} ha · plantio {fmtDate(c.plantioReal ?? c.plantioPrevisto)} · colheita {fmtDate(c.colheitaReal ?? c.colheitaPrevista)} · responsável: {c.responsavel ?? "—"} · custo {fmtMoney(c.custoTotal)} ({fmtMoney(c.custoPorHa)}/ha)</Typography>
              {c.liberaColheitaEm && <Alert severity="warning" sx={{ my: 1 }}>Carência de defensivo em vigor: colheita liberada a partir de {fmtDate(c.liberaColheitaEm)}.</Alert>}
              {c.produtividadeKgHa && <Alert severity="success" sx={{ my: 1 }}>Produção {fmtNum(c.producaoKg, 0)} kg · produtividade {fmtNum(c.produtividadeKgHa, 0)} kg/ha.</Alert>}
              {podeEditar && aberto && (
                <Acoes>
                  {c.status === "PLANEJADO" && <Button size="small" variant="contained" onClick={() => setDlg("plantar")}>Registrar plantio</Button>}
                  {c.status !== "PLANEJADO" && <Button size="small" variant="contained" color="success" onClick={() => setDlg("colher")}>Registrar colheita</Button>}
                  <Button size="small" color="error" onClick={() => setDlg("cancelar")}>Cancelar ciclo</Button>
                </Acoes>
              )}
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}><Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>Atividades de campo</Typography>{(pf.escreveCampo || pf.aluno) && !["COLHIDO", "CANCELADO"].includes(c.status) && <Button size="small" variant="outlined" onClick={() => setDlg("atividade")}>Registrar atividade</Button>}</Box>
              <LoadBox empty={!c.atividades.length} emptyText="Nenhuma atividade.">
                <DataList rows={c.atividades} columns={[
                  { label: "Data", primary: true, render: (a: any) => fmtDate(a.data) }, { label: "Atividade", render: (a: any) => a.tipo.replace(/_/g, " ").toLowerCase() }, { label: "Insumo", render: (a: any) => (a.insumo ? `${a.insumo}${a.quantidade ? ` · ${a.quantidade} ${a.unidade ?? ""}` : ""}` : "—") },
                  { label: "Custo", render: (a: any) => fmtMoney(a.custo) }, { label: "Carência até", render: (a: any) => (a.carenciaAte ? fmtDate(a.carenciaAte) : "—"), hideOnMobile: true }, { label: "Responsável", render: (a: any) => a.responsavel ?? "—", hideOnMobile: true },
                ]} actions={(a: any) => (podeEditar && c.status !== "COLHIDO" ? <ActionsMenu items={[{ label: "Excluir", color: "error", onClick: () => run(() => cp("DELETE", `/agro/atividades/${a.id}`), "Atividade removida.", "Excluir esta atividade?") }]} /> : null)} />
              </LoadBox>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}><Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>Monitoramento (pragas, doenças e observações)</Typography>{(pf.escreveCampo || pf.aluno) && <Button size="small" variant="outlined" onClick={() => setDlg("monitoramento")}>Novo registro</Button>}</Box>
              <LoadBox empty={!c.monitoramentos.length} emptyText="Nenhum registro de monitoramento.">
                <DataList rows={c.monitoramentos} columns={[
                  { label: "Data", primary: true, render: (m: any) => fmtDate(m.data) }, { label: "Tipo", render: (m: any) => m.tipo.replace(/_/g, " ").toLowerCase() }, { label: "Descrição", render: (m: any) => m.descricao },
                  { label: "Severidade", render: (m: any) => <Etiqueta t={m.severidade} color={m.severidade === "ALTA" ? "error" : m.severidade === "MEDIA" ? "warning" : "default"} /> },
                  { label: "Foto", render: (m: any) => (m.fotoUrl ? <a href={m.fotoUrl} target="_blank" rel="noreferrer">ver foto</a> : "—") }, { label: "Situação", render: (m: any) => (m.resolvido ? <Etiqueta t="resolvido" color="success" /> : "aberto") },
                ]} actions={(m: any) => (podeEditar && !m.resolvido ? <ActionsMenu items={[{ label: "Marcar como resolvido", onClick: () => setDlg(`resolver:${m.id}`) }]} /> : null)} />
              </LoadBox>
            </>
          )}
        </LoadBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      {dlg === "plantar" && <FormDialog open title="Registrar plantio" fields={[{ key: "data", label: "Data do plantio", type: "date", required: true }]} initial={{ data: new Date().toISOString().slice(0, 10) }} onClose={() => setDlg(null)} onSubmit={async (b) => { await cp("POST", `/agro/ciclos/${id}/plantar`, b); setRev((x) => x + 1); }} />}
      {dlg === "colher" && <FormDialog open title="Registrar colheita" fields={[{ key: "data", label: "Data da colheita", type: "date", required: true }, { key: "producaoKg", label: "Produção total (kg)", type: "number", required: true }]} initial={{ data: new Date().toISOString().slice(0, 10) }} onClose={() => setDlg(null)} intro={<Aviso>Se houver carência de defensivo em vigor, o sistema bloqueia a colheita.</Aviso>} onSubmit={async (b) => { await cp("POST", `/agro/ciclos/${id}/colher`, b); setRev((x) => x + 1); }} />}
      {dlg === "cancelar" && <FormDialog open title="Cancelar ciclo" fields={[{ key: "motivo", label: "Motivo", type: "textarea", required: true }]} onClose={() => setDlg(null)} onSubmit={async (b) => { await cp("POST", `/agro/ciclos/${id}/cancelar`, b); setRev((x) => x + 1); }} />}
      {dlg === "atividade" && <FormDialog open title="Registrar atividade de campo" maxWidth="md" submitLabel="Registrar" onClose={() => setDlg(null)}
        fields={[{ key: "tipo", label: "Atividade", type: "select", required: true, options: ["PREPARO_SOLO", "ADUBACAO", "PLANTIO", "APLICACAO_DEFENSIVO", "IRRIGACAO", "CAPINA", "COLHEITA", "OUTRO"] }, { key: "data", label: "Data", type: "date", required: true }, { key: "insumo", label: "Insumo / produto" }, { key: "quantidade", label: "Quantidade", type: "number" }, { key: "unidade", label: "Unidade" }, { key: "custoUnitario", label: "Custo unitário (R$)", type: "number" }, { key: "custo", label: "Custo total (R$) — vazio = quantidade × unitário", type: "number" }, { key: "carenciaDias", label: "Carência do defensivo (dias, conforme bula)", type: "number" }, { key: "observacao", label: "Observação", type: "textarea" }]}
        initial={{ data: new Date().toISOString().slice(0, 10) }} onSubmit={async (b) => { const r = await cp("POST", `/agro/ciclos/${id}/atividades`, b); if (r?.avisos?.length) window.alert(r.avisos.join("\n")); setRev((x) => x + 1); }} />}
      {dlg === "monitoramento" && <FormDialog open title="Registro de monitoramento" submitLabel="Registrar" onClose={() => setDlg(null)}
        fields={[{ key: "data", label: "Data", type: "date", required: true }, { key: "tipo", label: "Tipo", type: "select", required: true, options: ["PRAGA", "DOENCA", "PLANTA_DANINHA", "CLIMA", "ESTADO_FENOLOGICO", "OBSERVACAO"] }, { key: "severidade", label: "Severidade", type: "select", required: true, options: ["BAIXA", "MEDIA", "ALTA"] }, { key: "descricao", label: "Descrição", type: "textarea", required: true }, { key: "fotoUrl", label: "Foto (link https)", full: true, helper: "Cole o link de uma foto armazenada na nuvem da instituição." }]}
        initial={{ data: new Date().toISOString().slice(0, 10), severidade: "BAIXA" }} onSubmit={async (b) => { await cp("POST", `/agro/ciclos/${id}/monitoramentos`, b); setRev((x) => x + 1); }} />}
      {dlg?.startsWith("resolver:") && <FormDialog open title="Resolver ocorrência" fields={[{ key: "acao", label: "Ação tomada", type: "textarea", required: true }]} onClose={() => setDlg(null)} onSubmit={async (b) => { await cp("POST", `/agro/monitoramentos/${dlg.slice(9)}/resolver`, b); setRev((x) => x + 1); }} />}
    </Dialog>
  );
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function Calendario() {
  const l = useCp<any>("/agro/calendario");
  const d = l.data;
  const hoje = new Date();
  const base = new Date(hoje.getFullYear(), hoje.getMonth() - 8, 1);
  const meses = Array.from({ length: 18 }, (_, i) => new Date(base.getFullYear(), base.getMonth() + i, 1));
  const cel = (c: any, m: Date) => {
    const ini = new Date(c.plantio), fim = new Date(c.colheita);
    const fimMes = new Date(m.getFullYear(), m.getMonth() + 1, 0, 23, 59);
    if (ini > fimMes || fim < m) return null;
    const plant = ini.getFullYear() === m.getFullYear() && ini.getMonth() === m.getMonth();
    const colh = fim.getFullYear() === m.getFullYear() && fim.getMonth() === m.getMonth();
    return plant ? "P" : colh ? "C" : "·";
  };
  return (
    <Section title="Calendário agrícola (plantio P, colheita C)">
      <LoadBox loading={l.loading} error={l.error} onRetry={l.reload} empty={!d?.ciclos?.length} emptyText="Nenhum ciclo planejado.">
        {d && (
          <Box sx={{ overflowX: "auto" }}>
            <Box component="table" sx={{ borderCollapse: "collapse", fontSize: 12, minWidth: 760 }}>
              <thead><tr><th style={{ textAlign: "left", padding: 4 }}>Ciclo</th>{meses.map((m, i) => <th key={i} style={{ padding: 2, fontWeight: m.getMonth() === hoje.getMonth() && m.getFullYear() === hoje.getFullYear() ? 800 : 500 }}>{MESES[m.getMonth()]}<br /><span style={{ color: "#888" }}>{String(m.getFullYear()).slice(2)}</span></th>)}</tr></thead>
              <tbody>
                {d.ciclos.map((c: any) => (
                  <tr key={c.id}>
                    <td style={{ padding: 4, whiteSpace: "nowrap" }}>{c.cultura} · {c.talhao} <Status value={c.status} /></td>
                    {meses.map((m, i) => { const x = cel(c, m); return <td key={i} style={{ textAlign: "center", padding: 2, background: x ? (x === "P" ? COLORS.ok : x === "C" ? COLORS.warn : "#cbe8d3") : undefined, color: x === "P" || x === "C" ? "#fff" : "#2d6a3e", fontWeight: 700, borderRadius: 3 }}>{x ?? ""}</td>; })}
                  </tr>
                ))}
              </tbody>
            </Box>
          </Box>
        )}
        {d?.janelas?.length > 0 && <Box sx={{ mt: 2 }}><Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Janelas recomendadas de plantio</Typography>{d.janelas.map((j: any) => <Typography key={j.cultura} variant="body2">{j.cultura}: {MESES[j.mesInicio - 1]} a {MESES[j.mesFim - 1]} · ciclo médio {j.cicloDias} dias</Typography>)}</Box>}
      </LoadBox>
    </Section>
  );
}

function Produtividade() {
  const l = useCp<any>("/agro/produtividade");
  const d = l.data;
  return (
    <Section title="Produtividade por talhão e safra">
      <LoadBox loading={l.loading} error={l.error} onRetry={l.reload} empty={!d?.items?.length} emptyText="Nenhuma colheita registrada ainda.">
        {d && (
          <>
            <KpiRow>{d.porCultura.map((c: any) => <Kpi key={c.cultura} title={c.cultura} value={`${fmtNum(c.produtividadeMediaKgHa, 0)} kg/ha`} hint={`${fmtNum(c.areaHa)} ha · custo ${fmtMoney(c.custo)}`} color={COLORS.ok} />)}</KpiRow>
            <DataList rows={d.items} columns={[
              { label: "Safra", primary: true, render: (i: any) => `${i.cultura} · ${i.safra}` }, { label: "Talhão", render: (i: any) => i.talhao }, { label: "Área", render: (i: any) => `${i.areaHa} ha` }, { label: "Produção", render: (i: any) => `${fmtNum(i.producaoKg, 0)} kg` },
              { label: "Produtividade", render: (i: any) => `${fmtNum(i.produtividadeKgHa, 0)} kg/ha` }, { label: "Custo/ha", render: (i: any) => fmtMoney(i.custoPorHa) }, { label: "Custo/kg", render: (i: any) => fmtMoney(i.custoPorKg) },
            ]} />
          </>
        )}
      </LoadBox>
    </Section>
  );
}

function Aulas() {
  const l = useCp<any>("/agro/aulas-praticas");
  return (
    <Section title="Aulas práticas vinculadas a disciplinas e turmas">
      <LoadBox loading={l.loading} error={l.error} onRetry={l.reload} empty={!itemsOf(l.data).length} emptyText="Nenhum ciclo vinculado a turma.">
        {itemsOf(l.data).map((t: any) => (
          <Paper key={t.classSectionId} variant="outlined" sx={{ p: 2, mb: 1.5, borderRadius: 3 }}>
            <Typography sx={{ fontWeight: 800 }}>{t.disciplina} <Typography component="span" variant="body2" color="text.secondary">· turma {t.turma}</Typography></Typography>
            {t.ciclos.map((c: any) => <Typography key={c.id} variant="body2">{c.cultura} em {c.talhao} — <Status value={c.status} /> · {c.atividades} atividade(s) de campo registradas</Typography>)}
          </Paper>
        ))}
      </LoadBox>
    </Section>
  );
}

function Alertas() {
  const l = useCp<any>("/agro/alertas");
  const items = itemsOf(l.data);
  return (
    <Section title="Alertas: janela de plantio/colheita, carência e infestações">
      <LoadBox loading={l.loading} error={l.error} onRetry={l.reload} empty={!items.length} emptyText="Nenhum alerta no momento.">
        <DataList rows={items.map((a: any, i: number) => ({ ...a, id: String(i) }))} columns={[
          { label: "Gravidade", render: (a: any) => <Etiqueta t={a.severidade === "CRITICO" ? "Crítico" : "Atenção"} color={corSeveridade(a.severidade)} /> }, { label: "Alerta", primary: true, render: (a: any) => a.titulo }, { label: "Data", render: (a: any) => (a.data ? fmtDate(a.data) : "—") },
        ]} />
      </LoadBox>
    </Section>
  );
}

function Cadastros({ podeEditar }: { podeEditar: boolean }) {
  const areas = useCp<any>("/agro/areas?pageSize=100");
  const culturas = useCp<any>("/agro/culturas?pageSize=100");
  const tal = useCp<any>("/agro/talhoes?pageSize=200");
  const aOpts: Opt[] = itemsOf(areas.data).map((a: any) => ({ value: a.id, label: a.nome }));
  const cOpts: Opt[] = itemsOf(culturas.data).map((a: any) => ({ value: a.id, label: a.nome }));
  const nome = (opts: Opt[], id: string) => opts.find((o) => o.value === id)?.label ?? "—";
  void tal; void Tooltip; void Btn;
  return (
    <>
      <Cadastro titulo="Áreas" path="/agro/areas" podeEditar={podeEditar} novoLabel="Nova área" busca={false} columns={[{ label: "Área", primary: true, render: (a) => a.nome }, { label: "Tipo", render: (a) => String(a.tipo).replace(/_/g, " ").toLowerCase() }, { label: "Hectares", render: (a) => a.hectares }, { label: "Local", render: (a) => a.localizacao ?? "—", hideOnMobile: true }]}
        fields={[{ key: "nome", label: "Nome", required: true }, { key: "tipo", label: "Tipo", type: "select", required: true, options: ["CAMPO_EXPERIMENTAL", "HORTA", "POMAR", "ESTUFA", "PASTAGEM", "VIVEIRO"] }, { key: "hectares", label: "Hectares", type: "number", required: true }, { key: "localizacao", label: "Localização", full: true }]} />
      <Cadastro titulo="Talhões" path="/agro/talhoes" podeEditar={podeEditar} novoLabel="Novo talhão" busca={false} columns={[{ label: "Talhão", primary: true, render: (t) => t.nome }, { label: "Área", render: (t) => nome(aOpts, t.areaId) }, { label: "Hectares", render: (t) => t.hectares }, { label: "Solo", render: (t) => t.solo ?? "—" }, { label: "Irrigado", render: (t) => (t.irrigado ? "Sim" : "Não") }]}
        fields={[{ key: "areaId", label: "Área", type: "select", required: true, options: aOpts }, { key: "nome", label: "Nome", required: true }, { key: "hectares", label: "Hectares", type: "number", required: true }, { key: "solo", label: "Solo" }, { key: "irrigado", label: "Irrigado", type: "bool" }]} />
      <Cadastro titulo="Culturas e janela de plantio" path="/agro/culturas" podeEditar={podeEditar} novoLabel="Nova cultura" busca={false} columns={[{ label: "Cultura", primary: true, render: (c) => c.nome }, { label: "Ciclo", render: (c) => `${c.cicloDias} dias` }, { label: "Janela de plantio (meses)", render: (c) => `${c.mesPlantioInicio} a ${c.mesPlantioFim}` }]}
        fields={[{ key: "nome", label: "Nome", required: true }, { key: "especie", label: "Espécie" }, { key: "cicloDias", label: "Ciclo (dias)", type: "number", required: true }, { key: "mesPlantioInicio", label: "Mês inicial do plantio (1 a 12)", type: "number", required: true }, { key: "mesPlantioFim", label: "Mês final do plantio (1 a 12)", type: "number", required: true }]}
        toBody={(b) => ({ ...b, mesPlantioInicio: Number(b.mesPlantioInicio), mesPlantioFim: Number(b.mesPlantioFim) })} />
      <Cadastro titulo="Cultivares" path="/agro/cultivares" podeEditar={podeEditar} novoLabel="Nova cultivar" busca={false} columns={[{ label: "Cultivar", primary: true, render: (c) => c.nome }, { label: "Cultura", render: (c) => nome(cOpts, c.culturaId) }, { label: "Ciclo", render: (c) => (c.cicloDias ? `${c.cicloDias} dias` : "—") }]}
        fields={[{ key: "culturaId", label: "Cultura", type: "select", required: true, options: cOpts }, { key: "nome", label: "Nome", required: true }, { key: "cicloDias", label: "Ciclo (dias)", type: "number" }, { key: "obtentor", label: "Obtentor" }]} />
    </>
  );
}
