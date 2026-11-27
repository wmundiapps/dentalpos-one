import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Pagination, Paper, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloudSyncIcon from "@mui/icons-material/CloudSync";
import MarkEmailUnreadIcon from "@mui/icons-material/MarkEmailUnread";
import RuleIcon from "@mui/icons-material/Rule";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { eduApi, qsOf } from "../../services/EduApi";
import { Async, Cartao, Empty, Panel, Stat, StatGrid, Sub, brl, comReauth, erroCompleto, fmtDate, fmtDateTime, label, useApi, useContas, useMotivo, useToast } from "./tes";
import { AvisoInterno, BOL, Motivos, OrigemChip, ResultadoChip, StatusChip, baixarAnexo, fmtDoc, fmtLinha, hojeISO, lerArquivoBase64 } from "./boletosKit";
import BoletosLotes from "./BoletosLotes";
import BoletosRecorrentes from "./BoletosRecorrentes";
import BoletosConfig from "./BoletosConfig";

const SUBS = ["caixa", "emails", "lotes", "recorrentes", "config"] as const;
type Sub_ = (typeof SUBS)[number];

/** Caixa de boletos (DDA e e-mail dedicado): recebe, confere a autenticidade, autoriza ou refuta; lotes do dia e contas recorrentes. */
export default function BoletosTab() {
  const [params, setParams] = useSearchParams();
  const sub = (SUBS.includes(params.get("sub") as Sub_) ? params.get("sub") : "caixa") as Sub_;
  const irSub = (s: string) => { const p = new URLSearchParams(params); p.set("sub", s); p.delete("boleto"); setParams(p); };
  const [key, setKey] = useState(0);
  const painel = useApi<any>(`${BOL}/painel?_=${key}`);
  const reload = () => setKey((k) => k + 1);
  const toast = useToast();
  const [simular, setSimular] = useState(false);
  const [manual, setManual] = useState(false);

  async function sincronizar() {
    await toast.run(() => eduApi.post(`${BOL}/dda/sincronizar`, {}), "", (r) => {
      toast.ok(`DDA ${r.simulado ? "(simulado) " : ""}sincronizado: ${r.novos} novo(s), ${r.jaExistiam} já existente(s).`);
      reload();
    });
  }

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <AvisoInterno />
      <Async state={painel}>
        {(p) => (
          <>
            <StatGrid min={150}>
              <Stat label="Recebidos hoje" value={p.recebidosHoje} />
              <Stat label="Aguardando" value={p.aguardando} hint={brl(p.valorAguardando)} tone={p.aguardando ? "warning" : "success"} />
              <Stat label="Suspeitos" value={p.suspeitos} tone={p.suspeitos ? "error" : "success"} />
              <Stat label="Duplicados" value={p.duplicados} tone={p.duplicados ? "error" : "success"} />
              <Stat label="Recorrentes pendentes" value={p.recorrentesPendentes} tone={p.recorrentesPendentes ? "error" : "success"} hint="conta esperada e não lançada" />
              <Stat label="Lotes p/ aprovar" value={p.lotesAguardandoAprovacao} tone={p.lotesAguardandoAprovacao ? "warning" : "default"} />
            </StatGrid>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
              <Button variant="contained" startIcon={<CloudSyncIcon />} onClick={sincronizar} disabled={!p.dda.ativo} title={p.dda.ativo ? "" : "Ative o DDA em Configurações"}>Sincronizar DDA</Button>
              <Button variant="outlined" startIcon={<MarkEmailUnreadIcon />} onClick={() => setSimular(true)}>Simular recebimento de e-mail</Button>
              <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setManual(true)}>Lançar boleto</Button>
              <Box sx={{ flex: 1 }} />
              <Typography variant="caption" color="text.secondary" sx={{ textAlign: "right" }}>
                DDA: {p.dda.ativo ? `${p.dda.simulado ? "simulado" : p.dda.provedor}${p.dda.ultimaSincronizacao ? ` · última sincronização ${fmtDateTime(p.dda.ultimaSincronizacao)}` : " · ainda não sincronizado"}` : "desativado"}
                <br />E-mail dedicado: {p.email.ativo ? p.email.endereco : "desativado"}
              </Typography>
            </Box>
            {p.dda.simulado && <Alert severity="info" sx={{ py: 0 }}>O DDA está em modo <b>simulado</b> (boletos fictícios para demonstração). A integração real depende de contrato com o banco/CIP e credenciais da instituição.</Alert>}
          </>
        )}
      </Async>
      <Paper variant="outlined" sx={{ borderRadius: 3 }}>
        <Tabs value={SUBS.indexOf(sub)} onChange={(_, v) => irSub(SUBS[v])} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
          <Tab label="Caixa" sx={{ textTransform: "none", fontWeight: 700 }} />
          <Tab label="E-mails recebidos" sx={{ textTransform: "none", fontWeight: 700 }} />
          <Tab label="Lote do dia e aprovação" sx={{ textTransform: "none", fontWeight: 700 }} />
          <Tab label="Contas recorrentes" sx={{ textTransform: "none", fontWeight: 700 }} />
          <Tab label="Configurar" sx={{ textTransform: "none", fontWeight: 700 }} />
        </Tabs>
      </Paper>
      {sub === "caixa" && <Caixa key={`c${key}`} onChanged={reload} />}
      {sub === "emails" && <Emails key={`e${key}`} />}
      {sub === "lotes" && <BoletosLotes onChanged={reload} />}
      {sub === "recorrentes" && <BoletosRecorrentes onChanged={reload} />}
      {sub === "config" && <BoletosConfig onChanged={reload} />}
      <SimularEmail open={simular} onClose={() => setSimular(false)} onDone={() => { reload(); irSub("caixa"); }} />
      <LancarManual open={manual} onClose={() => setManual(false)} onDone={() => { reload(); irSub("caixa"); }} />
      {toast.node}
    </Box>
  );
}

