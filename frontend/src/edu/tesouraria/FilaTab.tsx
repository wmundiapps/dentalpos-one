import { Alert, Box, Button, Checkbox, FormControlLabel, Switch, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import { eduApi } from "../../services/EduApi";
import { Async, Cartao, Light, Situacao, Stat, StatGrid, Sub, TES, brl, comReauth, erroCompleto, fmtDate, label, num, useApi, useMotivo, useToast } from "./tes";
import { TituloDetalhe } from "./PagarTab";

export default function FilaTab() {
  const [key, setKey] = useState(0);
  const st = useApi<any>(`${TES}/titulos/fila?_=${key}`);
  const [soMeus, setSoMeus] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [det, setDet] = useState<string | null>(null);
  const toast = useToast();
  const motivo = useMotivo();
  const reload = () => { setKey((k) => k + 1); setSel([]); };

  const itens = useMemo(() => {
    const l: any[] = st.data?.items || [];
    return soMeus ? l.filter((i) => i.podeConferir || i.podeAutorizar) : l;
  }, [st.data, soMeus]);

  async function um(i: any, acao: "conferir" | "autorizar") {
    try {
      const r = await comReauth((x) => eduApi.post(`${TES}/titulos/${i.id}/${acao}`, x));
      toast.ok(acao === "conferir" ? `${i.numero} conferido.` : r.aguardandoSegundaAprovacao ? `${i.numero}: 1ª aprovação registrada (${r.aprovacoesFeitas}/${r.aprovacoesNecessarias}).` : `${i.numero} autorizado — pronto para remessa.`);
      reload();
    } catch (e: any) { toast.err(erroCompleto(e)); }
  }
  async function rejeitar(i: any) {
    const m = await motivo.ask(`Rejeitar ${i.numero}`);
    if (!m) return;
    try { await eduApi.post(`${TES}/titulos/${i.id}/rejeitar`, { motivo: m }); toast.ok(`${i.numero} rejeitado.`); reload(); } catch (e: any) { toast.err(erroCompleto(e)); }
  }
  async function lote(acao: "conferir" | "autorizar") {
    const ids = sel.filter((id) => itens.some((i) => i.id === id && (acao === "conferir" ? i.podeConferir : i.podeAutorizar)));
    if (!ids.length) { toast.err(`Nenhum dos títulos selecionados pode ser ${acao === "conferir" ? "conferido" : "autorizado"} por você.`); return; }
    if (!window.confirm(`${acao === "conferir" ? "Conferir" : "Autorizar"} ${ids.length} título(s)? Cada um passa pelas regras de alçada e segregação.`)) return;
    try {
      const r = await eduApi.post(`${TES}/titulos/lote`, { acao, ids });
      const falhas = r.resultados.filter((x: any) => !x.ok).map((x: any) => x.erro);
      (r.falhas ? toast.err : toast.ok)(`${r.ok} processado(s)${r.falhas ? `, ${r.falhas} com problema: ${falhas.slice(0, 3).join(" | ")}` : ""}.`);
      reload();
    } catch (e: any) { toast.err(erroCompleto(e)); }
  }

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Alert severity="info">Fila de conferência e autorização: a coordenação <b>confere</b> os dados de pagamento e <b>autoriza</b> conforme a alçada por valor. Quem lançou o título não pode conferi-lo nem autorizá-lo; acima do limite é exigida dupla aprovação.</Alert>
      <Async state={st}>
        {(f) => (
          <>
            <StatGrid min={150}>
              <Stat label="Para você agora" value={num(f.paraMim, 0)} tone={f.paraMim ? "warning" : "success"} />
              <Stat label="A conferir" value={num(f.aConferir, 0)} />
              <Stat label="A autorizar" value={num(f.aAutorizar, 0)} hint={brl(f.valorAAutorizar)} />
            </StatGrid>
            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
              <FormControlLabel control={<Switch checked={soMeus} onChange={(e) => setSoMeus(e.target.checked)} />} label="Mostrar só o que posso agir" />
              <Box sx={{ flex: 1 }} />
              <Button variant="outlined" disabled={!sel.length} onClick={() => lote("conferir")}>Conferir selecionados ({sel.length})</Button>
              <Button variant="contained" color="success" disabled={!sel.length} onClick={() => lote("autorizar")}>Autorizar selecionados</Button>
            </Box>
            {!itens.length && <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>Nada na fila.</Typography>}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 1.5 }}>
              {itens.map((i) => {
                const atrasado = new Date(i.vencimento) < new Date();
                return (
                  <Cartao key={i.id} destaque={atrasado ? "error" : i.podeConferir || i.podeAutorizar ? "warning" : undefined}>
                    <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                      <Checkbox size="small" checked={sel.includes(i.id)} disabled={!i.podeConferir && !i.podeAutorizar} onChange={(e) => setSel(e.target.checked ? [...sel, i.id] : sel.filter((x) => x !== i.id))} sx={{ p: 0.5 }} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                          <Typography sx={{ fontWeight: 800 }}>{i.numero}</Typography><Situacao value={i.status} />
                          {i.aprovacoesNecessarias > 1 && <Situacao value={`${i.aprovacoesFeitas}/${i.aprovacoesNecessarias} aprovações`} />}
                          {i.exige2fa && <Typography variant="caption" color="warning.main">exige 2FA</Typography>}
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap title={i.fornecedor}>{i.fornecedor}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{i.descricao}</Typography>
                        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mt: 0.5 }}>
                          <Typography variant="h6" sx={{ fontWeight: 800 }}>{brl(i.valorBruto)}</Typography>
                          <Light tone={atrasado ? "error" : "default"} text={`vence ${fmtDate(i.vencimento)}`} />
                          <Typography variant="body2">{label(i.formaPagamento)} · {label(i.origem)}</Typography>
                        </Box>
                        <Sub>Faixa: {i.faixa} · lançado por {i.criadoPorNome || "—"}{i.conferidoPorNome ? ` · conferido por ${i.conferidoPorNome}` : ""}</Sub>
                        {i.pendencias?.length > 0 && <Alert severity="warning" sx={{ mt: 1, py: 0 }}>Pendências: {i.pendencias.join(" · ")}</Alert>}
                        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1 }}>
                          <Button size="small" onClick={() => setDet(i.id)}>Detalhes</Button>
                          {i.podeConferir && <Button size="small" variant="contained" onClick={() => um(i, "conferir")}>Conferir</Button>}
                          {i.podeAutorizar && <Button size="small" variant="contained" color="success" onClick={() => um(i, "autorizar")}>Autorizar</Button>}
                          {i.status === "CONFERIDO" && !i.podeAutorizar && i.criadoPorId && <Sub>{i.aprovacoesFeitas ? "aguardando outro aprovador" : "sem permissão de alçada para você"}</Sub>}
                          {(i.status === "CONFERIDO") && <Button size="small" color="error" onClick={() => rejeitar(i)}>Rejeitar</Button>}
                        </Box>
                      </Box>
                    </Box>
                  </Cartao>
                );
              })}
            </Box>
          </>
        )}
      </Async>
      {det && <TituloDetalhe id={det} onClose={() => setDet(null)} onChanged={reload} />}
      {toast.node}{motivo.node}
    </Box>
  );
}
