// Proteções no navegador. (O código de um site sempre chega ao navegador de quem
// visita; o que precisa ficar secreto mora só no servidor.)

const OFFICIAL = 'https://space-hour.com';
const ALLOWED_HOSTS = ['space-hour.com', 'www.space-hour.com', 'spacehour.com.br', 'www.spacehour.com.br', 'localhost', '127.0.0.1'];

/** Cópia do site rodando em outro endereço: manda a pessoa para o SpaceHour verdadeiro. */
function domainGuard() {
  const host = location.hostname;
  const preview = host.endsWith('.vercel.app') && host.includes('robsonraveloliveira'); // prévias da própria conta na Vercel
  if (ALLOWED_HOSTS.includes(host) || preview || location.protocol === 'capacitor:') return;
  location.replace(OFFICIAL + location.pathname + location.search);
}

/** Dentro de um quadro de outro site (golpe de clique escondido): sai do quadro. */
function frameGuard() {
  try {
    if (window.top && window.top !== window.self) window.top.location.href = window.self.location.href;
  } catch {
    document.documentElement.style.display = 'none';
  }
}

/** Aviso no console (F12): golpistas pedem para colar código ali e roubam a conta. */
function consoleWarning() {
  const big = 'color:#b91c1c;font-size:28px;font-weight:700';
  const txt = 'font-size:15px';
  console.log('%cPARE!', big);
  console.log('%cEsta área é para desenvolvedores. Se alguém pediu para você copiar ou colar algo aqui, é golpe: a pessoa quer acessar sua conta SpaceHour.', txt);
  console.log('%cStop! This is a developer tool. If someone told you to paste something here, it is a scam to take over your SpaceHour account.', txt);
}

export function installGuards() {
  if (import.meta.env.DEV) return;
  domainGuard();
  frameGuard();
  consoleWarning();
}
