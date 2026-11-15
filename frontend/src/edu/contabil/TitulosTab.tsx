import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { C, Cartao, Estado, ExigeEmpresa, Grade, Indicador, SimulacaoChip, Situacao, abrirImprimivel, api, brl, data, dataHora, isoDia, numero, tabelaSx, useAcao, useApi, useContabil } from "./kit";

const CONTAS_RECEITA = [["3.1.2.01", "Prestação de serviços"], ["3.1.1.01", "Venda de mercadorias"]];
const CONTAS_DESPESA = [["5.1.2.01", "Despesas administrativas"], ["5.1.1.01", "Salários e encargos"], ["5.1.3.01", "Aluguéis e condomínio"], ["5.1.4.01", "Marketing e comercial"], ["5.1.5.01", "Tributos e taxas"], ["4.1.1.01", "Custo das mercadorias (CMV)"], ["4.1.2.01", "Custo dos serviços (CSP)"], ["3.2.1.01", "Impostos sobre vendas/serviços (dedução)"]];

function Novo({ empresaId, tipo, onClose, onFeito }: { empresaId: string; tipo: "PAGAR" | "RECEBER"; onClose: () => void; onFeito: () => void }) {
  const [f, setF] = useState<any>({ descricao: "", parceiroNome: "", parceiroEmail: "", parceiroTelefone: "", valor: "", vencimento: isoDia(10), conta: tipo === "RECEBER" ? "3.1.2.01" : "5.1.2.01" });
  const { rodar, aviso, ocupado } = useAcao();
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const contas = tipo === "RECEBER" ? CONTAS_RECEITA : CONTAS_DESPESA;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{tipo === "RECEBER" ? "Nova conta a receber" : "Nova conta a pagar"}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: 2 }}>
        {aviso}
        <TextField label="Descrição" value={f.descricao} onChange={set("descricao")} required />
        <TextField label={tipo === "RECEBER" ? "Cliente" : "Fornecedor"} value={f.parceiroNome} onChange={set("parceiroNome")} required />
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
          <TextField label="Valor (R$)" value={f.valor} onChange={set("valor")} error={f.valor !== "" && !(numero(f.valor) > 0)} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
          <TextField type="date" label="Vencimento" value={f.vencimento} onChange={set("vencimento")} slotProps={{ inputLabel: { shrink: true } }} />
        </Box>
        <TextField select label="Conta contábil" value={f.conta} onChange={set("conta")} helperText="Define em qual conta do plano o lançamento automático é feito.">{contas.map(([k, v]) => <MenuItem key={k} value={k}>{k} — {v}</MenuItem>)}</TextField>
        {tipo === "RECEBER" ? <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}><TextField label="E-mail do cliente (cobrança)" value={f.parceiroEmail} onChange={set("parceiroEmail")} /><TextField label="WhatsApp/telefone (cobrança)" value={f.parceiroTelefone} onChange={set("parceiroTelefone")} /></Box> : null}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={ocupado || !f.descricao.trim() || f.parceiroNome.trim().length < 2 || !(numero(f.valor) > 0)} onClick={async () => { if (await rodar(() => api.post(`${C}/titulos`, { empresaId, tipo, descricao: f.descricao, parceiroNome: f.parceiroNome, parceiroEmail: f.parceiroEmail || null, parceiroTelefone: f.parceiroTelefone || null, valor: numero(f.valor), vencimento: f.vencimento, contaContabilCodigo: f.conta }), "Título criado e lançado na contabilidade.")) { onFeito(); onClose(); } }}>Salvar</Button></DialogActions>
    </Dialog>
  );
}

