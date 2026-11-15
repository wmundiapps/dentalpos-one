import { Alert, Box, Button, Dialog, DialogContent, DialogTitle, IconButton, Tab, Tabs, Typography, useMediaQuery, useTheme } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useState } from "react";
import { Async, Empty, FormDialog, Panel, Stat, StatGrid, Tabela, Tag, brl, fmtDate, fmtDateTime, num, useApi, useToast, type Field } from "./host";
import { ROTULO_REGIME, Situacao, api, abrirHtml, baixar, compMes, docFmt, ehContador, hojeIso, lerArquivo, usePrompt, Simulado } from "./kit";
import { camposCliente } from "./ClientesTab";
import LgpdCliente from "./LgpdCliente";

const P = "/contabil/carteira";
const PAPEIS = ["SOCIO", "FINANCEIRO", "FISCAL", "RH", "CONTATO_GERAL", "OUTRO"];

function VinculoFiscal({ id }: { id: string }) {
  const st = useApi<any>(`${P}/clientes/${id}/vinculo-fiscal`);
  const toast = useToast();
  return (
    <Panel title="Módulo fiscal" subtitle="Guias e pendências fiscais deste cliente vêm da empresa vinculada; sem vínculo, vale o lançamento manual de guias." sx={{ mt: 2 }}>
      <Async state={st}>{(v) => v.empresaId ? (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}><Tag text="Vinculado à empresa do módulo fiscal" tone="success" />{ehContador() ? <Button size="small" color="error" onClick={() => toast.run(() => api.del(`/clientes/${id}/vinculo-fiscal`), "Vínculo removido.", st.reload, "Remover o vínculo com o módulo fiscal?")}>Desvincular</Button> : null}</Box>
      ) : !v.moduloFiscalConectado ? <Typography variant="body2" color="text.secondary">Módulo fiscal não conectado: as guias são lançadas manualmente (aba Financeiro).</Typography> : (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          <Typography variant="body2">{v.sugestao ? <>Empresa encontrada pelo CNPJ/CPF: <b>{v.sugestao.nome}</b>.</> : "Nenhuma empresa com este CNPJ/CPF no módulo fiscal."}</Typography>
          {v.sugestao && ehContador() ? <Button size="small" variant="contained" onClick={() => toast.run(() => api.post(`/clientes/${id}/vinculo-fiscal`, { auto: true }), "Cliente vinculado.", st.reload)}>Vincular</Button> : null}
        </Box>
      )}</Async>
      {toast.node}
    </Panel>
  );
}

