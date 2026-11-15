import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { useState } from "react";
import { C, Cartao, Estado, ExigeEmpresa, Grade, Indicador, Situacao, api, brl, data, tabelaSx, useAcao, useApi, useContabil } from "./kit";

const CONTAS_AJUSTE = [["5.2.1.01", "Despesas financeiras (tarifas, juros)"], ["5.2.2.01", "Receitas financeiras (rendimentos)"], ["5.1.2.01", "Despesas administrativas"], ["5.1.5.01", "Tributos e taxas"], ["3.1.2.01", "Receita de serviços"], ["2.3.1.01", "Capital social (aporte)"]];

function Importar({ conta, onClose, onFeito }: { conta: any; onClose: () => void; onFeito: () => void }) {
  const [formato, setFormato] = useState("OFX");
  const [txt, setTxt] = useState("");
  const { rodar, aviso, ocupado } = useAcao();
  const arquivo = (f?: File | null) => { if (!f) return; setFormato(/\.csv$/i.test(f.name) ? "CSV" : "OFX"); if (f.size > 2_400_000) return; f.text().then(setTxt); };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Importar extrato — {conta.apelido}</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>Importação <strong>local</strong> de arquivo OFX ou CSV (colunas data, descrição, valor; separador ; ou ,). O sistema não acessa o banco. Linhas repetidas são ignoradas.</Alert>
        {aviso}
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 1.5, alignItems: "center" }}>
          <Button component="label" variant="outlined">Escolher arquivo<input hidden type="file" accept=".ofx,.csv,.txt" onChange={(e) => arquivo(e.target.files?.[0])} /></Button>
          <TextField select size="small" label="Formato" value={formato} onChange={(e) => setFormato(e.target.value)} sx={{ minWidth: 120 }}><MenuItem value="OFX">OFX</MenuItem><MenuItem value="CSV">CSV</MenuItem></TextField>
        </Box>
        <TextField fullWidth multiline minRows={6} maxRows={12} label="…ou cole o conteúdo" value={txt} onChange={(e) => setTxt(e.target.value)} slotProps={{ htmlInput: { style: { fontFamily: "monospace", fontSize: 12 } } }} />
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={txt.length < 10 || ocupado} onClick={async () => { const r = await rodar(() => api.post(`${C}/contas-bancarias/${conta.id}/importar`, { formato, conteudo: txt }), (x: any) => `${x.importadas} linha(s) importada(s), ${x.duplicadas} repetida(s), ${x.invalidas} inválida(s).`); if (r) { onFeito(); onClose(); } }}>Importar</Button></DialogActions>
    </Dialog>
  );
}

