import { Alert, Box, Button, Chip, Pagination, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useState } from "react";
import { FormDialog, LoadBox, Pick, Section, call, fmtDateTime, itemsOf, useApi, useToast } from "../desempenho/kit";

export default function EncarregadoTab() {
  const [rev, setRev] = useState(0);
  const [edit, setEdit] = useState<null | { row?: any }>(null);
  const [cat, setCat] = useState("");
  const [page, setPage] = useState(1);
  const [campo, setCampo] = useState(false);
  const { toast, node } = useToast();
  const d = useApi<any>("/lgpd/dpo", [rev]);
  const campos = useApi<any>("/lgpd/campos-sensiveis", [rev]);
  const ac = useApi<any>(`/lgpd/acessos-sensiveis?page=${page}&pageSize=20${cat ? `&categoria=${cat}` : ""}`, [rev]);
  const a = d.data?.ativo;
  const q = instituicaoQuery();
  return (
    <>
      {node}
      <Section title="Encarregado pelo tratamento de dados (DPO)" actions={<Button variant="contained" onClick={() => setEdit({})}>{a ? "Designar novo encarregado" : "Designar encarregado"}</Button>}>
        <LoadBox loading={d.loading} error={d.error} onRetry={d.reload}>
          {a ? (
            <>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>{a.nome} <Chip size="small" label={a.tipo} /></Typography>
              <Typography variant="body2">{a.cargo ?? "Encarregado(a)"} · {a.email}{a.telefone ? ` · ${a.telefone}` : ""}{a.horarioAtendimento ? ` · ${a.horarioAtendimento}` : ""}</Typography>
              <Typography variant="body2" color="text.secondary">{a.ato ? `Ato de designação: ${a.ato}. ` : ""}{a.userId ? "Vinculado a um usuário do sistema (acesso à Central LGPD)." : "Sem usuário vinculado: o acesso à Central LGPD continua com a administração."}</Typography>
              <Button size="small" sx={{ mt: 1 }} onClick={() => setEdit({ row: a })}>Editar</Button>
            </>
          ) : <Alert severity="warning">Nenhum encarregado designado. A LGPD (art. 41) exige a indicação e a divulgação pública da identidade e do contato do encarregado.</Alert>}
          <Alert severity="info" sx={{ mt: 2 }}>Páginas públicas (compartilhe os links): <b>/portal-titular{q}</b> · <b>/privacidade{q}</b> · <b>/termos{q}</b></Alert>
        </LoadBox>
      </Section>
      <Section title="Dados sensíveis e de menores — campos marcados" actions={<Button onClick={() => setCampo(true)}>Marcar campo</Button>}>
        <Alert severity="info" sx={{ mb: 1 }}>Dados sensíveis (art. 11) exigem base legal específica; o acesso aos registros de apoio, AEE, ocorrências e bolsas é <b>registrado</b> (quem viu o quê). Menores de 18 anos exigem consentimento do responsável quando a finalidade depende de consentimento (art. 14).</Alert>
        <LoadBox loading={campos.loading} error={campos.error} onRetry={campos.reload}>
          <Box sx={{ display: "flex", gap: 0.8, flexWrap: "wrap" }}>
            {(campos.data?.campos || []).map((c: any) => <Chip key={`${c.modelo}.${c.campo}`} size="small" variant="outlined" color={["SAUDE", "DEFICIENCIA", "BIOMETRIA", "ORIGEM_RACIAL", "CONVICCAO"].includes(c.categoria) ? "warning" : "default"} label={`${c.modelo}.${c.campo} · ${c.categoria}`} />)}
          </Box>
        </LoadBox>
      </Section>
      <Section title="Quem viu o quê (acessos a dados sensíveis)" actions={<Pick label="Categoria" value={cat} onChange={(v) => { setCat(v); setPage(1); }} options={["SAUDE", "DEFICIENCIA", "SOCIOECONOMICO", "DISCIPLINAR", "TODAS"].map((x) => ({ value: x, label: x }))} all="Todas" />}>
        <LoadBox loading={ac.loading} error={ac.error} empty={!itemsOf(ac.data).length} emptyText="Nenhum acesso registrado." onRetry={ac.reload}>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead><TableRow><TableCell>Quando</TableCell><TableCell>Quem</TableCell><TableCell>Papel</TableCell><TableCell>O quê</TableCell><TableCell>Categoria</TableCell><TableCell>Ação</TableCell></TableRow></TableHead>
              <TableBody>
                {itemsOf(ac.data).map((x: any) => <TableRow key={x.id}><TableCell>{fmtDateTime(x.createdAt)}</TableCell><TableCell>{x.usuario ?? x.userId}</TableCell><TableCell>{x.papel}</TableCell><TableCell>{x.recurso}{x.recursoId ? ` · ${x.recursoId.slice(0, 8)}` : ""}{x.titularId ? ` · titular ${x.titularId.slice(0, 8)}` : ""}</TableCell><TableCell>{x.categoria}</TableCell><TableCell>{x.acao}</TableCell></TableRow>)}
              </TableBody>
            </Table>
          </Box>
          <Pagination sx={{ mt: 2 }} count={Math.max(1, Math.ceil((ac.data?.total ?? 0) / 20))} page={page} onChange={(_, p) => setPage(p)} />
        </LoadBox>
      </Section>
      <FormDialog open={!!edit} title="Encarregado (DPO)" fields={[
        { key: "nome", label: "Nome", required: true }, { key: "email", label: "E-mail de contato público", required: true }, { key: "telefone", label: "Telefone" }, { key: "cargo", label: "Cargo/função" },
        { key: "tipo", label: "Tipo", type: "select", options: ["INTERNO", "TERCEIRIZADO"] }, { key: "empresa", label: "Empresa (se terceirizado)" }, { key: "userId", label: "ID do usuário do sistema (opcional; dá acesso à Central LGPD)" },
        { key: "ato", label: "Ato de designação" }, { key: "horarioAtendimento", label: "Horário de atendimento" }, { key: "endereco", label: "Endereço" }, { key: "canalUrl", label: "Link do canal do titular" },
      ]} initial={edit?.row ?? { tipo: "INTERNO" }} onClose={() => setEdit(null)} onSubmit={async (b) => { if (edit?.row) await call("PUT", `/lgpd/dpo/${edit.row.id}`, b); else await call("POST", "/lgpd/dpo", b); toast({ type: "success", text: "Encarregado salvo." }); setRev((x) => x + 1); }} />
      <FormDialog open={campo} title="Marcar campo como sensível" fields={[{ key: "modelo", label: "Modelo (ex.: student)", required: true }, { key: "campo", label: "Campo", required: true }, { key: "categoria", label: "Categoria", type: "select", required: true, options: ["SAUDE", "DEFICIENCIA", "BIOMETRIA", "ORIGEM_RACIAL", "CONVICCAO", "SOCIOECONOMICO", "MENOR", "DISCIPLINAR"] }, { key: "observacao", label: "Observação" }]} onClose={() => setCampo(false)} onSubmit={async (b) => { await call("POST", "/lgpd/campos-sensiveis", b); setRev((x) => x + 1); }} />
    </>
  );
}

function instituicaoQuery() {
  try { const u = JSON.parse(localStorage.getItem("dentalpos.user") || "null"); return u?.tenantId ? `?i=${u.tenantId}` : "?i=<sigla>"; } catch { return "?i=<sigla>"; }
}
