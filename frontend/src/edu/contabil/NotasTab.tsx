import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Switch, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useState } from "react";
import { C, Cartao, Estado, ExigeEmpresa, Situacao, SimulacaoChip, abrirImprimivel, api, brl, data, isoDia, numero, tabelaSx, useAcao, useApi, useContabil } from "./kit";

const TIPOS: Record<string, string> = { NFSE: "NFS-e (serviços)", NFE: "NF-e (produtos)", NFCE: "NFC-e (consumidor)" };

function Emitir({ empresaId, onClose, onFeito }: { empresaId: string; onClose: () => void; onFeito: () => void }) {
  const [f, setF] = useState<any>({ tipo: "NFSE", parceiroNome: "", parceiroDoc: "", descricao: "", gerarTitulo: true, vencimento: isoDia(15) });
  const [itens, setItens] = useState([{ descricao: "", quantidade: "1", valorUnitario: "" }]);
  const { rodar, aviso, ocupado } = useAcao();
  const total = itens.reduce((a, i) => a + (numero(i.quantidade) || 0) * (numero(i.valorUnitario) || 0), 0);
  const ok = f.parceiroNome.trim().length >= 2 && itens.every((i) => i.descricao.trim() && numero(i.quantidade) > 0 && numero(i.valorUnitario) >= 0) && total > 0;
  const emitir = async () => {
    const r = await rodar(() => api.post(`${C}/notas/emitir`, { empresaId, tipo: f.tipo, parceiroNome: f.parceiroNome, parceiroDoc: f.parceiroDoc || null, descricao: f.descricao || null, gerarTitulo: f.gerarTitulo, vencimento: f.gerarTitulo ? f.vencimento : undefined, itens: itens.map((i) => ({ descricao: i.descricao, quantidade: numero(i.quantidade), valorUnitario: numero(i.valorUnitario) })) }), (n: any) => `Nota SIMULADA nº ${n.numero} emitida.`);
    if (r) { onFeito(); onClose(); }
  };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Emitir nota fiscal <SimulacaoChip /></DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>Emissão <strong>simulada</strong>: a nota recebe numeração e protocolo fictícios e <strong>não é transmitida</strong> à SEFAZ nem à prefeitura. Não tem valor fiscal.</Alert>
        {aviso}
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
          <TextField select label="Tipo de nota" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>{Object.entries(TIPOS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}</TextField>
          <TextField label="CNPJ/CPF do cliente (opcional)" value={f.parceiroDoc} onChange={(e) => setF({ ...f, parceiroDoc: e.target.value })} slotProps={{ htmlInput: { inputMode: "numeric" } }} />
          <TextField label="Cliente (nome)" value={f.parceiroNome} onChange={(e) => setF({ ...f, parceiroNome: e.target.value })} required sx={{ gridColumn: { sm: "1 / -1" } }} />
          <TextField label="Descrição geral" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} sx={{ gridColumn: { sm: "1 / -1" } }} />
        </Box>
        <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Itens / serviços</Typography>
        {itens.map((it, i) => (
          <Box key={i} sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr 1fr", sm: "3fr 1fr 1.3fr auto" }, mb: 1, alignItems: "center" }}>
            <TextField size="small" label="Descrição" value={it.descricao} onChange={(e) => setItens(itens.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)))} sx={{ gridColumn: { xs: "1 / -1", sm: "auto" } }} />
            <TextField size="small" label="Qtd." value={it.quantidade} onChange={(e) => setItens(itens.map((x, j) => (j === i ? { ...x, quantidade: e.target.value } : x)))} />
            <TextField size="small" label="Valor unit. (R$)" value={it.valorUnitario} onChange={(e) => setItens(itens.map((x, j) => (j === i ? { ...x, valorUnitario: e.target.value } : x)))} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
            <IconButton aria-label="Remover item" disabled={itens.length === 1} onClick={() => setItens(itens.filter((_, j) => j !== i))}><DeleteIcon /></IconButton>
          </Box>
        ))}
        <Button size="small" onClick={() => setItens([...itens, { descricao: "", quantidade: "1", valorUnitario: "" }])}>+ Adicionar item</Button>
        <Typography sx={{ mt: 1, fontWeight: 800 }}>Total: {brl(total)}</Typography>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", mt: 1 }}>
          <FormControlLabel control={<Switch checked={f.gerarTitulo} onChange={(e) => setF({ ...f, gerarTitulo: e.target.checked })} />} label="Gerar conta a receber vinculada" />
          {f.gerarTitulo ? <TextField size="small" type="date" label="Vencimento" value={f.vencimento} onChange={(e) => setF({ ...f, vencimento: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} /> : null}
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" onClick={emitir} disabled={!ok || ocupado}>Emitir (simulado)</Button></DialogActions>
    </Dialog>
  );
}

