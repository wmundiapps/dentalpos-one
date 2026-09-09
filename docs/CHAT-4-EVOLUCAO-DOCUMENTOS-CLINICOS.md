# Chat 4 — Evolução clínica, prescrições e documentos

## Escopo entregue
- Expansão aditiva de `ClinicalEvolution` para atendimento, dentes/regiões, anestésico, materiais, intercorrências, orientações, próxima conduta e anexos.
- Modelos editáveis por clínica (`ClinicalDocumentTemplate`).
- Documentos clínicos versionados (`ClinicalDocument`) e histórico imutável de revisões (`ClinicalDocumentHistory`).
- Tipos: receita, atestado, declaração, encaminhamento, solicitação de exame, relatório, consentimento e contrato clínico.
- Emissão, revisão, cancelamento, histórico, autoria, hash SHA-256 do conteúdo e auditoria.
- Adaptador de assinatura digital preparado, sem inventar fornecedor externo. Atualmente retorna `501/UNAVAILABLE`.
- Frontend service real substituindo dados estáticos.

## Multi-tenant e segurança
Todas as consultas e mutações são filtradas por `clinicId` + `tenantId` derivados da sessão autenticada. Paciente é revalidado no mesmo escopo antes de emissão. Rotas usam `clinical.view` e `clinical.edit`.

## PDF / impressão
O documento guarda conteúdo canônico e metadados suficientes para impressão pelo navegador e para um gerador PDF futuro. Nenhuma dependência PDF externa foi adicionada neste Chat para evitar introduzir infraestrutura não existente.

## Assinatura digital
`signatureAdapter.ts` define a fronteira de integração. Pendência externa: escolher/configurar provedor compatível com requisitos jurídicos da clínica e implementar o adapter. O sistema não marca documento como assinado sem retorno real de um provedor.

## Migration
Arquivo SQL é somente aditivo e não foi executado. Não foi usado `prisma migrate dev`.
