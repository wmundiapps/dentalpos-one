import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Typography, ButtonBase,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import { useEffect, useSyncExternalStore } from "react";
import { eduApi } from "../../services/EduApi";

export interface AmbienteItem {
  id: string; codigo: string; nome: string; nivel: string; modalidade: string; variante?: string | null; unidade?: string | null;
  cor?: string | null; descricao?: string | null; cursos: number; atual: boolean;
}
interface Estado { carregado: boolean; carregando: boolean; erro: string | null; itens: AmbienteItem[]; atual: string | null; todosPermitido: boolean; dialogoAberto: boolean }

// Pequena store global (sem provider): o ambiente é por usuário/sessão e vale para todas as telas do EduMaster.
let estado: Estado = { carregado: false, carregando: false, erro: null, itens: [], atual: null, todosPermitido: false, dialogoAberto: false };
const ouvintes = new Set<() => void>();
const publicar = (p: Partial<Estado>) => { estado = { ...estado, ...p }; ouvintes.forEach((l) => l()); };

function guardarNaAba(id: string | null) {
  try { if (id) sessionStorage.setItem("edu.ambiente", id); else sessionStorage.removeItem("edu.ambiente"); } catch { /* ignore */ }
}

export const NIVEL_ROTULO: Record<string, string> = { GRADUACAO: "Graduação", POS_LATO: "Pós Lato Sensu", POS_STRICTO: "Stricto Sensu", CURSO_LIVRE: "Cursos Livres" };
export const MODALIDADE_ROTULO: Record<string, string> = { PRESENCIAL: "Presencial", EAD: "EAD", HIBRIDO: "Híbrido" };

export async function carregarAmbientes(force = false) {
  if (estado.carregando || (estado.carregado && !force)) return;
  publicar({ carregando: true, erro: null });
  try {
    const r = await eduApi.get<any>("/portal2/ambientes/meus");
    guardarNaAba(r.atual);
    publicar({ itens: r.itens, atual: r.atual, todosPermitido: !!r.todosPermitido, carregado: true, carregando: false });
  } catch (e: any) {
    publicar({ erro: e.message || "Falha ao carregar os ambientes.", carregado: true, carregando: false });
  }
}

export async function selecionarAmbiente(id: string | null) {
  await eduApi.post("/portal2/ambientes/selecionar", { ambienteId: id });
  guardarNaAba(id);
  publicar({ atual: id, dialogoAberto: false, itens: estado.itens.map((i) => ({ ...i, atual: i.id === id })) });
  // as listas já carregadas foram filtradas pelo ambiente anterior: recarrega a tela para refletir o novo contexto
  window.location.reload();
}

export const abrirSeletorAmbiente = () => publicar({ dialogoAberto: true });
export const fecharSeletorAmbiente = () => publicar({ dialogoAberto: false });

const assinar = (l: () => void) => { ouvintes.add(l); return () => { ouvintes.delete(l); }; };

export function useAmbiente() {
  const e = useSyncExternalStore(assinar, () => estado);
  useEffect(() => { void carregarAmbientes(); }, []);
  const atual = e.itens.find((i) => i.id === e.atual) ?? null;
  return { ...e, ambiente: atual };
}

/** Cartão de um ambiente (usado no seletor e na tela inicial). */
export function AmbienteCard({ a, onEscolher }: { a: AmbienteItem; onEscolher?: (a: AmbienteItem) => void }) {
  const cor = a.cor || "#0F5FDB";
  return (
    <ButtonBase onClick={() => onEscolher?.(a)} disabled={!onEscolher} aria-pressed={a.atual} aria-label={`${a.nome}${a.atual ? " (ambiente atual)" : ""}`}
      sx={{ textAlign: "left", display: "block", width: "100%", borderRadius: 3 }}>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, borderWidth: a.atual ? 2 : 1, borderColor: a.atual ? cor : "divider", borderLeft: `6px solid ${cor}`, height: "100%", bgcolor: a.atual ? `${cor}12` : undefined }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography sx={{ fontWeight: 800, flex: 1, lineHeight: 1.2 }}>{a.nome}</Typography>
          {a.atual && <Chip size="small" color="success" icon={<CheckCircleIcon />} label="Ambiente atual" />}
        </Box>
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 1 }}>
          <Chip size="small" label={NIVEL_ROTULO[a.nivel] || a.nivel} />
          <Chip size="small" variant="outlined" label={MODALIDADE_ROTULO[a.modalidade] || a.modalidade} />
          {a.variante && <Chip size="small" variant="outlined" label={a.variante} />}
          {a.unidade && <Chip size="small" variant="outlined" label={a.unidade} />}
        </Box>
        {a.descricao && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{a.descricao}</Typography>}
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>{a.cursos} curso(s)</Typography>
      </Paper>
    </ButtonBase>
  );
}

