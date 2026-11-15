import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, IconButton, List, ListItem, ListItemText,
  MenuItem, Slider, Stack, Switch, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { eduApi } from "../../services/EduApi";
import { DIAS, M, ROTULO_CONTEXTO, ROTULO_PERFIL, dataHora, errMsg, type Conversa, type Meta } from "./kit";

function Moldura({ aberto, titulo, onClose, children, acoes, largura = "sm" }: { aberto: boolean; titulo: string; onClose: () => void; children: ReactNode; acoes?: ReactNode; largura?: "xs" | "sm" | "md" }) {
  const t = useTheme(); const mobile = useMediaQuery(t.breakpoints.down("sm"));
  return (
    <Dialog open={aberto} onClose={onClose} fullWidth maxWidth={largura} fullScreen={mobile} aria-labelledby="msg-dlg">
      <DialogTitle id="msg-dlg" sx={{ fontWeight: 800 }}>{titulo}</DialogTitle>
      <DialogContent dividers>{children}</DialogContent>
      <DialogActions sx={{ px: 2, py: 1.2 }}><Button onClick={onClose}>Fechar</Button>{acoes}</DialogActions>
    </Dialog>
  );
}

// ------------------------------------------------------------ escolher registro do sistema (contexto)
export interface Ctx { tipo: string; id: string; rotulo?: string }
export function ContextoDialog({ aberto, onClose, onEscolher }: { aberto: boolean; onClose: () => void; onEscolher: (c: Ctx | null) => void }) {
  const [tipo, setTipo] = useState("PROTOCOLO");
  const [q, setQ] = useState("");
  const [itens, setItens] = useState<Array<{ id: string; rotulo: string }>>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setCarregando(true); setErro(null);
    const t = window.setTimeout(() => {
      eduApi.get<any>(`${M}/contexto/buscar?tipo=${tipo}&q=${encodeURIComponent(q)}`).then((r) => vivo && setItens(r.items ?? [])).catch((e) => vivo && setErro(errMsg(e))).finally(() => vivo && setCarregando(false));
    }, 250);
    return () => { vivo = false; window.clearTimeout(t); };
  }, [aberto, tipo, q]);
  return (
    <Moldura aberto={aberto} titulo="Vincular a um registro do sistema" onClose={onClose} acoes={<Button color="warning" onClick={() => { onEscolher(null); onClose(); }}>Remover vínculo</Button>}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>A conversa ganha um atalho direto para a tela do registro. Só o rótulo é guardado: nenhum dado pessoal é copiado para o chat.</Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
        <TextField select size="small" label="Tipo" value={tipo} onChange={(e) => { setTipo(e.target.value); setItens([]); }} sx={{ minWidth: 170 }}>
          {Object.entries(ROTULO_CONTEXTO).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
        </TextField>
        <TextField size="small" label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} sx={{ flex: 1, minWidth: 160 }} autoFocus />
      </Box>
      {erro ? <Alert severity="error">{erro}</Alert> : carregando ? <Box sx={{ textAlign: "center", py: 2 }}><CircularProgress size={22} /></Box> : !itens.length ? <Typography color="text.secondary" sx={{ py: 2 }}>Nenhum registro encontrado.</Typography> : (
        <List dense>{itens.map((i) => <ListItem key={i.id} divider secondaryAction={<Button size="small" onClick={() => { onEscolher({ tipo, id: i.id, rotulo: i.rotulo }); onClose(); }}>Vincular</Button>}><ListItemText primary={i.rotulo} /></ListItem>)}</List>
      )}
    </Moldura>
  );
}

