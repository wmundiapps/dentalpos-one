# Resumo das camadas de segurança do EduMaster Pro

Levantado a partir do código do sistema (51 controles). A coluna de limites diz o que cada controle NÃO faz, para a apresentação não prometer demais.


## Autenticação e acesso

- **Autenticação em duas etapas (2FA TOTP).** Código de 6 dígitos de aplicativo autenticador (RFC 6238, SHA-1, passo de 30 s, janela de ±1 passo, segredo de 160 bits), com ativação por QR e confirmação do primeiro código. Mesmo que a senha vaze, o invasor não entra sem o celular do usuário. **Limite:** Protege contra roubo de senha; não contra phishing em tempo real nem malware no aparelho.
- **Anti-reutilização de código 2FA.** O último passo de tempo aceito é guardado e um código já usado não vale de novo; comparações em tempo constante. Impede que um código espiado seja reaproveitado.
- **Códigos de recuperação de uso único.** 8 códigos gerados na ativação, mostrados uma única vez e guardados apenas como HMAC-SHA256; novos códigos invalidam os antigos. O usuário que perde o celular volta a entrar sem abrir brecha para terceiros.
- **2FA obrigatório por perfil.** A variável REQUIRE_2FA_ROLES lista perfis (por exemplo ADMIN, OWNER, RECTOR) que precisam de 2FA; quem não tem recebe um token restrito que só serve para configurar. Perfis obrigados não podem desativar o 2FA. A instituição impõe proteção reforçada aos cargos de maior risco. **Limite:** Por padrão ninguém é obrigado; precisa ser configurado.
- **Tokens de escopo restrito.** Os tokens de desafio 2FA e de configuração (scope 2fa e 2fa-setup) nunca são aceitos pelo middleware de autenticação. Uma etapa intermediária do login não serve de chave para a API.
- **Bloqueio progressivo de login.** 5 falhas por e-mail e IP bloqueiam por 15 min, depois 1 h, depois 4 h; a mensagem ao cliente é sempre genérica (e-mail inexistente também conta). Torna inviável adivinhar senhas por força bruta e não revela quem tem conta. **Limite:** Não impede ataques distribuídos por muitos IPs; limites globais e 2FA mitigam.
- **Limite de tentativas do 2FA.** 5 erros de código em 15 min por usuário e IP bloqueiam; vale para verificar, desativar e regenerar códigos. Impede adivinhar o código de 6 dígitos.
- **Limitadores de taxa (rate limit).** Limite de 10 tentativas por 15 min em login, cadastro, redefinição de senha e verificação 2FA, e 1.200 requisições por 15 min na API (configuráveis por variável de ambiente). Reduz abuso automatizado e picos maliciosos. **Limite:** Contadores em memória por processo; em várias instâncias o limite efetivo se multiplica.
- **Política de senha forte.** Mínimo de 10 caracteres e rejeição de senhas comuns em cadastro e troca. Evita senhas óbvias em novas contas. **Limite:** Vale só para novas senhas; antigas continuam válidas até a troca.
- **Reset administrativo auditado de 2FA.** A administração remove o 2FA de um usuário do mesmo tenant que perdeu aparelho e códigos; a ação grava evento de severidade crítica. Suporte seguro, sem deixar usuário preso nem abrir exceções invisíveis.
- **Reautenticação 2FA em pagamentos.** Autorizar, baixar ou enviar remessa acima de um valor configurável exige código 2FA do próprio usuário. Pagamentos de alto valor só saem com a presença real do autorizador. **Limite:** Depende de configurar o valor de corte; sem 2FA ativo o usuário é barrado.

## Criptografia e proteção de dados

