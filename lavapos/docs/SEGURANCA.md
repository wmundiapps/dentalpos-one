# Segurança do LavaPos — camadas de proteção

Resumo para o Robson: o sistema guarda CPF, telefone, fotos e dinheiro de milhares de pessoas. Foram colocadas **várias barreiras em camadas**: se uma falhar, a próxima segura. Tudo o que está em **"Feito"** já está no código e coberto por teste automático (`npm test`, 11 testes). O que está em **"Falta fazer"** depende de conta, DNS ou decisão sua.

## 1. Contra invasão e roubo de conta ("hackers")
| Camada | Feito |
|---|---|
| Senha forte | mínimo 10 caracteres, letras e números, bloqueia senhas comuns; guardada só como hash (bcrypt custo 12) |
| Bloqueio por tentativas | 5 erros = conta travada por 15 min; mensagem igual para e-mail inexistente (não revela quem tem conta) |
| Verificação em 2 etapas | aplicativo autenticador (TOTP); segredo cifrado; o mesmo código não vale duas vezes |
| Sessão | token de 12 h, algoritmo fixo (recusa token "alg: none"); trocar a senha derruba as outras sessões |
| Limite de requisições | por IP, guardado no banco (vale em todas as instâncias): login, cadastro, agendamento online, envio de foto, exportação |
| Isolamento entre lava-rápidos | toda consulta carrega o `tenant_id`; teste prova que um lava-rápido não lê dados do outro |
| Perfis | dono × funcionário × plataforma; configurações, preços, equipe e dados só do dono |
| Auditoria | login, falhas, CPF visualizado, exportação, pagamento baixado, alteração de configuração, 2 etapas ligada/desligada |
| Banco | tabelas com RLS ligado e sem acesso para `anon`/`authenticated` (só o servidor acessa) |
| Cabeçalhos | HSTS, CSP restrita (só o próprio site e a API), proibido embutir em outro site (anti-clickjacking), `nosniff`, sem referer |
| Webhook | token secreto comparado em tempo constante |
| Rotina automática | só executa com `CRON_SECRET` |

## 2. Contra vírus e malware
- **Nenhum upload de arquivo além de foto.** Não há anexo de PDF, planilha ou documento.
- Toda foto é **decodificada e regravada** pelo servidor (JPEG novo, máx. 1600 px, sem metadados/GPS): arquivo disfarçado de imagem (`.php`, script, polyglot) é recusado ou neutralizado. Teste automático envia um "script com extensão de imagem" e confere que é recusado.
- Foto servida com `nosniff` + CSP `sandbox` (o navegador nunca executa).
- Limite de tamanho (8 MB) e de dimensão (40 megapixels contra "bomba de descompressão").
- Corpo JSON limitado a 200 KB; só aceita `application/json`.
- Entradas passam por validação (zod): campos desconhecidos são descartados; textos perdem `<` e `>` e caracteres de controle; placa, CPF, CNPJ e telefone são validados.
- Aplicativos (Apple/Google): sem execução de código remoto, sem tráfego sem criptografia, sem backup do aparelho.

## 3. Contra phishing e golpe usando o nome do LavaPos
- Mensagens saem de **modelos fixos**; nome digitado por cliente passa por filtro que **remove links**. O único link enviado é o do próprio sistema.
- Todo aviso de marketing traz link **assinado** para parar de receber (não dá para forjar) e o contato é bloqueado por hash.
- WhatsApp/SMS de marketing só das 8h às 21h; marketing só com consentimento (LGPD).
- A tela e os e-mails avisam: **"Nunca pedimos sua senha por WhatsApp, SMS ou e-mail."**
- A chave do Asaas é digitada **na tela**, nunca no chat/e-mail; fica cifrada e **nunca volta** para o navegador.
- Formulários públicos têm campo-isca anti-robô, limite por IP e limite de agendamentos por cliente.

## 4. Dados sensíveis (LGPD)
- CPF e chaves de integração cifrados no banco (AES-256-GCM). Listas mostram `***.***.***-XX`; o CPF inteiro só no detalhe do cliente e **fica registrado na auditoria**.
- Exportação de todos os dados e encerramento de conta dentro do sistema; contas encerradas são anonimizadas após 30 dias e as fotos eliminadas.
- Contratos e política: `docs/legal/` (minutas).

## Falta fazer (👤 depende de você)
1. **Variáveis na Vercel** (`.env.example`): `JWT_SECRET`, `LAVAPOS_ENCRYPTION_KEY`, `CRON_SECRET`, `ASAAS_WEBHOOK_TOKEN`. Gere no terminal com `openssl rand -base64 48` e **guarde uma cópia da `LAVAPOS_ENCRYPTION_KEY`** (sem ela, CPF e chaves cifradas não voltam). Não marque como "Sensitive" as que o app precisa ler; nunca use `VITE_*` para segredo.
2. **Anti-golpe de e-mail (DNS do domínio que envia):** cadastrar **SPF**, **DKIM** (o provedor de e-mail entrega o registro) e **DMARC** (`v=DMARC1; p=quarantine; rua=mailto:dmarc@lavapos.com.br`), e depois endurecer para `p=reject`.
3. **Proteger a marca:** registrar `lavapos.com.br` e variações (`lavapos.com`, `lava-pos`, `lavapos.app`), ligar bloqueio de transferência e 2 etapas na conta do registrador; depositar a marca no INPI.
4. **Teste de invasão** por profissional independente antes do lançamento grande e **seguro cibernético**.
5. **Backups:** ligar backup diário (PITR) no Supabase e testar a restauração uma vez.
6. **Dependências:** rodar `npm audit` a cada semana (junto da atualização semanal) e ativar o Dependabot no GitHub.
7. **2 etapas obrigatória para o dono**: hoje é opcional; podemos tornar obrigatória após o lançamento.
8. **Incidente:** se suspeitar de invasão: (a) troque `JWT_SECRET` na Vercel (desconecta todo mundo), (b) consulte a tabela `audit_log`, (c) avise os lava-rápidos afetados em até 48 h (cláusula do adendo LGPD) e, se houver risco relevante, a ANPD.

## Limites honestos
Nenhum sistema é 100% seguro. Este conjunto cobre os ataques mais comuns (senha roubada, força bruta, envio de arquivo malicioso, injeção, vazamento entre clientes, golpe por mensagem), mas **não substitui um teste de invasão profissional** nem a revisão do jurídico sobre incidentes.
