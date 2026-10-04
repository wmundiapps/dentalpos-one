# Segurança do DentalPos CAD

> **Leia isto primeiro.** Um programa que roda no navegador entrega o seu código ao computador do usuário. **Ninguém consegue impedir de verdade** que alguém com o arquivo abra o F12, leia ou copie o código; o que se faz é **dificultar** (ofuscação, bloqueios) e **proteger o que importa no servidor** (licença, login, cobrança). As proteções abaixo são em camadas: elevam muito o custo de copiar/abusar, mas não são inviolabilidade.

## O que está implementado

| Camada | O que faz | Onde |
|---|---|---|
| **Login em 2 etapas** | Senha forte (PBKDF2-SHA256, 250 mil iterações) + código TOTP (Google/Microsoft Authenticator, Authy) + 8 códigos de recuperação de uso único. Bloqueio progressivo após 3 erros (até 15 min), código TOTP não pode ser reutilizado, sessão trava após 30 min parado ou 10 min com a aba oculta. | `src/security/auth.ts`, `AuthGate.tsx` |
| **Dados cifrados** | O autosave do caso é cifrado com AES-256-GCM, com chave derivada da senha (nunca armazenada). Sem a senha, o conteúdo guardado no navegador é ilegível. | `auth.ts`, `store.ts` |
| **Bloqueio de domínio** | O programa só roda nos domínios (e subdomínios) configurados e só em iframe de origens autorizadas (anti-clickjacking / anti-clone). | `guard.ts`, `config.ts` |
| **Anti-F12 / dissuasão** | Bloqueia F12, Ctrl+Shift+I/J/C, Ctrl+U, menu de contexto; detecta DevTools aberto (diferença de janela + cronometragem de `debugger`) e **trava a sessão**; silencia o console e mostra aviso anti-golpe. | `guard.ts` |
| **Código ofuscado** | Na build de release o código do aplicativo é ofuscado (nomes ilegíveis, textos cifrados em base64, fluxo de controle embaralhado), sem sourcemaps. Código numérico pesado recebe ofuscação leve para não perder desempenho. | `scripts/obfuscate-plugin.mjs` |
| **CSP estrita** | Só roda o script embutido (por hash SHA-256): sem `eval`, sem scripts externos, sem objetos/formulários/`<base>`, rede só para a API opcional de revisão por LLM. | `scripts/build-single.mjs`, `deploy/security-headers.conf` |
| **Uploads seguros** | Lista de extensões, limite de tamanho, checagem de assinatura (bloqueia .exe/ELF/script/ZIP/PDF/Office/HTML/SVG disfarçados), validação estrutural de STL/OBJ/PLY, JSON de projeto sem poluição de protótipo, nome de arquivo sanitizado. | `src/security/upload.ts` |
| **Imagens** | Toda foto é decodificada e **reencodificada** (remove EXIF/GPS, perfis e dados anexados, malware esteganográfico) e passa por **filtro de nudez/pornografia local** (modelo NSFWJS embutido; a foto não sai do computador). | `upload.ts`, `nsfw.ts` |
| **Privacidade** | A foto do paciente nunca é enviada nem salva (o autosave exclui a foto). A detecção facial roda localmente. | — |

## Como gerar a versão protegida

```bash
# arquivo único protegido, só para o seu domínio (e subdomínios)
VITE_ALLOWED_HOSTS=dentalpos.com.br npm run build:release
# permitir também abrir o .html do disco (testes internos)
VITE_ALLOW_FILE=1 npm run build:release
# permitir ser incorporado por outro sistema seu
VITE_EMBED_ORIGINS=https://app.seudominio.com.br npm run build:release
```
Resultado: `dist-single/dentalpos-cad.html`. A build normal (`npm run build:single`) continua **sem** proteções, para desenvolvimento e testes.

## O que ainda precisa do servidor (recomendado antes de vender)
1. **Licença/assinatura no servidor**: o programa só é entregue (ou só carrega um token) para clientes pagantes; o login 2FA local protege o uso individual, mas não substitui licenciamento. O servidor deve emitir tokens curtos e renová-los.
2. **Cabeçalhos HTTP** (`deploy/security-headers.conf`): HSTS, CSP com `frame-ancestors`, `nosniff`, etc. — `<meta>` não consegue definir `frame-ancestors`.
3. **HTTPS sempre**, certificado válido, domínio próprio.
4. Se um dia houver upload para servidor: antivírus (ClamAV) no servidor, o mesmo `validateUpload` e a mesma checagem de nudez no backend, limite de taxa e armazenamento isolado.
5. Dependências: rode `npm audit` periodicamente e atualize.
6. Telemetria de abuso (tentativas de login, domínios não autorizados) — só possível com backend.

## Limites honestos
* Quem tem o arquivo pode desligar o JavaScript do navegador, usar outro navegador/ferramenta ou desmontar o código com esforço; a ofuscação aumenta o trabalho, não o impede.
* Detecção de DevTools tem falsos positivos (janela acoplada/zoom) e falsos negativos; por isso só **trava a sessão** (exige novo login), sem destruir dados.
* O filtro de nudez é estatístico (pode errar em ambos os sentidos); fotos clínicas de sorriso passam normalmente nos testes.
* Se o usuário esquecer a senha **e** perder o autenticador e os códigos de recuperação, só resta "Apagar tudo e recomeçar" (os dados locais cifrados são perdidos — por desenho).
* Antivírus real não existe no navegador: o que se faz é aceitar **somente formatos de modelo/imagem**, validados e reencodificados, e nunca executar nada vindo do arquivo.