function Dados({ c, op, reload }: { c: any; op: any; reload: () => void }) {
  const [edit, setEdit] = useState(false);
  const [status, setStatus] = useState(false);
  const toast = useToast();
  const pr = usePrompt();
  const e = c.endereco || {};
  return (
    <>
      <StatGrid min={150}>
        <Stat label="Situação" value={<Situacao value={c.status} />} /><Stat label="Regime" value={ROTULO_REGIME[c.regime] || "—"} />
        <Stat label="Contrato vigente" value={c.contratoVigente ? brl(c.contratoVigente.valorMensal) : "—"} hint={c.contratoVigente ? `nº ${c.contratoVigente.numero}` : "sem contrato"} />
        <Stat label="Tarefas abertas" value={c.tarefasAbertas} hint={`${c.honorariosAbertos} honorário(s) em aberto`} />
      </StatGrid>
      <Panel title="Dados cadastrais" actions={ehContador() && !c.anonimizadoEm ? <Box sx={{ display: "flex", gap: 1 }}><Button size="small" onClick={() => setEdit(true)}>Editar</Button><Button size="small" onClick={() => setStatus(true)}>Mudar situação</Button></Box> : null}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1 }}>
          {[["CNPJ / CPF", docFmt(c.documento)], ["Nome fantasia", c.nomeFantasia], ["CNAE principal", c.cnaePrincipal], ["Segmento", c.segmento], ["Origem", c.origem], ["Responsável", c.responsavelNome], ["Analista", c.analistaNome],
            ["Abertura / nascimento", c.dataAbertura ? fmtDate(c.dataAbertura) : null], ["E-mail", c.email], ["Telefone", c.telefone], ["Endereço", [e.logradouro, e.numero, e.bairro, e.cidade, e.uf, e.cep].filter(Boolean).join(", ") || null]].map(([k, v]) => (
            <Typography key={String(k)} variant="body2"><Typography component="span" variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: "block" }}>{k}</Typography>{(v as string) || "—"}</Typography>
          ))}
        </Box>
        {(c.tags || []).length ? <Box sx={{ mt: 1.5, display: "flex", gap: 0.5, flexWrap: "wrap" }}>{c.tags.map((t: string) => <Tag key={t} text={t} />)}</Box> : null}
        {c.observacoes ? <Alert severity="info" sx={{ mt: 1.5 }}>{c.observacoes}</Alert> : null}
      </Panel>
      {!c.anonimizadoEm ? <VinculoFiscal id={c.id} /> : null}
      <FormDialog open={edit} title="Editar cliente" fields={camposCliente(op).filter((f) => f.key !== "status")} initial={{ ...c, dataAbertura: c.dataAbertura }} onClose={() => setEdit(false)} onSubmit={async (b) => { await api.put(`/clientes/${c.id}`, b); toast.ok("Cliente atualizado."); reload(); }} />
      <FormDialog open={status} title="Mudar situação" fields={[{ key: "status", label: "Nova situação", type: "select", options: ["PROSPECTO", "ATIVO", "SUSPENSO", "ENCERRADO"], required: true }, { key: "motivo", label: "Motivo (obrigatório para suspender/encerrar)", type: "textarea" }]} onClose={() => setStatus(false)} onSubmit={async (b) => { await api.patch(`/clientes/${c.id}/status`, b); toast.ok("Situação alterada."); reload(); }} />
      {toast.node}{pr.node}
    </>
  );
}

function Pessoas({ c, reload }: { c: any; reload: () => void }) {
  const [contato, setContato] = useState<any>(null);
  const [socio, setSocio] = useState<any>(null);
  const toast = useToast();
  const cfC: Field[] = [{ key: "nome", label: "Nome", required: true }, { key: "papel", label: "Papel", type: "select", options: PAPEIS, def: "OUTRO" }, { key: "email", label: "E-mail" }, { key: "telefone", label: "Telefone" }, { key: "whatsapp", label: "WhatsApp" }, { key: "principal", label: "Contato principal", type: "bool" }];
  const cfS: Field[] = [{ key: "nome", label: "Nome", required: true }, { key: "cpf", label: "CPF" }, { key: "participacao", label: "Participação (%)", type: "number" }, { key: "administrador", label: "Administrador", type: "bool" }];
  return (
    <>
      <Panel title="Contatos" actions={ehContador() ? <Button size="small" onClick={() => setContato({})}>Novo contato</Button> : null}>
        <Tabela rows={c.contatos} vazio="Sem contatos cadastrados." cols={[{ h: "Nome", r: (r: any) => <>{r.nome}{r.principal ? <Tag text="principal" tone="info" /> : null}</> }, { h: "Papel", r: (r: any) => r.papel.replace(/_/g, " ") }, { h: "E-mail", r: (r: any) => r.email || "—" }, { h: "Telefone / WhatsApp", r: (r: any) => r.whatsapp || r.telefone || "—" },
          { h: "", r: (r: any) => ehContador() ? <><Button size="small" onClick={() => setContato(r)}>Editar</Button><Button size="small" color="error" onClick={() => toast.run(() => api.del(`/clientes/${c.id}/contatos/${r.id}`), "Contato removido.", reload, "Remover este contato?")}>Remover</Button></> : null }]} />
      </Panel>
      <Panel title="Sócios" sx={{ mt: 2 }} actions={ehContador() ? <Button size="small" onClick={() => setSocio({})}>Novo sócio</Button> : null}>
        <Tabela rows={c.socios} vazio="Sem sócios cadastrados." cols={[{ h: "Nome", r: (r: any) => r.nome }, { h: "CPF", r: (r: any) => docFmt(r.cpf) }, { h: "Participação", r: (r: any) => (r.participacao != null ? `${num(r.participacao, 1)}%` : "—") }, { h: "Admin.", r: (r: any) => (r.administrador ? "Sim" : "Não") },
          { h: "", r: (r: any) => ehContador() ? <><Button size="small" onClick={() => setSocio(r)}>Editar</Button><Button size="small" color="error" onClick={() => toast.run(() => api.del(`/clientes/${c.id}/socios/${r.id}`), "Sócio removido.", reload, "Remover este sócio?")}>Remover</Button></> : null }]} />
      </Panel>
      <FormDialog open={!!contato} title={contato?.id ? "Editar contato" : "Novo contato"} fields={cfC} initial={contato} onClose={() => setContato(null)} onSubmit={async (b) => { contato?.id ? await api.put(`/clientes/${c.id}/contatos/${contato.id}`, b) : await api.post(`/clientes/${c.id}/contatos`, b); toast.ok("Contato salvo."); reload(); }} />
      <FormDialog open={!!socio} title={socio?.id ? "Editar sócio" : "Novo sócio"} fields={cfS} initial={socio} onClose={() => setSocio(null)} onSubmit={async (b) => { socio?.id ? await api.put(`/clientes/${c.id}/socios/${socio.id}`, b) : await api.post(`/clientes/${c.id}/socios`, b); toast.ok("Sócio salvo."); reload(); }} />
      {toast.node}
    </>
  );
}

