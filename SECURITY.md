# Segurança — Dentalpos One + DentalPod Design

Camadas implementadas (04/10/2026). Todas têm teste automatizado; os limites de cada uma estão descritos com honestidade.

## 1. Verificação em 2 etapas (2FA) — backend + frontend
- TOTP (RFC 6238; Google/Microsoft Authenticator, Authy, 1Password). Segredo criptografado (AES-256-GCM) na tabela `UserSecurity`.
- Login em 2 passos: senha → `twoFactorRequired` + desafio JWT de 5 min (chave **derivada**, nunca aceita como sessão) → `POST /api/auth/login/2fa`.
- Códigos de recuperação (8, uso único, guardados só como hash). Anti-replay do código. Desativar exige senha + código.
- Tela: **Configurações → Segurança da conta** (`/seguranca`), com QR Code.
- Ativação é por usuário (opcional). Para tornar obrigatório para administradores é só checar `totpEnabled` no login (próximo passo sugerido).

## 2. Proteção de conta
- Bloqueio progressivo por conta: 5 falhas → 5 min, dobrando até 60 min (HTTP 423). Limite por IP já existente (10/15 min).
- Política de senha (≥10, 3 de 4 classes, sem senhas comuns/sequências/nome/e-mail) em cadastro, demo e redefinição.
- JWT com algoritmo fixado em HS256 (emissão e verificação). Sessão expira por inatividade (60 min; `VITE_IDLE_LOGOUT_MIN`).
- Helmet com CSP restritiva na API (só JSON), `no-referrer`, HSTS.

## 3. Arquivos / malware / conteúdo impróprio
- **Servidor** (`clinicalFileController`): bloqueia executáveis, scripts, HTML/SVG/XML, macros Office, dupla extensão (`foto.php.jpg`), MIME perigoso, links externos não-https ou de rede interna.
- **DentalPod (navegador)**: confere os *magic bytes* (não confia na extensão), recusa EXE/ELF/ZIP/PDF/SVG/HTML disfarçados, limita tamanho/dimensões e **re-codifica toda foto** (apaga EXIF/GPS e cargas escondidas). Modelos 3D (STL/OBJ/PLY) e arquivos `.dpd` são validados e reconstruídos campo a campo (anti prototype-pollution).
- **Pornografia/nudez**: classificador local (NSFWJS/TensorFlow.js) — a imagem **não sai do aparelho**. Bloqueia, registra e trava novos envios por 15 min após 3 tentativas. Se o verificador não carregar, **recusa a foto** (falha fechada).
- ⚠️ Nenhum classificador é infalível. Para um escudo definitivo no servidor use um serviço de moderação (ex.: AWS Rekognition / Google SafeSearch) e antivírus (ClamAV) no pipeline de upload — exige contratação/infra.

## 4. Não rodar em outro site
- DentalPod: lista de hosts e de sites-pai autorizados (`public/security.json`), checada antes de carregar o app; **domain-lock embutido no código ofuscado** (`DPD_DOMAINS` no build); CSP `frame-ancestors`; `postMessage` só com origem validada (nunca `*`).
- Token de host opcional (`requireHostToken`): o Dentalpos One entrega um token de 20 min (`POST /api/dpd/token`) e o DentalPod só abre se o servidor confirmar (`POST /api/dpd/verify`). **Ative depois do deploy do backend** (ver abaixo).
- Dentalpos One: trava de domínio opcional `VITE_ALLOWED_HOSTS`.
- ⚠️ Código que roda no navegador pode ser copiado e alterado por quem tem o arquivo; a trava impede o uso casual/cópia de hospedagem, e o token de host (validado no servidor) é a trava realmente forte.

## 5. Proteção do código (F12)
- Build de produção sem *source maps*, código do app **ofuscado** (nomes, strings), console desativado, anti-depuração (`debugger`), anti-reformatação (self-defending). Bibliotecas de terceiros não são ofuscadas (desempenho).
- ⚠️ É **impossível** esconder código do navegador de quem tem F12: a ofuscação só encarece a leitura. Por isso: nenhum segredo/chave no frontend; regras de acesso e licença sempre no servidor.

## 6. Cabeçalhos
`frontend/vercel.json`: nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, HSTS, COOP; CSP em modo *Report-Only* no app principal (observe o console e depois torne obrigatória) e **CSP obrigatória** em `/dentalpoddesign/`.

## O que ainda depende de você (não dá para fazer por código)
1. Aplicar `backend/prisma/manual-migrations/20261004_seguranca_2fa.sql` no Supabase (o app também cria a tabela sozinho).
2. Definir no Vercel (backend): `JWT_SECRET` forte (≥ 32 aleatórios) e, se possível, `TENANT_SECRET_MASTER_KEY`.
3. Depois do deploy do backend: em `dentalpoddesign/public/security.json` colocar `"apiUrl": "https://SEU-BACKEND/api"` e `"requireHostToken": true`; rebuild (`npm run build:integrado`).
4. Se o sistema roda em outro domínio, incluí-lo em `security.json` **e** no build (`DPD_DOMAINS="dominio1,.dominio2" npm run build`), senão o DentalPod bloqueia.
5. Ativar 2 etapas nas contas GitHub, Vercel, Supabase, Resend e Claude; restringir conexões do Supabase; conferir backup.
6. Testes: `cd backend && npm run test:security` · `cd dentalpoddesign && npm run test:security && npm run test:e2e-security`.
