# Segurança do backend — DentalPos One + EduMaster Pro

Este documento resume as proteções adicionadas ao backend e, com a mesma ênfase, **o que elas não conseguem garantir**.
Detalhes técnicos, endpoints e operação: `backend/src/modules/seguranca/README.md`.

## O que existe

| Camada | O que faz | Onde |
|---|---|---|
| Autenticação em dois fatores (TOTP) | RFC 6238 (SHA-1, 6 dígitos, 30 s, ±1 passo); segredo cifrado com AES-256-GCM; 8 códigos de recuperação de uso único (só hash); anti-reutilização do mesmo código | `/api/security/2fa/*`, `/api/auth/2fa/verify` |
| 2FA obrigatório por papel | `REQUIRE_2FA_ROLES`: quem está na lista e não tem 2FA recebe `requires2faSetup` e um token que só serve para configurar | login |
| Bloqueio progressivo de login | 5 falhas por e-mail+IP → 15 min, depois 1 h, depois 4 h; mensagem genérica (e-mail inexistente também bloqueia); tudo em `SegEvento` | login |
| Limite de tentativas do 2FA | 5 por 15 min por usuário+IP | verify/disable/regenerar |
| Barreira de origem | `POST/PUT/PATCH/DELETE` com `Origin`/`Referer` fora da allowlist → 403 + evento. Sem `Origin` (webhooks, cron, servidores) passa | `originGuard` |
| Cabeçalhos da API | `Permissions-Policy`, `Referrer-Policy: no-referrer`, `CORP: same-site`, `nosniff`, `X-Frame-Options`, CSP `default-src 'none'; frame-ancestors 'none'` em JSON | `apiSecurityHeaders` |
| Varredura de uploads | tipo real por *magic bytes*, divergência extensão×conteúdo, allowlist e limites, bloqueio de executáveis/scripts/macros/PDF ativo/SVG ativo/ZIP perigoso/zip-bomb/polyglot, EICAR, ClamAV e VirusTotal opcionais | `scanUpload` + `uploadGuard` |
| Moderação de imagens | IA com visão recusa conteúdo sexual explícito e violência gráfica gratuita (fotos clínicas e anatomia são permitidas) | `UPLOAD_MODERATION` |
| Moderação de texto | formulários públicos/ouvidoria/chat: domínios adultos/malware bloqueados; encurtadores, homoglifos e phishing marcados para revisão | `moderarTexto` |
| Anti-SSRF em links de anexo | só `https`, sem IP privado/localhost/metadados de nuvem, sem credenciais, sem `javascript:`/`data:`/`file:` | `validarUrlExterna` |
| Senha forte | mínimo 10 caracteres e não comum, **só em cadastro/troca** (senhas existentes continuam válidas) | `senha.ts` |
| Log de segurança e auditoria | `SegEvento` (consulta `GET /api/security/events`, só administradores do tenant) + `AuditLog` para 2FA | — |
| Download seguro | arquivos guardados são servidos com `nosniff`, CSP `sandbox` e `attachment` para tipos não seguros | repositório institucional |

## Variáveis de ambiente
| Variável | Para quê |
|---|---|
| `SECURITY_ENC_KEY` | chave (64 hex ou texto ≥ 16) que cifra os segredos 2FA. Sem ela usa-se uma chave derivada de `JWT_SECRET`; em produção sem nenhuma das duas o 2FA falha com mensagem clara. **Defina antes de ativar 2FA em produção** e guarde-a como segredo (se perdê-la, os 2FA precisam ser refeitos via `admin-reset`) |
| `REQUIRE_2FA_ROLES` | papéis obrigados a usar 2FA (vazio = ninguém) |
| `ALLOWED_ORIGINS`, `APP_ALLOWED_HOSTS` | origens/hosts adicionais aceitos (além de `CORS_ORIGIN`, `PUBLIC_APP_URL` e as origens fixas do DentalPos) |
| `UPLOAD_MODERATION` | `flag` (padrão: aceita e registra se a IA estiver indisponível), `strict` (recusa imagens), `off` |
| `ANTHROPIC_API_KEY` | habilita a moderação de imagens |
| `CLAMAV_HOST`, `CLAMAV_PORT` | ClamAV (clamd TCP) opcional |
| `VIRUSTOTAL_API_KEY` | consulta de hash ao VirusTotal opcional (o arquivo nunca é enviado) |
| `SEG_BLOCKED_DOMAINS` | domínios extras bloqueados na moderação de texto |

