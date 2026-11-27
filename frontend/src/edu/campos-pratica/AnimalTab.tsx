import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useState } from "react";
import Cadastro from "./Cadastro";
import { Acoes, ActionsMenu, Aviso, COLORS, type Col, DataList, Etiqueta, FormDialog, Kpi, KpiRow, LoadBox, Pick, Progresso, Section, Status, cp, fmtDate, fmtNum, itemsOf, perfil, useCp, useDebounced, useEquipe, useRunner, useToast, type Opt } from "./kit";

const ESPECIES = { PEQUENO: ["CAO", "GATO", "COELHO", "AVE", "OUTRO"], GRANDE: ["BOVINO", "EQUINO", "OVINO", "CAPRINO", "SUINO", "OUTRO"] } as const;

export default function AnimalTab() {
  const [sub, setSub] = useState("animais");
  const pf = perfil();
  return (
    <>
      <ToggleButtonGroup exclusive size="small" value={sub} onChange={(_, v) => v && setSub(v)} sx={{ mb: 2, flexWrap: "wrap" }}>
        <ToggleButton value="animais">Animais</ToggleButton>
        <ToggleButton value="internacao">Internação e baias</ToggleButton>
        <ToggleButton value="vacinas">Vacinação e vermifugação</ToggleButton>
        <ToggleButton value="meds">Medicamentos (estoque)</ToggleButton>
        {pf.recepcao && <ToggleButton value="props">Propriedades</ToggleButton>}
      </ToggleButtonGroup>
      {sub === "animais" && <Animais />}
      {sub === "internacao" && <Internacao />}
      {sub === "vacinas" && <Vacinas />}
      {sub === "meds" && <Medicamentos />}
      {sub === "props" && <Propriedades />}
    </>
  );
}