function Anexos({ c, reload }: { c: any; reload: () => void }) {
  const toast = useToast();
  return (
    <Panel title="Anexos" subtitle="Arquivos passam pela varredura de segurança do sistema (tipo real, malware). Máximo 3 MB." actions={ehContador() ? <Button size="small" component="label">Enviar arquivo<input hidden type="file" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; await toast.run(async () => api.post(`/clientes/${c.id}/anexos`, { nome: f.name, mime: f.type || "application/octet-stream", dataUrl: await lerArquivo(f) }), "Anexo enviado.", reload); }} /></Button> : null}>
      <Tabela rows={c.anexos} vazio="Nenhum anexo." cols={[{ h: "Arquivo", r: (r: any) => r.nome }, { h: "Tamanho", r: (r: any) => `${num(r.tamanho / 1024, 0)} KB` }, { h: "Enviado em", r: (r: any) => fmtDateTime(r.createdAt) },
        { h: "", r: (r: any) => <><Button size="small" onClick={() => toast.run(() => baixar(`/clientes/${c.id}/anexos/${r.id}/download`, r.nome), "Download iniciado (registrado no log de acessos).")}>Baixar</Button>{ehContador() ? <Button size="small" color="error" onClick={() => toast.run(() => api.del(`/clientes/${c.id}/anexos/${r.id}`), "Anexo removido.", reload, "Remover o anexo?")}>Remover</Button> : null}</> }]} />
      {toast.node}
    </Panel>
  );
}