// ---------------------------------------------------------------- Caixa
const RES = ["OK", "ATENCAO", "SUSPEITO", "DUPLICADO"];

function Caixa({ onChanged }: { onChanged: () => void }) {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState("ABERTOS");
  const [resultado, setResultado] = useState<string[]>([]);
  const [origem, setOrigem] = useState("");
  const [q, setQ] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [page, setPage] = useState(1);
  const [k, setK] = useState(0);
  const st = useApi<any>(`${BOL}/boletos${qsOf({ status, resultado: resultado.join(","), origem, q, de, ate, page, pageSize: 12, _: k })}`);
  const [det, setDet] = useState<string | null>(params.get("boleto"));
  const [acao, setAcao] = useState<{ tipo: "autorizar" | "conferir"; b: any } | null>(null);
  const motivo = useMotivo();
  const toast = useToast();
  const reload = () => { setK((x) => x + 1); onChanged(); };
  useEffect(() => { setPage(1); }, [status, resultado, origem, q, de, ate]);

  async function refutar(b: any) {
    const m = await motivo.ask(`Refutar ${b.numero} (motivo obrigatório, fica na auditoria)`);
    if (!m) return;
    try { await eduApi.post(`${BOL}/boletos/${b.id}/refutar`, { motivo: m }); toast.ok(`${b.numero} refutado e bloqueado.`); reload(); } catch (e: any) { toast.err(erroCompleto(e)); }
  }
  const abrir = (id: string | null) => { setDet(id); const p = new URLSearchParams(params); if (id) p.set("boleto", id); else p.delete("boleto"); setParams(p, { replace: true }); };

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <TextField size="small" label="Buscar" placeholder="número, fornecedor, documento" value={q} onChange={(e) => setQ(e.target.value)} sx={{ minWidth: 220 }} />
        <TextField select size="small" label="Situação" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 150 }}>
          <MenuItem value="ABERTOS">Em aberto</MenuItem><MenuItem value="RECEBIDO,A_CONFERIR,EM_APROVACAO,AUTORIZADO,REFUTADO">Todas</MenuItem>
          <MenuItem value="AUTORIZADO">Autorizados</MenuItem><MenuItem value="REFUTADO">Refutados</MenuItem><MenuItem value="A_CONFERIR">A conferir</MenuItem>
        </TextField>
        <TextField select size="small" label="Origem" value={origem} onChange={(e) => setOrigem(e.target.value)} sx={{ minWidth: 120 }}>
          <MenuItem value="">Todas</MenuItem><MenuItem value="DDA">DDA</MenuItem><MenuItem value="EMAIL">E-mail</MenuItem><MenuItem value="MANUAL">Manual</MenuItem>
        </TextField>
        <TextField size="small" type="date" label="De" value={de} onChange={(e) => setDe(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" type="date" label="Até" value={ate} onChange={(e) => setAte(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
      </Box>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        <Typography variant="caption" color="text.secondary">Check-up:</Typography>
        {RES.map((r) => (
          <Chip key={r} clickable size="small" label={`${r === "ATENCAO" ? "ATENÇÃO" : r}${st.data?.porResultado?.[r] != null ? ` (${st.data.porResultado[r]})` : ""}`} color={resultado.includes(r) ? (r === "OK" ? "success" : r === "ATENCAO" ? "warning" : "error") : "default"} variant={resultado.includes(r) ? "filled" : "outlined"} onClick={() => setResultado(resultado.includes(r) ? resultado.filter((x) => x !== r) : [...resultado, r])} />
        ))}
        {resultado.length > 0 && <Button size="small" onClick={() => setResultado([])}>limpar</Button>}
      </Box>
      <Async state={st}>
        {(d) =>
          d.items.length === 0 ? (
            <Empty text="Nenhum boleto com esses filtros. Use “Sincronizar DDA”, “Simular recebimento de e-mail” ou “Lançar boleto”." />
          ) : (
            <>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 1.5 }}>
                {d.items.map((b: any) => {
                  const aberto = ["RECEBIDO", "A_CONFERIR", "EM_APROVACAO"].includes(b.status);
                  const importantes = (b.motivos || []).filter((m: any) => m.gravidade === "CRITICO" || m.gravidade === "ATENCAO").slice(0, 3);
                  return (
                    <Cartao key={b.id} destaque={b.resultado === "SUSPEITO" || b.resultado === "DUPLICADO" ? "error" : b.resultado === "ATENCAO" ? "warning" : b.resultado === "OK" ? "success" : undefined}>
                      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                        <Typography sx={{ fontWeight: 800 }}>{b.numero}</Typography>
                        <ResultadoChip value={b.resultado} score={b.score} /><StatusChip value={b.status} /><OrigemChip value={b.origem} />
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>{b.beneficiarioNome || "Beneficiário não identificado"}</Typography>
                      <Sub>{fmtDoc(b.beneficiarioDocumento)}{b.numeroDocumento ? ` · doc. ${b.numeroDocumento}` : ""} · recebido {fmtDateTime(b.recebidoEm)}</Sub>
                      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "baseline", mt: 0.5 }}>
                        <Typography variant="h6" sx={{ fontWeight: 800 }}>{brl(b.valor)}</Typography>
                        <Typography variant="body2" color={b.vencimento && new Date(b.vencimento) < new Date() ? "error.main" : "text.secondary"}>vence {fmtDate(b.vencimento)}</Typography>
                      </Box>
                      <Box sx={{ mt: 0.75 }}><Motivos motivos={importantes.length ? importantes : (b.motivos || []).slice(0, 1)} dense /></Box>
                      {b.pendencias > 3 && <Sub>+ {b.pendencias - 3} outro(s) alerta(s) no detalhe</Sub>}
                      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1 }}>
                        <Button size="small" onClick={() => abrir(b.id)}>Check-up e detalhes</Button>
                        {aberto && <Button size="small" variant="contained" color="success" onClick={() => setAcao({ tipo: "autorizar", b })}>Autorizar</Button>}
                        {aberto && b.status !== "EM_APROVACAO" && <Button size="small" variant="outlined" onClick={() => setAcao({ tipo: "conferir", b })}>Conferir</Button>}
                        {aberto && <Button size="small" color="error" onClick={() => refutar(b)}>Refutar</Button>}
                      </Box>
                    </Cartao>
                  );
                })}
              </Box>
              {d.total > d.pageSize && <Pagination count={Math.ceil(d.total / d.pageSize)} page={page} onChange={(_, p) => setPage(p)} sx={{ alignSelf: "center" }} />}
              <Sub>{d.total} boleto(s).</Sub>
            </>
          )
        }
      </Async>
      {det && <DetalheBoleto id={det} onClose={() => abrir(null)} onChanged={reload} onAcao={(tipo, b) => setAcao({ tipo, b })} onRefutar={refutar} />}
      {acao && <DecisaoDialog tipo={acao.tipo} b={acao.b} onClose={() => setAcao(null)} onDone={() => { setAcao(null); reload(); }} />}
      {toast.node}{motivo.node}
    </Box>
  );
}