// ------------------------------------------------------------ nova conversa
export function NovaConversaDialog({ aberto, onClose, meta, onCriada, contextoInicial }: { aberto: boolean; onClose: () => void; meta: Meta | null; onCriada: (id: string) => void; contextoInicial?: Ctx | null }) {
  const [modo, setModo] = useState<"DIRETA" | "GRUPO" | "DEPARTAMENTO">("DIRETA");
  const [pessoas, setPessoas] = useState<any[]>([]);
  const [setores, setSetores] = useState<any[]>([]);
  const [alvo, setAlvo] = useState<any | null>(null);
  const [membros, setMembros] = useState<any[]>([]);
  const [nome, setNome] = useState("");
  const [desc, setDesc] = useState("");
  const [aberta, setAberta] = useState(false);
  const [setorId, setSetorId] = useState("");
  const [ctx, setCtx] = useState<Ctx | null>(contextoInicial ?? null);
  const [ctxAberto, setCtxAberto] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { if (aberto) setCtx(contextoInicial ?? null); }, [aberto, contextoInicial]);
  useEffect(() => {
    if (!aberto) return;
    eduApi.get<any>(`${M}/usuarios`).then((r) => setPessoas(r.items ?? [])).catch(() => undefined);
    eduApi.get<any>(`${M}/setores`).then((r) => setSetores((r.items ?? []).filter((s: any) => !s.canalId))).catch(() => undefined);
  }, [aberto]);
  const criar = async () => {
    setErro(null); setEnviando(true);
    try {
      const contexto = ctx ? { tipo: ctx.tipo, id: ctx.id } : undefined;
      const r = modo === "DIRETA" ? await eduApi.post<any>(`${M}/canais`, { tipo: "DIRETA", userId: alvo?.id, contexto })
        : modo === "GRUPO" ? await eduApi.post<any>(`${M}/canais`, { tipo: "GRUPO", nome, descricao: desc || undefined, membros: membros.map((m) => m.id), restrito: !aberta, contexto, mensagem: msg || undefined })
          : await eduApi.post<any>(`${M}/canais`, { tipo: "DEPARTAMENTO", setorId, nome: nome || undefined, descricao: desc || undefined });
      if (modo === "DIRETA" && msg.trim()) await eduApi.post(`${M}/canais/${r.id}/mensagens`, { texto: msg.trim() });
      onCriada(r.id); onClose();
      setAlvo(null); setMembros([]); setNome(""); setDesc(""); setMsg(""); setCtx(null);
    } catch (e) { setErro(errMsg(e)); } finally { setEnviando(false); }
  };
  const pronto = modo === "DIRETA" ? !!alvo : modo === "GRUPO" ? nome.trim().length >= 2 : !!setorId;
  const opcPessoa = (p: any) => `${p.nome} · ${ROTULO_PERFIL[p.role] ?? p.role}${p.departamentos?.length ? " · " + p.departamentos.map((d: any) => d.nome).join(", ") : ""}`;
  return (
    <>
      <Moldura aberto={aberto} titulo="Nova conversa" onClose={onClose} acoes={<Button variant="contained" disabled={!pronto || enviando} onClick={criar}>{enviando ? "Criando…" : "Criar"}</Button>}>
        <ToggleButtonGroup exclusive size="small" value={modo} onChange={(_, v) => v && setModo(v)} sx={{ mb: 2, flexWrap: "wrap" }}>
          <ToggleButton value="DIRETA">Conversa direta</ToggleButton>
          <ToggleButton value="GRUPO">Grupo</ToggleButton>
          {meta?.gestor ? <ToggleButton value="DEPARTAMENTO">Canal de departamento</ToggleButton> : null}
        </ToggleButtonGroup>
        {erro ? <Alert severity="error" sx={{ mb: 1.5 }}>{erro}</Alert> : null}
        <Stack spacing={1.5}>
          {modo === "DIRETA" ? <Autocomplete options={pessoas} getOptionLabel={opcPessoa} value={alvo} onChange={(_, v) => setAlvo(v)} renderInput={(p) => <TextField {...p} label="Com quem?" autoFocus />} noOptionsText="Ninguém encontrado" /> : null}
          {modo === "GRUPO" ? (<>
            <TextField label="Nome do grupo" value={nome} onChange={(e) => setNome(e.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }} autoFocus />
            <TextField label="Descrição (opcional)" value={desc} onChange={(e) => setDesc(e.target.value)} slotProps={{ htmlInput: { maxLength: 300 } }} />
            <Autocomplete multiple options={pessoas} getOptionLabel={opcPessoa} value={membros} onChange={(_, v) => setMembros(v)} renderInput={(p) => <TextField {...p} label="Participantes" />} noOptionsText="Ninguém encontrado" />
            {meta?.gestor ? <FormControlLabel control={<Switch checked={aberta} onChange={(e) => setAberta(e.target.checked)} />} label="Aberto a toda a equipe (qualquer pessoa pode entrar)" /> : null}
          </>) : null}
          {modo === "DEPARTAMENTO" ? (<>
            <TextField select label="Departamento (setor do atendimento)" value={setorId} onChange={(e) => setSetorId(e.target.value)} helperText={setores.length ? "Só aparecem setores que ainda não têm canal." : "Todos os setores já têm canal. Crie novos setores na Central de Atendimento."}>
              {setores.map((s) => <MenuItem key={s.id} value={s.id}>{s.nome}</MenuItem>)}
            </TextField>
            <TextField label="Nome do canal (opcional)" value={nome} onChange={(e) => setNome(e.target.value)} />
          </>) : null}
          {modo !== "DEPARTAMENTO" ? (
            <TextField label={modo === "DIRETA" ? "Primeira mensagem (opcional)" : "Mensagem de abertura (opcional)"} value={msg} onChange={(e) => setMsg(e.target.value)} multiline minRows={2} slotProps={{ htmlInput: { maxLength: 4000 } }} />
          ) : null}
          {modo !== "DEPARTAMENTO" ? (
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              {ctx ? <Chip color="primary" variant="outlined" label={`${ROTULO_CONTEXTO[ctx.tipo] ?? ctx.tipo}${ctx.rotulo ? `: ${ctx.rotulo}` : ""}`} onDelete={() => setCtx(null)} /> : <Button size="small" onClick={() => setCtxAberto(true)}>Vincular a protocolo, aluno, documento ou título…</Button>}
            </Box>
          ) : null}
        </Stack>
      </Moldura>
      <ContextoDialog aberto={ctxAberto} onClose={() => setCtxAberto(false)} onEscolher={setCtx} />
    </>
  );
}

