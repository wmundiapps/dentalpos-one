import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Tab, Tabs, Typography } from "@mui/material";
import { useState, type ReactNode } from "react";
import {
  AlertaChip, AnexosDialog, COLORS, DataList, J, Kpi, KpiRow, LoadBox, Pick, PromptDialog, ResourceTab, Section, Status, call, fmtDate, fmtDateTime, fmtMoney,
  itemsOf, opts, useApi, useIsMobile, useJurOptions, useRunner, useToast, type FormField,
} from "./kit";

export const AREAS = ["CIVEL", "CRIMINAL", "TRABALHISTA", "ADMINISTRATIVO", "TRIBUTARIO", "CONSUMIDOR", "OUTRO"];
const RISCOS = ["PROVAVEL", "POSSIVEL", "REMOTO"];

function RiscoChip({ risco }: { risco: string }) {
  const c = risco === "PROVAVEL" ? COLORS.bad : risco === "POSSIVEL" ? COLORS.warn : COLORS.ok;
  return <Chip size="small" sx={{ bgcolor: c, color: "#fff", fontWeight: 700 }} label={risco.toLowerCase()} />;
}

function Bloco({ titulo, vazio, onAdd, children, addLabel = "Adicionar" }: { titulo: string; vazio: boolean; onAdd?: () => void; children: ReactNode; addLabel?: string }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>{titulo}</Typography>
        {onAdd && <Button size="small" onClick={onAdd}>{addLabel}</Button>}
      </Box>
      {vazio ? <Typography variant="body2" color="text.secondary">Nada registrado.</Typography> : children}
    </Box>
  );
}

