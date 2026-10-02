# Motor de escaneamento (portado do DentalPos One)

Código trazido **sem alteração de lógica** de `frontend/src/dentalpos-design/services` e `tooth-library` do DentalPos One
(somente o caminho de um import foi ajustado), para o módulo ficar independente. Depende apenas de `three`.

Fica de fora o que acopla ao DentalPos One (MUI, Fila de Design ↔ Laboratório em `OperationsHubService`): `DesignQueuePanel`,
`DesignCaseWorkspacePanel`. Esses são "cola" de integração e voltam quando o módulo for ligado ao sistema.

Capacidades: carregar STL, diagnóstico e reparo de malha, orientação, linha de término, eixo de inserção, undercuts, espessura,
mapa de contatos, ajuste ao preparo/implante, coroa semiautomática, morfologia, simetria, ajuste oclusal, projeto/autosave/recuperação,
qualidade, relatório, finalização e exportação STL.