- **Criptografia AES-256-GCM de segredos.** Segredos 2FA são cifrados com AES-256-GCM e IV aleatório de 12 bytes; a chave vem de SECURITY_ENC_KEY (ou derivada do JWT_SECRET por HKDF) e permite rotação. Um vazamento do banco não expõe os segredos de autenticação. **Limite:** Quem controla o banco e a chave consegue ler; guarde a chave como segredo.
- **Dados de RH cifrados em repouso.** CPF, conta bancária, chave Pix, CID, CRM e restrições do ASO são cifrados; CPF também gera HMAC para unicidade sem exposição. Dados pessoais e de saúde dos colaboradores protegidos mesmo diante de acesso ao banco.
- **Mascaramento em listas e telas.** CPF aparece como ***.***.***-NN; e-mail, telefone e nome são mascarados em listagens, contatos de cobrança e destinos de envio; consulta completa exige motivo e fica em log. Quem não precisa ver o dado completo não o vê.
- **Redação de logs.** console.* e o log HTTP passam por redação de JWT, Bearer, senhas e CPF formatado, e a URL é sanitizada; auditoria e eventos de segurança também passam por redação. Logs úteis ao suporte sem virar vazamento de dados pessoais.
- **Transporte seguro (HSTS).** Em produção o servidor envia Strict-Transport-Security via helmet e o frontend, HSTS de 2 anos com subdomínios. Obriga o navegador a usar HTTPS.
- **Respostas da API sem cache.** Todas as respostas da API saem com Cache-Control no-store e Pragma no-cache. Dados sensíveis não ficam guardados em caches de navegador ou intermediários.
- **Isolamento por tenant.** Todo registro dos módulos tem tenantId; leitura ou alteração de outro tenant devolve 404 e referências cruzadas são conferidas no tenant. Uma instituição nunca enxerga os dados de outra.

## Navegador, CSP e cabeçalhos

- **Content-Security-Policy no frontend.** CSP restritiva no site: scripts apenas do próprio domínio, object-src none, frame-ancestors none, base-uri self e form-action self, com lista fechada de destinos de conexão. Dificulta injeção de scripts (XSS) e clickjacking. **Limite:** Usa style-src com unsafe-inline.
- **Cabeçalhos de segurança do frontend.** X-Content-Type-Options nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy bloqueando câmera, microfone e geolocalização, e COOP same-origin. Fecha vetores comuns de ataque via navegador.
- **Cabeçalhos e CSP da API.** A API envia Permissions-Policy restritiva, Referrer-Policy no-referrer, CORP same-site, nosniff, X-Frame-Options DENY e CSP default-src none; frame-ancestors none em respostas JSON, além do helmet. A API não pode ser embutida nem interpretada como página.
- **Barreira de origem (originGuard).** POST, PUT, PATCH e DELETE com Origin ou Referer fora da lista permitida recebem 403 e geram evento; o CORS usa a mesma lista. Impede que outro site use a sessão de um usuário logado (CSRF). **Limite:** Protege navegadores; quem chama sem Origin (webhooks, cron, scripts) segue permitido; não impede copiar o frontend.
- **CSP sandbox em arquivos servidos.** Arquivos do repositório, anexos de fotos, feedback, minutas e páginas públicas são servidos com CSP restritiva, nosniff e attachment para tipos não seguros. Um arquivo malicioso enviado por alguém não executa no navegador de quem o abrir.

## Uploads, moderação e rede

