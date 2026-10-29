import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useState } from "react";
import {
  Acoes, ActionsMenu, Aviso, Btn, type Col, DataList, Etiqueta, FormDialog, LoadBox, Pick, Progresso, Section, Status, cp, corSeveridade, dataIso, errMsg, fmtDate, itemsOf, perfil, useCp, useEquipe, useRunner, useToast,
  type FormField,
} from "./kit";

export default function EstagiosTab() {
  const [sub, setSub] = useState("estagios");
  return (
    <>
      <ToggleButtonGroup exclusive size="small" value={sub} onChange={(_, v) => v && setSub(v)} sx={{ mb: 2, flexWrap: "wrap" }}>
        <ToggleButton value="estagios">Estágios</ToggleButton>
        <ToggleButton value="curso">Painel por curso</ToggleButton>
        <ToggleButton value="alertas">Alertas</ToggleButton>
      </ToggleButtonGroup>
      {sub === "estagios" && <Lista />}
      {sub === "curso" && <PainelCurso />}
      {sub === "alertas" && <Alertas />}
    </>
  );
}

function Lista() {
  const pf = perfil();
  const [status, setStatus] = useState("");
  const [rev, setRev] = useState(0);
  const [novo, setNovo] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const l = useCp<any>(`/estagios?pageSize=100${status ? `&status=${status}` : ""}`, [rev]);
  const rows = itemsOf(l.data);
  const cols: Col[] = [
    { label: "Aluno", primary: true, render: (r) => <>{r.aluno ?? "—"}</> },
    { label: "Curso", render: (r) => r.curso },
    { label: "Campo", render: (r) => r.campo },
    { label: "Período", render: (r) => `${fmtDate(r.inicio)} a ${fmtDate(r.fim)}` },
    { label: "Orientador", render: (r) => r.orientador },
    { label: "Horas", render: (r) => <Progresso valor={r.progresso} texto={`${r.horasValidadas}/${r.cargaHorariaTotal} h${r.horasPendentes ? ` (+${r.horasPendentes} a validar)` : ""}`} /> },
    { label: "Situação", render: (r) => <Status value={r.status} /> },
  ];
  return (
    <Section title="Estágios supervisionados" actions={pf.secretaria ? <Button variant="contained" size="small" onClick={() => setNovo(true)}>Novo estágio</Button> : undefined}>
      <Acoes>
        <Pick label="Situação" value={status} onChange={setStatus} all="Todas" options={[{ value: "AGUARDANDO_DOCUMENTOS", label: "Aguardando documentos" }, { value: "EM_ANDAMENTO", label: "Em andamento" }, { value: "ENCERRADO", label: "Encerrados" }, { value: "CANCELADO", label: "Cancelados" }]} />
      </Acoes>
      <LoadBox loading={l.loading} error={l.error} onRetry={l.reload} empty={!rows.length} emptyText="Nenhum estágio encontrado.">
        <DataList rows={rows} columns={cols} onRowClick={(r) => setSel(r.id)} />
      </LoadBox>
      {novo && <NovoEstagio onClose={() => setNovo(false)} onDone={() => setRev((x) => x + 1)} />}
      {sel && <Detalhe id={sel} onClose={() => { setSel(null); setRev((x) => x + 1); }} />}
    </Section>
  );
}

