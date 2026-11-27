import { useMemo, useState } from "react";
import { Alert, Box, Chip, Collapse, IconButton, InputAdornment, List, ListItemButton, ListItemText, Paper, TextField, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import CloseIcon from "@mui/icons-material/Close";
import SendIcon from "@mui/icons-material/Send";
import { useLocation, useNavigate } from "react-router-dom";
import { navigationGroups } from "../config/navigation";
import { ajudaDoItem, groupHelp } from "../config/menuHelp";
import { eduApi } from "../services/EduApi";

const LEITURA = "treinamento.min.v1";
/** A caixinha é permanente: fica em todas as telas (pode ser minimizada, nunca removida). */
const lido = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const grava = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const STOP = new Set(["onde","como","para","que","de","do","da","dos","das","o","a","os","as","um","uma","no","na","em","eu","posso","encontro","encontrar","fazer","ver","achar","qual","quero","e","por"]);

/** Procura nas telas do menu (nome, grupo, "para que serve" e "como usar"). */
function pesquisar(q: string) {
  const termos = norm(q).split(/[^a-z0-9]+/).filter(t => t.length > 1 && !STOP.has(t));
  if (!termos.length) return [];
  const out: { path: string; titulo: string; grupo: string; pontos: number }[] = [];
  const vistos = new Set<string>();
  for (const g of navigationGroups) for (const it of g.items) {
    if (vistos.has(it.path)) continue; vistos.add(it.path);
    const h = ajudaDoItem(it.path, it.label);
    const nome = norm(it.label), grupo = norm(g.label), corpo = norm(h.serve + " " + h.uso);
    let pontos = 0;
    for (const t of termos) {
      const raiz = t.length > 4 ? t.slice(0, -1) : t;
      if (nome.includes(raiz)) pontos += 5; else if (grupo.includes(raiz)) pontos += 2; else if (corpo.includes(raiz)) pontos += 1; else { pontos = -1000; break; }
    }
    if (pontos > 0) out.push({ path: it.path, titulo: it.label, grupo: g.label, pontos });
  }
  return out.sort((a, b) => b.pontos - a.pontos).slice(0, 6);
}

interface Turno { pergunta: string; resposta: string; limite?: boolean }

/** Aba "Perguntar": central de ajuda com IA, sem identificar o fornecedor/modelo na tela. */
function PerguntarTab({ modulo }: { modulo?: string }) {
  const loc = useLocation();
  const [pergunta, setPergunta] = useState("");
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [avisoLimite, setAvisoLimite] = useState<string | null>(null);

  async function perguntar() {
    const texto = pergunta.trim();
    if (texto.length < 3 || enviando) return;
    setEnviando(true); setPergunta("");
    try {
      const r = await eduApi.post<{ resposta: string; limite?: boolean; proximaAtualizacao?: string }>("/ajuda-ia/perguntar", {
        pergunta: texto, pagina: loc.pathname, modulo,
      });
      setTurnos((t) => [...t, { pergunta: texto, resposta: r.resposta, limite: !!r.limite }]);
      if (r.limite) setAvisoLimite(r.proximaAtualizacao ? `Próxima atualização em ${r.proximaAtualizacao}.` : null);
    } catch (e: any) {
      setTurnos((t) => [...t, { pergunta: texto, resposta: e?.message || "Não foi possível responder agora. Tente novamente.", limite: true }]);
    } finally { setEnviando(false); }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
        Pergunte aqui dúvidas de uso do sistema, instruções e orientações. Modo demonstrativo: as respostas são limitadas por mês.
      </Typography>
      {avisoLimite && <Alert severity="info" sx={{ fontSize: 12.5 }}>{avisoLimite}</Alert>}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, maxHeight: 220, overflowY: "auto" }}>
        {turnos.map((t, i) => (
          <Box key={i} sx={{ display: "grid", gap: 0.5 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 800, alignSelf: "flex-end", bgcolor: "action.hover", borderRadius: 2, px: 1, py: 0.5 }}>{t.pergunta}</Typography>
            <Typography sx={{ fontSize: 13, bgcolor: t.limite ? "warning.light" : "primary.main", color: t.limite ? "text.primary" : "#fff", borderRadius: 2, px: 1, py: 0.6 }}>{t.resposta}</Typography>
          </Box>
        ))}
        {!turnos.length && <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Exemplo: "como eu emito um boletim?" ou "para que serve a régua de cobrança?"</Typography>}
      </Box>
      <Box sx={{ display: "flex", gap: 1 }}>
        <TextField size="small" fullWidth placeholder="Escreva sua pergunta…" value={pergunta}
          onChange={(e) => setPergunta(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void perguntar(); }} disabled={enviando} />
        <IconButton color="primary" onClick={() => void perguntar()} disabled={enviando || pergunta.trim().length < 3} aria-label="Perguntar">
          <SendIcon fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  );
}