- **Scanner de uploads em camadas.** Verifica nome e dupla extensão, tipo real por magic bytes, divergência entre extensão, conteúdo e MIME, allowlist e tamanho por categoria, PDFs com JavaScript ou ação automática, SVG com script, HTML disfarçado, macros em Office, ZIP com executável, traversal ou senha, polyglots, imagens-bomba e CSV com DDE, mais o teste EICAR. Reduz o risco de malware e documentos armadilhados chegarem a funcionários e alunos. **Limite:** Malware novo ou ofuscado pode passar; é análise estática.
- **Guarda global de uploads (uploadGuard).** Middleware inspeciona todo corpo JSON de POST, PUT e PATCH em /api/public e rotas autenticadas: qualquer data URL ou campo base64 passa pelo scanner; falha interna da varredura recusa o arquivo (fail-closed). Uma só proteção cobre todos os módulos, sem depender de cada tela lembrar.
- **Antivírus ClamAV opcional.** Integração com ClamAV via clamd TCP quando configurado. Adiciona assinaturas de vírus atualizadas ao scanner embutido. **Limite:** Opcional; só funciona se CLAMAV_HOST estiver configurado.
- **Consulta de hash ao VirusTotal opcional.** Consulta apenas o SHA-256 do arquivo; o arquivo nunca é enviado. Reputação de arquivos conhecidos sem expor o conteúdo. **Limite:** Opcional; arquivo inédito retorna desconhecido e é tratado como limpo.
- **Proteção contra bomba de descompressão.** Limites de megapixels de imagem, razão de compressão de ZIP e tamanho descomprimido. Evita derrubar o servidor com arquivos compactados maliciosos.
- **Moderação de imagens por IA.** Imagem enviada pode ser avaliada por IA com visão para recusar conteúdo sexual explícito e violência gratuita, preservando fotos clínicas e anatomia; política flag (padrão), strict ou off. Ambiente institucional livre de conteúdo impróprio. **Limite:** Exige chave ANTHROPIC_API_KEY; é probabilística; imagens acima de 5 MB e vídeos não são moderados.
- **Moderação de texto e links.** Em formulários públicos, ouvidoria e chat, bloqueia domínios adultos ou de malware e javascript: e script, e marca para revisão URLs encurtadas, homoglifos, links para IP, TLD abusado e frases de phishing; não bloqueia termos médicos. Barra golpes sem censurar vocabulário legítimo. **Limite:** Baseada em listas e padrões, não em semântica.
- **Anti-SSRF em links de anexo.** Campos de URL só aceitam https público, sem IP privado, localhost, metadados de nuvem, credenciais, javascript:, data: ou file:. Impede guardar links para a rede interna ou esquemas perigosos. **Limite:** A checagem de DNS é de melhor esforço (DNS rebinding).
- **Proteção dos endpoints públicos.** Limite por IP, honeypot e moderação de texto em formulários, chat e portal do titular; bloqueio após 5 erros de código no portal. Reduz spam e abuso nas páginas abertas ao público. **Limite:** Limites em memória por processo.

## Auditoria e rastreabilidade

- **Trilha de auditoria global.** Função audit() registra no EduAuditEvent módulo, ação, usuário, referência e detalhes (com redação de dados pessoais) em criações, alterações e decisões de todos os módulos. É possível responder quem fez o quê e quando.
- **Trilha por título a pagar.** Cada transição do título grava evento com usuário e papel; o conteúdo autorizado é congelado por hash. Fraude ou alteração após autorização é detectada e bloqueada.
- **Segregação de funções.** Quem lança não confere nem autoriza, quem registra a permuta não a aprova, quem aprova ajuste, férias ou licença não o faz sobre si, quem conferiu o acerto não paga. Controle interno aplicado pelo sistema, não por confiança.
- **Eventos de segurança.** SegEvento registra login falho, bloqueio, 2FA, upload bloqueado, origem negada e moderação, consultáveis por administradores do tenant com filtros e severidade. Visibilidade para detectar ataques e erros. **Limite:** Exige aplicar a migração das tabelas Seg*.
- **Log de acesso a dado sensível.** LgpAcessoSensivel grava usuário, papel, recurso e titular nos acessos a saúde, remuneração, disciplinar, identificação, avaliação, dado judicial e antecedentes, e em rotas de apoio, AEE, ocorrências e bolsas. Transparência sobre quem consultou dados delicados.
- **Registro de cada contato de cobrança.** Canal, resultado, base legal, destino mascarado e usuário ou régua são gravados em cada contato, inclusive bloqueados. Prova de conformidade em reclamações.
- **Exportações CSV auditadas.** Exportações da cobrança são auditadas e neutralizam injeção de fórmula. Evita vazamento silencioso e ataques via planilha.

## LGPD: direitos, consentimento e retenção

