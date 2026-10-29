import { Alert, Badge, Box, Button, Chip, FormControlLabel, Paper, Rating, Switch, TextField, Typography } from "@mui/material";
import MarkEmailReadOutlinedIcon from "@mui/icons-material/MarkEmailReadOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { eduApi } from "../../services/EduApi";
import { Empty, Feedback, fmtDate, fmtDateTime, useLoad } from "../secretaria/util";
import { sid, useToast } from "./comum";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

/** Mensagens e avisos (notificações da instituição + recados dos professores). */
export function PortalMensagens({ studentId, podeAgir, onMudou }: { studentId?: string | null; podeAgir: boolean; onMudou?: () => void }) {
  const { data, loading, error, reload } = useLoad<any>(`/portal2/aluno/mensagens${sid(studentId)}`);
  const t = useToast();
  const [aberta, setAberta] = useState<string | null>(null);
  async function ler(m: any) {
    setAberta(aberta === m.id ? null : m.id);
    if (podeAgir && m.origem === "AVISO" && !m.lida) { try { await eduApi.post(`/portal2/aluno/mensagens/${m.id}/lida`); reload(); onMudou?.(); } catch { /* ignore */ } }
  }
  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>Mensagens e avisos {data?.naoLidas ? <Badge color="error" badgeContent={data.naoLidas} sx={{ ml: 2 }} /> : null}</Typography>
        {podeAgir && <Button size="small" startIcon={<MarkEmailReadOutlinedIcon />} disabled={!data?.naoLidas} onClick={async () => { try { await eduApi.post("/portal2/aluno/mensagens/lidas"); reload(); onMudou?.(); } catch (e: any) { t.err(e.message); } }}>Marcar todas como lidas</Button>}
      </Box>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {!loading && !(data?.itens || []).length && <Empty>Nenhuma mensagem.</Empty>}
      {(data?.itens || []).map((m: any) => (
        <Paper key={`${m.origem}-${m.id}`} variant="outlined" onClick={() => ler(m)} sx={{ p: 1.5, borderRadius: 2, cursor: "pointer", borderLeft: "4px solid", borderLeftColor: m.lida ? "divider" : "primary.main" }}>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <Typography sx={{ fontWeight: m.lida ? 600 : 800, flex: 1 }}>{m.assunto}</Typography>
            <Chip size="small" variant="outlined" label={m.origem === "PROFESSOR" ? "Professor" : "Instituição"} />
          </Box>
          <Typography variant="caption" color="text.secondary">{m.de ? `${m.de} · ` : ""}{fmtDateTime(m.em)}</Typography>
          {(aberta === m.id || !m.lida) && <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>{m.mensagem}</Typography>}
        </Paper>
      ))}
      {t.node}
    </Box>
  );
}

/** Carteirinha digital com QR Code (validação pública mostra apenas dados mínimos). */
export function PortalCarteirinha({ studentId, podeAgir }: { studentId?: string | null; podeAgir: boolean }) {
  const { data, loading, error, reload } = useLoad<any>(`/portal2/aluno/carteirinha${sid(studentId)}`);
  const [qr, setQr] = useState("");
  const t = useToast();
  useEffect(() => {
    if (!data?.codigo) return;
    const url = `${API.replace(/\/api\/?$/, "")}${data.urlValidacao}`;
    QRCode.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: "M" }).then(setQr).catch(() => setQr(""));
  }, [data?.codigo, data?.urlValidacao]);
  const cor = data?.instituicao?.cores?.primaria || "#0F5FDB";
  return (
    <Box sx={{ display: "grid", gap: 2, justifyItems: "center" }}>
      <Box sx={{ width: "100%" }}><Feedback loading={loading} error={error} onRetry={reload} /></Box>
      {data && (
        <Paper elevation={4} sx={{ width: "100%", maxWidth: 380, borderRadius: 4, overflow: "hidden" }} aria-label="Carteirinha digital do aluno">
          <Box sx={{ background: `linear-gradient(120deg, ${data.instituicao?.cores?.secundaria || "#0B1F3A"}, ${cor})`, color: "#fff", p: 2, display: "flex", alignItems: "center", gap: 1.5 }}>
            {data.instituicao?.logo ? <Box component="img" src={data.instituicao.logo} alt="" sx={{ height: 44, maxWidth: 120, objectFit: "contain", bgcolor: "rgba(255,255,255,.95)", borderRadius: 1, p: 0.5 }} /> : null}
            <Box><Typography sx={{ fontWeight: 800, lineHeight: 1.1 }}>{data.instituicao?.nome}</Typography><Typography variant="caption">Carteirinha do estudante</Typography></Box>
          </Box>
          <Box sx={{ p: 2, display: "grid", gap: 0.5, justifyItems: "center", textAlign: "center" }}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>{data.aluno.nome}</Typography>
            <Typography variant="body2">RA {data.aluno.ra}</Typography>
            <Typography variant="body2" color="text.secondary">{data.aluno.curso}{data.aluno.modalidade ? ` · ${data.aluno.modalidade}` : ""}</Typography>
            {qr ? <Box component="img" src={qr} alt="QR Code de validação da carteirinha" sx={{ width: 200, height: 200, my: 1 }} /> : <Box sx={{ width: 200, height: 200 }} />}
            <Typography variant="caption" color="text.secondary">Válida até {fmtDate(data.validade)} · código {data.codigo.slice(0, 8)}…</Typography>
            <Chip size="small" color={data.status === "ATIVA" ? "success" : "default"} label={data.status === "ATIVA" ? "Ativa" : data.status} />
          </Box>
        </Paper>
      )}
      {podeAgir && data && <Button variant="outlined" onClick={async () => { if (!window.confirm("Reemitir a carteirinha? O QR Code atual deixará de valer.")) return; try { await eduApi.post("/portal2/aluno/carteirinha/renovar"); t.ok("Nova carteirinha emitida."); reload(); } catch (e: any) { t.err(e.message); } }}>Reemitir (perdi / troquei de celular)</Button>}
      {t.node}
    </Box>
  );
}

