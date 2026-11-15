import { useEffect, useState } from "react";
import { eduApi } from "../../services/EduApi";

// Acesso por cargo (frontend): quais módulos o cargo do usuário logado NÃO pode abrir (o menu lateral os esconde).
// A fonte da verdade é o backend (403 em /api/edu/<modulo>); aqui é só conveniência de navegação.

/** Prefixo de rota do frontend -> módulo do backend (1º segmento de /api/edu/<modulo>). Rotas fora da lista não são filtradas. */
const ROTA_MODULO: Array<[string, string]> = [
  ["/edu/academico", "academico"], ["/edu/matriculas", "academico"],
  ["/edu/financeiro", "financeiro"], ["/edu/tesouraria", "tesouraria"], ["/edu/cobranca", "cobranca"],
  ["/edu/contabil", "contabil"],
  ["/edu/admissoes", "admissoes"], ["/edu/secretaria", "secretaria"], ["/edu/calendario", "calendario"], ["/edu/notas", "notas"],
  ["/edu/polos-ead", "modalidades"], ["/edu/modalidades", "modalidades"], ["/edu/desempenho", "desempenho"], ["/edu/exames", "exames"],
  ["/edu/biblioteca", "biblioteca"], ["/edu/presenca", "presenca"], ["/edu/pesquisa", "pesquisa"],
  ["/edu/portal-aluno", "portal2"], ["/edu/portal-professor", "portal2"], ["/edu/inicio", "portal2"], ["/edu/ambientes", "portal2"],
  ["/edu/campos-pratica", "campos-pratica"], ["/edu/apoio", "apoio"], ["/edu/comunicacao", "comunicacao"],
  ["/edu/infraestrutura", "infraestrutura"], ["/edu/suprimentos", "suprimentos"], ["/edu/atendimento", "atendimento"], ["/edu/mensagens", "mensagens"],
  ["/edu/analise-docs", "analise-docs"], ["/edu/juridico", "juridico"], ["/edu/rh", "rh"], ["/edu/marketing", "marketing"],
  ["/edu/reitoria", "reitoria"], ["/edu/jornadas", "jornadas"], ["/edu/regulatorio", "regulatorio"],
  ["/edu/governanca", "governanca"], ["/edu/lgpd", "lgpd"], ["/edu/feedback", "feedback"],
];

export function moduloDaRota(path: string): string | null {
  const p = (path || "").split("?")[0];
  const hit = ROTA_MODULO.find(([pref]) => p === pref || p.startsWith(pref + "/"));
  return hit ? hit[1] : null;
}

export const EVENTO_ACESSO = "edu-acesso-atualizado";
/** Avisa o menu para recarregar os módulos efetivos (chamado ao salvar a matriz). */
export const avisarAcessoAtualizado = () => { try { window.dispatchEvent(new Event(EVENTO_ACESSO)); } catch { /* sem window */ } };

/** Módulos bloqueados para o usuário logado. Em caso de erro devolve lista vazia (nada some do menu; o backend segue protegendo). */
export function useModulosBloqueados(): Set<string> {
  const [bloq, setBloq] = useState<Set<string>>(new Set());
  useEffect(() => {
    let vivo = true;
    const carregar = () => {
      if (!localStorage.getItem("dentalpos.token")) return;
      eduApi.get<{ bloqueados: string[] }>("/acesso/meus-modulos")
        .then((r) => { if (vivo) setBloq(new Set(r?.bloqueados || [])); })
        .catch(() => { /* mantém o menu completo */ });
    };
    carregar();
    window.addEventListener(EVENTO_ACESSO, carregar);
    return () => { vivo = false; window.removeEventListener(EVENTO_ACESSO, carregar); };
  }, []);
  return bloq;
}

/** true quando a rota pertence a um módulo bloqueado. */
export const rotaBloqueada = (path: string, bloqueados: Set<string>) => {
  const m = moduloDaRota(path);
  return !!m && bloqueados.has(m);
};
