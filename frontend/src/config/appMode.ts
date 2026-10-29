// Modo do aplicativo: "edu" publica só o EduMaster Pro (ambiente de demonstração para instituições de ensino).
export const EDU_ONLY = String(import.meta.env.VITE_APP_MODE || "").toLowerCase() === "edu";
export const APP_NAME = EDU_ONLY ? "EduMaster Pro" : "DentalPos One";
export const APP_SHORT_NAME = EDU_ONLY ? "EduMaster" : "DentalPos";
