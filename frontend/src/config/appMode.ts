// Modo do aplicativo: "edu" publica só o EduMaster Pro (ambiente de demonstração para instituições de ensino).
export const EDU_ONLY = String(import.meta.env.VITE_APP_MODE || "").toLowerCase() === "edu";
export const APP_NAME = EDU_ONLY ? "EduMaster Pro" : "DentalPos One";
// Nome provisório da instituição em todas as telas de demonstração; trocado pelo nome real depois da venda.
export const INSTITUICAO_PADRAO = "SUA INSTITUIÇÃO";
export const MARCA_TOPO = EDU_ONLY ? INSTITUICAO_PADRAO : "DENTALPOS ONE";
export const APP_SHORT_NAME = EDU_ONLY ? "EduMaster" : "DentalPos";