/** Diálogo "Escolha o ambiente de ensino". Abre sozinho quando o usuário tem 2+ ambientes e ainda não escolheu. */
export function AmbienteDialog() {
  const e = useAmbiente();
  const precisaEscolher = e.carregado && !e.atual && e.itens.length > 1 && !e.todosPermitido;
  useEffect(() => {
    // um único ambiente disponível: seleciona sem perguntar
    if (e.carregado && !e.atual && e.itens.length === 1 && !e.todosPermitido) { void eduApi.post("/portal2/ambientes/selecionar", { ambienteId: e.itens[0].id }).then(() => { guardarNaAba(e.itens[0].id); publicar({ atual: e.itens[0].id, itens: e.itens.map((i) => ({ ...i, atual: true })) }); }).catch(() => undefined); }
  }, [e.carregado, e.atual, e.itens, e.todosPermitido]);
  const aberto = e.dialogoAberto || precisaEscolher;
  return (
    <Dialog open={aberto} onClose={precisaEscolher ? undefined : fecharSeletorAmbiente} fullWidth maxWidth="md" aria-labelledby="amb-titulo">
      <DialogTitle id="amb-titulo">Escolha o ambiente de ensino</DialogTitle>
      <DialogContent dividers>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Seu ambiente define quais cursos, turmas, notas e listas você enxerga em todo o sistema. Você pode trocar a qualquer momento.
        </Typography>
        {e.erro && <Typography color="error">{e.erro}</Typography>}
        {!e.itens.length && e.carregado && !e.erro && <Typography color="text.secondary">Nenhum ambiente disponível para o seu perfil ainda. Fale com a coordenação.</Typography>}
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0,1fr)", sm: "repeat(2, minmax(0,1fr))" } }}>
          {e.itens.map((a) => <AmbienteCard key={a.id} a={a} onEscolher={(x) => { if (!x.atual) void selecionarAmbiente(x.id); else fecharSeletorAmbiente(); }} />)}
        </Box>
      </DialogContent>
      <DialogActions>
        {e.todosPermitido && e.atual && <Button onClick={() => void selecionarAmbiente(null)}>Ver todos os ambientes</Button>}
        {!precisaEscolher && <Button onClick={fecharSeletorAmbiente}>Fechar</Button>}
      </DialogActions>
    </Dialog>
  );
}

/** Chip com o ambiente atual (vai na faixa do EduShell). Clique abre o seletor. */
export function AmbienteChip() {
  const e = useAmbiente();
  if (!e.carregado || (!e.itens.length && !e.todosPermitido)) return <AmbienteDialog />;
  return (
    <>
      <Button size="small" onClick={abrirSeletorAmbiente} startIcon={<LayersOutlinedIcon />} endIcon={<SwapHorizIcon />}
        aria-label="Trocar de ambiente de ensino"
        sx={{ color: "#fff", bgcolor: "rgba(255,255,255,.16)", borderRadius: 5, textTransform: "none", px: 1.5, maxWidth: "100%", "&:hover": { bgcolor: "rgba(255,255,255,.28)" } }}>
        <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: { xs: 190, sm: 360 } }}>{e.ambiente ? e.ambiente.nome : "Todos os ambientes"}</Box>
      </Button>
      <AmbienteDialog />
    </>
  );
}