- **Consentimentos versionados.** Texto exibido, versão, hash, origem e revogação ficam guardados; textos publicados são imutáveis; menores exigem responsável legal. Prova do consentimento e respeito às finalidades.
- **Direitos do titular (art. 18).** Protocolo, fila do DPO com semáforo de 15 dias (uma prorrogação de +15 justificada), verificação de identidade obrigatória, pacote de dados em JSON, correção e resposta com trilha. Atendimento organizado dentro do prazo legal. **Limite:** A verificação de identidade é registrada, não automatizada.
- **Anonimização e eliminação com exceção do art. 16.** Plano em dry-run por padrão e execução em uma transação com confirmação; histórico escolar, notas, frequência, diplomas, financeiro/fiscal, estágio e disciplinar são mantidos com fundamento explícito. Atende ao titular sem apagar o que a lei manda guardar. **Limite:** Texto livre e anexos não são varridos.
- **Descoberta de dados não classificados.** Tabelas com studentId, candidatoId ou egressoId fora do catálogo são descobertas pelo schema, exportadas e tratadas como mantidas. Reduz o risco de esquecer dados de um titular.
- **Inventário de tratamento (ROPA, art. 37).** Atividades pré-populadas com base legal, categorias, compartilhamento, retenção e medidas de segurança, exportáveis em CSV. Documentação exigida pela LGPD pronta para revisão.
- **Política de retenção e expurgo.** Alvos como candidatos não matriculados, contatos inativos, mensagens, eventos de segurança e acessos sensíveis, com prazo configurável respeitando mínimo; job em dry-run por padrão. Só guarda o dado enquanto necessário. **Limite:** Execução real exige LGPD_RETENCAO_EXECUTAR=true ou confirmação manual.
- **Gestão de incidentes (art. 48).** Prazo de 3 dias úteis com feriados nacionais, checklist, comunicação à ANPD e aos titulares e linha do tempo. Resposta organizada a vazamentos. **Limite:** Feriados locais não entram no cálculo.
- **Encarregado (DPO).** Designação com canal do titular e vínculo a usuário para acesso à Central LGPD. Ponto de contato formal com titulares e ANPD.
- **Cookies e Política de Privacidade públicas.** Banner de cookies com consentimento por finalidade, Política de Privacidade e Termos de Uso públicos. Transparência para o titular.
- **Supressão global no marketing.** Lista de supressão com hash e máscara, opt-out por qualquer canal, opt-in obrigatório, limites e janela de horário e descadastro em um clique. Marketing que respeita a vontade do titular em todos os canais.
- **Minimização para a Reitoria.** Resumos de RH e avaliações sem nomes, CPF, salários individuais, CID ou notas individuais, e grupos com menos de 3 pessoas suprimidos (k-anonimato). Gestão baseada em indicadores, sem expor pessoas.
- **Sigilo no Jurídico.** Documentos confidenciais e processos criminais ou em segredo de justiça só para jurídico e reitoria; financeiro e secretaria veem CPF/CNPJ mascarado. Informação jurídica sensível protegida por papel.

## Como a WMundi se relaciona com os dados
- Senhas ficam apenas como hash: ninguém, nem a WMundi, consegue lê-las.
- Dados sensíveis são cifrados (AES-256-GCM); quem controla o banco e a chave consegue ler, por isso a chave deve ficar sob guarda da instituição.
- Para a WMundi não ter acesso aos dados, a implantação precisa colocar banco e chave no ambiente da instituição, com acesso de suporte só mediante autorização e registro. Isso é arranjo de implantação e de contrato, não algo que o software garante sozinho.


## O que não está coberto (dizer com clareza)
- Não há teste de invasão (pentest) independente nem certificação (ISO 27001, SOC 2) citados no código.
- Limites de requisição ficam em memória por processo: com várias instâncias do servidor o limite efetivo se multiplica.
- Antivírus ClamAV e consulta VirusTotal são opcionais e dependem de configuração.
- O ambiente de demonstração usa dados fictícios e chaves de demonstração; produção exige chaves próprias, backup e revisão do jurídico.