function Financeiro({ id }: { id: string }) {
  const ct = useApi<any>(`${P}/contratos?clienteId=${id}`);
  const hn = useApi<any>(`${P}/honorarios?clienteId=${id}&pageSize=24`);
  const gu = useApi<any>(`${P}/clientes/${id}/guias`);
  const toast = useToast();
  const [guia, setGuia] = useState(false);
  return (
    <>
      <Panel title="Contratos de honorários">
        <Async state={ct}>{(d) => <Tabela rows={d.items} vazio="Sem contratos." cols={[{ h: "Nº", r: (r: any) => r.numero }, { h: "Situação", r: (r: any) => <Situacao value={r.status} /> }, { h: "Valor mensal", r: (r: any) => brl(r.valorMensal) }, { h: "Valor hoje (c/ reajuste)", r: (r: any) => brl(r.valorAtual) }, { h: "Início", r: (r: any) => fmtDate(r.inicio) },
          { h: "", r: (r: any) => <Button size="small" onClick={() => toast.run(() => abrirHtml(`/contratos/${r.id}/imprimir`))}>Imprimir</Button> }]} />}</Async>
      </Panel>
      <Panel title="Honorários" sx={{ mt: 2 }}>
        <Async state={hn}>{(d) => <Tabela rows={d.items} vazio="Sem honorários." cols={[{ h: "Competência", r: (r: any) => r.competencia }, { h: "Vencimento", r: (r: any) => fmtDate(r.vencimento) }, { h: "Valor", r: (r: any) => brl(r.valor) }, { h: "Situação", r: (r: any) => <Situacao value={r.situacao} /> }]} />}</Async>
      </Panel>
      <Panel title="Guias" sx={{ mt: 2 }} actions={<Button size="small" onClick={() => setGuia(true)}>Lançar guia</Button>} subtitle="Estimativas/simulações: valide com seu contador antes de pagar.">
        <Async state={gu}>{(d) => <>{d.fiscal?.simulado ? <Typography variant="caption" color="text.secondary">Origem: camada local (módulo fiscal não conectado).</Typography> : null}<Tabela rows={d.items} vazio="Sem guias." cols={[{ h: "Tipo", r: (r: any) => r.tipo }, { h: "Competência", r: (r: any) => r.competencia || "—" }, { h: "Vencimento", r: (r: any) => fmtDate(r.vencimento) }, { h: "Valor", r: (r: any) => brl(r.valor) }, { h: "Situação", r: (r: any) => <Situacao value={r.status} /> },
          { h: "", r: (r: any) => r.status === "ABERTA" && r.origem === "LOCAL" ? <Button size="small" onClick={() => toast.run(() => api.patch(`/guias/${r.id}`, { status: "PAGA" }), "Guia marcada como paga.", gu.reload)}>Marcar paga</Button> : null }]} /></>}</Async>
      </Panel>
      <FormDialog open={guia} title="Lançar guia" fields={[{ key: "tipo", label: "Tipo", type: "select", options: ["DAS", "DARF", "GPS", "FGTS", "ISS", "ICMS", "OUTRA"], required: true }, { key: "competencia", label: "Competência (AAAA-MM)", def: compMes(-1) }, { key: "vencimento", label: "Vencimento", type: "date", required: true, def: hojeIso(5) }, { key: "valor", label: "Valor", type: "number", required: true }]}
        onClose={() => setGuia(false)} onSubmit={async (b) => { await api.post(`/clientes/${id}/guias`, { ...b, vencimento: String(b.vencimento).slice(0, 10) }); toast.ok("Guia lançada."); gu.reload(); }} />
      {toast.node}
    </>
  );
}

