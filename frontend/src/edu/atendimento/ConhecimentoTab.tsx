import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, Slider, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { A, ActionsMenu, DataList, FormDialog, Kpi, KpiRow, LoadBox, Section, call, fmtDateTime, itemsOf, opts, useApi, useReload, useRunner, useToast, type Col, type FormField } from "./kit";

const CAMPOS: FormField[] = [
  { key: "categoria", label: "Categoria", type: "select", required: true, options: opts(["GERAL", "FINANCEIRO", "ACADEMICO", "DOCUMENTOS", "TI_ACESSO", "OUVIDORIA", "INTERNO"]) }, { key: "titulo", label: "Título", required: true },
  { key: "pergunta", label: "Pergunta frequente", required: true, full: true }, { key: "resposta", label: "Resposta", type: "textarea", required: true }, { key: "palavrasChave", label: "Palavras-chave", type: "list", helper: "Separe por vírgulas" },
  { key: "publico", label: "Pode ser usada na resposta automática e na FAQ pública", type: "bool" },
];

export default function ConhecimentoTab() {
  const { rev, reload } = useReload();
  const { toast, node } = useToast();
  const run = useRunner(toast, reload);
  const [edit, setEdit] = useState<null | { row?: any }>(null);
  const [q, setQ] = useState("");
  const kb = useApi<any>(`${A}/conhecimento?pageSize=50&q=${encodeURIComponent(q)}`, [rev]);
  const cfg = useApi<any>(`${A}/ia/config`, [rev]);
  const uso = useApi<any>(`${A}/ia/uso`, [rev]);
  const lgpd = useApi<any>(`${A}/ia/lgpd`);
  const [teste, setTeste] = useState("");
  const [res, setRes] = useState<any>(null);
  const c = cfg.data;
  const salvar = (patch: any) => run(() => call("PUT", `${A}/ia/config`, patch), "Configuração da IA salva.");
  const cols: Col[] = [
    { label: "Artigo", primary: true, render: (k) => <><b>{k.titulo}</b><div style={{ fontSize: 12, opacity: 0.75 }}>{k.pergunta}</div></> }, { label: "Categoria", render: (k) => k.categoria },
    { label: "Usos", hideOnMobile: true, render: (k) => `${k.usos} (👍${k.util} 👎${k.naoUtil})` }, { label: "Visibilidade", render: (k) => (k.publico ? <Chip size="small" color="success" label="pública" /> : <Chip size="small" label="interna" />) },
  ];
  return (
    <>
      {node}
      <Section title="Assistente de IA — controles e LGPD">
        <LoadBox loading={cfg.loading} error={cfg.error} onRetry={cfg.reload}>
          {c && <>
            <Alert severity={c.provedor === "SIMULADO" ? "info" : "success"} sx={{ mb: 1.5 }}>Provedor de IA: <b>{c.provedor === "SIMULADO" ? "SIMULADO (sem chave configurada — usa somente a base de conhecimento local)" : c.provedor}</b>. Base legal: {c.baseLegal}</Alert>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
              <FormControlLabel control={<Checkbox checked={c.iaAtiva} onChange={(e) => salvar({ iaAtiva: e.target.checked })} />} label="IA ativa (sugestões, classificação e resumos)" />
              <FormControlLabel control={<Checkbox checked={c.respostaAutomatica} onChange={(e) => salvar({ respostaAutomatica: e.target.checked })} />} label="Resposta automática" />
              <FormControlLabel control={<Checkbox checked={c.enviarDadosPessoais} onChange={(e) => salvar({ enviarDadosPessoais: e.target.checked })} />} label="Permitir nomes no texto enviado ao provedor (não recomendado)" />
            </Box>
            <Box sx={{ maxWidth: 420, px: 1, mt: 1 }}>
              <Typography variant="caption" color="text.secondary">Confiança mínima para responder sozinha: {Math.round(c.confiancaMinima * 100)}% (abaixo disso, escala para humano)</Typography>
              <Slider value={c.confiancaMinima} min={0.3} max={0.99} step={0.01} onChangeCommitted={(_, v) => salvar({ confiancaMinima: v })} valueLabelDisplay="auto" valueLabelFormat={(v) => `${Math.round(v * 100)}%`} />
            </Box>
            <Typography variant="caption" color="text.secondary" component="div">Canais com resposta automática: {(c.canaisAutomaticos ?? []).join(", ") || "nenhum"}</Typography>
          </>}
        </LoadBox>
        {lgpd.data && <Box component="ul" sx={{ pl: 2.5, my: 1.5 }}>{lgpd.data.controles.map((x: string) => <li key={x}><Typography variant="body2">{x}</Typography></li>)}</Box>}
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "flex-start" }}>
          <TextField size="small" label="Testar uma pergunta (mostra o que iria ao provedor)" value={teste} onChange={(e) => setTeste(e.target.value)} sx={{ flex: "1 1 280px" }} />
          <Button variant="outlined" disabled={teste.length < 2} onClick={async () => { const r = await run(() => call("POST", `${A}/ia/testar`, { texto: teste }), "Teste executado."); if (r) setRes(r); }}>Testar</Button>
        </Box>
        {res && <Alert severity={res.escalonar ? "warning" : "success"} sx={{ mt: 1 }}>{res.escalonar ? `Escalonaria para humano. ${res.motivo ?? ""}` : `Resposta (${Math.round(res.confianca * 100)}%): ${res.resposta}`}<br /><small>Texto minimizado enviado ao provedor: {res.textoEnviadoAoProvedor ?? "(bloqueado: dado sensível)"} · identificadores removidos: {res.redigidos}</small></Alert>}
      </Section>
      <Section title="Uso da IA (últimos 30 dias)">
        <LoadBox loading={uso.loading} error={uso.error} onRetry={uso.reload}>
          {uso.data && <>
            <KpiRow><Kpi title="Chamadas" value={uso.data.total} /><Kpi title="Escalonadas" value={uso.data.escalonados} color="#e0a100" /><Kpi title="Bloqueadas (sensível)" value={uso.data.bloqueadosPorDadoSensivel} color="#d64545" /><Kpi title="Identificadores removidos" value={uso.data.camposRedigidos} color="#2e9e5b" /></KpiRow>
            {uso.data.porTipo.map((t: any) => <Typography key={t.tipo + t.provedor} variant="body2">{t.tipo.replace(/_/g, " ")} · {t.provedor}: {t.qtd} {t.confiancaMedia != null ? `(confiança média ${Math.round(t.confiancaMedia * 100)}%)` : ""}</Typography>)}
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>O registro guarda apenas hash e tamanho da entrada — nunca o conteúdo das conversas. Última chamada: {uso.data.recentes[0] ? fmtDateTime(uso.data.recentes[0].createdAt) : "—"}</Typography>
          </>}
        </LoadBox>
      </Section>
      <Section title="Base de conhecimento (FAQ por instituição)" actions={<><Button size="small" variant="outlined" onClick={() => run(async () => { const r = await call("POST", `${A}/conhecimento/importar-faq`); toast({ type: "info", text: `${r.criados} FAQ(s) importada(s) da Comunicação.` }); }, "Importação concluída.")}>Importar FAQ da Comunicação</Button><Button size="small" variant="contained" onClick={() => setEdit({})}>Novo artigo</Button></>}>
        <TextField size="small" label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} sx={{ mb: 1.5, maxWidth: 360 }} fullWidth />
        <LoadBox loading={kb.loading} error={kb.error} empty={!itemsOf(kb.data).length} emptyText="Nenhum artigo. Crie o primeiro para a IA poder responder." onRetry={kb.reload}>
          <DataList rows={itemsOf(kb.data)} columns={cols} actions={(k) => <ActionsMenu items={[
            { label: "Editar", onClick: () => setEdit({ row: k }) },
            { label: k.ativo ? "Desativar" : "Ativar", onClick: () => run(() => call("PUT", `${A}/conhecimento/${k.id}`, { ativo: !k.ativo }), "Atualizado.") },
            { label: "Excluir", color: "error", onClick: () => run(() => call("DELETE", `${A}/conhecimento/${k.id}`), "Excluído.", "Excluir este artigo?") },
          ]} />} />
        </LoadBox>
      </Section>
      <FormDialog open={!!edit} title={edit?.row ? "Editar artigo" : "Novo artigo"} fields={CAMPOS} initial={edit?.row ? { ...edit.row, palavrasChave: (edit.row.palavrasChave ?? []).join(", ") } : { categoria: "GERAL", publico: true }} onClose={() => setEdit(null)}
        onSubmit={async (b) => { if (edit?.row) await call("PUT", `${A}/conhecimento/${edit.row.id}`, b); else await call("POST", `${A}/conhecimento`, b); reload(); toast({ type: "success", text: "Artigo salvo." }); }} />
    </>
  );
}