/** Preferências de privacidade (LGPD): consentimentos por finalidade e exportação dos meus dados. */
export function PortalPrivacidade({ podeAgir }: { podeAgir: boolean }) {
  const { data, loading, error, reload } = useLoad<any>(podeAgir ? "/portal2/aluno/privacidade" : null);
  const t = useToast();
  async function trocar(chave: string, concedido: boolean) { try { await eduApi.put(`/portal2/aluno/privacidade/${chave}`, { concedido }); t.ok(concedido ? "Consentimento registrado." : "Consentimento revogado."); reload(); } catch (e: any) { t.err(e.message); } }
  async function exportar() {
    try {
      const token = localStorage.getItem("dentalpos.token") || "";
      const r = await fetch(`${API}/edu/portal2/aluno/privacidade/exportar`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Erro ${r.status}`);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a"); a.href = url; a.download = "meus-dados.json"; a.click(); URL.revokeObjectURL(url);
      t.ok("Arquivo gerado.");
    } catch (e: any) { t.err(e.message); }
  }
  if (!podeAgir) return <Alert severity="info">As preferências de privacidade ficam disponíveis apenas para o próprio titular.</Alert>;
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {data && (
        <>
          <Alert severity="info">{data.direitos}</Alert>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Seus consentimentos</Typography>
            {data.finalidades.map((f: any) => (
              <Box key={f.chave} sx={{ display: "flex", gap: 1, alignItems: "center", py: 1, borderBottom: "1px dashed", borderColor: "divider" }}>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontWeight: 700 }}>{f.titulo}</Typography>
                  <Typography variant="body2" color="text.secondary">{f.descricao}</Typography>
                  <Typography variant="caption" color="text.secondary">Base legal: {f.baseLegal}{f.atualizadoEm ? ` · atualizado em ${fmtDate(f.atualizadoEm)}` : ""}</Typography>
                </Box>
                <FormControlLabel sx={{ mr: 0 }} control={<Switch checked={f.concedido} onChange={(e) => trocar(f.chave, e.target.checked)} slotProps={{ input: { "aria-label": `Consentimento: ${f.titulo}` } }} />} label={f.concedido ? "Sim" : "Não"} />
              </Box>
            ))}
          </Paper>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Tratamentos necessários (sem consentimento)</Typography>
            {data.tratamentosEssenciais.map((x: any) => <Typography key={x.titulo} variant="body2" sx={{ mb: 0.5 }}><b>{x.titulo}</b> — {x.descricao} <Typography component="span" variant="caption" color="text.secondary">({x.baseLegal})</Typography></Typography>)}
          </Paper>
          <Button variant="contained" startIcon={<DownloadOutlinedIcon />} onClick={exportar} sx={{ justifySelf: "start" }}>Exportar meus dados (JSON)</Button>
        </>
      )}
      {t.node}
    </Box>
  );
}

/** Avaliação docente respondida pelo aluno (anônima para o professor). */
export function PortalAvaliacaoDocente({ podeAgir }: { podeAgir: boolean }) {
  const { data, loading, error, reload } = useLoad<any>(podeAgir ? "/portal2/aluno/avaliacao-docente" : null);
  const [sel, setSel] = useState<any>(null);
  const t = useToast();
  if (!podeAgir) return <Alert severity="info">A avaliação docente é respondida pelo próprio aluno.</Alert>;
  const crit: any[] = data?.criterios || [];
  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Alert severity="info">Suas respostas são anônimas para o professor e ajudam a melhorar as aulas.</Alert>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {!loading && !(data?.itens || []).length && <Empty>Nenhuma turma para avaliar.</Empty>}
      {(data?.itens || []).map((i: any) => (
        <Paper key={i.classSectionId} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <Box sx={{ flex: 1, minWidth: 200 }}><Typography sx={{ fontWeight: 700 }}>{i.disciplina}</Typography><Typography variant="caption" color="text.secondary">{i.professor} · {i.periodo}</Typography></Box>
            {i.respondida ? <Chip size="small" color="success" label="Respondida" /> : <Button size="small" variant="contained" onClick={() => setSel({ ...i, notas: {}, comentario: "" })}>Avaliar</Button>}
          </Box>
          {sel?.classSectionId === i.classSectionId && (
            <Box sx={{ display: "grid", gap: 1, mt: 1.5 }}>
              {crit.map((c) => <Box key={c.chave} sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}><Typography variant="body2" sx={{ flex: 1, minWidth: 180 }}>{c.titulo}</Typography><Rating value={sel.notas[c.chave] || 0} onChange={(_, v) => setSel({ ...sel, notas: { ...sel.notas, [c.chave]: v } })} /></Box>)}
              <TextField size="small" multiline minRows={2} label="Comentário (opcional)" value={sel.comentario} onChange={(e) => setSel({ ...sel, comentario: e.target.value })} />
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button variant="contained" disabled={crit.some((c) => !sel.notas[c.chave])} onClick={async () => { try { await eduApi.post("/portal2/aluno/avaliacao-docente", { classSectionId: sel.classSectionId, notas: sel.notas, comentario: sel.comentario || undefined }); setSel(null); t.ok("Obrigado pela avaliação!"); reload(); } catch (e: any) { t.err(e.message); } }}>Enviar avaliação</Button>
                <Button onClick={() => setSel(null)}>Cancelar</Button>
              </Box>
            </Box>
          )}
        </Paper>
      ))}
      {t.node}
    </Box>
  );
}