export default function AssistenteTreinamento() {
  const loc = useLocation();
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const achados = useMemo(() => pesquisar(busca), [busca]);
  const [minimizado, setMinimizado] = useState(() => lido(LEITURA) === "1");
  const [aba, setAba] = useState<"buscar" | "perguntar">("buscar");

  const atual = useMemo(() => {
    const full = loc.pathname + loc.search;
    for (const g of navigationGroups) {
      const it = g.items.find(i => i.path === full) ?? g.items.find(i => i.path === loc.pathname);
      if (it) return { grupo: g.label, titulo: it.label, ajuda: ajudaDoItem(it.path, it.label) };
    }
    return null;
  }, [loc.pathname, loc.search]);

  const grupoAjuda = atual ? groupHelp[atual.grupo] : undefined;

  return <Box className="no-print" sx={{ position: "fixed", right: 16, bottom: 16, zIndex: 1300, width: { xs: "calc(100vw - 32px)", sm: 340 } }}>
    <Paper elevation={8} sx={{ borderRadius: 3, overflow: "hidden", border: "1px solid", borderColor: "divider" }}>
      <Box onClick={() => { const v = !minimizado; setMinimizado(v); grava(LEITURA, v ? "1" : "0"); }}
        sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 1, bgcolor: "primary.main", color: "#fff", cursor: "pointer" }}>
        <SchoolOutlinedIcon fontSize="small" />
        <Typography sx={{ flex: 1, fontWeight: 800, fontSize: 14 }}>Assistente de treinamento</Typography>
        <IconButton size="small" sx={{ color: "#fff" }} aria-label={minimizado ? "Abrir" : "Minimizar"}>
          <CloseIcon fontSize="small" sx={{ transform: minimizado ? "rotate(45deg)" : "none" }} />
        </IconButton>
      </Box>
      <Collapse in={!minimizado}>
        <Box sx={{ px: 1.5, pt: 1, display: "flex", gap: 0.75 }}>
          <Chip size="small" label="Buscar na ajuda" color={aba === "buscar" ? "primary" : "default"} variant={aba === "buscar" ? "filled" : "outlined"} onClick={() => setAba("buscar")} />
          <Chip size="small" label="Perguntar" color={aba === "perguntar" ? "primary" : "default"} variant={aba === "perguntar" ? "filled" : "outlined"} onClick={() => setAba("perguntar")} />
        </Box>
        <Box sx={{ p: 1.5, maxHeight: "50vh", overflowY: "auto" }}>
          {aba === "perguntar" ? <PerguntarTab modulo={atual?.titulo} /> : <>
            <TextField size="small" fullWidth placeholder="Onde encontro...? (ex.: boleto, estágio, notas)" value={busca}
              onChange={e => setBusca(e.target.value)} sx={{ mb: 1 }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
            {busca.trim() ? (achados.length ? <List dense disablePadding>
              {achados.map(a => <ListItemButton key={a.path} onClick={() => { navigate(a.path); setBusca(""); }} sx={{ borderRadius: 1 }}>
                <ListItemText primary={a.titulo} secondary={a.grupo} slotProps={{ primary: { sx: { fontWeight: 700, fontSize: 13.5 } } }} />
              </ListItemButton>)}
            </List> : <Typography sx={{ fontSize: 13.5 }}>Não encontrei essa palavra. Tente outra, por exemplo: aluno, boleto, nota, estágio.</Typography>)
            : atual ? <>
              <Typography sx={{ fontWeight: 800 }}>{atual.titulo}</Typography>
              <Typography variant="caption" sx={{ fontWeight: 800, color: "primary.main" }}>PARA QUE SERVE</Typography>
              <Typography sx={{ fontSize: 13.5, mb: 1 }}>{atual.ajuda.serve}</Typography>
              <Typography variant="caption" sx={{ fontWeight: 800, color: "primary.main" }}>COMO USAR</Typography>
              <Typography sx={{ fontSize: 13.5, mb: 1 }}>{atual.ajuda.uso}</Typography>
              {grupoAjuda && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Área: {atual.grupo}. {grupoAjuda.serve}</Typography>}
            </> : <Typography sx={{ fontSize: 13.5 }}>
              Clique no ícone <b>?</b> ao lado de cada item do menu para ver para que serve e como usar. Ao abrir uma tela, a explicação dela aparece aqui.
            </Typography>}
          </>}
        </Box>
      </Collapse>
    </Paper>
  </Box>;
}