// ------------------------------------------------------------ encaminhar atendimento
export function EncaminharDialog({ aberto, onClose, canal, onFeito }: { aberto: boolean; onClose: () => void; canal: { id: string; tipo: string; nome: string }; onFeito: (canalId: string) => void }) {
  const [atd, setAtd] = useState<any | null>(null);
  const [opc, setOpc] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [setores, setSetores] = useState<any[]>([]);
  const [setorId, setSetorId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [env, setEnv] = useState(false);
  useEffect(() => { if (aberto && canal.tipo !== "DEPARTAMENTO") eduApi.get<any>(`${M}/setores`).then((r) => setSetores(r.items ?? [])).catch(() => undefined); }, [aberto, canal.tipo]);
  useEffect(() => {
    if (!aberto) return;
    const t = window.setTimeout(() => eduApi.get<any>(`${M}/contexto/buscar?tipo=ATENDIMENTO&q=${encodeURIComponent(q)}`).then((r) => setOpc(r.items ?? [])).catch(() => undefined), 250);
    return () => window.clearTimeout(t);
  }, [aberto, q]);
  const enviar = async () => {
    setErro(null); setEnv(true);
    try {
      const r = await eduApi.post<any>(`${M}/canais/${canal.id}/encaminhar-atendimento`, { atendimentoId: atd.id, motivo, ...(canal.tipo !== "DEPARTAMENTO" ? { setorId } : {}) });
      onFeito(r.canalId); onClose(); setAtd(null); setMotivo("");
    } catch (e) { setErro(errMsg(e)); } finally { setEnv(false); }
  };
  const ok = !!atd && motivo.trim().length >= 3 && (canal.tipo === "DEPARTAMENTO" || !!setorId);
  return (
    <Moldura aberto={aberto} titulo={canal.tipo === "DEPARTAMENTO" ? `Encaminhar atendimento para ${canal.nome}` : "Encaminhar atendimento a um departamento"} onClose={onClose} acoes={<Button variant="contained" disabled={!ok || env} onClick={enviar}>{env ? "Encaminhando…" : "Encaminhar"}</Button>}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Usa a mesma transferência da Central de Atendimento: muda o setor, reinicia o prazo (SLA), registra o histórico e avisa o departamento neste canal.</Typography>
      {erro ? <Alert severity="error" sx={{ mb: 1.5 }}>{erro}</Alert> : null}
      <Stack spacing={1.5}>
        <Autocomplete options={opc} getOptionLabel={(o) => o.rotulo} filterOptions={(x) => x} value={atd} onChange={(_, v) => setAtd(v)} onInputChange={(_, v, r) => r === "input" && setQ(v)} renderInput={(p) => <TextField {...p} label="Atendimento (número ou assunto)" autoFocus />} noOptionsText="Nenhum atendimento encontrado" />
        {canal.tipo !== "DEPARTAMENTO" ? <TextField select label="Departamento de destino" value={setorId} onChange={(e) => setSetorId(e.target.value)}>{setores.map((s) => <MenuItem key={s.id} value={s.id}>{s.nome}</MenuItem>)}</TextField> : null}
        <TextField label="Motivo do encaminhamento" value={motivo} onChange={(e) => setMotivo(e.target.value)} multiline minRows={2} slotProps={{ htmlInput: { maxLength: 500 } }} helperText="Evite dados pessoais: o aluno e o histórico ficam no atendimento." />
      </Stack>
    </Moldura>
  );
}

// ------------------------------------------------------------ configurações do canal (participantes, resposta automática, FAQ)
export function ConfigCanalDialog({ aberto, onClose, canalId, meta, onMudou }: { aberto: boolean; onClose: () => void; canalId: string; meta: Meta | null; onMudou: () => void }) {
  const [aba, setAba] = useState("participantes");
  const [d, setD] = useState<any | null>(null);
  const [auto, setAuto] = useState<any | null>(null);
  const [faq, setFaq] = useState<any[]>([]);
  const [pessoas, setPessoas] = useState<any[]>([]);
  const [novoMembro, setNovoMembro] = useState<any | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [teste, setTeste] = useState("");
  const [resTeste, setResTeste] = useState<any | null>(null);
  const [novaFaq, setNovaFaq] = useState({ pergunta: "", resposta: "", palavras: "" });
  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const det = await eduApi.get<any>(`${M}/canais/${canalId}`);
      setD(det);
      if (det.tipo === "DEPARTAMENTO") {
        setAuto(await eduApi.get<any>(`${M}/canais/${canalId}/auto`));
        setFaq((await eduApi.get<any>(`${M}/canais/${canalId}/faq`)).items ?? []);
      }
    } catch (e) { setErro(errMsg(e)); }
  }, [canalId]);
  useEffect(() => { if (aberto) { setAba("participantes"); void carregar(); eduApi.get<any>(`${M}/usuarios`).then((r) => setPessoas(r.items ?? [])).catch(() => undefined); } }, [aberto, carregar]);
  const exec = async (fn: () => Promise<any>, msg: string) => { setErro(null); setOk(null); try { await fn(); setOk(msg); await carregar(); onMudou(); } catch (e) { setErro(errMsg(e)); } };
  const podeEditar = !!d?.podeConfigurar;
  const setA = (k: string, v: any) => setAuto((a: any) => ({ ...a, [k]: v }));
  const salvarAuto = () => exec(() => eduApi.put(`${M}/canais/${canalId}/auto`, {
    ativa: auto.ativa, ausenciaAtiva: auto.ausenciaAtiva, mensagemAusencia: auto.mensagemAusencia || null, horarioInicio: auto.horarioInicio, horarioFim: auto.horarioFim, diasSemana: auto.diasSemana,
    respostaAutomatica: auto.respostaAutomatica, confiancaMinima: auto.confiancaMinima, usarConhecimento: auto.usarConhecimento, usarFaqGeral: auto.usarFaqGeral, mensagemSemResposta: auto.mensagemSemResposta || null,
  }), "Resposta automática salva.");
  const testar = async () => { setResTeste(null); try { setResTeste(await eduApi.post(`${M}/canais/${canalId}/auto/testar`, { texto: teste })); } catch (e) { setErro(errMsg(e)); } };
  return (
    <Moldura aberto={aberto} titulo={d ? `Configurar: ${d.nome}` : "Configurar conversa"} onClose={onClose} largura="md">
      {erro ? <Alert severity="error" sx={{ mb: 1.5 }}>{erro}</Alert> : null}
      {ok ? <Alert severity="success" sx={{ mb: 1.5 }} onClose={() => setOk(null)}>{ok}</Alert> : null}
      {!d ? <Box sx={{ textAlign: "center", py: 3 }}><CircularProgress size={24} /></Box> : (<>
        <Tabs value={aba} onChange={(_, v) => setAba(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
          <Tab value="participantes" label="Participantes" />
          {d.tipo === "DEPARTAMENTO" ? <Tab value="auto" label="Resposta automática" /> : null}
          {d.tipo === "DEPARTAMENTO" ? <Tab value="faq" label={`Perguntas frequentes (${faq.length})`} /> : null}
          {d.tipo !== "DIRETA" ? <Tab value="ajustes" label="Ajustes" /> : null}
        </Tabs>

        {aba === "participantes" ? (<>
          {d.tipo === "DEPARTAMENTO" ? <Alert severity="info" sx={{ mb: 1.5 }}>Os integrantes do departamento acompanham o setor na Central de Atendimento. Quem entra por menção ou por conta própria aparece como participante avulso.</Alert> : null}
          {podeEditar && d.tipo !== "DIRETA" ? (
            <Box sx={{ display: "flex", gap: 1, mb: 1.5, flexWrap: "wrap" }}>
              <Autocomplete sx={{ flex: 1, minWidth: 220 }} size="small" options={pessoas.filter((p) => !d.membros.some((m: any) => m.userId === p.id))} getOptionLabel={(p) => `${p.nome} · ${ROTULO_PERFIL[p.role] ?? p.role}`} value={novoMembro} onChange={(_, v) => setNovoMembro(v)} renderInput={(p) => <TextField {...p} label="Adicionar participante" />} />
              <Button variant="outlined" disabled={!novoMembro} onClick={() => exec(async () => { await eduApi.post(`${M}/canais/${canalId}/membros`, { userIds: [novoMembro.id] }); setNovoMembro(null); }, "Participante adicionado.")}>Adicionar</Button>
            </Box>
          ) : null}
          <List dense>
            {d.membros.map((m: any) => (
              <ListItem key={m.userId} divider secondaryAction={podeEditar && d.tipo !== "DIRETA" && m.origem !== "SETOR" ? <Tooltip title="Remover"><IconButton edge="end" aria-label={`Remover ${m.nome}`} onClick={() => exec(() => eduApi.del(`${M}/canais/${canalId}/membros/${m.userId}`), "Participante removido.")}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip> : undefined}>
                <ListItemText primary={<>{m.nome} {m.papel === "ADMIN" ? <Chip size="small" label="admin" sx={{ ml: 0.5 }} /> : null}{m.origem === "SETOR" ? <Chip size="small" variant="outlined" label="do setor" sx={{ ml: 0.5 }} /> : null}</>} secondary={ROTULO_PERFIL[m.role] ?? m.role} />
              </ListItem>
            ))}
          </List>
        </>) : null}

        {aba === "auto" && auto ? (
          <Stack spacing={1.5}>
            <Alert severity="info" icon={<SmartToyOutlinedIcon />}>Responde sozinho a quem <b>não é do departamento</b>: mensagem de ausência fora do horário e respostas da base de perguntas frequentes. Quando não souber, ou se a pessoa pedir alguém, avisa o departamento (notificação, lembrete e alerta sonoro/visual) e abre um pedido. Assuntos sensíveis (saúde, menores, biometria) nunca são analisados.</Alert>
            {!podeEditar ? <Alert severity="warning">Só a gestão ou o administrador do canal altera estas opções.</Alert> : null}
            <FormControlLabel control={<Switch checked={!!auto.ativa} disabled={!podeEditar} onChange={(e) => setA("ativa", e.target.checked)} />} label="Resposta automática ligada neste departamento" />
            <Divider textAlign="left"><Typography variant="caption">Horário e ausência</Typography></Divider>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
              <TextField size="small" type="time" label="Início" value={auto.horarioInicio} disabled={!podeEditar} onChange={(e) => setA("horarioInicio", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField size="small" type="time" label="Fim" value={auto.horarioFim} disabled={!podeEditar} onChange={(e) => setA("horarioFim", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              <Typography variant="caption" color="text.secondary">Horário de Brasília</Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
              {DIAS.map((n, i) => <FormControlLabel key={i} sx={{ mr: 1 }} control={<Checkbox size="small" disabled={!podeEditar} checked={auto.diasSemana.includes(i)} onChange={(e) => setA("diasSemana", e.target.checked ? [...auto.diasSemana, i] : auto.diasSemana.filter((x: number) => x !== i))} />} label={n} />)}
            </Box>
            <FormControlLabel control={<Switch checked={!!auto.ausenciaAtiva} disabled={!podeEditar} onChange={(e) => setA("ausenciaAtiva", e.target.checked)} />} label="Enviar mensagem de ausência fora do horário" />
            <TextField label="Mensagem de ausência" value={auto.mensagemAusencia ?? ""} disabled={!podeEditar} onChange={(e) => setA("mensagemAusencia", e.target.value)} multiline minRows={2} placeholder="Deixe em branco para usar o texto padrão com o horário." slotProps={{ htmlInput: { maxLength: 1000 } }} />
            <Divider textAlign="left"><Typography variant="caption">Perguntas frequentes</Typography></Divider>
            <FormControlLabel control={<Switch checked={!!auto.respostaAutomatica} disabled={!podeEditar} onChange={(e) => setA("respostaAutomatica", e.target.checked)} />} label="Responder perguntas frequentes automaticamente" />
            <Box sx={{ px: 1 }}>
              <Typography variant="body2" id="conf-lbl">Confiança mínima: <b>{Math.round(auto.confiancaMinima * 100)}%</b> <Typography component="span" variant="caption" color="text.secondary">(abaixo disso, chama uma pessoa)</Typography></Typography>
              <Slider aria-labelledby="conf-lbl" value={auto.confiancaMinima} min={0.3} max={0.98} step={0.01} disabled={!podeEditar} onChange={(_, v) => setA("confiancaMinima", v as number)} />
            </Box>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              <FormControlLabel control={<Checkbox checked={!!auto.usarConhecimento} disabled={!podeEditar} onChange={(e) => setA("usarConhecimento", e.target.checked)} />} label="Base do departamento (Atendimento)" />
              <FormControlLabel control={<Checkbox checked={!!auto.usarFaqGeral} disabled={!podeEditar} onChange={(e) => setA("usarFaqGeral", e.target.checked)} />} label="FAQ geral (Comunicação)" />
            </Box>
            <TextField label="Mensagem quando não souber responder" value={auto.mensagemSemResposta ?? ""} disabled={!podeEditar} onChange={(e) => setA("mensagemSemResposta", e.target.value)} multiline minRows={2} placeholder="Deixe em branco para usar o texto padrão." slotProps={{ htmlInput: { maxLength: 1000 } }} />
            {podeEditar ? <Box><Button variant="contained" onClick={salvarAuto}>Salvar resposta automática</Button></Box> : null}
            <Divider textAlign="left"><Typography variant="caption">Testar sem enviar nada</Typography></Divider>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <TextField size="small" sx={{ flex: 1, minWidth: 200 }} label="Pergunta de exemplo" value={teste} onChange={(e) => setTeste(e.target.value)} />
              <Button variant="outlined" disabled={teste.trim().length < 2 || !podeEditar} onClick={testar}>Simular</Button>
            </Box>
            {resTeste ? (
              <Alert severity={resTeste.acao === "FAQ" ? "success" : "warning"}>
                {resTeste.acao === "FAQ" ? <>Responderia sozinho ({Math.round(resTeste.confianca * 100)}% de confiança): “{resTeste.resposta}”</> : resTeste.motivo === "SENSIVEL" ? "Assunto sensível: iria direto para uma pessoa." : resTeste.motivo === "PEDIDO_EXPLICITO" ? "Pediu uma pessoa: abriria o pedido e alertaria o departamento." : <>Sem resposta confiável ({Math.round((resTeste.confianca ?? 0) * 100)}% abaixo do mínimo de {Math.round((resTeste.minimo ?? 0) * 100)}%): chamaria uma pessoa.{resTeste.candidata ? ` Melhor candidata: “${resTeste.candidata}”.` : ""}</>}
              </Alert>
            ) : null}
          </Stack>
        ) : null}

        {aba === "faq" ? (
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">São as mesmas perguntas da Base de conhecimento do Atendimento, vinculadas a este departamento. Perguntas de outros departamentos não aparecem aqui.</Typography>
            <List dense>
              {faq.length === 0 ? <Typography color="text.secondary">Nenhuma pergunta cadastrada para este departamento.</Typography> : null}
              {faq.map((f) => (
                <ListItem key={f.id} divider alignItems="flex-start" secondaryAction={podeEditar ? <Tooltip title="Remover"><IconButton edge="end" aria-label="Remover pergunta" onClick={() => exec(() => eduApi.del(`${M}/canais/${canalId}/faq/${f.id}`), "Pergunta removida.")}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip> : undefined}>
                  <ListItemText primary={f.pergunta} secondary={<>{f.resposta}<br />{f.usos ? `Usada ${f.usos}x` : "Ainda não usada"}</>} />
                </ListItem>
              ))}
            </List>
            {podeEditar ? (
              <Stack spacing={1}>
                <TextField size="small" label="Nova pergunta" value={novaFaq.pergunta} onChange={(e) => setNovaFaq({ ...novaFaq, pergunta: e.target.value })} slotProps={{ htmlInput: { maxLength: 400 } }} />
                <TextField size="small" label="Resposta" value={novaFaq.resposta} onChange={(e) => setNovaFaq({ ...novaFaq, resposta: e.target.value })} multiline minRows={2} slotProps={{ htmlInput: { maxLength: 3000 } }} />
                <TextField size="small" label="Palavras-chave (separadas por vírgula)" value={novaFaq.palavras} onChange={(e) => setNovaFaq({ ...novaFaq, palavras: e.target.value })} />
                <Box><Button variant="contained" disabled={novaFaq.pergunta.trim().length < 5 || novaFaq.resposta.trim().length < 5} onClick={() => exec(async () => { await eduApi.post(`${M}/canais/${canalId}/faq`, { pergunta: novaFaq.pergunta, resposta: novaFaq.resposta, palavrasChave: novaFaq.palavras.split(",").map((s) => s.trim()).filter((s) => s.length > 1) }); setNovaFaq({ pergunta: "", resposta: "", palavras: "" }); }, "Pergunta adicionada.")}>Adicionar pergunta</Button></Box>
              </Stack>
            ) : null}
          </Stack>
        ) : null}

        {aba === "ajustes" ? (
          <Stack spacing={1.5}>
            <TextField label="Nome" defaultValue={d.nome} disabled={!podeEditar} onBlur={(e) => e.target.value !== d.nome && e.target.value.trim().length >= 2 && exec(() => eduApi.patch(`${M}/canais/${canalId}`, { nome: e.target.value.trim() }), "Nome atualizado.")} />
            <TextField label="Descrição" defaultValue={d.descricao ?? ""} disabled={!podeEditar} onBlur={(e) => e.target.value !== (d.descricao ?? "") && exec(() => eduApi.patch(`${M}/canais/${canalId}`, { descricao: e.target.value.trim() || null }), "Descrição atualizada.")} />
            <FormControlLabel control={<Switch checked={!d.restrito} disabled={!podeEditar || !meta?.gestor} onChange={(e) => exec(() => eduApi.patch(`${M}/canais/${canalId}`, { restrito: !e.target.checked }), e.target.checked ? "Canal aberto a toda a equipe." : "Canal restrito aos participantes.")} />} label="Aberto a toda a equipe (qualquer pessoa vê e pode escrever)" />
            <FormControlLabel control={<Switch checked={!!d.arquivado} disabled={!podeEditar} onChange={(e) => exec(() => eduApi.patch(`${M}/canais/${canalId}`, { arquivado: e.target.checked }), e.target.checked ? "Conversa arquivada." : "Conversa reaberta.")} />} label="Arquivada (somente leitura)" />
          </Stack>
        ) : null}
      </>)}
    </Moldura>
  );
}

// ------------------------------------------------------------ LGPD: retenção, exportação e auditoria (gestão superior)
export function LgpdDialog({ aberto, onClose, meta, conversas }: { aberto: boolean; onClose: () => void; meta: Meta | null; conversas: Conversa[] }) {
  const [cfg, setCfg] = useState<any | null>(null);
  const [aud, setAud] = useState<any[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [canal, setCanal] = useState<Conversa | null>(null);
  const [just, setJust] = useState("");
  const [sim, setSim] = useState<any | null>(null);
  const pode = !!meta?.gestaoSuperior;
  const ref = useRef(0);
  const carregar = useCallback(async () => {
    const id = ++ref.current; setErro(null);
    try {
      const c = await eduApi.get<any>(`${M}/config`);
      if (id === ref.current) setCfg(c);
      if (pode) { const a = await eduApi.get<any>(`${M}/auditoria?limite=30`); if (id === ref.current) setAud(a.items ?? []); }
    } catch (e) { setErro(errMsg(e)); }
  }, [pode]);
  useEffect(() => { if (aberto) { setSim(null); void carregar(); } }, [aberto, carregar]);
  const salvar = async (patch: any) => { setErro(null); setOk(null); try { await eduApi.put(`${M}/config`, patch); setOk("Configuração salva."); await carregar(); } catch (e) { setErro(errMsg(e)); } };
  const simular = async (dry: boolean) => {
    setErro(null); setOk(null);
    if (!dry && !window.confirm("Eliminar definitivamente as mensagens (e anexos) mais antigas que o prazo de retenção? Mensagens fixadas são mantidas.")) return;
    try { const r = await eduApi.post<any>(`${M}/retencao/executar`, dry ? { dryRun: true } : { dryRun: false, confirmar: true }); setSim(r); if (!dry) setOk("Retenção executada."); } catch (e) { setErro(errMsg(e)); }
  };
  const exportar = async () => {
    setErro(null); setOk(null);
    try {
      const r = await eduApi.get<any>(`${M}/exportar?canalId=${canal!.id}&justificativa=${encodeURIComponent(just)}`);
      const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `mensagens-${canal!.nome.replace(/\W+/g, "-").toLowerCase()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
      setOk("Exportação gerada e registrada na auditoria."); await carregar();
    } catch (e) { setErro(errMsg(e)); }
  };
  const meusDados = async () => {
    try { const r = await eduApi.get<any>(`${M}/meus-dados/exportar`); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" })); a.download = "minhas-mensagens.json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 30000); } catch (e) { setErro(errMsg(e)); }
  };
  return (
    <Moldura aberto={aberto} titulo="Privacidade, retenção e auditoria" onClose={onClose} largura="md">
      {erro ? <Alert severity="error" sx={{ mb: 1.5 }}>{erro}</Alert> : null}
      {ok ? <Alert severity="success" sx={{ mb: 1.5 }} onClose={() => setOk(null)}>{ok}</Alert> : null}
      <Alert severity="info" sx={{ mb: 2 }}>As notificações nunca levam o texto das mensagens. Conversas diretas só são lidas pelos participantes. Exportação e retenção ficam com a gestão superior e são auditadas.</Alert>
      <Button variant="outlined" size="small" onClick={meusDados} sx={{ mb: 2 }}>Baixar as mensagens que eu escrevi (direito de acesso)</Button>
      {cfg ? (
        <Stack spacing={1.5} sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Retenção</Typography>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <TextField size="small" type="number" label="Guardar por (dias)" defaultValue={cfg.retencaoDias ?? ""} disabled={!pode} sx={{ width: 190 }} helperText="Vazio = não apagar" onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== cfg.retencaoDias) void salvar({ retencaoDias: v }); }} />
            <Button size="small" variant="outlined" disabled={!pode || !cfg.retencaoDias} onClick={() => simular(true)}>Simular</Button>
            <Button size="small" color="error" variant="outlined" disabled={!pode || !cfg.retencaoDias} onClick={() => simular(false)}>Executar agora</Button>
          </Box>
          {sim ? <Alert severity={sim.dryRun ? "info" : "success"}>{sim.dryRun ? "Simulação" : "Executado"}: {sim.mensagens} mensagem(ns) e {sim.anexos} anexo(s) anteriores a {dataHora(sim.corte)}.</Alert> : null}
          <FormControlLabel control={<Switch checked={!!cfg.exportacaoAtiva} disabled={!pode} onChange={(e) => salvar({ exportacaoAtiva: e.target.checked })} />} label="Permitir exportação de conversas de canais e grupos (gestão superior, com justificativa)" />
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            <TextField size="small" type="number" label="Limite de anexo (KB)" defaultValue={cfg.anexoMaxKb} disabled={!pode} sx={{ width: 190 }} onBlur={(e) => Number(e.target.value) !== cfg.anexoMaxKb && salvar({ anexoMaxKb: Number(e.target.value) })} />
            <TextField size="small" type="number" label="Reaviso de pedido (min)" defaultValue={cfg.lembretePedidoMin} disabled={!pode} sx={{ width: 190 }} onBlur={(e) => Number(e.target.value) !== cfg.lembretePedidoMin && salvar({ lembretePedidoMin: Number(e.target.value) })} />
          </Box>
        </Stack>
      ) : !erro ? <Box sx={{ textAlign: "center", py: 2 }}><CircularProgress size={22} /></Box> : null}
      {pode ? (<>
        <Divider sx={{ my: 1.5 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Exportar conversa de canal/grupo</Typography>
        <Stack spacing={1}>
          <Autocomplete size="small" options={conversas.filter((c) => c.tipo !== "DIRETA")} getOptionLabel={(c) => c.nome} value={canal} onChange={(_, v) => setCanal(v)} renderInput={(p) => <TextField {...p} label="Conversa" />} />
          <TextField size="small" label="Justificativa (obrigatória, vai para a auditoria)" value={just} onChange={(e) => setJust(e.target.value)} />
          <Box><Button variant="contained" size="small" disabled={!canal || just.trim().length < 10 || !cfg?.exportacaoAtiva} onClick={exportar}>Exportar (JSON)</Button></Box>
        </Stack>
        <Divider sx={{ my: 1.5 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>Auditoria recente</Typography>
        <List dense sx={{ maxHeight: 220, overflowY: "auto" }}>
          {aud.map((a) => <ListItem key={a.id} divider><ListItemText primary={a.acao.replace(/_/g, " ").toLowerCase()} secondary={`${dataHora(a.em)} · ${a.usuario ?? "sistema"}`} /></ListItem>)}
          {!aud.length ? <Typography color="text.secondary" variant="body2">Sem eventos.</Typography> : null}
        </List>
      </>) : null}
    </Moldura>
  );
}