function Animais() {
  const pf = perfil();
  const [grupo, setGrupo] = useState("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [rev, setRev] = useState(0);
  const [novo, setNovo] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const painel = useCp<any>("/animal/painel", [rev]);
  const l = useCp<any>(`/animal/animais?pageSize=100${grupo ? `&grupo=${grupo}` : ""}${dq ? `&q=${encodeURIComponent(dq)}` : ""}`, [rev]);
  const tutores = useCp<any>("/clinicas/pacientes?tipo=TUTOR&pageSize=200&consentimento=ATIVO");
  const props = useCp<any>("/animal/propriedades?pageSize=200");
  const [vals, setVals] = useState<Record<string, any>>({});
  const rows = itemsOf(l.data);
  const p = painel.data;
  return (
    <>
      {p && <KpiRow><Kpi title="Pequenos animais" value={p.pequenosAnimais} /><Kpi title="Grandes animais" value={p.grandesAnimais} /><Kpi title="Internados" value={p.internados} hint={`ocupação ${p.ocupacaoBaiasPct}%`} /><Kpi title="Vacinas atrasadas" value={p.profilaxiaAtrasada} color={p.profilaxiaAtrasada ? COLORS.bad : COLORS.ok} /><Kpi title="Próximas (7 dias)" value={p.profilaxiaProximos7Dias} /><Kpi title="Atendimentos hoje" value={p.atendimentosHoje} /></KpiRow>}
      <Section title="Animais atendidos no hospital veterinário-escola" actions={pf.recepcao || pf.professor ? <Button size="small" variant="contained" onClick={() => setNovo(true)}>Novo animal</Button> : undefined}>
        <Acoes>
          <TextField size="small" label="Nome ou identificação" value={q} onChange={(e) => setQ(e.target.value)} />
          <Pick label="Porte" value={grupo} onChange={setGrupo} all="Todos" minWidth={170} options={[{ value: "PEQUENO", label: "Pequenos animais" }, { value: "GRANDE", label: "Grandes animais" }]} />
        </Acoes>
        <LoadBox loading={l.loading} error={l.error} onRetry={l.reload} empty={!rows.length} emptyText="Nenhum animal cadastrado.">
          <DataList rows={rows} onRowClick={(a) => setSel(a.id)} columns={[
            { label: "Animal", primary: true, render: (a) => <>{a.nome}{a.internado ? " · internado" : ""}</> }, { label: "Espécie", render: (a) => `${String(a.especie).toLowerCase()}${a.raca ? " · " + a.raca : ""}` }, { label: "Porte", render: (a) => (a.grupo === "PEQUENO" ? "Pequeno" : "Grande") },
            { label: "Peso", render: (a) => (a.pesoAtualKg ? `${fmtNum(a.pesoAtualKg)} kg` : "—") }, { label: "Tutor", render: (a) => a.tutor ?? "—" }, { label: "Situação", render: (a) => <Status value={a.status} /> },
          ]} />
        </LoadBox>
        {novo && <FormDialog open title="Novo animal" maxWidth="md" submitLabel="Cadastrar" onClose={() => setNovo(false)} onValues={setVals}
          intro={<Aviso>O tutor precisa estar cadastrado (aba Pacientes) com consentimento ativo.</Aviso>}
          fields={[{ key: "nome", label: "Nome", required: true }, { key: "grupo", label: "Porte", type: "select", required: true, options: [{ value: "PEQUENO", label: "Pequeno animal (cães, gatos…)" }, { value: "GRANDE", label: "Grande animal (bovinos, equinos…)" }] }, { key: "especie", label: "Espécie", type: "select", required: true, options: ((vals.grupo as "PEQUENO" | "GRANDE") ? [...ESPECIES[vals.grupo as "PEQUENO" | "GRANDE"]] : []).map((e) => ({ value: e, label: e.toLowerCase() })) }, { key: "raca", label: "Raça" }, { key: "sexo", label: "Sexo", type: "select", options: [{ value: "M", label: "Macho" }, { value: "F", label: "Fêmea" }] }, { key: "pelagem", label: "Pelagem" }, { key: "identificacao", label: "Microchip / brinco" }, { key: "pesoAtualKg", label: "Peso atual (kg)", type: "number" }, { key: "tutorId", label: "Tutor", type: "select", required: true, options: itemsOf(tutores.data).map((t: any) => ({ value: t.id, label: t.nome })), full: true }, { key: "propriedadeId", label: "Propriedade (grandes animais)", type: "select", options: itemsOf(props.data).map((x: any) => ({ value: x.id, label: x.nome })) }]}
          initial={{ grupo: "PEQUENO" }} onSubmit={async (b) => { await cp("POST", "/animal/animais", b); setRev((x) => x + 1); }} />}
        {sel && <Ficha id={sel} onClose={() => { setSel(null); setRev((x) => x + 1); }} />}
      </Section>
    </>
  );
}

function Ficha({ id, onClose }: { id: string; onClose: () => void }) {
  const [rev, setRev] = useState(0);
  const d = useCp<any>(`/animal/animais/${id}`, [rev]);
  const pes = useCp<any>(`/animal/animais/${id}/pesagens`, [rev]);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const [dlg, setDlg] = useState<string | null>(null);
  const meds = useCp<any>("/animal/medicamentos/estoque?q=a");
  const a = d.data;
  void run;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>{a ? `${a.nome} — ${String(a.especie).toLowerCase()} (${a.grupo === "PEQUENO" ? "pequeno" : "grande"} animal)` : "Animal"}</DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={d.loading} error={d.error} onRetry={d.reload}>
          {a && (
            <>
              <Typography variant="body2">Tutor: {a.tutor} · Propriedade: {a.propriedade?.nome ?? "—"} · Peso: {a.pesoAtualKg ? `${fmtNum(a.pesoAtualKg)} kg` : "—"} · Identificação: {a.identificacao ?? "—"}</Typography>
              <Acoes>
                <Button size="small" variant="outlined" onClick={() => setDlg("profilaxia")}>Vacina / vermífugo</Button>
                <Button size="small" variant="outlined" onClick={() => setDlg("manejo")}>Manejo / pesagem</Button>
                <Button size="small" variant="outlined" onClick={() => setDlg("medicamento")}>Medicamento</Button>
              </Acoes>
              {pes.data?.items?.length >= 2 && <Aviso severity="success">Ganho médio diário: {fmtNum(pes.data.ganhoMedioDiarioKg, 2)} kg/dia · variação {fmtNum(pes.data.variacaoKg)} kg em {pes.data.items.length} pesagens.</Aviso>}
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Vacinação e vermifugação</Typography>
              <LoadBox empty={!a.profilaxia.length} emptyText="Nenhum registro.">
                <DataList rows={a.profilaxia} columns={[{ label: "Produto", primary: true, render: (p: any) => `${p.tipo === "VACINA" ? "Vacina" : p.tipo === "VERMIFUGO" ? "Vermífugo" : "Antiparasitário"}: ${p.produto}` }, { label: "Aplicada", render: (p: any) => fmtDate(p.aplicadaEm) }, { label: "Próxima dose", render: (p: any) => (p.proximaDose ? <Etiqueta t={fmtDate(p.proximaDose)} color={new Date(p.proximaDose) < new Date() ? "error" : "default"} /> : "—") }]} />
              </LoadBox>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2 }}>Manejo e pesagens</Typography>
              <LoadBox empty={!a.manejos.length} emptyText="Nenhum manejo registrado.">
                <DataList rows={a.manejos} columns={[{ label: "Data", primary: true, render: (m: any) => fmtDate(m.data) }, { label: "Tipo", render: (m: any) => m.tipo.replace(/_/g, " ").toLowerCase() }, { label: "Peso", render: (m: any) => (m.pesoKg ? `${m.pesoKg} kg` : "—") }, { label: "Descrição", render: (m: any) => m.descricao ?? "—" }]} />
              </LoadBox>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2 }}>Medicamentos usados</Typography>
              <LoadBox empty={!a.medicamentos.length} emptyText="Nenhum medicamento registrado.">
                <DataList rows={a.medicamentos} columns={[{ label: "Item (suprimentos)", primary: true, render: (m: any) => m.nomeItem }, { label: "Quantidade", render: (m: any) => `${m.quantidade} ${m.unidade ?? ""}` }, { label: "Data", render: (m: any) => fmtDate(m.data) }]} />
              </LoadBox>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2 }}>Internações</Typography>
              <LoadBox empty={!a.internacoes.length} emptyText="Sem internações.">
                <DataList rows={a.internacoes} columns={[{ label: "Entrada", primary: true, render: (i: any) => fmtDate(i.entradaEm) }, { label: "Motivo", render: (i: any) => i.motivo }, { label: "Situação", render: (i: any) => <Status value={i.status} /> }]} />
              </LoadBox>
            </>
          )}
        </LoadBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      {dlg === "profilaxia" && <FormDialog open title="Vacina ou vermífugo" onClose={() => setDlg(null)} intro={<Aviso>Informe a próxima dose (ou o intervalo em dias) e o sistema agenda os lembretes ao responsável e ao tutor.</Aviso>}
        fields={[{ key: "tipo", label: "Tipo", type: "select", required: true, options: ["VACINA", "VERMIFUGO", "ANTIPARASITARIO"] }, { key: "produto", label: "Produto", required: true }, { key: "lote", label: "Lote" }, { key: "aplicadaEm", label: "Data da aplicação", type: "date", required: true }, { key: "proximaDose", label: "Próxima dose", type: "date" }, { key: "intervaloDias", label: "ou intervalo (dias)", type: "number" }]}
        initial={{ aplicadaEm: new Date().toISOString().slice(0, 10) }} onSubmit={async (b) => { await cp("POST", `/animal/animais/${id}/profilaxia`, b); setRev((x) => x + 1); }} />}
      {dlg === "manejo" && <FormDialog open title="Manejo ou pesagem" onClose={() => setDlg(null)}
        fields={[{ key: "tipo", label: "Tipo", type: "select", required: true, options: ["PESAGEM", "CASCOS", "TOSQUIA", "EXAME_CLINICO", "EVOLUCAO", "ALIMENTACAO", "REPRODUTIVO", "OUTRO"] }, { key: "data", label: "Data", type: "date", required: true }, { key: "pesoKg", label: "Peso (kg)", type: "number" }, { key: "descricao", label: "Descrição", type: "textarea" }]}
        initial={{ tipo: "PESAGEM", data: new Date().toISOString().slice(0, 10) }} onSubmit={async (b) => { await cp("POST", `/animal/animais/${id}/manejos`, b); setRev((x) => x + 1); }} />}
      {dlg === "medicamento" && <FormDialog open title="Uso de medicamento" onClose={() => setDlg(null)} intro={<Aviso>Referencia o item do módulo de suprimentos; a baixa de estoque é feita lá.</Aviso>}
        fields={[{ key: "supItemId", label: "Item do estoque", type: "select", required: true, options: itemsOf(meds.data).map((m: any) => ({ value: m.id, label: `${m.nome} (saldo ${m.saldo})` })), full: true }, { key: "quantidade", label: "Quantidade", type: "number", required: true }, { key: "data", label: "Data", type: "date", required: true }]}
        initial={{ data: new Date().toISOString().slice(0, 10) }} onSubmit={async (b) => { const r = await cp("POST", `/animal/animais/${id}/medicamentos`, b); if (r.abaixoDoMinimo) window.alert("Atenção: o saldo ficará abaixo do estoque mínimo. Avise o setor de suprimentos."); setRev((x) => x + 1); }} />}
    </Dialog>
  );
}