function Detalhe({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const mobile = useIsMobile();
  const [rev, setRev] = useState(0);
  const [dlg, setDlg] = useState<string | null>(null);
  const [anexos, setAnexos] = useState(false);
  const l = useApi<any>(`${J}/processos/${id}`, [rev]);
  const { toast, node } = useToast();
  const after = () => { setRev((x) => x + 1); onChange(); };
  const run = useRunner(toast, after);
  const advogados = useJurOptions("/advogados?pageSize=200", (a) => ({ value: a.id, label: a.nome }));
  const p = l.data;
  const aberto = p && p.status !== "ENCERRADO";
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg" fullScreen={mobile}>
      <DialogTitle sx={{ pr: 2 }}>Processo {p?.numeroCnj ?? ""}</DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={l.loading} error={l.error} onRetry={l.reload}>
          {p && <>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5, alignItems: "center" }}>
              <Status value={p.status} /><Chip size="small" label={p.area} /><RiscoChip risco={p.risco} />
              {p.sofrido && <Chip size="small" color="warning" label="processo sofrido" />}{p.segredoJustica && <Chip size="small" color="error" label="segredo de justiça" />}
              {p.resultado && <Chip size="small" color="info" label={`resultado: ${p.resultado.toLowerCase()}`} />}
            </Box>
            <Typography sx={{ fontWeight: 700 }}>{p.assunto}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{[p.classe, p.vara, p.comarca, p.tribunal].filter(Boolean).join(" · ")}</Typography>
            <KpiRow>
              <Kpi title="Valor da causa" value={fmtMoney(p.valorCausa)} /><Kpi title="Provisão" value={fmtMoney(p.provisaoValor)} color={p.provisaoValor ? COLORS.warn : undefined} />
              <Kpi title="Posição da instituição" value={p.posicao.toLowerCase()} /><Kpi title="Distribuição" value={fmtDate(p.dataDistribuicao)} />
            </KpiRow>
            <Typography variant="body2" sx={{ mb: 1 }}>Causa raiz: <b>{p.causaRaiz?.replace(/_/g, " ") ?? "não classificada"}</b> · Setor de origem: <b>{p.setorOrigem ?? "—"}</b> · Advogado: <b>{p.advogado?.nome ?? "—"}</b>{p.escritorio ? ` (${p.escritorio.nome})` : ""}</Typography>
            {p.resumo && <Alert severity="info" sx={{ mb: 2, whiteSpace: "pre-line" }}>{p.resumo}</Alert>}
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
              {aberto && <Button variant="outlined" onClick={() => setDlg("risco")}>Reclassificar risco / provisão</Button>}
              {aberto && <Button variant="outlined" color="success" onClick={() => setDlg("encerrar")}>Encerrar processo</Button>}
              {!aberto && <Button variant="outlined" onClick={() => setDlg("reabrir")}>Reabrir</Button>}
              <Button variant="outlined" onClick={() => setAnexos(true)}>Documentos / anexos</Button>
            </Box>

            <Bloco titulo="Prazos" vazio={!p.prazos.length} onAdd={aberto ? () => setDlg("prazo") : undefined} addLabel="Novo prazo">
              <DataList rows={p.prazos} columns={[
                { label: "Prazo", primary: true, render: (x: any) => <>{x.titulo}{x.fatal && <Chip size="small" color="error" label="fatal" sx={{ ml: 0.5 }} />}</> },
                { label: "Data", render: (x: any) => fmtDate(x.dataFatal) }, { label: "Faltam", render: (x: any) => (x.status === "ABERTO" ? <AlertaChip alerta={{ dias: Math.round((new Date(x.dataFatal).getTime() - Date.now()) / 86_400_000), faixa: new Date(x.dataFatal).getTime() < Date.now() ? "VENCIDO" : "D30" }} /> : "—") },
                { label: "Situação", render: (x: any) => <Status value={x.status} /> },
              ]} actions={(x: any) => x.status === "ABERTO" ? (
                <>
                  <Button size="small" color="success" onClick={() => run(() => call("POST", `${J}/prazos/${x.id}/cumprir`, {}), "Prazo cumprido.")}>Cumprido</Button>
                  <Button size="small" color="error" onClick={() => { const o = window.prompt("Explique o que houve com o prazo (mín. 5 caracteres):"); if (o) void run(() => call("POST", `${J}/prazos/${x.id}/perdido`, { observacao: o }), "Prazo marcado como perdido."); }}>Perdido</Button>
                </>) : null} />
            </Bloco>

            <Bloco titulo="Audiências" vazio={!p.audiencias.length} onAdd={aberto ? () => setDlg("audiencia") : undefined} addLabel="Nova audiência">
              <DataList rows={p.audiencias} columns={[
                { label: "Audiência", primary: true, render: (x: any) => x.tipo.replace(/_/g, " ") }, { label: "Data e hora", render: (x: any) => fmtDateTime(x.dataHora) },
                { label: "Local", render: (x: any) => `${x.modalidade.toLowerCase()}${x.local ? " · " + x.local : ""}` }, { label: "Situação", render: (x: any) => <Status value={x.status} /> },
              ]} actions={(x: any) => x.status === "AGENDADA" ? (
                <>
                  <Button size="small" onClick={() => { const o = window.prompt("Resultado da audiência:"); if (o) void run(() => call("POST", `${J}/audiencias/${x.id}/realizar`, { resultado: o }), "Audiência registrada."); }}>Realizada</Button>
                  <Button size="small" onClick={() => { const o = window.prompt("Nova data e hora (AAAA-MM-DDTHH:MM):"); if (o) void run(() => call("POST", `${J}/audiencias/${x.id}/adiar`, { novaDataHora: new Date(o).toISOString() }), "Audiência adiada."); }}>Adiar</Button>
                </>) : null} />
            </Bloco>

            <Bloco titulo="Partes" vazio={!p.partes.length} onAdd={() => setDlg("parte")}>
              <DataList rows={p.partes} columns={[{ label: "Nome", primary: true, render: (x: any) => x.nome }, { label: "Papel", render: (x: any) => x.tipo.replace(/_/g, " ").toLowerCase() }, { label: "Polo", render: (x: any) => x.polo.toLowerCase() }, { label: "Documento", render: (x: any) => x.documento || "—" }]} />
            </Bloco>

            <Bloco titulo="Andamentos" vazio={!p.andamentos.length} onAdd={() => setDlg("andamento")} addLabel="Novo andamento">
              <DataList rows={p.andamentos} columns={[{ label: "Data", primary: true, render: (x: any) => fmtDate(x.data) }, { label: "Tipo", render: (x: any) => x.tipo.toLowerCase() }, { label: "Descrição", render: (x: any) => x.descricao }]} />
            </Bloco>

            <Bloco titulo="Histórico de provisão" vazio={!p.provisoes.length}>
              <DataList rows={p.provisoes} columns={[{ label: "Data", primary: true, render: (x: any) => fmtDate(x.data) }, { label: "Risco", render: (x: any) => x.risco.toLowerCase() }, { label: "Valor", render: (x: any) => `${fmtMoney(x.valorAnterior)} → ${fmtMoney(x.valor)}` }, { label: "Motivo", render: (x: any) => x.motivo || "—" }]} />
            </Bloco>
          </>}
        </LoadBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>

      <PromptDialog open={dlg === "risco"} title="Reclassificar risco / provisão" onClose={() => setDlg(null)}
        intro={<Alert severity="info" sx={{ mb: 2 }}>Provisão contábil só existe para risco <b>provável</b> (CPC 25). Ao mudar para possível/remoto a provisão é revertida e o histórico é mantido.</Alert>}
        fields={[{ key: "risco", label: "Risco", type: "select", required: true, options: opts(RISCOS) }, { key: "provisaoValor", label: "Provisão (R$) — só para provável", type: "number" }, { key: "motivo", label: "Motivo da reclassificação", type: "textarea", required: true }]}
        onSubmit={async (b) => { await call("POST", `${J}/processos/${id}/risco`, b); after(); }} />
      <PromptDialog open={dlg === "encerrar"} title="Encerrar processo" onClose={() => setDlg(null)}
        intro={<Alert severity="warning" sx={{ mb: 2 }}>A provisão será baixada e prazos/audiências abertos serão cancelados.</Alert>}
        fields={[{ key: "resultado", label: "Resultado", type: "select", required: true, options: opts(["GANHO", "PERDIDO", "ACORDO", "PARCIAL"]) }, { key: "valorCondenacao", label: "Valor pago / condenação / acordo (R$)", type: "number" }, { key: "data", label: "Data do encerramento", type: "date" }, { key: "observacao", label: "Observação", type: "textarea" }]}
        onSubmit={async (b) => { await call("POST", `${J}/processos/${id}/encerrar`, b); after(); }} />
      <PromptDialog open={dlg === "reabrir"} title="Reabrir processo" onClose={() => setDlg(null)} fields={[{ key: "motivo", label: "Motivo", type: "textarea", required: true }]}
        onSubmit={async (b) => { await call("POST", `${J}/processos/${id}/reabrir`, b); after(); }} />
      <PromptDialog open={dlg === "prazo"} title="Novo prazo" onClose={() => setDlg(null)}
        fields={[{ key: "titulo", label: "Descrição do prazo", required: true }, { key: "tipo", label: "Tipo", type: "select", options: opts(["CONTESTACAO", "RECURSO", "MANIFESTACAO", "CUMPRIMENTO", "PAGAMENTO", "OUTRO"]) }, { key: "dataFatal", label: "Data fatal", type: "date", required: true }, { key: "fatal", label: "Prazo fatal (improrrogável)", type: "bool" }, { key: "advogadoId", label: "Advogado responsável", type: "select", options: advogados }]}
        onSubmit={async (b) => { await call("POST", `${J}/processos/${id}/prazos`, b); after(); }} />
      <PromptDialog open={dlg === "audiencia"} title="Nova audiência" onClose={() => setDlg(null)}
        fields={[{ key: "tipo", label: "Tipo", type: "select", options: opts(["CONCILIACAO", "INSTRUCAO", "JULGAMENTO", "UNA", "CUSTODIA", "OUTRA"]) }, { key: "dataHora", label: "Data e hora", type: "datetime", required: true }, { key: "modalidade", label: "Modalidade", type: "select", options: opts(["PRESENCIAL", "VIRTUAL"]) }, { key: "local", label: "Local / link" }, { key: "prepostoNome", label: "Preposto" }, { key: "advogadoId", label: "Advogado", type: "select", options: advogados }]}
        onSubmit={async (b) => { await call("POST", `${J}/processos/${id}/audiencias`, b); after(); }} />
      <PromptDialog open={dlg === "parte"} title="Nova parte" onClose={() => setDlg(null)}
        fields={[{ key: "nome", label: "Nome", required: true }, { key: "documento", label: "CPF/CNPJ" }, { key: "tipo", label: "Papel", type: "select", options: opts(["AUTOR", "REU", "TERCEIRO", "TESTEMUNHA", "ADVOGADO_CONTRARIO", "PERITO", "OUTRO"]) }, { key: "polo", label: "Polo", type: "select", options: opts(["ATIVO", "PASSIVO", "OUTRO"]) }]}
        onSubmit={async (b) => { await call("POST", `${J}/processos/${id}/partes`, b); after(); }} />
      <PromptDialog open={dlg === "andamento"} title="Novo andamento" onClose={() => setDlg(null)}
        fields={[{ key: "data", label: "Data", type: "date", required: true }, { key: "tipo", label: "Tipo", type: "select", options: opts(["PETICAO", "DECISAO", "DESPACHO", "SENTENCA", "ACORDAO", "AUDIENCIA", "PUBLICACAO", "RECURSO", "OUTRO"]) }, { key: "descricao", label: "Descrição", type: "textarea", required: true }]}
        onSubmit={async (b) => { await call("POST", `${J}/processos/${id}/andamentos`, b); after(); }} />
      {anexos && <AnexosDialog refType="Processo" refId={id} titulo={p?.numeroCnj} onClose={() => setAnexos(false)} />}
    </Dialog>
  );
}

