import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useState } from "react";
import { C, Cartao, Estado, ExigeEmpresa, api, brl, comp, data, isoDia, numero, tabelaSx, useAcao, useApi, useContabil } from "./kit";

function Plano({ empresaId }: { empresaId: string }) {
  const { pode } = useContabil();
  const { data: d, loading, err, reload } = useApi<any>(`${C}/plano?empresaId=${empresaId}`, [empresaId]);
  const [novo, setNovo] = useState<any | null>(null);
  const { rodar, aviso, ocupado } = useAcao();
  return (
    <Cartao titulo="Plano de contas" acao={pode("contabil.lancar") ? <Button variant="contained" onClick={() => setNovo({ codigo: "", nome: "", tipo: "DESPESA", natureza: "D" })}>Nova conta</Button> : undefined}>
      {aviso}
      <Estado loading={loading} err={err} onRetry={reload} vazio={!!d && !d.items.length}>
        {d ? <TableContainer sx={{ ...tabelaSx, maxHeight: 520 }}><Table size="small" stickyHeader><TableHead><TableRow><TableCell>Código</TableCell><TableCell>Conta</TableCell><TableCell>Tipo</TableCell><TableCell>Natureza</TableCell><TableCell>Nível</TableCell></TableRow></TableHead>
          <TableBody>{d.items.map((c: any) => <TableRow key={c.id} hover sx={{ opacity: c.ativo ? 1 : 0.5 }}><TableCell sx={{ fontFamily: "monospace", pl: 1 + (c.codigo.split(".").length - 1) * 1.5 }}>{c.codigo}</TableCell><TableCell sx={{ fontWeight: c.analitica ? 400 : 800 }}>{c.nome}</TableCell><TableCell>{c.tipo}</TableCell><TableCell>{c.natureza === "D" ? "Devedora" : "Credora"}</TableCell><TableCell>{c.analitica ? <Chip size="small" label="analítica" /> : <Chip size="small" variant="outlined" label="sintética" />}</TableCell></TableRow>)}</TableBody></Table></TableContainer> : null}
      </Estado>
      <Dialog open={!!novo} onClose={() => setNovo(null)} fullWidth maxWidth="xs">
        <DialogTitle>Nova conta</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: 2 }}>
          <TextField label="Código" placeholder="5.1.2.02" value={novo?.codigo ?? ""} onChange={(e) => setNovo({ ...novo, codigo: e.target.value })} helperText="O código do pai (ex.: 5.1.2) precisa existir e ser sintético." />
          <TextField label="Nome" value={novo?.nome ?? ""} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
          <TextField select label="Tipo" value={novo?.tipo ?? "DESPESA"} onChange={(e) => setNovo({ ...novo, tipo: e.target.value })}>{["ATIVO", "PASSIVO", "PL", "RECEITA", "CUSTO", "DESPESA"].map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}</TextField>
          <TextField select label="Natureza do saldo" value={novo?.natureza ?? "D"} onChange={(e) => setNovo({ ...novo, natureza: e.target.value })}><MenuItem value="D">Devedora</MenuItem><MenuItem value="C">Credora</MenuItem></TextField>
        </DialogContent>
        <DialogActions><Button onClick={() => setNovo(null)}>Cancelar</Button><Button variant="contained" disabled={ocupado || !/^\d(\.\d{1,2}){0,3}$/.test(novo?.codigo ?? "") || (novo?.nome ?? "").trim().length < 2} onClick={async () => { if (await rodar(() => api.post(`${C}/plano`, { empresaId, ...novo, analitica: true }), "Conta criada.")) { setNovo(null); reload(); } }}>Salvar</Button></DialogActions>
      </Dialog>
    </Cartao>
  );
}