Implantação: aplicar `backend/prisma/manual-migrations/20261004_edumaster_pro.sql` (as tabelas `Seg*` são novas; nada existente é alterado).
Antes da migração o login segue funcionando (sem 2FA/bloqueio/log).

## O que NÃO é possível garantir (leia com atenção)

1. **“Não rodar em outro site” não é garantia criptográfica.** `Origin`/`Referer` e CORS protegem **navegadores**: impedem que a página
   de outro site use a sessão de um usuário. Quem usa `curl`, um script ou um servidor próprio simplesmente não envia `Origin` — e isso
   precisa continuar permitido (webhooks, cron, integrações). Quem tem credenciais válidas pode chamar a API de qualquer lugar. Nada impede
   alguém de **copiar o código do frontend** e hospedá-lo em outro domínio: a API só se recusa a servir *navegadores* vindos desse domínio.
   A defesa real contra uso indevido é autenticação forte (2FA), autorização por papel/tenant, limites de taxa e monitoramento.
2. **Antivírus não é infalível.** A análise estática embutida (magic bytes, regras de PDF/Office/ZIP, EICAR) pega os casos conhecidos e os
   abusos mais comuns, mas **malware novo, ofuscado ou 0-day passa**. Documentos Office/PDF/imagens podem explorar falhas do leitor sem conter nenhum
   marcador que possamos reconhecer. PDFs com conteúdo criptografado ou fluxos que não conseguimos descomprimir não são inspecionados por inteiro.
   O ClamAV e o VirusTotal ampliam a cobertura **somente se configurados** e ainda assim dependem de assinaturas conhecidas (VirusTotal só é
   consultado por hash: arquivo inédito retorna “desconhecido”, que é tratado como limpo).
3. **Uploads clínicos usam URL pré-assinada** (`clinicalFileController`): o servidor não recebe os bytes, então só nome, extensão, MIME e `externalUrl`
   são verificados. Para varredura do conteúdo é preciso inspecionar no armazenamento (ex.: evento do bucket → ClamAV) — não implementado aqui.
4. **Moderação de imagens por IA é probabilística.** Pode errar nos dois sentidos (deixar passar ou marcar indevidamente). Sem `ANTHROPIC_API_KEY`
   ou com a IA fora do ar, a política `flag` **aceita** a imagem (registrando o evento) — só `strict` a recusa. Imagens acima de 5 MB não são moderadas
   (limite da API). Vídeos e SVGs não passam por moderação visual. Não há detecção de conteúdo impróprio em PDFs/documentos.
5. **Moderação de texto** é por lista/padrões de links e golpes, não por interpretação semântica; não detecta ofensas, assédio ou pornografia escrita
   (de propósito: termos médicos e educacionais são legítimos). As listas de domínios são curtas e precisam de manutenção (`SEG_BLOCKED_DOMAINS`).
6. **Anti-SSRF**: a plataforma não baixa o conteúdo das URLs de anexo, portanto não há SSRF de servidor nesses campos; a validação evita que links para
   a rede interna/esquemas perigosos sejam guardados e abertos por outros usuários. A checagem de DNS é “melhor esforço” (um domínio pode mudar de IP depois — *DNS rebinding*).
7. **2FA TOTP** protege contra roubo de senha, não contra *phishing em tempo real* nem contra malware no aparelho do usuário. Os códigos de recuperação
   são o ponto fraco clássico: guarde-os offline. Quem controla o banco **e** a chave (`SECURITY_ENC_KEY`/`JWT_SECRET`) consegue ler os segredos TOTP.
   O bloqueio por e-mail+IP não impede ataques distribuídos de muitos IPs (os limites de taxa globais e o 2FA mitigam).
8. **Política de senha** vale só para novas senhas; senhas antigas fracas continuam funcionando até serem trocadas (propositalmente, para não travar usuários em produção).
   A lista de senhas comuns é pequena; não consulta bases de vazamento (ex.: HIBP).
9. **Rate limits/contagens em memória** (ex.: ouvidoria, chat do site) valem por processo; em várias instâncias o limite efetivo é multiplicado.
10. O módulo **não substitui** WAF, backup testado, atualização de dependências, gestão de segredos, revisão de permissões e treinamento da equipe.
