import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import { useEffect, useState } from "react";
import { eduApi } from "../../services/EduApi";
import { Async, Cartao, Empty, Panel, Stat, StatGrid, Sub, brl, erroCompleto, fmtDate, label, useApi, useMotivo, useToast } from "./tes";
import { BOL, StatusChip, fmtDoc, hojeISO } from "./boletosKit";

const PERIODOS = ["MENSAL", "BIMESTRAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"];

/** Memória de contas recorrentes: planilha do dia, sugestões aprendidas e cadastro. */
export default function BoletosRecorrentes({ onChanged }: { onChanged: () => void }) {
  const [k, setK] = useState(0);
  const [dia, setDia] = useState(hojeISO());
  const plan = useApi<any>(`${BOL}/planilha-do-dia?data=${dia}&_=${k}`);
  const rec = useApi<any>(`${BOL}/recorrencias?_=${k}`);
  const [edit, setEdit] = useState<any | null | false>(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const motivo = useMotivo();
  const reload = () => { setK((x) => x + 1); onChanged(); };

  async function verificar() {
    setBusy(true);
    try {
      const r = await eduApi.post(`${BOL}/recorrencias/verificar`, {});
      toast.ok(`Verificação feita: ${r.lancados} lançada(s), ${r.naoLancados} não lançada(s)${r.novosAvisos ? `, ${r.novosAvisos} novo(s) aviso(s)` : ""}${r.sugestoesNovas ? `, ${r.sugestoesNovas} nova(s) sugestão(ões)` : ""}.`);
      reload();
    } catch (e: any) { toast.err(erroCompleto(e)); } finally { setBusy(false); }
  }
  async function tratar(id: string, tipo: "justificar" | "dispensar") {
    const m = await motivo.ask(tipo === "justificar" ? "Justificar a ausência deste lançamento" : "Dispensar esta ocorrência (ex.: contrato encerrado)");
    if (!m) return;
    try { await eduApi.post(`${BOL}/esperados/${id}/${tipo}`, { justificativa: m }); toast.ok("Registrado na auditoria."); reload(); } catch (e: any) { toast.err(erroCompleto(e)); }
  }
  async function sugestao(id: string, aceitar: boolean) {
    try { await eduApi.post(`${BOL}/recorrencias/sugestoes/${id}/${aceitar ? "aceitar" : "ignorar"}`, {}); toast.ok(aceitar ? "Recorrência criada a partir da sugestão." : "Sugestão ignorada."); reload(); } catch (e: any) { toast.err(erroCompleto(e)); }
  }

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Panel title="Planilha do dia" subtitle="O que era esperado (contas recorrentes) comparado com o que já foi lançado na caixa ou em Contas a pagar."
        actions={
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
            <TextField size="small" type="date" label="Dia" value={dia} onChange={(e) => setDia(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <Button variant="contained" startIcon={<AutorenewIcon />} onClick={verificar} disabled={busy}>{busy ? "Verificando…" : "Verificar agora"}</Button>
          </Box>
        }>
        <Async state={plan}>
          {(p) => (
            <>
              <StatGrid min={150}>
                <Stat label="Não lançadas" value={p.totais.naoLancados} tone={p.totais.naoLancados ? "error" : "success"} hint={p.totais.naoLancados ? brl(p.totais.valorNaoLancado) : "tudo em dia"} />
                <Stat label="Já lançadas" value={p.lancados.length} tone="success" />
                <Stat label="Próximos 7 dias" value={p.proximos.length} />
              </StatGrid>
              {p.naoLancados.length === 0 && p.lancados.length === 0 && p.proximos.length === 0 && p.tratados.length === 0 && <Empty text="Nenhuma conta recorrente esperada para esta janela. Cadastre recorrências abaixo ou aceite as sugestões aprendidas." />}
              {p.naoLancados.length > 0 && <Alert severity="error" sx={{ mb: 1.5 }}>Conta recorrente não lançada: {p.naoLancados.map((x: any) => x.fornecedor).join(", ")}.</Alert>}
              <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" } }}>
                {[...p.naoLancados, ...p.proximos, ...p.lancados, ...p.tratados].map((x: any) => (
                  <Cartao key={x.id} destaque={x.status === "NAO_LANCADO" ? "error" : x.status === "LANCADO" ? "success" : undefined}>
                    <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                      <Typography sx={{ fontWeight: 800 }}>{x.fornecedor}</Typography><StatusChip value={x.status} />
                    </Box>
                    <Typography variant="body2">{x.descricao ? `${x.descricao} · ` : ""}≈ {brl(x.valorEstimado)} · vencimento esperado {fmtDate(x.dataEsperada)}</Typography>
                    {x.status === "NAO_LANCADO" && <Sub>Esperado lançar desde {fmtDate(x.limiteLancamento)} · {x.diasAtraso} dia(s) de atraso</Sub>}
                    {x.justificativa && <Sub>Justificativa: {x.justificativa}</Sub>}
                    {x.status === "NAO_LANCADO" && (
                      <Box sx={{ display: "flex", gap: 1, mt: 0.75, flexWrap: "wrap" }}>
                        <Button size="small" variant="outlined" onClick={() => tratar(x.id, "justificar")}>Justificar</Button>
                        <Button size="small" onClick={() => tratar(x.id, "dispensar")}>Dispensar</Button>
                      </Box>
                    )}
                  </Cartao>
                ))}
              </Box>
            </>
          )}
        </Async>
      </Panel>

      <Async state={rec}>
        {(r) => (
          <>
            {r.sugestoes.length > 0 && (
              <Panel title="Sugestões aprendidas" subtitle="O mesmo fornecedor foi lançado em meses seguidos com valor parecido. Nada vira recorrência sem a sua confirmação.">
                <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
                  {r.sugestoes.map((s: any) => (
                    <Cartao key={s.id} destaque="warning">
                      <Typography sx={{ fontWeight: 800 }}>{s.fornecedorNome}</Typography>
                      <Typography variant="body2">≈ {brl(s.valorMedio)} · costuma vencer dia {s.diaMedio} · {s.meses} meses seguidos</Typography>
                      <Box sx={{ display: "flex", gap: 1, mt: 0.75 }}>
                        <Button size="small" variant="contained" onClick={() => sugestao(s.id, true)}>Aceitar como recorrência</Button>
                        <Button size="small" onClick={() => sugestao(s.id, false)}>Ignorar</Button>
                      </Box>
                    </Cartao>
                  ))}
                </Box>
              </Panel>
            )}
            <Panel title="Contas recorrentes cadastradas" actions={<Button variant="outlined" startIcon={<AddIcon />} onClick={() => setEdit(null)}>Nova recorrência</Button>}>
              {r.items.length === 0 ? <Empty text="Nenhuma recorrência cadastrada." /> : (
                <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
                  {r.items.map((x: any) => (
                    <Cartao key={x.id}>
                      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                        <Typography sx={{ fontWeight: 800 }}>{x.fornecedorNome}</Typography>
                        {!x.ativa && <Chip size="small" label="inativa" />}{x.origem === "APRENDIDA" && <Chip size="small" color="info" variant="outlined" label="aprendida" />}
                      </Box>
                      <Typography variant="body2">{x.descricao ? `${x.descricao} · ` : ""}≈ {brl(x.valorEstimado)} (±{x.toleranciaPercentual}%) · {label(x.periodicidade)} · dia {x.diaMes}</Typography>
                      <Sub>{fmtDoc(x.fornecedorDocumento)} · lançada normalmente até {x.antecedenciaDias} dia(s) antes do vencimento</Sub>
                      <Box sx={{ display: "flex", gap: 1, mt: 0.5 }}>
                        <Button size="small" onClick={() => setEdit(x)}>Editar</Button>
                        {x.ativa && <Button size="small" color="error" onClick={async () => { if (!window.confirm("Desativar esta recorrência?")) return; try { await eduApi.del(`${BOL}/recorrencias/${x.id}`); toast.ok("Recorrência desativada."); reload(); } catch (e: any) { toast.err(erroCompleto(e)); } }}>Desativar</Button>}
                      </Box>
                    </Cartao>
                  ))}
                </Box>
              )}
            </Panel>
          </>
        )}
      </Async>
      {edit !== false && <RecorrenciaForm inicial={edit} onClose={() => setEdit(false)} onDone={() => { setEdit(false); reload(); }} />}
      {toast.node}{motivo.node}
    </Box>
  );
}

function RecorrenciaForm({ inicial, onClose, onDone }: { inicial: any | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<any>({ fornecedorNome: "", fornecedorDocumento: "", descricao: "", valorEstimado: "", toleranciaPercentual: 20, periodicidade: "MENSAL", mesBase: 1, diaMes: 10, antecedenciaDias: 5 });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (inicial) setF({ ...inicial, valorEstimado: String(inicial.valorEstimado), fornecedorDocumento: inicial.fornecedorDocumento || "", descricao: inicial.descricao || "" }); }, [inicial]);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  async function salvar() {
    setBusy(true); setErr(null);
    const body = { fornecedorNome: f.fornecedorNome, fornecedorDocumento: f.fornecedorDocumento || null, descricao: f.descricao || null, valorEstimado: Number(String(f.valorEstimado).replace(",", ".")), toleranciaPercentual: Number(f.toleranciaPercentual), periodicidade: f.periodicidade, mesBase: Number(f.mesBase), diaMes: Number(f.diaMes), antecedenciaDias: Number(f.antecedenciaDias) };
    try { if (inicial) await eduApi.put(`${BOL}/recorrencias/${inicial.id}`, body); else await eduApi.post(`${BOL}/recorrencias`, body); onDone(); } catch (e: any) { setErr(erroCompleto(e)); } finally { setBusy(false); }
  }
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800 }}>{inicial ? "Editar recorrência" : "Nova conta recorrente"}</DialogTitle>
      <DialogContent dividers>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
          <TextField size="small" label="Fornecedor" required value={f.fornecedorNome} onChange={set("fornecedorNome")} />
          <TextField size="small" label="CNPJ/CPF" value={f.fornecedorDocumento} onChange={set("fornecedorDocumento")} />
          <TextField size="small" label="Descrição" value={f.descricao} onChange={set("descricao")} sx={{ gridColumn: { sm: "1 / -1" } }} />
          <TextField size="small" label="Valor aproximado (R$)" required value={f.valorEstimado} onChange={set("valorEstimado")} />
          <TextField size="small" type="number" label="Tolerância (%)" value={f.toleranciaPercentual} onChange={set("toleranciaPercentual")} />
          <TextField select size="small" label="Periodicidade" value={f.periodicidade} onChange={set("periodicidade")}>{PERIODOS.map((p) => <MenuItem key={p} value={p}>{label(p)}</MenuItem>)}</TextField>
          <TextField size="small" type="number" label="Dia do vencimento no mês" value={f.diaMes} onChange={set("diaMes")} slotProps={{ htmlInput: { min: 1, max: 31 } }} />
          {f.periodicidade !== "MENSAL" && <TextField size="small" type="number" label="Mês de referência (1-12)" value={f.mesBase} onChange={set("mesBase")} slotProps={{ htmlInput: { min: 1, max: 12 } }} />}
          <TextField size="small" type="number" label="Costuma ser lançada N dias antes" value={f.antecedenciaDias} onChange={set("antecedenciaDias")} helperText="Depois desse prazo sem lançamento, o sistema avisa." />
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={onClose} disabled={busy}>Cancelar</Button><Button variant="contained" onClick={salvar} disabled={busy || f.fornecedorNome.trim().length < 2 || !f.valorEstimado}>{busy ? "Salvando…" : "Salvar"}</Button></DialogActions>
    </Dialog>
  );
}