function NovoEstagio({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const v = useCp<any>("/estagios/vagas/disponibilidade");
  const eq = useEquipe();
  const vagas = itemsOf(v.data).filter((x: any) => x.disponiveis > 0);
  const campos: FormField[] = [
    { key: "studentId", label: "Aluno", type: "student", required: true },
    { key: "vagaId", label: "Vaga", type: "select", required: true, options: vagas.map((x: any) => ({ value: x.id, label: `${x.curso} · ${x.campo} (${x.concedente}) — ${x.disponiveis} livre(s)${x.convenio ? ` · convênio até ${fmtDate(x.convenio.fim)}` : " · SEM convênio"}` })), full: true },
    { key: "orientadorUserId", label: "Professor orientador", type: "select", required: true, options: eq.opts },
    { key: "tipo", label: "Tipo", type: "select", required: true, options: [{ value: "OBRIGATORIO", label: "Obrigatório" }, { value: "NAO_OBRIGATORIO", label: "Não obrigatório" }] },
    { key: "inicio", label: "Início", type: "date", required: true }, { key: "fim", label: "Fim", type: "date", required: true },
    { key: "cargaHorariaTotal", label: "Carga horária total (h)", type: "number", required: true },
    { key: "horasSemana", label: "Horas por semana (máx. 30)", type: "number", required: true },
    { key: "supervisorCampoNome", label: "Supervisor de campo (se diferente do cadastro)" },
  ];
  return (
    <FormDialog open title="Novo estágio" fields={campos} initial={{ tipo: "OBRIGATORIO", horasSemana: 20 }} submitLabel="Cadastrar" onClose={onClose}
      intro={<Aviso>O sistema confere convênio vigente, vaga disponível, matrícula no curso, jornada (Lei 11.788/2008) e sobreposição de estágios.</Aviso>}
      onSubmit={async (b) => { await cp("POST", "/estagios", b); onDone(); }} />
  );
}

function Detalhe({ id, onClose }: { id: string; onClose: () => void }) {
  const [rev, setRev] = useState(0);
  const d = useCp<any>(`/estagios/${id}`, [rev]);
  const { toast, node } = useToast();
  const reload = () => setRev((x) => x + 1);
  const run = useRunner(toast, reload);
  const [dlg, setDlg] = useState<null | { tipo: string; ref?: any }>(null);
  const e = d.data;
  const papel = e?.papel as string | undefined;
  const valida = papel === "ORIENTADOR" || papel === "GESTAO";
  const podeAtivar = valida || papel === "SECRETARIA";
  const ativo = e?.status === "EM_ANDAMENTO";
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>{e ? `Estágio de ${e.aluno?.nomeCompleto ?? "aluno"} — ${e.curso}` : "Estágio"}</DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={d.loading} error={d.error} onRetry={d.reload}>
          {e && (
            <>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2, alignItems: "center" }}>
                <Status value={e.status} />
                {e.resultado && <Etiqueta t={`${e.resultado === "APROVADO" ? "Aprovado" : "Reprovado"} · nota ${e.notaFinal?.toFixed(1)}`} color={e.resultado === "APROVADO" ? "success" : "error"} />}
                <Typography variant="body2">{e.campo} · {e.concedente}</Typography>
                <Typography variant="body2" color="text.secondary">{fmtDate(e.inicio)} a {fmtDate(e.fim)} · {e.horasSemana} h/sem · supervisor de campo: {e.supervisorCampoNome ?? "—"} · orientador: {e.orientador}</Typography>
              </Box>
              <Progresso valor={e.progresso} texto={`${e.resumoHoras.validadas} h validadas de ${e.cargaHorariaTotal} h (${e.resumoHoras.pendentes} h aguardando validação)`} />
              <Acoes>
                {e.status === "AGUARDANDO_DOCUMENTOS" && podeAtivar && <Btn variant="contained" onClick={() => run(() => cp("POST", `/estagios/${id}/ativar`), "Estágio iniciado.")}>Iniciar estágio</Btn>}
                {ativo && valida && <Btn variant="contained" color="success" onClick={() => run(() => cp("POST", `/estagios/${id}/encerrar`), "Estágio encerrado.", "Encerrar o estágio e calcular a nota final?")}>Encerrar estágio</Btn>}
                {["AGUARDANDO_DOCUMENTOS", "EM_ANDAMENTO"].includes(e.status) && (papel === "GESTAO" || papel === "SECRETARIA") && <Btn color="error" onClick={() => setDlg({ tipo: "cancelar" })}>Cancelar estágio</Btn>}
              </Acoes>
              {e.pendencias.length > 0 && e.status === "AGUARDANDO_DOCUMENTOS" && <Aviso severity="warning">Pendências para iniciar: {e.pendencias.map((p: string) => p.replace(/_/g, " ").toLowerCase()).join(", ")}.</Aviso>}

              <Typography variant="subtitle1" sx={{ fontWeight: 800, mt: 1 }}>Checklist documental</Typography>
              <DataList rows={e.documentos} columns={[
                { label: "Documento", primary: true, render: (x: any) => x.tipo.replace(/_/g, " ").toLowerCase() },
                { label: "Situação", render: (x: any) => <Status value={x.status} /> },
                { label: "Validade", render: (x: any) => (x.validade ? fmtDate(x.validade) : "—") },
                { label: "Obs.", render: (x: any) => x.motivo ?? (x.url ? <a href={x.url} target="_blank" rel="noreferrer">abrir arquivo</a> : "—"), hideOnMobile: true },
              ]} actions={(x: any) => (
                <ActionsMenu items={[
                  { label: "Enviar / reenviar", onClick: () => setDlg({ tipo: "doc", ref: x }), show: x.tipo !== "CONVENIO" && e.status !== "ENCERRADO" && x.tipo !== "PLANO_ATIVIDADES" },
                  { label: "Editar plano de atividades", onClick: () => setDlg({ tipo: "plano" }), show: x.tipo === "PLANO_ATIVIDADES" && e.status !== "ENCERRADO" },
                  { label: "Validar", onClick: () => run(() => cp("POST", `/estagios/${id}/documentos/${x.id}/validar`, { aprovar: true }), "Documento validado."), show: valida && x.status === "ENTREGUE" || papel === "SECRETARIA" && x.status === "ENTREGUE" },
                  { label: "Rejeitar", onClick: () => setDlg({ tipo: "rejeitar", ref: x }), show: (valida || papel === "SECRETARIA") && x.status === "ENTREGUE" },
                ]} />
              )} />
              {e.planoAtividades && <Typography variant="body2" sx={{ mt: 1, p: 1.5, bgcolor: "action.hover", borderRadius: 2 }}><b>Plano de atividades:</b> {e.planoAtividades}</Typography>}

              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>Horas realizadas</Typography>
                {ativo && papel !== "SECRETARIA" && <Button size="small" variant="outlined" onClick={() => setDlg({ tipo: "hora" })}>Lançar horas</Button>}
                {ativo && valida && e.resumoHoras.pendentes > 0 && <Btn onClick={() => run(() => cp("POST", `/estagios/${id}/horas/validar-lote`, {}), "Horas validadas.", "Validar todas as horas pendentes?")}>Validar todas</Btn>}
              </Box>
              <LoadBox empty={!e.horas.length} emptyText="Nenhuma hora lançada.">
                <DataList rows={e.horas.slice(0, 40)} columns={[
                  { label: "Data", primary: true, render: (x: any) => fmtDate(x.data) }, { label: "Horas", render: (x: any) => `${x.horas} h` },
                  { label: "Atividade", render: (x: any) => x.atividade, hideOnMobile: true }, { label: "Situação", render: (x: any) => <Status value={x.status} /> },
                ]} actions={(x: any) => x.status === "PENDENTE" && valida ? (
                  <ActionsMenu items={[{ label: "Aprovar", onClick: () => run(() => cp("POST", `/estagios/horas/${x.id}/validar`, { aprovar: true }), "Hora validada.") }, { label: "Rejeitar", onClick: () => setDlg({ tipo: "rejeitarHora", ref: x }), color: "error" }]} />
                ) : null} />
              </LoadBox>

              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>Relatórios</Typography>
                {ativo && papel === "ALUNO" && <Button size="small" variant="outlined" onClick={() => setDlg({ tipo: "relatorio" })}>Novo relatório</Button>}
              </Box>
              <LoadBox empty={!e.relatorios.length} emptyText="Nenhum relatório.">
                <DataList rows={e.relatorios} columns={[
                  { label: "Tipo", primary: true, render: (x: any) => (x.tipo === "FINAL" ? "Final" : "Parcial") }, { label: "Situação", render: (x: any) => <Status value={x.status} /> },
                  { label: "Parecer", render: (x: any) => x.parecer ?? "—", hideOnMobile: true }, { label: "Entrega", render: (x: any) => fmtDate(x.entregueEm) },
                ]} actions={(x: any) => (
                  <ActionsMenu items={[
                    { label: "Entregar ao orientador", onClick: () => run(() => cp("POST", `/estagios/relatorios/${x.id}/entregar`), "Relatório entregue."), show: papel === "ALUNO" && ["RASCUNHO", "DEVOLVIDO"].includes(x.status) },
                    { label: "Aprovar", onClick: () => run(() => cp("POST", `/estagios/relatorios/${x.id}/avaliar`, { aprovar: true }), "Relatório aprovado."), show: valida && x.status === "ENTREGUE" },
                    { label: "Devolver com parecer", onClick: () => setDlg({ tipo: "devolver", ref: x }), show: valida && x.status === "ENTREGUE" },
                  ]} />
                )} />
              </LoadBox>

              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>Avaliações</Typography>
                {ativo && valida && <><Button size="small" variant="outlined" onClick={() => setDlg({ tipo: "avaliacao", ref: "ORIENTADOR" })}>Avaliação do orientador</Button><Button size="small" variant="outlined" onClick={() => setDlg({ tipo: "avaliacao", ref: "SUPERVISOR_CAMPO" })}>Avaliação do supervisor de campo</Button></>}
                {ativo && papel === "ALUNO" && <Button size="small" variant="outlined" onClick={() => setDlg({ tipo: "avaliacao", ref: "AUTOAVALIACAO" })}>Autoavaliação</Button>}
              </Box>
              <LoadBox empty={!e.avaliacoes.length} emptyText="Nenhuma avaliação registrada.">
                <DataList rows={e.avaliacoes} columns={[{ label: "Avaliador", primary: true, render: (x: any) => x.avaliador.replace(/_/g, " ").toLowerCase() }, { label: "Nota", render: (x: any) => x.nota.toFixed(1) }, { label: "Parecer", render: (x: any) => x.parecer ?? "—", hideOnMobile: true }]} />
              </LoadBox>
            </>
          )}
        </LoadBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>

      {dlg?.tipo === "doc" && <FormDialog open title={`Enviar ${dlg.ref.tipo.replace(/_/g, " ").toLowerCase()}`} submitLabel="Enviar" onClose={() => setDlg(null)}
        fields={[{ key: "url", label: "Link do arquivo (https)", required: true, full: true }, { key: "numero", label: "Número / apólice", hidden: () => dlg.ref.tipo !== "SEGURO" }, { key: "validade", label: "Validade", type: "date", required: dlg.ref.tipo === "SEGURO", hidden: () => dlg.ref.tipo !== "SEGURO" }]}
        onSubmit={async (b) => { await cp("PUT", `/estagios/${id}/documentos/${dlg.ref.tipo}`, b); reload(); }} />}
      {dlg?.tipo === "plano" && <FormDialog open title="Plano de atividades" fields={[{ key: "planoAtividades", label: "Descreva as atividades, metas e supervisão", type: "textarea", required: true }]} initial={{ planoAtividades: e?.planoAtividades ?? "" }} onClose={() => setDlg(null)} onSubmit={async (b) => { await cp("PATCH", `/estagios/${id}/plano`, b); reload(); }} />}
      {dlg?.tipo === "rejeitar" && <FormDialog open title="Rejeitar documento" fields={[{ key: "motivo", label: "Motivo", type: "textarea", required: true }]} onClose={() => setDlg(null)} onSubmit={async (b) => { await cp("POST", `/estagios/${id}/documentos/${dlg.ref.id}/validar`, { aprovar: false, motivo: b.motivo }); reload(); }} />}
      {dlg?.tipo === "hora" && <FormDialog open title="Lançar horas" fields={[{ key: "data", label: "Data", type: "date", required: true }, { key: "horas", label: "Horas (máx. 6 por dia)", type: "number", required: true }, { key: "atividade", label: "Atividade realizada", type: "textarea", required: true }]} onClose={() => setDlg(null)} onSubmit={async (b) => { await cp("POST", `/estagios/${id}/horas`, b); reload(); }} />}
      {dlg?.tipo === "rejeitarHora" && <FormDialog open title="Rejeitar lançamento" fields={[{ key: "motivo", label: "Motivo", type: "textarea", required: true }]} onClose={() => setDlg(null)} onSubmit={async (b) => { await cp("POST", `/estagios/horas/${dlg.ref.id}/validar`, { aprovar: false, motivo: b.motivo }); reload(); }} />}
      {dlg?.tipo === "relatorio" && <FormDialog open title="Novo relatório" maxWidth="md" fields={[{ key: "tipo", label: "Tipo", type: "select", required: true, options: [{ value: "PARCIAL", label: "Parcial" }, { value: "FINAL", label: "Final (exige 90% das horas validadas)" }] }, { key: "texto", label: "Texto do relatório", type: "textarea", required: true }, { key: "entregar", label: "Entregar agora ao orientador", type: "bool" }]} onClose={() => setDlg(null)} onSubmit={async (b) => { await cp("POST", `/estagios/${id}/relatorios`, b); reload(); }} />}
      {dlg?.tipo === "devolver" && <FormDialog open title="Devolver relatório" fields={[{ key: "parecer", label: "O que precisa ser ajustado", type: "textarea", required: true }]} onClose={() => setDlg(null)} onSubmit={async (b) => { await cp("POST", `/estagios/relatorios/${dlg.ref.id}/avaliar`, { aprovar: false, parecer: b.parecer }); reload(); }} />}
      {dlg?.tipo === "cancelar" && <FormDialog open title="Cancelar estágio" fields={[{ key: "motivo", label: "Motivo", type: "textarea", required: true }]} onClose={() => setDlg(null)} onSubmit={async (b) => { await cp("POST", `/estagios/${id}/cancelar`, b); reload(); }} />}
      {dlg?.tipo === "avaliacao" && <FormDialog open title={`Avaliação — ${String(dlg.ref).replace(/_/g, " ").toLowerCase()}`} submitLabel="Registrar"
        fields={[...["assiduidade", "iniciativa", "tecnica", "etica"].map((k) => ({ key: k, label: `${k === "tecnica" ? "Domínio técnico" : k === "etica" ? "Postura ética" : k === "iniciativa" ? "Iniciativa" : "Assiduidade"} (0 a 10)`, type: "number" as const, required: true })), { key: "parecer", label: "Parecer", type: "textarea" as const }]}
        onClose={() => setDlg(null)} onSubmit={async (b) => { const { parecer, ...criterios } = b; await cp("POST", `/estagios/${id}/avaliacoes`, { avaliador: dlg.ref, criterios, parecer }); reload(); }} />}
    </Dialog>
  );
}

