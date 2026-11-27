import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Paper, Tab, Table, TableBody, TableCell, TableHead,
  TableRow, Tabs, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import SocialPosts, { REDES } from "./SocialPosts";
import { BASE, Section, Stat, StateBox, StatusPill, asList, fmtDate, fmtDateTime, useLoad, type Toast } from "./common";

const COR_REDE: Record<string, string> = { INSTAGRAM: "#c13584", FACEBOOK: "#1877f2", LINKEDIN: "#0a66c2", TIKTOK: "#111", YOUTUBE: "#e00", X: "#444" };

function Calendario() {
  const [ref, setRef] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const de = ref.toISOString(); const ate = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59).toISOString();
  const cal = useLoad<any>(`${BASE}/social/calendario${qsOf({ de, ate })}`);
  const dias = cal.data?.dias || {};
  const ult = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
  const offset = ref.getDay();
  const celulas: Array<number | null> = [...Array(offset).fill(null), ...Array.from({ length: ult }, (_, i) => i + 1)];
  const key = (d: number) => `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return (
    <Section title="Calendário editorial" description="Posts agendados por dia, coloridos por rede."
      actions={<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <IconButton aria-label="Mês anterior" onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() - 1, 1))}><ChevronLeftIcon /></IconButton>
        <Typography sx={{ fontWeight: 800, minWidth: 140, textAlign: "center", textTransform: "capitalize" }}>{ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</Typography>
        <IconButton aria-label="Próximo mês" onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() + 1, 1))}><ChevronRightIcon /></IconButton>
      </Box>}>
      <StateBox loading={cal.loading} error={cal.error} onRetry={cal.reload}>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 0.5 }}>
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => <Typography key={d} variant="caption" sx={{ fontWeight: 800, textAlign: "center" }}>{d}</Typography>)}
          {celulas.map((d, i) => (
            <Box key={i} sx={{ minHeight: { xs: 56, md: 92 }, p: 0.5, borderRadius: 1.5, border: d ? 1 : 0, borderColor: "divider", overflow: "hidden" }}>
              {d ? <>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>{d}</Typography>
                {(dias[key(d)] || []).map((p: any) => (
                  <Tooltip key={p.id} title={`${p.titulo} — ${p.conta} — ${String(p.status).replace(/_/g, " ")}`}>
                    <Box sx={{ mt: 0.3, px: 0.5, borderRadius: 1, bgcolor: COR_REDE[p.rede] || "primary.main", color: "#fff", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: p.status === "PUBLICADO" ? 0.6 : 1 }}>
                      {new Date(p.hora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} {p.titulo}
                    </Box>
                  </Tooltip>
                ))}
              </> : null}
            </Box>
          ))}
        </Box>
        <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap" }}>{REDES.map((r) => <Chip key={r} size="small" label={r} sx={{ bgcolor: COR_REDE[r], color: "#fff" }} />)}</Box>
        {cal.data && !cal.data.total ? <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Nenhum post agendado neste mês.</Typography> : null}
      </StateBox>
    </Section>
  );
}

function Moderacao({ toast }: { toast: (t: Toast) => void }) {
  const [status, setStatus] = useState("PENDENTE");
  const list = useLoad<any>(`${BASE}/social/interacoes${qsOf({ status, pageSize: 30 })}`);
  const rows = asList(list.data);
  async function mod(i: any, acao: string) {
    let resposta: string | undefined;
    if (acao === "RESPONDER") { const r = window.prompt("Resposta:"); if (!r) return; resposta = r; }
    try { await eduApi.post(`${BASE}/social/interacoes/${i.id}/moderar`, { acao, resposta }); toast({ type: "success", text: "Interação moderada." }); list.reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Section title="Moderação" description="Comentários, menções e mensagens diretas. Itens com alerta vêm destacados."
      actions={<TextField select size="small" label="Situação" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 160 }}>
        {["PENDENTE", "APROVADO", "OCULTO", "RESPONDIDO", "SPAM"].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}</TextField>}>
      <StateBox loading={list.loading} error={list.error} onRetry={list.reload} empty={!rows.length} emptyText="Nada para moderar.">
        <Box sx={{ display: "grid", gap: 1.5 }}>
          {rows.map((i) => (
            <Paper key={i.id} variant="outlined" sx={{ p: 1.5, borderRadius: 3, borderColor: i.alerta ? "error.main" : "divider" }}>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <Chip size="small" label={i.tipo} /><Typography sx={{ fontWeight: 700 }}>{i.autor || "Anônimo"}</Typography>
                {i.alerta ? <Chip size="small" color="error" label={`Alerta: ${i.alerta}`} /> : null}
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>{fmtDateTime(i.createdAt)}</Typography>
                <StatusPill value={i.status} />
              </Box>
              <Typography sx={{ my: 1 }}>{i.texto}</Typography>
              {i.resposta ? <Typography variant="body2" color="text.secondary">Resposta: {i.resposta}</Typography> : null}
              {i.status === "PENDENTE" ? <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                <Button size="small" color="success" onClick={() => mod(i, "APROVAR")}>Aprovar</Button><Button size="small" onClick={() => mod(i, "RESPONDER")}>Responder</Button>
                <Button size="small" color="warning" onClick={() => mod(i, "OCULTAR")}>Ocultar</Button><Button size="small" color="error" onClick={() => mod(i, "SPAM")}>Spam</Button>
              </Box> : null}
            </Paper>
          ))}
        </Box>
      </StateBox>
    </Section>
  );
}

function Metricas({ toast }: { toast: (t: Toast) => void }) {
  const contas = useLoad<any[]>(`${BASE}/social/contas`);
  const [cid, setCid] = useState("");
  const m = useLoad<any>(`${BASE}/social/metricas${qsOf({ contaId: cid })}`);
  const [novo, setNovo] = useState(false);
  const [f, setF] = useState<any>({});
  const s = m.data?.soma;
  const itens: any[] = m.data?.itens || [];
  const maxAlc = Math.max(1, ...itens.map((x) => x.alcance));
  async function salvar() {
    const body: any = { contaId: f.contaId };
    ["alcance", "impressoes", "curtidas", "comentarios", "compartilhamentos", "cliques", "seguidores"].forEach((k) => { if (f[k] !== undefined && f[k] !== "") body[k] = Number(f[k]); });
    try { await eduApi.post(`${BASE}/social/metricas`, body); toast({ type: "success", text: "Métricas registradas." }); setNovo(false); setF({}); m.reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Section title="Desempenho" description="Alcance e engajamento registrados por conta."
      actions={<Box sx={{ display: "flex", gap: 1 }}>
        <TextField select size="small" label="Conta" value={cid} onChange={(e) => setCid(e.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="">Todas</MenuItem>{asList(contas.data).map((c) => <MenuItem key={c.id} value={c.id}>{c.rede} — {c.nome}</MenuItem>)}</TextField>
        <Button variant="outlined" onClick={() => setNovo(true)}>Registrar métricas</Button>
      </Box>}>
      <StateBox loading={m.loading} error={m.error} onRetry={m.reload} empty={!itens.length} emptyText="Nenhuma métrica registrada.">
        {s ? <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2 }}>
          <Stat label="Alcance" value={s.alcance.toLocaleString("pt-BR")} /><Stat label="Impressões" value={s.impressoes.toLocaleString("pt-BR")} /><Stat label="Curtidas" value={s.curtidas} />
          <Stat label="Comentários" value={s.comentarios} /><Stat label="Compartilhamentos" value={s.compartilhamentos} /><Stat label="Cliques" value={s.cliques} />
          <Stat label="Engajamento" value={m.data.taxaEngajamentoPct != null ? `${m.data.taxaEngajamentoPct}%` : "—"} />
        </Box> : null}
        <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Alcance por registro</Typography>
        <Box sx={{ display: "flex", alignItems: "flex-end", gap: 0.5, height: 120, overflowX: "auto" }}>
          {[...itens].reverse().slice(-40).map((x) => (
            <Tooltip key={x.id} title={`${fmtDate(x.data)} — alcance ${x.alcance}`}><Box sx={{ width: 14, flex: "0 0 14px", height: `${Math.max(3, (x.alcance / maxAlc) * 100)}%`, bgcolor: "primary.main", borderRadius: "3px 3px 0 0" }} /></Tooltip>
          ))}
        </Box>
      </StateBox>
      <Dialog open={novo} onClose={() => setNovo(false)} fullWidth maxWidth="xs">
        <DialogTitle>Registrar métricas</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          <TextField select size="small" label="Conta" value={f.contaId || ""} onChange={(e) => setF({ ...f, contaId: e.target.value })}>{asList(contas.data).map((c) => <MenuItem key={c.id} value={c.id}>{c.rede} — {c.nome}</MenuItem>)}</TextField>
          {["alcance", "impressoes", "curtidas", "comentarios", "compartilhamentos", "cliques", "seguidores"].map((k) => <TextField key={k} size="small" type="number" label={k} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} />)}
        </DialogContent>
        <DialogActions><Button onClick={() => setNovo(false)}>Cancelar</Button><Button variant="contained" disabled={!f.contaId} onClick={salvar}>Salvar</Button></DialogActions>
      </Dialog>
    </Section>
  );
}

function Contas({ toast }: { toast: (t: Toast) => void }) {
  const list = useLoad<any[]>(`${BASE}/social/contas`);
  const [novo, setNovo] = useState(false);
  const [f, setF] = useState<any>({ rede: "INSTAGRAM", ativa: true });
  const rows = asList(list.data);
  async function act(fn: () => Promise<any>, ok: string) { try { await fn(); toast({ type: "success", text: ok }); list.reload(); } catch (e: any) { toast({ type: "error", text: e.message }); } }
  async function salvar() {
    const body: any = { rede: f.rede, nome: f.nome, ativa: !!f.ativa };
    ["handle", "externalId", "accessToken"].forEach((k) => { if (f[k]) body[k] = f[k]; });
    await act(async () => { await eduApi.post(`${BASE}/social/contas`, body); setNovo(false); setF({ rede: "INSTAGRAM", ativa: true }); }, "Conta cadastrada.");
  }
  return (
    <Section title="Contas de redes sociais" description="O token de acesso é guardado cifrado. Sem token, os posts são publicados manualmente."
      actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo(true)}>Nova conta</Button>}>
      <StateBox loading={list.loading} error={list.error} onRetry={list.reload} empty={!rows.length} emptyText="Nenhuma conta cadastrada (somente administradores cadastram).">
        <Table size="small">
          <TableHead><TableRow>{["Rede", "Conta", "Seguidores", "Publicação", "Última sincronização", ""].map((h) => <TableCell key={h} sx={{ fontWeight: 800 }}>{h}</TableCell>)}</TableRow></TableHead>
          <TableBody>{rows.map((c) => (
            <TableRow key={c.id} hover>
              <TableCell><Chip size="small" label={c.rede} sx={{ bgcolor: COR_REDE[c.rede], color: "#fff" }} /></TableCell>
              <TableCell>{c.nome}{c.handle ? ` (@${c.handle.replace(/^@/, "")})` : ""} {!c.ativa ? <Chip size="small" label="Inativa" /> : null}</TableCell>
              <TableCell>{c.seguidores ?? "—"}</TableCell><TableCell>{c.publicacaoAutomatica ? "Automática" : "Manual"}</TableCell><TableCell>{c.ultimaSincEm ? fmtDateTime(c.ultimaSincEm) : "—"}</TableCell>
              <TableCell align="right">
                <Button size="small" onClick={() => act(() => eduApi.post(`${BASE}/social/contas/${c.id}/sincronizar`), "Conta sincronizada.")}>Sincronizar</Button>
                <Button size="small" color="error" onClick={() => { if (window.confirm(`Remover a conta “${c.nome}” e seus posts?`)) act(() => eduApi.del(`${BASE}/social/contas/${c.id}`), "Conta removida."); }}>Remover</Button>
              </TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </StateBox>
      <Dialog open={novo} onClose={() => setNovo(false)} fullWidth maxWidth="xs">
        <DialogTitle>Nova conta</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          <TextField select size="small" label="Rede" value={f.rede} onChange={(e) => setF({ ...f, rede: e.target.value })}>{REDES.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}</TextField>
          <TextField size="small" label="Nome" value={f.nome || ""} onChange={(e) => setF({ ...f, nome: e.target.value })} />
          <TextField size="small" label="Usuário (@)" value={f.handle || ""} onChange={(e) => setF({ ...f, handle: e.target.value })} />
          <TextField size="small" label="ID da página/conta (Facebook/Instagram)" value={f.externalId || ""} onChange={(e) => setF({ ...f, externalId: e.target.value })} />
          <TextField size="small" type="password" label="Token de acesso (opcional)" value={f.accessToken || ""} onChange={(e) => setF({ ...f, accessToken: e.target.value })} autoComplete="off" />
          <FormControlLabel label="Conta ativa" control={<Checkbox checked={!!f.ativa} onChange={(e) => setF({ ...f, ativa: e.target.checked })} />} />
        </DialogContent>
        <DialogActions><Button onClick={() => setNovo(false)}>Cancelar</Button><Button variant="contained" disabled={!f.nome || f.nome.length < 2} onClick={salvar}>Salvar</Button></DialogActions>
      </Dialog>
    </Section>
  );
}

export default function SocialTab({ toast }: { toast: (t: Toast) => void }) {
  const [sub, setSub] = useState(0);
  return (
    <Box>
      <Tabs value={sub} onChange={(_, v) => setSub(v)} variant="scrollable" sx={{ mb: 2 }}>
        <Tab label="Calendário" /><Tab label="Posts" /><Tab label="Moderação" /><Tab label="Desempenho" /><Tab label="Contas" />
      </Tabs>
      {sub === 0 && <Calendario />}
      {sub === 1 && <SocialPosts toast={toast} />}
      {sub === 2 && <Moderacao toast={toast} />}
      {sub === 3 && <Metricas toast={toast} />}
      {sub === 4 && <Contas toast={toast} />}
      <Alert severity="info" sx={{ mt: 1 }} icon={false}>Publicação automática só ocorre em Facebook e Instagram com token e ID configurados.</Alert>
    </Box>
  );
}