function Relacionamento({ c }: { c: any }) {
  const it = useApi<any>(`${P}/clientes/${c.id}/interacoes`);
  const md = useApi<any>(`${P}/modelos-msg`);
  const [nova, setNova] = useState(false);
  const [env, setEnv] = useState(false);
  const toast = useToast();
  return (
    <>
      <Panel title="Histórico de interações" subtitle="Ligações, e-mails, reuniões e WhatsApp são registros manuais; envios feitos pelo sistema são SIMULADOS." actions={<Box sx={{ display: "flex", gap: 1 }}><Button size="small" onClick={() => setNova(true)}>Registrar interação</Button><Button size="small" variant="outlined" onClick={() => setEnv(true)}>Enviar mensagem <Simulado /></Button></Box>}>
        <Async state={it}>{(d) => <Tabela rows={d.items} vazio="Nenhuma interação registrada." cols={[{ h: "Data", r: (r: any) => fmtDateTime(r.em) }, { h: "Tipo", r: (r: any) => <>{r.tipo}{r.simulada ? <Simulado /> : null}</> }, { h: "Assunto", r: (r: any) => r.assunto || "—" }, { h: "Resumo", r: (r: any) => <Typography variant="body2" sx={{ maxWidth: 360 }} noWrap title={r.resumo}>{r.resumo || "—"}</Typography>, hideMobile: true }, { h: "Por", r: (r: any) => r.userNome || "—" }, { h: "Lembrete", r: (r: any) => (r.lembreteEm ? fmtDate(r.lembreteEm) + (r.lembreteFeito ? " ✓" : "") : "—") }]} />}</Async>
      </Panel>
      <FormDialog open={nova} title="Registrar interação" fields={[{ key: "tipo", label: "Tipo", type: "select", options: ["LIGACAO", "EMAIL", "REUNIAO", "WHATSAPP", "NOTA"], required: true, def: "LIGACAO" }, { key: "direcao", label: "Direção", type: "select", options: ["SAIDA", "ENTRADA"], def: "SAIDA" }, { key: "assunto", label: "Assunto" }, { key: "resumo", label: "Resumo", type: "textarea" }, { key: "lembreteEm", label: "Lembrar de retornar em", type: "date" }]}
        onClose={() => setNova(false)} onSubmit={async (b) => { await api.post(`/clientes/${c.id}/interacoes`, b); toast.ok("Interação registrada."); it.reload(); }} />
      <FormDialog open={env} title="Enviar mensagem (SIMULADO)" intro={<Alert severity="warning" sx={{ mb: 2 }}>Nenhuma mensagem é realmente enviada: o sistema registra o envio no histórico. Integre um provedor de e-mail/WhatsApp para enviar de verdade.</Alert>}
        fields={[{ key: "modeloId", label: "Modelo de mensagem", type: "select", options: (md.data?.items || []).filter((m: any) => m.ativo).map((m: any) => ({ value: m.id, label: `${m.nome} (${m.canal})` })), helper: `Variáveis: ${(md.data?.variaveis || []).map((v: string) => `{{${v}}}`).join(" ")}` }, { key: "canal", label: "Canal", type: "select", options: ["EMAIL", "WHATSAPP"] }, { key: "assunto", label: "Assunto (se não usar modelo)" }, { key: "corpo", label: "Mensagem (se não usar modelo)", type: "textarea" }]}
        submitLabel="Simular envio" onClose={() => setEnv(false)} onSubmit={async (b) => { const r = await api.post(`/clientes/${c.id}/enviar`, b); toast.ok(r.aviso || "Envio simulado registrado."); it.reload(); }} />
      {toast.node}
    </>
  );
}

function Saude({ id }: { id: string }) {
  const st = useApi<any>(`${P}/clientes/${id}/saude`);
  return (
    <Async state={st}>{(s) => (
      <Panel title="Saúde do cliente" subtitle="Pontuação de 0 a 100 a partir de pendências, guias, documentos, inadimplência, contato e NPS.">
        <StatGrid min={150}>
          <Stat label="Pontuação" value={s.score} tone={s.nivel === "SAUDAVEL" ? "success" : s.nivel === "ATENCAO" ? "warning" : "error"} hint={s.nivel} />
          <Stat label="Risco de inadimplência" value={s.riscoInadimplencia} tone={s.riscoInadimplencia === "ALTO" ? "error" : s.riscoInadimplencia === "MEDIO" ? "warning" : "success"} />
          <Stat label="Risco fiscal" value={s.riscoFiscal} hint={s.fiscal?.simulado ? "base local (fiscal não conectado)" : "módulo fiscal"} />
          <Stat label="Tarefas atrasadas" value={s.sinais.tarefasAtrasadas} /><Stat label="Guias vencidas / a vencer" value={`${s.sinais.guiasVencidas} / ${s.sinais.guiasAVencer7d}`} />
          <Stat label="Documentos faltando" value={s.sinais.documentosFaltando.length} hint={s.sinais.documentosFaltando.join(", ") || "em dia"} />
        </StatGrid>
        {s.motivos.length ? <Alert severity={s.nivel === "RISCO" ? "error" : "warning"}>{s.motivos.map((m: string) => <div key={m}>• {m}</div>)}</Alert> : <Alert severity="success">Nenhum sinal de alerta.</Alert>}
      </Panel>
    )}</Async>
  );
}