function Painel({ empresaId }: { empresaId: string }) {
  const { pode } = useContabil();
  const [st, setSt] = useState("PENDENTE");
  const [contaSel, setContaSel] = useState("");
  const { data: bancos, reload: recBancos } = useApi<any>(`${C}/contas-bancarias?empresaId=${empresaId}`, [empresaId]);
  const { data: d, loading, err, reload } = useApi<any>(`${C}/extrato?empresaId=${empresaId}&pageSize=100${st ? `&status=${st}` : ""}${contaSel ? `&contaBancariaId=${contaSel}` : ""}`, [empresaId, st, contaSel]);
  const [imp, setImp] = useState<any | null>(null);
  const [novaConta, setNovaConta] = useState<any | null>(null);
  const [ajuste, setAjuste] = useState<any | null>(null);
  const { rodar, aviso, ocupado } = useAcao();
  const escrever = pode("conciliar");
  const resumo = (s: string) => d?.resumo?.find((r: any) => r.status === s);
  const refresh = () => { reload(); };
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Alert severity="info" icon={false} sx={{ py: 0.25 }}>Conciliação por <strong>arquivo importado</strong> (OFX/CSV). As sugestões comparam valor, data e descrição com contas a pagar/receber em aberto; só você decide o que conciliar.</Alert>
      {aviso}
      <Grade min={160}>
        <Indicador rotulo="Pendentes" valor={resumo("PENDENTE")?.quantidade ?? 0} sub={brl(resumo("PENDENTE")?.soma ?? 0)} cor="#ed6c02" />
        <Indicador rotulo="Conciliadas" valor={resumo("CONCILIADO")?.quantidade ?? 0} sub={brl(resumo("CONCILIADO")?.soma ?? 0)} cor="#2e7d32" />
        <Indicador rotulo="Ajustadas" valor={resumo("AJUSTADO")?.quantidade ?? 0} />
        <Indicador rotulo="Ignoradas" valor={resumo("IGNORADO")?.quantidade ?? 0} />
      </Grade>
      <Cartao titulo="Contas bancárias" acao={escrever ? <Button variant="outlined" onClick={() => setNovaConta({ apelido: "", banco: "" })}>Nova conta</Button> : undefined}>
        {bancos && !bancos.items.length ? <Typography color="text.secondary">Cadastre uma conta bancária para importar o extrato.</Typography> : null}
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>{(bancos?.items ?? []).map((b: any) => (
          <Box key={b.id} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Chip label={b.apelido} color={contaSel === b.id ? "primary" : "default"} onClick={() => setContaSel(contaSel === b.id ? "" : b.id)} />
            {escrever ? <Button size="small" onClick={() => setImp(b)}>Importar extrato</Button> : null}
          </Box>
        ))}</Box>
      </Cartao>
      <Cartao titulo="Extrato" acao={<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <TextField select size="small" label="Situação" value={st} onChange={(e) => setSt(e.target.value)} sx={{ minWidth: 140 }}><MenuItem value="PENDENTE">Pendentes</MenuItem><MenuItem value="CONCILIADO">Conciliadas</MenuItem><MenuItem value="AJUSTADO">Ajustadas</MenuItem><MenuItem value="IGNORADO">Ignoradas</MenuItem><MenuItem value="">Todas</MenuItem></TextField>
        {escrever ? <Button variant="contained" disabled={ocupado} onClick={() => void rodar(() => api.post(`${C}/conciliacao/auto`, { empresaId }), (r: any) => `${r.conciliadas} conciliada(s) automaticamente; ${r.revisar} para revisão.`).then(refresh)}>Conciliar o que é óbvio</Button> : null}
      </Box>}>
        <Estado loading={loading} err={err} onRetry={reload} vazio={!!d && !d.items.length} textoVazio="Nenhuma linha de extrato nesta seleção. Importe um arquivo OFX/CSV.">
          {d ? <TableContainer sx={tabelaSx}><Table size="small"><TableHead><TableRow><TableCell>Data</TableCell><TableCell>Descrição</TableCell><TableCell align="right">Valor</TableCell><TableCell>Situação</TableCell><TableCell>Sugestão</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>{d.items.map((l: any) => {
              const s = l.sugestoes?.[0];
              return (
                <TableRow key={l.id} hover>
                  <TableCell>{data(l.data)}</TableCell><TableCell>{l.descricao}</TableCell><TableCell align="right" sx={{ color: l.valor < 0 ? "error.main" : "success.main", fontWeight: 700 }}>{brl(l.valor)}</TableCell><TableCell><Situacao v={l.status} /></TableCell>
                  <TableCell sx={{ maxWidth: 300 }}>{s ? <><Chip size="small" color={s.score >= 90 ? "success" : "warning"} label={`${s.score}%`} /> <Typography component="span" variant="body2">{s.descricao} — {s.parceiroNome}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{s.motivos.join(" · ")}</Typography></> : l.status === "PENDENTE" ? <Typography variant="caption" color="text.secondary">sem correspondência</Typography> : null}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{escrever && l.status === "PENDENTE" ? <>
                    {s ? <Button size="small" onClick={() => void rodar(() => api.post(`${C}/extrato/${l.id}/conciliar`, { tituloId: s.tituloId }), "Conciliado: título baixado.").then(refresh)}>Conciliar</Button> : null}
                    <Button size="small" onClick={() => setAjuste({ l, contaCodigo: l.valor < 0 ? "5.2.1.01" : "5.2.2.01", historico: "" })}>Ajustar</Button>
                    <Button size="small" color="inherit" onClick={() => void rodar(() => api.post(`${C}/extrato/${l.id}/ignorar`, {}), "Linha ignorada.").then(refresh)}>Ignorar</Button></> : null}
                    {escrever && l.status === "IGNORADO" ? <Button size="small" onClick={() => void rodar(() => api.post(`${C}/extrato/${l.id}/reabrir`, {}), "Linha reaberta.").then(refresh)}>Reabrir</Button> : null}</TableCell>
                </TableRow>
              );
            })}</TableBody></Table></TableContainer> : null}
        </Estado>
      </Cartao>
      {imp ? <Importar conta={imp} onClose={() => setImp(null)} onFeito={refresh} /> : null}
      <Dialog open={!!novaConta} onClose={() => setNovaConta(null)} fullWidth maxWidth="xs">
        <DialogTitle>Nova conta bancária</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: 2 }}><TextField label="Apelido" value={novaConta?.apelido ?? ""} onChange={(e) => setNovaConta({ ...novaConta, apelido: e.target.value })} /><TextField label="Banco" value={novaConta?.banco ?? ""} onChange={(e) => setNovaConta({ ...novaConta, banco: e.target.value })} /></DialogContent>
        <DialogActions><Button onClick={() => setNovaConta(null)}>Cancelar</Button><Button variant="contained" disabled={(novaConta?.apelido ?? "").trim().length < 2} onClick={async () => { if (await rodar(() => api.post(`${C}/contas-bancarias`, { empresaId, apelido: novaConta.apelido, banco: novaConta.banco || null }), "Conta criada.")) { setNovaConta(null); recBancos(); } }}>Salvar</Button></DialogActions>
      </Dialog>
      <Dialog open={!!ajuste} onClose={() => setAjuste(null)} fullWidth maxWidth="sm">
        <DialogTitle>Ajustar linha do extrato</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: 2 }}>
          <Typography variant="body2">{ajuste?.l.descricao} — <strong>{brl(ajuste?.l.valor)}</strong>. Gera um lançamento contábil direto no banco (tarifas, rendimentos, etc.).</Typography>
          <TextField select label="Conta contábil de contrapartida" value={ajuste?.contaCodigo ?? ""} onChange={(e) => setAjuste({ ...ajuste, contaCodigo: e.target.value })}>{CONTAS_AJUSTE.map(([k, v]) => <MenuItem key={k} value={k}>{k} — {v}</MenuItem>)}</TextField>
          <TextField label="Histórico (opcional)" value={ajuste?.historico ?? ""} onChange={(e) => setAjuste({ ...ajuste, historico: e.target.value })} />
        </DialogContent>
        <DialogActions><Button onClick={() => setAjuste(null)}>Cancelar</Button><Button variant="contained" disabled={ocupado} onClick={async () => { if (await rodar(() => api.post(`${C}/extrato/${ajuste.l.id}/ajustar`, { contaCodigo: ajuste.contaCodigo, historico: ajuste.historico || undefined }), "Ajuste lançado.")) { setAjuste(null); refresh(); } }}>Lançar ajuste</Button></DialogActions>
      </Dialog>
    </Box>
  );
}

export default function ConciliacaoTab() {
  return <ExigeEmpresa>{(id) => <Painel key={id} empresaId={id} />}</ExigeEmpresa>;
}
