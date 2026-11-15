import { Alert, Box, Button, Chip, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { C, Cartao, Estado, NOME_PAPEL, api, dataHora, tabelaSx, useAcao, useApi, useContabil } from "./kit";

export default function AcessoTab() {
  const { eu, pode } = useContabil();
  const [acao, setAcao] = useState("");
  const { data: aud, loading, err, reload } = useApi<any>(pode("auditoria.ler") ? `${C}/auditoria?pageSize=60${acao ? `&acao=${encodeURIComponent(acao)}` : ""}` : null, [acao]);
  const { data: mem, reload: recMem } = useApi<any>(pode("membros.gerir") ? `${C}/membros` : null);
  const [uid, setUid] = useState("");
  const [papel, setPapel] = useState("CONTADOR");
  const { rodar, aviso, ocupado } = useAcao();
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Cartao titulo="Seu acesso">
        <Typography component="div">Papel na Contabilidade: <Chip color="primary" label={NOME_PAPEL[eu?.papel ?? ""] ?? "—"} /></Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Gestor: tudo. Contador: tudo exceto designar papéis. Financeiro: contas, conciliação, notas e recibos e baixa de guias. Leitura: apenas consulta. Alunos e professores não têm acesso.</Typography>
      </Cartao>
      {pode("membros.gerir") ? (
        <Cartao titulo="Designar papéis na Contabilidade">
          {aviso}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Cargos como Administração/Reitoria entram como gestor e Financeiro como financeiro. Para dar acesso de contador (ou leitura) a outra pessoa, informe o ID do usuário e o papel.</Typography>
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 1.5 }}>
            <TextField size="small" label="ID do usuário" value={uid} onChange={(e) => setUid(e.target.value)} sx={{ minWidth: 260 }} />
            <TextField select size="small" label="Papel" value={papel} onChange={(e) => setPapel(e.target.value)} sx={{ minWidth: 160 }}>{["GESTOR", "CONTADOR", "FINANCEIRO", "LEITOR"].map((p) => <MenuItem key={p} value={p}>{NOME_PAPEL[p]}</MenuItem>)}</TextField>
            <Button variant="contained" disabled={ocupado || !uid.trim()} onClick={async () => { if (await rodar(() => api.put(`${C}/membros/${encodeURIComponent(uid.trim())}`, { papel, ativo: true }), "Papel definido.")) { setUid(""); recMem(); } }}>Definir papel</Button>
          </Box>
          <TableContainer sx={tabelaSx}><Table size="small"><TableHead><TableRow><TableCell>Pessoa</TableCell><TableCell>Papel</TableCell><TableCell>Ativo</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>{(mem?.items ?? []).map((m: any) => <TableRow key={m.id}><TableCell>{m.nome}</TableCell><TableCell>{NOME_PAPEL[m.papel] ?? m.papel}</TableCell><TableCell>{m.ativo ? "sim" : "não"}</TableCell><TableCell><Button size="small" color="error" disabled={!m.ativo} onClick={async () => { if (await rodar(() => api.put(`${C}/membros/${m.userId}`, { papel: m.papel, ativo: false }), "Acesso desativado.")) recMem(); }}>Desativar</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer>
        </Cartao>
      ) : null}
      {pode("auditoria.ler") ? (
        <Cartao titulo="Auditoria de ações sensíveis" acao={<TextField select size="small" label="Filtrar" value={acao} onChange={(e) => setAcao(e.target.value)} sx={{ minWidth: 180 }}><MenuItem value="">Tudo</MenuItem><MenuItem value="nota.">Notas</MenuItem><MenuItem value="guia.">Guias</MenuItem><MenuItem value="extrato.">Conciliação</MenuItem><MenuItem value="lancamento.">Lançamentos</MenuItem><MenuItem value="regime.">Regime</MenuItem><MenuItem value="titulo.">Títulos</MenuItem></TextField>}>
          <Estado loading={loading} err={err} onRetry={reload} vazio={!!aud && !aud.items.length} textoVazio="Nenhum registro.">
            {aud ? <TableContainer sx={tabelaSx}><Table size="small"><TableHead><TableRow><TableCell>Quando</TableCell><TableCell>Quem</TableCell><TableCell>Ação</TableCell><TableCell>Detalhes</TableCell></TableRow></TableHead>
              <TableBody>{aud.items.map((a: any) => <TableRow key={a.id} hover><TableCell sx={{ whiteSpace: "nowrap" }}>{dataHora(a.createdAt)}</TableCell><TableCell>{a.usuario ?? "—"} <Typography component="span" variant="caption" color="text.secondary">{NOME_PAPEL[a.papel] ?? a.papel}</Typography></TableCell><TableCell>{a.acao}</TableCell><TableCell sx={{ maxWidth: 380, fontSize: 12, wordBreak: "break-word" }}>{a.detalhes ? JSON.stringify(a.detalhes).slice(0, 180) : "—"}</TableCell></TableRow>)}</TableBody></Table></TableContainer> : null}
          </Estado>
        </Cartao>
      ) : <Alert severity="info">A auditoria está disponível para contador e gestor.</Alert>}
    </Box>
  );
}