function Portal({ c, reload }: { c: any; reload: () => void }) {
  const msgs = useApi<any>(`${P}/clientes/${c.id}/mensagens-portal`);
  const docs = useApi<any>(`${P}/caixa-documentos?clienteId=${c.id}`);
  const pend = useApi<any>(`${P}/clientes/${c.id}/pendencias-documentos`);
  const [acesso, setAcesso] = useState(false);
  const [resp, setResp] = useState(false);
  const [senha, setSenha] = useState<string | null>(null);
  const toast = useToast();
  const pr = usePrompt();
  const conferir = async (d: any, status: string) => {
    const obs = status === "CONFERIDO" ? undefined : await pr.ask(status === "REJEITADO" ? "Motivo da rejeição (o cliente verá)" : "Explique a pendência (o cliente verá)", { min: 5 });
    if (status !== "CONFERIDO" && !obs) return;
    await toast.run(() => api.patch(`/caixa-documentos/${d.id}`, { status, observacao: obs }), "Documento atualizado.", () => { docs.reload(); pend.reload(); });
  };
  return (
    <>
      <Panel title="Acessos ao portal do cliente" actions={ehContador() && !c.anonimizadoEm ? <Button size="small" onClick={() => setAcesso(true)}>Criar acesso</Button> : null}>
        <Tabela rows={c.portal} vazio="Nenhum acesso criado." cols={[{ h: "Pessoa", r: (r: any) => r.nome || "—" }, { h: "Situação", r: (r: any) => <Tag text={r.ativo ? "ativo" : "revogado"} tone={r.ativo ? "success" : "default"} /> }, { h: "Criado em", r: (r: any) => fmtDate(r.createdAt) },
          { h: "", r: (r: any) => ehContador() ? <><Button size="small" onClick={() => toast.run(async () => { const x = await api.post(`/clientes/${c.id}/portal/acesso/${r.id}/redefinir`, {}); setSenha(x.senhaProvisoria); }, "Senha redefinida.", reload)}>Redefinir senha</Button><Button size="small" color="error" onClick={() => toast.run(() => api.del(`/clientes/${c.id}/portal/acesso/${r.id}`), "Acesso revogado.", reload, "Revogar o acesso deste usuário ao portal?")}>Revogar</Button></> : null }]} />
        {senha ? <Alert severity="warning" sx={{ mt: 1 }} onClose={() => setSenha(null)}>Senha provisória: <b>{senha}</b> — copie agora, ela não será mostrada de novo.</Alert> : null}
      </Panel>
      <Panel title="Caixa de entrada de documentos" sx={{ mt: 2 }} subtitle={`Competência ${pend.data?.competencia || ""}: ${pend.data?.faltando?.length ? "faltando " + pend.data.faltando.join(", ") : "documentos esperados recebidos"}.`}>
        <Async state={docs}>{(d) => <Tabela rows={d.items} vazio="Nenhum documento recebido." cols={[{ h: "Documento", r: (r: any) => r.nome }, { h: "Tipo", r: (r: any) => r.tipo.replace(/_/g, " ") }, { h: "Competência", r: (r: any) => r.competencia || "—" }, { h: "Situação", r: (r: any) => <Situacao value={r.status} /> }, { h: "Recebido", r: (r: any) => fmtDateTime(r.createdAt) },
          { h: "", r: (r: any) => <><Button size="small" onClick={() => toast.run(() => baixar(`/caixa-documentos/${r.id}/download`, r.nome))}>Baixar</Button><Button size="small" onClick={() => conferir(r, "CONFERIDO")}>Conferir</Button><Button size="small" color="warning" onClick={() => conferir(r, "COM_PENDENCIA")}>Pendência</Button><Button size="small" color="error" onClick={() => conferir(r, "REJEITADO")}>Rejeitar</Button></> }]} />}</Async>
      </Panel>
      <Panel title="Mensagens com o cliente" sx={{ mt: 2 }} actions={<Button size="small" onClick={() => setResp(true)}>Responder</Button>}>
        <Async state={msgs}>{(d) => d.items.length ? <Box sx={{ display: "grid", gap: 1 }}>{d.items.map((m: any) => <Box key={m.id} sx={{ p: 1, borderRadius: 2, bgcolor: m.autorTipo === "CLIENTE" ? "action.hover" : "primary.main", color: m.autorTipo === "CLIENTE" ? "text.primary" : "primary.contrastText", ml: m.autorTipo === "CLIENTE" ? 0 : "auto", maxWidth: "85%" }}><Typography variant="caption" sx={{ opacity: 0.8 }}>{m.autorTipo === "CLIENTE" ? "Cliente" : m.autorNome || "Escritório"} · {fmtDateTime(m.createdAt)}</Typography><Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{m.texto}</Typography></Box>)}</Box> : <Empty text="Nenhuma mensagem." />}</Async>
      </Panel>
      <FormDialog open={acesso} title="Criar acesso ao portal" intro={<Alert severity="info" sx={{ mb: 2 }}>O cliente verá apenas as próprias guias, documentos e mensagens. Uma senha provisória será gerada e mostrada uma única vez.</Alert>} fields={[{ key: "nome", label: "Nome da pessoa", required: true }, { key: "email", label: "E-mail de acesso", required: true }]}
        onClose={() => setAcesso(false)} onSubmit={async (b) => { const x = await api.post(`/clientes/${c.id}/portal/acesso`, b); setSenha(x.senhaProvisoria || null); toast.ok("Acesso criado."); reload(); }} />
      <FormDialog open={resp} title="Responder ao cliente" fields={[{ key: "texto", label: "Mensagem", type: "textarea", required: true }]} onClose={() => setResp(false)} onSubmit={async (b) => { await api.post(`/clientes/${c.id}/mensagens-portal`, b); toast.ok("Mensagem enviada ao portal."); msgs.reload(); }} />
      {toast.node}{pr.node}
    </>
  );
}