function Lista({ empresaId, tipo }: { empresaId: string; tipo: "PAGAR" | "RECEBER" }) {
  const { pode } = useContabil();
  const [st, setSt] = useState("");
  const [q, setQ] = useState("");
  const { data: d, loading, err, reload } = useApi<any>(`${C}/titulos?empresaId=${empresaId}&tipo=${tipo}&pageSize=100${st ? `&status=${st}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`, [empresaId, tipo, st, q]);
  const [novo, setNovo] = useState(false);
  const [baixa, setBaixa] = useState<any | null>(null);
  const [hist, setHist] = useState<any | null>(null);
  const { rodar, aviso, ocupado } = useAcao();
  const escrever = pode("financeiro.escrever");
  const receber = tipo === "RECEBER";
  const abrirHist = async (t: any) => { const r = await rodar(() => api.get(`${C}/titulos/${t.id}`)); if (r) setHist(r); };
  return (
    <Cartao titulo={receber ? "Contas a receber" : "Contas a pagar"} acao={escrever ? <Button variant="contained" onClick={() => setNovo(true)}>{receber ? "Nova conta a receber" : "Nova conta a pagar"}</Button> : undefined}>
      {aviso}
      <Box sx={{ display: "flex", gap: 1.5, mb: 1.5, flexWrap: "wrap" }}>
        <TextField select size="small" label="Situação" value={st} onChange={(e) => setSt(e.target.value)} sx={{ minWidth: 150 }}><MenuItem value="">Todas</MenuItem><MenuItem value="ABERTO">Em aberto</MenuItem><MenuItem value="VENCIDO">Vencidas</MenuItem><MenuItem value="PAGO">{receber ? "Recebidas" : "Pagas"}</MenuItem><MenuItem value="CANCELADO">Canceladas</MenuItem></TextField>
        <TextField size="small" label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
      </Box>
      <Estado loading={loading} err={err} onRetry={reload} vazio={!!d && !d.items.length} textoVazio="Nenhum título encontrado com estes filtros.">
        {d ? (
          <TableContainer sx={tabelaSx}>
            <Table size="small"><TableHead><TableRow><TableCell>Vencimento</TableCell><TableCell>Descrição</TableCell><TableCell>{receber ? "Cliente" : "Fornecedor"}</TableCell><TableCell align="right">Valor</TableCell><TableCell>Situação</TableCell>{receber ? <TableCell>Cobranças</TableCell> : null}<TableCell /></TableRow></TableHead>
              <TableBody>{d.items.map((t: any) => (
                <TableRow key={t.id} hover>
                  <TableCell>{data(t.vencimento)}</TableCell><TableCell>{t.descricao}{t.notaId ? <Chip size="small" variant="outlined" label="nota" sx={{ ml: 0.5 }} /> : null}</TableCell><TableCell>{t.parceiroNome}</TableCell><TableCell align="right">{brl(t.valor)}</TableCell>
                  <TableCell><Situacao v={t.situacao} />{t.diasAtraso ? <Typography component="span" variant="caption" color="error"> {t.diasAtraso}d</Typography> : null}</TableCell>
                  {receber ? <TableCell>{t.cobrancas ? <Button size="small" onClick={() => void abrirHist(t)}>{t.cobrancas} (ver)</Button> : "—"}</TableCell> : null}
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    {escrever && t.status === "ABERTO" ? <Button size="small" onClick={() => setBaixa({ t, pagoEm: isoDia(), valorPago: String(t.valor).replace(".", ",") })}>{receber ? "Receber" : "Pagar"}</Button> : null}
                    {escrever && receber && t.status === "ABERTO" ? <Button size="small" onClick={() => void rodar(() => api.post(`${C}/titulos/${t.id}/cobrar`, { canal: t.parceiroTelefone ? "WHATSAPP" : "EMAIL" }), "Cobrança registrada (SIMULADA — nada foi enviado).").then(reload)}>Cobrar</Button> : null}
                    {receber ? <Button size="small" onClick={() => void rodar(() => abrirImprimivel(`/titulos/${t.id}/segunda-via`))}>2ª via</Button> : null}
                    {escrever && t.status === "ABERTO" ? <Button size="small" color="error" onClick={async () => { const m = window.prompt("Motivo do cancelamento (mínimo 5 caracteres):"); if (m && m.trim().length >= 5 && (await rodar(() => api.post(`${C}/titulos/${t.id}/cancelar`, { motivo: m }), "Título cancelado e lançamento estornado."))) reload(); }}>Cancelar</Button> : null}
                  </TableCell>
                </TableRow>
              ))}</TableBody></Table>
          </TableContainer>
        ) : null}
        {d ? <Typography variant="caption" color="text.secondary">Total da seleção: {brl(d.somaValor)}</Typography> : null}
      </Estado>
      {novo ? <Novo empresaId={empresaId} tipo={tipo} onClose={() => setNovo(false)} onFeito={reload} /> : null}
      <Dialog open={!!baixa} onClose={() => setBaixa(null)} fullWidth maxWidth="xs">
        <DialogTitle>{receber ? "Registrar recebimento" : "Registrar pagamento"}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: 2 }}>
          <Typography variant="body2">{baixa?.t.descricao} — {brl(baixa?.t.valor)}</Typography>
          <TextField type="date" label="Data" value={baixa?.pagoEm ?? ""} onChange={(e) => setBaixa({ ...baixa, pagoEm: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label="Valor efetivo (R$)" value={baixa?.valorPago ?? ""} onChange={(e) => setBaixa({ ...baixa, valorPago: e.target.value })} helperText="Diferenças viram juros/descontos na contabilidade." slotProps={{ htmlInput: { inputMode: "decimal" } }} />
        </DialogContent>
        <DialogActions><Button onClick={() => setBaixa(null)}>Cancelar</Button><Button variant="contained" disabled={ocupado || !(numero(baixa?.valorPago ?? "") > 0)} onClick={async () => { if (await rodar(() => api.post(`${C}/titulos/${baixa.t.id}/baixar`, { pagoEm: baixa.pagoEm, valorPago: numero(baixa.valorPago) }), "Baixa registrada.")) { setBaixa(null); reload(); } }}>Confirmar</Button></DialogActions>
      </Dialog>
      <Dialog open={!!hist} onClose={() => setHist(null)} fullWidth maxWidth="sm">
        <DialogTitle>Histórico de cobrança <SimulacaoChip texto="envio simulado" /></DialogTitle>
        <DialogContent>
          {(hist?.cobrancasHistorico ?? []).map((c: any) => (<Box key={c.id} sx={{ py: 1, borderBottom: 1, borderColor: "divider" }}><Typography variant="body2"><strong>{c.etapa}</strong> · {c.canal === "EMAIL" ? "E-mail" : c.canal === "WHATSAPP" ? "WhatsApp" : c.canal} · {dataHora(c.createdAt)}</Typography><Typography variant="caption" color="text.secondary">{c.mensagem}</Typography></Box>))}
        </DialogContent>
        <DialogActions><Button onClick={() => setHist(null)}>Fechar</Button></DialogActions>
      </Dialog>
    </Cartao>
  );
}

function Cobranca({ empresaId }: { empresaId: string }) {
  const { pode } = useContabil();
  const { data: reg } = useApi<any>(`${C}/cobranca/regua`);
  const { data: h, loading, err, reload } = useApi<any>(`${C}/cobrancas?empresaId=${empresaId}&pageSize=50`, [empresaId]);
  const { data: venc } = useApi<any>(`${C}/titulos?empresaId=${empresaId}&tipo=RECEBER&status=VENCIDO&pageSize=100`, [empresaId]);
  const { rodar, aviso, ocupado } = useAcao();
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Cartao titulo="Régua de cobrança" acao={pode("financeiro.escrever") ? <Button variant="contained" disabled={ocupado} onClick={() => void rodar(() => api.post(`${C}/cobranca/executar-regua`, { empresaId }), (r: any) => `Régua executada: ${r.enviados} mensagem(ns) registrada(s) (SIMULADAS).`).then(reload)}>Executar régua agora</Button> : undefined}>
        <Alert severity="warning" sx={{ mb: 1.5 }}>{reg?.aviso ?? "Envio simulado: nada é enviado de verdade."}</Alert>
        {aviso}
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>{(reg?.etapas ?? []).map((e: any) => <Chip key={e.etapa} variant="outlined" label={`${e.etapa} · ${e.canal === "EMAIL" ? "e-mail" : "WhatsApp"}`} title={e.nome} />)}</Box>
        {venc?.items?.length ? <Alert severity="error" sx={{ mt: 1.5 }}>{venc.total} conta(s) a receber vencida(s), total {brl(venc.somaValor)}.</Alert> : <Typography sx={{ mt: 1.5 }} color="text.secondary">Nenhuma conta a receber vencida.</Typography>}
      </Cartao>
      <Cartao titulo="Mensagens registradas">
        <Estado loading={loading} err={err} onRetry={reload} vazio={!!h && !h.items.length} textoVazio="Nenhuma cobrança registrada ainda.">
          {h ? <TableContainer sx={tabelaSx}><Table size="small"><TableHead><TableRow><TableCell>Quando</TableCell><TableCell>Etapa</TableCell><TableCell>Canal</TableCell><TableCell>Mensagem</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
            <TableBody>{h.items.map((c: any) => <TableRow key={c.id} hover><TableCell>{dataHora(c.createdAt)}</TableCell><TableCell>{c.etapa}</TableCell><TableCell>{c.canal}</TableCell><TableCell sx={{ maxWidth: 420 }}>{c.mensagem}</TableCell><TableCell><Situacao v={c.status} /></TableCell></TableRow>)}</TableBody></Table></TableContainer> : null}
        </Estado>
      </Cartao>
    </Box>
  );
}

export default function TitulosTab() {
  const [sub, setSub] = useState(0);
  const { empresaId } = useContabil();
  const { data: dr } = useApi<any>(empresaId ? `${C}/titulos?empresaId=${empresaId}&tipo=RECEBER&status=ABERTO&pageSize=1` : null, [empresaId]);
  const { data: dp } = useApi<any>(empresaId ? `${C}/titulos?empresaId=${empresaId}&tipo=PAGAR&status=ABERTO&pageSize=1` : null, [empresaId]);
  return (
    <ExigeEmpresa>
      {(id) => (
        <Box sx={{ display: "grid", gap: 1.5 }}>
          <Grade min={200}><Indicador rotulo="A receber (a vencer)" valor={brl(dr?.somaValor)} cor="#0288d1" /><Indicador rotulo="A pagar (a vencer)" valor={brl(dp?.somaValor)} cor="#9c27b0" /></Grade>
          <Tabs value={sub} onChange={(_, v) => setSub(v)} variant="scrollable" scrollButtons="auto"><Tab label="A receber" /><Tab label="A pagar" /><Tab label="Cobrança" /></Tabs>
          {sub === 0 ? <Lista empresaId={id} tipo="RECEBER" /> : sub === 1 ? <Lista empresaId={id} tipo="PAGAR" /> : <Cobranca empresaId={id} />}
        </Box>
      )}
    </ExigeEmpresa>
  );
}
