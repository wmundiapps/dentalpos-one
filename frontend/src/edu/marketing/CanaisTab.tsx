import { Alert, Box, Chip, Tab, Tabs, Typography } from "@mui/material";
import { useState } from "react";
import { CANAIS, FormDialog, Lista, LoadBox, M, Section, Status, call, fmtDateTime, label, opts, REDES, useApi, useToast, type FormField } from "./kit";

const BASES = ["LEADS", "ALUNOS", "EX_ALUNOS", "CONTATOS"];

function useCampanhas() { const c = useApi<any>(`${M}/campanhas?pageSize=100`); return (c.data?.items ?? []).map((x: any) => ({ value: x.id, label: x.nome })); }

function Disparos() {
  const camps = useCampanhas();
  const seg = useApi<any>(`${M}/segmentos?pageSize=100`);
  const [previa, setPrevia] = useState<any>(null);
  const [rev, setRev] = useState(0);
  const { toast, node } = useToast();
  const fields: FormField[] = [
    { key: "nome", label: "Nome do disparo", required: true, full: true }, { key: "canal", label: "Canal", type: "select", required: true, options: opts(CANAIS) },
    { key: "campanhaId", label: "Campanha", type: "select", options: camps }, { key: "segmentoId", label: "Segmento salvo", type: "select", options: (seg.data?.items ?? []).map((s: any) => ({ value: s.id, label: s.nome })) },
    { key: "base", label: "Base (se não usar segmento)", type: "select", options: opts(BASES) }, { key: "curso", label: "Filtro: curso de interesse (leads)" },
    { key: "finalidade", label: "Finalidade", type: "select", options: opts(["MARKETING", "TRANSACIONAL"]), helper: "Marketing exige opt-in; transacional é só para atendimento solicitado." },
    { key: "assunto", label: "Assunto (e-mail)" }, { key: "corpo", label: "Mensagem — use {{nome}}, {{curso}}, {{consultor}}", type: "textarea", required: true, full: true },
    { key: "agendadoPara", label: "Agendar para", type: "datetime" },
  ];
  return (
    <>
      {node}
      <Lista title="Disparos" path="/disparos" fields={fields} newLabel="Novo disparo" editable={false} refreshKey={rev} search={false} embedded
        toBody={(b) => ({ ...b, filtros: b.curso ? { curso: b.curso } : undefined, curso: undefined })}
        intro={<Alert severity="info" sx={{ mb: 1.5 }}>Provedores de canal em modo <b>simulado</b> (sem credenciais): nada sai da máquina, mas todo o fluxo é real — opt-in, supressão global, janela de horário, limite de frequência e rodapé de descadastro em 1 clique em todas as mensagens.</Alert>}
        filters={[{ key: "status", label: "Situação", options: opts(["RASCUNHO", "AGENDADO", "ENVIANDO", "CONCLUIDO", "CANCELADO"]) }, { key: "canal", label: "Canal", options: opts(CANAIS) }]}
        columns={[
          { label: "Disparo", primary: true, render: (r) => <><b>{r.nome}</b><Typography variant="caption" component="div" color="text.secondary">{r.canal} · {label(r.base)} · {label(r.finalidade)}</Typography></> },
          { label: "Situação", render: (r) => <Status value={r.status} /> }, { label: "Alvo", render: (r) => r.totalAlvo }, { label: "Enviados", render: (r) => r.totalEnviado },
          { label: "Bloqueados", render: (r) => r.totalBloqueado }, { label: "Adiados", hideOnMobile: true, render: (r) => r.totalAgendado }, { label: "Falhas", hideOnMobile: true, render: (r) => r.totalFalha },
        ]}
        rowActions={(r, { run }) => [
          { label: "Prévia (quem receberia)", show: ["RASCUNHO", "AGENDADO"].includes(r.status), onClick: async () => { try { setPrevia({ nome: r.nome, ...(await call("POST", `${M}/disparos/previa`, { canal: r.canal, base: r.base, filtros: r.filtros ?? undefined, finalidade: r.finalidade })) }); } catch (e: any) { toast({ type: "error", text: e.message }); } } },
          { label: "Executar agora", show: ["RASCUNHO", "AGENDADO"].includes(r.status), onClick: () => { void run(async () => { const x: any = await call("POST", `${M}/disparos/${r.id}/executar`); setRev((n) => n + 1); return x; }, "Disparo executado.", "Executar o disparo agora? Contatos sem opt-in ou suprimidos serão bloqueados automaticamente."); } },
          { label: "Cancelar", color: "error", show: ["RASCUNHO", "AGENDADO"].includes(r.status), onClick: () => { void run(() => call("POST", `${M}/disparos/${r.id}/cancelar`), "Cancelado."); } },
        ]} />
      <FormDialog open={!!previa} title={`Prévia — ${previa?.nome ?? ""}`} onClose={() => setPrevia(null)} fields={[]} submitLabel="Fechar" maxWidth="sm" onSubmit={async () => undefined}
        intro={previa && <Box><Typography>Total na audiência: <b>{previa.totalAlvo}</b></Typography><Typography color="success.main">Aptos a receber: <b>{previa.aptos}</b></Typography><Typography color="warning.main">Sem opt-in de marketing: <b>{previa.semOptIn}</b></Typography><Typography color="error">Suprimidos/optaram por sair: <b>{previa.suprimidos}</b></Typography><Typography>Sem destino neste canal: <b>{previa.semDestino}</b></Typography></Box>} />
    </>
  );
}