function Internacao() {
  const pf = perfil();
  const [rev, setRev] = useState(0);
  const [novo, setNovo] = useState(false);
  const [alta, setAlta] = useState<any>(null);
  const { toast, node } = useToast();
  void toast;
  const eq = useEquipe();
  const l = useCp<any>("/animal/internacoes?status=INTERNADO", [rev]);
  const oc = useCp<any>("/animal/baias/ocupacao", [rev]);
  const animais = useCp<any>("/animal/animais?pageSize=200&status=ATIVO");
  const rows = itemsOf(l.data);
  const baias = itemsOf(oc.data);
  const baiaOpts: Opt[] = baias.filter((b: any) => b.status === "ATIVA" && b.livres > 0).map((b: any) => ({ value: b.id, label: `${b.nome} — ${b.livres} vaga(s) · ${b.grupo === "PEQUENO" ? "pequenos" : "grandes"}` }));
  return (
    <>
      <Section title="Baias, piquetes e canis">
        {node}
        <LoadBox loading={oc.loading} error={oc.error} onRetry={oc.reload} empty={!baias.length} emptyText="Nenhuma baia cadastrada.">
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1.2 }}>
            {baias.map((b: any) => (
              <Paper key={b.id} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                <Typography sx={{ fontWeight: 800 }}>{b.nome}</Typography>
                <Typography variant="caption" color="text.secondary">{b.tipo.toLowerCase()} · {b.grupo === "PEQUENO" ? "pequenos" : "grandes"} animais</Typography>
                <Progresso valor={(b.ocupadas / b.capacidade) * 100} texto={`${b.ocupadas}/${b.capacidade} ocupada(s)`} />
                {b.animais.map((a: any) => <Typography key={a.internacaoId} variant="body2">• {a.nome} ({String(a.especie).toLowerCase()})</Typography>)}
              </Paper>
            ))}
          </Box>
        </LoadBox>
        {pf.professor || pf.gestor ? <Acoes><Button size="small" variant="contained" sx={{ mt: 1.5 }} onClick={() => setNovo(true)}>Internar animal</Button></Acoes> : null}
      </Section>
      <Section title="Animais internados">
        <LoadBox loading={l.loading} error={l.error} onRetry={l.reload} empty={!rows.length} emptyText="Nenhum animal internado.">
          <DataList rows={rows} columns={[
            { label: "Animal", primary: true, render: (i) => `${i.animal?.nome ?? "—"} (${String(i.animal?.especie ?? "").toLowerCase()})` }, { label: "Baia", render: (i) => i.baia }, { label: "Motivo", render: (i) => i.motivo }, { label: "Dias", render: (i) => i.diasInternado },
            { label: "Supervisor", render: (i) => i.supervisor }, { label: "Estagiário", render: (i) => i.aluno ?? "—" },
          ]} actions={(i) => (pf.professor || pf.gestor ? <ActionsMenu items={[{ label: "Dar alta / registrar desfecho", onClick: () => setAlta(i) }]} /> : null)} />
        </LoadBox>
      </Section>
      {novo && <FormDialog open title="Internar animal" submitLabel="Internar" onClose={() => setNovo(false)} intro={<Aviso>A baia precisa ser compatível com o porte e ter vaga. Aluno só acompanha com supervisor e aluno escalados.</Aviso>}
        fields={[{ key: "animalId", label: "Animal", type: "select", required: true, options: itemsOf(animais.data).map((a: any) => ({ value: a.id, label: `${a.nome} (${String(a.especie).toLowerCase()})` })) }, { key: "baiaId", label: "Baia / piquete / canil", type: "select", required: true, options: baiaOpts }, { key: "supervisorUserId", label: "Supervisor", type: "select", required: true, options: eq.opts }, { key: "alunoStudentId", label: "Aluno-estagiário", type: "student" }, { key: "motivo", label: "Motivo da internação", type: "textarea", required: true }]}
        onSubmit={async (b) => { await cp("POST", "/animal/internacoes", b); setRev((x) => x + 1); }} />}
      {alta && <FormDialog open title={`Desfecho — ${alta.animal?.nome}`} onClose={() => setAlta(null)} fields={[{ key: "status", label: "Desfecho", type: "select", required: true, options: [{ value: "ALTA", label: "Alta" }, { value: "TRANSFERIDO", label: "Transferido" }, { value: "OBITO", label: "Óbito" }] }, { key: "desfecho", label: "Resumo e orientações", type: "textarea", required: true }]} initial={{ status: "ALTA" }}
        onSubmit={async (b) => { await cp("POST", `/animal/internacoes/${alta.id}/alta`, b); setRev((x) => x + 1); }} />}
    </>
  );
}

