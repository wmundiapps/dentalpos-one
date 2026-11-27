import { Alert, Box, Button, Chip, Table, TableBody, TableCell, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useState } from "react";
import EduResourcePage, { StatusChip } from "../EduResourcePage";
import { Bar, COLORS, FormDialog, Kpi, KpiRow, LoadBox, Pick, Section, Status, call, fmtDate, fmtMoney, fmtNum, itemsOf, useApi, useRunner, useToast } from "../desempenho/kit";

const TIPOS = ["INSTITUCIONAL", "PROUNI", "FIES", "MERITO", "SOCIOECONOMICA", "MONITORIA", "ESPORTE", "CULTURA", "PERMANENCIA", "OUTRO"];

function Resumo({ rev }: { rev: number }) {
  const r = useApi<any>("/apoio/bolsas/resumo", [rev]);
  return (
    <Section title="Vagas por programa">
      <LoadBox loading={r.loading} error={r.error} empty={!(r.data?.programas || []).length} emptyText="Nenhum programa de bolsa cadastrado." onRetry={r.reload}>
        <KpiRow>{Object.entries(r.data?.concessoesPorStatus || {}).map(([k, v]) => <Kpi key={k} title={k.replace(/_/g, " ")} value={String(v)} color={k === "ATIVA" ? COLORS.ok : k === "RENOVACAO_PENDENTE" ? COLORS.warn : undefined} />)}</KpiRow>
        {(r.data?.programas || []).map((p: any) => <Bar key={p.id} label={p.nome} value={p.ocupadas} max={p.vagas || Math.max(p.ocupadas, 1)} color={p.livres === 0 ? COLORS.bad : COLORS.ok} right={p.vagas > 0 ? `${p.ocupadas}/${p.vagas} vagas (${p.livres} livres)` : `${p.ocupadas} concessões (sem limite)`} />)}
      </LoadBox>
    </Section>
  );
}