function Envios() {
  return <Lista title="Envios" path="/envios" embedded search={false} intro={<Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Registro de cada mensagem (destino mascarado). Bloqueios mostram o motivo de conformidade.</Typography>}
    filters={[{ key: "status", label: "Situação", options: opts(["ENVIADO", "BLOQUEADO", "FALHA", "AGENDADO", "CANCELADO"]) }, { key: "canal", label: "Canal", options: opts(CANAIS) }]}
    columns={[{ label: "Quando", primary: true, render: (r) => fmtDateTime(r.createdAt) }, { label: "Canal", render: (r) => r.canal }, { label: "Destino", render: (r) => r.destino }, { label: "Situação", render: (r) => <Status value={r.status} /> }, { label: "Motivo", hideOnMobile: true, render: (r) => r.motivo ?? "—" }, { label: "Simulado", hideOnMobile: true, render: (r) => (r.simulado ? "sim" : "não") }]} />;
}

function Segmentos() {
  return <Lista title="Segmentos" path="/segmentos" embedded newLabel="Novo segmento" deletable
    fields={[{ key: "nome", label: "Nome", required: true }, { key: "base", label: "Base", type: "select", required: true, options: opts(BASES) }, { key: "curso", label: "Curso de interesse (leads)" }, { key: "origem", label: "Origem (leads)" }, { key: "etapa", label: "Etapa (leads)" }, { key: "scoreMin", label: "Score mínimo", type: "number" }]}
    toBody={(b) => ({ nome: b.nome, base: b.base, filtros: Object.fromEntries(["curso", "origem", "etapa", "scoreMin"].filter((k) => b[k] !== undefined && b[k] !== "").map((k) => [k, b[k]])) })}
    columns={[{ label: "Segmento", primary: true, render: (r) => <b>{r.nome}</b> }, { label: "Base", render: (r) => label(r.base) }, { label: "Filtros", render: (r) => (r.filtros ? JSON.stringify(r.filtros) : "—") }]} />;
}

