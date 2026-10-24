import { Alert, Box, Button, Chip, Pagination, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { FormDialog, Kpi, KpiRow, LoadBox, Pick, Section, Status, call, fmtDateTime, itemsOf, useApi, useRunner, useToast } from "../desempenho/kit";

const FINALIDADES = ["COMUNICACAO_MARKETING", "USO_IMAGEM", "PESQUISA_EGRESSOS", "COMPARTILHAMENTO_PARCEIROS", "DADOS_SAUDE", "COOKIES_PREFERENCIAS", "COOKIES_ANALITICOS", "COOKIES_MARKETING"];

export default function ConsentimentosTab() {
  const [rev, setRev] = useState(0);
  const [page, setPage] = useState(1);
  const [fin, setFin] = useState("");
  const [status, setStatus] = useState("");
  const [menor, setMenor] = useState("");
  const [q, setQ] = useState("");
  const [novo, setNovo] = useState(false);
  const [texto, setTexto] = useState(false);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  const resumo = useApi<any>("/lgpd/consentimentos/resumo", [rev]);
  const textos = useApi<any>("/lgpd/textos-consentimento", [rev]);
  const pend = useApi<any>("/lgpd/menores/pendencias", [rev]);
  const l = useApi<any>(`/lgpd/consentimentos?page=${page}&pageSize=25${fin ? `&finalidade=${fin}` : ""}${status ? `&status=${status}` : ""}${menor ? `&menor=${menor}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`, [rev]);
  const pf = resumo.data?.porFinalidade || {};
  return (
    <>
      {node}
      <Section title="Consentimentos registrados (versionados)" actions={<><Button onClick={() => setTexto(true)}>Publicar nova versão de texto</Button><Button variant="contained" onClick={() => setNovo(true)}>Registrar consentimento presencial</Button></>}>
        <KpiRow>
          {Object.entries(pf).map(([k, v]: any) => <Kpi key={k} title={k.replace(/_/g, " ")} value={v.ativos} hint={`${v.revogados} revogados`} />)}
          <Kpi title="Menores com consentimento" value={resumo.data?.menoresAtivos ?? 0} hint="com responsável legal (art. 14)" />
          <Kpi title="Menores sem responsável" value={pend.data?.total ?? 0} color={(pend.data?.total ?? 0) > 0 ? "#e0a100" : undefined} hint="alunos < 18 anos sem responsável cadastrado" />
        </KpiRow>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
          <Pick label="Finalidade" value={fin} onChange={(v) => { setFin(v); setPage(1); }} options={FINALIDADES.map((f) => ({ value: f, label: f.replace(/_/g, " ") }))} all="Todas" minWidth={260} />
          <Pick label="Situação" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "ATIVO", label: "Ativo" }, { value: "REVOGADO", label: "Revogado" }]} all="Todas" />
          <Pick label="Menor de idade" value={menor} onChange={(v) => { setMenor(v); setPage(1); }} options={[{ value: "true", label: "Sim" }, { value: "false", label: "Não" }]} all="Todos" />
          <TextField size="small" label="Buscar por nome ou e-mail" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </Box>
        <LoadBox loading={l.loading} error={l.error} empty={!itemsOf(l.data).length} emptyText="Nenhum consentimento registrado." onRetry={l.reload}>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead><TableRow><TableCell>Titular (mascarado)</TableCell><TableCell>Finalidade</TableCell><TableCell>Versão do texto</TableCell><TableCell>Concedido</TableCell><TableCell>Situação</TableCell><TableCell>Canal</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>
                {itemsOf(l.data).map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.titularNome ?? "Visitante"}<Typography variant="caption" component="div" color="text.secondary">{c.titularEmail ?? ""} {c.titularDoc ?? ""}</Typography></TableCell>
                    <TableCell>{c.finalidade.replace(/_/g, " ")}{c.sensivel && <Chip size="small" color="warning" label="sensível" sx={{ ml: 0.5 }} />}{c.menor && <Chip size="small" label="menor" sx={{ ml: 0.5 }} />}</TableCell>
                    <TableCell>{c.versaoTexto}</TableCell><TableCell>{fmtDateTime(c.concedidoEm)}</TableCell>
                    <TableCell><Status value={c.status === "ATIVO" ? "ATIVO" : "REVOGADO"} />{c.revogadoEm && <Typography variant="caption" component="div">{fmtDateTime(c.revogadoEm)}</Typography>}</TableCell>
                    <TableCell>{c.canal}</TableCell>
                    <TableCell>{c.status === "ATIVO" && <Button size="small" color="error" onClick={() => { const m = window.prompt("Motivo da revogação:"); if (m && m.length >= 3) void run(() => call("POST", `/lgpd/consentimentos/${c.id}/revogar`, { motivo: m }), "Consentimento revogado."); }}>Revogar</Button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Pagination sx={{ mt: 2 }} count={Math.max(1, Math.ceil((l.data?.total ?? 0) / 25))} page={page} onChange={(_, p) => setPage(p)} />
        </LoadBox>
      </Section>
      <Section title="Textos de consentimento vigentes">
        <Alert severity="warning" sx={{ mb: 1 }}>Os textos-modelo precisam ser validados por advogado. Publicar uma nova versão não altera consentimentos já dados: cada registro guarda a versão e o hash do texto que o titular viu.</Alert>
        <LoadBox loading={textos.loading} error={textos.error} onRetry={textos.reload}>
          {(textos.data?.vigentes || []).map((t: any) => <Box key={t.finalidade} sx={{ mb: 1.5 }}><Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{t.titulo} <Chip size="small" label={`v${t.versao}`} /> {t.origem === "MODELO" && <Chip size="small" color="warning" label="texto-modelo" />}</Typography><Typography variant="body2" color="text.secondary">{t.texto}</Typography></Box>)}
        </LoadBox>
      </Section>
      <FormDialog open={novo} title="Registrar consentimento presencial" fields={[
        { key: "finalidade", label: "Finalidade", type: "select", required: true, options: FINALIDADES }, { key: "versao", label: "Versão do texto lido pelo titular", required: true, helper: "Ex.: 1.0-modelo (veja os textos vigentes abaixo)" },
        { key: "nome", label: "Nome", required: true }, { key: "email", label: "E-mail" }, { key: "documento", label: "CPF" }, { key: "menor", label: "Titular menor de 18 anos", type: "bool" },
        { key: "rNome", label: "Responsável legal — nome", hidden: (v) => !v.menor }, { key: "rParentesco", label: "Parentesco", hidden: (v) => !v.menor }, { key: "rEmail", label: "E-mail do responsável", hidden: (v) => !v.menor },
        { key: "rDecl", label: "O responsável declarou ser o responsável legal", type: "bool", hidden: (v) => !v.menor },
      ]} initial={{ versao: "1.0-modelo" }} onClose={() => setNovo(false)}
        onSubmit={async (b, raw) => {
          const body: any = { finalidade: b.finalidade, versao: b.versao, nome: b.nome, email: b.email || undefined, documento: b.documento || undefined, menor: raw.menor || undefined, titularTipo: "OUTRO", canal: "PRESENCIAL" };
          if (raw.menor) body.responsavel = { nome: raw.rNome, parentesco: raw.rParentesco, email: raw.rEmail || undefined, declaracao: raw.rDecl === true ? true : false };
          const r = await call("POST", "/lgpd/consentimentos", body);
          toast({ type: "success", text: `Consentimento registrado. Recibo (entregue ao titular): ${r.recibo ?? "—"}` }); setRev((x) => x + 1);
        }} />
      <FormDialog open={texto} title="Publicar nova versão de texto" fields={[
        { key: "finalidade", label: "Finalidade", type: "select", required: true, options: FINALIDADES }, { key: "versao", label: "Nova versão (ex.: 2.0)", required: true }, { key: "titulo", label: "Título", required: true },
        { key: "texto", label: "Texto exato mostrado ao titular", type: "textarea", required: true }, { key: "baseLegal", label: "Base legal", type: "select", options: ["CONSENTIMENTO", "CONSENTIMENTO_DESTACADO"] },
      ]} initial={{ baseLegal: "CONSENTIMENTO" }} onClose={() => setTexto(false)} onSubmit={async (b) => { await call("POST", "/lgpd/textos-consentimento", b); setRev((x) => x + 1); }} />
    </>
  );
}