// ---------------------------------------------------------------- decisão (autorizar / conferir)
function DecisaoDialog({ tipo, b, onClose, onDone }: { tipo: "autorizar" | "conferir"; b: any; onClose: () => void; onDone: () => void }) {
  const { contas } = useContas();
  const [obs, setObs] = useState("");
  const [conta, setConta] = useState("");
  const [risco, setRisco] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  const suspeito = b.resultado === "SUSPEITO";
  async function enviar() {
    setBusy(true); setErr(null);
    try {
      if (tipo === "conferir") { await eduApi.post(`${BOL}/boletos/${b.id}/conferir`, { observacao: obs }); toast.ok("Devolvido para conferência."); }
      else {
        const r = await comReauth((x) => eduApi.post(`${BOL}/boletos/${b.id}/autorizar`, { contaId: conta || undefined, observacao: obs || undefined, confirmarRisco: risco || undefined, ...x }));
        toast.ok(r.aguardandoSegundaAprovacao ? `1ª aprovação registrada (${r.aprovacoesFeitas}/${r.aprovacoesNecessarias}). Falta outro aprovador.` : "Autorizado: título criado em Contas a pagar, pronto para remessa.");
      }
      onDone();
    } catch (e: any) { setErr(erroCompleto(e)); } finally { setBusy(false); }
  }
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800 }}>{tipo === "autorizar" ? `Autorizar ${b.numero}` : `Devolver ${b.numero} para conferência`}</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          <ResultadoChip value={b.resultado} score={b.score} /><Typography variant="body2"><b>{b.beneficiarioNome}</b> · {brl(b.valor)} · vence {fmtDate(b.vencimento)}</Typography>
        </Box>
        <Motivos motivos={(b.motivos || []).filter((m: any) => m.gravidade !== "OK")} dense />
        {tipo === "autorizar" && (
          <>
            <Alert severity="info" sx={{ py: 0 }}>Autorizar cria (ou atualiza) o título em <b>Contas a pagar</b> e o autoriza pelas regras de alçada e segregação de funções da Tesouraria. Quem lançou o boleto não pode autorizá-lo; acima da alçada, é exigida dupla aprovação.</Alert>
            <TextField select size="small" label="Conta pagadora (opcional)" value={conta} onChange={(e) => setConta(e.target.value)} helperText="Vazio: conta padrão de pagamento">
              <MenuItem value="">Padrão</MenuItem>{contas.filter((c) => c.tipo === "BANCO").map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
            </TextField>
            {suspeito && (
              <Alert severity="error" sx={{ py: 0.5 }}>
                Este boleto está <b>SUSPEITO</b>. Só autorize depois de confirmar a cobrança por um canal conhecido (ex.: telefone do cadastro).
                <FormControlLabel control={<Checkbox checked={risco} onChange={(e) => setRisco(e.target.checked)} />} label="Confirmo o risco e a conferência feita fora do sistema" />
              </Alert>
            )}
          </>
        )}
        <TextField multiline minRows={2} size="small" label={tipo === "conferir" ? "Observação (obrigatória)" : suspeito ? "Justificativa (obrigatória, mín. 10 caracteres)" : "Observação (opcional)"} value={obs} onChange={(e) => setObs(e.target.value)} />
        {err && <Alert severity="error">{err}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Voltar</Button>
        <Button variant="contained" color={tipo === "autorizar" ? "success" : "primary"} onClick={enviar} disabled={busy || (tipo === "conferir" && obs.trim().length < 5) || (tipo === "autorizar" && suspeito && (!risco || obs.trim().length < 10))}>
          {busy ? "Enviando…" : tipo === "autorizar" ? "Autorizar" : "Devolver para conferência"}
        </Button>
      </DialogActions>
      {toast.node}
    </Dialog>
  );
}