function Cadencias() {
  const [rev, setRev] = useState(0);
  const { toast, node } = useToast();
  return (
    <>
      {node}
      <Lista title="Cadências" path="/cadencias" embedded search={false} refreshKey={rev} newLabel="Nova cadência" editable={false}
        fields={[{ key: "nome", label: "Nome", required: true, full: true }, { key: "gatilho", label: "Gatilho", type: "select", options: opts(["LEAD_NOVO", "LEAD_QUENTE", "MANUAL"]) },
          { key: "canal1", label: "Passo 1 — canal", type: "select", options: opts(CANAIS) }, { key: "corpo1", label: "Passo 1 — mensagem", type: "textarea", full: true }, { key: "assunto1", label: "Passo 1 — assunto (e-mail)" },
          { key: "atraso2", label: "Passo 2 — após (horas)", type: "number" }, { key: "canal2", label: "Passo 2 — canal", type: "select", options: opts(CANAIS) }, { key: "corpo2", label: "Passo 2 — mensagem", type: "textarea", full: true }, { key: "assunto2", label: "Passo 2 — assunto (e-mail)" }]}
        defaults={{ gatilho: "LEAD_NOVO", canal1: "EMAIL", canal2: "EMAIL", atraso2: 48 }}
        toBody={(b) => ({ nome: b.nome, gatilho: b.gatilho || "LEAD_NOVO", passos: [{ atrasoHoras: 0, canal: b.canal1 || "EMAIL", assunto: b.assunto1, corpo: b.corpo1 }, ...(b.corpo2 ? [{ atrasoHoras: Number(b.atraso2 || 24), canal: b.canal2 || "EMAIL", assunto: b.assunto2, corpo: b.corpo2 }] : [])] })}
        intro={<Alert severity="info" sx={{ mb: 1.5 }}>Cadências param sozinhas quando o lead responde, avança de etapa, é perdido/matriculado, se descadastra ou não tem opt-in de marketing.</Alert>}
        extraActions={<Chip clickable label="Executar passos vencidos" onClick={() => call("POST", `${M}/cadencias/executar`).then((r: any) => { toast({ type: "success", text: `${r.enviados} enviados, ${r.parados} paradas.` }); setRev((x) => x + 1); }).catch((e) => toast({ type: "error", text: e.message }))} sx={{ mr: 1 }} />}
        columns={[{ label: "Cadência", primary: true, render: (r) => <><b>{r.nome}</b><Typography variant="caption" component="div" color="text.secondary">{r.passos?.length} passos · gatilho {label(r.gatilho)}</Typography></> }, { label: "Ativa", render: (r) => (r.ativa ? "Sim" : "Não") }, { label: "Execuções", render: (r) => Object.entries(r.execucoes || {}).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—" }]}
        rowActions={(r, { run }) => [{ label: r.ativa ? "Desativar" : "Ativar", onClick: () => { void run(() => call("PATCH", `${M}/cadencias/${r.id}`, { ativa: !r.ativa }), "Atualizada."); } }]} />
    </>
  );
}

function Redes() {
  const camps = useCampanhas();
  return (
    <Lista title="Publicações em redes sociais" path="/publicacoes" embedded search={false} newLabel="Nova publicação" editable={false}
      fields={[{ key: "rede", label: "Rede", type: "select", required: true, options: opts(REDES) }, { key: "campanhaId", label: "Campanha", type: "select", options: camps }, { key: "texto", label: "Texto / legenda", type: "textarea", required: true, full: true }, { key: "midiaUrl", label: "URL da imagem/vídeo (https)", full: true }, { key: "agendadoPara", label: "Agendar para", type: "datetime" }]}
      intro={<Alert severity="info" sx={{ mb: 1.5 }}>Instagram, Facebook, LinkedIn, TikTok e Threads em modo <b>simulado</b>. Fluxo: rascunho → aprovação (gestor) → agendamento → publicação. O job publica o que estiver agendado.</Alert>}
      filters={[{ key: "rede", label: "Rede", options: opts(REDES) }, { key: "status", label: "Situação", options: opts(["RASCUNHO", "EM_APROVACAO", "APROVADA", "AGENDADA", "PUBLICADA", "FALHA", "CANCELADA"]) }]}
      columns={[{ label: "Publicação", primary: true, render: (r) => <><b>{r.rede}</b><Typography variant="caption" component="div" color="text.secondary">{String(r.texto).slice(0, 70)}</Typography></> }, { label: "Agendada", render: (r) => fmtDateTime(r.agendadoPara) }, { label: "Situação", render: (r) => <Status value={r.status} /> }, { label: "Resultado", hideOnMobile: true, render: (r) => (r.metricas ? `alcance ${r.metricas.alcance} · cliques ${r.metricas.cliques}` : r.erro ?? "—") }]}
      rowActions={(r, { run }) => [
        { label: "Enviar para aprovação", show: r.status === "RASCUNHO", onClick: () => { void run(() => call("POST", `${M}/publicacoes/${r.id}/enviar-aprovacao`), "Enviada."); } },
        { label: "Aprovar", show: r.status === "EM_APROVACAO", onClick: () => { void run(() => call("POST", `${M}/publicacoes/${r.id}/aprovar`), "Aprovada."); } },
        { label: "Agendar", show: ["APROVADA", "AGENDADA"].includes(r.status) && !!r.agendadoPara, onClick: () => { void run(() => call("POST", `${M}/publicacoes/${r.id}/agendar`, { agendadoPara: r.agendadoPara }), "Agendada."); } },
        { label: "Publicar agora", show: ["APROVADA", "AGENDADA"].includes(r.status), onClick: () => { void run(() => call("POST", `${M}/publicacoes/${r.id}/publicar`), "Processado."); } },
        { label: "Cancelar", color: "error", show: ["RASCUNHO", "EM_APROVACAO", "APROVADA", "AGENDADA", "FALHA"].includes(r.status), onClick: () => { void run(() => call("POST", `${M}/publicacoes/${r.id}/cancelar`), "Cancelada."); } },
      ]} />
  );
}

function Provedores() {
  const p = useApi<any>(`${M}/provedores`);
  return (
    <Section title="Provedores">
      <LoadBox loading={p.loading} error={p.error} onRetry={p.reload}>
        <Typography variant="body2" sx={{ mb: 1 }}>Canais de disparo e redes usam uma interface de provedor. Sem credenciais, a implementação é <b>simulada</b>; para integrar Twilio, e-mail transacional ou Meta, registre a implementação real mantendo as mesmas verificações de conformidade.</Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>{[...(p.data?.canais ?? []), ...(p.data?.redes ?? [])].map((x: any) => <Chip key={x.canal ?? x.rede} label={`${x.nome}`} color={x.simulado ? "warning" : "success"} />)}</Box>
      </LoadBox>
    </Section>
  );
}

export default function CanaisTab() {
  const [t, setT] = useState(0);
  const SUB = [["Disparos", <Disparos key="d" />], ["Envios", <Envios key="e" />], ["Segmentos", <Segmentos key="s" />], ["Cadências", <Cadencias key="c" />], ["Redes sociais", <Redes key="r" />], ["Provedores", <Provedores key="p" />]] as const;
  return (
    <>
      <Tabs value={t} onChange={(_, v) => setT(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ mb: 2 }}>{SUB.map(([l]) => <Tab key={l} label={l} />)}</Tabs>
      <Section title={SUB[t][0]}>{SUB[t][1]}</Section>
    </>
  );
}
