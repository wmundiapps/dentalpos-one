import { Alert, Box, Button, Chip, MenuItem, Tab, Tabs, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import EduResourcePage, { StatusChip, type FieldDef } from "../EduResourcePage";
import { BASE, ROTULO_CANAL, Section, asList, useLoad, type Toast } from "./common";

const CATEGORIAS = ["COBRANCA", "ACADEMICO", "MARKETING", "ADMISSOES", "GERAL"];

function Preview() {
  const tpls = useLoad<any>(`${BASE}/templates?pageSize=200`);
  const [id, setId] = useState("");
  const [corpo, setCorpo] = useState("");
  const [res, setRes] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  async function ver() {
    setErro(null);
    try { setRes(await eduApi.post(`${BASE}/templates/preview`, id ? { templateId: id } : { corpo })); } catch (e: any) { setRes(null); setErro(e.message); }
  }
  return (
    <Section title="Pré-visualização" description="Veja como a mensagem fica com dados de exemplo. Variáveis: {{nome}}, {{valor}}, {{vencimento}}, {{curso}}, {{dias_atraso}}…">
      <Box sx={{ display: "grid", gap: 2, maxWidth: 720 }}>
        <TextField select size="small" label="Template salvo" value={id} onChange={(e) => setId(e.target.value)}>
          <MenuItem value="">— Digitar texto livre —</MenuItem>
          {asList(tpls.data).map((t) => <MenuItem key={t.id} value={t.id}>{t.chave} — {t.nome}</MenuItem>)}
        </TextField>
        {!id ? <TextField multiline minRows={3} size="small" label="Texto com variáveis" value={corpo} onChange={(e) => setCorpo(e.target.value)} /> : null}
        <Box><Button variant="contained" disabled={!id && !corpo.trim()} onClick={ver}>Pré-visualizar</Button></Box>
        {erro ? <Alert severity="warning">{erro}</Alert> : null}
        {res ? (
          <Box sx={{ p: 2, borderRadius: 3, bgcolor: "action.hover" }}>
            {res.assunto ? <Typography sx={{ fontWeight: 800 }}>{res.assunto}</Typography> : null}
            <Typography sx={{ whiteSpace: "pre-wrap" }}>{res.mensagem}</Typography>
            <Box sx={{ mt: 1, display: "flex", gap: 0.5, flexWrap: "wrap" }}>
              {(res.variaveisUsadas || []).map((v: string) => <Chip key={v} size="small" label={`{{${v}}}`} />)}
              {(res.faltantes || []).map((v: string) => <Chip key={v} size="small" color="error" label={`sem valor: ${v}`} />)}
            </Box>
          </Box>
        ) : null}
      </Box>
    </Section>
  );
}

function Contatos({ toast }: { toast: (t: Toast) => void }) {
  const [rev, setRev] = useState(0);
  const [busy, setBusy] = useState(false);
  async function sync(fonte: string) {
    setBusy(true);
    try {
      const r = await eduApi.post(`${BASE}/contatos/sincronizar`, { fonte });
      toast({ type: "success", text: `Sincronização de ${fonte.toLowerCase()}: ${r.criados ?? 0} criado(s), ${r.atualizados ?? 0} atualizado(s).` });
      setRev(rev + 1);
    } catch (e: any) { toast({ type: "error", text: e.message }); } finally { setBusy(false); }
  }
  const fields: FieldDef[] = [
    { key: "nome", label: "Nome", required: true },
    { key: "tipo", label: "Tipo", type: "select", options: ["ALUNO", "CANDIDATO", "EGRESSO", "RESPONSAVEL", "FUNCIONARIO", "OUTRO"] },
    { key: "telefone", label: "Telefone (DDD + número)" }, { key: "email", label: "E-mail" },
    { key: "telegramChatId", label: "Chat do Telegram" }, { key: "documento", label: "CPF" },
    { key: "tags", label: "Etiquetas", type: "json-list", helper: "Separadas por vírgula" },
  ];
  return (
    <>
      <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
        <Typography variant="body2" color="text.secondary">Importar contatos do sistema:</Typography>
        {["ALUNOS", "EGRESSOS", "CANDIDATOS"].map((f) => <Button key={f} size="small" variant="outlined" disabled={busy} onClick={() => sync(f)}>{f.charAt(0) + f.slice(1).toLowerCase()}</Button>)}
      </Box>
      <EduResourcePage key={rev} title="Contatos" description="Base única de pessoas para atendimento e campanhas. Respeita o opt-out (LGPD)." base={BASE} resource="/contatos" fields={fields}
        filters={[{ key: "tipo", label: "Tipo", options: ["ALUNO", "CANDIDATO", "EGRESSO", "RESPONSAVEL", "FUNCIONARIO", "OUTRO"] }]}
        columns={[
          { key: "nome", label: "Nome" }, { key: "tipo", label: "Tipo" }, { key: "telefone", label: "Telefone" }, { key: "email", label: "E-mail" },
          { key: "tags", label: "Etiquetas", render: (r) => (r.tags || []).map((t: string) => <Chip key={t} size="small" label={t} sx={{ mr: 0.5 }} />) },
          { key: "ativo", label: "Situação", render: (r) => <StatusChip value={r.ativo ? "ATIVO" : "INATIVO"} /> },
        ]} />
    </>
  );
}

export default function TemplatesTab({ toast }: { toast: (t: Toast) => void }) {
  const [sub, setSub] = useState(0);
  const fields: FieldDef[] = [
    { key: "chave", label: "Chave (identificador)", required: true, helper: "letras, números, _ . -" },
    { key: "nome", label: "Nome", required: true },
    { key: "categoria", label: "Categoria", type: "select", options: CATEGORIAS },
    { key: "canal", label: "Canal (vazio = qualquer)", type: "select", options: ["WHATSAPP", "EMAIL", "SMS", "TELEGRAM", "VOZ"] },
    { key: "assunto", label: "Assunto (e-mail)" },
    { key: "corpo", label: "Mensagem", type: "textarea", required: true, helper: "Use {{nome}}, {{valor}}, {{vencimento}}…" },
  ];
  return (
    <Box>
      <Tabs value={sub} onChange={(_, v) => setSub(v)} sx={{ mb: 2 }}><Tab label="Templates" /><Tab label="Pré-visualização" /><Tab label="Contatos" /></Tabs>
      {sub === 0 && (
        <EduResourcePage title="Templates de mensagem" base={BASE} resource="/templates" fields={fields} filters={[{ key: "categoria", label: "Categoria", options: CATEGORIAS }]}
          columns={[
            { key: "chave", label: "Chave" }, { key: "nome", label: "Nome" }, { key: "categoria", label: "Categoria" },
            { key: "canal", label: "Canal", render: (r) => (r.canal ? ROTULO_CANAL[r.canal] || r.canal : "Qualquer") },
            { key: "corpo", label: "Mensagem", render: (r) => <Typography variant="body2" noWrap sx={{ maxWidth: 360 }} title={r.corpo}>{r.corpo}</Typography> },
            { key: "ativo", label: "Situação", render: (r) => <StatusChip value={r.ativo ? "ATIVO" : "INATIVO"} /> },
          ]} />
      )}
      {sub === 1 && <Preview />}
      {sub === 2 && <Contatos toast={toast} />}
    </Box>
  );
}