function Inscricoes({ programas }: { programas: Array<{ value: string; label: string }> }) {
  const [rev, setRev] = useState(0);
  const [prog, setProg] = useState("");
  const [status, setStatus] = useState("");
  const [dec, setDec] = useState<any | null>(null);
  const [cls, setCls] = useState<any | null>(null);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const l = useApi<any>(`/apoio/bolsas/inscricoes?pageSize=100${prog ? `&programaId=${prog}` : ""}${status ? `&status=${status}` : ""}`, [rev]);
  const rows = itemsOf(l.data);
  return (
    <Section title="Inscrições e análise socioeconômica" actions={<>
      <Pick label="Programa" value={prog} all="Todos" onChange={setProg} options={programas} minWidth={220} />
      <Pick label="Status" value={status} all="Todos" onChange={setStatus} minWidth={150} options={["INSCRITA", "EM_ANALISE", "DEFERIDA", "INDEFERIDA", "LISTA_ESPERA", "CANCELADA"].map((s) => ({ value: s, label: s.replace(/_/g, " ") }))} />
      <Button variant="outlined" disabled={!prog} onClick={async () => { try { setCls(await call("POST", `/apoio/bolsas/programas/${prog}/classificar`, { aplicar: false })); } catch (e: any) { toast({ type: "error", text: e.message }); } }}>Simular classificação</Button>
    </>}>
      {node}
      {cls && (
        <Alert severity="info" sx={{ mb: 2 }} action={<Button size="small" color="inherit" onClick={() => run(async () => { await call("POST", `/apoio/bolsas/programas/${prog}/classificar`, { aplicar: true }); setCls(null); }, "Classificação aplicada: concessões criadas e alunos notificados.", "Aplicar a classificação? Os candidatos deferidos receberão a bolsa.")}>Aplicar</Button>}>
          Vagas livres: {cls.vagasLivres} · Deferidas: {(cls.deferidas || []).length} · Lista de espera: {(cls.listaEspera || []).length}. É uma simulação; nada foi gravado.
        </Alert>
      )}
      <LoadBox loading={l.loading} error={l.error} empty={!rows.length} emptyText="Nenhuma inscrição." onRetry={l.reload}>
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Aluno</TableCell><TableCell>Programa</TableCell><TableCell>Renda per capita</TableCell><TableCell>Pontuação</TableCell><TableCell>Critérios</TableCell><TableCell>Status</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>
              {rows.map((i) => (
                <TableRow key={i.id} hover>
                  <TableCell>{i.aluno?.nome ?? i.studentId}</TableCell><TableCell>{programas.find((p) => p.value === i.programaId)?.label ?? "—"}</TableCell><TableCell>{fmtMoney(i.rendaPerCapita)}</TableCell><TableCell>{fmtNum(i.pontuacao)}</TableCell>
                  <TableCell>{i.elegivel ? <Chip size="small" color="success" label="elegível" /> : <Chip size="small" color="error" label={Array.isArray(i.pendencias) && i.pendencias.length ? String(i.pendencias[0]) : "inelegível"} />}</TableCell>
                  <TableCell><Status value={i.status} /></TableCell>
                  <TableCell align="right">{!["DEFERIDA", "CANCELADA"].includes(i.status) && <Button size="small" onClick={() => setDec(i)}>Decidir</Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </LoadBox>
      <FormDialog open={!!dec} onClose={() => setDec(null)} maxWidth="sm" title={`Decidir inscrição — ${dec?.aluno?.nome ?? ""}`} submitLabel="Registrar decisão" initial={{ decisao: "DEFERIDA" }}
        intro={dec && !dec.elegivel ? <Alert severity="warning" sx={{ mb: 2 }}>Inscrição inelegível pelos critérios: o deferimento exige “forçar” com parecer justificado.</Alert> : undefined}
        fields={[{ key: "decisao", label: "Decisão", type: "select", options: ["DEFERIDA", "INDEFERIDA", "LISTA_ESPERA", "EM_ANALISE"], required: true }, { key: "parecer", label: "Parecer", type: "textarea", required: true }, { key: "forcar", label: "Forçar (ignorar elegibilidade/vagas)", type: "bool" }]}
        onSubmit={async (b) => { await call("POST", `/apoio/bolsas/inscricoes/${dec.id}/decidir`, b); toast({ type: "success", text: "Decisão registrada; aluno notificado." }); setRev((x) => x + 1); }} />
    </Section>
  );
}

function Concessoes() {
  const [rev, setRev] = useState(0);
  const [venc, setVenc] = useState("");
  const [enc, setEnc] = useState<any | null>(null);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const l = useApi<any>(`/apoio/bolsas/concessoes?pageSize=100${venc ? `&vencendoEmDias=${venc}` : ""}`, [rev]);
  const rows = itemsOf(l.data);
  return (
    <Section title="Bolsas concedidas e renovações" actions={<Pick label="Vencimento" value={venc} all="Todas" minWidth={170} onChange={setVenc} options={[{ value: "30", label: "Vencem em 30 dias" }, { value: "60", label: "Vencem em 60 dias" }, { value: "90", label: "Vencem em 90 dias" }]} />}>
      {node}
      <LoadBox loading={l.loading} error={l.error} empty={!rows.length} emptyText="Nenhuma concessão." onRetry={l.reload}>
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Aluno</TableCell><TableCell>Percentual / valor</TableCell><TableCell>Vigência</TableCell><TableCell>Status</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>
              {rows.map((c) => {
                const dias = Math.ceil((new Date(c.fim).getTime() - Date.now()) / 86_400_000);
                return (
                  <TableRow key={c.id} hover>
                    <TableCell>{c.aluno?.nome ?? c.studentId}</TableCell><TableCell>{c.percentual ? `${c.percentual}%` : ""} {c.valorMensal ? fmtMoney(c.valorMensal) : ""}</TableCell>
                    <TableCell>{fmtDate(c.inicio)} → {fmtDate(c.fim)} {["ATIVA", "RENOVACAO_PENDENTE"].includes(c.status) && <Chip size="small" sx={{ ml: 1 }} color={dias <= 30 ? "error" : dias <= 60 ? "warning" : "default"} label={dias >= 0 ? `${dias} dia(s)` : "vencida"} />}</TableCell>
                    <TableCell><Status value={c.status} /></TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      {["ATIVA", "RENOVACAO_PENDENTE"].includes(c.status) && <Button size="small" color="success" onClick={() => run(() => call("POST", `/apoio/bolsas/concessoes/${c.id}/renovar`, {}), "Renovação processada.", "Renovar esta bolsa? Os critérios (média/frequência) são verificados.")}>Renovar</Button>}
                      {["ATIVA", "RENOVACAO_PENDENTE"].includes(c.status) && <Button size="small" color="error" onClick={() => setEnc(c)}>Encerrar</Button>}
                      {["ENCERRADA", "SUSPENSA"].includes(c.status) && <Button size="small" onClick={() => run(() => call("POST", `/apoio/bolsas/concessoes/${c.id}/reativar`), "Bolsa reativada.", "Reativar esta bolsa?")}>Reativar</Button>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      </LoadBox>
      <FormDialog open={!!enc} onClose={() => setEnc(null)} maxWidth="sm" title="Encerrar / suspender bolsa" fields={[{ key: "motivo", label: "Motivo", type: "textarea", required: true }, { key: "suspender", label: "Apenas suspender (não encerrar)", type: "bool" }]}
        onSubmit={async (b) => { await call("POST", `/apoio/bolsas/concessoes/${enc.id}/encerrar`, b); setRev((x) => x + 1); }} />
    </Section>
  );
}

export default function BolsasTab() {
  const [sub, setSub] = useState("insc");
  const progs = useApi<any>("/apoio/bolsas/programas?pageSize=100");
  const programas = itemsOf(progs.data).map((p) => ({ value: p.id, label: p.nome }));
  return (
    <Box>
      <ToggleButtonGroup size="small" exclusive value={sub} onChange={(_, v) => v && setSub(v)} sx={{ mb: 2 }}>
        <ToggleButton value="insc">Inscrições</ToggleButton><ToggleButton value="conc">Concessões e renovações</ToggleButton><ToggleButton value="prog">Programas</ToggleButton><ToggleButton value="vagas">Vagas</ToggleButton>
      </ToggleButtonGroup>
      {sub === "insc" && <Inscricoes programas={programas} />}
      {sub === "conc" && <Concessoes />}
      {sub === "vagas" && <Resumo rev={0} />}
      {sub === "prog" && (
        <EduResourcePage title="Programas de bolsa e auxílio" base="/apoio" resource="/bolsas/programas" filters={[{ key: "tipo", label: "Tipo", options: TIPOS }]}
          columns={[{ key: "nome", label: "Programa" }, { key: "tipo", label: "Tipo" }, { key: "percentualDesconto", label: "Desconto (%)" }, { key: "vagas", label: "Vagas" }, { key: "inscricaoFim", label: "Inscrições até", render: (r) => fmtDate(r.inscricaoFim) }, { key: "ativo", label: "Status", render: (r) => <StatusChip value={r.ativo ? "ATIVO" : "INATIVO"} /> }]}
          fields={[
            { key: "nome", label: "Nome", required: true }, { key: "tipo", label: "Tipo", type: "select", options: TIPOS }, { key: "percentualDesconto", label: "Desconto (%)", type: "number" }, { key: "valorMensal", label: "Valor mensal (R$)", type: "number" }, { key: "vagas", label: "Vagas (0 = sem limite)", type: "number" },
            { key: "rendaPerCapitaMaxSM", label: "Renda per capita máx. (salários mínimos)", type: "number" }, { key: "mediaMinima", label: "Média mínima (0-10)", type: "number" }, { key: "frequenciaMinima", label: "Frequência mínima (%)", type: "number" },
            { key: "inscricaoInicio", label: "Início das inscrições", type: "date" }, { key: "inscricaoFim", label: "Fim das inscrições", type: "date" }, { key: "vigenciaMeses", label: "Vigência (meses)", type: "number" }, { key: "renovacaoAntecedenciaDias", label: "Aviso de renovação (dias)", type: "number" },
            { key: "descricao", label: "Descrição", type: "textarea" }, { key: "renovavel", label: "Renovável", type: "bool" }, { key: "ativo", label: "Ativo", type: "bool" },
          ]} />
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>Critérios por programa: renda per capita, média, frequência e vigência com alertas de renovação.</Typography>
    </Box>
  );
}
