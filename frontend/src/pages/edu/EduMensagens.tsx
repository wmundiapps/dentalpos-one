import { Alert, Box, Button, Paper, Typography, useMediaQuery, useTheme } from "@mui/material";
import AddCommentOutlinedIcon from "@mui/icons-material/AddCommentOutlined";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import PrivacyTipOutlinedIcon from "@mui/icons-material/PrivacyTipOutlined";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import EduShell from "../../edu/EduShell";
import { eduApi } from "../../services/EduApi";
import AlertaPedidos from "../../edu/mensagens/AlertaPedidos";
import Chat from "../../edu/mensagens/Chat";
import { LgpdDialog, NovaConversaDialog, type Ctx } from "../../edu/mensagens/Dialogos";
import Lista, { type Aba } from "../../edu/mensagens/Lista";
import { M, errMsg, type Conversa, type Meta } from "../../edu/mensagens/kit";
import { atualizarResumo, useResumo } from "../../edu/mensagens/resumo";

const LISTA_MS = 8000;

/** Mensageiro interno entre departamentos. Links diretos: ?c=<conversa>, ?u=<usuário> (conversa direta), ?ctx=TIPO:ID (conversa sobre um registro), ?aba=pedidos. */
export default function EduMensagens() {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("md"));
  const [params, setParams] = useSearchParams();
  const { resumo, semAcesso } = useResumo();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [diretorio, setDiretorio] = useState<Conversa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>(params.get("aba") === "pedidos" ? "pedidos" : "conversas");
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<string | null>(params.get("c"));
  const [novo, setNovo] = useState<{ aberto: boolean; ctx: Ctx | null }>({ aberto: false, ctx: null });
  const [lgpd, setLgpd] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const q = busca.trim() ? `&q=${encodeURIComponent(busca.trim())}` : "";
      const [a, d] = await Promise.all([eduApi.get<any>(`${M}/canais?escopo=meus${q}`), eduApi.get<any>(`${M}/canais?escopo=diretorio${q}`)]);
      setConversas(a.items); setDiretorio(d.items); setErro(null);
    } catch (e) { if (!silencioso || !conversas.length) setErro(errMsg(e)); }
    finally { setCarregando(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  useEffect(() => { eduApi.get<Meta>(`${M}/meta`).then(setMeta).catch(() => undefined); }, []);
  useEffect(() => { const t = window.setTimeout(() => void carregar(), busca ? 250 : 0); return () => window.clearTimeout(t); }, [carregar, busca]);
  useEffect(() => { const t = window.setInterval(() => { if (!document.hidden) void carregar(true); }, LISTA_MS); return () => window.clearInterval(t); }, [carregar]);

  const abrir = useCallback((id: string) => { setSel(id); setAba((a) => (a === "pedidos" ? "conversas" : a)); setParams((p) => { const n = new URLSearchParams(p); n.set("c", id); n.delete("ctx"); n.delete("u"); return n; }, { replace: true }); }, [setParams]);
  const voltar = () => { setSel(null); setParams((p) => { const n = new URLSearchParams(p); n.delete("c"); return n; }, { replace: true }); };

  // links diretos: ?u= (conversa direta) e ?ctx= (conversa sobre um registro)
  useEffect(() => {
    const u = params.get("u"), ctx = params.get("ctx");
    if (u) {
      eduApi.post<any>(`${M}/canais`, { tipo: "DIRETA", userId: u }).then((r) => { abrir(r.id); void carregar(true); }).catch((e) => setAviso(errMsg(e)));
    } else if (ctx && /^[A-Z]+:.+/.test(ctx)) {
      const [tipo, ...resto] = ctx.split(":"); const id = resto.join(":");
      eduApi.get<any>(`${M}/canais?escopo=meus&contextoTipo=${tipo}&contextoId=${encodeURIComponent(id)}`).then((r) => {
        if (r.items[0]) abrir(r.items[0].id); else { setNovo({ aberto: true, ctx: { tipo, id } }); setParams((p) => { const n = new URLSearchParams(p); n.delete("ctx"); return n; }, { replace: true }); }
      }).catch((e) => setAviso(errMsg(e)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const naoLidasTotal = useMemo(() => conversas.filter((c) => !c.silenciado).reduce((a, c) => a + c.naoLidas, 0), [conversas]);
  const selecionada = useMemo(() => conversas.find((c) => c.id === sel) ?? diretorio.find((c) => c.id === sel) ?? null, [conversas, diretorio, sel]);
  const mudou = useCallback(() => { void carregar(true); atualizarResumo(); }, [carregar]);

  if (semAcesso) return (
    <EduShell title="Mensageiro interno" subtitle="Conversas entre departamentos." hero={false}>
      <Alert severity="info">O Mensageiro é restrito à equipe interna. Alunos usam o Portal do Aluno para falar com a instituição.</Alert>
    </EduShell>
  );

  const altura = mobile ? "calc(100dvh - 130px)" : "calc(100vh - 150px)";
  const mostrarLista = !mobile || !sel;
  const mostrarChat = !mobile || !!sel;
  return (
    <EduShell hero={false} title="Mensageiro interno" subtitle="Canais por departamento, grupos e conversas diretas, com anexos, menções e vínculo a protocolos, alunos e documentos."
      actions={<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button variant="contained" startIcon={<AddCommentOutlinedIcon />} onClick={() => setNovo({ aberto: true, ctx: null })}>Nova conversa</Button>
        <Button variant="outlined" startIcon={<PrivacyTipOutlinedIcon />} onClick={() => setLgpd(true)}>Privacidade</Button>
      </Box>}>
      {aviso ? <Alert severity="warning" sx={{ mb: 1.5 }} onClose={() => setAviso(null)}>{aviso}</Alert> : null}
      <Box sx={{ mb: 1.5 }}><AlertaPedidos onAbrir={abrir} /></Box>
      <Paper variant="outlined" sx={{ display: "flex", height: altura, minHeight: 460, overflow: "hidden", borderRadius: 3 }}>
        {mostrarLista ? (
          <Box sx={{ width: mobile ? "100%" : 370, flexShrink: 0, borderRight: mobile ? 0 : 1, borderColor: "divider", minWidth: 0 }}>
            <Lista aba={aba} onAba={setAba} conversas={conversas} diretorio={diretorio} carregando={carregando} erro={erro} onRecarregar={() => carregar()} selecionada={sel} onSelecionar={abrir}
              pedidosTotal={resumo?.pedidos.total ?? 0} naoLidasTotal={naoLidasTotal} busca={busca} onBusca={setBusca} />
          </Box>
        ) : null}
        {mostrarChat ? (
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {sel ? <Chat key={sel} canalId={sel} meta={meta} onVoltar={voltar} onMudou={mudou} onAbrir={abrir} /> : (
              <Box sx={{ height: "100%", display: "grid", placeItems: "center", textAlign: "center", p: 3, color: "text.secondary" }}>
                <Box>
                  <ForumOutlinedIcon sx={{ fontSize: 56, opacity: 0.5 }} />
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>Escolha uma conversa</Typography>
                  <Typography variant="body2" sx={{ maxWidth: 380, mx: "auto" }}>Fale com o Financeiro, a Secretaria, o Jurídico e outros departamentos sem sair do sistema. Você pode vincular a conversa a um protocolo, aluno, documento ou título.</Typography>
                  <Button sx={{ mt: 1.5 }} variant="outlined" onClick={() => setNovo({ aberto: true, ctx: null })}>Nova conversa</Button>
                </Box>
              </Box>
            )}
          </Box>
        ) : null}
      </Paper>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        Atualização automática (consulta curta a cada poucos segundos, sem WebSocket). {selecionada ? "" : "Notificações nunca incluem o texto das mensagens."}
      </Typography>
      <NovaConversaDialog aberto={novo.aberto} meta={meta} contextoInicial={novo.ctx} onClose={() => setNovo({ aberto: false, ctx: null })} onCriada={(id) => { abrir(id); mudou(); }} />
      <LgpdDialog aberto={lgpd} onClose={() => setLgpd(false)} meta={meta} conversas={conversas} />
    </EduShell>
  );
}