function Vacinas() {
  const [dias, setDias] = useState("30");
  const l = useCp<any>(`/animal/profilaxia/pendentes?dias=${dias}`);
  const rows = itemsOf(l.data);
  return (
    <Section title="Vacinação e vermifugação: doses vencidas e próximas">
      <Aviso>Os tutores recebem lembretes automáticos (WhatsApp/in-app, via caixa de saída) {` `}antes do vencimento da dose.</Aviso>
      <Acoes><Pick label="Janela" value={dias} onChange={setDias} minWidth={150} options={[{ value: "7", label: "7 dias" }, { value: "30", label: "30 dias" }, { value: "90", label: "90 dias" }]} /></Acoes>
      <LoadBox loading={l.loading} error={l.error} onRetry={l.reload} empty={!rows.length} emptyText="Nenhuma dose a vencer neste período.">
        <DataList rows={rows} columns={[
          { label: "Animal", primary: true, render: (r) => `${r.animal} (${String(r.especie).toLowerCase()})` }, { label: "Dose", render: (r) => `${r.tipo === "VACINA" ? "Vacina" : "Vermífugo"}: ${r.produto}` }, { label: "Tutor", render: (r) => r.tutor ?? "—" },
          { label: "Vence", render: (r) => fmtDate(r.proximaDose) }, { label: "Situação", render: (r) => <Etiqueta t={r.situacao === "ATRASADA" ? `atrasada ${-r.diasRestantes} d` : `em ${r.diasRestantes} d`} color={r.situacao === "ATRASADA" ? "error" : r.situacao === "PROXIMA" ? "warning" : "default"} /> },
          { label: "Aviso ao tutor", render: (r) => (r.lembreteEnviadoEm ? "enviado" : "pendente"), hideOnMobile: true },
        ]} />
      </LoadBox>
    </Section>
  );
}