// ---------------------------------------------------------------- detalhe
function DetalheBoleto({ id, onClose, onChanged, onAcao, onRefutar }: { id: string; onClose: () => void; onChanged: () => void; onAcao: (t: "autorizar" | "conferir", b: any) => void; onRefutar: (b: any) => void }) {
  const [k, setK] = useState(0);
  const st = useApi<any>(`${BOL}/boletos/${id}?_=${k}`);
  const toast = useToast();
  async function reanalisar() {
    await toast.run(() => eduApi.post(`${BOL}/boletos/${id}/reanalisar`, {}), "Check-up refeito.", () => { setK((x) => x + 1); onChanged(); });
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Check-up de autenticidade</DialogTitle>
      <DialogContent dividers>
        <Async state={st}>
          {(b) => {
            const aberto = ["RECEBIDO", "A_CONFERIR", "EM_APROVACAO"].includes(b.status);
            return (
              <Box sx={{ display: "grid", gap: 2 }}>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>{b.numero}</Typography><ResultadoChip value={b.resultado} score={b.score} size="medium" /><StatusChip value={b.status} /><OrigemChip value={b.origem} />
                  {b.lote && <Chip size="small" variant="outlined" label={`Lote ${b.lote.numero}`} />}
                </Box>
                <AvisoInterno />
                <Panel title="Resultado e motivos" subtitle={`Risco ${b.score}/100 · verificado em ${fmtDateTime(b.checkupEm)}`} actions={aberto ? <Button size="small" startIcon={<RuleIcon />} onClick={reanalisar}>Refazer check-up</Button> : undefined}>
                  <Motivos motivos={b.motivos} />
                  {b.duplicadoDe && <Alert severity="error" sx={{ mt: 1 }}>Duplicado do boleto <b>{b.duplicadoDe.numero}</b> ({label(b.duplicadoDe.origem)} · {label(b.duplicadoDe.status)} · {brl(b.duplicadoDe.valor)}).</Alert>}
                  {b.duplicadoTitulo && <Alert severity="error" sx={{ mt: 1 }}>Já existe a conta a pagar <b>{b.duplicadoTitulo.numero}</b> ({label(b.duplicadoTitulo.status)} · {brl(b.duplicadoTitulo.valorBruto)}).</Alert>}
                </Panel>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Dados do boleto</Typography>
                    <Typography variant="body2">Beneficiário: <b>{b.beneficiarioNome || "—"}</b></Typography>
                    <Typography variant="body2">CNPJ/CPF: {fmtDoc(b.beneficiarioDocumento)}</Typography>
                    <Typography variant="body2">Valor: <b>{brl(b.valor)}</b> · Vencimento: {fmtDate(b.vencimento)}</Typography>
                    <Typography variant="body2">Nº do documento: {b.numeroDocumento || "—"} · Banco: {b.banco || "—"}</Typography>
                    <Typography variant="body2" sx={{ wordBreak: "break-all" }}>Linha digitável: {fmtLinha(b.linhaDigitavel) || "não informada"}</Typography>
                    {b.fornecedor && <Typography variant="body2">Fornecedor cadastrado: {b.fornecedor.razaoSocial}</Typography>}
                    {b.notaFiscal && <Typography variant="body2">Nota fiscal: nº {b.notaFiscal.numero} · {brl(b.notaFiscal.valorTotal)} · emitida {fmtDate(b.notaFiscal.emissao)}</Typography>}
                    {b.nfChave && <Typography variant="body2" sx={{ wordBreak: "break-all" }}>Chave NF-e: {b.nfChave}</Typography>}
                    {b.titulo && <Typography variant="body2">Conta a pagar: <b>{b.titulo.numero}</b> ({label(b.titulo.status)}{b.titulo.aprovacoesNecessarias > 1 ? ` · ${b.titulo.aprovacoesFeitas}/${b.titulo.aprovacoesNecessarias} aprovações` : ""})</Typography>}
                    {b.observacao && <Alert severity="info" sx={{ mt: 1, py: 0 }}>Observação: {b.observacao}</Alert>}
                    {b.motivoRefutacao && <Alert severity="error" sx={{ mt: 1, py: 0 }}>Refutado: {b.motivoRefutacao}</Alert>}
                  </Box>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Origem e anexos</Typography>
                    <Typography variant="body2">Recebido em {fmtDateTime(b.recebidoEm)} via {b.origem === "DDA" ? "DDA" : b.origem === "EMAIL" ? "e-mail dedicado" : "lançamento manual"}</Typography>
                    {b.email && <Typography variant="body2">E-mail: {b.email.assunto || "(sem assunto)"} — {b.email.remetente || "remetente não informado"}</Typography>}
                    {b.lancadoPorNome && <Typography variant="body2">Lançado por: {b.lancadoPorNome}</Typography>}
                    {b.decididoPorNome && <Typography variant="body2">Decidido por: {b.decididoPorNome} em {fmtDateTime(b.decididoEm)}</Typography>}
                    {(b.anexos || []).map((a: any) => (
                      <Box key={a.id} sx={{ mt: 0.75 }}>
                        <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>📎 {a.nome} <Sub>{Math.round((a.tamanho || 0) / 1024)} KB · leitura: {label(a.leitura)}</Sub></Typography>
                        {a.leituraNota && <Alert severity="warning" sx={{ py: 0 }}>{a.leituraNota}</Alert>}
                        {a.leitura !== "BLOQUEADO" && <Button size="small" onClick={() => baixarAnexo(a.id, a.nome).catch((e) => toast.err(e.message))}>Baixar</Button>}
                      </Box>
                    ))}
                    {!b.anexos?.length && <Sub>Sem anexos.</Sub>}
                  </Box>
                </Box>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>Trilha de auditoria</Typography>
                  {b.eventos.map((e: any) => (
                    <Box key={e.id} sx={{ display: "flex", gap: 1, flexWrap: "wrap", py: 0.3, borderBottom: 1, borderColor: "divider" }}>
                      <Typography variant="caption" sx={{ minWidth: 118 }}>{fmtDateTime(e.createdAt)}</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 700, minWidth: 150 }}>{label(e.acao)}</Typography>
                      <Typography variant="caption" color="text.secondary">{e.userNome || "sistema"}{e.papel ? ` (${e.papel})` : ""}{e.de && e.para ? ` · ${e.de} → ${e.para}` : e.para ? ` · ${e.para}` : ""}</Typography>
                    </Box>
                  ))}
                </Box>
                {aberto && (
                  <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                    <Button variant="contained" color="success" onClick={() => onAcao("autorizar", b)}>Autorizar</Button>
                    {b.status !== "EM_APROVACAO" && <Button variant="outlined" onClick={() => onAcao("conferir", b)}>Conferir (devolver com observação)</Button>}
                    <Button color="error" onClick={() => onRefutar(b)}>Refutar</Button>
                  </Stack>
                )}
              </Box>
            );
          }}
        </Async>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      {toast.node}
    </Dialog>
  );
}

