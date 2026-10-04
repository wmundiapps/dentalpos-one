// Guarda de domínio: o app só monta em hosts autorizados (evita clonagem/hospedagem em outro site)
// e recusa ser exibido dentro de um frame de terceiros (clickjacking).
//
// IMPORTANTE: é uma barreira de dissuasão no cliente. Quem controla o navegador pode removê-la;
// a proteção real contra uso indevido da API é o CORS e a autenticação no servidor.

/** Hosts sempre aceitos. Aceita curingas simples com "*" (ex.: "*.vercel.app"). */
const HOSTS_PADRAO = [
  "localhost",
  "127.0.0.1",
  "[::1]",
  "one.dentalpos.com.br",
  "dentalpos.com.br",
  "*.dentalpos.com.br",
  "dentalpos-one.vercel.app",
  "dentalpos-landing.vercel.app",
  // Projeto na Vercel: produção, API e previews por branch/commit.
  "dentalpos-one*.vercel.app",
  "dentalpos-frontend*.vercel.app",
  "*-robsonraveloliveira-7222.vercel.app",
];

function padraoParaRegex(padrao: string) {
  const escapado = padrao
    .trim()
    .toLowerCase()
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[a-z0-9-]+(?:\\.[a-z0-9-]+)*");
  return new RegExp(`^${escapado}$`);
}

export function hostsPermitidos(): string[] {
  const extras = String(import.meta.env.VITE_ALLOWED_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return [...HOSTS_PADRAO, ...extras];
}

export function hostAutorizado(hostname: string, lista: string[] = hostsPermitidos()): boolean {
  const host = hostname.trim().toLowerCase();
  return lista.some((padrao) => padraoParaRegex(padrao).test(host));
}

function telaDeBloqueio(titulo: string, texto: string) {
  const alvo = document.getElementById("root") || document.body;
  document.title = "DentalPos One";
  alvo.innerHTML = "";
  const caixa = document.createElement("main");
  caixa.setAttribute("role", "alert");
  caixa.style.cssText =
    "min-height:100vh;display:grid;place-items:center;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0b1b2e;color:#fff;text-align:center";
  const interno = document.createElement("div");
  interno.style.cssText = "max-width:520px";
  const h1 = document.createElement("h1");
  h1.textContent = titulo;
  h1.style.cssText = "font-size:26px;margin:0 0 12px";
  const p = document.createElement("p");
  p.textContent = texto;
  p.style.cssText = "margin:0 0 20px;line-height:1.5;opacity:.88";
  const a = document.createElement("a");
  a.href = "https://one.dentalpos.com.br";
  a.rel = "noopener noreferrer";
  a.textContent = "Acessar o endereço oficial do DentalPos One";
  a.style.cssText = "color:#7fb3ff;font-weight:600";
  interno.append(h1, p, a);
  caixa.append(interno);
  alvo.append(caixa);
}

/** Retorna true quando é seguro montar o React. Em desenvolvimento nunca bloqueia. */
export function runHostGuard(): boolean {
  if (!import.meta.env.PROD) return true;

  // Anti-clickjacking: o app não deve rodar dentro de frame de outro site.
  let emFrame = false;
  try {
    emFrame = window.top !== window.self;
  } catch {
    emFrame = true;
  }
  if (emFrame) {
    try {
      if (window.top) window.top.location.href = window.self.location.href;
    } catch {
      // Frame de outra origem: a navegação do topo é bloqueada; seguimos para o bloqueio.
    }
    telaDeBloqueio(
      "Conteúdo bloqueado",
      "Por segurança, o DentalPos One não pode ser exibido dentro de outro site. Abra-o diretamente no endereço oficial.",
    );
    return false;
  }

  if (!hostAutorizado(window.location.hostname)) {
    telaDeBloqueio(
      "Endereço não autorizado",
      "Este endereço não é um ambiente oficial do DentalPos One. Para proteger seus dados, não informe senhas aqui.",
    );
    return false;
  }
  return true;
}