function Medicamentos() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const l = useCp<any>(`/animal/medicamentos/estoque${dq ? `?q=${encodeURIComponent(dq)}` : ""}`);
  const rows = itemsOf(l.data);
  return (
    <Section title="Medicamentos veterinários (estoque do módulo Suprimentos)">
      <Aviso>Esta tela apenas consulta o estoque do módulo de suprimentos e registra o uso por animal. Entradas, baixas e inventário são feitos em Compras, estoque e vendas.</Aviso>
      <Acoes><TextField size="small" label="Buscar item" value={q} onChange={(e) => setQ(e.target.value)} /></Acoes>
      <LoadBox loading={l.loading} error={l.error} onRetry={l.reload} empty={!rows.length} emptyText="Nenhum item encontrado. Busque pelo nome para localizar itens do estoque.">
        <DataList rows={rows} columns={[
          { label: "Item", primary: true, render: (m) => `${m.nome} (${m.codigo})` }, { label: "Saldo", render: (m) => `${fmtNum(m.saldo, 0)} ${m.unidade}` }, { label: "Mínimo", render: (m) => m.estoqueMinimo },
          { label: "Consumo 30 dias", render: (m) => m.consumo30dias }, { label: "Situação", render: (m) => <Etiqueta t={m.abaixoDoMinimo ? "abaixo do mínimo" : "ok"} color={m.abaixoDoMinimo ? "error" : "success"} /> },
        ]} />
      </LoadBox>
    </Section>
  );
}

function Propriedades() {
  const tutores = useCp<any>("/clinicas/pacientes?tipo=TUTOR&pageSize=200");
  const tOpts: Opt[] = itemsOf(tutores.data).map((t: any) => ({ value: t.id, label: t.nome }));
  const cols: Col[] = [{ label: "Propriedade", primary: true, render: (p) => p.nome }, { label: "Tutor", render: (p) => tOpts.find((t) => t.value === p.tutorId)?.label ?? "—" }, { label: "Município", render: (p) => `${p.municipio ?? "—"}${p.uf ? "/" + p.uf : ""}` }, { label: "Exploração", render: (p) => (p.exploracao ?? "—").replace(/_/g, " ").toLowerCase() }, { label: "Hectares", render: (p) => p.hectares ?? "—" }];
  return (
    <Cadastro titulo="Propriedades rurais dos tutores" path="/animal/propriedades" podeEditar columns={cols} novoLabel="Nova propriedade"
      fields={[{ key: "tutorId", label: "Tutor / produtor", type: "select", required: true, options: tOpts, full: true }, { key: "nome", label: "Nome da propriedade", required: true }, { key: "municipio", label: "Município" }, { key: "uf", label: "UF" }, { key: "hectares", label: "Hectares", type: "number" }, { key: "exploracao", label: "Exploração", type: "select", options: ["BOVINOCULTURA_CORTE", "LEITE", "EQUINOCULTURA", "OVINOCAPRINO", "SUINOCULTURA", "AVICULTURA", "MISTA"] }]} />
  );
}
