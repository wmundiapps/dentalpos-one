import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { eduApi } from "../../services/EduApi";
import { Empty, Feedback, Status, fmtDate, fmtMoney, useLoad } from "../secretaria/util";
import { Kpi } from "./PortalSecoes";
import { sid, useToast } from "./comum";

/** Financeiro: parcelas, 2ª via de boleto, Pix copia-e-cola e acordo de parcelas em atraso. */
export default function PortalFinanceiro({ studentId, podeAgir }: { studentId?: string | null; podeAgir: boolean }) {
  const { data, loading, error, reload } = useLoad<any>(`/portal2/aluno/financeiro${sid(studentId)}`);
  const [via, setVia] = useState<any>(null);
  const [ac, setAc] = useState<any>(null);
  const t = useToast();
  const itens: any[] = data?.itens || [];
  const r = data?.resumo;

  async function segundaVia(p: any, forma: "BOLETO" | "PIX") {
    try { setVia({ carregando: true, p, forma }); setVia({ ...(await eduApi.post(`/portal2/aluno/financeiro/${p.id}/segunda-via`, { forma })), p }); } catch (e: any) { setVia(null); t.err(e.message); }
  }
  const copiar = async (txt: string) => { try { await navigator.clipboard.writeText(txt); t.ok("Copiado!"); } catch { t.err("Não foi possível copiar automaticamente. Selecione o texto e copie."); } };

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {r && (
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "repeat(2, minmax(0,1fr))", md: "repeat(4, minmax(0,1fr))" } }}>
          <Kpi title="Situação" value={r.emDia ? "Em dia" : "Pendente"} color={r.emDia ? "#2E7D32" : "#D32F2F"} />
          <Kpi title="Em aberto" value={fmtMoney(r.emAberto)} color="#0F5FDB" />
          <Kpi title="Vencido (c/ encargos)" value={fmtMoney(r.vencido)} hint={`${r.qtdVencidas} parcela(s)`} color="#D32F2F" />
          <Kpi title="Próximo vencimento" value={r.proximo ? fmtDate(r.proximo.vencimento) : "—"} hint={r.proximo ? fmtMoney(r.proximo.valor) : undefined} color="#ED6C02" />
        </Box>
      )}
      {podeAgir && r?.qtdVencidas > 0 && (
        <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => setAc({ ids: itens.filter((i) => i.vencida).map((i) => i.id), parcelas: 3, entrada: 0 })}>Negociar</Button>}>
          Você tem {r.qtdVencidas} parcela(s) vencida(s). Quitando em até 3x, os encargos (multa e juros) são perdoados.
        </Alert>
      )}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Mensalidades e cobranças</Typography>
        {!loading && !itens.length && <Empty>Nenhuma cobrança.</Empty>}
        <Box sx={{ display: "grid", gap: 0.75 }}>
          {itens.map((i) => (
            <Box key={i.id} sx={{ display: "flex", gap: 1, alignItems: "center", py: 0.75, borderBottom: "1px dashed", borderColor: "divider", flexWrap: "wrap" }}>
              <Box sx={{ flex: 1, minWidth: 190 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{i.descricao}</Typography>
                <Typography variant="caption" color={i.vencida ? "error" : "text.secondary"}>Vence em {fmtDate(i.vencimento)}{i.pagoEm ? ` · pago em ${fmtDate(i.pagoEm)}` : ""}{i.encargos ? ` · com encargos ${fmtMoney(i.encargos.total)} (${i.encargos.dias} dia(s) de atraso)` : ""}</Typography>
              </Box>
              <Typography sx={{ fontWeight: 800 }}>{fmtMoney(i.valor)}</Typography>
              <Status value={i.status} />
              {podeAgir && ["PENDENTE", "ATRASADO"].includes(i.status) && (
                <>
                  <Button size="small" variant="outlined" onClick={() => segundaVia(i, "BOLETO")}>2ª via do boleto</Button>
                  <Button size="small" variant="contained" onClick={() => segundaVia(i, "PIX")}>Pagar com Pix</Button>
                </>
              )}
            </Box>
          ))}
        </Box>
      </Paper>
      {(data?.acordos || []).length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Acordos</Typography>
          {data.acordos.map((a: any) => (
            <Box key={a.id} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", py: 0.5 }}>
              <Typography variant="body2" sx={{ flex: 1, minWidth: 200 }}>{fmtDate(a.createdAt)} · {a.parcelas}x de {fmtMoney(a.valorParcela)}{a.entrada ? ` + entrada ${fmtMoney(a.entrada)}` : ""} · desconto {fmtMoney(a.desconto)}{a.parecer ? ` · ${a.parecer}` : ""}</Typography>
              <Status value={a.status} />
              {podeAgir && a.status === "SOLICITADO" && <Button size="small" onClick={async () => { try { await eduApi.post(`/portal2/aluno/acordos/${a.id}/cancelar`); t.ok("Acordo cancelado."); reload(); } catch (e: any) { t.err(e.message); } }}>Cancelar</Button>}
            </Box>
          ))}
        </Paper>
      )}

      <Dialog open={!!via} onClose={() => setVia(null)} fullWidth maxWidth="sm">
        <DialogTitle>{via?.forma === "PIX" ? "Pagamento via Pix" : "2ª via do boleto"}</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 1.5 }}>
          {via?.carregando && <Feedback loading />}
          {via?.simulado && (
            <>
              <Alert severity="info">{via.aviso}</Alert>
              <Typography>{via.parcela?.descricao}</Typography>
              <Typography variant="body2">Valor original {fmtMoney(via.parcela?.valorOriginal)} · multa {fmtMoney(via.encargos?.multa)} · juros {fmtMoney(via.encargos?.juros)}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>{fmtMoney(via.valorTotal)} <Typography component="span" variant="body2" color="text.secondary">até {fmtDate(via.vencimento)}</Typography></Typography>
              {via.linhaDigitavel && <><TextField label="Linha digitável" value={via.linhaDigitavel} slotProps={{ input: { readOnly: true } }} size="small" /><Button onClick={() => copiar(via.linhaDigitavel)}>Copiar linha digitável</Button></>}
              {via.pixCopiaECola && <><TextField label="Pix copia e cola" value={via.pixCopiaECola} multiline minRows={3} slotProps={{ input: { readOnly: true } }} size="small" /><Button variant="contained" onClick={() => copiar(via.pixCopiaECola)}>Copiar código Pix</Button></>}
            </>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setVia(null)}>Fechar</Button></DialogActions>
      </Dialog>
      <AcordoDialog ac={ac} setAc={setAc} itens={itens} onDone={() => { setAc(null); t.ok("Acordo enviado para aprovação."); reload(); }} onErr={t.err} />
      {t.node}
    </Box>
  );
}

