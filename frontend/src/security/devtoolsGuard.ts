// Dissuasão de inspeção/engenharia reversa casual (F12, "Ver código-fonte", self-XSS).
// Modos (VITE_DEVTOOLS_MODE): off | deter (padrão) | block. Só age em produção.
//
// LIMITAÇÃO HONESTA: o código do cliente é sempre visível no navegador. Isto apenas atrapalha
// curiosos e golpes de "cole este código no console". Segredos e regras de negócio ficam no servidor.

type Modo = "off" | "deter" | "block";

function modoAtual(): Modo {
  const bruto = String(import.meta.env.VITE_DEVTOOLS_MODE || "deter").trim().toLowerCase();
  return bruto === "off" || bruto === "block" ? bruto : "deter";
}

function emCampoDeTexto(alvo: EventTarget | null) {
  const el = alvo as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function haTextoSelecionado() {
  const sel = window.getSelection();
  return !!sel && !sel.isCollapsed && String(sel).trim().length > 0;
}

// O esbuild remove chamadas diretas a "console.*" no build; o acesso indireto abaixo preserva o aviso.
function consoleSeguro(): Console | undefined {
  try {
    return (globalThis as Record<string, unknown>)["con" + "sole"] as Console;
  } catch {
    return undefined;
  }
}

function avisarNoConsole() {
  const c = consoleSeguro();
  if (!c) return;
  try {
    c.clear?.();
    c.log("%cPARE!", "color:#d32f2f;font-size:56px;font-weight:900;text-shadow:1px 1px 0 #000");
    c.log(
      "%cNão cole códigos aqui — golpe de self-XSS.",
      "color:#d32f2f;font-size:20px;font-weight:700",
    );
    c.log(
      "%cQuem pede para você colar algo neste console pode roubar sua conta e os dados dos pacientes. Se você não é desenvolvedor da DentalPos, feche esta janela.",
      "font-size:15px",
    );
  } catch {
    // Console indisponível: nada a fazer.
  }
}

function instalarAtalhosEMenu() {
  window.addEventListener(
    "keydown",
    (e) => {
      const k = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      const bloqueia =
        e.key === "F12" ||
        (ctrl && e.shiftKey && (k === "i" || k === "j" || k === "c")) ||
        (e.metaKey && e.altKey && (k === "i" || k === "j" || k === "c" || k === "u")) ||
        (ctrl && !e.shiftKey && !e.altKey && k === "u");
      if (bloqueia) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );
  window.addEventListener(
    "contextmenu",
    (e) => {
      if (emCampoDeTexto(e.target) || haTextoSelecionado()) return;
      e.preventDefault();
    },
    true,
  );
}

// ---- modo block ----
const ID_TELA = "dp-devtools-aviso";

function mostrarAviso(visivel: boolean) {
  const existente = document.getElementById(ID_TELA);
  const root = document.getElementById("root");
  if (visivel && !existente) {
    const tela = document.createElement("div");
    tela.id = ID_TELA;
    tela.setAttribute("role", "alert");
    tela.className = "dp-no-print";
    tela.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:#0b1b2e;color:#fff;font-family:system-ui,sans-serif;text-align:center";
    const texto = document.createElement("div");
    texto.style.cssText = "max-width:520px";
    const h = document.createElement("h1");
    h.textContent = "Ferramentas de desenvolvedor detectadas";
    h.style.cssText = "font-size:24px;margin:0 0 12px";
    const p = document.createElement("p");
    p.textContent =
      "Por segurança, o conteúdo fica oculto enquanto as ferramentas de desenvolvedor estiverem abertas. Feche-as para continuar de onde parou.";
    p.style.cssText = "margin:0;line-height:1.5;opacity:.88";
    texto.append(h, p);
    tela.append(texto);
    document.body.append(tela);
    if (root) root.style.visibility = "hidden";
  } else if (!visivel && existente) {
    existente.remove();
    if (root) root.style.visibility = "";
  }
}

function detectarPorJanela() {
  // Só em desktop sem zoom: o zoom do navegador distorce a diferença entre janela externa e interna.
  if (window.matchMedia?.("(pointer:coarse)").matches) return false;
  if (Math.abs(window.devicePixelRatio - Math.round(window.devicePixelRatio)) > 0.01) return false;
  const largura = window.outerWidth - window.innerWidth;
  const altura = window.outerHeight - window.innerHeight;
  return largura > 260 || altura > 260;
}

function detectarPorDebugger(): Promise<boolean> {
  // "debugger" fica em arquivo estático (public/security/dbg.js) porque o build remove essa instrução do bundle.
  const fn = (window as unknown as { __dpDbg?: () => void }).__dpDbg;
  if (!fn) return Promise.resolve(false);
  const t0 = performance.now();
  fn();
  return Promise.resolve(performance.now() - t0 > 120);
}

function iniciarModoBlock() {
  const s = document.createElement("script");
  s.src = `${import.meta.env.BASE_URL}security/dbg.js`;
  s.async = true;
  document.head.append(s);

  let consecutivas = 0;
  const verificar = async () => {
    if (document.visibilityState === "hidden") return;
    const abertas = (await detectarPorDebugger()) || detectarPorJanela();
    consecutivas = abertas ? consecutivas + 1 : 0;
    // Exige duas leituras seguidas para evitar falso positivo; ao fechar, volta na hora.
    mostrarAviso(consecutivas >= 2);
  };
  window.setInterval(() => void verificar(), 1500);
}

export function startDevtoolsGuard() {
  if (!import.meta.env.PROD) return;
  const modo = modoAtual();
  if (modo === "off") return;
  avisarNoConsole();
  instalarAtalhosEMenu();
  if (modo === "block") iniciarModoBlock();
}
