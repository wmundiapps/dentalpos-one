import { lazy, type ComponentType } from "react";

// Registro das abas do Escritório de Contabilidade. Para acrescentar uma área (ex.: societário, RH/DP), adicione uma linha aqui.
// `escopo`: "empresa" = exige empresa escolhida (a própria aba mostra o aviso); "geral" = funciona sem empresa.
export interface AbaContabil { id: string; rotulo: string; Componente: ComponentType<any>; grupo: "fiscal" | "financeiro" | "contabil" | "admin" }

export const ABAS_CONTABIL: AbaContabil[] = [
  { id: "painel", rotulo: "Painel", grupo: "fiscal", Componente: lazy(() => import("./PainelTab")) },
  { id: "empresas", rotulo: "Empresas", grupo: "fiscal", Componente: lazy(() => import("./EmpresasTab")) },
  { id: "regime", rotulo: "Regime fiscal", grupo: "fiscal", Componente: lazy(() => import("./RegimeTab")) },
  { id: "notas", rotulo: "Notas e recibos", grupo: "fiscal", Componente: lazy(() => import("./NotasTab")) },
  { id: "guias", rotulo: "Guias e obrigações", grupo: "fiscal", Componente: lazy(() => import("./GuiasTab")) },
  { id: "titulos", rotulo: "Pagar, receber e cobrança", grupo: "financeiro", Componente: lazy(() => import("./TitulosTab")) },
  { id: "conciliacao", rotulo: "Conciliação bancária", grupo: "financeiro", Componente: lazy(() => import("./ConciliacaoTab")) },
  { id: "lancamentos", rotulo: "Plano e lançamentos", grupo: "contabil", Componente: lazy(() => import("./ContabilidadeTab")) },
  { id: "relatorios", rotulo: "DRE e balancete", grupo: "contabil", Componente: lazy(() => import("./RelatoriosTab")) },
  { id: "acesso", rotulo: "Acesso e auditoria", grupo: "admin", Componente: lazy(() => import("./AcessoTab")) },
];