// ---------------------------------------------------------------- e-mails recebidos
function Emails() {
  const st = useApi<any>(`${BOL}/emails?pageSize=30`);
  return (
    <Panel title="E-mails recebidos na caixa dedicada" subtitle="Cada e-mail é lido (texto, PDF com texto embutido e XML de NF-e) e vira boleto na caixa, sem autorizar pagamento.">
      <Alert severity="warning" sx={{ mb: 2, py: 0 }}>Este sistema <b>não faz OCR</b>: PDFs digitalizados e imagens não são lidos. Nesses casos nada é inventado — o anexo fica guardado e o boleto deve ser lançado manualmente.</Alert>
      <Async state={st}>
        {(d) => d.items.length === 0 ? <Empty text="Nenhum e-mail recebido ainda. Use “Simular recebimento de e-mail” ou configure o webhook em Configurar." /> : (
          <Box sx={{ display: "grid", gap: 1.25 }}>
            {d.items.map((e: any) => (
              <Cartao key={e.id} destaque={e.status === "ILEGIVEL" ? "error" : e.status === "SEM_DADOS" ? "warning" : undefined}>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                  <Typography sx={{ fontWeight: 800 }}>{e.assunto || "(sem assunto)"}</Typography><StatusChip value={e.status} />
                  <Chip size="small" variant="outlined" label={e.origem === "SIMULADO" ? "simulado" : "webhook"} />
                </Box>
                <Sub>{e.remetente || "remetente não informado"} · {fmtDateTime(e.recebidoEm)} · {e.boletosGerados} boleto(s) gerado(s) · {e.anexos} anexo(s)</Sub>
                {e.observacao && <Alert severity={e.status === "PROCESSADO" ? "info" : "warning"} sx={{ mt: 0.75, py: 0 }}>{e.observacao}</Alert>}
                {(e.anexosLidos || []).map((a: any) => (
                  <Typography key={a.id} variant="caption" component="div" sx={{ mt: 0.5, overflowWrap: "anywhere" }}>📎 {a.nome} — {label(a.leitura)}{a.leituraNota ? `: ${a.leituraNota}` : ""}</Typography>
                ))}
              </Cartao>
            ))}
          </Box>
        )}
      </Async>
    </Panel>
  );
}