function ImportarXml({ empresaId, onClose, onFeito }: { empresaId: string; onClose: () => void; onFeito: () => void }) {
  const [xml, setXml] = useState("");
  const [gerar, setGerar] = useState(true);
  const [venc, setVenc] = useState(isoDia(20));
  const [direcao, setDirecao] = useState("");
  const { rodar, aviso, ocupado } = useAcao();
  const arquivo = (f?: File | null) => { if (!f) return; if (f.size > 1_400_000) { setXml(""); return; } f.text().then(setXml); };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Importar XML de nota fiscal</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>O XML é <strong>lido localmente</strong>: assinatura digital e situação na SEFAZ não são verificadas. Aceita NF-e/NFC-e e NFS-e (layouts comuns). Limite de 1,5 MB.</Alert>
        {aviso}
        <Button component="label" variant="outlined" sx={{ mb: 1.5 }}>Escolher arquivo .xml<input hidden type="file" accept=".xml,text/xml,application/xml" onChange={(e) => arquivo(e.target.files?.[0])} /></Button>
        <TextField fullWidth multiline minRows={6} maxRows={12} label="…ou cole o conteúdo do XML" value={xml} onChange={(e) => setXml(e.target.value)} slotProps={{ htmlInput: { style: { fontFamily: "monospace", fontSize: 12 } } }} />
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", mt: 1.5 }}>
          <TextField select size="small" label="Direção" value={direcao} onChange={(e) => setDirecao(e.target.value)} sx={{ minWidth: 220 }} helperText="Vazio = detectar pelo CNPJ"><MenuItem value="">Detectar automaticamente</MenuItem><MenuItem value="ENTRADA">Entrada (compra)</MenuItem><MenuItem value="SAIDA">Saída (venda)</MenuItem></TextField>
          <FormControlLabel control={<Switch checked={gerar} onChange={(e) => setGerar(e.target.checked)} />} label="Gerar conta a pagar/receber" />
          {gerar ? <TextField size="small" type="date" label="Vencimento" value={venc} onChange={(e) => setVenc(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} /> : null}
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={xml.length < 50 || ocupado} onClick={async () => { const r = await rodar(() => api.post(`${C}/notas/importar-xml`, { empresaId, xml, gerarTitulo: gerar, vencimento: gerar ? venc : undefined, direcao: direcao || undefined }), (n: any) => `Nota ${n.direcao === "ENTRADA" ? "de entrada" : "de saída"} importada (${brl(n.valorTotal)}).`); if (r) { onFeito(); onClose(); } }}>Importar</Button></DialogActions>
    </Dialog>
  );
}

function Cancelar({ nota, onClose, onFeito }: { nota: any; onClose: () => void; onFeito: () => void }) {
  const [motivo, setMotivo] = useState("");
  const { rodar, aviso, ocupado } = useAcao();
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Cancelar nota nº {nota.numero}</DialogTitle>
      <DialogContent>{aviso}<Typography variant="body2" sx={{ mb: 1.5 }}>Cancela a nota simulada e, se houver, a conta a receber em aberto vinculada. A ação fica registrada na auditoria.</Typography><TextField fullWidth multiline minRows={2} label="Motivo (mínimo 15 caracteres)" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></DialogContent>
      <DialogActions><Button onClick={onClose}>Voltar</Button><Button color="error" variant="contained" disabled={motivo.trim().length < 15 || ocupado} onClick={async () => { if (await rodar(() => api.post(`${C}/notas/${nota.id}/cancelar`, { motivo }), "Nota cancelada.")) { onFeito(); onClose(); } }}>Cancelar nota</Button></DialogActions>
    </Dialog>
  );
}