function PainelCurso() {
  const p = useCp<any>("/estagios/painel");
  const d = p.data;
  return (
    <Section title="Painel por curso">
      <LoadBox loading={p.loading} error={p.error} onRetry={p.reload} empty={!d?.cursos?.length} emptyText="Nenhum estágio ou vaga cadastrados.">
        {d && <DataList rows={d.cursos.map((c: any) => ({ ...c, id: c.programId }))} columns={[
          { label: "Curso", primary: true, render: (c: any) => c.curso }, { label: "Vagas", render: (c: any) => `${c.ocupadas}/${c.vagas}` },
          { label: "Aguardando docs", render: (c: any) => c.aguardandoDocumentos }, { label: "Em andamento", render: (c: any) => c.emAndamento }, { label: "Encerrados", render: (c: any) => `${c.encerrados} (${c.aprovados} aprov.)` },
          { label: "Horas validadas", render: (c: any) => `${c.horasValidadas} h` }, { label: "Horas a validar", render: (c: any) => c.horasPendentes },
          { label: "Progresso", render: (c: any) => (c.progressoHoras === null ? "—" : <Progresso valor={c.progressoHoras} />) },
        ]} />}
      </LoadBox>
    </Section>
  );
}

function Alertas() {
  const a = useCp<any>("/estagios/alertas");
  const items = itemsOf(a.data);
  return (
    <Section title="Alertas de vencimento e horas pendentes">
      <LoadBox loading={a.loading} error={a.error} onRetry={a.reload} empty={!items.length} emptyText="Nenhum alerta.">
        <DataList rows={items.map((x: any, i: number) => ({ ...x, id: String(i) }))} columns={[
          { label: "Gravidade", render: (x: any) => <Etiqueta t={x.severidade === "CRITICO" ? "Crítico" : x.severidade === "ATENCAO" ? "Atenção" : "Aviso"} color={corSeveridade(x.severidade)} /> },
          { label: "Alerta", primary: true, render: (x: any) => x.titulo }, { label: "Vencimento", render: (x: any) => (x.vencimento ? fmtDate(x.vencimento) : "—") },
        ]} />
      </LoadBox>
      <Typography variant="caption" color="text.secondary">Os alertas viram lembretes automáticos para a coordenação e para os orientadores (rotina diária).</Typography>
    </Section>
  );
}
void errMsg; void dataIso;