function Agenda() {
  const [dias, setDias] = useState("30");
  const pz = useApi<any>(`${J}/prazos?status=ABERTO&ateDias=${dias}&pageSize=100`);
  const au = useApi<any>(`${J}/audiencias?status=AGENDADA&ateDias=${dias}&pageSize=100`);
  return (
    <Section title="Agenda jurídica" actions={<Pick label="Horizonte" value={dias} onChange={setDias} options={[{ value: "7", label: "7 dias" }, { value: "15", label: "15 dias" }, { value: "30", label: "30 dias" }, { value: "90", label: "90 dias" }]} minWidth={130} />}>
      <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Prazos</Typography>
      <LoadBox loading={pz.loading} error={pz.error} empty={!itemsOf(pz.data).length} emptyText="Nenhum prazo em aberto no horizonte." onRetry={pz.reload}>
        <DataList rows={itemsOf(pz.data)} columns={[
          { label: "Prazo", primary: true, render: (x: any) => <>{x.titulo}{x.fatal && <Chip size="small" color="error" label="fatal" sx={{ ml: 0.5 }} />}</> },
          { label: "Processo", render: (x: any) => x.processo?.numeroCnj }, { label: "Data", render: (x: any) => fmtDate(x.dataFatal) }, { label: "Faltam", render: (x: any) => <AlertaChip alerta={x.alerta} /> },
        ]} />
      </LoadBox>
      <Typography variant="subtitle1" sx={{ fontWeight: 800, mt: 2 }}>Audiências</Typography>
      <LoadBox loading={au.loading} error={au.error} empty={!itemsOf(au.data).length} emptyText="Nenhuma audiência no horizonte." onRetry={au.reload}>
        <DataList rows={itemsOf(au.data)} columns={[
          { label: "Audiência", primary: true, render: (x: any) => x.tipo.replace(/_/g, " ") }, { label: "Processo", render: (x: any) => x.processo?.numeroCnj },
          { label: "Data e hora", render: (x: any) => fmtDateTime(x.dataHora) }, { label: "Faltam", render: (x: any) => <AlertaChip alerta={x.alerta} /> }, { label: "Local", render: (x: any) => x.local || x.modalidade.toLowerCase() },
        ]} />
      </LoadBox>
    </Section>
  );
}

