import { useEffect, useState } from "react";
import { navigationItems, type NavigationItem } from "./navigation";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface MenuAccess { all: boolean; menuCodes: string[]; legacyModules: string[]; hasLegacy?: boolean }

/** Código de permissão de um item do menu. Ex.: "/financeiro?tipo=Receita" vira "menu.financeiro_tipo_receita". */
export function menuCode(path: string): string {
  const slug = path.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `menu.${slug || "inicio"}`;
}

// Módulo cuja permissão "ver" libera o item enquanto o departamento ainda não foi configurado na tela de Permissões.
// Itens que não aparecem aqui ficam liberados para todos.
const MODULE_BY_PREFIX: Array<[string, string]> = [
  ["/agenda", "agenda"], ["/agendamento-online", "agenda"], ["/painel-atendimentos", "agenda"], ["/avaliacoes-atendimento", "agenda"], ["/equipe", "agenda"],
  ["/pacientes", "patients"], ["/jornada-paciente", "patients"], ["/ficha-paciente", "patients"],
  ["/prontuario", "clinical"], ["/documentos-clinicos", "clinical"], ["/orcamentos-tratamentos", "clinical"], ["/corpo-clinico", "clinical"],
  ["/laboratorio", "laboratory"], ["/design", "design"],
  ["/crm", "marketing"], ["/comunicacoes", "marketing"], ["/revah", "marketing"], ["/prospeccao", "marketing"], ["/recall", "marketing"], ["/marketing", "marketing"], ["/canais-envio", "marketing"],
  ["/financeiro", "finance"], ["/pagamentos", "finance"], ["/recebimentos-online", "finance"], ["/inteligencia-financeira", "finance"], ["/relatorios", "finance"],
  ["/backoffice", "accounting"], ["/contabil-fiscal", "accounting"], ["/automacao-fiscal", "accounting"],
  ["/evidencias-operacionais", "documents"], ["/operacional", "documents"], ["/academico", "documents"],
  ["/rh", "hr"],
  ["/sales", "sales"], ["/estoque", "sales"],
  ["/painel-executivo", "settings"], ["/centro-de-comando", "settings"], ["/centro-de-inteligencia", "settings"], ["/indice-saude-clinica", "settings"], ["/benchmark", "settings"],
  ["/configuracoes", "settings"], ["/clinicas", "settings"], ["/integracoes", "settings"], ["/importar-pacientes", "settings"],
  ["/permissoes", "users"],
];

export function moduleOfPath(pathname: string): string | null {
  const hit = MODULE_BY_PREFIX.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return hit ? hit[1] : null;
}

export function itemAllowed(item: Pick<NavigationItem, "path">, access: MenuAccess | null): boolean {
  if (!access || access.all) return true;
  if (access.menuCodes.includes(menuCode(item.path))) return true;
  const module = moduleOfPath(item.path.split("?")[0]);
  // Item sem módulo (ex.: painel inicial) fica livre, a não ser que o departamento já tenha sido configurado.
  if (!module) return access.menuCodes.length === 0 || access.hasLegacy === true;
  return access.legacyModules.includes(module);
}

/** Vale para a rota aberta no navegador (não só para o menu): quem digita o endereço também esbarra aqui. O servidor continua protegendo os dados. */
export function pathAllowed(pathname: string, access: MenuAccess | null): boolean {
  if (!access || access.all || pathname === "/") return true;
  const sameRoute = navigationItems.filter((i) => i.path.split("?")[0] === pathname);
  if (sameRoute.length) return sameRoute.some((i) => itemAllowed(i, access));
  const module = moduleOfPath(pathname);
  return !module || access.legacyModules.includes(module);
}

/** Itens do menu que o departamento pode ver por padrão (usado para pré-marcar um departamento ainda não configurado). */
export function defaultMenuCodes(items: Array<Pick<NavigationItem, "path">>, viewModules: string[]): string[] {
  return items.filter((it) => { const m = moduleOfPath(it.path.split("?")[0]); return !m || viewModules.includes(m); }).map((it) => menuCode(it.path));
}

let cache: MenuAccess | null = null;
const EVENT = "dentalpos:menu-access";

export function resetMenuAccess() { cache = null; window.dispatchEvent(new Event(EVENT)); }

export function useMenuAccess(): MenuAccess | null {
  const [access, setAccess] = useState<MenuAccess | null>(cache);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const token = localStorage.getItem("dentalpos.token");
      if (!token) return;
      try {
        const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
        const r = await fetch(`${API}/me/menu-access`, { headers: { Authorization: `Bearer ${token}`, ...(clinicId ? { "X-Clinic-ID": clinicId } : {}) } });
        if (!r.ok) return;
        cache = (await r.json()) as MenuAccess;
        if (alive) setAccess(cache);
      } catch { /* sem resposta: o menu continua completo e o servidor continua protegendo os dados */ }
    };
    if (!cache) void load();
    const onReset = () => { cache = null; void load(); };
    window.addEventListener(EVENT, onReset);
    return () => { alive = false; window.removeEventListener(EVENT, onReset); };
  }, []);
  return access;
}
