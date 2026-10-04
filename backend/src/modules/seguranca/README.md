# Módulo Segurança (EduMaster Pro / DentalPos One)

Camadas de segurança do backend: **2FA TOTP**, **bloqueio progressivo de login**, **barreira de origem**,
**varredura de uploads** (anti-malware / anti-pornografia / SSRF), **moderação de texto**, **log de segurança**
e **política de senha forte**. Tudo é *retrocompatível*: quem não ativa 2FA continua logando exatamente como antes.

Visão geral e limites (o que NÃO é possível garantir): `docs/SEGURANCA.md`.

## Tabelas (prefixo `Seg`, só tabelas novas — `prisma/edu/seguranca.prisma`)
| Model | Para quê |
|---|---|
| `SegDoisFatores` | 1 por usuário: segredo TOTP cifrado (AES-256-GCM), `ativadoEm`, último passo aceito, códigos de recuperação (só hash) |
| `SegEvento` | log de segurança: `login_falho`, `login_bloqueado`, `2fa_*`, `upload_bloqueado`, `origem_negada`, `moderacao_*`, `texto_*`… |
| `SegTentativaLogin` | falhas por (escopo `login`/`2fa`, chave, IP) → bloqueio temporário progressivo |
| `SegArquivoVerificado` | veredito (LIMPO/SUSPEITO/BLOQUEADO) de cada arquivo (sha256, tipo, tamanho, motivo) |

SQL: `prisma/manual-migrations/20261004_edumaster_pro.sql` (aditivo; só CRIA). **Se as tabelas ainda não existem,
o login continua funcionando** (as consultas de 2FA/bloqueio falham “abertas” com aviso no console) e o `scanUpload`
funciona sem gravar vereditos. Aplique a migração para ativar log, 2FA e bloqueio.

## Endpoints (`/api/security/*` e `/api/auth/2fa/verify`)

| Método e rota | Quem | Descrição |
|---|---|---|
| `POST /api/auth/login` | público | **Sem 2FA**: igual a antes (`{token,user,demo}`). **Com 2FA**: `200 {requires2fa:true, challengeToken, expiresInSeconds:300}`. **Papel em `REQUIRE_2FA_ROLES` sem 2FA**: `200 {requires2faSetup:true, setupToken, message}`. Bloqueado: `429` + `Retry-After` |
| `POST /api/auth/2fa/verify` | público | `{challengeToken, code}` (TOTP 6 dígitos) **ou** `{challengeToken, recoveryCode}` → `{token,user,demo}` (e `recoveryCodesRemaining` se usou recuperação). 5 tentativas erradas/15 min por usuário+IP → 429 |
| `GET /api/security/2fa/status` | token normal ou `setupToken` | `{enabled, pendingSetup, requiredByRole, recoveryCodesRemaining}` |
| `POST /api/security/2fa/setup/start` | token normal ou `setupToken` | `{secret (base32), otpauthUrl, issuer, account}` — mostre como QR no app autenticador |
| `POST /api/security/2fa/setup/confirm` | idem | `{code}` → ativa e devolve `recoveryCodes` (8, **uma única vez**); com `setupToken` devolve também `token` de sessão |
| `POST /api/security/2fa/disable` | token normal | `{password, code|recoveryCode}`; recusado (403) se o papel está em `REQUIRE_2FA_ROLES` |
| `POST /api/security/2fa/recovery-codes/regenerate` | token normal | `{password, code|recoveryCode}` → 8 novos códigos (os antigos deixam de valer) |
| `GET /api/security/events` | ADMIN/OWNER/RECTOR/BOARD | eventos **do próprio tenant**. Filtros: `tipo, severidade (INFO/ATENCAO/CRITICO), userId, ip, desde, ate, page, pageSize` |
| `POST /api/security/2fa/admin-reset` | ADMIN/OWNER/RECTOR/BOARD | `{userId}` remove o 2FA de um usuário do mesmo tenant (perdeu aparelho e códigos). Auditado, severidade CRÍTICO |

Tokens de escopo restrito (`scope: '2fa'` e `'2fa-setup'`) **nunca** são aceitos pelo `authMiddleware`: não dão acesso à API.

