# Bloco 8 — SaaS comercial, isolamento e integração final

## Implementado neste checkpoint
- tenant/clinic context obrigatório no middleware já existente;
- unidades por clínica;
- storage configurável por clínica com prefixo `tenants/<tenant>/clinics/<clinic>`;
- cofre de segredos AES-256-GCM para credenciais por clínica;
- credenciais de Asaas/Stripe/Banco preparadas para armazenamento criptografado;
- feature flags por clínica e estágio de rollout;
- remetentes REVAH por clínica/unidade/canal (número/endereço selecionável);
- estrutura REVAH Leads para Receita Federal, Google Places e CSV;
- biblioteca FDI com 32 slots mestre e instância editável por caso;
- estratégia development → staging → pilot → production.

## Deliberadamente não declarado como concluído
- os 32 STL anatômicos clínicos reais ainda precisam ser fornecidos/criados e validados; o checkpoint cria o registro e os slots, não inventa anatomia clínica;
- adaptadores externos de pagamentos/mensageria exigem credenciais reais e homologação;
- Google deve usar API/licenciamento compatível; não foi criado scraper para contornar proteções;
- ingestão da Receita Federal exige definição da fonte pública/licenciada, atualização e base legal aplicável;
- RLS PostgreSQL ainda é recomendada como segunda barreira antes de produção comercial, além do tenant scoping da aplicação.
