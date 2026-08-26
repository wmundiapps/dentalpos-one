# Bloco 19 — Configurações da Agenda Inteligente

Este bloco conecta a tela `SmartSchedulingSettingsDialog` às APIs multi-tenant criadas no Bloco 17.

## Fluxo

1. A tela carrega a configuração local/feature flag como fallback.
2. Consulta `GET /smart-scheduling/config`.
3. Quando o backend responde, a política e as regras PostgreSQL tornam-se a referência exibida.
4. Ao salvar:
   - atualiza `PUT /smart-scheduling/policy`;
   - faz upsert das regras clínicas;
   - expande palavras-chave de laboratório em serviços persistidos;
   - desativa regras removidas;
   - atualiza também o fallback local/feature flag.
5. Se o backend estiver indisponível, o modo local seguro continua operacional.

## Segurança funcional

- isolamento por clínica/tenant permanece no backend;
- permissões `agenda.view` e `agenda.edit` continuam obrigatórias;
- o financeiro permanece apenas informativo;
- a prioridade clínica nunca é substituída por conveniência financeira.

## Observação

A interface atual mantém o modelo simples de retorno por regra. O backend possui campos adicionais de janela clínica; a tela continua compatível sem remover a segurança clínica existente.