function Notas({ empresaId }: { empresaId: string }) {
  const { pode } = useContabil();
  const [dir, setDir] = useState("");
  const [st, setSt] = useState("");
  const { data: d, loading, err, reload } = useApi<any>(`${C}/notas?empresaId=${empresaId}&pageSize=100${dir ? `&direcao=${dir}` : ""}${st ? `&status=${st}` : ""}`, [empresaId, dir, st]);
  const [modal, setModal] = useState<null | "emitir" | "xml" | { cancelar: any }>(null);
  const { rodar, aviso } = useAcao();
  return (
    <Cartao titulo="Notas fiscais" acao={pode("nota.emitir") ? <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}><Button variant="outlined" onClick={() => setModal("xml")}>Importar XML</Button><Button variant="contained" onClick={() => setModal("emitir")}>Emitir nota (simulada)</Button></Box> : undefined}>
      {aviso}
      <Box sx={{ display: "flex", gap: 1.5, mb: 1.5, flexWrap: "wrap" }}>
        <TextField select size="small" label="Direção" value={dir} onChange={(e) => setDir(e.target.value)} sx={{ minWidth: 150 }}><MenuItem value="">Todas</MenuItem><MenuItem value="SAIDA">Saída</MenuItem><MenuItem value="ENTRADA">Entrada</MenuItem></TextField>
        <TextField select size="small" label="Situação" value={st} onChange={(e) => setSt(e.target.value)} sx={{ minWidth: 150 }}><MenuItem value="">Todas</MenuItem><MenuItem value="EMITIDA">Emitida</MenuItem><MenuItem value="IMPORTADA">Importada</MenuItem><MenuItem value="CANCELADA">Cancelada</MenuItem></TextField>
      </Box>
      <Estado loading={loading} err={err} onRetry={reload} vazio={!!d && !d.items.length} textoVazio="Nenhuma nota registrada para esta empresa.">
        {d ? (
          <TableContainer sx={tabelaSx}>
            <Table size="small"><TableHead><TableRow><TableCell>Nº</TableCell><TableCell>Tipo</TableCell><TableCell>Direção</TableCell><TableCell>Emissão</TableCell><TableCell>Cliente / fornecedor</TableCell><TableCell align="right">Valor</TableCell><TableCell>Situação</TableCell><TableCell>Vínculo</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>{d.items.map((n: any) => (
                <TableRow key={n.id} hover>
                  <TableCell>{n.numero ?? "—"}</TableCell><TableCell>{n.tipo}</TableCell><TableCell>{n.direcao === "SAIDA" ? "Saída" : "Entrada"}</TableCell><TableCell>{data(n.emitidaEm)}</TableCell><TableCell>{n.parceiroNome}</TableCell>
                  <TableCell align="right">{brl(n.valorTotal)}</TableCell>
                  <TableCell><Situacao v={n.status} /> {n.simulacao ? <SimulacaoChip texto="simulada" /> : null}</TableCell>
                  <TableCell>{n.tituloId ? <Chip size="small" variant="outlined" label={n.direcao === "SAIDA" ? "a receber" : "a pagar"} /> : "—"}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    <Button size="small" onClick={() => void rodar(() => abrirImprimivel(`/notas/${n.id}/espelho`))}>Espelho</Button>
                    {pode("nota.cancelar") && n.direcao === "SAIDA" && n.status === "EMITIDA" ? <Button size="small" color="error" onClick={() => setModal({ cancelar: n })}>Cancelar</Button> : null}
                  </TableCell>
                </TableRow>
              ))}</TableBody></Table>
          </TableContainer>
        ) : null}
        {d ? <Typography variant="caption" color="text.secondary">Soma das notas não canceladas: {brl(d.somaValor)}</Typography> : null}
      </Estado>
      {modal === "emitir" ? <Emitir empresaId={empresaId} onClose={() => setModal(null)} onFeito={reload} /> : null}
      {modal === "xml" ? <ImportarXml empresaId={empresaId} onClose={() => setModal(null)} onFeito={reload} /> : null}
      {modal && typeof modal === "object" ? <Cancelar nota={modal.cancelar} onClose={() => setModal(null)} onFeito={reload} /> : null}
    </Cartao>
  );
}

