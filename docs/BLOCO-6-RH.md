# Bloco 6 — RH e Gestão de Pessoas

Checkpoint operacional do RH integrado ao DentalPos One.

## Implementado
- Cadastro e edição de colaborador, vínculos CLT/PJ/Autônomo/Estágio/diária/percentual/terceirizado.
- Situação: ativo, experiência, férias, afastado, aviso-prévio e desligado.
- Data de admissão, fim da experiência, remuneração-base, carga horária, supervisor e chave PIX.
- Ponto e ocorrências: presença, atraso, falta, atestado, folga, férias e home office.
- Horas extras e banco de horas.
- Folha: proventos, descontos, encargos e benefícios; fechamento por competência.
- Férias: período aquisitivo, limite concessivo, programação, dias e status.
- Documentos/contratos com emissão, vencimento, status e assinatura digital prevista.
- Orientações, advertências, suspensões e justa causa com histórico.
- Alertas para término de experiência, documentos vencendo/vencidos e férias em atenção.
- Persistência Alpha no frontend e modelos/endpoints PostgreSQL/Prisma preparados no backend.
- Auditoria nas operações sensíveis e proteção multi-tenant/permissões já existentes do Bloco 1.

## Próximas integrações
- Bloco 7 poderá usar REVAH para avisos internos/externos de RH configuráveis.
- Bloco 8 conectará alertas do RH ao Dashboard executivo e central de notificações.
- Para produção, cálculos legais de folha, eSocial, FGTS/INSS/IRRF e documentos oficiais exigem regras fiscais/trabalhistas vigentes e integração específica; este checkpoint não afirma cálculo legal automatizado completo.