function AcordoDialog({ ac, setAc, itens, onDone, onErr }: { ac: any; setAc: (v: any) => void; itens: any[]; onDone: () => void; onErr: (m: string) => void }) {
  const [sim, setSim] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const ids = ac?.ids as string[] | undefined;
  useEffect(() => {
    if (!ac || !ids?.length) { setSim(null); return; }
    let vivo = true;
    eduApi.post("/portal2/aluno/acordos/simular", { receivableIds: ids, parcelas: Number(ac.parcelas), entrada: Number(ac.entrada) || 0 })
      .then((r) => { if (vivo) { setSim(r); setErro(null); } }).catch((e) => { if (vivo) { setSim(null); setErro(e.message); } });
    return () => { vivo = false; };
  }, [ac?.parcelas, ac?.entrada, ids?.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const vencidas = itens.filter((i) => i.vencida);
  return (
    <Dialog open={!!ac} onClose={() => setAc(null)} fullWidth maxWidth="sm">
      <DialogTitle>Negociar parcelas em atraso</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 1.5, pt: 2 }}>
        {vencidas.map((i) => (
          <Box key={i.id} sx={{ display: "flex", alignItems: "center" }}>
            <Checkbox checked={!!ids?.includes(i.id)} onChange={(e) => setAc({ ...ac, ids: e.target.checked ? [...(ids || []), i.id] : (ids || []).filter((x) => x !== i.id) })} />
            <Typography variant="body2" sx={{ flex: 1 }}>{i.descricao} — vencida em {fmtDate(i.vencimento)}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{fmtMoney(i.encargos?.total ?? i.valor)}</Typography>
          </Box>
        ))}
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
          <TextField select size="small" label="Parcelas" value={ac?.parcelas ?? 3} onChange={(e) => setAc({ ...ac, parcelas: e.target.value })}>{[1, 2, 3, 4, 6, 9, 12].map((n) => <MenuItem key={n} value={n}>{n}x{n <= 3 ? " (sem encargos)" : n <= 6 ? " (50% dos encargos)" : ""}</MenuItem>)}</TextField>
          <TextField size="small" type="number" label="Entrada (R$)" value={ac?.entrada ?? 0} onChange={(e) => setAc({ ...ac, entrada: e.target.value })} />
        </Box>
        {erro && <Alert severity="warning">{erro}</Alert>}
        {sim && (
          <Alert severity="success">
            Total original {fmtMoney(sim.valorOriginal)} + encargos {fmtMoney(sim.encargos)} − desconto {fmtMoney(sim.desconto)} = <b>{fmtMoney(sim.total)}</b>.
            {sim.entrada ? ` Entrada ${fmtMoney(sim.entrada)} e ` : " "}<b>{sim.parcelas}x de {fmtMoney(sim.valorParcela)}</b>.
          </Alert>
        )}
        <Chip size="small" label="O acordo passa por aprovação do financeiro; as parcelas originais só são substituídas após a aprovação." sx={{ height: "auto", "& .MuiChip-label": { whiteSpace: "normal", py: 0.5 } }} />
      </DialogContent>
      <DialogActions><Button onClick={() => setAc(null)}>Cancelar</Button>
        <Button variant="contained" disabled={!sim} onClick={async () => { try { await eduApi.post("/portal2/aluno/acordos", { receivableIds: ids, parcelas: Number(ac.parcelas), entrada: Number(ac.entrada) || 0 }); onDone(); } catch (e: any) { onErr(e.message); } }}>Solicitar acordo</Button></DialogActions>
    </Dialog>
  );
}
