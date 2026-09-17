/** Dados de exemplo so aparecem quando ligados explicitamente (VITE_ENABLE_DEMO_DATA=true ou flag local). Padrao: sistema limpo. */
export const DEMO_DATA_ON: boolean =
  import.meta.env.VITE_ENABLE_DEMO_DATA === "true" ||
  (typeof localStorage !== "undefined" && localStorage.getItem("dentalpos.demoData.enabled") === "true");