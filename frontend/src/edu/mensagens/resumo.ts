// Estado compartilhado do Mensageiro (contador de não lidas, pedidos de "falar com uma pessoa" e alerta sonoro).
// Um único polling leve (GET /mensagens/resumo) alimenta o cabeçalho e a tela /edu/mensagens. Sem WebSocket/SSE:
// 12 s com a aba visível, 45 s com a aba oculta. Para de consultar se o perfil não tem acesso (403).
import { useEffect, useState } from "react";
import { eduApi } from "../../services/EduApi";

export interface PedidoResumo { id: string; canalId: string; canalNome: string; motivo: string; status: string; createdAt: string; solicitante: { id: string; nome: string }; confianca?: number | null }
export interface Resumo { naoLidas: number; mencoes: number; conversasComNaoLidas: number; pedidos: { total: number; itens: PedidoResumo[] }; agora: string }

const CHAVE_SOM = "edu.msg.alertaSonoro";
const VISIVEL_MS = 12000;
const OCULTA_MS = 45000;

let resumo: Resumo | null = null;
let semAcesso = false;
let erro: string | null = null;
const ouvintes = new Set<() => void>();
let timer: number | undefined;
let rodando = false;
let vistos: Set<string> | null = null;
let ctx: AudioContext | null = null;
let destravado = false;

export const somLigado = () => { try { return localStorage.getItem(CHAVE_SOM) !== "0"; } catch { return true; } };
export function ligarSom(v: boolean) { try { localStorage.setItem(CHAVE_SOM, v ? "1" : "0"); } catch { /* armazenamento indisponível */ } emitir(); }

/** Três toques curtos por Web Audio (sem arquivo). Os navegadores só liberam áudio depois de uma interação do usuário. */
function tocarToques(c: AudioContext) {
  const t0 = c.currentTime;
  [0, 0.26, 0.52].forEach((d, i) => {
    const o = c.createOscillator(); const g = c.createGain();
    o.type = "triangle"; o.frequency.value = i === 2 ? 1046 : 784;
    g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.3, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.2);
    o.connect(g); g.connect(c.destination); o.start(t0 + d); o.stop(t0 + d + 0.22);
  });
}
export function audio(): AudioContext | null {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx!.state === "suspended") void ctx!.resume();
    return ctx;
  } catch { return null; }
}
/** Toca o alerta; devolve false quando o navegador ainda bloqueia o áudio (antes de qualquer clique na página). */
export function tocarAlerta(): boolean {
  const c = audio();
  if (!c || c.state !== "running") return false;
  tocarToques(c);
  return true;
}
export const audioLiberado = () => destravado && !!ctx && ctx.state === "running";

function destravar() {
  destravado = true;
  audio();
  emitir();
}
if (typeof window !== "undefined") {
  const h = () => destravar();
  window.addEventListener("pointerdown", h, { once: true });
  window.addEventListener("keydown", h, { once: true });
}

function emitir() { ouvintes.forEach((f) => f()); }

async function ler() {
  try {
    const r = await eduApi.get<Resumo>("/mensagens/resumo");
    erro = null;
    const ids = new Set(r.pedidos.itens.map((p) => p.id));
    if (vistos && r.pedidos.itens.some((p) => !vistos!.has(p.id)) && somLigado()) tocarAlerta();
    if (vistos && r.pedidos.itens.some((p) => !vistos!.has(p.id))) window.dispatchEvent(new CustomEvent("edu-msg-pedido-novo"));
    vistos = ids;
    resumo = r;
  } catch (e: any) {
    if (e?.status === 403 || e?.status === 401) { semAcesso = true; parar(); }
    else erro = e?.message || "Falha ao consultar o Mensageiro.";
  }
  emitir();
}

function agendar() {
  if (!rodando) return;
  timer = window.setTimeout(async () => { await ler(); agendar(); }, document.hidden ? OCULTA_MS : VISIVEL_MS);
}
function iniciar() {
  if (rodando || semAcesso) return;
  rodando = true;
  void ler().then(agendar);
  document.addEventListener("visibilitychange", aoVoltar);
}
function aoVoltar() { if (!document.hidden && rodando) { window.clearTimeout(timer); void ler().then(agendar); } }
function parar() { rodando = false; window.clearTimeout(timer); document.removeEventListener("visibilitychange", aoVoltar); }

/** Força uma leitura agora (depois de ler/enviar/assumir) sem esperar o próximo ciclo. */
export function atualizarResumo() { if (rodando) { window.clearTimeout(timer); void ler().then(agendar); } }

export function useResumo() {
  const [, setN] = useState(0);
  useEffect(() => {
    const f = () => setN((x) => x + 1);
    ouvintes.add(f);
    iniciar();
    return () => { ouvintes.delete(f); if (!ouvintes.size) { parar(); vistos = null; } };
  }, []);
  return { resumo, semAcesso, erro, som: somLigado(), audioLiberado: audioLiberado() };
}
