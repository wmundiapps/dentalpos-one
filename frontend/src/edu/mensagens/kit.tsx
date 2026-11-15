import { Avatar, Box, Chip } from "@mui/material";
import ApartmentOutlinedIcon from "@mui/icons-material/ApartmentOutlined";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import type { ReactNode } from "react";

export const M = "/mensagens";

export interface Conversa {
  id: string; tipo: "DEPARTAMENTO" | "GRUPO" | "DIRETA"; nome: string; descricao?: string | null; restrito: boolean; arquivado: boolean;
  setor: { id: string; codigo: string; nome: string } | null; outro: { id: string; nome: string; role?: string } | null; participante: boolean; fixado: boolean; silenciado: boolean;
  naoLidas: number; mencoesNaoLidas: number; membros: number; respostaAutomatica: boolean;
  contexto: { tipo: string; id: string; rotulo: string; link: string } | null;
  ultimaMensagemEm: string | null; versao: string;
  ultimaMensagem: { autor: string | null; tipo: string; trecho: string } | null;
}
export interface Anexo { id: string; nome: string; mime?: string; tamanho?: number; externo?: boolean }
export interface Msg {
  id: string; canalId: string; autor: { id: string; nome: string; role?: string } | null; autorTipo: string; tipo: string; minha: boolean; conteudo: string; removida: boolean; editada: boolean; createdAt: string;
  respostaA: { id: string; autor: string | null; trecho: string } | null; mencoes: { usuarios: { id: string; nome: string }[]; setores: { id: string; nome: string; codigo?: string }[] };
  anexos: Anexo[]; metadados: any; fixada: boolean; fixadaPor?: string | null; lidaPor?: number; totalDestinatarios?: number;
}
export interface Meta { usuarioId: string; papel: string; gestor: boolean; gestaoSuperior: boolean; podeEncaminhar: boolean; config: { retencaoDias: number | null; exportacaoAtiva: boolean; anexoMaxKb: number; lembretePedidoMin: number }; tempoReal: { modo: string; resumoSegundos: number; conversaSegundos: number } }

export const ROTULO_PERFIL: Record<string, string> = { ADMIN: "Administração", OWNER: "Mantenedora", RECTOR: "Reitoria", BOARD: "Conselho", COORDINATOR: "Coordenação", TEACHER: "Docente", FINANCE: "Financeiro", SECRETARY: "Secretaria", LIBRARIAN: "Biblioteca", FACILITIES: "Infraestrutura", SUPPLIES: "Suprimentos", MARKETING: "Marketing", ADMISSIONS: "Admissões", SUPPORT: "Atendimento", STAFF: "Equipe", LEGAL: "Jurídico" };
export const ROTULO_CONTEXTO: Record<string, string> = { PROTOCOLO: "Protocolo", ATENDIMENTO: "Atendimento", ALUNO: "Aluno", DOCUMENTO: "Documento emitido", TITULO: "Título financeiro" };
export const ROTULO_MOTIVO: Record<string, string> = { PEDIDO_EXPLICITO: "pediu uma pessoa", SEM_RESPOSTA: "sem resposta automática confiável", SENSIVEL: "assunto sensível" };
export const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
const PALETA = ["#0F766E", "#1D4ED8", "#9333EA", "#B45309", "#BE123C", "#0E7490", "#4D7C0F", "#7C3AED"];
export const corDe = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETA[h % PALETA.length]; };

export function Foto({ nome, tipo, size = 40 }: { nome: string; tipo?: Conversa["tipo"]; size?: number }) {
  if (tipo === "DEPARTAMENTO") return <Avatar variant="rounded" sx={{ width: size, height: size, bgcolor: corDe(nome), borderRadius: 2 }}><ApartmentOutlinedIcon fontSize="small" /></Avatar>;
  if (tipo === "GRUPO") return <Avatar variant="rounded" sx={{ width: size, height: size, bgcolor: corDe(nome), borderRadius: 2 }}><GroupsOutlinedIcon fontSize="small" /></Avatar>;
  return <Avatar sx={{ width: size, height: size, bgcolor: corDe(nome), fontSize: size * 0.4 }}>{iniciais(nome)}</Avatar>;
}
export const IconeTipo = ({ tipo }: { tipo: string }) => tipo === "DEPARTAMENTO" ? <ApartmentOutlinedIcon fontSize="inherit" /> : tipo === "GRUPO" ? <GroupsOutlinedIcon fontSize="inherit" /> : <ForumOutlinedIcon fontSize="inherit" />;
export const ROTULO_TIPO: Record<string, string> = { DEPARTAMENTO: "Departamento", GRUPO: "Grupo", DIRETA: "Direta" };

const mesmaData = (a: Date, b: Date) => a.toDateString() === b.toDateString();
export function horaCurta(v?: string | null) {
  if (!v) return "";
  const d = new Date(v), hoje = new Date();
  if (mesmaData(d, hoje)) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
  if (mesmaData(d, ontem)) return "ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
export const hora = (v: string) => new Date(v).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
export function rotuloDia(v: string) {
  const d = new Date(v), hoje = new Date(), ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
  if (mesmaData(d, hoje)) return "Hoje";
  if (mesmaData(d, ontem)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}
export const dataHora = (v?: string | null) => (v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
export const tamanho = (b?: number) => (!b ? "" : b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);
export const errMsg = (e: any) => (e?.message ? String(e.message) : "Não foi possível concluir a operação.");

/** Texto da mensagem com @menções realçadas. Só texto: nada é interpretado como HTML ou link. */
export function TextoMsg({ texto }: { texto: string }) {
  const partes: ReactNode[] = [];
  const re = /(@[\p{L}\p{N}_-]{2,40})/gu;
  let i = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(texto))) {
    if (m.index > i) partes.push(texto.slice(i, m.index));
    partes.push(<Box component="span" key={k++} sx={{ color: "primary.main", fontWeight: 700, bgcolor: "action.selected", px: 0.4, borderRadius: 0.8 }}>{m[1]}</Box>);
    i = m.index + m[0].length;
  }
  if (i < texto.length) partes.push(texto.slice(i));
  return <Box component="span" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{partes}</Box>;
}

export const Selo = ({ children, cor = "default" }: { children: ReactNode; cor?: "default" | "primary" | "warning" | "error" | "success" | "info" }) => <Chip size="small" color={cor} label={children} sx={{ height: 20, fontSize: 11 }} />;
