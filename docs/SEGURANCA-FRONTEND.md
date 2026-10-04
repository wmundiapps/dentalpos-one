# Segurança do frontend (DentalPos One + EduMaster Pro)

Princípio: **tudo o que chega ao navegador é visível para quem o usa.** O que protege de verdade é manter segredos,
regras de negócio e autorização no servidor. As camadas abaixo reduzem superfície de ataque e dificultam abuso casual.

## O que protege

| Camada | Onde | O que faz |
| --- | --- | --- |
| Cabeçalhos HTTP | `frontend/vercel.json` | CSP estrita (`script-src 'self'`, sem inline/eval), `frame-ancestors 'none'`, HSTS, `nosniff`, Referrer-Policy, Permissions-Policy, COOP `same-origin`, `X-Frame-Options: DENY`; cache imutável em `/assets/*` |
| Domínio autorizado | `src/security/hostGuard.ts` | Em produção, o app só monta em hosts da allowlist e nunca dentro de frame de terceiros |
| 2FA | `pages/Login.tsx`, `pages/AccountSecurity.tsx`, `components/security/*`, `services/SecurityApi.ts` | Segundo passo no login (6 dígitos ou código de recuperação, bloqueio por tentativas), ativação com QR code, códigos de recuperação exibidos uma vez, desativar/regenerar |
| Eventos de segurança | `pages/SecurityEvents.tsx` (`/seguranca/eventos`) | Tabela com filtros para administradores (consome `GET /api/security/events`) |
| Sessão | `src/security/sessionGuard.ts` | Logout em todas as abas (BroadcastChannel) e expiração por inatividade |
| Build | `vite.config.ts` | Sem sourcemaps, sem comentários, `console.*` e `debugger` removidos, nomes de arquivo apenas com hash |
| Varredura de segredos | `scripts/scan-bundle-secrets.mjs` | Roda após o build (`npm run build`) e **falha** se achar chaves/segredos em `dist/` |
| Dissuasão de F12 | `src/security/devtoolsGuard.ts` | Ver variáveis abaixo |
| Upload | `src/security/uploadGuard.ts` | Allowlist de extensões/MIME, limite de tamanho, recusa de executáveis e dupla extensão, conferência dos primeiros bytes (imagem/PDF/docx/xlsx) e mensagem amigável para 422 do servidor |

## O que NÃO protege (limitações honestas)

- **Código do cliente é sempre legível.** Minificação, ausência de sourcemaps e o `devtoolsGuard` só atrapalham curiosos;
  não impedem engenharia reversa. Nenhum segredo, chave de API ou regra sensível pode existir no frontend.
- **hostGuard e devtoolsGuard rodam no cliente**: quem clonar o código pode removê-los. A defesa efetiva contra uso da API
  por outros sites é o CORS + autenticação + limites no servidor. A CSP/`X-Frame-Options` valem para o nosso domínio.
- **JWT em `localStorage`** (`dentalpos.token`): continua exposto a XSS. Mitigações: CSP sem scripts inline, 2FA, logout
  em todas as abas, expiração por inatividade e nenhum log de token. Migrar para cookie `HttpOnly` exige mudança no backend.
- **2FA depende do backend** (contrato `/auth/2fa/verify` e `/security/2fa/*`); a interface trata a ausência dessas rotas com mensagens.
- **Detecção de DevTools (modo `block`) é heurística**: pode falhar ou, raramente, gerar falso positivo; usa `public/security/dbg.js`
  (o `debugger` não pode ficar no bundle, que o remove).
- **Validação de upload no cliente é conveniência**; a validação oficial é a do servidor.
- **CSP**: `style-src 'unsafe-inline'` é necessário (MUI/Emotion injeta estilos). `frame-src https:` e `img-src https:` são abertos
  porque a Central de Marketing (iframe) e os arquivos clínicos usam URLs externas. PDF em nova aba via `blob:` não foi testável em
  Chromium headless (sem visualizador de PDF); se algum navegador bloquear, ajuste `object-src`.

## Variáveis de ambiente (Vite)

- `VITE_ALLOWED_HOSTS`: hosts extras autorizados, separados por vírgula; aceita curinga (`*.minhaclinica.com.br`).
  Já permitidos: `localhost`, `127.0.0.1`, `one.dentalpos.com.br`, `*.dentalpos.com.br`, `dentalpos-one.vercel.app`,
  `dentalpos-landing.vercel.app`, `dentalpos-one*.vercel.app`, `dentalpos-frontend*.vercel.app`, `*-robsonraveloliveira-7222.vercel.app`.
  Em desenvolvimento (`npm run dev`) a guarda nunca bloqueia.
- `VITE_DEVTOOLS_MODE`: `off` | `deter` (padrão) | `block`. Só age em produção.
  - `deter`: bloqueia F12, Ctrl+Shift+I/J/C, Ctrl+U (e equivalentes no Mac) e o menu de contexto fora de campos de texto
    (com texto selecionado o menu continua disponível); mostra aviso de self-XSS no console. Não bloqueia Ctrl+C/Ctrl+P, impressão nem leitores de tela.
  - `block`: além do `deter`, oculta a interface com um aviso enquanto detectar DevTools aberto (reversível ao fechar).
    Não use em ambiente de suporte com técnicos.
- `VITE_IDLE_TIMEOUT_MINUTES`: minutos de inatividade até sair automaticamente (padrão `240`; `0` desliga).
- `VITE_API_URL`: já existente; se a API mudar de host, **atualize `connect-src` em `vercel.json`**.

## Manutenção da CSP

`connect-src` lista: API de produção, API do preview piloto, `one.dentalpos.com.br` e storages S3 compatíveis
(`*.amazonaws.com`, `*.r2.cloudflarestorage.com`, `*.supabase.co`, `*.backblazeb2.com`, `*.digitaloceanspaces.com`).
Se um novo domínio de API/storage for usado, adicione-o ali. Sintoma de bloqueio: erro "Refused to connect" no console.
Para validar: `npm run build`, servir `dist/` com os mesmos cabeçalhos e abrir as rotas verificando violações no console.

## Varredura de segredos

`npm run build` executa `scripts/scan-bundle-secrets.mjs` ao final. Procura `sk-`, AKIA, JWT completos, chaves privadas PEM,
URLs de banco com credenciais, `service_role`, tokens GitHub/Slack/Google/SendGrid/Asaas, atribuições literais
`password|secret|apiKey|token = "..."`, sourcemaps publicados e variáveis `VITE_*` com nome sensível. Também lista as variáveis
`VITE_*` e as origens externas referenciadas. Falso positivo conhecido: `scripts/scan-bundle-allowlist.json` (lista de trechos).
Regra: **qualquer variável `VITE_*` é pública** — nunca coloque segredo nela.