export default function ProcessosTab() {
  const [sub, setSub] = useState(0);
  const [rev, setRev] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const advogados = useJurOptions("/advogados?pageSize=200", (a) => ({ value: a.id, label: a.nome }));
  const escritorios = useJurOptions("/escritorios?pageSize=200", (a) => ({ value: a.id, label: a.nome }));
  const catalogo = useApi<any>(`${J}/inteligencia/catalogo`);
  const causas = (catalogo.data?.causas || []).map((c: any) => ({ value: c.chave, label: c.rotulo }));
  const FIELDS: FormField[] = [
    { key: "numeroCnj", label: "Número CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO)", required: true, helper: "O dígito verificador é conferido" },
    { key: "area", label: "Área", type: "select", required: true, options: opts(AREAS) }, { key: "assunto", label: "Assunto", required: true, full: true },
    { key: "classe", label: "Classe processual" }, { key: "vara", label: "Vara / juízo" }, { key: "comarca", label: "Comarca" }, { key: "tribunal", label: "Tribunal" }, { key: "uf", label: "UF" },
    { key: "posicao", label: "Posição da instituição", type: "select", options: opts(["REU", "AUTOR", "TERCEIRO", "INVESTIGADO", "VITIMA", "ASSISTENTE"]), helper: "Réu/investigado = processo sofrido" },
    { key: "valorCausa", label: "Valor da causa (R$)", type: "number" }, { key: "risco", label: "Risco de perda", type: "select", options: opts(RISCOS) }, { key: "provisaoValor", label: "Provisão (R$) — só risco provável", type: "number" },
    { key: "dataDistribuicao", label: "Data de distribuição", type: "date" },
    { key: "causaRaiz", label: "Causa raiz", type: "select", options: causas, helper: "Alimenta a inteligência de processos sofridos" }, { key: "setorOrigem", label: "Setor de origem" }, { key: "tipoOrigem", label: "Origem (aluno, docente, fornecedor...)" },
    { key: "advogadoId", label: "Advogado responsável", type: "select", options: advogados }, { key: "escritorioId", label: "Escritório", type: "select", options: escritorios },
    { key: "segredoJustica", label: "Segredo de justiça (restringe o acesso)", type: "bool" }, { key: "resumo", label: "Resumo / observações", type: "textarea" },
  ];
  return (
    <>
      <Section title="Processos judiciais e administrativos">
        <Tabs value={sub} onChange={(_, v) => setSub(v)} variant="scrollable"><Tab label="Processos" /><Tab label="Agenda de prazos e audiências" /><Tab label="Advogados e escritórios" /></Tabs>
      </Section>
      {sub === 0 && <ResourceTab title="Processos" path="/processos" fields={FIELDS} editFields={FIELDS.filter((f) => f.key !== "provisaoValor" && f.key !== "risco")} newLabel="Novo processo" refreshKey={rev} defaults={{ posicao: "REU", risco: "POSSIVEL" }}
        intro={<Alert severity="info" sx={{ mb: 2 }}>Processos criminais e em segredo de justiça só aparecem para a equipe jurídica e a administração. O acesso a processos é registrado (LGPD). Clique em um processo para ver partes, prazos, audiências e andamentos.</Alert>}
        filters={[{ key: "area", label: "Área", options: opts(AREAS) }, { key: "status", label: "Situação", options: opts(["EM_ANDAMENTO", "SUSPENSO", "ARQUIVADO", "ENCERRADO"]) }, { key: "risco", label: "Risco", options: opts(RISCOS) }, { key: "sofrido", label: "Sofrido?", options: [{ value: "true", label: "Sim (réu/investigado)" }, { value: "false", label: "Não" }] }, { key: "causaRaiz", label: "Causa raiz", options: causas }]}
        onRowClick={(r) => setOpen(r.id)}
        columns={[
          { label: "Processo", primary: true, render: (r) => <><b>{r.numeroCnj}</b><Typography variant="caption" component="div" color="text.secondary">{r.assunto}</Typography></> },
          { label: "Área", render: (r) => r.area }, { label: "Posição", hideOnMobile: true, render: (r) => r.posicao.toLowerCase() }, { label: "Valor da causa", render: (r) => fmtMoney(r.valorCausa) },
          { label: "Risco", render: (r) => <RiscoChip risco={r.risco} /> }, { label: "Provisão", render: (r) => (r.provisaoValor ? fmtMoney(r.provisaoValor) : "—") },
          { label: "Causa raiz", hideOnMobile: true, render: (r) => r.causaRaiz?.replace(/_/g, " ").toLowerCase() ?? "—" }, { label: "Situação", render: (r) => <Status value={r.status} /> },
        ]} />}
      {sub === 1 && <Agenda />}
      {sub === 2 && <>
        <ResourceTab title="Escritórios" path="/escritorios" newLabel="Novo escritório" deletable
          fields={[{ key: "nome", label: "Nome", required: true }, { key: "cnpj", label: "CNPJ" }, { key: "contatoNome", label: "Contato" }, { key: "email", label: "E-mail" }, { key: "telefone", label: "Telefone" }, { key: "honorarios", label: "Modelo de honorários", type: "textarea" }]}
          columns={[{ label: "Escritório", primary: true, render: (r) => <b>{r.nome}</b> }, { label: "Contato", render: (r) => r.contatoNome || "—" }, { label: "E-mail", render: (r) => r.email || "—" }, { label: "Advogados", render: (r) => r.advogados?.length ?? 0 }]} />
        <ResourceTab title="Advogados" path="/advogados" newLabel="Novo advogado" deletable
          fields={[{ key: "nome", label: "Nome", required: true }, { key: "oab", label: "OAB" }, { key: "tipo", label: "Vínculo", type: "select", options: opts(["INTERNO", "EXTERNO"]) }, { key: "escritorioId", label: "Escritório", type: "select", options: escritorios }, { key: "email", label: "E-mail" }, { key: "telefone", label: "Telefone" }]}
          filters={[{ key: "tipo", label: "Vínculo", options: opts(["INTERNO", "EXTERNO"]) }]}
          columns={[{ label: "Advogado", primary: true, render: (r) => <b>{r.nome}</b> }, { label: "OAB", render: (r) => r.oab || "—" }, { label: "Vínculo", render: (r) => r.tipo.toLowerCase() }, { label: "Escritório", render: (r) => r.escritorio?.nome ?? "—" }]} />
      </>}
      {open && <Detalhe id={open} onClose={() => setOpen(null)} onChange={() => setRev((x) => x + 1)} />}
    </>
  );
}