function Recibos({ empresaId }: { empresaId: string }) {
  const { pode } = useContabil();
  const { data: d, loading, err, reload } = useApi<any>(`${C}/recibos?empresaId=${empresaId}&pageSize=100`, [empresaId]);
  const [novo, setNovo] = useState<any | null>(null);
  const { rodar, aviso, ocupado } = useAcao();
  const salvar = async () => {
    const r = await rodar(() => api.post(`${C}/recibos`, { empresaId, tipo: novo.tipo, pessoaNome: novo.pessoaNome, pessoaDoc: novo.pessoaDoc || null, valor: numero(novo.valor), referente: novo.referente, formaPagamento: novo.formaPagamento || null }), (x: any) => `Recibo nº ${x.numero} emitido.`);
    if (r) { setNovo(null); reload(); }
  };
  return (
    <Cartao titulo="Recibos" acao={pode("nota.emitir") ? <Button variant="contained" onClick={() => setNovo({ tipo: "RECEBIMENTO", pessoaNome: "", pessoaDoc: "", valor: "", referente: "", formaPagamento: "PIX" })}>Emitir recibo</Button> : undefined}>
      {aviso}
      <Estado loading={loading} err={err} onRetry={reload} vazio={!!d && !d.items.length} textoVazio="Nenhum recibo emitido.">
        {d ? (
          <TableContainer sx={tabelaSx}>
            <Table size="small"><TableHead><TableRow><TableCell>Nº</TableCell><TableCell>Tipo</TableCell><TableCell>Data</TableCell><TableCell>Pessoa</TableCell><TableCell>Referente a</TableCell><TableCell align="right">Valor</TableCell><TableCell>Situação</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>{d.items.map((r: any) => (
                <TableRow key={r.id} hover><TableCell>{r.numero}</TableCell><TableCell>{r.tipo === "RECEBIMENTO" ? "Recebimento" : "Pagamento"}</TableCell><TableCell>{data(r.data)}</TableCell><TableCell>{r.pessoaNome}</TableCell><TableCell>{r.referente}</TableCell><TableCell align="right">{brl(r.valor)}</TableCell><TableCell><Situacao v={r.status} /></TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}><Button size="small" onClick={() => void rodar(() => abrirImprimivel(`/recibos/${r.id}/imprimir`))}>Imprimir</Button>
                    {pode("nota.cancelar") && r.status === "EMITIDO" ? <Button size="small" color="error" onClick={async () => { const m = window.prompt("Motivo do cancelamento (mínimo 10 caracteres):"); if (m && m.trim().length >= 10 && (await rodar(() => api.post(`${C}/recibos/${r.id}/cancelar`, { motivo: m }), "Recibo cancelado."))) reload(); }}>Cancelar</Button> : null}</TableCell></TableRow>
              ))}</TableBody></Table>
          </TableContainer>
        ) : null}
      </Estado>
      <Dialog open={!!novo} onClose={() => setNovo(null)} fullWidth maxWidth="sm">
        <DialogTitle>Novo recibo</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: 2 }}>
          <TextField select label="Tipo" value={novo?.tipo ?? "RECEBIMENTO"} onChange={(e) => setNovo({ ...novo, tipo: e.target.value })}><MenuItem value="RECEBIMENTO">Recebimento (recebi de…)</MenuItem><MenuItem value="PAGAMENTO">Pagamento (paguei a…)</MenuItem></TextField>
          <TextField label="Nome da pessoa/empresa" value={novo?.pessoaNome ?? ""} onChange={(e) => setNovo({ ...novo, pessoaNome: e.target.value })} required />
          <TextField label="CPF/CNPJ (opcional)" value={novo?.pessoaDoc ?? ""} onChange={(e) => setNovo({ ...novo, pessoaDoc: e.target.value })} />
          <TextField label="Valor (R$)" value={novo?.valor ?? ""} onChange={(e) => setNovo({ ...novo, valor: e.target.value })} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
          <TextField label="Referente a" value={novo?.referente ?? ""} onChange={(e) => setNovo({ ...novo, referente: e.target.value })} />
          <TextField label="Forma de pagamento" value={novo?.formaPagamento ?? ""} onChange={(e) => setNovo({ ...novo, formaPagamento: e.target.value })} />
        </DialogContent>
        <DialogActions><Button onClick={() => setNovo(null)}>Cancelar</Button><Button variant="contained" disabled={ocupado || !(numero(novo?.valor ?? "") > 0) || (novo?.pessoaNome ?? "").trim().length < 2 || (novo?.referente ?? "").trim().length < 3} onClick={salvar}>Emitir</Button></DialogActions>
      </Dialog>
    </Cartao>
  );
}

export default function NotasTab() {
  const [sub, setSub] = useState(0);
  return (
    <ExigeEmpresa>
      {(id) => (
        <Box>
          <Tabs value={sub} onChange={(_, v) => setSub(v)} sx={{ mb: 1.5 }}><Tab label="Notas fiscais" /><Tab label="Recibos" /></Tabs>
          {sub === 0 ? <Notas empresaId={id} /> : <Recibos empresaId={id} />}
        </Box>
      )}
    </ExigeEmpresa>
  );
}
