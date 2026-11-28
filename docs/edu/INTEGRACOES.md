# EduMaster Pro — como configurar as integrações

Este documento lista **tudo que precisa de alguma configuração externa para funcionar** no EduMaster Pro, onde configurar e o que acontece se não configurar. Dividido em duas categorias: o que se configura **pela própria tela do sistema** (a maioria) e o que depende de **variável de ambiente na Railway** (infraestrutura compartilhada da plataforma).

## 1. Canais de comunicação (WhatsApp, Telegram, e-mail, SMS, voz, redes sociais, chat do site)

**Onde configurar:** dentro do próprio sistema, em **Comunicação > Canais** (`/edu/comunicacao`). Não precisa de nenhuma variável de ambiente — cada instituição cadastra suas próprias credenciais, por canal, direto na tela. As credenciais ficam cifradas no banco (nunca em texto puro).

Para cada canal, a tela pede os campos específicos daquele provedor (ex.: token do bot do Telegram, número e token do WhatsApp/Meta, chave do Resend para e-mail, etc.).

**Webhooks:** cada canal gera sua própria URL de webhook (mostrada na tela), com um segredo próprio por canal — não é a mesma chave para todas as instituições. O sistema valida a assinatura de cada provedor (Telegram, Meta, Twilio, Resend) automaticamente.

**Se não configurar:** o canal simplesmente aparece como desligado; os outros continuam funcionando normalmente. Nada quebra.

**Atenção (ponto a revisar):** a URL de webhook mostrada na tela usa como base o endereço configurado em `PUBLIC_API_URL` na Railway. Hoje isso aponta por padrão para o domínio do DentalPos (`api.dentalpos.com.br`) se a variável não estiver definida corretamente para o ambiente do EduMaster — vale conferir se o `PUBLIC_API_URL` do serviço do EduMaster na Railway está apontando para o domínio certo antes de divulgar os webhooks para alguma instituição.

## 2. Inteligência artificial (IA e visão computacional/OCR)

**Onde configurar:** variável de ambiente na Railway, no serviço da API do EduMaster.

| Variável | Para que serve | Obrigatória? |
|---|---|---|
| `ANTHROPIC_API_KEY` | Chave da Anthropic (Claude). Usada em todos os módulos com IA: assistente de ajuda, correção de atividades/questões, geração de provas, relatórios da reitoria, análise de documentos regulatórios, moderação de uploads (visão computacional/OCR), entre outros. | **Sim, para a IA funcionar de verdade.** Sem ela, qualquer chamada de IA falha com erro tratado (o módulo avisa e cai em preenchimento manual). |
| `ANTHROPIC_MODEL` | Nome do modelo a usar. | Não — se não definir, usa um padrão interno. |
| `OPENAI_API_KEY` | Reserva (fallback) só para texto, caso a Anthropic esteja fora do ar ou sem chave. | Não — opcional, e **não cobre visão computacional/OCR**, só texto. |

**Visão computacional (OCR, moderação de fotos/documentos enviados):** funciona **só** com `ANTHROPIC_API_KEY` configurada. Sem ela, a tela mostra o erro "Visão computacional indisponível".

**Atenção:** o módulo de boletos (contas a pagar) **não usa OCR** — ele só lê PDF com texto já embutido e XML de nota fiscal. Um boleto escaneado como imagem fica salvo no sistema, mas não é lido automaticamente; a própria tela avisa isso.

## 3. Verificação de instituição de origem (e-MEC) — módulo Análise de Documentos

**Onde configurar:** variável de ambiente na Railway.

| Variável | Para que serve |
|---|---|
| `EMEC_API_URL` | Endereço do serviço real de consulta ao cadastro e-MEC/secretarias estaduais (para conferir se a instituição de origem de um aluno transferido é regular). |
| `EMEC_API_TOKEN` | Token de acesso a esse serviço. |

**Se não configurar (situação atual):** o sistema usa automaticamente uma **base de demonstração simulada**, e avisa isso na própria tela ("usando a base local de DEMONSTRAÇÃO"). Ou seja, hoje essa verificação ainda não está ligada a uma fonte oficial real — é preciso contratar/integrar um provedor desse serviço e preencher as duas variáveis para a consulta passar a ser real.

