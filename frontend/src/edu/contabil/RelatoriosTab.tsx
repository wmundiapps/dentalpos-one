import { Alert, Box, Button, MenuItem, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { C, Cartao, Estado, ExigeEmpresa, abrirImprimivel, baixarCsv, brl, comp, isoDia, pct, tabelaSx, useAcao, useApi } from "./kit";

function Periodo({ de, ate, setDe, setAte }: { de: string; ate: string; setDe: (v: string) => void; setAte: (v: string) => void }) {
  const atalho = (rotulo: string, d: string, a: string) => <Button size="small" variant="outlined" onClick={() => { setDe(d); setAte(a); }}>{rotulo}</Button>;
  const ano = new Date().getUTCFullYear();
  return (
    <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
      <TextField size="small" type="date" label="De" value={de} onChange={(e) => setDe(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
      <TextField size="small" type="date" label="Até" value={ate} onChange={(e) => setAte(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
      {atalho("Este mês", `${comp(0)}-01`, isoDia())}{atalho("Este ano", `${ano}-01-01`, isoDia())}{atalho("Últimos 12 meses", `${comp(-11)}-01`, isoDia())}
    </Box>
  );
}

function Dre({ empresaId }: { empresaId: string }) {
  const [de, setDe] = useState(`${comp(-5)}-01`);
  const [ate, setAte] = useState(isoDia());
  const [modo, setModo] = useState("mensal");
  const [cmp, setCmp] = useState("");
  const q = `empresaId=${empresaId}&de=${de}&ate=${ate}&modo=${modo}${cmp && modo === "periodo" ? `&comparar=${cmp}` : ""}`;
  const { data: d, loading, err, reload } = useApi<any>(`${C}/dre?${q}`, [q]);
  const { rodar, aviso } = useAcao();
  const fmt = (l: any, v: number) => (l.tipo === "percentual" ? pct(v) : brl(v));
  return (
    <Cartao titulo="DRE — Demonstração do Resultado" acao={<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}><Button variant="outlined" onClick={() => void rodar(() => abrirImprimivel(`/dre?${q}&formato=html`))}>Imprimir</Button><Button variant="outlined" onClick={() => void rodar(() => baixarCsv(`/dre?${q}&formato=csv`, `dre-${de}-${ate}.csv`))}>Exportar CSV</Button></Box>}>
      {aviso}
      <Box sx={{ display: "grid", gap: 1.5, mb: 1.5 }}>
        <Periodo de={de} ate={ate} setDe={setDe} setAte={setAte} />
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
          <TextField select size="small" label="Visão" value={modo} onChange={(e) => setModo(e.target.value)} sx={{ minWidth: 170 }}><MenuItem value="mensal">Mensal (colunas por mês)</MenuItem><MenuItem value="periodo">Período total</MenuItem></TextField>
          {modo === "periodo" ? <TextField select size="small" label="Comparar com" value={cmp} onChange={(e) => setCmp(e.target.value)} sx={{ minWidth: 200 }}><MenuItem value="">Sem comparação</MenuItem><MenuItem value="anterior">Período anterior</MenuItem><MenuItem value="ano">Mesmo período do ano anterior</MenuItem></TextField> : null}
        </Box>
      </Box>
      <Estado loading={loading} err={err} onRetry={reload}>
        {d ? (
          <TableContainer sx={tabelaSx}>
            <Table size="small">
              <TableHead><TableRow><TableCell>Demonstração</TableCell>{d.colunas.map((c: string) => <TableCell key={c} align="right">{c}</TableCell>)}{d.comparativo ? <><TableCell align="right">{d.comparativo.rotulo}</TableCell><TableCell align="right">Variação</TableCell></> : null}</TableRow></TableHead>
              <TableBody>{d.linhas.map((l: any, i: number) => {
                const forte = l.tipo === "subtotal" || l.tipo === "total";
                const v = d.comparativo?.variacao[i]?.percentual[0];
                return (
                  <TableRow key={l.chave} hover sx={{ bgcolor: forte ? "action.hover" : undefined }}>
                    <TableCell sx={{ pl: 1 + l.nivel * 2, fontWeight: forte ? 800 : 400, color: l.nivel === 2 ? "text.secondary" : undefined, minWidth: 240 }}>{l.nome}</TableCell>
                    {l.valores.map((x: number, k: number) => <TableCell key={k} align="right" sx={{ fontWeight: forte ? 800 : 400, color: x < 0 && l.tipo !== "percentual" ? "error.main" : undefined, whiteSpace: "nowrap" }}>{fmt(l, x)}</TableCell>)}
                    {d.comparativo ? <><TableCell align="right">{fmt(l, d.comparativo.linhas[i].valores[0])}</TableCell><TableCell align="right" sx={{ color: v == null ? undefined : v >= 0 ? "success.main" : "error.main" }}>{v == null ? "—" : `${v > 0 ? "+" : ""}${pct(v, 1)}`}</TableCell></> : null}
                  </TableRow>
                );
              })}</TableBody>
            </Table>
          </TableContainer>
        ) : null}
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>DRE gerada a partir dos lançamentos contábeis do período (regime de competência). Não é demonstração oficial: valide com o contador responsável.</Typography>
      </Estado>
    </Cartao>
  );
}

function Balancete({ empresaId }: { empresaId: string }) {
  const [de, setDe] = useState(`${comp(0)}-01`);
  const [ate, setAte] = useState(isoDia());
  const [todas, setTodas] = useState(false);
  const q = `empresaId=${empresaId}&de=${de}&ate=${ate}${todas ? "&todas=true" : ""}`;
  const { data: d, loading, err, reload } = useApi<any>(`${C}/balancete?${q}`, [q]);
  const { rodar, aviso } = useAcao();
  return (
    <Cartao titulo="Balancete de verificação" acao={<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}><Button variant="outlined" onClick={() => void rodar(() => abrirImprimivel(`/balancete?${q}&formato=html`))}>Imprimir</Button><Button variant="outlined" onClick={() => void rodar(() => baixarCsv(`/balancete?${q}&formato=csv`, `balancete-${de}-${ate}.csv`))}>Exportar CSV</Button></Box>}>
      {aviso}
      <Box sx={{ display: "flex", gap: 1.5, mb: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <Periodo de={de} ate={ate} setDe={setDe} setAte={setAte} />
        <Button size="small" onClick={() => setTodas(!todas)}>{todas ? "Só contas com movimento" : "Mostrar todas as contas"}</Button>
      </Box>
      <Estado loading={loading} err={err} onRetry={reload} vazio={!!d && !d.linhas.length} textoVazio="Sem movimento no período.">
        {d ? (
          <>
            <Alert severity={d.totais.equilibrado ? "success" : "error"} sx={{ mb: 1.5 }}>Débitos do período {brl(d.totais.debitos)} · créditos {brl(d.totais.creditos)} — {d.totais.equilibrado ? "balancete equilibrado." : "NÃO equilibrado: há lançamentos inconsistentes."}</Alert>
            <TableContainer sx={{ ...tabelaSx, maxHeight: 560 }}>
              <Table size="small" stickyHeader><TableHead><TableRow><TableCell>Código</TableCell><TableCell>Conta</TableCell><TableCell align="right">Saldo anterior</TableCell><TableCell align="right">Débitos</TableCell><TableCell align="right">Créditos</TableCell><TableCell align="right">Saldo atual</TableCell></TableRow></TableHead>
                <TableBody>{d.linhas.map((l: any) => <TableRow key={l.codigo} hover sx={{ bgcolor: l.analitica ? undefined : "action.hover" }}><TableCell sx={{ fontFamily: "monospace" }}>{l.codigo}</TableCell><TableCell sx={{ fontWeight: l.analitica ? 400 : 800, pl: 1 + (l.nivel - 1) * 1.5 }}>{l.nome}</TableCell><TableCell align="right">{brl(l.saldoAnterior)}</TableCell><TableCell align="right">{brl(l.debitos)}</TableCell><TableCell align="right">{brl(l.creditos)}</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>{brl(l.saldoAtual)} <Typography component="span" variant="caption" color="text.secondary">{l.natureza}</Typography></TableCell></TableRow>)}</TableBody></Table>
            </TableContainer>
            <Typography variant="caption" color="text.secondary">Contas de resultado acumulam desde janeiro do ano do período.</Typography>
          </>
        ) : null}
      </Estado>
    </Cartao>
  );
}

export default function RelatoriosTab() {
  const [sub, setSub] = useState(0);
  return (
    <ExigeEmpresa>
      {(id) => (
        <Box sx={{ display: "grid", gap: 1.5 }}>
          <Tabs value={sub} onChange={(_, v) => setSub(v)}><Tab label="DRE" /><Tab label="Balancete" /></Tabs>
          {sub === 0 ? <Dre empresaId={id} /> : <Balancete empresaId={id} />}
        </Box>
      )}
    </ExigeEmpresa>
  );
}
