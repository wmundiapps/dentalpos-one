// Configuração de segurança (definida na build por variáveis VITE_*):
//   VITE_HARDEN=1            liga as proteções (bloqueio de domínio, anti-F12, anti-iframe). Desligado em desenvolvimento/testes.
//   VITE_ALLOWED_HOSTS=a.com,b.com.br   domínios (e subdomínios) onde o programa pode rodar. localhost sempre permitido em dev.
//   VITE_ALLOW_FILE=1        permite abrir o .html direto do disco (file://)
//   VITE_EMBED_ORIGINS=https://app.exemplo.com   origens que podem incorporar o módulo em iframe
//   VITE_REQUIRE_AUTH=1      exige senha + código de 2 etapas
const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
const list = (v?: string) => (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
export const SECURITY = {
  harden: env.VITE_HARDEN === "1",
  hosts: list(env.VITE_ALLOWED_HOSTS),
  allowFile: env.VITE_ALLOW_FILE === "1",
  embedOrigins: list(env.VITE_EMBED_ORIGINS),
  requireAuth: env.VITE_REQUIRE_AUTH === "1",
};
