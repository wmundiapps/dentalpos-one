// Funções do módulo apoio para uso por outros módulos (comunicacao, notas, provas, secretaria, reitoria...).
export { calcularRisco, calcularNps, calcularIndicadoresEgressos, agregarRespostas, estadoSla, adaptacaoTempoExtra } from './logic'
export { avaliarAluno, recalcularRiscoTenant } from './risco'
export { coletarMetricasAluno } from './metricas'
export { adaptacoesVigentesDoAluno } from './aee'
export { listarEgressosParaCampanha, sincronizarConcluintes } from './egressos'
export { montarRelatorio as relatorioOuvidoria, renderRelatorioAnual as renderRelatorioAnualOuvidoria } from './ouvidoria'
export { bootstrapApoio } from './bootstrap'
