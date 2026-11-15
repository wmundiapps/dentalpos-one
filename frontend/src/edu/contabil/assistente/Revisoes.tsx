import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Switch, TextField, Typography, FormControlLabel } from "@mui/material";
import { useState } from "react";
import { AS, Estado, Formulario, Lista, Secao, StatusChip, dataHora, host, rotulo, useApi, useRun, useToast } from "../comum2/kit";

export function Revisoes() {
  const [status, setStatus] = useState("PENDENTE");
  const meta = useApi<any>(`${AS}/meta`);
  const r = useApi<any>(`${AS}/revisoes?pageSize=100${status ? `&status=${status}` : ""}`);
  const { toast, node } = useToast();
  const run = useRun(toast, r.reload);
  const [sel, setSel] = useState<any | null>(null);
  const [parecer, setParecer] = useState(""); const [decisao, setDecisao] = useState<"APROVADO" | "AJUSTAR">("APROVADO");
  const pode = !!meta.data?.pode?.decidirRevisao;
  const items: any[] = r.data?.items || [];
  return (
    <Secao titulo="Fila de revisão do contador" acoes={<TextField size="small" select label="Situação" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 160 }}><MenuItem value="">Todas</MenuItem>{["PENDENTE", "APROVADO", "AJUSTAR"].map((s) => <MenuItem key={s} value={s}>{rotulo(s)}</MenuItem>)}</TextField>}>
      {node}
      <Alert severity="info" sx={{ mb: 2 }}>{r.data?.aviso || "O parecer final é sempre humano (contador)."} {pode ? "" : "Você acompanha apenas as suas próprias solicitações; quem decide é o contador."}</Alert>
      <Estado loading={r.loading} error={r.error} onRetry={r.reload} vazio={!items.length} textoVazio="Nenhuma solicitação nesta situação.">
        <Lista linhas={items} aoClicar={setSel} colunas={[
          { titulo: "Pergunta", principal: true, render: (x: any) => <Typography variant="body2" sx={{ maxWidth: 420 }} noWrap>{x.pergunta}</Typography> }, { titulo: "Empresa", render: (x: any) => x.empresaNome || "—" },
          { titulo: "Solicitada em", render: (x: any) => dataHora(x.createdAt) }, { titulo: "Situação", render: (x: any) => <StatusChip v={x.status} /> },
        ]} acoes={(x: any) => <Button size="small" onClick={() => { setSel(x); setParecer(x.parecer || ""); setDecisao("APROVADO"); }}>{x.status === "PENDENTE" && pode ? "Analisar" : "Ver"}</Button>} />
      </Estado>
      <Dialog open={!!sel} onClose={() => setSel(null)} fullWidth maxWidth="md" fullScreen={typeof window !== "undefined" && window.innerWidth < 600}>
        <DialogTitle>Revisão do contador {sel ? <StatusChip v={sel.status} /> : null}</DialogTitle>
        <DialogContent dividers>
          {sel ? (
            <Box sx={{ display: "grid", gap: 2 }}>
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}><Typography variant="caption" color="text.secondary">Pergunta</Typography><Typography sx={{ whiteSpace: "pre-wrap" }}>{sel.pergunta}</Typography></Paper>
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}><Typography variant="caption" color="text.secondary">Resposta do assistente automatizado</Typography><Typography variant="body2" sx={{ whiteSpace: "pre-wrap", maxHeight: 280, overflowY: "auto" }}>{sel.respostaAssistente}</Typography></Paper>
              {sel.observacao ? <Alert severity="info"><b>Observação do solicitante:</b> {sel.observacao}</Alert> : null}
              {sel.status === "PENDENTE" && pode ? (
                <>
                  <TextField select size="small" label="Decisão" value={decisao} onChange={(e) => setDecisao(e.target.value as any)}><MenuItem value="APROVADO">Aprovar (a resposta está correta)</MenuItem><MenuItem value="AJUSTAR">Ajustar (precisa de correção)</MenuItem></TextField>
                  <TextField multiline minRows={3} label="Parecer do contador" value={parecer} onChange={(e) => setParecer(e.target.value)} helperText="Mínimo de 10 caracteres. Este parecer é humano e fica registrado." slotProps={{ htmlInput: { maxLength: 4000 } }} />
                </>
              ) : sel.parecer ? <Alert severity={sel.status === "APROVADO" ? "success" : "warning"}><b>Parecer:</b> {sel.parecer}<br /><small>Decidido em {dataHora(sel.decididoEm)}</small></Alert> : null}
              {sel.status === "AJUSTAR" ? <Button onClick={async () => { if (await run(() => host.post(`${AS}/revisoes/${sel.id}/reabrir`, {}), "Solicitação reaberta.")) setSel(null); }}>Reabrir para nova análise</Button> : null}
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSel(null)}>Fechar</Button>
          {sel?.status === "PENDENTE" && pode ? <Button variant="contained" disabled={parecer.trim().length < 10} onClick={async () => { if (await run(() => host.put(`${AS}/revisoes/${sel.id}/parecer`, { status: decisao, parecer }), "Parecer registrado.")) setSel(null); }}>Registrar parecer</Button> : null}
        </DialogActions>
      </Dialog>
    </Secao>
  );
}