// ---------------------------------------------------------------- simular e-mail
const EXEMPLO_TEXTO = `Prezados,\nsegue o boleto referente ao serviço prestado.\nBeneficiário: Gráfica Aurora Ltda\nCNPJ: 71.020.030/0001-05\nVencimento: dd/mm/aaaa\nValor do documento: R$ 3.200,00\nLinha digitável: (cole aqui a linha de 47 dígitos)\n`;

function SimularEmail({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [de, setDe] = useState("financeiro@fornecedor.exemplo.com.br");
  const [assunto, setAssunto] = useState("Boleto de serviços");
  const [texto, setTexto] = useState("");
  const [arquivos, setArquivos] = useState<Array<{ filename: string; mime: string; contentBase64: string; tamanho: number }>>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<any>(null);
  const cfg = useApi<any>(open ? `${BOL}/config` : null);
  useEffect(() => { if (open) { setRes(null); setErr(null); } }, [open]);
  async function escolher(files: FileList | null) {
    if (!files) return;
    try { setArquivos([...arquivos, ...(await Promise.all(Array.from(files).map(lerArquivoBase64)))].slice(0, 10)); } catch (e: any) { setErr(e.message); }
  }
  async function enviar() {
    setBusy(true); setErr(null);
    try { setRes(await eduApi.post(`${BOL}/email/simular`, { de, assunto, texto, anexos: arquivos.map(({ filename, mime, contentBase64 }) => ({ filename, mime, contentBase64 })) })); } catch (e: any) { setErr(erroCompleto(e)); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Simular recebimento de e-mail</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
        {!res && (
          <>
            <Alert severity="info" sx={{ py: 0.5 }}>
              Simula um fornecedor escrevendo para <b>{cfg.data?.endereco || "a caixa de boletos"}</b>. O sistema guarda o anexo, extrai linha digitável, valor, vencimento, beneficiário/CNPJ, nº do documento e chave de NF-e (XML) e lança como <b>boleto recebido</b>, sem autorizar pagamento.
              Aceita <b>texto, PDF com texto embutido e XML de NF-e</b>. <b>Não há OCR</b>: PDFs digitalizados e imagens não são lidos. Anexos até ~1,4 MB cada.
            </Alert>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              <TextField size="small" label="De" value={de} onChange={(e) => setDe(e.target.value)} />
              <TextField size="small" label="Assunto" value={assunto} onChange={(e) => setAssunto(e.target.value)} />
            </Box>
            <TextField multiline minRows={6} size="small" label="Corpo do e-mail" value={texto} onChange={(e) => setTexto(e.target.value)} helperText="Cole o texto do boleto ou use o exemplo abaixo e ajuste a linha digitável." />
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
              <Button size="small" onClick={() => setTexto(EXEMPLO_TEXTO)}>Inserir texto de exemplo</Button>
              <Button size="small" variant="outlined" component="label">Anexar PDF / XML / texto<input hidden type="file" multiple accept=".pdf,.xml,.txt,.csv,.png,.jpg,.jpeg" onChange={(e) => { escolher(e.target.files); e.target.value = ""; }} /></Button>
              {arquivos.map((a, i) => <Chip key={i} size="small" label={`${a.filename} · ${Math.round(a.tamanho / 1024)} KB`} onDelete={() => setArquivos(arquivos.filter((_, j) => j !== i))} />)}
            </Box>
          </>
        )}
        {err && <Alert severity="error">{err}</Alert>}
        {res && (
          <Box sx={{ display: "grid", gap: 1.5 }}>
            <Alert severity={res.boletos.length ? "success" : "warning"}>
              {res.duplicadoEmail ? "Este e-mail já havia sido recebido (mesmo identificador): nada foi reprocessado." : res.boletos.length ? `${res.boletos.length} boleto(s) lançado(s) na caixa como RECEBIDO.` : res.aviso || "Nenhum boleto identificado."}
            </Alert>
            {(res.anexos || []).map((a: any, i: number) => (
              <Typography key={i} variant="body2" sx={{ overflowWrap: "anywhere" }}>📎 {a.nome}: {label(a.leitura)}{a.nota ? ` — ${a.nota}` : ""}</Typography>
            ))}
            {res.boletos.map((b: any) => (
              <Cartao key={b.id}>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}><Typography sx={{ fontWeight: 800 }}>{b.numero}</Typography><ResultadoChip value={b.resultado} score={b.score} /></Box>
                <Typography variant="body2">{b.beneficiarioNome || "Beneficiário não identificado"} · {brl(b.valor)} · vence {fmtDate(b.vencimento)}</Typography>
                <Motivos motivos={(b.motivos || []).filter((m: any) => m.gravidade !== "OK").slice(0, 4)} dense />
              </Cartao>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {!res ? (<><Button onClick={onClose} disabled={busy}>Cancelar</Button><Button variant="contained" onClick={enviar} disabled={busy || (!texto.trim() && !arquivos.length)}>{busy ? "Processando…" : "Simular recebimento"}</Button></>) : (<><Button onClick={() => setRes(null)}>Simular outro</Button><Button variant="contained" onClick={() => { onDone(); onClose(); }}>Ver na caixa</Button></>)}
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------- lançamento manual
function LancarManual({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const vazio = { linhaDigitavel: "", valor: "", vencimento: "", beneficiarioNome: "", beneficiarioDocumento: "", numeroDocumento: "", nfChave: "", descricao: "" };
  const [f, setF] = useState(vazio);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setF({ ...vazio, vencimento: hojeISO() }); setErr(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  async function salvar() {
    setBusy(true); setErr(null);
    try {
      const body: any = { beneficiarioNome: f.beneficiarioNome };
      if (f.linhaDigitavel) body.linhaDigitavel = f.linhaDigitavel;
      if (f.valor) body.valor = Number(String(f.valor).replace(",", "."));
      if (f.vencimento) body.vencimento = f.vencimento;
      for (const k of ["beneficiarioDocumento", "numeroDocumento", "nfChave", "descricao"] as const) if (f[k]) body[k] = f[k];
      await eduApi.post(`${BOL}/boletos`, body);
      onDone(); onClose();
    } catch (e: any) { setErr(erroCompleto(e)); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Lançar boleto manualmente</DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2, py: 0 }}>Se informar a linha digitável, valor e vencimento embutidos são usados quando você não preencher. O check-up roda ao salvar. Quem lança não poderá autorizar o mesmo boleto (segregação de funções).</Alert>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
          <TextField size="small" label="Linha digitável / código de barras" value={f.linhaDigitavel} onChange={set("linhaDigitavel")} sx={{ gridColumn: { md: "1 / -1" } }} />
          <TextField size="small" label="Beneficiário (fornecedor)" required value={f.beneficiarioNome} onChange={set("beneficiarioNome")} />
          <TextField size="small" label="CNPJ/CPF do beneficiário" value={f.beneficiarioDocumento} onChange={set("beneficiarioDocumento")} />
          <TextField size="small" label="Valor (R$)" value={f.valor} onChange={set("valor")} />
          <TextField size="small" type="date" label="Vencimento" value={f.vencimento} onChange={set("vencimento")} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" label="Nº do documento" value={f.numeroDocumento} onChange={set("numeroDocumento")} />
          <TextField size="small" label="Chave da NF-e (44 dígitos)" value={f.nfChave} onChange={set("nfChave")} />
          <TextField size="small" label="Descrição" value={f.descricao} onChange={set("descricao")} sx={{ gridColumn: { md: "1 / -1" } }} />
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={onClose} disabled={busy}>Cancelar</Button><Button variant="contained" onClick={salvar} disabled={busy || f.beneficiarioNome.trim().length < 2 || (!f.linhaDigitavel && !f.valor)}>{busy ? "Salvando…" : "Lançar na caixa"}</Button></DialogActions>
    </Dialog>
  );
}