function Lancamentos({ empresaId }: { empresaId: string }) {
  const { pode } = useContabil();
  const [de, setDe] = useState(`${comp(-2)}-01`);
  const [ate, setAte] = useState(isoDia());
  const { data: d, loading, err, reload } = useApi<any>(`${C}/lancamentos?empresaId=${empresaId}&de=${de}&ate=${ate}&pageSize=100`, [empresaId, de, ate]);
  const { data: plano } = useApi<any>(`${C}/plano?empresaId=${empresaId}`, [empresaId]);
  const [novo, setNovo] = useState<any | null>(null);
  const { rodar, aviso, ocupado } = useAcao();
  const contas = (plano?.items ?? []).filter((c: any) => c.analitica && c.ativo);
  const soma = (t: string) => (novo?.partidas ?? []).filter((p: any) => p.tipo === t).reduce((a: number, p: any) => a + (numero(p.valor) || 0), 0);
  const equilibrado = !!novo && Math.abs(soma("D") - soma("C")) < 0.005 && soma("D") > 0;
  return (
    <Cartao titulo="Lançamentos contábeis (partidas dobradas)" acao={pode("contabil.lancar") ? <Button variant="contained" onClick={() => setNovo({ data: isoDia(), historico: "", partidas: [{ conta: "", tipo: "D", valor: "" }, { conta: "", tipo: "C", valor: "" }] })}>Novo lançamento</Button> : undefined}>
      {aviso}
      <Box sx={{ display: "flex", gap: 1.5, mb: 1.5, flexWrap: "wrap" }}>
        <TextField size="small" type="date" label="De" value={de} onChange={(e) => setDe(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" type="date" label="Até" value={ate} onChange={(e) => setAte(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
      </Box>
      <Estado loading={loading} err={err} onRetry={reload} vazio={!!d && !d.items.length} textoVazio="Nenhum lançamento no período. Contas a pagar/receber geram lançamentos automaticamente.">
        {d ? <TableContainer sx={tabelaSx}><Table size="small"><TableHead><TableRow><TableCell>Nº</TableCell><TableCell>Data</TableCell><TableCell>Histórico</TableCell><TableCell>Partidas</TableCell><TableCell>Origem</TableCell><TableCell /></TableRow></TableHead>
          <TableBody>{d.items.map((l: any) => (
            <TableRow key={l.id} hover sx={{ opacity: l.estornado ? 0.55 : 1 }}>
              <TableCell>{l.numero}</TableCell><TableCell>{data(l.data)}</TableCell><TableCell>{l.historico}{l.estornado ? <Chip size="small" label="estornado" sx={{ ml: 1 }} /> : null}</TableCell>
              <TableCell sx={{ fontSize: 12 }}>{l.partidas.map((p: any, i: number) => <div key={i}><strong>{p.tipo}</strong> {p.conta} · {brl(p.valor)}</div>)}</TableCell>
              <TableCell>{l.origem.toLowerCase()}</TableCell>
              <TableCell>{pode("contabil.lancar") && !l.estornado && l.origem !== "ESTORNO" ? <Button size="small" color="error" onClick={async () => { const m = window.prompt("Motivo do estorno (mínimo 5 caracteres):"); if (m && m.trim().length >= 5 && (await rodar(() => api.post(`${C}/lancamentos/${l.id}/estornar`, { motivo: m }), "Lançamento estornado."))) reload(); }}>Estornar</Button> : null}</TableCell>
            </TableRow>
          ))}</TableBody></Table></TableContainer> : null}
      </Estado>
      <Dialog open={!!novo} onClose={() => setNovo(null)} fullWidth maxWidth="md">
        <DialogTitle>Novo lançamento</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 3fr" }, mt: 1, mb: 2 }}>
            <TextField type="date" label="Data" value={novo?.data ?? ""} onChange={(e) => setNovo({ ...novo, data: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField label="Histórico" value={novo?.historico ?? ""} onChange={(e) => setNovo({ ...novo, historico: e.target.value })} />
          </Box>
          {(novo?.partidas ?? []).map((p: any, i: number) => (
            <Box key={i} sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr 1fr", sm: "90px 3fr 1.2fr auto" }, mb: 1, alignItems: "center" }}>
              <TextField select size="small" label="D/C" value={p.tipo} onChange={(e) => setNovo({ ...novo, partidas: novo.partidas.map((x: any, j: number) => (j === i ? { ...x, tipo: e.target.value } : x)) })}><MenuItem value="D">Débito</MenuItem><MenuItem value="C">Crédito</MenuItem></TextField>
              <TextField select size="small" label="Conta" value={p.conta} onChange={(e) => setNovo({ ...novo, partidas: novo.partidas.map((x: any, j: number) => (j === i ? { ...x, conta: e.target.value } : x)) })} sx={{ gridColumn: { xs: "1 / -1", sm: "auto" } }}>{contas.map((c: any) => <MenuItem key={c.codigo} value={c.codigo}>{c.codigo} — {c.nome}</MenuItem>)}</TextField>
              <TextField size="small" label="Valor (R$)" value={p.valor} onChange={(e) => setNovo({ ...novo, partidas: novo.partidas.map((x: any, j: number) => (j === i ? { ...x, valor: e.target.value } : x)) })} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
              <IconButton aria-label="Remover partida" disabled={novo.partidas.length <= 2} onClick={() => setNovo({ ...novo, partidas: novo.partidas.filter((_: any, j: number) => j !== i) })}><DeleteIcon /></IconButton>
            </Box>
          ))}
          <Button size="small" onClick={() => setNovo({ ...novo, partidas: [...novo.partidas, { conta: "", tipo: "D", valor: "" }] })}>+ Partida</Button>
          <Alert severity={equilibrado ? "success" : "warning"} sx={{ mt: 1.5 }}>Débitos {brl(soma("D"))} · Créditos {brl(soma("C"))} — {equilibrado ? "equilibrado" : "os totais precisam ser iguais"}.</Alert>
        </DialogContent>
        <DialogActions><Button onClick={() => setNovo(null)}>Cancelar</Button><Button variant="contained" disabled={ocupado || !equilibrado || (novo?.historico ?? "").trim().length < 3 || novo.partidas.some((p: any) => !p.conta)} onClick={async () => { if (await rodar(() => api.post(`${C}/lancamentos`, { empresaId, data: novo.data, historico: novo.historico, partidas: novo.partidas.map((p: any) => ({ conta: p.conta, tipo: p.tipo, valor: numero(p.valor) })) }), (l: any) => `Lançamento ${l.numero} gravado.`)) { setNovo(null); reload(); } }}>Gravar</Button></DialogActions>
      </Dialog>
    </Cartao>
  );
}

export default function ContabilidadeTab() {
  const [sub, setSub] = useState(0);
  return (
    <ExigeEmpresa>
      {(id) => (
        <Box sx={{ display: "grid", gap: 1.5 }}>
          <Tabs value={sub} onChange={(_, v) => setSub(v)}><Tab label="Lançamentos" /><Tab label="Plano de contas" /></Tabs>
          {sub === 0 ? <Lancamentos empresaId={id} /> : <Plano empresaId={id} />}
          <Typography variant="caption" color="text.secondary">Contas a pagar/receber, baixas e conciliações geram lançamentos automaticamente. Lançamentos manuais exigem papel de contador ou gestor.</Typography>
        </Box>
      )}
    </ExigeEmpresa>
  );
}