export function ConfigAssistente() {
  const meta = useApi<any>(`${AS}/meta`);
  const cfg = useApi<any>(`${AS}/config`);
  const art = useApi<any>(`${AS}/artigos`);
  const { toast, node } = useToast();
  const run = useRun(toast, () => { cfg.reload(); meta.reload(); art.reload(); });
  const [novo, setNovo] = useState(false);
  const pode = !!meta.data?.pode?.configurar;
  const c = cfg.data;
  return (
    <>
      {node}
      <Secao titulo="Configuração e privacidade (LGPD)">
        <Estado loading={cfg.loading && !c} error={cfg.error} onRetry={cfg.reload}>
          {c ? (
            <Box sx={{ display: "grid", gap: 1.5, maxWidth: 560 }}>
              {!pode ? <Alert severity="info">Apenas o contador/administração altera a configuração.</Alert> : null}
              <FormControlLabel control={<Switch checked={c.ativo} disabled={!pode} onChange={(e) => run(() => host.put(`${AS}/config`, { ativo: e.target.checked }), "Configuração salva.")} />} label="Assistente ativo" />
              <TextField size="small" type="number" label="Retenção das conversas (dias)" defaultValue={c.retencaoDias} disabled={!pode} helperText="Depois deste prazo as conversas são apagadas automaticamente (7 a 3650 dias)." onBlur={(e) => { const v = Number(e.target.value); if (v !== c.retencaoDias) run(() => host.put(`${AS}/config`, { retencaoDias: v }), "Retenção atualizada."); }} />
              <FormControlLabel control={<Switch checked={c.usarLlmExterno} disabled={!pode || !meta.data?.llm?.configuradoNoServidor} onChange={(e) => run(() => host.put(`${AS}/config`, { usarLlmExterno: e.target.checked }), "Configuração salva.")} />} label="Usar modelo de linguagem externo (opcional)" />
              <Typography variant="caption" color="text.secondary">{meta.data?.llm?.configuradoNoServidor ? "Provedor externo configurado no servidor por variável de ambiente. O texto enviado é minimizado e pedidos sensíveis nunca são enviados." : "Nenhum provedor externo configurado no servidor (variáveis CONTABIL_LLM_URL, CONTABIL_LLM_API_KEY e CONTABIL_LLM_MODEL). O assistente funciona só com a base local."}</Typography>
              <FormControlLabel control={<Switch checked={c.enviarContexto} disabled={!pode || !c.usarLlmExterno} onChange={(e) => run(() => host.put(`${AS}/config`, { enviarContexto: e.target.checked }), "Configuração salva.")} />} label="Enviar resumo (sem dados pessoais) da empresa ao modelo externo" />
              {pode ? <Button variant="outlined" onClick={() => run(() => host.post<any>(`${AS}/retencao/executar`, {}), "Retenção executada.")}>Executar limpeza de retenção agora</Button> : null}
            </Box>
          ) : null}
        </Estado>
      </Secao>
      <Secao titulo="Base de conhecimento" acoes={pode ? <Button variant="outlined" onClick={() => setNovo(true)}>Adicionar artigo da casa</Button> : undefined}>
        <Estado loading={art.loading && !art.data} error={art.error} onRetry={art.reload}>
          <Typography variant="body2" sx={{ mb: 1 }}>Artigos padrão ({art.data?.padrao?.length ?? 0}):</Typography>
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 2 }}>{(art.data?.padrao || []).map((a: any) => <Chip key={a.slug} size="small" label={a.titulo} variant="outlined" />)}</Box>
          <Typography variant="body2" sx={{ mb: 1 }}>Artigos próprios desta instituição:</Typography>
          <Estado vazio={!art.data?.proprios?.length} textoVazio="Nenhum artigo próprio.">
            <Lista linhas={art.data?.proprios || []} colunas={[{ titulo: "Título", principal: true, render: (a: any) => a.titulo }, { titulo: "Categoria", render: (a: any) => rotulo(a.categoria) }, { titulo: "Ativo", render: (a: any) => (a.ativo ? "Sim" : "Não") }]} acoes={(a: any) => (pode && a.ativo ? <Button size="small" color="error" onClick={() => run(() => host.del(`${AS}/artigos/${a.id}`), "Artigo desativado.")}>Desativar</Button> : null)} />
          </Estado>
        </Estado>
        <Formulario aberto={novo} titulo="Novo artigo" campos={[{ nome: "slug", rotulo: "Identificador (minúsculas e hífen)", obrigatorio: true }, { nome: "titulo", rotulo: "Título", obrigatorio: true }, { nome: "palavrasChave", rotulo: "Palavras-chave" }, { nome: "conteudo", rotulo: "Conteúdo", tipo: "textarea", obrigatorio: true }]} aoFechar={() => setNovo(false)} aoEnviar={async (v) => { if (await run(() => host.post(`${AS}/artigos`, v), "Artigo salvo.")) setNovo(false); }} />
      </Secao>
    </>
  );
}