## 4. Financeiro — contas a pagar por e-mail (boletos de fornecedores)

**Onde configurar:** o segredo do webhook é gerado **por instituição**, direto na tela do módulo Financeiro > Boletos. Não é uma variável de ambiente global.

| Variável (opcional) | Para que serve |
|---|---|
| `BOLETOS_DOMINIO_EMAIL` | Só define o domínio de e-mail *fictício* mostrado como exemplo quando a instituição ainda não configurou o próprio domínio. Não afeta o funcionamento, só o texto de exemplo na tela. |

**Importante:** esse recebimento de boleto por e-mail também **não lê imagem/PDF escaneado** (sem OCR) — só PDF com texto embutido e XML de NF-e.

## 5. Financeiro — baixa automática de mensalidade do aluno pelo gateway de pagamento

**Situação atual: este ponto ainda não está ligado de ponta a ponta.** Existe um endpoint interno pronto para dar baixa automática em mensalidades (`contas a receber`) quando o gateway de pagamento (Asaas/Stripe) confirma um pagamento, documentado em `backend/src/modules/financeiro/INTEGRACAO.md`. Porém, o webhook que de fato recebe a confirmação do Asaas/Stripe hoje **não chama** esse endpoint — ele só trata cobrança da clínica (DentalPos) e da assinatura da própria plataforma.

**O que falta para funcionar:** uma mudança de código (não de configuração) ligando o webhook existente do Asaas/Stripe a esse endpoint do EduMaster. Até isso ser feito, a baixa de mensalidade continua manual.

## 6. Backup do banco de dados

**Onde configurar:** variável de ambiente na Railway (vale para toda a plataforma, não é específico do EduMaster, mas protege os dados dele também).

| Variável | Para que serve |
|---|---|
| `BACKUP_S3_BUCKET`, `BACKUP_S3_REGION`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | Onde salvar o backup (um bucket S3 ou compatível, ex.: Cloudflare R2). |
| `BACKUP_ENCRYPTION_KEY` | Chave para cifrar o backup (precisa ter pelo menos 32 caracteres). |
| `BACKUP_LOCAL_DIR` | Alternativa: salvar em disco local, se não houver bucket configurado. |
| `BACKUP_RETENTION_COUNT` | Quantos backups manter (padrão: 30). |
| `BACKUP_SCHEDULER` | Colocar como `off` desliga o agendamento automático. |

**Se não configurar em produção: o sistema não sobe.** Essa é a única integração desta lista que trava o início do serviço (`NODE_ENV=production`) se estiver incompleta — é tratada como erro crítico, não como aviso.

## 7. Segurança de base (sempre obrigatórias, infraestrutura da plataforma)

Essas já devem estar configuradas desde a criação do ambiente — não exigem ação nova, só confirmação:

| Variável | Para que serve |
|---|---|
| `JWT_SECRET` | Assina o token de login. Precisa ter pelo menos 48 caracteres. |
| `TENANT_SECRET_MASTER_KEY` | Chave que protege (cifra) as credenciais de cada instituição — por exemplo, os tokens dos canais de comunicação do item 1. Precisa ter pelo menos 32 caracteres. |

## Resumo — o que precisa de ação agora

| Prioridade | O que fazer |
|---|---|
| **Alta** | Configurar `ANTHROPIC_API_KEY` na Railway, se ainda não estiver — sem ela, nenhuma função de IA funciona de verdade. |
| **Alta** | Confirmar `PUBLIC_API_URL` do serviço do EduMaster na Railway antes de divulgar qualquer webhook de canal para uma instituição. |
| **Média** | Decidir se/quando contratar um provedor real de consulta e-MEC (`EMEC_API_URL`/`EMEC_API_TOKEN`) — hoje a verificação é simulada. |
| **Média** | Avaliar se vale ligar o webhook do Asaas/Stripe à baixa automática de mensalidade do EduMaster (é código, não configuração). |
| **Baixa** | Confirmar que o backup (`BACKUP_*`) está completo no ambiente de produção — sem isso, o serviço nem sobe, então, se está no ar, já está configurado. |
| **Nenhuma ação** | Canais de comunicação (WhatsApp, Telegram, e-mail, SMS) — cada instituição configura o próprio, direto na tela, sem depender de nada na Railway. |