### Especificação do TOTP
RFC 6238, HMAC-SHA1, 6 dígitos, passo de 30 s, janela ±1 passo, segredo de 160 bits (base32). Um código já aceito não
pode ser reutilizado (guarda-se o último passo). Comparações em tempo constante. Nenhum segredo/código vai para log.

## Variáveis de ambiente
| Variável | Padrão | Efeito |
|---|---|---|
| `SECURITY_ENC_KEY` | (deriva de `JWT_SECRET`) | Chave dos segredos 2FA: 64 hex ou texto ≥ 16 caracteres. **Defina antes de ativar 2FA em produção** para poder rotacionar `JWT_SECRET` sem perder os segredos (segredos antigos continuam decifráveis pela chave derivada do JWT). Em produção sem nenhuma das duas, o 2FA falha com mensagem clara |
| `REQUIRE_2FA_ROLES` | vazio | Lista (`ADMIN,OWNER,RECTOR`) de papéis obrigados a ter 2FA. Vazio = ninguém é obrigado |
| `SECURITY_TOTP_ISSUER` | `DentalPos One` | Nome exibido no app autenticador |
| `ALLOWED_ORIGINS` | — | Origens extras (separadas por vírgula) aceitas pelo CORS e pelo `originGuard` |
| `APP_ALLOWED_HOSTS` | — | Hosts extras (sem esquema); vira `https://host` e `http://host` |
| `CORS_ORIGIN`, `PUBLIC_APP_URL` | (já existentes) | Também entram na allowlist de origem |
| `UPLOAD_MODERATION` | `flag` | Moderação de imagens por IA. `flag`: se a IA estiver indisponível, aceita e registra `moderacao_indisponivel`; `strict`: recusa imagens quando não é possível moderar; `off`: desliga |
| `ANTHROPIC_API_KEY` | — | Necessária para a moderação de imagens (API Messages com visão). Sem ela vale a política acima |
| `CLAMAV_HOST` / `CLAMAV_PORT` | — / `3310` | ClamAV via clamd TCP (INSTREAM). Opcional; indisponível = segue com aviso. `CLAMAV_TIMEOUT_MS` (8000), `CLAMAV_MAX_BYTES` (25 MB) |
| `VIRUSTOTAL_API_KEY` | — | Consulta **só o hash** (sha256) ao VirusTotal. `VIRUSTOTAL_MIN_DETECTIONS` (3), `VIRUSTOTAL_TIMEOUT_MS` (4000) |
| `SEG_BLOCKED_DOMAINS` | — | Domínios extras (vírgula) a bloquear na moderação de texto |
| `UPLOAD_MAX_PIXELS` / `UPLOAD_MAX_RAZAO_ZIP` / `UPLOAD_MAX_DESCOMPRIMIDO` | 100 Mpx / 100:1 / 500 MB | Limites anti-bomba de descompressão |

## Barreira de origem e cabeçalhos
- `originGuard` (`origem.ts`, montado em `src/app.ts` antes do CORS): em `POST/PUT/PATCH/DELETE` sob `/api`, se vier `Origin`
  (ou `Referer`, quando não há `Origin`) fora da allowlist → `403` + `SegEvento origem_negada`. Sem `Origin`/`Referer`
  (webhooks, `CRON_SECRET`, servidores, curl) passa. A allowlist é a mesma do CORS (o CORS agora usa `origemPermitida`).