function Tarefas({ id }: { id: string }) {
  const st = useApi<any>(`${P}/tarefas?clienteId=${id}&pageSize=60`);
  return <Panel title="Tarefas e rotinas do cliente"><Async state={st}>{(d) => <Tabela rows={d.items} vazio="Sem tarefas." cols={[{ h: "Tarefa", r: (r: any) => r.titulo }, { h: "Prazo", r: (r: any) => <span style={{ color: r.atrasada ? "#d32f2f" : undefined }}>{fmtDate(r.prazo)}</span> }, { h: "Situação", r: (r: any) => <Situacao value={r.status} /> }, { h: "Responsável", r: (r: any) => r.responsavelNome || "—" }, { h: "Checklist", r: (r: any) => (r.progresso === null ? "—" : `${r.progresso}%`) }]} />}</Async></Panel>;
}

export default function ClienteFicha({ id, opcoes, onClose, onChanged }: { id: string; opcoes: any; onClose: () => void; onChanged: () => void }) {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("md"));
  const [aba, setAba] = useState(0);
  const st = useApi<any>(`${P}/clientes/${id}`);
  const reload = () => { st.reload(); onChanged(); };
  const nomes = ["Dados", "Pessoas", "Anexos", "Financeiro", "Tarefas", "Relacionamento", "Saúde", "Portal", "LGPD"];
  return (
    <Dialog open fullScreen={mobile} fullWidth maxWidth="lg" onClose={onClose}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, fontWeight: 800 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}><Typography noWrap sx={{ fontWeight: 800 }}>{st.data?.nome || "Cliente"}</Typography>{st.data ? <Typography variant="caption" color="text.secondary">{docFmt(st.data.documento)} · <Situacao value={st.data.status} /></Typography> : null}</Box>
        <IconButton onClick={onClose} aria-label="Fechar"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ bgcolor: "background.default" }}>
        <Tabs value={aba} onChange={(_, v) => setAba(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>{nomes.map((n) => <Tab key={n} label={n} />)}</Tabs>
        <Async state={st}>
          {(c) => (
            <>
              {aba === 0 && <Dados c={c} op={opcoes} reload={reload} />}
              {aba === 1 && <Pessoas c={c} reload={reload} />}
              {aba === 2 && <Anexos c={c} reload={reload} />}
              {aba === 3 && <Financeiro id={c.id} />}
              {aba === 4 && <Tarefas id={c.id} />}
              {aba === 5 && <Relacionamento c={c} />}
              {aba === 6 && <Saude id={c.id} />}
              {aba === 7 && <Portal c={c} reload={reload} />}
              {aba === 8 && <LgpdCliente c={c} reload={reload} />}
            </>
          )}
        </Async>
      </DialogContent>
    </Dialog>
  );
}
