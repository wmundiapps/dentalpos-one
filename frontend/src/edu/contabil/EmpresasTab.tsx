import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { C, Cartao, Estado, REGIMES, api, fmtDoc, numero, tabelaSx, useAcao, useApi, useContabil } from "./kit";

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const ATIVIDADES: Record<string, string> = { COMERCIO: "Comércio (Anexo I)", INDUSTRIA: "Indústria (Anexo II)", SERVICOS: "Serviços em geral (Anexo III)", SERVICOS_FATOR_R: "Serviços com fator R (III ou V)", SERVICOS_ANEXO_IV: "Serviços do Anexo IV", SERVICOS_HOSPITALAR: "Serviços hospitalares", TRANSPORTE_CARGAS: "Transporte de cargas" };
const vazio = { tipoPessoa: "PJ", documento: "", razaoSocial: "", nomeFantasia: "", regimeAtual: "SIMPLES", cnae: "", cnaeDescricao: "", atividade: "", uf: "", municipio: "", issAliquota: "", email: "", telefone: "", ativo: true };

function Formulario({ aberto, inicial, onClose, onSalvo }: { aberto: boolean; inicial: any | null; onClose: () => void; onSalvo: () => void }) {
  const [f, setF] = useState<any>(inicial ?? vazio);
  const { rodar, aviso, ocupado } = useAcao();
  const set = (k: string) => (e: any) => setF((x: any) => ({ ...x, [k]: e.target.value }));
  const salvar = async () => {
    const corpo: any = {
      tipoPessoa: f.tipoPessoa, documento: f.documento, razaoSocial: f.razaoSocial, nomeFantasia: f.nomeFantasia || null, regimeAtual: f.regimeAtual, cnae: f.cnae || null, cnaeDescricao: f.cnaeDescricao || null,
      atividade: f.atividade || null, uf: f.uf || null, municipio: f.municipio || null, issAliquota: f.issAliquota === "" || f.issAliquota == null ? null : numero(String(f.issAliquota)), email: f.email || null, telefone: f.telefone || null, ativo: f.ativo,
    };
    const r = await rodar(() => (inicial ? api.patch(`${C}/empresas/${inicial.id}`, corpo) : api.post(`${C}/empresas`, corpo)), "Empresa salva.");
    if (r) { onSalvo(); onClose(); }
  };
  return (
    <Dialog open={aberto} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{inicial ? "Editar empresa" : "Nova empresa / cliente"}</DialogTitle>
      <DialogContent>
        {aviso}
        <Box sx={{ display: "grid", gap: 2, mt: 1, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
          <TextField select label="Tipo de pessoa" value={f.tipoPessoa} onChange={set("tipoPessoa")}><MenuItem value="PJ">Pessoa jurídica (CNPJ)</MenuItem><MenuItem value="PF">Pessoa física (CPF — carnê-leão)</MenuItem></TextField>
          <TextField label={f.tipoPessoa === "PJ" ? "CNPJ" : "CPF"} value={f.documento} onChange={set("documento")} disabled={!!inicial} helperText={inicial ? "O documento não pode ser alterado." : "Somente números; os dígitos verificadores são conferidos."} slotProps={{ htmlInput: { inputMode: "numeric" } }} />
          <TextField label="Razão social / nome" value={f.razaoSocial} onChange={set("razaoSocial")} sx={{ gridColumn: { sm: "1 / -1" } }} required />
          <TextField label="Nome fantasia" value={f.nomeFantasia ?? ""} onChange={set("nomeFantasia")} />
          <TextField select label="Regime atual" value={f.regimeAtual} onChange={set("regimeAtual")}>{Object.entries(REGIMES).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}</TextField>
          <TextField label="CNAE principal (7 dígitos)" value={f.cnae ?? ""} onChange={set("cnae")} placeholder="6201-5/01" helperText="Define a atividade sugerida (anexo e presunção)." />
          <TextField select label="Atividade para o cálculo" value={f.atividade ?? ""} onChange={set("atividade")} helperText="Vazio = sugerida pelo CNAE; o contador pode corrigir."><MenuItem value="">Sugerida pelo CNAE</MenuItem>{Object.entries(ATIVIDADES).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}</TextField>
          <TextField select label="UF" value={f.uf ?? ""} onChange={set("uf")}><MenuItem value="">—</MenuItem>{UFS.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}</TextField>
          <TextField label="Município" value={f.municipio ?? ""} onChange={set("municipio")} />
          <TextField label="ISS do município (%)" value={f.issAliquota ?? ""} onChange={set("issAliquota")} helperText="Entre 2% e 5% (vazio = 3% de referência)." />
          <TextField label="E-mail" type="email" value={f.email ?? ""} onChange={set("email")} />
          <TextField label="Telefone" value={f.telefone ?? ""} onChange={set("telefone")} />
          {inicial ? <FormControlLabel control={<Switch checked={!!f.ativo} onChange={(e) => setF((x: any) => ({ ...x, ativo: e.target.checked }))} />} label="Empresa ativa" /> : null}
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" onClick={salvar} disabled={ocupado || !f.razaoSocial || !f.documento}>Salvar</Button></DialogActions>
    </Dialog>
  );
}

export default function EmpresasTab() {
  const { pode, recarregarEmpresas } = useContabil();
  const [q, setQ] = useState("");
  const { data: d, loading, err, reload } = useApi<any>(`${C}/empresas?pageSize=200${q ? `&q=${encodeURIComponent(q)}` : ""}`, [q]);
  const [edit, setEdit] = useState<{ aberto: boolean; item: any | null }>({ aberto: false, item: null });
  const [ext, setExt] = useState(false);
  const { data: ents } = useApi<any>(ext ? `${C}/entidades-externas` : null, [ext]);
  const { rodar, aviso } = useAcao();
  const podeEscrever = pode("empresa.escrever");
  const apos = () => { reload(); recarregarEmpresas(); };
  return (
    <Cartao titulo="Empresas e clientes do escritório" acao={podeEscrever ? <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}><Button variant="outlined" onClick={() => setExt(true)}>Importar do sistema</Button><Button variant="contained" onClick={() => setEdit({ aberto: true, item: null })}>Nova empresa</Button></Box> : undefined}>
      {aviso}
      <TextField size="small" label="Buscar por nome ou documento" value={q} onChange={(e) => setQ(e.target.value)} sx={{ mb: 1.5, width: { xs: "100%", sm: 320 } }} />
      <Estado loading={loading} err={err} onRetry={reload} vazio={!!d && !d.items.length} textoVazio="Nenhuma empresa encontrada. Cadastre o primeiro cliente para começar.">
        {d ? (
          <TableContainer sx={tabelaSx}>
            <Table size="small">
              <TableHead><TableRow><TableCell>Empresa</TableCell><TableCell>Documento</TableCell><TableCell>Regime</TableCell><TableCell>CNAE / atividade</TableCell><TableCell>UF / município</TableCell><TableCell>Situação</TableCell>{podeEscrever ? <TableCell /> : null}</TableRow></TableHead>
              <TableBody>{d.items.map((e: any) => (
                <TableRow key={e.id} hover>
                  <TableCell><Typography variant="body2" sx={{ fontWeight: 700 }}>{e.razaoSocial}</Typography>{e.nomeFantasia ? <Typography variant="caption" color="text.secondary">{e.nomeFantasia}</Typography> : null}</TableCell>
                  <TableCell>{fmtDoc(e.documento)}</TableCell><TableCell><Chip size="small" label={REGIMES[e.regimeAtual] ?? e.regimeAtual} /></TableCell>
                  <TableCell>{e.cnae ?? "—"}<Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{ATIVIDADES[e.atividade ?? e.atividadeSugerida?.atividade] ?? "—"}</Typography></TableCell>
                  <TableCell>{[e.uf, e.municipio].filter(Boolean).join(" / ") || "—"}</TableCell>
                  <TableCell><Chip size="small" color={e.ativo ? "success" : "default"} label={e.ativo ? "ativa" : "inativa"} /></TableCell>
                  {podeEscrever ? <TableCell><Button size="small" onClick={() => setEdit({ aberto: true, item: { ...e, issAliquota: e.issAliquota ?? "" } })}>Editar</Button></TableCell> : null}
                </TableRow>
              ))}</TableBody>
            </Table>
          </TableContainer>
        ) : null}
      </Estado>
      {edit.aberto ? <Formulario key={edit.item?.id ?? "novo"} aberto inicial={edit.item} onClose={() => setEdit({ aberto: false, item: null })} onSalvo={apos} /> : null}
      <Dialog open={ext} onClose={() => setExt(false)} fullWidth maxWidth="sm">
        <DialogTitle>Importar entidade do sistema</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Entidades já cadastradas em {ents?.sistema ?? "seu sistema"} que podem virar empresas-cliente (CNPJ e contatos são copiados).</Typography>
          {(ents?.items ?? []).map((e: any) => (
            <Box key={e.id} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, py: 1, borderBottom: 1, borderColor: "divider", flexWrap: "wrap" }}>
              <Box><Typography sx={{ fontWeight: 700 }}>{e.nome}</Typography><Typography variant="caption" color="text.secondary">{fmtDoc(e.documento)}</Typography></Box>
              <Button size="small" variant="outlined" onClick={async () => { const r = await rodar(() => api.post(`${C}/empresas/importar-entidade`, { entidadeId: e.id }), "Empresa importada."); if (r) { setExt(false); apos(); } }}>Importar</Button>
            </Box>
          ))}
          {ents && !ents.items.length ? <Typography color="text.secondary">Nada para importar.</Typography> : null}
        </DialogContent>
        <DialogActions><Button onClick={() => setExt(false)}>Fechar</Button></DialogActions>
      </Dialog>
    </Cartao>
  );
}