- Cabeçalhos de `/api`: `Permissions-Policy` restritiva, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-site`,
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, e `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` nas respostas JSON.

## Varredura de uploads
Função central: `scanUpload({ filename, declaredMime, data: Buffer|dataUrl, url?, permitir?, moderar?, contexto? })` em `uploads.ts`
→ `{ ok, veredito, motivo, motivos, avisos, sha256, tamanho, tipo, mime, categoria }`. Também: `assertUploadSeguro()` (lança 422),
`analisarLocal()` (síncrona, sem rede) e `checarMetadadosArquivo()` (só nome/MIME).

Camadas: nome/dupla extensão/RTLO → tipo real por *magic bytes* e divergência extensão×conteúdo×MIME → allowlist por categoria e tamanho →
conteúdo por tipo (PDF com `/JavaScript` `/JS` `/Launch` `/EmbeddedFile` `/OpenAction` suspeito, inclusive em fluxos `/ObjStm`;
SVG com script/`on*=`/`javascript:`/`foreignObject`; HTML disfarçado; Office/OLE/OOXML/ODF com macro; ZIP com executável, *path traversal*,
senha, aninhamento, *zip-bomb*; polyglots; imagens-bomba; CSV com DDE) → EICAR → ClamAV (opcional) → VirusTotal por hash (opcional) →
moderação de imagem por IA (`services-ai/client.ts: callAIVisionForJSON`). Vereditos e bloqueios vão para `SegArquivoVerificado` / `SegEvento`.
**SUSPEITO** = aceito, mas registrado para revisão; **BLOQUEADO** = `422` com mensagem em português.

### Onde é aplicado (sem alterar contratos de resposta)
`uploadGuard.ts` é um middleware montado em `src/routes/index.ts` (em `/api/public` e depois do `authMiddleware`) que inspeciona **todo corpo JSON**
de `POST/PUT/PATCH`: qualquer *data URL* ou campo `*base64` (biblioteca/repositório, matrícula, regulatório, protocolos, conferência, branding…)
passa por `scanUpload`; campos de URL de anexo (`arquivoUrl`, `urlArquivo`, `fileUrl`, `externalUrl`, `cameraReadyUrl`, `capaUrl`, `url` em anexos…)
só aceitam **https público** (sem IP privado/localhost/metadados de nuvem/credenciais/`javascript:`/`data:`/`file:`) e não podem apontar para arquivo
proibido; objetos com nome+MIME (ex.: `uploadIntent` clínico, que usa URL pré-assinada) têm nome/MIME conferidos. Em `/api/public/*` os textos livres passam por
`moderarTexto`. Webhooks (`/webhook`) e `/cron` são ignorados. Falha *interna* da varredura recusa o arquivo (fail-closed).
Download de arquivos guardados (`biblioteca/repositorio.ts: enviarArquivo`) agora força `attachment`/octet-stream para tipos não seguros, `nosniff` e CSP `sandbox`.

### Moderação de texto (`moderarTexto`)
Não bloqueia termos médicos (“sexo”, “anatomia”…): olha só **links e golpes**. `BLOQUEAR`: domínio adulto/malware conhecido, `javascript:`/`<script>`.
`REVISAR` (aceita, registra `texto_revisao`): URL encurtada, punycode/homoglifos, link para IP, TLD abusado, `@` na URL, frases de phishing.

## Como operar
1. Aplicar `20261004_edumaster_pro.sql` (ou `prisma db push` em dev). 2. Definir `SECURITY_ENC_KEY` (`openssl rand -hex 32`).
3. Opcional: `REQUIRE_2FA_ROLES=ADMIN,OWNER`, `ALLOWED_ORIGINS`, `CLAMAV_HOST`, `ANTHROPIC_API_KEY`, `VIRUSTOTAL_API_KEY`.
4. O cron `/api/cron/edu` já executa o job `seguranca.limpar-tentativas` (apaga contagens de tentativas com mais de 7 dias sem bloqueio vigente).
5. Usuário perdeu o aparelho e os códigos: ADMIN chama `POST /api/security/2fa/admin-reset {userId}`.
6. Acompanhe `GET /api/security/events?severidade=ATENCAO` (bloqueios, uploads recusados, origens negadas, 2FA).

## Testes
`DATABASE_URL=postgresql://... npx tsx scripts/e2e/seguranca.ts` — vetores RFC 6238/4226, fluxo de login com e sem 2FA, recuperação de uso único,
bloqueio progressivo, `originGuard`, `scanUpload` com amostras (PNG, PDF com JS, exe renomeado, SVG com script, EICAR, zip-bomb, dupla extensão…),
ClamAV/VirusTotal/visão simulados, SSRF e moderação de texto.
