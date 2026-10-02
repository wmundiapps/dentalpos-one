-- EduMaster Pro: tabelas novas (somente criação; nenhuma tabela existente é alterada).
-- Gerado com: prisma migrate diff --from-schema-datamodel <schema main> --to-schema-datamodel prisma/schema.prisma --script
-- Aplicar em staging com backup antes de produção.

-- CreateEnum
CREATE TYPE "EduBrandAssetKind" AS ENUM ('LOGO_PRINCIPAL', 'LOGO_HORIZONTAL', 'LOGO_ESCURA', 'LOGO_MONOCROMATICA', 'BRASAO', 'SELO_CERTIFICADO', 'MARCA_DAGUA', 'FAVICON', 'ASSINATURA', 'CABECALHO_DOCUMENTO', 'RODAPE_DOCUMENTO');

-- CreateEnum
CREATE TYPE "EduSpaceType" AS ENUM ('SALA_AULA', 'LABORATORIO', 'AUDITORIO', 'BIBLIOTECA', 'CLINICA_ESCOLA', 'QUADRA', 'PATIO', 'ESTACIONAMENTO', 'SALA_REUNIAO', 'SALA_PROFESSORES', 'ADMINISTRATIVO', 'POLO_EAD', 'OUTRO');

-- CreateEnum
CREATE TYPE "EduReminderStatus" AS ENUM ('PENDENTE', 'NOTIFICADO', 'CONCLUIDO', 'CANCELADO', 'ADIADO');

-- CreateEnum
CREATE TYPE "EduSeverity" AS ENUM ('INFO', 'ATENCAO', 'CRITICO');

-- CreateEnum
CREATE TYPE "EduNotificationStatus" AS ENUM ('PENDENTE', 'ENVIADA', 'ENTREGUE', 'LIDA', 'FALHA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "Modalidade" AS ENUM ('EAD', 'PRESENCIAL', 'SEMIPRESENCIAL');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ATIVO', 'TRANCADO', 'CANCELADO', 'DESISTENTE', 'CONCLUIDO', 'FORMADO');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ATIVA', 'TRANCADA', 'CANCELADA', 'CONCLUIDA');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('TEORICA', 'PRATICA');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('AGENDADA', 'REALIZADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMADO', 'CANCELADO', 'PRESENTE', 'FALTOU');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('PDF', 'VIDEO', 'RESUMO', 'MATERIAL_COMPLEMENTAR', 'BIBLIOTECA');

-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('PROVA', 'ATIVIDADE', 'AUTOAVALIACAO', 'SIMULADO_ENADE', 'SIMULADO_RESIDENCIA');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLA_ESCOLHA', 'DISSERTATIVA', 'VERDADEIRO_FALSO');

-- CreateEnum
CREATE TYPE "CertificateType" AS ENUM ('CONCLUSAO_CURSO', 'NIVELAMENTO', 'EXTENSAO', 'PARTICIPACAO');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ATIVO', 'PASSIVO', 'PATRIMONIO_LIQUIDO', 'RECEITA', 'DESPESA');

-- CreateEnum
CREATE TYPE "FinancialStatus" AS ENUM ('PENDENTE', 'PAGO', 'ATRASADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('RECEITA', 'DESPESA');

-- CreateEnum
CREATE TYPE "FormaPagamento" AS ENUM ('PIX', 'BOLETO', 'CARTAO', 'DINHEIRO', 'TRANSFERENCIA');

-- CreateEnum
CREATE TYPE "FiscalInvoiceType" AS ENUM ('NFSE', 'NFE', 'RECIBO');

-- CreateEnum
CREATE TYPE "FiscalInvoiceStatus" AS ENUM ('PENDENTE', 'EMITIDA', 'CANCELADA', 'ERRO');

-- CreateEnum
CREATE TYPE "LibraryAccessType" AS ENUM ('ASSINATURA_INSTITUCIONAL', 'ADESAO_INDIVIDUAL');

-- CreateEnum
CREATE TYPE "LibraryAccessStatus" AS ENUM ('ATIVA', 'PENDENTE', 'CANCELADA');

-- CreateEnum
CREATE TYPE "AdmTipoProcesso" AS ENUM ('VESTIBULAR_TRADICIONAL', 'VESTIBULAR_AGENDADO', 'ENEM', 'TRANSFERENCIA_EXTERNA', 'PORTADOR_DIPLOMA', 'POS_LATO_SENSU', 'POS_STRICTO_SENSU');

-- CreateEnum
CREATE TYPE "AdmStatusProcesso" AS ENUM ('RASCUNHO', 'ABERTO', 'ENCERRADO', 'CLASSIFICADO', 'EM_CONVOCACAO', 'FINALIZADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "AdmModalidadeOferta" AS ENUM ('PRESENCIAL', 'SEMIPRESENCIAL', 'EAD');

-- CreateEnum
CREATE TYPE "AdmTurno" AS ENUM ('MATUTINO', 'VESPERTINO', 'NOTURNO', 'INTEGRAL', 'FLEXIVEL');

-- CreateEnum
CREATE TYPE "AdmStatusCandidato" AS ENUM ('LEAD', 'INSCRITO', 'PROVA', 'APROVADO', 'CONVOCADO', 'MATRICULADO', 'DESISTENTE', 'REPROVADO');

-- CreateEnum
CREATE TYPE "AdmTipoInteracao" AS ENUM ('LIGACAO', 'WHATSAPP', 'EMAIL', 'VISITA', 'NOTA', 'SISTEMA');

-- CreateEnum
CREATE TYPE "AdmComponenteNota" AS ENUM ('PROVA', 'REDACAO', 'ENEM', 'ENTREVISTA', 'HISTORICO', 'ANALISE_CURRICULAR', 'PROJETO');

-- CreateEnum
CREATE TYPE "AdmStatusChamada" AS ENUM ('ABERTA', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "AdmStatusConvocacao" AS ENUM ('CONVOCADO', 'MATRICULADO', 'RENUNCIOU', 'EXPIRADO');

-- CreateEnum
CREATE TYPE "AdmStatusDocumento" AS ENUM ('PENDENTE', 'ENVIADO', 'APROVADO', 'REJEITADO');

-- CreateEnum
CREATE TYPE "AdmStatusMatricula" AS ENUM ('PENDENTE_DOCUMENTOS', 'DOCUMENTOS_OK', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "AdmTipoBeneficio" AS ENUM ('BOLSA', 'DESCONTO', 'CONVENIO');

-- CreateEnum
CREATE TYPE "AdmStatusCampanha" AS ENUM ('PLANEJADA', 'ATIVA', 'PAUSADA', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "AdmStatusRematriculaCampanha" AS ENUM ('RASCUNHO', 'ABERTA', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "AdmStatusRematricula" AS ENUM ('ELEGIVEL', 'PENDENTE_FINANCEIRO', 'PENDENTE_ACADEMICO', 'CONFIRMADA', 'NAO_RENOVOU', 'TRANCADA');

-- CreateEnum
CREATE TYPE "ApoTipoAtendimento" AS ENUM ('PSICOPEDAGOGICO', 'PSICOLOGICO', 'SOCIAL', 'SAUDE', 'ACESSIBILIDADE', 'ORIENTACAO_ACADEMICA', 'OUTRO');

-- CreateEnum
CREATE TYPE "ApoSigilo" AS ENUM ('NORMAL', 'RESTRITO', 'SIGILOSO');

-- CreateEnum
CREATE TYPE "ApoStatusAtendimento" AS ENUM ('AGENDADO', 'REALIZADO', 'FALTOU', 'CANCELADO');

-- CreateEnum
CREATE TYPE "ApoStatusPlanoAee" AS ENUM ('RASCUNHO', 'VIGENTE', 'VENCIDO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "ApoStatusInscricaoBolsa" AS ENUM ('INSCRITA', 'EM_ANALISE', 'DEFERIDA', 'LISTA_ESPERA', 'INDEFERIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "ApoStatusConcessao" AS ENUM ('ATIVA', 'RENOVACAO_PENDENTE', 'SUSPENSA', 'ENCERRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "ApoStatusVagaMonitoria" AS ENUM ('RASCUNHO', 'ABERTA', 'EM_SELECAO', 'PREENCHIDA', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "ApoStatusTermo" AS ENUM ('RASCUNHO', 'AGUARDANDO_ASSINATURA', 'VIGENTE', 'ENCERRADO', 'RESCINDIDO', 'VENCIDO');

-- CreateEnum
CREATE TYPE "ApoStatusOcorrencia" AS ENUM ('REGISTRADA', 'NOTIFICADA', 'DEFESA_RECEBIDA', 'EM_JULGAMENTO', 'DECIDIDA', 'EM_RECURSO', 'CONCLUIDA', 'ARQUIVADA');

-- CreateEnum
CREATE TYPE "ApoStatusAplicacao" AS ENUM ('RASCUNHO', 'ABERTA', 'ENCERRADA', 'PUBLICADA');

-- CreateEnum
CREATE TYPE "ApoTipoManifestacao" AS ENUM ('RECLAMACAO', 'SUGESTAO', 'ELOGIO', 'DENUNCIA', 'SOLICITACAO');

-- CreateEnum
CREATE TYPE "ApoStatusManifestacao" AS ENUM ('RECEBIDA', 'EM_ANALISE', 'ENCAMINHADA', 'RESPONDIDA', 'ENCERRADA', 'ARQUIVADA');

-- CreateEnum
CREATE TYPE "BibPerfil" AS ENUM ('ALUNO', 'PROFESSOR', 'FUNCIONARIO', 'EXTERNO');

-- CreateEnum
CREATE TYPE "BibTipoObra" AS ENUM ('LIVRO', 'PERIODICO', 'TESE', 'DVD', 'NORMA', 'MAPA', 'OUTRO');

-- CreateEnum
CREATE TYPE "BibEstadoConservacao" AS ENUM ('OTIMO', 'BOM', 'REGULAR', 'RUIM', 'PESSIMO');

-- CreateEnum
CREATE TYPE "BibStatusExemplar" AS ENUM ('DISPONIVEL', 'EMPRESTADO', 'RESERVADO', 'EM_REPARO', 'EXTRAVIADO', 'BAIXADO');

-- CreateEnum
CREATE TYPE "BibTipoAquisicao" AS ENUM ('COMPRA', 'DOACAO', 'PERMUTA', 'PRODUCAO_INSTITUCIONAL');

-- CreateEnum
CREATE TYPE "BibStatusEmprestimo" AS ENUM ('ATIVO', 'DEVOLVIDO', 'PERDIDO');

-- CreateEnum
CREATE TYPE "BibStatusReserva" AS ENUM ('AGUARDANDO', 'DISPONIVEL', 'ATENDIDA', 'CANCELADA', 'EXPIRADA');

-- CreateEnum
CREATE TYPE "BibTipoMulta" AS ENUM ('ATRASO', 'DANO', 'EXTRAVIO');

-- CreateEnum
CREATE TYPE "BibStatusMulta" AS ENUM ('ABERTA', 'EM_COBRANCA', 'PAGA', 'ISENTA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "BibStatusInventario" AS ENUM ('ABERTO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "BibSituacaoItemInventario" AS ENUM ('PENDENTE', 'CONFERIDO', 'NAO_ENCONTRADO', 'EMPRESTADO', 'LOCAL_DIVERGENTE');

-- CreateEnum
CREATE TYPE "BibTipoBibliografia" AS ENUM ('BASICA', 'COMPLEMENTAR');

-- CreateEnum
CREATE TYPE "BibStatusSugestao" AS ENUM ('PENDENTE', 'APROVADA', 'REJEITADA', 'COMPRADA', 'RECEBIDA');

-- CreateEnum
CREATE TYPE "BibTipoRecurso" AS ENUM ('EBOOK', 'PERIODICO', 'BASE_DADOS', 'VIDEO', 'OUTRO');

-- CreateEnum
CREATE TYPE "BibTipoAcessoVirtual" AS ENUM ('ASSINATURA_INSTITUCIONAL', 'URL_PESSOAL', 'ACESSO_LIVRE');

-- CreateEnum
CREATE TYPE "BibTipoItemRepositorio" AS ENUM ('TCC', 'DISSERTACAO', 'TESE', 'ARTIGO', 'NORMA', 'MATERIAL_DIDATICO', 'RELATORIO', 'OUTRO');

-- CreateEnum
CREATE TYPE "BibStatusRepositorio" AS ENUM ('RASCUNHO', 'EM_REVISAO', 'PUBLICADO', 'RETIRADO');

-- CreateEnum
CREATE TYPE "CalEventoTipo" AS ENUM ('INICIO_PERIODO', 'FIM_PERIODO', 'MATRICULA', 'REMATRICULA', 'TRANCAMENTO', 'AULA_INAUGURAL', 'PROVA', 'SEGUNDA_CHAMADA', 'EXAME_FINAL', 'FERIADO', 'PONTO_FACULTATIVO', 'RECESSO', 'FERIAS', 'REUNIAO', 'CONSELHO_CLASSE', 'COLACAO', 'FORMATURA', 'PRAZO_NOTAS', 'PRAZO_DIARIO', 'SEMANA_ACADEMICA', 'VESTIBULAR', 'ENADE', 'DIA_LETIVO_EXTRA', 'EVENTO_INSTITUCIONAL', 'OUTRO');

-- CreateEnum
CREATE TYPE "CalPublico" AS ENUM ('TODOS', 'ALUNOS', 'PROFESSORES', 'COORDENACAO', 'ADMINISTRATIVO');

-- CreateEnum
CREATE TYPE "CalRecorrencia" AS ENUM ('NENHUMA', 'DIARIA', 'SEMANAL', 'QUINZENAL', 'MENSAL', 'ANUAL');

-- CreateEnum
CREATE TYPE "CalTurno" AS ENUM ('MANHA', 'TARDE', 'NOITE');

-- CreateEnum
CREATE TYPE "CalTipoAula" AS ENUM ('TEORICA', 'PRATICA', 'ONLINE');

-- CreateEnum
CREATE TYPE "CalOrigemSlot" AS ENUM ('MANUAL', 'GERADOR');

-- CreateEnum
CREATE TYPE "CalDisponibilidadeTipo" AS ENUM ('DISPONIVEL', 'INDISPONIVEL', 'PREFERENCIA');

-- CreateEnum
CREATE TYPE "CalReservaTipo" AS ENUM ('EVENTO', 'AULA_EXTRA', 'REUNIAO', 'PROVA', 'MANUTENCAO', 'LIMPEZA', 'OUTRO');

-- CreateEnum
CREATE TYPE "CalReservaStatus" AS ENUM ('PENDENTE', 'APROVADA', 'REJEITADA', 'CANCELADA', 'EXPIRADA');

-- CreateEnum
CREATE TYPE "CalExameTipo" AS ENUM ('PROVA_1', 'PROVA_2', 'SUBSTITUTIVA', 'EXAME_FINAL', 'SEGUNDA_CHAMADA', 'REAVALIACAO', 'PROVA_UNICA', 'PRATICA', 'TRABALHO', 'SIMULADO');

-- CreateEnum
CREATE TYPE "CalExameStatus" AS ENUM ('AGENDADA', 'CONFIRMADA', 'REALIZADA', 'CANCELADA', 'REMARCADA');

-- CreateEnum
CREATE TYPE "CalPrazoTipo" AS ENUM ('LANCAMENTO_NOTAS', 'DIARIO_CLASSE', 'FECHAMENTO_FINAL', 'REVISAO_NOTAS', 'RECUPERACAO');

-- CreateEnum
CREATE TYPE "CalConflitoTipo" AS ENUM ('PROFESSOR', 'TURMA', 'ESPACO', 'ALUNO', 'CAPACIDADE', 'TIPO_ESPACO', 'RESERVA', 'PROVA');

-- CreateEnum
CREATE TYPE "CalConflitoStatus" AS ENUM ('ABERTO', 'RESOLVIDO', 'IGNORADO');

-- CreateEnum
CREATE TYPE "CalGeracaoStatus" AS ENUM ('SIMULADA', 'APLICADA', 'DESCARTADA');

-- CreateEnum
CREATE TYPE "CalFeedEscopo" AS ENUM ('TURMA', 'PROFESSOR', 'ESPACO', 'ALUNO', 'INSTITUCIONAL');

-- CreateEnum
CREATE TYPE "ComCanalTipo" AS ENUM ('WHATSAPP', 'TELEGRAM', 'EMAIL', 'SMS', 'VOZ', 'INSTAGRAM', 'FACEBOOK', 'SITE_CHAT');

-- CreateEnum
CREATE TYPE "ComContatoTipo" AS ENUM ('ALUNO', 'CANDIDATO', 'EGRESSO', 'RESPONSAVEL', 'FUNCIONARIO', 'OUTRO');

-- CreateEnum
CREATE TYPE "ComConversaStatus" AS ENUM ('ABERTA', 'PENDENTE', 'EM_ATENDIMENTO', 'AGUARDANDO_CONTATO', 'RESOLVIDA', 'ARQUIVADA');

-- CreateEnum
CREATE TYPE "ComCampanhaStatus" AS ENUM ('RASCUNHO', 'AGENDADA', 'EXECUTANDO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "ComRedeSocial" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'TIKTOK', 'YOUTUBE', 'X');

-- CreateEnum
CREATE TYPE "ComPostStatus" AS ENUM ('RASCUNHO', 'EM_APROVACAO', 'APROVADO', 'REJEITADO', 'PUBLICADO', 'MANUAL', 'FALHA', 'CANCELADO');

-- CreateEnum
CREATE TYPE "DesTipoExame" AS ENUM ('ENADE', 'OAB_1FASE', 'OAB_2FASE', 'ENAMED', 'RESIDENCIA', 'REVALIDA', 'CONCURSO', 'OUTRO');

-- CreateEnum
CREATE TYPE "DesTipoEixo" AS ENUM ('AREA', 'EIXO', 'COMPETENCIA');

-- CreateEnum
CREATE TYPE "DesStatusEdicao" AS ENUM ('PLANEJADA', 'INSCRICOES_ABERTAS', 'INSCRICOES_ENCERRADAS', 'REALIZADA', 'RESULTADO_PUBLICADO', 'CANCELADA');

-- CreateEnum
CREATE TYPE "DesCategoriaInscrito" AS ENUM ('INGRESSANTE', 'CONCLUINTE', 'CANDIDATO');

-- CreateEnum
CREATE TYPE "DesSituacaoInscricao" AS ENUM ('PENDENTE', 'INSCRITO', 'REGULAR', 'DISPENSADO', 'IRREGULAR', 'AUSENTE');

-- CreateEnum
CREATE TYPE "DesTipoQuestao" AS ENUM ('OBJETIVA', 'DISCURSIVA', 'PECA_PRATICA', 'CASO_CLINICO');

-- CreateEnum
CREATE TYPE "DesNivel" AS ENUM ('FACIL', 'MEDIO', 'DIFICIL');

-- CreateEnum
CREATE TYPE "DesStatusQuestao" AS ENUM ('RASCUNHO', 'REVISADO', 'PUBLICADO', 'ARQUIVADO');

-- CreateEnum
CREATE TYPE "DesOrigemQuestao" AS ENUM ('MANUAL', 'IA', 'IMPORTADA');

-- CreateEnum
CREATE TYPE "DesStatusSimulado" AS ENUM ('RASCUNHO', 'PUBLICADO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "DesStatusTentativa" AS ENUM ('EM_ANDAMENTO', 'ENVIADA', 'EXPIRADA');

-- CreateEnum
CREATE TYPE "DesTipoKit" AS ENUM ('QUESTOES_CONTEXTUALIZADAS', 'ESTUDO_CASO', 'PECA_PRATICA_OAB', 'CASO_CLINICO', 'LISTA_EXERCICIOS', 'REVISAO_TEORICA');

-- CreateEnum
CREATE TYPE "DesVisibilidadeKit" AS ENUM ('PRIVADA', 'COMPARTILHADA');

-- CreateEnum
CREATE TYPE "DesStatusAtribuicao" AS ENUM ('ABERTA', 'ENCERRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "DesStatusEntrega" AS ENUM ('PENDENTE', 'ENTREGUE', 'CORRIGIDA', 'ATRASADA');

-- CreateEnum
CREATE TYPE "DesStatusTrilha" AS ENUM ('ATIVA', 'CONCLUIDA', 'PAUSADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "DesTipoItemTrilha" AS ENUM ('ESTUDO', 'QUESTOES', 'REVISAO', 'SIMULADO', 'ATIVIDADE');

-- CreateEnum
CREATE TYPE "DesStatusItemTrilha" AS ENUM ('PENDENTE', 'CONCLUIDO', 'ADIADO');

-- CreateEnum
CREATE TYPE "GovPdiStatus" AS ENUM ('RASCUNHO', 'VIGENTE', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "GovPeriodicidade" AS ENUM ('MENSAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL');

-- CreateEnum
CREATE TYPE "GovSentidoIndicador" AS ENUM ('MAIOR_MELHOR', 'MENOR_MELHOR');

-- CreateEnum
CREATE TYPE "GovStatusAcao" AS ENUM ('PLANEJADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "GovDocumentoTipo" AS ENUM ('REGIMENTO', 'ESTATUTO', 'PPI', 'PPC', 'POLITICA', 'MANUAL', 'OUTRO');

-- CreateEnum
CREATE TYPE "GovVersaoStatus" AS ENUM ('RASCUNHO', 'VIGENTE', 'SUBSTITUIDA', 'REVOGADA');

-- CreateEnum
CREATE TYPE "GovSegmento" AS ENUM ('DOCENTE', 'DISCENTE', 'TECNICO_ADMINISTRATIVO', 'SOCIEDADE_CIVIL');

-- CreateEnum
CREATE TYPE "GovCpaCicloStatus" AS ENUM ('PLANEJAMENTO', 'COLETA', 'ANALISE', 'RELATORIO', 'CONCLUIDO');

-- CreateEnum
CREATE TYPE "GovCpaTipoPergunta" AS ENUM ('LIKERT5', 'SIM_NAO', 'TEXTO');

-- CreateEnum
CREATE TYPE "GovTitulacao" AS ENUM ('GRADUADO', 'ESPECIALISTA', 'MESTRE', 'DOUTOR');

-- CreateEnum
CREATE TYPE "GovRegime" AS ENUM ('INTEGRAL', 'PARCIAL', 'HORISTA');

-- CreateEnum
CREATE TYPE "GovOrgaoTipo" AS ENUM ('CONSUP', 'CONSEPE', 'COLEGIADO_CURSO', 'CONGREGACAO', 'OUTRO');

-- CreateEnum
CREATE TYPE "GovReuniaoStatus" AS ENUM ('AGENDADA', 'REALIZADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "GovDeliberacaoStatus" AS ENUM ('PROPOSTA', 'EM_VOTACAO', 'APROVADA', 'REJEITADA', 'ARQUIVADA');

-- CreateEnum
CREATE TYPE "GovVoto" AS ENUM ('FAVOR', 'CONTRA', 'ABSTENCAO');

-- CreateEnum
CREATE TYPE "GovCipaGestaoStatus" AS ENUM ('ELEICAO', 'VIGENTE', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "GovAgenteRisco" AS ENUM ('FISICO', 'QUIMICO', 'BIOLOGICO', 'ERGONOMICO', 'ACIDENTE');

-- CreateEnum
CREATE TYPE "GovCarreiraTipo" AS ENUM ('DOCENTE', 'TECNICO_ADMINISTRATIVO');

-- CreateEnum
CREATE TYPE "GovProgressaoStatus" AS ENUM ('SOLICITADA', 'EM_ANALISE', 'DEFERIDA', 'INDEFERIDA', 'EFETIVADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "InfEstadoBem" AS ENUM ('NOVO', 'BOM', 'REGULAR', 'RUIM', 'INSERVIVEL');

-- CreateEnum
CREATE TYPE "InfStatusBem" AS ENUM ('ATIVO', 'EM_MANUTENCAO', 'EMPRESTADO', 'BAIXADO');

-- CreateEnum
CREATE TYPE "InfTipoMovimentacao" AS ENUM ('CADASTRO', 'TRANSFERENCIA', 'MUDANCA_RESPONSAVEL', 'MUDANCA_ESTADO', 'BAIXA', 'REATIVACAO');

-- CreateEnum
CREATE TYPE "InfStatusInventario" AS ENUM ('ABERTO', 'FECHADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "InfDivergencia" AS ENUM ('NENHUMA', 'NAO_ENCONTRADO', 'LOCAL_DIVERGENTE', 'ESTADO_DIVERGENTE', 'SOBRA');

-- CreateEnum
CREATE TYPE "InfTipoOS" AS ENUM ('CORRETIVA', 'PREVENTIVA', 'PREDITIVA', 'MELHORIA');

-- CreateEnum
CREATE TYPE "InfPrioridade" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "InfStatusOS" AS ENUM ('ABERTA', 'AGENDADA', 'EM_EXECUCAO', 'AGUARDANDO_PECA', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "InfCategoriaChamado" AS ENUM ('PREDIAL', 'ELETRICA', 'HIDRAULICA', 'TI', 'AR_CONDICIONADO', 'LIMPEZA', 'SEGURANCA', 'ILUMINACAO', 'MOBILIARIO', 'OUTRO');

-- CreateEnum
CREATE TYPE "InfStatusChamado" AS ENUM ('ABERTO', 'EM_ATENDIMENTO', 'RESOLVIDO', 'FECHADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "InfStatusProjeto" AS ENUM ('PROPOSTO', 'APROVADO', 'EM_EXECUCAO', 'CONCLUIDO', 'SUSPENSO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "InfStatusEtapa" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'BLOQUEADA');

-- CreateEnum
CREATE TYPE "InfTipoVaga" AS ENUM ('COMUM', 'PCD', 'IDOSO', 'MOTO', 'DOCENTE', 'VISITANTE', 'ADMINISTRATIVO');

-- CreateEnum
CREATE TYPE "InfTipoVeiculo" AS ENUM ('CARRO', 'MOTO', 'BICICLETA', 'OUTRO');

-- CreateEnum
CREATE TYPE "InfVinculoProprietario" AS ENUM ('ALUNO', 'DOCENTE', 'FUNCIONARIO', 'VISITANTE', 'TERCEIRIZADO');

-- CreateEnum
CREATE TYPE "InfStatusCredencial" AS ENUM ('ATIVA', 'SUSPENSA', 'VENCIDA', 'REVOGADA');

-- CreateEnum
CREATE TYPE "InfStatusOcorrencia" AS ENUM ('ABERTA', 'EM_ANALISE', 'RESOLVIDA', 'ARQUIVADA');

-- CreateEnum
CREATE TYPE "InfStatusReserva" AS ENUM ('SOLICITADA', 'APROVADA', 'RECUSADA', 'CANCELADA', 'REALIZADA');

-- CreateEnum
CREATE TYPE "InfStatusPontoLuz" AS ENUM ('OK', 'QUEIMADA', 'INTERMITENTE', 'DESATIVADA');

-- CreateEnum
CREATE TYPE "InfTipoMedidor" AS ENUM ('ENERGIA', 'AGUA', 'GAS');

-- CreateEnum
CREATE TYPE "InfTipoRequisito" AS ENUM ('EQUIPAMENTO', 'ESPACO');

-- CreateEnum
CREATE TYPE "JorPersona" AS ENUM ('CANDIDATO', 'ALUNO', 'EGRESSO', 'PROFESSOR', 'COORDENADOR', 'FUNCIONARIO', 'DIRETORIA', 'REITORIA');

-- CreateEnum
CREATE TYPE "JorTemplateStatus" AS ENUM ('RASCUNHO', 'PUBLICADO', 'ARQUIVADO');

-- CreateEnum
CREATE TYPE "JorNoTipo" AS ENUM ('INICIO', 'TAREFA', 'APROVACAO', 'ESPERA_EVENTO', 'GATEWAY', 'MARCO', 'FIM');

-- CreateEnum
CREATE TYPE "JorInstanciaStatus" AS ENUM ('ATIVA', 'PAUSADA', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "JorEtapaStatus" AS ENUM ('ABERTA', 'AGUARDANDO_EVENTO', 'ATRASADA', 'CONCLUIDA', 'PULADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "ModModalidade" AS ENUM ('PRESENCIAL', 'SEMIPRESENCIAL', 'EAD', 'HIBRIDO');

-- CreateEnum
CREATE TYPE "ModEncontroTipo" AS ENUM ('ENCONTRO_PRESENCIAL', 'PROVA_PRESENCIAL', 'AULA_PRATICA', 'DEFESA_TCC', 'OUTRO');

-- CreateEnum
CREATE TYPE "ModEncontroStatus" AS ENUM ('AGENDADO', 'REALIZADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "ModLiveStatus" AS ENUM ('AGENDADA', 'AO_VIVO', 'ENCERRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "ModPoloStatus" AS ENUM ('EM_CREDENCIAMENTO', 'CREDENCIADO', 'SUSPENSO', 'DESCREDENCIADO');

-- CreateEnum
CREATE TYPE "ModTutorTipo" AS ENUM ('PRESENCIAL', 'DISTANCIA');

-- CreateEnum
CREATE TYPE "ModAtendimentoStatus" AS ENUM ('ABERTO', 'EM_ATENDIMENTO', 'RESPONDIDO', 'ENCERRADO', 'ESCALADO');

-- CreateEnum
CREATE TYPE "ModEngajamentoTipo" AS ENUM ('LOGIN', 'ACESSO_CONTEUDO', 'VIDEO', 'ATIVIDADE_ENTREGUE', 'FORUM', 'AVALIACAO', 'LIVE', 'OUTRO');

-- CreateEnum
CREATE TYPE "ModPraticaTipo" AS ENUM ('AULA_PRATICA', 'LABORATORIO', 'ESTAGIO_SUPERVISIONADO', 'VISITA_TECNICA');

-- CreateEnum
CREATE TYPE "ModPosNivel" AS ENUM ('ESPECIALIZACAO', 'MBA', 'MESTRADO_ACADEMICO', 'MESTRADO_PROFISSIONAL', 'DOUTORADO');

-- CreateEnum
CREATE TYPE "ModPosAlunoStatus" AS ENUM ('MATRICULADO', 'QUALIFICADO', 'DEFENDIDO', 'TITULADO', 'TRANCADO', 'DESLIGADO');

-- CreateEnum
CREATE TYPE "NtEscopoRegra" AS ENUM ('TENANT', 'CURSO', 'TURMA');

-- CreateEnum
CREATE TYPE "NtRegraMedia" AS ENUM ('ARITMETICA', 'PONDERADA');

-- CreateEnum
CREATE TYPE "NtRegraRecuperacao" AS ENUM ('NENHUMA', 'SUBSTITUI_MENOR', 'SUBSTITUI_MEDIA', 'MEDIA_COM_PARCIAL');

-- CreateEnum
CREATE TYPE "NtRegraExame" AS ENUM ('NENHUM', 'MEDIA_PONDERADA', 'SUBSTITUI');

-- CreateEnum
CREATE TYPE "NtTipoComponente" AS ENUM ('AVALIACAO', 'RECUPERACAO', 'EXAME');

-- CreateEnum
CREATE TYPE "NtStatusDiario" AS ENUM ('ABERTO', 'FECHADO');

-- CreateEnum
CREATE TYPE "NtOrigemNota" AS ENUM ('MANUAL', 'IMPORTACAO', 'PROVA', 'CORRECAO', 'REVISAO');

-- CreateEnum
CREATE TYPE "NtSituacao" AS ENUM ('EM_CURSO', 'APROVADO', 'REPROVADO_NOTA', 'REPROVADO_FREQ', 'RECUPERACAO', 'EXAME');

-- CreateEnum
CREATE TYPE "NtStatusRevisao" AS ENUM ('SOLICITADA', 'PARECER_EMITIDO', 'DEFERIDA', 'INDEFERIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "PesTipoPublicacao" AS ENUM ('ARTIGO', 'LIVRO', 'CAPITULO', 'TRABALHO_EVENTO', 'PATENTE', 'SOFTWARE', 'OUTRO');

-- CreateEnum
CREATE TYPE "PesTipoPessoa" AS ENUM ('DOCENTE', 'ALUNO', 'EXTERNO');

-- CreateEnum
CREATE TYPE "PesTipoProjeto" AS ENUM ('IC', 'PIBIC', 'PIBITI', 'EXTENSAO', 'INOVACAO', 'PESQUISA', 'OUTRO');

-- CreateEnum
CREATE TYPE "PesStatusProjeto" AS ENUM ('RASCUNHO', 'SUBMETIDO', 'EM_AVALIACAO', 'APROVADO', 'EM_EXECUCAO', 'SUSPENSO', 'CONCLUIDO', 'CANCELADO', 'REPROVADO');

-- CreateEnum
CREATE TYPE "PesStatusRelatorio" AS ENUM ('PENDENTE', 'ENTREGUE', 'APROVADO', 'AJUSTES_SOLICITADOS', 'ATRASADO');

-- CreateEnum
CREATE TYPE "PesStatusEdital" AS ENUM ('RASCUNHO', 'ABERTO', 'EM_AVALIACAO', 'RESULTADO_PUBLICADO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "PesStatusInscricao" AS ENUM ('INSCRITA', 'HOMOLOGADA', 'INDEFERIDA', 'AVALIADA', 'CONTEMPLADA', 'SUPLENTE', 'NAO_CONTEMPLADA');

-- CreateEnum
CREATE TYPE "PesStatusBolsa" AS ENUM ('ATIVA', 'SUSPENSA', 'ENCERRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "PesTipoTrabalho" AS ENUM ('TCC', 'MONOGRAFIA', 'DISSERTACAO', 'TESE');

-- CreateEnum
CREATE TYPE "PesStatusTrabalho" AS ENUM ('TEMA', 'ORIENTACAO', 'PROJETO', 'QUALIFICACAO', 'BANCA_AGENDADA', 'DEFESA', 'VERSAO_FINAL', 'DEPOSITADO', 'REPROVADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "PesStatusSubmissao" AS ENUM ('SUBMETIDO', 'TRIAGEM', 'EM_REVISAO', 'REVISOES_SOLICITADAS', 'ACEITO', 'REJEITADO', 'EDITORACAO', 'PUBLICADO', 'RETIRADO');

-- CreateEnum
CREATE TYPE "PesStatusRevisao" AS ENUM ('CONVIDADO', 'ACEITO', 'RECUSADO', 'CONCLUIDO', 'EXPIRADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "PesRecomendacao" AS ENUM ('ACEITAR', 'REVISOES_MENORES', 'REVISOES_MAIORES', 'REJEITAR');

-- CreateEnum
CREATE TYPE "PesStatusEvento" AS ENUM ('RASCUNHO', 'SUBMISSOES_ABERTAS', 'EM_AVALIACAO', 'RESULTADO_DIVULGADO', 'REALIZADO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "PesStatusEventoTrabalho" AS ENUM ('SUBMETIDO', 'EM_AVALIACAO', 'APROVADO', 'APROVADO_COM_AJUSTES', 'REPROVADO', 'CAMERA_READY', 'PUBLICADO_ANAIS', 'RETIRADO');

-- CreateEnum
CREATE TYPE "RegTipoProcesso" AS ENUM ('CREDENCIAMENTO', 'RECREDENCIAMENTO', 'AUTORIZACAO_CURSO', 'RECONHECIMENTO_CURSO', 'RENOVACAO_RECONHECIMENTO', 'ADITAMENTO_VAGAS', 'ADITAMENTO_ENDERECO', 'ADITAMENTO_POLO_EAD', 'TRANSFERENCIA_MANTENCA', 'OUTRO');

-- CreateEnum
CREATE TYPE "RegEtapa" AS ENUM ('PREPARACAO', 'PROTOCOLADO', 'EM_ANALISE', 'DILIGENCIA', 'AVALIACAO_IN_LOCO', 'DECISAO', 'PUBLICADO', 'ARQUIVADO');

-- CreateEnum
CREATE TYPE "RegResultado" AS ENUM ('PENDENTE', 'DEFERIDO', 'INDEFERIDO', 'ARQUIVADO');

-- CreateEnum
CREATE TYPE "RegDiligenciaStatus" AS ENUM ('ABERTA', 'RESPONDIDA', 'CUMPRIDA', 'VENCIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "RegTipoAto" AS ENUM ('PORTARIA_CREDENCIAMENTO', 'PORTARIA_RECREDENCIAMENTO', 'PORTARIA_AUTORIZACAO', 'PORTARIA_RECONHECIMENTO', 'PORTARIA_RENOVACAO', 'PORTARIA_ADITAMENTO', 'RESOLUCAO', 'PARECER', 'OUTRO');

-- CreateEnum
CREATE TYPE "RegInstrumento" AS ENUM ('INSTITUCIONAL', 'CURSO_AUTORIZACAO', 'CURSO_RECONHECIMENTO', 'CURSO_RENOVACAO', 'DOCUMENTAL');

-- CreateEnum
CREATE TYPE "RegDimensao" AS ENUM ('ORGANIZACAO_DIDATICO_PEDAGOGICA', 'CORPO_DOCENTE_TUTORIAL', 'INFRAESTRUTURA', 'DOCUMENTAL', 'GESTAO_INSTITUCIONAL');

-- CreateEnum
CREATE TYPE "RegItemStatus" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'ATENDIDO', 'NAO_APLICAVEL');

-- CreateEnum
CREATE TYPE "ReiStatusObjetivo" AS ENUM ('RASCUNHO', 'ATIVO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "ReiFonteResultado" AS ENUM ('MANUAL', 'INDICADOR');

-- CreateEnum
CREATE TYPE "ReiSentido" AS ENUM ('MAIOR_MELHOR', 'MENOR_MELHOR');

-- CreateEnum
CREATE TYPE "ReiConfianca" AS ENUM ('VERDE', 'AMARELO', 'VERMELHO');

-- CreateEnum
CREATE TYPE "SecProtocoloStatus" AS ENUM ('ABERTO', 'EM_ANALISE', 'PENDENTE_DOCUMENTO', 'DEFERIDO', 'INDEFERIDO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "SecTaxaStatus" AS ENUM ('ISENTA', 'PENDENTE', 'PAGA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "SecConferenciaStatus" AS ENUM ('EM_ANDAMENTO', 'PENDENTE', 'APROVADA', 'REPROVADA');

-- CreateEnum
CREATE TYPE "SecItemStatus" AS ENUM ('PENDENTE', 'APROVADO', 'REJEITADO');

-- CreateEnum
CREATE TYPE "SecCertificadoStatus" AS ENUM ('EMITIDO', 'REVOGADO', 'SUBSTITUIDO');

-- CreateEnum
CREATE TYPE "SecDiplomaStatus" AS ENUM ('SOLICITADO', 'CONFERENCIA', 'PENDENCIA', 'REGISTRO', 'REGISTRADO', 'ENTREGUE', 'CANCELADO');

-- CreateEnum
CREATE TYPE "SecColacaoStatus" AS ENUM ('PLANEJADA', 'CONVOCADA', 'REALIZADA', 'ENCERRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "SecFormandoStatus" AS ENUM ('INSCRITO', 'APTO', 'PENDENTE', 'COLOU', 'AUSENTE', 'EXCLUIDO');

-- CreateEnum
CREATE TYPE "SecArquivoStatus" AS ENUM ('ATIVO', 'ELEGIVEL_DESCARTE', 'DESCARTE_SOLICITADO', 'DESCARTADO', 'GUARDA_PERMANENTE', 'SUSPENSO');

-- CreateEnum
CREATE TYPE "SecDescarteStatus" AS ENUM ('RASCUNHO', 'AGUARDANDO_APROVACAO', 'APROVADO', 'REJEITADO', 'EXECUTADO');

-- CreateEnum
CREATE TYPE "SupFornecedorStatus" AS ENUM ('ATIVO', 'EM_ANALISE', 'BLOQUEADO', 'INATIVO');

-- CreateEnum
CREATE TYPE "SupDocumentoStatus" AS ENUM ('VALIDO', 'A_VENCER', 'VENCIDO');

-- CreateEnum
CREATE TYPE "SupRequisicaoTipo" AS ENUM ('COMPRA', 'INSUMO');

-- CreateEnum
CREATE TYPE "SupRequisicaoStatus" AS ENUM ('RASCUNHO', 'AGUARDANDO_APROVACAO', 'APROVADA', 'REPROVADA', 'EM_COTACAO', 'COTADA', 'PEDIDO_EMITIDO', 'ATENDIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "SupAprovacaoStatus" AS ENUM ('PENDENTE', 'APROVADO', 'REPROVADO');

-- CreateEnum
CREATE TYPE "SupCotacaoStatus" AS ENUM ('ABERTA', 'ENCERRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "SupPedidoStatus" AS ENUM ('RASCUNHO', 'EMITIDO', 'PARCIALMENTE_RECEBIDO', 'RECEBIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "SupMovTipo" AS ENUM ('ENTRADA', 'SAIDA', 'TRANSFERENCIA', 'AJUSTE', 'PERDA', 'DEVOLUCAO');

-- CreateEnum
CREATE TYPE "SupContratoStatus" AS ENUM ('RASCUNHO', 'VIGENTE', 'A_VENCER', 'VENCIDO', 'RENOVADO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "SupInventarioStatus" AS ENUM ('ABERTO', 'CONTAGEM_FINALIZADA', 'AJUSTADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "SupCaixaStatus" AS ENUM ('ABERTO', 'FECHADO');

-- CreateEnum
CREATE TYPE "SupVendaTipo" AS ENUM ('A_VISTA', 'LANCADA_ALUNO');

-- CreateEnum
CREATE TYPE "SupVendaStatus" AS ENUM ('CONCLUIDA', 'PARCIALMENTE_DEVOLVIDA', 'DEVOLVIDA', 'CANCELADA');

-- CreateTable
CREATE TABLE "EduInstitution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "sigla" TEXT,
    "mantenedora" TEXT,
    "cnpj" TEXT,
    "codigoEmec" TEXT,
    "categoria" TEXT,
    "organizacao" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "site" TEXT,
    "endereco" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "corPrimaria" TEXT NOT NULL DEFAULT '#0F5FDB',
    "corSecundaria" TEXT NOT NULL DEFAULT '#0B1F3A',
    "corDestaque" TEXT NOT NULL DEFAULT '#21C7A8',
    "reitorNome" TEXT,
    "reitorCargo" TEXT DEFAULT 'Reitor(a)',
    "lema" TEXT,
    "portariaCredenciamento" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EduInstitution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EduBrandAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "kind" "EduBrandAssetKind" NOT NULL,
    "titulo" TEXT,
    "dataUrl" TEXT,
    "url" TEXT,
    "mime" TEXT,
    "largura" INTEGER,
    "altura" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EduBrandAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EduSpace" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "EduSpaceType" NOT NULL,
    "bloco" TEXT,
    "andar" TEXT,
    "capacidade" INTEGER NOT NULL DEFAULT 0,
    "areaM2" DOUBLE PRECISION,
    "recursos" JSONB,
    "acessivel" BOOLEAN NOT NULL DEFAULT true,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EduSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EduReminder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "severity" "EduSeverity" NOT NULL DEFAULT 'INFO',
    "status" "EduReminderStatus" NOT NULL DEFAULT 'PENDENTE',
    "assigneeUserId" TEXT,
    "assigneeRole" TEXT,
    "assigneeStudentId" TEXT,
    "canal" TEXT NOT NULL DEFAULT 'IN_APP',
    "recorrenciaDias" INTEGER,
    "escalonadoEm" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),
    "concluidoPorId" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EduReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EduNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "userId" TEXT,
    "studentId" TEXT,
    "destino" TEXT,
    "assunto" TEXT,
    "mensagem" TEXT NOT NULL,
    "templateKey" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "status" "EduNotificationStatus" NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "agendadoPara" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadoEm" TIMESTAMP(3),
    "lidaEm" TIMESTAMP(3),
    "provedorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EduNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EduAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "modulo" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "detalhes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EduAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campus" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "endereco" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicProgram" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "modalidade" "Modalidade" NOT NULL,
    "cargaHorariaTotal" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademicProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discipline" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cargaHoraria" INTEGER NOT NULL,
    "ementa" TEXT,

    CONSTRAINT "Discipline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurriculumDiscipline" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,
    "periodo" INTEGER NOT NULL,
    "obrigatoria" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CurriculumDiscipline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicTerm" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ra" TEXT NOT NULL,
    "nomeCompleto" TEXT NOT NULL,
    "cpf" TEXT,
    "dataNascimento" TIMESTAMP(3),
    "status" "StudentStatus" NOT NULL DEFAULT 'ATIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ATIVA',
    "dataMatricula" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "disciplineId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "professorUserId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "vagas" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSectionEnrollment" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,

    CONSTRAINT "ClassSectionEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSession" (
    "id" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "tipo" "SessionType" NOT NULL,
    "titulo" TEXT NOT NULL,
    "dataHoraInicio" TIMESTAMP(3) NOT NULL,
    "dataHoraFim" TIMESTAMP(3) NOT NULL,
    "local" TEXT,
    "vagasPratica" INTEGER,
    "status" "SessionStatus" NOT NULL DEFAULT 'AGENDADA',

    CONSTRAINT "ClassSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSessionBooking" (
    "id" TEXT NOT NULL,
    "classSessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMADO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassSessionBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "classSessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "presente" BOOLEAN NOT NULL,
    "justificativa" TEXT,
    "registradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,
    "tipo" "ContentType" NOT NULL,
    "titulo" TEXT NOT NULL,
    "urlArquivo" TEXT,
    "resumoTexto" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flashcard" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "pergunta" TEXT NOT NULL,
    "resposta" TEXT NOT NULL,
    "intervalo" INTEGER NOT NULL DEFAULT 1,
    "fatorFacilidade" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "proximaRevisao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Flashcard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,
    "classSectionId" TEXT,
    "titulo" TEXT NOT NULL,
    "tipo" "AssessmentType" NOT NULL,
    "dataAbertura" TIMESTAMP(3),
    "dataFechamento" TIMESTAMP(3),
    "correcaoPorIA" BOOLEAN NOT NULL DEFAULT false,
    "focoEnade" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "enunciado" TEXT NOT NULL,
    "tipo" "QuestionType" NOT NULL,
    "alternativas" JSONB,
    "respostaCorreta" TEXT,
    "peso" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAttempt" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadoEm" TIMESTAMP(3),
    "notaFinal" DOUBLE PRECISION,
    "corrigidoPorIA" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AssessmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerSubmission" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "respostaTexto" TEXT,
    "notaObtida" DOUBLE PRECISION,
    "feedbackIA" TEXT,

    CONSTRAINT "AnswerSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tipo" "CertificateType" NOT NULL,
    "descricao" TEXT NOT NULL,
    "emitidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "urlPdf" TEXT,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EduCostCenter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,

    CONSTRAINT "EduCostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChartOfAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "AccountType" NOT NULL,

    CONSTRAINT "ChartOfAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountPayable" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "costCenterId" TEXT,
    "descricao" TEXT NOT NULL,
    "fornecedor" TEXT,
    "categoria" TEXT,
    "valor" DOUBLE PRECISION NOT NULL,
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "dataPagamento" TIMESTAMP(3),
    "status" "FinancialStatus" NOT NULL DEFAULT 'PENDENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountPayable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountReceivable" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "enrollmentId" TEXT,
    "descricao" TEXT NOT NULL,
    "numeroParcela" INTEGER,
    "valor" DOUBLE PRECISION NOT NULL,
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "dataPagamento" TIMESTAMP(3),
    "status" "FinancialStatus" NOT NULL DEFAULT 'PENDENTE',
    "gatewayId" TEXT,
    "gatewayStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountReceivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "TransactionType" NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "dataTransacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "formaPagamento" "FormaPagamento" NOT NULL,
    "accountPayableId" TEXT,
    "accountReceivableId" TEXT,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contaDebitoId" TEXT NOT NULL,
    "contaCreditoId" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "historico" TEXT NOT NULL,
    "paymentTransactionId" TEXT,

    CONSTRAINT "AccountingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountReceivableId" TEXT,
    "tipo" "FiscalInvoiceType" NOT NULL,
    "numero" TEXT,
    "valor" DOUBLE PRECISION NOT NULL,
    "status" "FiscalInvoiceStatus" NOT NULL DEFAULT 'PENDENTE',
    "urlPdf" TEXT,
    "urlXml" TEXT,
    "emitidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentFlashcardState" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "flashcardId" TEXT NOT NULL,
    "intervalo" INTEGER NOT NULL DEFAULT 1,
    "fatorFacilidade" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "repeticoes" INTEGER NOT NULL DEFAULT 0,
    "proximaRevisao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaRevisao" TIMESTAMP(3),

    CONSTRAINT "StudentFlashcardState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentProgress" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "percentualAssistido" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ultimaVisualizacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryProvider" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipoAcesso" "LibraryAccessType" NOT NULL,
    "urlAcesso" TEXT,
    "custoMensal" DOUBLE PRECISION,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LibraryProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentLibraryAccess" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "libraryProviderId" TEXT NOT NULL,
    "status" "LibraryAccessStatus" NOT NULL DEFAULT 'PENDENTE',
    "dataAdesao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataCancelamento" TIMESTAMP(3),

    CONSTRAINT "StudentLibraryAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradingRubric" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "criterios" TEXT NOT NULL,
    "notaMaxima" DOUBLE PRECISION NOT NULL DEFAULT 10,

    CONSTRAINT "GradingRubric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIGenerationLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contentItemId" TEXT,
    "assessmentId" TEXT,
    "prompt" TEXT NOT NULL,
    "respostaBruta" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorUserId" TEXT NOT NULL,

    CONSTRAINT "AIGenerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmProcessoSeletivo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "AdmTipoProcesso" NOT NULL,
    "nivel" TEXT NOT NULL DEFAULT 'GRADUACAO',
    "status" "AdmStatusProcesso" NOT NULL DEFAULT 'RASCUNHO',
    "termId" TEXT,
    "edital" TEXT,
    "editalUrl" TEXT,
    "inscricaoInicio" TIMESTAMP(3) NOT NULL,
    "inscricaoFim" TIMESTAMP(3) NOT NULL,
    "provaData" TIMESTAMP(3),
    "resultadoData" TIMESTAMP(3),
    "matriculaInicio" TIMESTAMP(3),
    "matriculaFim" TIMESTAMP(3),
    "taxaInscricao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notaMinima" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pesos" JSONB,
    "criteriosDesempate" JSONB,
    "listaEspera" BOOLEAN NOT NULL DEFAULT true,
    "diasPrazoMatricula" INTEGER NOT NULL DEFAULT 5,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmProcessoSeletivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmOferta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "programId" TEXT,
    "nomeCurso" TEXT NOT NULL,
    "turno" "AdmTurno" NOT NULL DEFAULT 'NOTURNO',
    "modalidade" "AdmModalidadeOferta" NOT NULL DEFAULT 'PRESENCIAL',
    "campusId" TEXT,
    "poloNome" TEXT,
    "vagas" INTEGER NOT NULL,
    "valorMensalidade" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "parcelas" INTEGER NOT NULL DEFAULT 6,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmOferta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmCampanha" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nivel" TEXT NOT NULL DEFAULT 'GRADUACAO',
    "canal" TEXT NOT NULL,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "processoId" TEXT,
    "status" "AdmStatusCampanha" NOT NULL DEFAULT 'PLANEJADA',
    "orcamento" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metaInscritos" INTEGER NOT NULL DEFAULT 0,
    "metaMatriculas" INTEGER NOT NULL DEFAULT 0,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmCampanha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmCampanhaGasto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campanhaId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valor" DOUBLE PRECISION NOT NULL,
    "descricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdmCampanhaGasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmCandidato" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "processoId" TEXT,
    "ofertaId" TEXT,
    "ofertaId2" TEXT,
    "campanhaId" TEXT,
    "protocolo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "dataNascimento" TIMESTAMP(3),
    "status" "AdmStatusCandidato" NOT NULL DEFAULT 'LEAD',
    "etapaMaxima" INTEGER NOT NULL DEFAULT 0,
    "origem" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "consentimentoLgpd" BOOLEAN NOT NULL DEFAULT false,
    "consentimentoEm" TIMESTAMP(3),
    "ipOrigem" TEXT,
    "dados" JSONB,
    "cota" TEXT,
    "responsavelId" TEXT,
    "proximoContatoEm" TIMESTAMP(3),
    "notaFinal" DOUBLE PRECISION,
    "classificacao" INTEGER,
    "ofertaAlocadaId" TEXT,
    "situacaoClassificacao" TEXT,
    "taxaReceivableId" TEXT,
    "taxaPaga" BOOLEAN NOT NULL DEFAULT false,
    "bolsaId" TEXT,
    "motivoDesistencia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmCandidato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmInteracao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "candidatoId" TEXT NOT NULL,
    "tipo" "AdmTipoInteracao" NOT NULL DEFAULT 'NOTA',
    "descricao" TEXT NOT NULL,
    "userId" TEXT,
    "proximoContatoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdmInteracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmResultadoProva" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "candidatoId" TEXT NOT NULL,
    "componente" "AdmComponenteNota" NOT NULL,
    "nota" DOUBLE PRECISION NOT NULL,
    "notaMaxima" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "observacao" TEXT,
    "lancadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmResultadoProva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmChamada" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "status" "AdmStatusChamada" NOT NULL DEFAULT 'ABERTA',
    "prazoMatricula" TIMESTAMP(3) NOT NULL,
    "geradaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmChamada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmConvocacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chamadaId" TEXT NOT NULL,
    "candidatoId" TEXT NOT NULL,
    "ofertaId" TEXT NOT NULL,
    "status" "AdmStatusConvocacao" NOT NULL DEFAULT 'CONVOCADO',
    "prazo" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmConvocacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmDocumentoTipo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT true,
    "niveis" TEXT[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmDocumentoTipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmDocumentoCandidato" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "candidatoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT true,
    "status" "AdmStatusDocumento" NOT NULL DEFAULT 'PENDENTE',
    "url" TEXT,
    "observacao" TEXT,
    "revisadoPorId" TEXT,
    "revisadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmDocumentoCandidato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmMatricula" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "candidatoId" TEXT NOT NULL,
    "convocacaoId" TEXT,
    "ofertaId" TEXT NOT NULL,
    "userId" TEXT,
    "studentId" TEXT,
    "enrollmentId" TEXT,
    "ra" TEXT,
    "status" "AdmStatusMatricula" NOT NULL DEFAULT 'PENDENTE_DOCUMENTOS',
    "bolsaId" TEXT,
    "percentualDesconto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorMensalidade" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorComDesconto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "parcelas" INTEGER NOT NULL DEFAULT 6,
    "contratoHtml" TEXT,
    "contratoAceitoEm" TIMESTAMP(3),
    "primeiraMensalidadeId" TEXT,
    "concluidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmMatricula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmBolsa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "AdmTipoBeneficio" NOT NULL DEFAULT 'BOLSA',
    "percentual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorFixo" DOUBLE PRECISION,
    "regras" JSONB,
    "convenioEmpresa" TEXT,
    "vigenciaInicio" TIMESTAMP(3),
    "vigenciaFim" TIMESTAMP(3),
    "limiteConcessoes" INTEGER,
    "cumulativa" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmBolsa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmBolsaConcessao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bolsaId" TEXT NOT NULL,
    "candidatoId" TEXT,
    "studentId" TEXT,
    "percentualAplicado" DOUBLE PRECISION NOT NULL,
    "motivo" TEXT,
    "concedidaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdmBolsaConcessao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmRematriculaCampanha" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "termOrigemId" TEXT,
    "termDestinoId" TEXT NOT NULL,
    "janelaInicio" TIMESTAMP(3) NOT NULL,
    "janelaFim" TIMESTAMP(3) NOT NULL,
    "descontoAntecipacaoPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dataLimiteDesconto" TIMESTAMP(3),
    "valorTaxa" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bloqueiaInadimplente" BOOLEAN NOT NULL DEFAULT true,
    "status" "AdmStatusRematriculaCampanha" NOT NULL DEFAULT 'RASCUNHO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmRematriculaCampanha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmRematricula" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campanhaId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "programId" TEXT,
    "status" "AdmStatusRematricula" NOT NULL DEFAULT 'ELEGIVEL',
    "pendencias" JSONB,
    "valorBase" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "desconto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorFinal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivableId" TEXT,
    "confirmadaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmRematricula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoContador" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApoContador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoAndamento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "publico" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "dados" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApoAndamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoAtendimento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tipo" "ApoTipoAtendimento" NOT NULL,
    "sigilo" "ApoSigilo" NOT NULL DEFAULT 'RESTRITO',
    "status" "ApoStatusAtendimento" NOT NULL DEFAULT 'AGENDADO',
    "dataHora" TIMESTAMP(3) NOT NULL,
    "duracaoMin" INTEGER NOT NULL DEFAULT 50,
    "profissionalId" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'PROCURA_ESPONTANEA',
    "motivo" TEXT,
    "relato" TEXT,
    "encaminhamentos" TEXT,
    "retornoEm" TIMESTAMP(3),
    "planoAcaoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApoAtendimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoPlanoAee" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "necessidade" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'DEFICIENCIA',
    "laudoReferencia" TEXT,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "vigenciaFim" TIMESTAMP(3) NOT NULL,
    "status" "ApoStatusPlanoAee" NOT NULL DEFAULT 'RASCUNHO',
    "responsavelId" TEXT,
    "recursos" JSONB,
    "observacoes" TEXT,
    "encerradoMotivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApoPlanoAee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoAdaptacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "disciplineId" TEXT,
    "classSectionId" TEXT,
    "professorUserId" TEXT,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tempoExtraPercent" INTEGER,
    "notificadoEm" TIMESTAMP(3),
    "cienteEm" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApoAdaptacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoProgramaBolsa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'INSTITUCIONAL',
    "descricao" TEXT,
    "percentualDesconto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorMensal" DOUBLE PRECISION,
    "vagas" INTEGER NOT NULL DEFAULT 0,
    "rendaPerCapitaMaxSM" DOUBLE PRECISION,
    "mediaMinima" DOUBLE PRECISION,
    "frequenciaMinima" DOUBLE PRECISION,
    "inscricaoInicio" TIMESTAMP(3),
    "inscricaoFim" TIMESTAMP(3),
    "vigenciaMeses" INTEGER NOT NULL DEFAULT 6,
    "renovavel" BOOLEAN NOT NULL DEFAULT true,
    "renovacaoAntecedenciaDias" INTEGER NOT NULL DEFAULT 30,
    "maxRenovacoes" INTEGER,
    "criterios" JSONB,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApoProgramaBolsa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoInscricaoBolsa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programaId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "rendaFamiliar" DOUBLE PRECISION NOT NULL,
    "numeroMembros" INTEGER NOT NULL,
    "rendaPerCapita" DOUBLE PRECISION NOT NULL,
    "condicoes" JSONB,
    "documentos" JSONB,
    "mediaAtual" DOUBLE PRECISION,
    "frequenciaAtual" DOUBLE PRECISION,
    "pontuacao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "elegivel" BOOLEAN NOT NULL DEFAULT true,
    "pendencias" JSONB,
    "status" "ApoStatusInscricaoBolsa" NOT NULL DEFAULT 'INSCRITA',
    "parecer" TEXT,
    "analisadoPorId" TEXT,
    "analisadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApoInscricaoBolsa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoConcessaoBolsa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programaId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "inscricaoId" TEXT,
    "percentual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorMensal" DOUBLE PRECISION,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "status" "ApoStatusConcessao" NOT NULL DEFAULT 'ATIVA',
    "renovacoes" INTEGER NOT NULL DEFAULT 0,
    "renovacaoLimiteEm" TIMESTAMP(3),
    "motivoEncerramento" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApoConcessaoBolsa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoMonitoriaVaga" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,
    "termId" TEXT,
    "professorUserId" TEXT NOT NULL,
    "vagas" INTEGER NOT NULL DEFAULT 1,
    "cargaHorariaSemanal" INTEGER NOT NULL DEFAULT 8,
    "programaBolsaId" TEXT,
    "mediaMinima" DOUBLE PRECISION NOT NULL DEFAULT 7,
    "requisitos" TEXT,
    "inscricaoInicio" TIMESTAMP(3),
    "inscricaoFim" TIMESTAMP(3),
    "status" "ApoStatusVagaMonitoria" NOT NULL DEFAULT 'RASCUNHO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApoMonitoriaVaga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoMonitoriaCandidatura" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vagaId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "notaDisciplina" DOUBLE PRECISION,
    "notaEntrevista" DOUBLE PRECISION,
    "pontuacao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'INSCRITA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApoMonitoriaCandidatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoMonitor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vagaId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "horasMeta" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApoMonitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoMonitoriaFrequencia" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "horas" DOUBLE PRECISION NOT NULL,
    "atividade" TEXT NOT NULL,
    "validado" BOOLEAN NOT NULL DEFAULT false,
    "validadoPorId" TEXT,
    "validadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApoMonitoriaFrequencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoTurmaApoio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'NIVELAMENTO',
    "titulo" TEXT NOT NULL,
    "disciplineId" TEXT,
    "programId" TEXT,
    "responsavelUserId" TEXT,
    "vagas" INTEGER NOT NULL DEFAULT 30,
    "cargaHoraria" INTEGER NOT NULL DEFAULT 20,
    "inicio" TIMESTAMP(3),
    "fim" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PLANEJADA',
    "frequenciaMinima" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "descricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApoTurmaApoio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoTurmaApoioParticipante" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "turmaId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INSCRITO',
    "frequenciaPercent" DOUBLE PRECISION,
    "notaDiagnostica" DOUBLE PRECISION,
    "notaFinal" DOUBLE PRECISION,
    "origem" TEXT NOT NULL DEFAULT 'ESPONTANEA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApoTurmaApoioParticipante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoMentoria" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'DISCENTE',
    "modalidade" TEXT NOT NULL DEFAULT 'MENTORIA',
    "mentorUserId" TEXT,
    "mentorStudentId" TEXT,
    "menteeStudentId" TEXT,
    "menteeUserId" TEXT,
    "objetivos" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fim" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ATIVA',
    "frequenciaEncontrosDias" INTEGER NOT NULL DEFAULT 15,
    "proximoEncontroEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApoMentoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoMentoriaEncontro" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mentoriaId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "duracaoMin" INTEGER NOT NULL DEFAULT 60,
    "resumo" TEXT,
    "proximosPassos" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApoMentoriaEncontro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoEmpresa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpj" TEXT,
    "segmento" TEXT,
    "contatoNome" TEXT,
    "contatoEmail" TEXT,
    "contatoTelefone" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "convenioNumero" TEXT,
    "convenioInicio" TIMESTAMP(3),
    "convenioFim" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ATIVA',
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApoEmpresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoVaga" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'ESTAGIO',
    "publicoAlvo" TEXT NOT NULL DEFAULT 'ESTUDANTES',
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "area" TEXT,
    "programId" TEXT,
    "cidade" TEXT,
    "modalidade" TEXT NOT NULL DEFAULT 'PRESENCIAL',
    "remuneracao" DOUBLE PRECISION,
    "cargaSemanal" INTEGER,
    "requisitos" TEXT,
    "periodoMinimo" INTEGER,
    "vagas" INTEGER NOT NULL DEFAULT 1,
    "validade" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApoVaga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoCandidaturaVaga" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vagaId" TEXT NOT NULL,
    "studentId" TEXT,
    "egressoId" TEXT,
    "mensagem" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INSCRITA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApoCandidaturaVaga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoTermoEstagio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "vagaId" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'NAO_OBRIGATORIO',
    "orientadorUserId" TEXT,
    "supervisorNome" TEXT,
    "supervisorCargo" TEXT,
    "area" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "jornadaDiariaHoras" DOUBLE PRECISION NOT NULL,
    "cargaSemanalHoras" DOUBLE PRECISION NOT NULL,
    "bolsaValor" DOUBLE PRECISION,
    "auxilioTransporte" DOUBLE PRECISION,
    "apoliceSeguro" TEXT,
    "alunoPcd" BOOLEAN NOT NULL DEFAULT false,
    "atividades" TEXT,
    "status" "ApoStatusTermo" NOT NULL DEFAULT 'RASCUNHO',
    "assinadoEm" TIMESTAMP(3),
    "rescisaoMotivo" TEXT,
    "rescindidoEm" TIMESTAMP(3),
    "aditivos" JSONB,
    "alertas" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApoTermoEstagio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoRelatorioEstagio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "termoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'PARCIAL',
    "prazoEm" TIMESTAMP(3) NOT NULL,
    "entregueEm" TIMESTAMP(3),
    "avaliacaoOrientador" DOUBLE PRECISION,
    "parecer" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApoRelatorioEstagio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoOcorrencia" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "gravidade" TEXT NOT NULL DEFAULT 'LEVE',
    "categoria" TEXT NOT NULL DEFAULT 'CONDUTA',
    "descricao" TEXT NOT NULL,
    "dataFato" TIMESTAMP(3) NOT NULL,
    "local" TEXT,
    "relatorId" TEXT,
    "testemunhas" JSONB,
    "status" "ApoStatusOcorrencia" NOT NULL DEFAULT 'REGISTRADA',
    "notificadaEm" TIMESTAMP(3),
    "prazoDefesaEm" TIMESTAMP(3),
    "defesa" TEXT,
    "defesaEm" TIMESTAMP(3),
    "comissao" JSONB,
    "sancao" TEXT,
    "sancaoDias" INTEGER,
    "fundamentacao" TEXT,
    "decididaEm" TIMESTAMP(3),
    "decididaPorId" TEXT,
    "prazoRecursoEm" TIMESTAMP(3),
    "recurso" TEXT,
    "recursoEm" TIMESTAMP(3),
    "recursoDecisao" TEXT,
    "recursoFundamentacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApoOcorrencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoRiscoSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "nivel" TEXT NOT NULL,
    "fatores" JSONB NOT NULL,
    "metricas" JSONB,
    "calculadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApoRiscoSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoPlanoAcao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "nivelInicial" TEXT NOT NULL,
    "scoreInicial" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "responsavelUserId" TEXT,
    "acoesSugeridas" JSONB,
    "proximoContatoEm" TIMESTAMP(3),
    "resultado" TEXT,
    "scoreFinal" DOUBLE PRECISION,
    "encerradoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApoPlanoAcao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoContatoEvasao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "canal" TEXT NOT NULL DEFAULT 'TELEFONE',
    "dataHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resumo" TEXT NOT NULL,
    "resultado" TEXT NOT NULL DEFAULT 'CONTATO_REALIZADO',
    "proximoPasso" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApoContatoEvasao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoFormacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'OFICINA',
    "ementa" TEXT,
    "cargaHoraria" INTEGER NOT NULL DEFAULT 4,
    "vagas" INTEGER NOT NULL DEFAULT 30,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "modalidade" TEXT NOT NULL DEFAULT 'PRESENCIAL',
    "local" TEXT,
    "instrutor" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANEJADA',
    "emiteCertificado" BOOLEAN NOT NULL DEFAULT true,
    "frequenciaMinima" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApoFormacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoFormacaoInscricao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "formacaoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INSCRITO',
    "frequenciaPercent" DOUBLE PRECISION,
    "certificadoEmitidoEm" TIMESTAMP(3),
    "certificadoCodigo" TEXT,
    "secProtocoloId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApoFormacaoInscricao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoMaterial" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'DOCUMENTO',
    "descricao" TEXT,
    "url" TEXT,
    "disciplineId" TEXT,
    "programId" TEXT,
    "tags" JSONB,
    "autorUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "avaliacaoSoma" INTEGER NOT NULL DEFAULT 0,
    "avaliacaoQtd" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApoMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoChamado" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "solicitanteUserId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'OUTRO',
    "prioridade" TEXT NOT NULL DEFAULT 'NORMAL',
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "responsavelUserId" TEXT,
    "responsavelRole" TEXT,
    "slaHoras" INTEGER NOT NULL,
    "prazoEm" TIMESTAMP(3) NOT NULL,
    "primeiraRespostaEm" TIMESTAMP(3),
    "resolvidoEm" TIMESTAMP(3),
    "avaliacaoNota" INTEGER,
    "avaliacaoComentario" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApoChamado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoInstrumento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "finalidade" TEXT NOT NULL DEFAULT 'AVALIACAO_DOCENTE',
    "descricao" TEXT,
    "perguntas" JSONB NOT NULL,
    "anonimo" BOOLEAN NOT NULL DEFAULT true,
    "minRespostas" INTEGER NOT NULL DEFAULT 5,
    "escalaMax" INTEGER NOT NULL DEFAULT 5,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApoInstrumento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoAplicacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "instrumentoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "alvoTipo" TEXT NOT NULL DEFAULT 'DISCIPLINA',
    "alvoRef" TEXT,
    "alvoRotulo" TEXT,
    "termId" TEXT,
    "classSectionId" TEXT,
    "professorUserId" TEXT,
    "disciplineId" TEXT,
    "abertura" TIMESTAMP(3) NOT NULL,
    "fechamento" TIMESTAMP(3) NOT NULL,
    "status" "ApoStatusAplicacao" NOT NULL DEFAULT 'RASCUNHO',
    "publicoAlvo" JSONB,
    "convidados" INTEGER NOT NULL DEFAULT 0,
    "minRespostas" INTEGER,
    "publicadaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApoAplicacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoParticipacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "aplicacaoId" TEXT NOT NULL,
    "respondenteId" TEXT NOT NULL,
    "respondidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApoParticipacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoResposta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "aplicacaoId" TEXT NOT NULL,
    "respostas" JSONB NOT NULL,
    "nps" INTEGER,
    "comentario" TEXT,
    "respondenteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApoResposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoDevolutiva" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "aplicacaoId" TEXT NOT NULL,
    "professorUserId" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "planoMelhoria" TEXT,
    "autorId" TEXT,
    "visualizadaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApoDevolutiva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoSetorOuvidoria" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "responsavelUserId" TEXT,
    "slaDias" INTEGER NOT NULL DEFAULT 10,
    "escalaParaUserId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApoSetorOuvidoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoManifestacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "protocolo" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "senhaSalt" TEXT NOT NULL,
    "tipo" "ApoTipoManifestacao" NOT NULL,
    "categoria" TEXT,
    "assunto" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "anonima" BOOLEAN NOT NULL DEFAULT false,
    "nome" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "vinculo" TEXT,
    "studentId" TEXT,
    "userId" TEXT,
    "canal" TEXT NOT NULL DEFAULT 'PORTAL',
    "prioridade" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" "ApoStatusManifestacao" NOT NULL DEFAULT 'RECEBIDA',
    "setorId" TEXT,
    "responsavelUserId" TEXT,
    "prazoEm" TIMESTAMP(3) NOT NULL,
    "prorrogadoEm" TIMESTAMP(3),
    "escalonamentos" INTEGER NOT NULL DEFAULT 0,
    "respondidaEm" TIMESTAMP(3),
    "encerradaEm" TIMESTAMP(3),
    "respostaFinal" TEXT,
    "avaliacaoNota" INTEGER,
    "avaliacaoComentario" TEXT,
    "consultaFalhas" INTEGER NOT NULL DEFAULT 0,
    "consultaBloqueadaAte" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApoManifestacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoEncaminhamento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "manifestacaoId" TEXT NOT NULL,
    "setorId" TEXT NOT NULL,
    "solicitacao" TEXT,
    "prazoEm" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "resposta" TEXT,
    "respondidoEm" TIMESTAMP(3),
    "respondidoPorId" TEXT,
    "escalonadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApoEncaminhamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoEgresso" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT,
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "cpf" TEXT,
    "programId" TEXT,
    "programaNome" TEXT,
    "anoIngresso" INTEGER,
    "anoConclusao" INTEGER,
    "cidade" TEXT,
    "uf" TEXT,
    "consenteContato" BOOLEAN NOT NULL DEFAULT true,
    "situacaoProfissional" TEXT NOT NULL DEFAULT 'NAO_INFORMADO',
    "empregadorAtual" TEXT,
    "cargoAtual" TEXT,
    "atuaNaArea" BOOLEAN,
    "cursandoPos" BOOLEAN NOT NULL DEFAULT false,
    "faixaSalarial" TEXT,
    "linkedin" TEXT,
    "primeiroEmpregoEm" TIMESTAMP(3),
    "ultimaAtualizacaoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApoEgresso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoEgressoTrajetoria" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "egressoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'EMPREGO',
    "organizacao" TEXT NOT NULL,
    "cargo" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3),
    "atuaNaArea" BOOLEAN,
    "faixaSalarial" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApoEgressoTrajetoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoEventoEgresso" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'ENCONTRO',
    "descricao" TEXT,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "local" TEXT,
    "vagas" INTEGER,
    "programId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANEJADO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApoEventoEgresso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApoEventoParticipante" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "egressoId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMADO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApoEventoParticipante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BibConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proximoTombo" INTEGER NOT NULL DEFAULT 1,
    "prefixoTombo" TEXT NOT NULL DEFAULT '',
    "valorMultaDiaPadrao" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "valorMaxMultaAberta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "diasTolerancia" INTEGER NOT NULL DEFAULT 0,
    "considerarDiasUteis" BOOLEAN NOT NULL DEFAULT false,
    "feriados" JSONB,
    "minTitulosBasicos" INTEGER NOT NULL DEFAULT 3,
    "minTitulosComplementares" INTEGER NOT NULL DEFAULT 5,
    "vagasPorExemplar" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "bibliotecarioNome" TEXT,
    "bibliotecarioCrb" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BibConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BibPolitica" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "perfil" "BibPerfil" NOT NULL,
    "prazoDias" INTEGER NOT NULL DEFAULT 7,
    "limiteEmprestimos" INTEGER NOT NULL DEFAULT 3,
    "maxRenovacoes" INTEGER NOT NULL DEFAULT 2,
    "diasRenovacao" INTEGER,
    "multaDia" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "multaMaxima" DOUBLE PRECISION,
    "limiteReservas" INTEGER NOT NULL DEFAULT 2,
    "diasRetiradaReserva" INTEGER NOT NULL DEFAULT 3,
    "bloqueioDiasPorAtraso" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BibPolitica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BibObra" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "subtitulo" TEXT,
    "tipo" "BibTipoObra" NOT NULL DEFAULT 'LIVRO',
    "autores" JSONB,
    "autoresTexto" TEXT,
    "editora" TEXT,
    "edicao" TEXT,
    "ano" INTEGER,
    "isbn" TEXT,
    "issn" TEXT,
    "cdd" TEXT,
    "cdu" TEXT,
    "cutter" TEXT,
    "assuntos" JSONB,
    "assuntosTexto" TEXT,
    "idioma" TEXT DEFAULT 'pt-BR',
    "paginas" INTEGER,
    "resumo" TEXT,
    "capaUrl" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BibObra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BibExemplar" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "obraId" TEXT NOT NULL,
    "tombo" TEXT NOT NULL,
    "codigoBarras" TEXT,
    "spaceId" TEXT,
    "estante" TEXT,
    "prateleira" TEXT,
    "estado" "BibEstadoConservacao" NOT NULL DEFAULT 'BOM',
    "status" "BibStatusExemplar" NOT NULL DEFAULT 'DISPONIVEL',
    "apenasConsulta" BOOLEAN NOT NULL DEFAULT false,
    "aquisicaoTipo" "BibTipoAquisicao" NOT NULL DEFAULT 'COMPRA',
    "dataAquisicao" TIMESTAMP(3),
    "valor" DOUBLE PRECISION,
    "fornecedor" TEXT,
    "notaFiscal" TEXT,
    "observacoes" TEXT,
    "baixaMotivo" TEXT,
    "baixaEm" TIMESTAMP(3),
    "baixaPorId" TEXT,
    "baixaObs" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BibExemplar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BibLeitor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "perfil" "BibPerfil" NOT NULL,
    "studentId" TEXT,
    "userId" TEXT,
    "nome" TEXT NOT NULL,
    "documento" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "bloqueadoAte" TIMESTAMP(3),
    "motivoBloqueio" TEXT,
    "validadeAte" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BibLeitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BibEmprestimo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leitorId" TEXT NOT NULL,
    "exemplarId" TEXT NOT NULL,
    "obraId" TEXT NOT NULL,
    "status" "BibStatusEmprestimo" NOT NULL DEFAULT 'ATIVO',
    "dataEmprestimo" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataPrevista" TIMESTAMP(3) NOT NULL,
    "dataDevolucao" TIMESTAMP(3),
    "renovacoes" INTEGER NOT NULL DEFAULT 0,
    "diasAtraso" INTEGER NOT NULL DEFAULT 0,
    "multaPrevista" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "emprestadoPorId" TEXT,
    "devolvidoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BibEmprestimo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BibReserva" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leitorId" TEXT NOT NULL,
    "obraId" TEXT NOT NULL,
    "exemplarId" TEXT,
    "status" "BibStatusReserva" NOT NULL DEFAULT 'AGUARDANDO',
    "disponivelEm" TIMESTAMP(3),
    "expiraEm" TIMESTAMP(3),
    "concluidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BibReserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BibMulta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leitorId" TEXT NOT NULL,
    "emprestimoId" TEXT,
    "tipo" "BibTipoMulta" NOT NULL DEFAULT 'ATRASO',
    "valor" DOUBLE PRECISION NOT NULL,
    "diasAtraso" INTEGER NOT NULL DEFAULT 0,
    "status" "BibStatusMulta" NOT NULL DEFAULT 'ABERTA',
    "descricao" TEXT,
    "receivableId" TEXT,
    "pagaEm" TIMESTAMP(3),
    "formaPagamento" TEXT,
    "justificativa" TEXT,
    "baixaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BibMulta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BibInventario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "spaceId" TEXT,
    "estante" TEXT,
    "status" "BibStatusInventario" NOT NULL DEFAULT 'ABERTO',
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidoEm" TIMESTAMP(3),
    "responsavelId" TEXT,
    "totalEsperado" INTEGER NOT NULL DEFAULT 0,
    "resumo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BibInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BibInventarioItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inventarioId" TEXT NOT NULL,
    "exemplarId" TEXT,
    "tombo" TEXT NOT NULL,
    "situacao" "BibSituacaoItemInventario" NOT NULL DEFAULT 'PENDENTE',
    "localLido" TEXT,
    "conferidoEm" TIMESTAMP(3),
    "observacao" TEXT,

    CONSTRAINT "BibInventarioItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BibBibliografia" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,
    "obraId" TEXT NOT NULL,
    "tipo" "BibTipoBibliografia" NOT NULL DEFAULT 'BASICA',
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BibBibliografia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BibSugestaoAquisicao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "autores" TEXT,
    "editora" TEXT,
    "isbn" TEXT,
    "obraId" TEXT,
    "disciplineId" TEXT,
    "tipoBibliografia" "BibTipoBibliografia",
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "valorEstimado" DOUBLE PRECISION,
    "justificativa" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'PROFESSOR',
    "solicitanteId" TEXT,
    "status" "BibStatusSugestao" NOT NULL DEFAULT 'PENDENTE',
    "decididoPorId" TEXT,
    "decididoEm" TIMESTAMP(3),
    "motivoDecisao" TEXT,
    "recebidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BibSugestaoAquisicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BibRecursoVirtual" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "BibTipoRecurso" NOT NULL DEFAULT 'EBOOK',
    "titulo" TEXT NOT NULL,
    "autores" TEXT,
    "provedor" TEXT,
    "url" TEXT NOT NULL,
    "tipoAcesso" "BibTipoAcessoVirtual" NOT NULL DEFAULT 'ASSINATURA_INSTITUCIONAL',
    "libraryProviderId" TEXT,
    "obraId" TEXT,
    "isbn" TEXT,
    "issn" TEXT,
    "assuntos" TEXT,
    "descricao" TEXT,
    "vigenciaFim" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BibRecursoVirtual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BibAcessoVirtual" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recursoId" TEXT NOT NULL,
    "studentId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BibAcessoVirtual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BibRepositorioItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "tipo" "BibTipoItemRepositorio" NOT NULL DEFAULT 'TCC',
    "status" "BibStatusRepositorio" NOT NULL DEFAULT 'RASCUNHO',
    "titulo" TEXT NOT NULL,
    "tituloAlternativo" TEXT,
    "criadores" JSONB,
    "orientador" TEXT,
    "coorientador" TEXT,
    "banca" JSONB,
    "assuntos" JSONB,
    "descricao" TEXT,
    "abstractEn" TEXT,
    "editor" TEXT,
    "colaboradores" JSONB,
    "dataPublicacao" TIMESTAMP(3),
    "formato" TEXT,
    "fonte" TEXT,
    "idioma" TEXT DEFAULT 'pt-BR',
    "relacao" TEXT,
    "cobertura" TEXT,
    "direitos" TEXT,
    "licenca" TEXT,
    "embargoAte" TIMESTAMP(3),
    "restrito" BOOLEAN NOT NULL DEFAULT false,
    "arquivoUrl" TEXT,
    "arquivoDataUrl" TEXT,
    "arquivoNome" TEXT,
    "paginas" INTEGER,
    "ilustrado" BOOLEAN NOT NULL DEFAULT false,
    "cdd" TEXT,
    "cutter" TEXT,
    "programId" TEXT,
    "disciplineId" TEXT,
    "autorStudentId" TEXT,
    "autorUserId" TEXT,
    "buscaTexto" TEXT,
    "visualizacoes" INTEGER NOT NULL DEFAULT 0,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "publicadoEm" TIMESTAMP(3),
    "revisadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BibRepositorioItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalCategoria" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT NOT NULL DEFAULT '#0F5FDB',
    "icone" TEXT,
    "tipoPadrao" "CalEventoTipo",
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalCategoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalEvento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "termId" TEXT,
    "campusId" TEXT,
    "programId" TEXT,
    "categoriaId" TEXT,
    "tipo" "CalEventoTipo" NOT NULL DEFAULT 'OUTRO',
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "local" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "diaInteiro" BOOLEAN NOT NULL DEFAULT true,
    "publico" "CalPublico" NOT NULL DEFAULT 'TODOS',
    "recorrencia" "CalRecorrencia" NOT NULL DEFAULT 'NENHUMA',
    "recorrenciaIntervalo" INTEGER NOT NULL DEFAULT 1,
    "recorrenciaAte" TIMESTAMP(3),
    "bloqueiaAulas" BOOLEAN NOT NULL DEFAULT false,
    "lembreteDias" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "origemKey" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalHorario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "turno" "CalTurno" NOT NULL,
    "ordem" INTEGER NOT NULL,
    "inicioMin" INTEGER NOT NULL,
    "fimMin" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalHorario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalDisponibilidade" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "termId" TEXT,
    "diaSemana" INTEGER NOT NULL,
    "inicioMin" INTEGER NOT NULL,
    "fimMin" INTEGER NOT NULL,
    "tipo" "CalDisponibilidadeTipo" NOT NULL DEFAULT 'DISPONIVEL',
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalDisponibilidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalProfessorPerfil" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "maxAulasDia" INTEGER,
    "maxAulasSemana" INTEGER,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalProfessorPerfil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalDisciplinaConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,
    "aulasSemana" INTEGER,
    "blocoMax" INTEGER NOT NULL DEFAULT 2,
    "pratica" BOOLEAN NOT NULL DEFAULT false,
    "tiposEspaco" JSONB,
    "recursos" JSONB,
    "capacidadeMinima" INTEGER,
    "espacoFixoId" TEXT,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalDisciplinaConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalTurmaConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "programId" TEXT,
    "periodo" INTEGER,
    "turno" "CalTurno",
    "grupo" TEXT,
    "alunosEstimados" INTEGER,
    "diasPermitidos" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalTurmaConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalSlot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,
    "grupo" TEXT,
    "programId" TEXT,
    "periodo" INTEGER,
    "professorUserId" TEXT,
    "spaceId" TEXT,
    "diaSemana" INTEGER NOT NULL,
    "inicioMin" INTEGER NOT NULL,
    "fimMin" INTEGER NOT NULL,
    "tipoAula" "CalTipoAula" NOT NULL DEFAULT 'TEORICA',
    "origem" "CalOrigemSlot" NOT NULL DEFAULT 'MANUAL',
    "geracaoId" TEXT,
    "fixo" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalGeracao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "status" "CalGeracaoStatus" NOT NULL DEFAULT 'SIMULADA',
    "parametros" JSONB NOT NULL,
    "resumo" JSONB,
    "pendencias" JSONB,
    "totalAulas" INTEGER NOT NULL DEFAULT 0,
    "alocadas" INTEGER NOT NULL DEFAULT 0,
    "pendentes" INTEGER NOT NULL DEFAULT 0,
    "pontuacao" DOUBLE PRECISION,
    "nos" INTEGER NOT NULL DEFAULT 0,
    "duracaoMs" INTEGER NOT NULL DEFAULT 0,
    "criadoPorId" TEXT,
    "aplicadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalGeracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalReserva" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "finalidade" TEXT,
    "tipo" "CalReservaTipo" NOT NULL DEFAULT 'EVENTO',
    "status" "CalReservaStatus" NOT NULL DEFAULT 'PENDENTE',
    "bloqueio" BOOLEAN NOT NULL DEFAULT false,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "solicitanteId" TEXT NOT NULL,
    "classSectionId" TEXT,
    "professorUserId" TEXT,
    "participantes" INTEGER,
    "recursosSolicitados" JSONB,
    "serieId" TEXT,
    "recorrencia" "CalRecorrencia" NOT NULL DEFAULT 'NENHUMA',
    "recorrenciaAte" TIMESTAMP(3),
    "decididoPorId" TEXT,
    "decididoEm" TIMESTAMP(3),
    "motivoDecisao" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalReserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalExame" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "disciplineId" TEXT,
    "assessmentId" TEXT,
    "grupo" TEXT,
    "titulo" TEXT NOT NULL,
    "tipo" "CalExameTipo" NOT NULL DEFAULT 'PROVA_1',
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "spaceId" TEXT,
    "professorUserId" TEXT,
    "alunosPrevistos" INTEGER,
    "status" "CalExameStatus" NOT NULL DEFAULT 'AGENDADA',
    "originalId" TEXT,
    "segundaChamadaInicio" TIMESTAMP(3),
    "segundaChamadaFim" TIMESTAMP(3),
    "observacoes" TEXT,
    "lembreteAlunosEm" TIMESTAMP(3),
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalExame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalExameFiscal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "papel" TEXT NOT NULL DEFAULT 'FISCAL',
    "confirmado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalExameFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalPrazoNotas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "programId" TEXT,
    "campusId" TEXT,
    "tipo" "CalPrazoTipo" NOT NULL DEFAULT 'LANCAMENTO_NOTAS',
    "etapa" TEXT,
    "titulo" TEXT NOT NULL,
    "abertura" TIMESTAMP(3),
    "prazo" TIMESTAMP(3) NOT NULL,
    "prorrogadoAte" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "escalonadoCoordEm" TIMESTAMP(3),
    "escalonadoDirecaoEm" TIMESTAMP(3),
    "observacoes" TEXT,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalPrazoNotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalPrazoExcecao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "prazoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ate" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT,
    "concedidoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalPrazoExcecao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalPrazoConclusao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "prazoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "concluidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origem" TEXT,

    CONSTRAINT "CalPrazoConclusao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalConflito" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "termId" TEXT,
    "tipo" "CalConflitoTipo" NOT NULL,
    "status" "CalConflitoStatus" NOT NULL DEFAULT 'ABERTO',
    "chave" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "detalhes" JSONB,
    "detectadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvidoEm" TIMESTAMP(3),
    "resolvidoPorId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalConflito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalFeed" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "escopo" "CalFeedEscopo" NOT NULL,
    "refId" TEXT,
    "termId" TEXT,
    "titulo" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoPorId" TEXT,
    "ultimoAcesso" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalFeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComCanal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "ComCanalTipo" NOT NULL,
    "nome" TEXT NOT NULL,
    "provedor" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "configCifrada" TEXT,
    "configurado" BOOLEAN NOT NULL DEFAULT false,
    "delegarRevah" BOOLEAN NOT NULL DEFAULT false,
    "limiteHora" INTEGER NOT NULL DEFAULT 300,
    "limiteDia" INTEGER NOT NULL DEFAULT 2000,
    "restringirHorario" BOOLEAN NOT NULL DEFAULT false,
    "ultimoTesteEm" TIMESTAMP(3),
    "ultimoTesteOk" BOOLEAN,
    "ultimoTesteMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComCanal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "horarioInicio" TEXT NOT NULL DEFAULT '08:00',
    "horarioFim" TEXT NOT NULL DEFAULT '20:00',
    "diasUteis" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
    "maxTentativas" INTEGER NOT NULL DEFAULT 4,
    "backoffMinutos" INTEGER[] DEFAULT ARRAY[5, 15, 60]::INTEGER[],
    "slaPrimeiraRespostaMin" INTEGER NOT NULL DEFAULT 30,
    "slaResolucaoMin" INTEGER NOT NULL DEFAULT 1440,
    "botAtivo" BOOLEAN NOT NULL DEFAULT true,
    "iaFallback" BOOLEAN NOT NULL DEFAULT true,
    "iaLimiteDiarioConversa" INTEGER NOT NULL DEFAULT 5,
    "mensagemHandoff" TEXT NOT NULL DEFAULT 'Vou transferir você para um de nossos atendentes. Aguarde um instante, por favor.',
    "mensagemForaHorario" TEXT NOT NULL DEFAULT 'Nosso atendimento humano funciona em horário comercial. Deixe sua mensagem que responderemos assim que possível.',
    "mensagemBoasVindas" TEXT NOT NULL DEFAULT 'Olá! Sou o assistente virtual da instituição. Como posso ajudar?',
    "uraMenu" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComContato" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "ComContatoTipo" NOT NULL DEFAULT 'OUTRO',
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "telegramChatId" TEXT,
    "instagramId" TEXT,
    "facebookId" TEXT,
    "documento" TEXT,
    "studentId" TEXT,
    "candidatoId" TEXT,
    "userId" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComContato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComPreferencia" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contatoId" TEXT NOT NULL,
    "canal" TEXT NOT NULL DEFAULT '*',
    "finalidade" TEXT NOT NULL DEFAULT 'MARKETING',
    "consentimento" BOOLEAN NOT NULL DEFAULT true,
    "origem" TEXT,
    "motivo" TEXT,
    "registradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComPreferencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'GERAL',
    "canal" TEXT,
    "assunto" TEXT,
    "corpo" TEXT NOT NULL,
    "variaveis" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComConversa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contatoId" TEXT NOT NULL,
    "canalTipo" "ComCanalTipo" NOT NULL,
    "canalId" TEXT,
    "chaveExterna" TEXT,
    "assunto" TEXT,
    "status" "ComConversaStatus" NOT NULL DEFAULT 'ABERTA',
    "prioridade" INTEGER NOT NULL DEFAULT 0,
    "atribuidoAId" TEXT,
    "etiquetas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "botAtivo" BOOLEAN NOT NULL DEFAULT true,
    "botEstado" JSONB,
    "naoLidas" INTEGER NOT NULL DEFAULT 0,
    "slaPrimeiraRespostaEm" TIMESTAMP(3),
    "slaResolucaoEm" TIMESTAMP(3),
    "primeiraRespostaEm" TIMESTAMP(3),
    "ultimaMensagemEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaDirecao" TEXT,
    "resolvidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComConversa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComMensagem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "direcao" TEXT NOT NULL,
    "autorTipo" TEXT NOT NULL,
    "autorId" TEXT,
    "conteudo" TEXT NOT NULL,
    "midiaUrl" TEXT,
    "externalId" TEXT,
    "notificationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REGISTRADA',
    "erro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComMensagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComCampanha" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "segmento" TEXT NOT NULL,
    "filtros" JSONB,
    "canal" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "finalidade" TEXT NOT NULL DEFAULT 'MARKETING',
    "status" "ComCampanhaStatus" NOT NULL DEFAULT 'RASCUNHO',
    "agendadaPara" TIMESTAMP(3),
    "iniciadaEm" TIMESTAMP(3),
    "concluidaEm" TIMESTAMP(3),
    "totalAlvo" INTEGER NOT NULL DEFAULT 0,
    "totalEnfileirado" INTEGER NOT NULL DEFAULT 0,
    "totalBloqueado" INTEGER NOT NULL DEFAULT 0,
    "totalSemDestino" INTEGER NOT NULL DEFAULT 0,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComCampanha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComCampanhaDestinatario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campanhaId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "nome" TEXT,
    "contatoId" TEXT,
    "studentId" TEXT,
    "destino" TEXT,
    "resultado" TEXT NOT NULL,
    "notificationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComCampanhaDestinatario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComRegua" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "toleranciaDias" INTEGER NOT NULL DEFAULT 2,
    "descricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComRegua_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComReguaEtapa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reguaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "offsetDias" INTEGER NOT NULL,
    "canal" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "canalFallback" TEXT,
    "templateId" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComReguaEtapa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComReguaExecucao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reguaId" TEXT NOT NULL,
    "etapaId" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "studentId" TEXT,
    "notificationId" TEXT,
    "resultado" TEXT NOT NULL DEFAULT 'ENFILEIRADO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComReguaExecucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComBotFluxo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "intencao" TEXT NOT NULL,
    "gatilhos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "definicao" JSONB NOT NULL,
    "prioridade" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComBotFluxo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComFaq" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'GERAL',
    "pergunta" TEXT NOT NULL,
    "resposta" TEXT NOT NULL,
    "palavrasChave" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "usos" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComFaq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComSocialConta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rede" "ComRedeSocial" NOT NULL,
    "nome" TEXT NOT NULL,
    "handle" TEXT,
    "externalId" TEXT,
    "tokenCifrado" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "seguidores" INTEGER,
    "ultimaSincEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComSocialConta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComSocialPost" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "midiaUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tema" TEXT,
    "agendadoPara" TIMESTAMP(3),
    "status" "ComPostStatus" NOT NULL DEFAULT 'RASCUNHO',
    "criadoPorId" TEXT,
    "aprovadoPorId" TEXT,
    "aprovadoEm" TIMESTAMP(3),
    "motivoRejeicao" TEXT,
    "publicadoEm" TIMESTAMP(3),
    "externalId" TEXT,
    "urlPublicado" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComSocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComSocialMetrica" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "postId" TEXT,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alcance" INTEGER NOT NULL DEFAULT 0,
    "impressoes" INTEGER NOT NULL DEFAULT 0,
    "curtidas" INTEGER NOT NULL DEFAULT 0,
    "comentarios" INTEGER NOT NULL DEFAULT 0,
    "compartilhamentos" INTEGER NOT NULL DEFAULT 0,
    "cliques" INTEGER NOT NULL DEFAULT 0,
    "seguidores" INTEGER,
    "origem" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComSocialMetrica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComSocialInteracao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "postId" TEXT,
    "tipo" TEXT NOT NULL,
    "autor" TEXT,
    "texto" TEXT NOT NULL,
    "externalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "resposta" TEXT,
    "respondidoEm" TIMESTAMP(3),
    "moderadoPorId" TEXT,
    "alerta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComSocialInteracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComChamada" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "canalId" TEXT,
    "direcao" TEXT NOT NULL,
    "de" TEXT,
    "para" TEXT,
    "contatoId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INICIADA',
    "duracaoSeg" INTEGER,
    "provedorSid" TEXT,
    "mensagem" TEXT,
    "digitos" TEXT,
    "atendenteId" TEXT,
    "notas" TEXT,
    "erro" TEXT,
    "inicioEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fimEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComChamada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComWebhookLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "canalId" TEXT,
    "tipo" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComWebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesExame" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "DesTipoExame" NOT NULL,
    "descricao" TEXT,
    "numQuestoes" INTEGER,
    "duracaoMin" INTEGER,
    "notaCorte" DOUBLE PRECISION,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesExame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesEixo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exameId" TEXT NOT NULL,
    "parentId" TEXT,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "DesTipoEixo" NOT NULL DEFAULT 'AREA',
    "peso" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "metaAcerto" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesEixo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesEdicao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exameId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL DEFAULT '',
    "dataProva" TIMESTAMP(3),
    "inscricaoInicio" TIMESTAMP(3),
    "inscricaoFim" TIMESTAMP(3),
    "dataResultado" TIMESTAMP(3),
    "status" "DesStatusEdicao" NOT NULL DEFAULT 'PLANEJADA',
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesEdicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesInscricao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "edicaoId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "programId" TEXT,
    "categoria" "DesCategoriaInscrito" NOT NULL DEFAULT 'CONCLUINTE',
    "situacao" "DesSituacaoInscricao" NOT NULL DEFAULT 'PENDENTE',
    "protocolo" TEXT,
    "nota" DOUBLE PRECISION,
    "conceito" INTEGER,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesInscricao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesMetaCurso" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "exameId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "metaAcerto" DOUBLE PRECISION NOT NULL,
    "conceitoAlvo" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesMetaCurso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesQuestao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exameId" TEXT NOT NULL,
    "eixoId" TEXT,
    "disciplineId" TEXT,
    "tipo" "DesTipoQuestao" NOT NULL DEFAULT 'OBJETIVA',
    "enunciado" TEXT NOT NULL,
    "alternativas" JSONB,
    "gabarito" TEXT,
    "comentario" TEXT,
    "nivel" "DesNivel" NOT NULL DEFAULT 'MEDIO',
    "anoFonte" INTEGER,
    "fonte" TEXT,
    "status" "DesStatusQuestao" NOT NULL DEFAULT 'RASCUNHO',
    "origem" "DesOrigemQuestao" NOT NULL DEFAULT 'MANUAL',
    "totalRespostas" INTEGER NOT NULL DEFAULT 0,
    "totalAcertos" INTEGER NOT NULL DEFAULT 0,
    "indiceDiscriminacao" DOUBLE PRECISION,
    "criadoPorId" TEXT,
    "revisadoPorId" TEXT,
    "revisadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesQuestao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesSimulado" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exameId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "status" "DesStatusSimulado" NOT NULL DEFAULT 'RASCUNHO',
    "abreEm" TIMESTAMP(3),
    "fechaEm" TIMESTAMP(3),
    "duracaoMin" INTEGER NOT NULL DEFAULT 180,
    "matriz" JSONB,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesSimulado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesSimuladoQuestao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "simuladoId" TEXT NOT NULL,
    "questaoId" TEXT NOT NULL,
    "eixoId" TEXT,
    "ordem" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesSimuladoQuestao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesSimuladoAlvo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "simuladoId" TEXT NOT NULL,
    "classSectionId" TEXT,
    "programId" TEXT,
    "studentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesSimuladoAlvo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesTentativa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "simuladoId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "DesStatusTentativa" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3),
    "enviadaEm" TIMESTAMP(3),
    "acertos" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "percentual" DOUBLE PRECISION,
    "porEixo" JSONB,
    "tempoSegundos" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesTentativa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesResposta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tentativaId" TEXT NOT NULL,
    "questaoId" TEXT NOT NULL,
    "eixoId" TEXT,
    "alternativa" TEXT,
    "correta" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesResposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesKit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" "DesTipoKit" NOT NULL DEFAULT 'QUESTOES_CONTEXTUALIZADAS',
    "exameId" TEXT,
    "eixoId" TEXT,
    "disciplineId" TEXT,
    "descricao" TEXT,
    "conteudo" TEXT,
    "questaoIds" JSONB,
    "gabaritoComentado" TEXT,
    "tempoEstimadoMin" INTEGER,
    "visibilidade" "DesVisibilidadeKit" NOT NULL DEFAULT 'PRIVADA',
    "autorUserId" TEXT NOT NULL,
    "usos" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesAtribuicao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kitId" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "professorUserId" TEXT NOT NULL,
    "prazo" TIMESTAMP(3) NOT NULL,
    "instrucoes" TEXT,
    "status" "DesStatusAtribuicao" NOT NULL DEFAULT 'ABERTA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesAtribuicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesEntrega" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "atribuicaoId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "DesStatusEntrega" NOT NULL DEFAULT 'PENDENTE',
    "respostas" JSONB,
    "texto" TEXT,
    "acertos" INTEGER,
    "total" INTEGER,
    "nota" DOUBLE PRECISION,
    "feedback" TEXT,
    "entregueEm" TIMESTAMP(3),
    "corrigidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesEntrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesTrilha" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "exameId" TEXT NOT NULL,
    "status" "DesStatusTrilha" NOT NULL DEFAULT 'ATIVA',
    "metaPercentual" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "metaData" TIMESTAMP(3),
    "horasSemana" DOUBLE PRECISION NOT NULL DEFAULT 6,
    "lacunas" JSONB,
    "progresso" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "geradaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesTrilha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesTrilhaItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "trilhaId" TEXT NOT NULL,
    "eixoId" TEXT,
    "semana" INTEGER NOT NULL,
    "tipo" "DesTipoItemTrilha" NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "minutos" INTEGER NOT NULL DEFAULT 60,
    "dataPrevista" TIMESTAMP(3) NOT NULL,
    "status" "DesStatusItemTrilha" NOT NULL DEFAULT 'PENDENTE',
    "revisaoN" INTEGER NOT NULL DEFAULT 0,
    "concluidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesTrilhaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovSequencia" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovSequencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovPdi" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "anoInicio" INTEGER NOT NULL,
    "anoFim" INTEGER NOT NULL,
    "missao" TEXT,
    "visao" TEXT,
    "valores" TEXT,
    "status" "GovPdiStatus" NOT NULL DEFAULT 'RASCUNHO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovPdi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovPdiEixo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pdiId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "eixoSinaes" INTEGER,
    "dimensaoSinaes" INTEGER,
    "peso" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovPdiEixo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovPdiObjetivo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eixoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "peso" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovPdiObjetivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovPdiMeta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "objetivoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "indicador" TEXT NOT NULL,
    "unidade" TEXT,
    "sentido" "GovSentidoIndicador" NOT NULL DEFAULT 'MAIOR_MELHOR',
    "linhaBase" DOUBLE PRECISION NOT NULL,
    "valorMeta" DOUBLE PRECISION NOT NULL,
    "valorAtual" DOUBLE PRECISION,
    "periodicidade" "GovPeriodicidade" NOT NULL DEFAULT 'SEMESTRAL',
    "responsavelId" TEXT,
    "prazo" TIMESTAMP(3),
    "proximaColetaEm" TIMESTAMP(3),
    "ultimaColetaEm" TIMESTAMP(3),
    "peso" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovPdiMeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovPdiMedicao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "metaId" TEXT NOT NULL,
    "dataReferencia" TIMESTAMP(3) NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "observacao" TEXT,
    "registradoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovPdiMedicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovPdiAcao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "metaId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "responsavelId" TEXT,
    "prazo" TIMESTAMP(3) NOT NULL,
    "orcamento" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "gasto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "percentual" INTEGER NOT NULL DEFAULT 0,
    "status" "GovStatusAcao" NOT NULL DEFAULT 'PLANEJADA',
    "concluidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovPdiAcao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovDocumento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "GovDocumentoTipo" NOT NULL,
    "titulo" TEXT NOT NULL,
    "codigo" TEXT,
    "programId" TEXT,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovDocumento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovDocumentoVersao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "conteudoHtml" TEXT,
    "resumoAlteracoes" TEXT,
    "arquivoUrl" TEXT,
    "status" "GovVersaoStatus" NOT NULL DEFAULT 'RASCUNHO',
    "vigenciaInicio" TIMESTAMP(3),
    "vigenciaFim" TIMESTAMP(3),
    "aprovadoPorId" TEXT,
    "deliberacaoId" TEXT,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovDocumentoVersao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovCpa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "portaria" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovCpa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovCpaMembro" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cpaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "segmento" "GovSegmento" NOT NULL,
    "userId" TEXT,
    "cargo" TEXT,
    "inicioMandato" TIMESTAMP(3) NOT NULL,
    "fimMandato" TIMESTAMP(3) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovCpaMembro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovCpaCiclo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cpaId" TEXT,
    "titulo" TEXT NOT NULL,
    "anoBase" INTEGER NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "minRespostas" INTEGER NOT NULL DEFAULT 5,
    "status" "GovCpaCicloStatus" NOT NULL DEFAULT 'PLANEJAMENTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovCpaCiclo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovCpaQuestionario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cicloId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "segmento" "GovSegmento" NOT NULL,
    "modeloKey" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovCpaQuestionario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovCpaModeloQuestionario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "segmento" "GovSegmento" NOT NULL,
    "perguntas" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovCpaModeloQuestionario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovCpaPergunta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "questionarioId" TEXT NOT NULL,
    "eixo" INTEGER NOT NULL,
    "dimensao" INTEGER,
    "texto" TEXT NOT NULL,
    "tipo" "GovCpaTipoPergunta" NOT NULL DEFAULT 'LIKERT5',
    "obrigatoria" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovCpaPergunta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovCpaConvite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "questionarioId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "programId" TEXT,
    "usado" BOOLEAN NOT NULL DEFAULT false,
    "expiraEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GovCpaConvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovCpaResposta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cicloId" TEXT NOT NULL,
    "questionarioId" TEXT NOT NULL,
    "segmento" "GovSegmento" NOT NULL,
    "programId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GovCpaResposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovCpaRespostaItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "respostaId" TEXT NOT NULL,
    "perguntaId" TEXT NOT NULL,
    "valor" DOUBLE PRECISION,
    "texto" TEXT,

    CONSTRAINT "GovCpaRespostaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovCpaRelatorio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cicloId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "dados" JSONB,
    "geradoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovCpaRelatorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovCpaPlanoAcao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cicloId" TEXT NOT NULL,
    "eixo" INTEGER,
    "dimensao" INTEGER,
    "problema" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "responsavelId" TEXT,
    "prazo" TIMESTAMP(3),
    "status" "GovStatusAcao" NOT NULL DEFAULT 'PLANEJADA',
    "origemScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovCpaPlanoAcao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovNde" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "portaria" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "conforme" BOOLEAN,
    "verificadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovNde_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovNdeMembro" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ndeId" TEXT NOT NULL,
    "docenteId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "titulacao" "GovTitulacao" NOT NULL,
    "regime" "GovRegime" NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3),
    "presidente" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovNdeMembro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovNdeReuniao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ndeId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "pauta" TEXT,
    "ata" TEXT,
    "presentes" JSONB,
    "realizada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovNdeReuniao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovOrgao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "GovOrgaoTipo" NOT NULL,
    "nome" TEXT NOT NULL,
    "sigla" TEXT,
    "programId" TEXT,
    "quorumPercent" INTEGER NOT NULL DEFAULT 50,
    "maioria" TEXT NOT NULL DEFAULT 'SIMPLES',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovOrgao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovOrgaoMembro" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgaoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "userId" TEXT,
    "cargo" TEXT NOT NULL DEFAULT 'MEMBRO',
    "representacao" TEXT,
    "temVoto" BOOLEAN NOT NULL DEFAULT true,
    "inicioMandato" TIMESTAMP(3) NOT NULL,
    "fimMandato" TIMESTAMP(3) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovOrgaoMembro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovReuniao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgaoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'ORDINARIA',
    "data" TIMESTAMP(3) NOT NULL,
    "local" TEXT,
    "status" "GovReuniaoStatus" NOT NULL DEFAULT 'AGENDADA',
    "presentes" JSONB,
    "quorumAtingido" BOOLEAN,
    "ata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovReuniao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovPauta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reuniaoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'DELIBERACAO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovPauta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovPautaModelo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "itens" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovPautaModelo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovDeliberacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgaoId" TEXT NOT NULL,
    "reuniaoId" TEXT,
    "pautaId" TEXT,
    "ano" INTEGER NOT NULL,
    "numero" INTEGER,
    "numeracao" TEXT,
    "titulo" TEXT NOT NULL,
    "texto" TEXT,
    "status" "GovDeliberacaoStatus" NOT NULL DEFAULT 'PROPOSTA',
    "resultado" JSONB,
    "decididaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovDeliberacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovVotoRegistro" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deliberacaoId" TEXT NOT NULL,
    "membroId" TEXT NOT NULL,
    "voto" "GovVoto" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovVotoRegistro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovCipaGestao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "status" "GovCipaGestaoStatus" NOT NULL DEFAULT 'ELEICAO',
    "eleicaoEm" TIMESTAMP(3),
    "ataEleicao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovCipaGestao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovCipaMembro" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gestaoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "userId" TEXT,
    "representacao" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'TITULAR',
    "cargo" TEXT NOT NULL DEFAULT 'MEMBRO',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovCipaMembro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovCipaReuniao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gestaoId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'ORDINARIA',
    "data" TIMESTAMP(3) NOT NULL,
    "pauta" TEXT,
    "ata" TEXT,
    "realizada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovCipaReuniao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovCipaRisco" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "local" TEXT NOT NULL,
    "spaceId" TEXT,
    "setor" TEXT,
    "agente" "GovAgenteRisco" NOT NULL,
    "descricao" TEXT NOT NULL,
    "gravidade" INTEGER NOT NULL DEFAULT 1,
    "probabilidade" INTEGER NOT NULL DEFAULT 1,
    "pontuacao" INTEGER NOT NULL DEFAULT 1,
    "nivel" TEXT NOT NULL DEFAULT 'BAIXO',
    "medidaControle" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovCipaRisco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovCipaInspecao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "local" TEXT NOT NULL,
    "responsavelId" TEXT,
    "achados" TEXT,
    "conclusao" TEXT,
    "realizada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovCipaInspecao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovCipaAcidente" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "pessoaNome" TEXT NOT NULL,
    "vinculo" TEXT NOT NULL DEFAULT 'EMPREGADO',
    "tipo" TEXT NOT NULL DEFAULT 'TIPICO',
    "gravidade" TEXT NOT NULL DEFAULT 'LEVE',
    "local" TEXT,
    "descricao" TEXT NOT NULL,
    "diasAfastamento" INTEGER NOT NULL DEFAULT 0,
    "catObrigatoria" BOOLEAN NOT NULL DEFAULT false,
    "catPrazo" TIMESTAMP(3),
    "catEmitida" BOOLEAN NOT NULL DEFAULT false,
    "catNumero" TEXT,
    "catEmitidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovCipaAcidente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovCipaSipat" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "tema" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "programacao" JSONB,
    "participantes" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PLANEJADA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovCipaSipat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovCipaPlanoAcao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "origem" TEXT,
    "origemId" TEXT,
    "acao" TEXT NOT NULL,
    "responsavelId" TEXT,
    "prazo" TIMESTAMP(3) NOT NULL,
    "status" "GovStatusAcao" NOT NULL DEFAULT 'PLANEJADA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovCipaPlanoAcao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovCarreiraPlano" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "GovCarreiraTipo" NOT NULL,
    "nome" TEXT NOT NULL,
    "vigenciaInicio" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovCarreiraPlano_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovCarreiraNivel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "classe" TEXT,
    "ordem" INTEGER NOT NULL,
    "titulacaoMinima" "GovTitulacao",
    "intersticioMeses" INTEGER NOT NULL DEFAULT 24,
    "pontuacaoMinima" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avaliacaoMinima" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salarioBase" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovCarreiraNivel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovCarreiraEnquadramento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "nivelId" TEXT NOT NULL,
    "docenteId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "titulacao" "GovTitulacao",
    "inicioNivel" TIMESTAMP(3) NOT NULL,
    "pontuacao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avaliacao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovCarreiraEnquadramento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovCarreiraProgressao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enquadramentoId" TEXT NOT NULL,
    "nivelOrigemId" TEXT NOT NULL,
    "nivelDestinoId" TEXT NOT NULL,
    "status" "GovProgressaoStatus" NOT NULL DEFAULT 'SOLICITADA',
    "simulacao" JSONB,
    "impactoSalarial" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "justificativa" TEXT,
    "parecer" TEXT,
    "historico" JSONB,
    "solicitadaPorId" TEXT,
    "decididaPorId" TEXT,
    "decididaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovCarreiraProgressao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfSequencia" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfSequencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfCategoriaBem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "vidaUtilMeses" INTEGER NOT NULL DEFAULT 120,
    "valorResidualPct" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "grupo" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfCategoriaBem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfBem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tombamento" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "marca" TEXT,
    "modelo" TEXT,
    "numeroSerie" TEXT,
    "notaFiscal" TEXT,
    "fornecedorId" TEXT,
    "valorAquisicao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dataAquisicao" TIMESTAMP(3) NOT NULL,
    "vidaUtilMeses" INTEGER,
    "valorResidual" DOUBLE PRECISION,
    "spaceId" TEXT,
    "responsavelUserId" TEXT,
    "estado" "InfEstadoBem" NOT NULL DEFAULT 'BOM',
    "status" "InfStatusBem" NOT NULL DEFAULT 'ATIVO',
    "criticidade" TEXT NOT NULL DEFAULT 'NORMAL',
    "fotoUrl" TEXT,
    "garantiaAte" TIMESTAMP(3),
    "observacoes" TEXT,
    "baixadoEm" TIMESTAMP(3),
    "motivoBaixa" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfBem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfMovimentacaoBem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bemId" TEXT NOT NULL,
    "tipo" "InfTipoMovimentacao" NOT NULL,
    "origemSpaceId" TEXT,
    "destinoSpaceId" TEXT,
    "origemResponsavelId" TEXT,
    "destinoResponsavelId" TEXT,
    "estadoAnterior" TEXT,
    "estadoNovo" TEXT,
    "motivo" TEXT,
    "documento" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InfMovimentacaoBem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfInventario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "spaceId" TEXT,
    "categoriaId" TEXT,
    "status" "InfStatusInventario" NOT NULL DEFAULT 'ABERTO',
    "responsavelUserId" TEXT,
    "prazoEm" TIMESTAMP(3),
    "fechadoEm" TIMESTAMP(3),
    "resumo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfInventarioItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inventarioId" TEXT NOT NULL,
    "bemId" TEXT,
    "tombamentoLido" TEXT,
    "spaceEsperadoId" TEXT,
    "spaceEncontradoId" TEXT,
    "estadoEncontrado" "InfEstadoBem",
    "contado" BOOLEAN NOT NULL DEFAULT false,
    "divergencia" "InfDivergencia" NOT NULL DEFAULT 'NENHUMA',
    "observacao" TEXT,
    "contadoPorId" TEXT,
    "contadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfInventarioItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfPlanoPreventivo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "bemId" TEXT,
    "spaceId" TEXT,
    "categoriaId" TEXT,
    "periodicidadeDias" INTEGER NOT NULL,
    "antecedenciaDias" INTEGER NOT NULL DEFAULT 7,
    "proximaExecucao" TIMESTAMP(3) NOT NULL,
    "ultimaGeracao" TIMESTAMP(3),
    "prioridade" "InfPrioridade" NOT NULL DEFAULT 'MEDIA',
    "checklist" JSONB,
    "fornecedorId" TEXT,
    "responsavelUserId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfPlanoPreventivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfOrdemServico" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "tipo" "InfTipoOS" NOT NULL DEFAULT 'CORRETIVA',
    "prioridade" "InfPrioridade" NOT NULL DEFAULT 'MEDIA',
    "status" "InfStatusOS" NOT NULL DEFAULT 'ABERTA',
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "bemId" TEXT,
    "spaceId" TEXT,
    "chamadoId" TEXT,
    "planoId" TEXT,
    "fornecedorId" TEXT,
    "responsavelUserId" TEXT,
    "abertaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prazoSla" TIMESTAMP(3) NOT NULL,
    "agendadaPara" TIMESTAMP(3),
    "iniciadaEm" TIMESTAMP(3),
    "concluidaEm" TIMESTAMP(3),
    "custoMaoObra" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "custoPecas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "checklist" JSONB,
    "solucao" TEXT,
    "bemParado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfOrdemServico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfOsPeca" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "osId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "valorUnitario" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InfOsPeca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfChamado" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "categoria" "InfCategoriaChamado" NOT NULL DEFAULT 'PREDIAL',
    "prioridade" "InfPrioridade" NOT NULL DEFAULT 'MEDIA',
    "status" "InfStatusChamado" NOT NULL DEFAULT 'ABERTO',
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "spaceId" TEXT,
    "bemId" TEXT,
    "solicitanteUserId" TEXT NOT NULL,
    "atendenteUserId" TEXT,
    "osId" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'USUARIO',
    "fotoUrl" TEXT,
    "resolvidoEm" TIMESTAMP(3),
    "fechadoEm" TIMESTAMP(3),
    "avaliacaoNota" INTEGER,
    "avaliacaoComentario" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfChamado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfChamadoComentario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chamadoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "interno" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InfChamadoComentario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfProjeto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "status" "InfStatusProjeto" NOT NULL DEFAULT 'PROPOSTO',
    "oQue" TEXT NOT NULL,
    "porQue" TEXT NOT NULL,
    "onde" TEXT,
    "spaceId" TEXT,
    "quando" TEXT,
    "quem" TEXT,
    "como" TEXT,
    "quantoCusta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gastoReal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "justificativa" TEXT,
    "inicioPrevisto" TIMESTAMP(3),
    "fimPrevisto" TIMESTAMP(3),
    "responsavelUserId" TEXT,
    "pdiMetaId" TEXT,
    "recomendacaoMec" TEXT,
    "evidencias" JSONB,
    "percentual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aprovadoPorId" TEXT,
    "aprovadoEm" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfProjeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfProjetoEtapa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 1,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "inicio" TIMESTAMP(3),
    "fim" TIMESTAMP(3) NOT NULL,
    "responsavelUserId" TEXT,
    "peso" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "percentual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "InfStatusEtapa" NOT NULL DEFAULT 'PENDENTE',
    "custoPrevisto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "custoReal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "concluidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfProjetoEtapa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfAreaEstacionamento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "spaceId" TEXT,
    "campusId" TEXT,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfAreaEstacionamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfVaga" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" "InfTipoVaga" NOT NULL DEFAULT 'COMUM',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfVaga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfVeiculo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "placa" TEXT NOT NULL,
    "tipo" "InfTipoVeiculo" NOT NULL DEFAULT 'CARRO',
    "modelo" TEXT,
    "cor" TEXT,
    "vinculo" "InfVinculoProprietario" NOT NULL DEFAULT 'ALUNO',
    "proprietarioNome" TEXT NOT NULL,
    "proprietarioUserId" TEXT,
    "studentId" TEXT,
    "contato" TEXT,
    "credencial" TEXT,
    "credencialStatus" "InfStatusCredencial" NOT NULL DEFAULT 'ATIVA',
    "validade" TIMESTAMP(3),
    "vagaEspecial" "InfTipoVaga",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfVeiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfAcessoEstacionamento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "vagaId" TEXT,
    "veiculoId" TEXT,
    "placa" TEXT NOT NULL,
    "entradaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saidaEm" TIMESTAMP(3),
    "autorizado" BOOLEAN NOT NULL DEFAULT true,
    "motivoNegado" TEXT,
    "registradoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InfAcessoEstacionamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfOcorrenciaEstacionamento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "areaId" TEXT,
    "vagaId" TEXT,
    "veiculoId" TEXT,
    "placa" TEXT,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "gravidade" TEXT NOT NULL DEFAULT 'LEVE',
    "status" "InfStatusOcorrencia" NOT NULL DEFAULT 'ABERTA',
    "fotoUrl" TEXT,
    "registradoPorId" TEXT,
    "resolucao" TEXT,
    "resolvidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfOcorrenciaEstacionamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfReservaArea" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "finalidade" TEXT,
    "solicitanteUserId" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "publicoEstimado" INTEGER,
    "status" "InfStatusReserva" NOT NULL DEFAULT 'SOLICITADA',
    "necessidades" JSONB,
    "decididoPorId" TEXT,
    "decididoEm" TIMESTAMP(3),
    "motivoDecisao" TEXT,
    "aceiteRegras" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfReservaArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfRegraUso" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT,
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 1,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfRegraUso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfPontoLuz" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'LED',
    "potenciaW" DOUBLE PRECISION,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "status" "InfStatusPontoLuz" NOT NULL DEFAULT 'OK',
    "chamadoId" TEXT,
    "ultimaTroca" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfPontoLuz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfMedidor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" "InfTipoMedidor" NOT NULL,
    "spaceId" TEXT,
    "campusId" TEXT,
    "unidade" TEXT NOT NULL DEFAULT 'kWh',
    "limiarDesvioPct" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "janelaLeituras" INTEGER NOT NULL DEFAULT 6,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfMedidor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfLeitura" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "medidorId" TEXT NOT NULL,
    "dataLeitura" TIMESTAMP(3) NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "consumo" DOUBLE PRECISION,
    "dias" INTEGER,
    "mediaDiaria" DOUBLE PRECISION,
    "desvioPct" DOUBLE PRECISION,
    "alerta" BOOLEAN NOT NULL DEFAULT false,
    "registradoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InfLeitura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfAcaoEficiencia" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'ENERGIA',
    "descricao" TEXT,
    "medidorId" TEXT,
    "economiaEstimadaPct" DOUBLE PRECISION,
    "custo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PLANEJADA',
    "prazo" TIMESTAMP(3),
    "responsavelUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfAcaoEficiencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfRequisitoCurso" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" "InfTipoRequisito" NOT NULL DEFAULT 'EQUIPAMENTO',
    "categoriaCodigo" TEXT,
    "spaceTipo" TEXT,
    "quantidadeMinima" INTEGER NOT NULL DEFAULT 1,
    "porVagas" INTEGER,
    "capacidadeMinima" INTEGER,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT true,
    "referenciaMec" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfRequisitoCurso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JorTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "nome" TEXT NOT NULL,
    "persona" "JorPersona" NOT NULL,
    "descricao" TEXT,
    "status" "JorTemplateStatus" NOT NULL DEFAULT 'RASCUNHO',
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "publicadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JorTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JorNo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo" "JorNoTipo" NOT NULL DEFAULT 'TAREFA',
    "papel" TEXT,
    "slaDias" INTEGER,
    "checklist" JSONB,
    "documentos" JSONB,
    "modulo" TEXT,
    "rota" TEXT,
    "evento" TEXT,
    "lembrete" JSONB,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "fase" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JorNo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JorTransicao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "deChave" TEXT NOT NULL,
    "paraChave" TEXT NOT NULL,
    "rotulo" TEXT,
    "condicao" JSONB,
    "prioridade" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JorTransicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JorInstancia" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateChave" TEXT NOT NULL,
    "templateVersao" INTEGER NOT NULL,
    "personType" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "personNome" TEXT,
    "status" "JorInstanciaStatus" NOT NULL DEFAULT 'ATIVA',
    "contexto" JSONB,
    "iniciadaPorId" TEXT,
    "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidaEm" TIMESTAMP(3),
    "canceladaEm" TIMESTAMP(3),
    "motivoCancelamento" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JorInstancia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JorEtapa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "instanciaId" TEXT NOT NULL,
    "noChave" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" "JorNoTipo" NOT NULL,
    "papel" TEXT,
    "fase" TEXT,
    "modulo" TEXT,
    "rota" TEXT,
    "evento" TEXT,
    "status" "JorEtapaStatus" NOT NULL DEFAULT 'ABERTA',
    "ciclo" INTEGER NOT NULL DEFAULT 1,
    "responsavelUserId" TEXT,
    "checklistEstado" JSONB,
    "checklistDef" JSONB,
    "documentosDef" JSONB,
    "decisao" TEXT,
    "justificativa" TEXT,
    "observacao" TEXT,
    "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prazoEm" TIMESTAMP(3),
    "concluidaEm" TIMESTAMP(3),
    "concluidaPorId" TEXT,
    "diasAtraso" INTEGER NOT NULL DEFAULT 0,
    "escalonadoNivel" INTEGER NOT NULL DEFAULT 0,
    "escalonadoEm" TIMESTAMP(3),
    "lembreteConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JorEtapa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JorHistorico" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "instanciaId" TEXT NOT NULL,
    "etapaId" TEXT,
    "acao" TEXT NOT NULL,
    "userId" TEXT,
    "detalhes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JorHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "maxPctEadPresencial" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "minPctPresencialSemi" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "maxPctEadSemi" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "minEncontrosPresenciaisEad" INTEGER NOT NULL DEFAULT 1,
    "minAvaliacoesPresenciaisEad" INTEGER NOT NULL DEFAULT 1,
    "alunosPorTutorEad" INTEGER NOT NULL DEFAULT 50,
    "alunosPorTutorSemi" INTEGER NOT NULL DEFAULT 80,
    "slaRespostaHoras" INTEGER NOT NULL DEFAULT 48,
    "slaUrgenteHoras" INTEGER NOT NULL DEFAULT 12,
    "diasInatividadeAtencao" INTEGER NOT NULL DEFAULT 7,
    "diasInatividadeCritico" INTEGER NOT NULL DEFAULT 14,
    "presencaMinimaLivePct" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "cargaMinimaLato" INTEGER NOT NULL DEFAULT 360,
    "prazoMaxMesesMestrado" INTEGER NOT NULL DEFAULT 24,
    "prazoMaxMesesDoutorado" INTEGER NOT NULL DEFAULT 48,
    "prazoMaxMesesLato" INTEGER NOT NULL DEFAULT 24,
    "maxOrientandosPorDocente" INTEGER NOT NULL DEFAULT 8,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModVerificacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "modalidade" "ModModalidade" NOT NULL,
    "conforme" BOOLEAN NOT NULL,
    "percentualEad" DOUBLE PRECISION NOT NULL,
    "resultado" JSONB NOT NULL,
    "executadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModVerificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModOferta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,
    "programId" TEXT,
    "termId" TEXT,
    "classSectionId" TEXT,
    "modalidade" "ModModalidade" NOT NULL,
    "cargaPresencial" INTEGER NOT NULL DEFAULT 0,
    "cargaOnline" INTEGER NOT NULL DEFAULT 0,
    "diasEncontro" JSONB,
    "minEncontros" INTEGER NOT NULL DEFAULT 0,
    "avaliacoesPresenciais" INTEGER NOT NULL DEFAULT 0,
    "poloId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModOferta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModEncontro" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ofertaId" TEXT NOT NULL,
    "tipo" "ModEncontroTipo" NOT NULL,
    "titulo" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "poloId" TEXT,
    "spaceId" TEXT,
    "calendarEventId" TEXT,
    "classSessionId" TEXT,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT true,
    "status" "ModEncontroStatus" NOT NULL DEFAULT 'AGENDADO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModEncontro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModAulaLive" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ofertaId" TEXT,
    "classSectionId" TEXT,
    "titulo" TEXT NOT NULL,
    "professorUserId" TEXT,
    "plataforma" TEXT NOT NULL DEFAULT 'OUTRA',
    "sala" TEXT,
    "linkUrl" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "gravacaoUrl" TEXT,
    "gravacaoDisponivelEm" TIMESTAMP(3),
    "presencaMinimaPct" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "status" "ModLiveStatus" NOT NULL DEFAULT 'AGENDADA',
    "iniciadaEm" TIMESTAMP(3),
    "encerradaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModAulaLive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModLiveEvento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "liveId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "em" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModLiveEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModLivePresenca" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "liveId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "minutos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percentual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "presente" BOOLEAN NOT NULL DEFAULT false,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModLivePresenca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModPolo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "spaceId" TEXT,
    "campusId" TEXT,
    "responsavelNome" TEXT,
    "responsavelEmail" TEXT,
    "responsavelTelefone" TEXT,
    "responsavelUserId" TEXT,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "statusCredenciamento" "ModPoloStatus" NOT NULL DEFAULT 'EM_CREDENCIAMENTO',
    "atoNumero" TEXT,
    "atoData" TIMESTAMP(3),
    "atoValidade" TIMESTAMP(3),
    "capacidade" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModPolo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModPoloChecklistItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "poloId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT true,
    "atendido" BOOLEAN NOT NULL DEFAULT false,
    "evidenciaUrl" TEXT,
    "observacao" TEXT,
    "verificadoEm" TIMESTAMP(3),
    "verificadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModPoloChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModPoloOferta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "poloId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "termId" TEXT,
    "vagas" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModPoloOferta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModPoloAluno" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "poloId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "programId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModPoloAluno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModTutor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "tipo" "ModTutorTipo" NOT NULL DEFAULT 'DISTANCIA',
    "poloId" TEXT,
    "capacidadeAlunos" INTEGER NOT NULL DEFAULT 50,
    "titulacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModTutor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModTutorAlocacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "classSectionId" TEXT,
    "poloId" TEXT,
    "programId" TEXT,
    "termId" TEXT,
    "alunosPrevistos" INTEGER NOT NULL DEFAULT 0,
    "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fim" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModTutorAlocacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModAtendimento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tutorId" TEXT,
    "classSectionId" TEXT,
    "canal" TEXT NOT NULL DEFAULT 'AVA',
    "assunto" TEXT NOT NULL,
    "prioridade" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" "ModAtendimentoStatus" NOT NULL DEFAULT 'ABERTO',
    "slaLimite" TIMESTAMP(3) NOT NULL,
    "primeiraRespostaEm" TIMESTAMP(3),
    "slaCumprido" BOOLEAN,
    "escalonadoEm" TIMESTAMP(3),
    "encerradoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModAtendimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModAtendimentoMensagem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "atendimentoId" TEXT NOT NULL,
    "autorTipo" TEXT NOT NULL,
    "autorId" TEXT,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModAtendimentoMensagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModTutorAvaliacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "atendimentoId" TEXT,
    "nota" INTEGER NOT NULL,
    "comentario" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModTutorAvaliacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModEngajamentoEvento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classSectionId" TEXT,
    "disciplineId" TEXT,
    "tipo" "ModEngajamentoTipo" NOT NULL,
    "duracaoSeg" INTEGER NOT NULL DEFAULT 0,
    "refType" TEXT,
    "refId" TEXT,
    "ocorridoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModEngajamentoEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModEngajamentoResumo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "ultimoAcesso" TIMESTAMP(3),
    "diasSemAcesso" INTEGER NOT NULL DEFAULT 0,
    "horas30d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "acessos30d" INTEGER NOT NULL DEFAULT 0,
    "tarefas30d" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "nivel" TEXT NOT NULL DEFAULT 'BAIXO',
    "fatores" JSONB,
    "calculadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModEngajamentoResumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModAlertaInatividade" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "nivel" TEXT NOT NULL,
    "diasSemAcesso" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "resolvidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModAlertaInatividade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModAgendaPratica" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "ModPraticaTipo" NOT NULL,
    "titulo" TEXT NOT NULL,
    "programId" TEXT,
    "classSectionId" TEXT,
    "classSessionId" TEXT,
    "poloId" TEXT,
    "spaceId" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "vagas" INTEGER NOT NULL DEFAULT 0,
    "supervisorNome" TEXT,
    "supervisorUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AGENDADA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModAgendaPratica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModPraticaInscricao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agendaId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INSCRITO',
    "horas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModPraticaInscricao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModEstagio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "programId" TEXT,
    "concedente" TEXT NOT NULL,
    "concedenteCnpj" TEXT,
    "supervisorNome" TEXT,
    "orientadorUserId" TEXT,
    "horasExigidas" DOUBLE PRECISION NOT NULL,
    "horasCumpridas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'EM_ANDAMENTO',
    "termoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModEstagio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModHoraPratica" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "estagioId" TEXT,
    "agendaId" TEXT,
    "studentId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "horas" DOUBLE PRECISION NOT NULL,
    "descricao" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "validadoPorId" TEXT,
    "validadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModHoraPratica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModPosPrograma" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nivel" "ModPosNivel" NOT NULL,
    "modalidade" "ModModalidade" NOT NULL DEFAULT 'PRESENCIAL',
    "programId" TEXT,
    "coordenadorUserId" TEXT,
    "coordenadorNome" TEXT,
    "cargaHoraria" INTEGER NOT NULL DEFAULT 0,
    "creditosMinimos" INTEGER NOT NULL DEFAULT 0,
    "prazoMaxMeses" INTEGER,
    "conceitoCapes" INTEGER,
    "portariaReconhecimento" TEXT,
    "areaAvaliacao" TEXT,
    "exigeTcc" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModPosPrograma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModPosArea" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "posId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModPosArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModPosLinha" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "posId" TEXT NOT NULL,
    "areaId" TEXT,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModPosLinha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModPosModulo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "posId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 1,
    "nome" TEXT NOT NULL,
    "cargaHoraria" INTEGER NOT NULL,
    "disciplineId" TEXT,
    "docenteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModPosModulo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModPosTurma" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "posId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3),
    "vagas" INTEGER NOT NULL DEFAULT 30,
    "valorMensalidade" DECIMAL(12,2),
    "parcelas" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PLANEJADA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModPosTurma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModPosDocente" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "posId" TEXT NOT NULL,
    "userId" TEXT,
    "nome" TEXT NOT NULL,
    "titulacao" TEXT NOT NULL DEFAULT 'DOUTOR',
    "categoria" TEXT NOT NULL DEFAULT 'PERMANENTE',
    "orientador" BOOLEAN NOT NULL DEFAULT false,
    "capacidadeOrientandos" INTEGER NOT NULL DEFAULT 8,
    "linhaId" TEXT,
    "lattes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModPosDocente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModPosDisciplina" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "posId" TEXT NOT NULL,
    "disciplineId" TEXT,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "creditos" INTEGER NOT NULL DEFAULT 4,
    "cargaHoraria" INTEGER NOT NULL DEFAULT 60,
    "obrigatoria" BOOLEAN NOT NULL DEFAULT false,
    "areaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModPosDisciplina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModPosColegiado" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "posId" TEXT NOT NULL,
    "userId" TEXT,
    "nome" TEXT NOT NULL,
    "papel" TEXT NOT NULL DEFAULT 'MEMBRO',
    "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fim" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModPosColegiado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModPosAluno" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "posId" TEXT NOT NULL,
    "turmaId" TEXT,
    "studentId" TEXT NOT NULL,
    "orientadorId" TEXT,
    "coorientadorId" TEXT,
    "linhaId" TEXT,
    "status" "ModPosAlunoStatus" NOT NULL DEFAULT 'MATRICULADO',
    "ingressoEm" TIMESTAMP(3) NOT NULL,
    "prazoQualificacao" TIMESTAMP(3),
    "prazoDefesa" TIMESTAMP(3),
    "prazoDeposito" TIMESTAMP(3),
    "qualificadoEm" TIMESTAMP(3),
    "defendidoEm" TIMESTAMP(3),
    "depositadoEm" TIMESTAMP(3),
    "tituladoEm" TIMESTAMP(3),
    "creditosCumpridos" INTEGER NOT NULL DEFAULT 0,
    "cargaCumprida" INTEGER NOT NULL DEFAULT 0,
    "tccTitulo" TEXT,
    "tccStatus" TEXT NOT NULL DEFAULT 'NAO_INICIADO',
    "certificadoEmitidoEm" TIMESTAMP(3),
    "certificadoCodigo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModPosAluno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModPosBanca" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "local" TEXT,
    "membros" JSONB,
    "resultado" TEXT,
    "nota" DOUBLE PRECISION,
    "ataUrl" TEXT,
    "realizada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModPosBanca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModPosBolsa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "agencia" TEXT NOT NULL,
    "modalidadeBolsa" TEXT,
    "valorMensal" DECIMAL(12,2) NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATIVA',
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModPosBolsa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModPosOferta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "posId" TEXT NOT NULL,
    "turmaId" TEXT,
    "titulo" TEXT NOT NULL,
    "vagas" INTEGER NOT NULL,
    "valor" DECIMAL(12,2),
    "inscricoesDe" TIMESTAMP(3),
    "inscricoesAte" TIMESTAMP(3),
    "requisitos" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "admOfertaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModPosOferta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NtRegraAvaliacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "escopo" "NtEscopoRegra" NOT NULL DEFAULT 'TENANT',
    "programId" TEXT,
    "classSectionId" TEXT,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "regraMedia" "NtRegraMedia" NOT NULL DEFAULT 'PONDERADA',
    "notaMaxima" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "mediaAprovacao" DOUBLE PRECISION NOT NULL DEFAULT 7,
    "mediaMinimaRecuperacao" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "recuperacao" "NtRegraRecuperacao" NOT NULL DEFAULT 'SUBSTITUI_MENOR',
    "exame" "NtRegraExame" NOT NULL DEFAULT 'MEDIA_PONDERADA',
    "pesoParcial" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "pesoExame" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "mediaAprovacaoExame" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "frequenciaMinima" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "abonaJustificadas" BOOLEAN NOT NULL DEFAULT true,
    "arredondamento" TEXT NOT NULL DEFAULT 'UM_DECIMAL',
    "diasRevisao" INTEGER NOT NULL DEFAULT 7,
    "componentes" JSONB,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NtRegraAvaliacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NtComponente" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "NtTipoComponente" NOT NULL DEFAULT 'AVALIACAO',
    "peso" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "notaMaxima" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT true,
    "dataPrevista" TIMESTAMP(3),
    "assessmentId" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NtComponente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NtLancamento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "componenteId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "valor" DOUBLE PRECISION,
    "ausente" BOOLEAN NOT NULL DEFAULT false,
    "observacao" TEXT,
    "origem" "NtOrigemNota" NOT NULL DEFAULT 'MANUAL',
    "attemptId" TEXT,
    "lancadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NtLancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NtLancamentoHistorico" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "componenteId" TEXT NOT NULL,
    "valorAnterior" DOUBLE PRECISION,
    "valorNovo" DOUBLE PRECISION,
    "ausenteAnterior" BOOLEAN,
    "ausenteNovo" BOOLEAN,
    "origem" "NtOrigemNota" NOT NULL,
    "motivo" TEXT,
    "usuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NtLancamentoHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NtDiario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "status" "NtStatusDiario" NOT NULL DEFAULT 'ABERTO',
    "regraId" TEXT,
    "regraSnapshot" JSONB,
    "prazoLancamento" TIMESTAMP(3),
    "fechadoEm" TIMESTAMP(3),
    "fechadoPorId" TEXT,
    "fechamentoObs" TEXT,
    "reabertoEm" TIMESTAMP(3),
    "reabertoPorId" TEXT,
    "reaberturaMotivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NtDiario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NtResultado" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "enrollmentId" TEXT,
    "disciplineId" TEXT,
    "termId" TEXT,
    "mediaParcial" DOUBLE PRECISION,
    "notaRecuperacao" DOUBLE PRECISION,
    "notaExame" DOUBLE PRECISION,
    "mediaFinal" DOUBLE PRECISION,
    "frequenciaPct" DOUBLE PRECISION,
    "aulasTotal" INTEGER NOT NULL DEFAULT 0,
    "faltas" INTEGER NOT NULL DEFAULT 0,
    "situacao" "NtSituacao" NOT NULL DEFAULT 'EM_CURSO',
    "pendencias" INTEGER NOT NULL DEFAULT 0,
    "encerrado" BOOLEAN NOT NULL DEFAULT false,
    "calculadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NtResultado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NtRevisao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "componenteId" TEXT NOT NULL,
    "lancamentoId" TEXT,
    "notaOriginal" DOUBLE PRECISION,
    "justificativa" TEXT NOT NULL,
    "status" "NtStatusRevisao" NOT NULL DEFAULT 'SOLICITADA',
    "parecer" TEXT,
    "parecerNotaSugerida" DOUBLE PRECISION,
    "parecerPorId" TEXT,
    "parecerEm" TIMESTAMP(3),
    "decisao" TEXT,
    "notaNova" DOUBLE PRECISION,
    "decididoPorId" TEXT,
    "decididoEm" TIMESTAMP(3),
    "prazoParecer" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NtRevisao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesPublicacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "PesTipoPublicacao" NOT NULL,
    "titulo" TEXT NOT NULL,
    "resumo" TEXT,
    "palavrasChave" TEXT[],
    "ano" INTEGER NOT NULL,
    "dataPublicacao" TIMESTAMP(3),
    "veiculo" TEXT,
    "issn" TEXT,
    "isbn" TEXT,
    "volume" TEXT,
    "numero" TEXT,
    "paginas" TEXT,
    "doi" TEXT,
    "url" TEXT,
    "idioma" TEXT,
    "qualis" TEXT,
    "jcr" DOUBLE PRECISION,
    "citeScore" DOUBLE PRECISION,
    "numeroRegistro" TEXT,
    "citacoes" INTEGER NOT NULL DEFAULT 0,
    "programId" TEXT,
    "grupoId" TEXT,
    "projetoId" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'MANUAL',
    "hashDedupe" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesPublicacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesPublicacaoAutor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "publicacaoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 1,
    "tipo" "PesTipoPessoa" NOT NULL DEFAULT 'EXTERNO',
    "nome" TEXT NOT NULL,
    "userId" TEXT,
    "studentId" TEXT,
    "orcid" TEXT,
    "lattes" TEXT,
    "instituicao" TEXT,
    "correspondente" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PesPublicacaoAutor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesGrupo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "sigla" TEXT,
    "areaConhecimento" TEXT,
    "descricao" TEXT,
    "liderUserId" TEXT,
    "liderNome" TEXT,
    "viceLiderUserId" TEXT,
    "viceLiderNome" TEXT,
    "programId" TEXT,
    "diretorioCnpqId" TEXT,
    "dataCriacao" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesGrupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesGrupoLinha" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesGrupoLinha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesGrupoMembro" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "tipo" "PesTipoPessoa" NOT NULL DEFAULT 'DOCENTE',
    "userId" TEXT,
    "studentId" TEXT,
    "nome" TEXT NOT NULL,
    "papel" TEXT NOT NULL DEFAULT 'PESQUISADOR',
    "lattes" TEXT,
    "orcid" TEXT,
    "dataEntrada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataSaida" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesGrupoMembro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesProjeto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" "PesTipoProjeto" NOT NULL DEFAULT 'PESQUISA',
    "status" "PesStatusProjeto" NOT NULL DEFAULT 'RASCUNHO',
    "resumo" TEXT,
    "justificativa" TEXT,
    "objetivos" TEXT,
    "metodologia" TEXT,
    "areaConhecimento" TEXT,
    "palavrasChave" TEXT[],
    "grupoId" TEXT,
    "linhaId" TEXT,
    "programId" TEXT,
    "editalId" TEXT,
    "coordenadorUserId" TEXT,
    "coordenadorNome" TEXT,
    "fomento" TEXT,
    "orcamentoTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dataInicio" TIMESTAMP(3),
    "dataFim" TIMESTAMP(3),
    "eticaNecessaria" BOOLEAN NOT NULL DEFAULT false,
    "cepProtocolo" TEXT,
    "cepStatus" TEXT NOT NULL DEFAULT 'NAO_APLICAVEL',
    "motivoStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesProjeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesProjetoMembro" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "tipo" "PesTipoPessoa" NOT NULL DEFAULT 'ALUNO',
    "userId" TEXT,
    "studentId" TEXT,
    "nome" TEXT NOT NULL,
    "papel" TEXT NOT NULL DEFAULT 'BOLSISTA',
    "cargaHorariaSemanal" INTEGER,
    "dataInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataFim" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesProjetoMembro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesProjetoEtapa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 1,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "inicioPrevisto" TIMESTAMP(3) NOT NULL,
    "fimPrevisto" TIMESTAMP(3) NOT NULL,
    "inicioReal" TIMESTAMP(3),
    "fimReal" TIMESTAMP(3),
    "percentual" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PLANEJADA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesProjetoEtapa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesProjetoRubrica" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valorPrevisto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesProjetoRubrica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesProjetoLancamento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "rubricaId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "documento" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PesProjetoLancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesProjetoEntregavel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'RELATORIO',
    "prazo" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "entregueEm" TIMESTAMP(3),
    "url" TEXT,
    "publicacaoId" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesProjetoEntregavel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesProjetoRelatorio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'PARCIAL',
    "referencia" TEXT,
    "prazo" TIMESTAMP(3) NOT NULL,
    "status" "PesStatusRelatorio" NOT NULL DEFAULT 'PENDENTE',
    "conteudo" TEXT,
    "entregueEm" TIMESTAMP(3),
    "avaliadorUserId" TEXT,
    "parecer" TEXT,
    "nota" DOUBLE PRECISION,
    "avaliadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesProjetoRelatorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesEdital" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" "PesTipoProjeto" NOT NULL DEFAULT 'PIBIC',
    "descricao" TEXT,
    "requisitos" TEXT,
    "status" "PesStatusEdital" NOT NULL DEFAULT 'RASCUNHO',
    "dataAbertura" TIMESTAMP(3) NOT NULL,
    "dataFechamento" TIMESTAMP(3) NOT NULL,
    "dataResultado" TIMESTAMP(3),
    "vagas" INTEGER NOT NULL DEFAULT 0,
    "vagasSuplentes" INTEGER NOT NULL DEFAULT 0,
    "valorBolsa" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "duracaoMeses" INTEGER NOT NULL DEFAULT 12,
    "notaMinima" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "criterios" JSONB,
    "publicadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesEdital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesEditalInscricao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "editalId" TEXT NOT NULL,
    "projetoId" TEXT,
    "proponenteUserId" TEXT,
    "proponenteNome" TEXT NOT NULL,
    "bolsistaStudentId" TEXT,
    "bolsistaNome" TEXT,
    "titulo" TEXT NOT NULL,
    "resumo" TEXT,
    "status" "PesStatusInscricao" NOT NULL DEFAULT 'INSCRITA',
    "notaFinal" DOUBLE PRECISION,
    "classificacao" INTEGER,
    "justificativa" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesEditalInscricao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesEditalAvaliacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inscricaoId" TEXT NOT NULL,
    "avaliadorUserId" TEXT NOT NULL,
    "avaliadorNome" TEXT,
    "prazo" TIMESTAMP(3),
    "concluida" BOOLEAN NOT NULL DEFAULT false,
    "notas" JSONB,
    "notaTotal" DOUBLE PRECISION,
    "parecer" TEXT,
    "concluidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesEditalAvaliacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesBolsa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projetoId" TEXT,
    "editalId" TEXT,
    "inscricaoId" TEXT,
    "studentId" TEXT,
    "userId" TEXT,
    "bolsistaNome" TEXT NOT NULL,
    "orientadorUserId" TEXT,
    "modalidade" TEXT NOT NULL DEFAULT 'PIBIC',
    "agencia" TEXT NOT NULL DEFAULT 'INSTITUCIONAL',
    "valorMensal" DECIMAL(12,2) NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "status" "PesStatusBolsa" NOT NULL DEFAULT 'ATIVA',
    "motivoStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesBolsa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesBolsaPagamento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bolsaId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREVISTO',
    "pagoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesBolsaPagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesTrabalho" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "PesTipoTrabalho" NOT NULL DEFAULT 'TCC',
    "titulo" TEXT NOT NULL,
    "tema" TEXT,
    "resumo" TEXT,
    "abstract" TEXT,
    "palavrasChave" TEXT[],
    "studentId" TEXT NOT NULL,
    "alunoNome" TEXT NOT NULL,
    "programId" TEXT,
    "orientadorUserId" TEXT,
    "orientadorNome" TEXT,
    "coorientadorNome" TEXT,
    "projetoId" TEXT,
    "grupoId" TEXT,
    "status" "PesStatusTrabalho" NOT NULL DEFAULT 'TEMA',
    "prazoQualificacao" TIMESTAMP(3),
    "dataQualificacao" TIMESTAMP(3),
    "prazoDefesa" TIMESTAMP(3),
    "dataDefesa" TIMESTAMP(3),
    "localDefesa" TEXT,
    "modoDefesa" TEXT NOT NULL DEFAULT 'PRESENCIAL',
    "linkSala" TEXT,
    "notaFinal" DOUBLE PRECISION,
    "resultado" TEXT,
    "ressalvas" TEXT,
    "prazoVersaoFinal" TIMESTAMP(3),
    "prazoDeposito" TIMESTAMP(3),
    "similaridadePct" DOUBLE PRECISION,
    "similaridadeLimite" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "similaridadeStatus" TEXT NOT NULL DEFAULT 'NAO_VERIFICADA',
    "similaridadeFonte" TEXT,
    "similaridadeObs" TEXT,
    "repositorioUrl" TEXT,
    "repositorioHandle" TEXT,
    "autorizaPublicacao" BOOLEAN NOT NULL DEFAULT false,
    "embargoAte" TIMESTAMP(3),
    "ataNumero" TEXT,
    "depositadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesTrabalho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesTrabalhoBanca" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "trabalhoId" TEXT NOT NULL,
    "fase" TEXT NOT NULL DEFAULT 'DEFESA',
    "userId" TEXT,
    "nome" TEXT NOT NULL,
    "instituicao" TEXT,
    "titulacao" TEXT,
    "papel" TEXT NOT NULL DEFAULT 'EXAMINADOR_INTERNO',
    "email" TEXT,
    "convite" TEXT NOT NULL DEFAULT 'PENDENTE',
    "nota" DOUBLE PRECISION,
    "parecer" TEXT,
    "assinouEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesTrabalhoBanca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesTrabalhoVersao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "trabalhoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'PROJETO',
    "arquivoUrl" TEXT,
    "texto" TEXT,
    "hashTexto" TEXT,
    "similaridadePct" DOUBLE PRECISION,
    "observacoes" TEXT,
    "enviadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PesTrabalhoVersao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesTrabalhoEvento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "trabalhoId" TEXT NOT NULL,
    "de" TEXT,
    "para" TEXT NOT NULL,
    "userId" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PesTrabalhoEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesTrabalhoOrientacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "trabalhoId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "duracaoMin" INTEGER,
    "resumo" TEXT NOT NULL,
    "encaminhamentos" TEXT,
    "registradoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PesTrabalhoOrientacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesPeriodico" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "sigla" TEXT,
    "issn" TEXT,
    "eissn" TEXT,
    "area" TEXT,
    "linhaEditorial" TEXT,
    "escopo" TEXT,
    "normas" TEXT,
    "politicaAcessoAberto" BOOLEAN NOT NULL DEFAULT true,
    "licenca" TEXT NOT NULL DEFAULT 'CC BY 4.0',
    "doiPrefixo" TEXT,
    "editorChefeUserId" TEXT,
    "editorChefeNome" TEXT,
    "emailContato" TEXT,
    "duploCego" BOOLEAN NOT NULL DEFAULT true,
    "revisoresPorSubmissao" INTEGER NOT NULL DEFAULT 2,
    "prazoRevisaoDias" INTEGER NOT NULL DEFAULT 30,
    "prazoAutorDias" INTEGER NOT NULL DEFAULT 30,
    "periodicidade" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesPeriodico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesPeriodicoEquipe" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodicoId" TEXT NOT NULL,
    "userId" TEXT,
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "papel" TEXT NOT NULL DEFAULT 'PARECERISTA',
    "areas" TEXT[],
    "instituicao" TEXT,
    "orcid" TEXT,
    "lattes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesPeriodicoEquipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesEdicao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodicoId" TEXT NOT NULL,
    "volume" INTEGER NOT NULL,
    "numero" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "titulo" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'REGULAR',
    "status" TEXT NOT NULL DEFAULT 'PLANEJADA',
    "editorial" TEXT,
    "capaUrl" TEXT,
    "doi" TEXT,
    "dataPublicacao" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesEdicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesSecao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodicoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 1,
    "revisadaPorPares" BOOLEAN NOT NULL DEFAULT true,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesSecao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesSubmissao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodicoId" TEXT NOT NULL,
    "edicaoId" TEXT,
    "secaoId" TEXT,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "resumo" TEXT,
    "abstract" TEXT,
    "palavrasChave" TEXT[],
    "idioma" TEXT NOT NULL DEFAULT 'pt-BR',
    "autores" JSONB,
    "submissorUserId" TEXT,
    "submissorStudentId" TEXT,
    "status" "PesStatusSubmissao" NOT NULL DEFAULT 'SUBMETIDO',
    "rodada" INTEGER NOT NULL DEFAULT 1,
    "versaoAtual" INTEGER NOT NULL DEFAULT 1,
    "editorUserId" TEXT,
    "declaracaoOriginalidade" BOOLEAN NOT NULL DEFAULT false,
    "conflitoInteresse" TEXT,
    "financiamento" TEXT,
    "dataSubmissao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataTriagem" TIMESTAMP(3),
    "dataDecisao" TIMESTAMP(3),
    "prazoAutorAte" TIMESTAMP(3),
    "motivoRejeicao" TEXT,
    "triagemObs" TEXT,
    "similaridadePct" DOUBLE PRECISION,
    "doi" TEXT,
    "paginaInicial" INTEGER,
    "paginaFinal" INTEGER,
    "ordemNaEdicao" INTEGER,
    "dataPublicacao" TIMESTAMP(3),
    "publicacaoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesSubmissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesSubmissaoVersao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "submissaoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "rodada" INTEGER NOT NULL DEFAULT 1,
    "tipo" TEXT NOT NULL DEFAULT 'ORIGINAL',
    "arquivoUrl" TEXT,
    "resumoAlteracoes" TEXT,
    "cartaResposta" TEXT,
    "enviadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PesSubmissaoVersao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesRevisao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "submissaoId" TEXT NOT NULL,
    "rodada" INTEGER NOT NULL DEFAULT 1,
    "equipeId" TEXT,
    "revisorUserId" TEXT,
    "revisorNome" TEXT NOT NULL,
    "revisorEmail" TEXT,
    "token" TEXT NOT NULL,
    "status" "PesStatusRevisao" NOT NULL DEFAULT 'CONVIDADO',
    "convidadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondidoEm" TIMESTAMP(3),
    "prazo" TIMESTAMP(3) NOT NULL,
    "concluidoEm" TIMESTAMP(3),
    "recomendacao" "PesRecomendacao",
    "notas" JSONB,
    "notaMedia" DOUBLE PRECISION,
    "comentarioAutor" TEXT,
    "comentarioEditor" TEXT,
    "semConflito" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesRevisao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesDecisao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "submissaoId" TEXT NOT NULL,
    "rodada" INTEGER NOT NULL,
    "decisao" TEXT NOT NULL,
    "editorUserId" TEXT,
    "justificativa" TEXT,
    "cartaAutor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PesDecisao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesEvento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'SEMANA_ACADEMICA',
    "descricao" TEXT,
    "local" TEXT,
    "modalidade" TEXT NOT NULL DEFAULT 'PRESENCIAL',
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "status" "PesStatusEvento" NOT NULL DEFAULT 'RASCUNHO',
    "prazoSubmissao" TIMESTAMP(3),
    "prazoAvaliacao" TIMESTAMP(3),
    "prazoResultado" TIMESTAMP(3),
    "prazoCameraReady" TIMESTAMP(3),
    "trilhas" JSONB,
    "avaliadoresPorTrabalho" INTEGER NOT NULL DEFAULT 2,
    "notaMinimaAprovacao" DOUBLE PRECISION NOT NULL DEFAULT 6,
    "anaisIsbn" TEXT,
    "anaisUrl" TEXT,
    "anaisPublicadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesEventoTrabalho" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "resumo" TEXT,
    "palavrasChave" TEXT[],
    "trilha" TEXT,
    "formatoApresentacao" TEXT NOT NULL DEFAULT 'ORAL',
    "autores" JSONB,
    "apresentadorNome" TEXT,
    "submissorUserId" TEXT,
    "submissorStudentId" TEXT,
    "status" "PesStatusEventoTrabalho" NOT NULL DEFAULT 'SUBMETIDO',
    "notaMedia" DOUBLE PRECISION,
    "arquivoUrl" TEXT,
    "cameraReadyUrl" TEXT,
    "sessao" TEXT,
    "dataApresentacao" TIMESTAMP(3),
    "ordemAnais" INTEGER,
    "paginasAnais" TEXT,
    "publicacaoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesEventoTrabalho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PesEventoAvaliacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "trabalhoId" TEXT NOT NULL,
    "avaliadorUserId" TEXT NOT NULL,
    "avaliadorNome" TEXT,
    "prazo" TIMESTAMP(3),
    "concluida" BOOLEAN NOT NULL DEFAULT false,
    "nota" DOUBLE PRECISION,
    "recomendacao" TEXT,
    "parecer" TEXT,
    "concluidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesEventoAvaliacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegProcesso" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "RegTipoProcesso" NOT NULL,
    "etapa" "RegEtapa" NOT NULL DEFAULT 'PREPARACAO',
    "resultado" "RegResultado" NOT NULL DEFAULT 'PENDENTE',
    "titulo" TEXT NOT NULL,
    "programId" TEXT,
    "cursoNome" TEXT,
    "protocoloEmec" TEXT,
    "numeroProcesso" TEXT,
    "responsavelId" TEXT,
    "vagasSolicitadas" INTEGER,
    "enderecoNovo" TEXT,
    "conceitoObtido" INTEGER,
    "protocoladoEm" TIMESTAMP(3),
    "prazoProtocolo" TIMESTAMP(3),
    "avaliacaoPrevistaEm" TIMESTAMP(3),
    "decisaoPrevistaEm" TIMESTAMP(3),
    "publicadoEm" TIMESTAMP(3),
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegProcesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegProcessoHistorico" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "etapaDe" "RegEtapa",
    "etapaPara" "RegEtapa" NOT NULL,
    "userId" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegProcessoHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegDiligencia" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "exigencias" JSONB,
    "recebidaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prazoResposta" TIMESTAMP(3) NOT NULL,
    "status" "RegDiligenciaStatus" NOT NULL DEFAULT 'ABERTA',
    "responsavelId" TEXT,
    "resposta" TEXT,
    "respondidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegDiligencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegAto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "RegTipoAto" NOT NULL,
    "numero" TEXT NOT NULL,
    "orgao" TEXT NOT NULL DEFAULT 'MEC',
    "dataPublicacao" TIMESTAMP(3) NOT NULL,
    "referenciaDou" TEXT,
    "programId" TEXT,
    "cursoNome" TEXT,
    "escopo" TEXT NOT NULL DEFAULT 'CURSO',
    "processoId" TEXT,
    "vigenciaInicio" TIMESTAMP(3),
    "vencimento" TIMESTAMP(3),
    "vagasAutorizadas" INTEGER,
    "cicloAvaliativoAnos" INTEGER,
    "conceito" INTEGER,
    "revogado" BOOLEAN NOT NULL DEFAULT false,
    "anexos" JSONB,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegAto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegChecklistModelo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipoProcesso" "RegTipoProcesso",
    "instrumento" "RegInstrumento" NOT NULL DEFAULT 'DOCUMENTAL',
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegChecklistModelo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegChecklistModeloItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "dimensao" "RegDimensao" NOT NULL DEFAULT 'DOCUMENTAL',
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT true,
    "peso" INTEGER NOT NULL DEFAULT 1,
    "prazoDias" INTEGER,
    "responsavelRole" TEXT,

    CONSTRAINT "RegChecklistModeloItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegChecklist" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "modeloId" TEXT,
    "instrumento" "RegInstrumento" NOT NULL DEFAULT 'DOCUMENTAL',
    "processoId" TEXT,
    "programId" TEXT,
    "prontidao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prazo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegChecklistItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "dimensao" "RegDimensao" NOT NULL DEFAULT 'DOCUMENTAL',
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT true,
    "peso" INTEGER NOT NULL DEFAULT 1,
    "status" "RegItemStatus" NOT NULL DEFAULT 'PENDENTE',
    "responsavelId" TEXT,
    "prazo" TIMESTAMP(3),
    "evidenciaUrl" TEXT,
    "evidenciaTexto" TEXT,
    "evidencias" JSONB,
    "conferenciaIA" JSONB,
    "concluidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegIndicador" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "instrumento" "RegInstrumento" NOT NULL,
    "dimensao" "RegDimensao" NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "programId" TEXT,
    "conceito" INTEGER,
    "justificativa" TEXT,
    "planoMelhoria" TEXT,
    "responsavelId" TEXT,
    "prazoMelhoria" TIMESTAMP(3),
    "avaliadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegIndicador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegSimulacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "programId" TEXT,
    "rotulo" TEXT,
    "entrada" JSONB NOT NULL,
    "resultado" JSONB NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegSimulacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegAnaliseDocumento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipoDocumento" TEXT NOT NULL,
    "titulo" TEXT,
    "processoId" TEXT,
    "texto" TEXT NOT NULL,
    "modo" TEXT NOT NULL DEFAULT 'MANUAL',
    "resumo" TEXT,
    "prazos" JSONB,
    "exigencias" JSONB,
    "tarefasCriadas" JSONB,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegAnaliseDocumento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReiObjetivo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "ciclo" TEXT NOT NULL,
    "nivel" TEXT NOT NULL DEFAULT 'INSTITUCIONAL',
    "programId" TEXT,
    "area" TEXT,
    "responsavelUserId" TEXT,
    "responsavelNome" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "status" "ReiStatusObjetivo" NOT NULL DEFAULT 'RASCUNHO',
    "progresso" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ativadoEm" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReiObjetivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReiResultadoChave" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "objetivoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "unidade" TEXT,
    "sentido" "ReiSentido" NOT NULL DEFAULT 'MAIOR_MELHOR',
    "valorInicial" DOUBLE PRECISION NOT NULL,
    "valorMeta" DOUBLE PRECISION NOT NULL,
    "valorAtual" DOUBLE PRECISION NOT NULL,
    "fonte" "ReiFonteResultado" NOT NULL DEFAULT 'MANUAL',
    "indicadorChave" TEXT,
    "responsavelUserId" TEXT,
    "peso" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "progresso" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confianca" "ReiConfianca" NOT NULL DEFAULT 'VERDE',
    "checkinFrequenciaDias" INTEGER NOT NULL DEFAULT 14,
    "proximoCheckinEm" TIMESTAMP(3),
    "ultimoCheckinEm" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReiResultadoChave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReiCheckin" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "resultadoId" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "valorAnterior" DOUBLE PRECISION,
    "confianca" "ReiConfianca" NOT NULL DEFAULT 'VERDE',
    "comentario" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'MANUAL',
    "autorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReiCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReiSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "dia" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "semaforo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReiSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReiRelatorio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "periodo" TEXT,
    "perfil" TEXT NOT NULL DEFAULT 'reitoria',
    "geradoPorId" TEXT,
    "dados" JSONB NOT NULL,
    "html" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReiRelatorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReiConsultaIA" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "perfil" TEXT,
    "pergunta" TEXT NOT NULL,
    "resposta" TEXT NOT NULL,
    "modo" TEXT NOT NULL,
    "indicadoresCitados" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReiConsultaIA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecContador" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecContador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecTipoRequerimento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "categoria" TEXT NOT NULL DEFAULT 'GERAL',
    "slaDias" INTEGER NOT NULL DEFAULT 5,
    "taxa" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "geraDocumento" TEXT,
    "abertoPeloAluno" BOOLEAN NOT NULL DEFAULT true,
    "exigeAnexo" BOOLEAN NOT NULL DEFAULT false,
    "checklistModeloId" TEXT,
    "prazoReenvioDias" INTEGER NOT NULL DEFAULT 15,
    "responsavelRole" TEXT NOT NULL DEFAULT 'SECRETARY',
    "camposExtras" JSONB,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecTipoRequerimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecProtocolo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "tipoId" TEXT NOT NULL,
    "studentId" TEXT,
    "enrollmentId" TEXT,
    "solicitanteNome" TEXT,
    "assunto" TEXT NOT NULL,
    "descricao" TEXT,
    "status" "SecProtocoloStatus" NOT NULL DEFAULT 'ABERTO',
    "prioridade" TEXT NOT NULL DEFAULT 'NORMAL',
    "canal" TEXT NOT NULL DEFAULT 'PORTAL',
    "abertoPorId" TEXT,
    "responsavelId" TEXT,
    "slaDias" INTEGER NOT NULL DEFAULT 5,
    "prazoEm" TIMESTAMP(3) NOT NULL,
    "pendenteDesde" TIMESTAMP(3),
    "taxaValor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxaStatus" "SecTaxaStatus" NOT NULL DEFAULT 'ISENTA',
    "receivableId" TEXT,
    "decisao" TEXT,
    "decisaoMotivo" TEXT,
    "decididoEm" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),
    "escalonadoEm" TIMESTAMP(3),
    "dados" JSONB,
    "documentoCodigo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecProtocolo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecTramite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "protocoloId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "deStatus" TEXT,
    "paraStatus" TEXT,
    "usuarioId" TEXT,
    "usuarioNome" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'SECRETARIA',
    "parecer" TEXT,
    "visivelAluno" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecTramite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecAnexo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "protocoloId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "mime" TEXT,
    "tamanho" INTEGER,
    "url" TEXT,
    "dataUrl" TEXT,
    "descricao" TEXT,
    "enviadoPorId" TEXT,
    "enviadoPorAluno" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecAnexo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecChecklistModelo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "processo" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecChecklistModelo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecChecklistItemModelo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT true,
    "validadeDias" INTEGER,
    "requisitos" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecChecklistItemModelo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecConferencia" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "modeloId" TEXT,
    "processo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "protocoloId" TEXT,
    "studentId" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "status" "SecConferenciaStatus" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "concluidaEm" TIMESTAMP(3),
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecConferencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecConferenciaItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conferenciaId" TEXT NOT NULL,
    "itemModeloId" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "titulo" TEXT NOT NULL,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT true,
    "validadeDias" INTEGER,
    "requisitos" TEXT,
    "status" "SecItemStatus" NOT NULL DEFAULT 'PENDENTE',
    "motivo" TEXT,
    "anexoId" TEXT,
    "arquivoNome" TEXT,
    "arquivoUrl" TEXT,
    "arquivoDataUrl" TEXT,
    "documentoTexto" TEXT,
    "dataDocumento" TIMESTAMP(3),
    "analiseIa" JSONB,
    "analisadoPorId" TEXT,
    "analisadoEm" TIMESTAMP(3),
    "reenvioSolicitadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecConferenciaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecDocumentoEmitido" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "studentId" TEXT,
    "protocoloId" TEXT,
    "codigo" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "validoAte" TIMESTAMP(3),
    "emitidoPorId" TEXT,
    "cancelado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecDocumentoEmitido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecCertModelo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL DEFAULT 'CERTIFICADO',
    "texto" TEXT NOT NULL,
    "htmlCustom" TEXT,
    "orientacao" TEXT NOT NULL DEFAULT 'landscape',
    "assinaturas" JSONB,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecCertModelo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecCertLote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecCertLote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecCertificado" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    "loteId" TEXT,
    "numero" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "status" "SecCertificadoStatus" NOT NULL DEFAULT 'EMITIDO',
    "destinatarioNome" TEXT NOT NULL,
    "destinatarioDoc" TEXT,
    "studentId" TEXT,
    "tituloEvento" TEXT NOT NULL,
    "cargaHoraria" INTEGER,
    "periodo" TEXT,
    "dados" JSONB,
    "html" TEXT NOT NULL,
    "emitidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emitidoPorId" TEXT,
    "revogadoEm" TIMESTAMP(3),
    "revogadoPorId" TEXT,
    "motivoRevogacao" TEXT,
    "substituidoPorId" TEXT,
    "certificateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecCertificado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecLivro" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "folhaAtual" INTEGER NOT NULL DEFAULT 1,
    "registrosPorFolha" INTEGER NOT NULL DEFAULT 2,
    "proximoRegistro" INTEGER NOT NULL DEFAULT 1,
    "aberto" BOOLEAN NOT NULL DEFAULT true,
    "abertoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "encerradoEm" TIMESTAMP(3),
    "termoAbertura" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecLivro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecAta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "livroId" TEXT,
    "numero" INTEGER,
    "tipo" TEXT NOT NULL DEFAULT 'GERAL',
    "titulo" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "conteudo" TEXT NOT NULL,
    "participantes" JSONB,
    "colacaoId" TEXT,
    "assinadaEm" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecAta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecDiploma" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "programId" TEXT,
    "enrollmentId" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'DIPLOMA',
    "status" "SecDiplomaStatus" NOT NULL DEFAULT 'SOLICITADO',
    "solicitadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conferenciaId" TEXT,
    "colacaoId" TEXT,
    "livroId" TEXT,
    "numeroRegistro" INTEGER,
    "folha" INTEGER,
    "dataRegistro" TIMESTAMP(3),
    "dataConclusao" TIMESTAMP(3),
    "dataColacao" TIMESTAMP(3),
    "entregueEm" TIMESTAMP(3),
    "retiradoPor" TEXT,
    "retiradoDoc" TEXT,
    "pendencias" JSONB,
    "observacoes" TEXT,
    "protocoloId" TEXT,
    "codigoVerificacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecDiploma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecColacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "local" TEXT,
    "programId" TEXT,
    "termId" TEXT,
    "status" "SecColacaoStatus" NOT NULL DEFAULT 'PLANEJADA',
    "prazoInscricaoEm" TIMESTAMP(3),
    "observacoes" TEXT,
    "ataId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecColacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecColacaoFormando" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "colacaoId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "status" "SecFormandoStatus" NOT NULL DEFAULT 'INSCRITO',
    "pendencias" JSONB,
    "juramento" BOOLEAN NOT NULL DEFAULT true,
    "diplomaId" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecColacaoFormando_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecTemporalidade" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipoDocumento" TEXT NOT NULL,
    "descricao" TEXT,
    "prazoCorrenteAnos" INTEGER NOT NULL DEFAULT 5,
    "prazoIntermediarioAnos" INTEGER NOT NULL DEFAULT 0,
    "destinacao" TEXT NOT NULL DEFAULT 'ELIMINACAO',
    "fundamento" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecTemporalidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecArquivoItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "temporalidadeId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "studentId" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "predio" TEXT,
    "sala" TEXT,
    "estante" TEXT,
    "caixa" TEXT,
    "pasta" TEXT,
    "urlDigital" TEXT,
    "dataDocumento" TIMESTAMP(3),
    "dataEncerramento" TIMESTAMP(3) NOT NULL,
    "eliminarApos" TIMESTAMP(3),
    "status" "SecArquivoStatus" NOT NULL DEFAULT 'ATIVO',
    "suspensoMotivo" TEXT,
    "descarteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecArquivoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecDescarte" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "justificativa" TEXT,
    "status" "SecDescarteStatus" NOT NULL DEFAULT 'RASCUNHO',
    "itemIds" JSONB NOT NULL,
    "solicitadoPorId" TEXT,
    "aprovadoPorId" TEXT,
    "aprovadoEm" TIMESTAMP(3),
    "motivoRejeicao" TEXT,
    "executadoEm" TIMESTAMP(3),
    "termoHtml" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecDescarte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupFornecedor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpj" TEXT,
    "inscricaoEstadual" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "contato" TEXT,
    "endereco" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "categorias" TEXT[],
    "prazoPagamentoDias" INTEGER NOT NULL DEFAULT 30,
    "banco" TEXT,
    "chavePix" TEXT,
    "status" "SupFornecedorStatus" NOT NULL DEFAULT 'ATIVO',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "avaliacaoMedia" DOUBLE PRECISION,
    "totalAvaliacoes" INTEGER NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupFornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupFornecedorDocumento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "numero" TEXT,
    "emissao" TIMESTAMP(3),
    "validade" TIMESTAMP(3),
    "status" "SupDocumentoStatus" NOT NULL DEFAULT 'VALIDO',
    "arquivoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupFornecedorDocumento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupFornecedorAvaliacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "pedidoId" TEXT,
    "notaPrazo" INTEGER NOT NULL,
    "notaQualidade" INTEGER NOT NULL,
    "notaPreco" INTEGER NOT NULL,
    "notaAtendimento" INTEGER NOT NULL DEFAULT 3,
    "nota" DOUBLE PRECISION NOT NULL,
    "comentario" TEXT,
    "avaliadorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupFornecedorAvaliacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupCategoria" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "contaContabilId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupCategoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "categoriaId" TEXT,
    "unidade" TEXT NOT NULL DEFAULT 'UN',
    "estoqueMinimo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estoqueMaximo" DOUBLE PRECISION,
    "pontoPedido" DOUBLE PRECISION,
    "leadTimeDias" INTEGER NOT NULL DEFAULT 7,
    "controlaLote" BOOLEAN NOT NULL DEFAULT false,
    "controlaValidade" BOOLEAN NOT NULL DEFAULT false,
    "precoReferencia" DOUBLE PRECISION,
    "custoMedio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contaContabilId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupAlmoxarifado" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "campusId" TEXT,
    "localizacao" TEXT,
    "responsavelUserId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupAlmoxarifado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupSaldo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "almoxarifadoId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "custoMedio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ultimaMovimentacao" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupSaldo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupLote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "almoxarifadoId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "validade" TIMESTAMP(3),
    "quantidade" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupLote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupMovimentacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "SupMovTipo" NOT NULL,
    "itemId" TEXT NOT NULL,
    "almoxarifadoId" TEXT NOT NULL,
    "almoxarifadoDestinoId" TEXT,
    "quantidade" DOUBLE PRECISION NOT NULL,
    "sentido" INTEGER NOT NULL DEFAULT 1,
    "custoUnitario" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "saldoApos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "custoMedioApos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "loteId" TEXT,
    "loteNumero" TEXT,
    "origemTipo" TEXT,
    "origemId" TEXT,
    "cursoId" TEXT,
    "laboratorioId" TEXT,
    "centroCustoId" TEXT,
    "classSectionId" TEXT,
    "motivo" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupMovimentacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupInventario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "almoxarifadoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'ROTATIVO',
    "status" "SupInventarioStatus" NOT NULL DEFAULT 'ABERTO',
    "observacao" TEXT,
    "abertoPorId" TEXT,
    "finalizadoEm" TIMESTAMP(3),
    "ajustadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupInventarioItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inventarioId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantidadeSistema" DOUBLE PRECISION NOT NULL,
    "quantidadeContada" DOUBLE PRECISION,
    "diferenca" DOUBLE PRECISION,
    "ajustado" BOOLEAN NOT NULL DEFAULT false,
    "observacao" TEXT,

    CONSTRAINT "SupInventarioItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupAlcada" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nivel" INTEGER NOT NULL,
    "valorMinimo" DOUBLE PRECISION NOT NULL,
    "papel" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupAlcada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupRequisicao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "tipo" "SupRequisicaoTipo" NOT NULL DEFAULT 'COMPRA',
    "status" "SupRequisicaoStatus" NOT NULL DEFAULT 'RASCUNHO',
    "solicitanteUserId" TEXT NOT NULL,
    "cursoId" TEXT,
    "laboratorioId" TEXT,
    "centroCustoId" TEXT,
    "classSectionId" TEXT,
    "almoxarifadoId" TEXT,
    "justificativa" TEXT,
    "urgencia" TEXT NOT NULL DEFAULT 'NORMAL',
    "necessarioEm" TIMESTAMP(3),
    "valorEstimado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "motivoReprovacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupRequisicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupRequisicaoItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requisicaoId" TEXT NOT NULL,
    "itemId" TEXT,
    "descricao" TEXT NOT NULL,
    "unidade" TEXT NOT NULL DEFAULT 'UN',
    "quantidade" DOUBLE PRECISION NOT NULL,
    "quantidadeAtendida" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "precoEstimado" DOUBLE PRECISION,

    CONSTRAINT "SupRequisicaoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupAprovacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requisicaoId" TEXT NOT NULL,
    "nivel" INTEGER NOT NULL,
    "papel" TEXT NOT NULL,
    "status" "SupAprovacaoStatus" NOT NULL DEFAULT 'PENDENTE',
    "decididoPorId" TEXT,
    "decididoEm" TIMESTAMP(3),
    "parecer" TEXT,

    CONSTRAINT "SupAprovacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupCotacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "requisicaoId" TEXT NOT NULL,
    "status" "SupCotacaoStatus" NOT NULL DEFAULT 'ABERTA',
    "criterio" TEXT NOT NULL DEFAULT 'MENOR_PRECO',
    "prazoResposta" TIMESTAMP(3),
    "fornecedorVencedorId" TEXT,
    "justificativaEscolha" TEXT,
    "valorEscolhido" DOUBLE PRECISION,
    "economia" DOUBLE PRECISION,
    "encerradaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupCotacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupCotacaoProposta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cotacaoId" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "respondeu" BOOLEAN NOT NULL DEFAULT false,
    "frete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prazoEntregaDias" INTEGER,
    "parcelas" INTEGER NOT NULL DEFAULT 1,
    "validadeProposta" TIMESTAMP(3),
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupCotacaoProposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupCotacaoPreco" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "requisicaoItemId" TEXT NOT NULL,
    "precoUnitario" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SupCotacaoPreco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupPedido" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "requisicaoId" TEXT,
    "cotacaoId" TEXT,
    "almoxarifadoId" TEXT NOT NULL,
    "centroCustoId" TEXT,
    "cursoId" TEXT,
    "laboratorioId" TEXT,
    "status" "SupPedidoStatus" NOT NULL DEFAULT 'RASCUNHO',
    "valorItens" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "frete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "parcelas" INTEGER NOT NULL DEFAULT 1,
    "intervaloParcelasDias" INTEGER NOT NULL DEFAULT 30,
    "primeiroVencimentoEm" TIMESTAMP(3),
    "previsaoEntrega" TIMESTAMP(3),
    "emitidoEm" TIMESTAMP(3),
    "recebidoEm" TIMESTAMP(3),
    "observacao" TEXT,
    "criadoPorId" TEXT,
    "payableIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupPedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupPedidoItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "requisicaoItemId" TEXT,
    "quantidade" DOUBLE PRECISION NOT NULL,
    "precoUnitario" DOUBLE PRECISION NOT NULL,
    "quantidadeRecebida" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "SupPedidoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupRecebimento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "notaFiscal" TEXT,
    "dataRecebimento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "observacao" TEXT,
    "recebidoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupRecebimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupRecebimentoItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recebimentoId" TEXT NOT NULL,
    "pedidoItemId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantidadeRecebida" DOUBLE PRECISION NOT NULL,
    "quantidadeRejeitada" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "motivoRejeicao" TEXT,
    "loteNumero" TEXT,
    "validade" TIMESTAMP(3),

    CONSTRAINT "SupRecebimentoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupContrato" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "objeto" TEXT NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "vigenciaFim" TIMESTAMP(3) NOT NULL,
    "valorMensal" DOUBLE PRECISION,
    "valorTotal" DOUBLE PRECISION,
    "indiceReajuste" TEXT,
    "percentualReajuste" DOUBLE PRECISION,
    "proximoReajusteEm" TIMESTAMP(3),
    "renovacaoAutomatica" BOOLEAN NOT NULL DEFAULT false,
    "avisoDias" INTEGER NOT NULL DEFAULT 60,
    "status" "SupContratoStatus" NOT NULL DEFAULT 'VIGENTE',
    "centroCustoId" TEXT,
    "arquivoUrl" TEXT,
    "observacoes" TEXT,
    "contratoAnteriorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupContrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupKit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "disciplineId" TEXT,
    "laboratorioId" TEXT,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupKitItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kitId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantidadeFixa" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quantidadePorAluno" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "SupKitItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupKitConsumo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kitId" TEXT NOT NULL,
    "classSectionId" TEXT,
    "classSessionId" TEXT,
    "cursoId" TEXT,
    "laboratorioId" TEXT,
    "almoxarifadoId" TEXT NOT NULL,
    "numeroAlunos" INTEGER NOT NULL,
    "valorTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupKitConsumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupProduto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "almoxarifadoId" TEXT NOT NULL,
    "canal" TEXT NOT NULL DEFAULT 'LOJA',
    "nome" TEXT NOT NULL,
    "preco" DOUBLE PRECISION NOT NULL,
    "permiteLancarAluno" BOOLEAN NOT NULL DEFAULT true,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupProduto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupCaixa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "operadorUserId" TEXT NOT NULL,
    "canal" TEXT NOT NULL DEFAULT 'LOJA',
    "status" "SupCaixaStatus" NOT NULL DEFAULT 'ABERTO',
    "valorAbertura" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "abertoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechadoEm" TIMESTAMP(3),
    "valorContado" DOUBLE PRECISION,
    "valorEsperado" DOUBLE PRECISION,
    "diferenca" DOUBLE PRECISION,
    "observacao" TEXT,

    CONSTRAINT "SupCaixa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupCaixaMov" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caixaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupCaixaMov_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupVenda" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "caixaId" TEXT NOT NULL,
    "tipo" "SupVendaTipo" NOT NULL DEFAULT 'A_VISTA',
    "status" "SupVendaStatus" NOT NULL DEFAULT 'CONCLUIDA',
    "studentId" TEXT,
    "clienteNome" TEXT,
    "formaPagamento" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "desconto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDevolvido" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "parcelas" INTEGER NOT NULL DEFAULT 1,
    "receivableIds" TEXT[],
    "vendedorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupVenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupVendaItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "almoxarifadoId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL,
    "precoUnitario" DOUBLE PRECISION NOT NULL,
    "custoUnitario" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quantidadeDevolvida" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "SupVendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupDevolucao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "motivo" TEXT,
    "itens" JSONB NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupDevolucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupSequencia" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SupSequencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EduInstitution_tenantId_key" ON "EduInstitution"("tenantId");

-- CreateIndex
CREATE INDEX "EduBrandAsset_tenantId_kind_idx" ON "EduBrandAsset"("tenantId", "kind");

-- CreateIndex
CREATE INDEX "EduBrandAsset_tenantId_campusId_idx" ON "EduBrandAsset"("tenantId", "campusId");

-- CreateIndex
CREATE INDEX "EduSpace_tenantId_tipo_idx" ON "EduSpace"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "EduSpace_tenantId_campusId_idx" ON "EduSpace"("tenantId", "campusId");

-- CreateIndex
CREATE UNIQUE INDEX "EduSpace_tenantId_codigo_key" ON "EduSpace"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "EduReminder_tenantId_status_remindAt_idx" ON "EduReminder"("tenantId", "status", "remindAt");

-- CreateIndex
CREATE INDEX "EduReminder_tenantId_refType_refId_idx" ON "EduReminder"("tenantId", "refType", "refId");

-- CreateIndex
CREATE INDEX "EduReminder_tenantId_assigneeUserId_status_idx" ON "EduReminder"("tenantId", "assigneeUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EduReminder_tenantId_dedupeKey_key" ON "EduReminder"("tenantId", "dedupeKey");

-- CreateIndex
CREATE INDEX "EduNotification_tenantId_status_agendadoPara_idx" ON "EduNotification"("tenantId", "status", "agendadoPara");

-- CreateIndex
CREATE INDEX "EduNotification_tenantId_userId_status_idx" ON "EduNotification"("tenantId", "userId", "status");

-- CreateIndex
CREATE INDEX "EduNotification_tenantId_studentId_idx" ON "EduNotification"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "EduAuditEvent_tenantId_modulo_createdAt_idx" ON "EduAuditEvent"("tenantId", "modulo", "createdAt");

-- CreateIndex
CREATE INDEX "EduAuditEvent_tenantId_refType_refId_idx" ON "EduAuditEvent"("tenantId", "refType", "refId");

-- CreateIndex
CREATE INDEX "Campus_tenantId_idx" ON "Campus"("tenantId");

-- CreateIndex
CREATE INDEX "AcademicProgram_tenantId_idx" ON "AcademicProgram"("tenantId");

-- CreateIndex
CREATE INDEX "Discipline_tenantId_idx" ON "Discipline"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumDiscipline_programId_disciplineId_key" ON "CurriculumDiscipline"("programId", "disciplineId");

-- CreateIndex
CREATE INDEX "AcademicTerm_tenantId_idx" ON "AcademicTerm"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_userId_key" ON "Student"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_ra_key" ON "Student"("ra");

-- CreateIndex
CREATE INDEX "Student_tenantId_idx" ON "Student"("tenantId");

-- CreateIndex
CREATE INDEX "Enrollment_studentId_idx" ON "Enrollment"("studentId");

-- CreateIndex
CREATE INDEX "Enrollment_programId_idx" ON "Enrollment"("programId");

-- CreateIndex
CREATE INDEX "ClassSection_tenantId_idx" ON "ClassSection"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassSectionEnrollment_enrollmentId_classSectionId_key" ON "ClassSectionEnrollment"("enrollmentId", "classSectionId");

-- CreateIndex
CREATE INDEX "ClassSession_classSectionId_idx" ON "ClassSession"("classSectionId");

-- CreateIndex
CREATE INDEX "ClassSession_dataHoraInicio_idx" ON "ClassSession"("dataHoraInicio");

-- CreateIndex
CREATE UNIQUE INDEX "ClassSessionBooking_classSessionId_studentId_key" ON "ClassSessionBooking"("classSessionId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_classSessionId_studentId_key" ON "Attendance"("classSessionId", "studentId");

-- CreateIndex
CREATE INDEX "ContentItem_disciplineId_idx" ON "ContentItem"("disciplineId");

-- CreateIndex
CREATE INDEX "Assessment_disciplineId_idx" ON "Assessment"("disciplineId");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_studentId_idx" ON "AssessmentAttempt"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerSubmission_attemptId_questionId_key" ON "AnswerSubmission"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "Certificate_studentId_idx" ON "Certificate"("studentId");

-- CreateIndex
CREATE INDEX "EduCostCenter_tenantId_idx" ON "EduCostCenter"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ChartOfAccount_tenantId_codigo_key" ON "ChartOfAccount"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "AccountPayable_tenantId_status_idx" ON "AccountPayable"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AccountReceivable_tenantId_status_idx" ON "AccountReceivable"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AccountReceivable_studentId_idx" ON "AccountReceivable"("studentId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_tenantId_idx" ON "PaymentTransaction"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingEntry_paymentTransactionId_key" ON "AccountingEntry"("paymentTransactionId");

-- CreateIndex
CREATE INDEX "AccountingEntry_tenantId_data_idx" ON "AccountingEntry"("tenantId", "data");

-- CreateIndex
CREATE INDEX "FiscalInvoice_tenantId_status_idx" ON "FiscalInvoice"("tenantId", "status");

-- CreateIndex
CREATE INDEX "StudentFlashcardState_studentId_proximaRevisao_idx" ON "StudentFlashcardState"("studentId", "proximaRevisao");

-- CreateIndex
CREATE UNIQUE INDEX "StudentFlashcardState_studentId_flashcardId_key" ON "StudentFlashcardState"("studentId", "flashcardId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentProgress_studentId_contentItemId_key" ON "ContentProgress"("studentId", "contentItemId");

-- CreateIndex
CREATE INDEX "LibraryProvider_tenantId_idx" ON "LibraryProvider"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentLibraryAccess_studentId_libraryProviderId_key" ON "StudentLibraryAccess"("studentId", "libraryProviderId");

-- CreateIndex
CREATE UNIQUE INDEX "GradingRubric_questionId_key" ON "GradingRubric"("questionId");

-- CreateIndex
CREATE INDEX "GradingRubric_questionId_idx" ON "GradingRubric"("questionId");

-- CreateIndex
CREATE INDEX "AIGenerationLog_tenantId_idx" ON "AIGenerationLog"("tenantId");

-- CreateIndex
CREATE INDEX "AdmProcessoSeletivo_tenantId_status_idx" ON "AdmProcessoSeletivo"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AdmProcessoSeletivo_tenantId_codigo_key" ON "AdmProcessoSeletivo"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "AdmOferta_tenantId_processoId_idx" ON "AdmOferta"("tenantId", "processoId");

-- CreateIndex
CREATE INDEX "AdmCampanha_tenantId_status_idx" ON "AdmCampanha"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AdmCampanha_tenantId_utmCampaign_idx" ON "AdmCampanha"("tenantId", "utmCampaign");

-- CreateIndex
CREATE INDEX "AdmCampanhaGasto_tenantId_campanhaId_idx" ON "AdmCampanhaGasto"("tenantId", "campanhaId");

-- CreateIndex
CREATE INDEX "AdmCandidato_tenantId_status_idx" ON "AdmCandidato"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AdmCandidato_tenantId_processoId_status_idx" ON "AdmCandidato"("tenantId", "processoId", "status");

-- CreateIndex
CREATE INDEX "AdmCandidato_tenantId_cpf_idx" ON "AdmCandidato"("tenantId", "cpf");

-- CreateIndex
CREATE INDEX "AdmCandidato_tenantId_proximoContatoEm_idx" ON "AdmCandidato"("tenantId", "proximoContatoEm");

-- CreateIndex
CREATE UNIQUE INDEX "AdmCandidato_tenantId_protocolo_key" ON "AdmCandidato"("tenantId", "protocolo");

-- CreateIndex
CREATE INDEX "AdmInteracao_tenantId_candidatoId_idx" ON "AdmInteracao"("tenantId", "candidatoId");

-- CreateIndex
CREATE INDEX "AdmResultadoProva_tenantId_candidatoId_idx" ON "AdmResultadoProva"("tenantId", "candidatoId");

-- CreateIndex
CREATE UNIQUE INDEX "AdmResultadoProva_candidatoId_componente_key" ON "AdmResultadoProva"("candidatoId", "componente");

-- CreateIndex
CREATE INDEX "AdmChamada_tenantId_processoId_idx" ON "AdmChamada"("tenantId", "processoId");

-- CreateIndex
CREATE UNIQUE INDEX "AdmChamada_processoId_numero_key" ON "AdmChamada"("processoId", "numero");

-- CreateIndex
CREATE INDEX "AdmConvocacao_tenantId_chamadaId_idx" ON "AdmConvocacao"("tenantId", "chamadaId");

-- CreateIndex
CREATE INDEX "AdmConvocacao_tenantId_candidatoId_idx" ON "AdmConvocacao"("tenantId", "candidatoId");

-- CreateIndex
CREATE UNIQUE INDEX "AdmDocumentoTipo_tenantId_codigo_key" ON "AdmDocumentoTipo"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "AdmDocumentoCandidato_tenantId_candidatoId_idx" ON "AdmDocumentoCandidato"("tenantId", "candidatoId");

-- CreateIndex
CREATE UNIQUE INDEX "AdmDocumentoCandidato_candidatoId_codigo_key" ON "AdmDocumentoCandidato"("candidatoId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "AdmMatricula_candidatoId_key" ON "AdmMatricula"("candidatoId");

-- CreateIndex
CREATE INDEX "AdmMatricula_tenantId_status_idx" ON "AdmMatricula"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AdmBolsa_tenantId_ativo_idx" ON "AdmBolsa"("tenantId", "ativo");

-- CreateIndex
CREATE INDEX "AdmBolsaConcessao_tenantId_bolsaId_idx" ON "AdmBolsaConcessao"("tenantId", "bolsaId");

-- CreateIndex
CREATE INDEX "AdmBolsaConcessao_tenantId_candidatoId_idx" ON "AdmBolsaConcessao"("tenantId", "candidatoId");

-- CreateIndex
CREATE INDEX "AdmRematriculaCampanha_tenantId_status_idx" ON "AdmRematriculaCampanha"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AdmRematricula_tenantId_campanhaId_status_idx" ON "AdmRematricula"("tenantId", "campanhaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AdmRematricula_campanhaId_studentId_key" ON "AdmRematricula"("campanhaId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ApoContador_tenantId_chave_key" ON "ApoContador"("tenantId", "chave");

-- CreateIndex
CREATE INDEX "ApoAndamento_tenantId_refType_refId_idx" ON "ApoAndamento"("tenantId", "refType", "refId");

-- CreateIndex
CREATE INDEX "ApoAtendimento_tenantId_studentId_idx" ON "ApoAtendimento"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ApoAtendimento_tenantId_profissionalId_dataHora_idx" ON "ApoAtendimento"("tenantId", "profissionalId", "dataHora");

-- CreateIndex
CREATE INDEX "ApoAtendimento_tenantId_status_dataHora_idx" ON "ApoAtendimento"("tenantId", "status", "dataHora");

-- CreateIndex
CREATE INDEX "ApoPlanoAee_tenantId_studentId_idx" ON "ApoPlanoAee"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ApoPlanoAee_tenantId_status_vigenciaFim_idx" ON "ApoPlanoAee"("tenantId", "status", "vigenciaFim");

-- CreateIndex
CREATE INDEX "ApoAdaptacao_tenantId_planoId_idx" ON "ApoAdaptacao"("tenantId", "planoId");

-- CreateIndex
CREATE INDEX "ApoAdaptacao_tenantId_professorUserId_idx" ON "ApoAdaptacao"("tenantId", "professorUserId");

-- CreateIndex
CREATE INDEX "ApoProgramaBolsa_tenantId_ativo_idx" ON "ApoProgramaBolsa"("tenantId", "ativo");

-- CreateIndex
CREATE INDEX "ApoInscricaoBolsa_tenantId_programaId_status_idx" ON "ApoInscricaoBolsa"("tenantId", "programaId", "status");

-- CreateIndex
CREATE INDEX "ApoInscricaoBolsa_tenantId_studentId_idx" ON "ApoInscricaoBolsa"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ApoInscricaoBolsa_tenantId_programaId_studentId_key" ON "ApoInscricaoBolsa"("tenantId", "programaId", "studentId");

-- CreateIndex
CREATE INDEX "ApoConcessaoBolsa_tenantId_studentId_idx" ON "ApoConcessaoBolsa"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ApoConcessaoBolsa_tenantId_programaId_status_idx" ON "ApoConcessaoBolsa"("tenantId", "programaId", "status");

-- CreateIndex
CREATE INDEX "ApoConcessaoBolsa_tenantId_status_fim_idx" ON "ApoConcessaoBolsa"("tenantId", "status", "fim");

-- CreateIndex
CREATE INDEX "ApoMonitoriaVaga_tenantId_status_idx" ON "ApoMonitoriaVaga"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ApoMonitoriaCandidatura_tenantId_studentId_idx" ON "ApoMonitoriaCandidatura"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ApoMonitoriaCandidatura_tenantId_vagaId_studentId_key" ON "ApoMonitoriaCandidatura"("tenantId", "vagaId", "studentId");

-- CreateIndex
CREATE INDEX "ApoMonitor_tenantId_studentId_idx" ON "ApoMonitor"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ApoMonitor_tenantId_vagaId_studentId_key" ON "ApoMonitor"("tenantId", "vagaId", "studentId");

-- CreateIndex
CREATE INDEX "ApoMonitoriaFrequencia_tenantId_monitorId_data_idx" ON "ApoMonitoriaFrequencia"("tenantId", "monitorId", "data");

-- CreateIndex
CREATE INDEX "ApoTurmaApoio_tenantId_tipo_status_idx" ON "ApoTurmaApoio"("tenantId", "tipo", "status");

-- CreateIndex
CREATE INDEX "ApoTurmaApoioParticipante_tenantId_studentId_idx" ON "ApoTurmaApoioParticipante"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ApoTurmaApoioParticipante_tenantId_turmaId_studentId_key" ON "ApoTurmaApoioParticipante"("tenantId", "turmaId", "studentId");

-- CreateIndex
CREATE INDEX "ApoMentoria_tenantId_status_idx" ON "ApoMentoria"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ApoMentoria_tenantId_menteeStudentId_idx" ON "ApoMentoria"("tenantId", "menteeStudentId");

-- CreateIndex
CREATE INDEX "ApoMentoria_tenantId_menteeUserId_idx" ON "ApoMentoria"("tenantId", "menteeUserId");

-- CreateIndex
CREATE INDEX "ApoMentoriaEncontro_tenantId_mentoriaId_idx" ON "ApoMentoriaEncontro"("tenantId", "mentoriaId");

-- CreateIndex
CREATE INDEX "ApoEmpresa_tenantId_status_idx" ON "ApoEmpresa"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApoEmpresa_tenantId_cnpj_key" ON "ApoEmpresa"("tenantId", "cnpj");

-- CreateIndex
CREATE INDEX "ApoVaga_tenantId_status_tipo_idx" ON "ApoVaga"("tenantId", "status", "tipo");

-- CreateIndex
CREATE INDEX "ApoCandidaturaVaga_tenantId_vagaId_idx" ON "ApoCandidaturaVaga"("tenantId", "vagaId");

-- CreateIndex
CREATE INDEX "ApoCandidaturaVaga_tenantId_studentId_idx" ON "ApoCandidaturaVaga"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ApoCandidaturaVaga_tenantId_egressoId_idx" ON "ApoCandidaturaVaga"("tenantId", "egressoId");

-- CreateIndex
CREATE INDEX "ApoTermoEstagio_tenantId_studentId_idx" ON "ApoTermoEstagio"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ApoTermoEstagio_tenantId_status_fim_idx" ON "ApoTermoEstagio"("tenantId", "status", "fim");

-- CreateIndex
CREATE UNIQUE INDEX "ApoTermoEstagio_tenantId_numero_key" ON "ApoTermoEstagio"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "ApoRelatorioEstagio_tenantId_termoId_idx" ON "ApoRelatorioEstagio"("tenantId", "termoId");

-- CreateIndex
CREATE INDEX "ApoRelatorioEstagio_tenantId_status_prazoEm_idx" ON "ApoRelatorioEstagio"("tenantId", "status", "prazoEm");

-- CreateIndex
CREATE INDEX "ApoOcorrencia_tenantId_studentId_idx" ON "ApoOcorrencia"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ApoOcorrencia_tenantId_status_idx" ON "ApoOcorrencia"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApoOcorrencia_tenantId_numero_key" ON "ApoOcorrencia"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "ApoRiscoSnapshot_tenantId_studentId_calculadoEm_idx" ON "ApoRiscoSnapshot"("tenantId", "studentId", "calculadoEm");

-- CreateIndex
CREATE INDEX "ApoRiscoSnapshot_tenantId_nivel_calculadoEm_idx" ON "ApoRiscoSnapshot"("tenantId", "nivel", "calculadoEm");

-- CreateIndex
CREATE INDEX "ApoPlanoAcao_tenantId_studentId_idx" ON "ApoPlanoAcao"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ApoPlanoAcao_tenantId_status_proximoContatoEm_idx" ON "ApoPlanoAcao"("tenantId", "status", "proximoContatoEm");

-- CreateIndex
CREATE INDEX "ApoContatoEvasao_tenantId_planoId_idx" ON "ApoContatoEvasao"("tenantId", "planoId");

-- CreateIndex
CREATE INDEX "ApoFormacao_tenantId_status_inicio_idx" ON "ApoFormacao"("tenantId", "status", "inicio");

-- CreateIndex
CREATE INDEX "ApoFormacaoInscricao_tenantId_userId_idx" ON "ApoFormacaoInscricao"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ApoFormacaoInscricao_tenantId_formacaoId_userId_key" ON "ApoFormacaoInscricao"("tenantId", "formacaoId", "userId");

-- CreateIndex
CREATE INDEX "ApoMaterial_tenantId_status_idx" ON "ApoMaterial"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ApoMaterial_tenantId_disciplineId_idx" ON "ApoMaterial"("tenantId", "disciplineId");

-- CreateIndex
CREATE INDEX "ApoChamado_tenantId_status_prazoEm_idx" ON "ApoChamado"("tenantId", "status", "prazoEm");

-- CreateIndex
CREATE INDEX "ApoChamado_tenantId_solicitanteUserId_idx" ON "ApoChamado"("tenantId", "solicitanteUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ApoChamado_tenantId_numero_key" ON "ApoChamado"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "ApoInstrumento_tenantId_finalidade_idx" ON "ApoInstrumento"("tenantId", "finalidade");

-- CreateIndex
CREATE INDEX "ApoAplicacao_tenantId_status_fechamento_idx" ON "ApoAplicacao"("tenantId", "status", "fechamento");

-- CreateIndex
CREATE INDEX "ApoAplicacao_tenantId_professorUserId_idx" ON "ApoAplicacao"("tenantId", "professorUserId");

-- CreateIndex
CREATE INDEX "ApoParticipacao_tenantId_respondenteId_idx" ON "ApoParticipacao"("tenantId", "respondenteId");

-- CreateIndex
CREATE UNIQUE INDEX "ApoParticipacao_aplicacaoId_respondenteId_key" ON "ApoParticipacao"("aplicacaoId", "respondenteId");

-- CreateIndex
CREATE INDEX "ApoResposta_tenantId_aplicacaoId_idx" ON "ApoResposta"("tenantId", "aplicacaoId");

-- CreateIndex
CREATE INDEX "ApoDevolutiva_tenantId_professorUserId_idx" ON "ApoDevolutiva"("tenantId", "professorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ApoSetorOuvidoria_tenantId_codigo_key" ON "ApoSetorOuvidoria"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "ApoManifestacao_tenantId_status_prazoEm_idx" ON "ApoManifestacao"("tenantId", "status", "prazoEm");

-- CreateIndex
CREATE INDEX "ApoManifestacao_tenantId_tipo_idx" ON "ApoManifestacao"("tenantId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "ApoManifestacao_tenantId_protocolo_key" ON "ApoManifestacao"("tenantId", "protocolo");

-- CreateIndex
CREATE INDEX "ApoEncaminhamento_tenantId_manifestacaoId_idx" ON "ApoEncaminhamento"("tenantId", "manifestacaoId");

-- CreateIndex
CREATE INDEX "ApoEncaminhamento_tenantId_status_prazoEm_idx" ON "ApoEncaminhamento"("tenantId", "status", "prazoEm");

-- CreateIndex
CREATE INDEX "ApoEgresso_tenantId_programId_anoConclusao_idx" ON "ApoEgresso"("tenantId", "programId", "anoConclusao");

-- CreateIndex
CREATE UNIQUE INDEX "ApoEgresso_tenantId_studentId_key" ON "ApoEgresso"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ApoEgressoTrajetoria_tenantId_egressoId_idx" ON "ApoEgressoTrajetoria"("tenantId", "egressoId");

-- CreateIndex
CREATE INDEX "ApoEventoEgresso_tenantId_status_dataHora_idx" ON "ApoEventoEgresso"("tenantId", "status", "dataHora");

-- CreateIndex
CREATE INDEX "ApoEventoParticipante_tenantId_egressoId_idx" ON "ApoEventoParticipante"("tenantId", "egressoId");

-- CreateIndex
CREATE UNIQUE INDEX "ApoEventoParticipante_eventoId_egressoId_key" ON "ApoEventoParticipante"("eventoId", "egressoId");

-- CreateIndex
CREATE UNIQUE INDEX "BibConfig_tenantId_key" ON "BibConfig"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BibPolitica_tenantId_perfil_key" ON "BibPolitica"("tenantId", "perfil");

-- CreateIndex
CREATE INDEX "BibObra_tenantId_titulo_idx" ON "BibObra"("tenantId", "titulo");

-- CreateIndex
CREATE INDEX "BibObra_tenantId_isbn_idx" ON "BibObra"("tenantId", "isbn");

-- CreateIndex
CREATE INDEX "BibObra_tenantId_tipo_idx" ON "BibObra"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "BibExemplar_tenantId_obraId_status_idx" ON "BibExemplar"("tenantId", "obraId", "status");

-- CreateIndex
CREATE INDEX "BibExemplar_tenantId_codigoBarras_idx" ON "BibExemplar"("tenantId", "codigoBarras");

-- CreateIndex
CREATE INDEX "BibExemplar_tenantId_spaceId_estante_idx" ON "BibExemplar"("tenantId", "spaceId", "estante");

-- CreateIndex
CREATE UNIQUE INDEX "BibExemplar_tenantId_tombo_key" ON "BibExemplar"("tenantId", "tombo");

-- CreateIndex
CREATE INDEX "BibLeitor_tenantId_perfil_idx" ON "BibLeitor"("tenantId", "perfil");

-- CreateIndex
CREATE INDEX "BibLeitor_tenantId_studentId_idx" ON "BibLeitor"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "BibLeitor_tenantId_userId_idx" ON "BibLeitor"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "BibLeitor_tenantId_documento_idx" ON "BibLeitor"("tenantId", "documento");

-- CreateIndex
CREATE INDEX "BibEmprestimo_tenantId_status_dataPrevista_idx" ON "BibEmprestimo"("tenantId", "status", "dataPrevista");

-- CreateIndex
CREATE INDEX "BibEmprestimo_tenantId_leitorId_status_idx" ON "BibEmprestimo"("tenantId", "leitorId", "status");

-- CreateIndex
CREATE INDEX "BibEmprestimo_tenantId_obraId_idx" ON "BibEmprestimo"("tenantId", "obraId");

-- CreateIndex
CREATE INDEX "BibEmprestimo_tenantId_exemplarId_idx" ON "BibEmprestimo"("tenantId", "exemplarId");

-- CreateIndex
CREATE INDEX "BibReserva_tenantId_obraId_status_createdAt_idx" ON "BibReserva"("tenantId", "obraId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BibReserva_tenantId_leitorId_status_idx" ON "BibReserva"("tenantId", "leitorId", "status");

-- CreateIndex
CREATE INDEX "BibReserva_tenantId_status_expiraEm_idx" ON "BibReserva"("tenantId", "status", "expiraEm");

-- CreateIndex
CREATE INDEX "BibMulta_tenantId_status_idx" ON "BibMulta"("tenantId", "status");

-- CreateIndex
CREATE INDEX "BibMulta_tenantId_leitorId_status_idx" ON "BibMulta"("tenantId", "leitorId", "status");

-- CreateIndex
CREATE INDEX "BibMulta_tenantId_emprestimoId_idx" ON "BibMulta"("tenantId", "emprestimoId");

-- CreateIndex
CREATE INDEX "BibInventario_tenantId_status_idx" ON "BibInventario"("tenantId", "status");

-- CreateIndex
CREATE INDEX "BibInventarioItem_tenantId_inventarioId_situacao_idx" ON "BibInventarioItem"("tenantId", "inventarioId", "situacao");

-- CreateIndex
CREATE UNIQUE INDEX "BibInventarioItem_inventarioId_tombo_key" ON "BibInventarioItem"("inventarioId", "tombo");

-- CreateIndex
CREATE INDEX "BibBibliografia_tenantId_disciplineId_tipo_idx" ON "BibBibliografia"("tenantId", "disciplineId", "tipo");

-- CreateIndex
CREATE INDEX "BibBibliografia_tenantId_obraId_idx" ON "BibBibliografia"("tenantId", "obraId");

-- CreateIndex
CREATE UNIQUE INDEX "BibBibliografia_tenantId_disciplineId_obraId_key" ON "BibBibliografia"("tenantId", "disciplineId", "obraId");

-- CreateIndex
CREATE INDEX "BibSugestaoAquisicao_tenantId_status_idx" ON "BibSugestaoAquisicao"("tenantId", "status");

-- CreateIndex
CREATE INDEX "BibSugestaoAquisicao_tenantId_disciplineId_idx" ON "BibSugestaoAquisicao"("tenantId", "disciplineId");

-- CreateIndex
CREATE INDEX "BibRecursoVirtual_tenantId_tipo_idx" ON "BibRecursoVirtual"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "BibRecursoVirtual_tenantId_obraId_idx" ON "BibRecursoVirtual"("tenantId", "obraId");

-- CreateIndex
CREATE INDEX "BibAcessoVirtual_tenantId_recursoId_createdAt_idx" ON "BibAcessoVirtual"("tenantId", "recursoId", "createdAt");

-- CreateIndex
CREATE INDEX "BibAcessoVirtual_tenantId_createdAt_idx" ON "BibAcessoVirtual"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "BibRepositorioItem_tenantId_status_tipo_idx" ON "BibRepositorioItem"("tenantId", "status", "tipo");

-- CreateIndex
CREATE INDEX "BibRepositorioItem_tenantId_programId_idx" ON "BibRepositorioItem"("tenantId", "programId");

-- CreateIndex
CREATE INDEX "BibRepositorioItem_tenantId_autorStudentId_idx" ON "BibRepositorioItem"("tenantId", "autorStudentId");

-- CreateIndex
CREATE UNIQUE INDEX "BibRepositorioItem_tenantId_handle_key" ON "BibRepositorioItem"("tenantId", "handle");

-- CreateIndex
CREATE INDEX "CalCategoria_tenantId_idx" ON "CalCategoria"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CalCategoria_tenantId_nome_key" ON "CalCategoria"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "CalEvento_tenantId_inicio_idx" ON "CalEvento"("tenantId", "inicio");

-- CreateIndex
CREATE INDEX "CalEvento_tenantId_termId_idx" ON "CalEvento"("tenantId", "termId");

-- CreateIndex
CREATE INDEX "CalEvento_tenantId_tipo_idx" ON "CalEvento"("tenantId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "CalEvento_tenantId_origemKey_key" ON "CalEvento"("tenantId", "origemKey");

-- CreateIndex
CREATE INDEX "CalHorario_tenantId_idx" ON "CalHorario"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CalHorario_tenantId_turno_ordem_key" ON "CalHorario"("tenantId", "turno", "ordem");

-- CreateIndex
CREATE INDEX "CalDisponibilidade_tenantId_userId_idx" ON "CalDisponibilidade"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "CalDisponibilidade_tenantId_termId_idx" ON "CalDisponibilidade"("tenantId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "CalProfessorPerfil_tenantId_userId_key" ON "CalProfessorPerfil"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalDisciplinaConfig_tenantId_disciplineId_key" ON "CalDisciplinaConfig"("tenantId", "disciplineId");

-- CreateIndex
CREATE INDEX "CalTurmaConfig_tenantId_grupo_idx" ON "CalTurmaConfig"("tenantId", "grupo");

-- CreateIndex
CREATE UNIQUE INDEX "CalTurmaConfig_tenantId_classSectionId_key" ON "CalTurmaConfig"("tenantId", "classSectionId");

-- CreateIndex
CREATE INDEX "CalSlot_tenantId_termId_diaSemana_idx" ON "CalSlot"("tenantId", "termId", "diaSemana");

-- CreateIndex
CREATE INDEX "CalSlot_tenantId_professorUserId_idx" ON "CalSlot"("tenantId", "professorUserId");

-- CreateIndex
CREATE INDEX "CalSlot_tenantId_spaceId_idx" ON "CalSlot"("tenantId", "spaceId");

-- CreateIndex
CREATE INDEX "CalSlot_tenantId_classSectionId_idx" ON "CalSlot"("tenantId", "classSectionId");

-- CreateIndex
CREATE INDEX "CalSlot_tenantId_geracaoId_idx" ON "CalSlot"("tenantId", "geracaoId");

-- CreateIndex
CREATE INDEX "CalGeracao_tenantId_termId_idx" ON "CalGeracao"("tenantId", "termId");

-- CreateIndex
CREATE INDEX "CalReserva_tenantId_spaceId_inicio_idx" ON "CalReserva"("tenantId", "spaceId", "inicio");

-- CreateIndex
CREATE INDEX "CalReserva_tenantId_status_idx" ON "CalReserva"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CalReserva_tenantId_serieId_idx" ON "CalReserva"("tenantId", "serieId");

-- CreateIndex
CREATE INDEX "CalReserva_tenantId_solicitanteId_idx" ON "CalReserva"("tenantId", "solicitanteId");

-- CreateIndex
CREATE INDEX "CalExame_tenantId_termId_inicio_idx" ON "CalExame"("tenantId", "termId", "inicio");

-- CreateIndex
CREATE INDEX "CalExame_tenantId_classSectionId_idx" ON "CalExame"("tenantId", "classSectionId");

-- CreateIndex
CREATE INDEX "CalExame_tenantId_spaceId_inicio_idx" ON "CalExame"("tenantId", "spaceId", "inicio");

-- CreateIndex
CREATE INDEX "CalExameFiscal_tenantId_userId_idx" ON "CalExameFiscal"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalExameFiscal_exameId_userId_key" ON "CalExameFiscal"("exameId", "userId");

-- CreateIndex
CREATE INDEX "CalPrazoNotas_tenantId_termId_idx" ON "CalPrazoNotas"("tenantId", "termId");

-- CreateIndex
CREATE INDEX "CalPrazoNotas_tenantId_prazo_idx" ON "CalPrazoNotas"("tenantId", "prazo");

-- CreateIndex
CREATE UNIQUE INDEX "CalPrazoExcecao_prazoId_userId_key" ON "CalPrazoExcecao"("prazoId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalPrazoConclusao_prazoId_userId_key" ON "CalPrazoConclusao"("prazoId", "userId");

-- CreateIndex
CREATE INDEX "CalConflito_tenantId_status_idx" ON "CalConflito"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CalConflito_tenantId_termId_idx" ON "CalConflito"("tenantId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "CalConflito_tenantId_chave_key" ON "CalConflito"("tenantId", "chave");

-- CreateIndex
CREATE UNIQUE INDEX "CalFeed_token_key" ON "CalFeed"("token");

-- CreateIndex
CREATE INDEX "CalFeed_tenantId_escopo_idx" ON "CalFeed"("tenantId", "escopo");

-- CreateIndex
CREATE INDEX "ComCanal_tenantId_tipo_ativo_idx" ON "ComCanal"("tenantId", "tipo", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "ComCanal_tenantId_tipo_nome_key" ON "ComCanal"("tenantId", "tipo", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "ComConfig_tenantId_key" ON "ComConfig"("tenantId");

-- CreateIndex
CREATE INDEX "ComContato_tenantId_tipo_idx" ON "ComContato"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "ComContato_tenantId_telefone_idx" ON "ComContato"("tenantId", "telefone");

-- CreateIndex
CREATE INDEX "ComContato_tenantId_email_idx" ON "ComContato"("tenantId", "email");

-- CreateIndex
CREATE INDEX "ComContato_tenantId_studentId_idx" ON "ComContato"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ComContato_tenantId_telegramChatId_idx" ON "ComContato"("tenantId", "telegramChatId");

-- CreateIndex
CREATE INDEX "ComPreferencia_tenantId_contatoId_idx" ON "ComPreferencia"("tenantId", "contatoId");

-- CreateIndex
CREATE UNIQUE INDEX "ComPreferencia_tenantId_contatoId_canal_finalidade_key" ON "ComPreferencia"("tenantId", "contatoId", "canal", "finalidade");

-- CreateIndex
CREATE INDEX "ComTemplate_tenantId_categoria_idx" ON "ComTemplate"("tenantId", "categoria");

-- CreateIndex
CREATE UNIQUE INDEX "ComTemplate_tenantId_chave_key" ON "ComTemplate"("tenantId", "chave");

-- CreateIndex
CREATE INDEX "ComConversa_tenantId_status_ultimaMensagemEm_idx" ON "ComConversa"("tenantId", "status", "ultimaMensagemEm");

-- CreateIndex
CREATE INDEX "ComConversa_tenantId_atribuidoAId_status_idx" ON "ComConversa"("tenantId", "atribuidoAId", "status");

-- CreateIndex
CREATE INDEX "ComConversa_tenantId_contatoId_idx" ON "ComConversa"("tenantId", "contatoId");

-- CreateIndex
CREATE INDEX "ComConversa_tenantId_canalTipo_chaveExterna_idx" ON "ComConversa"("tenantId", "canalTipo", "chaveExterna");

-- CreateIndex
CREATE INDEX "ComMensagem_tenantId_conversaId_createdAt_idx" ON "ComMensagem"("tenantId", "conversaId", "createdAt");

-- CreateIndex
CREATE INDEX "ComMensagem_tenantId_notificationId_idx" ON "ComMensagem"("tenantId", "notificationId");

-- CreateIndex
CREATE UNIQUE INDEX "ComMensagem_tenantId_conversaId_externalId_key" ON "ComMensagem"("tenantId", "conversaId", "externalId");

-- CreateIndex
CREATE INDEX "ComCampanha_tenantId_status_agendadaPara_idx" ON "ComCampanha"("tenantId", "status", "agendadaPara");

-- CreateIndex
CREATE INDEX "ComCampanhaDestinatario_tenantId_campanhaId_resultado_idx" ON "ComCampanhaDestinatario"("tenantId", "campanhaId", "resultado");

-- CreateIndex
CREATE INDEX "ComCampanhaDestinatario_tenantId_notificationId_idx" ON "ComCampanhaDestinatario"("tenantId", "notificationId");

-- CreateIndex
CREATE UNIQUE INDEX "ComCampanhaDestinatario_campanhaId_chave_key" ON "ComCampanhaDestinatario"("campanhaId", "chave");

-- CreateIndex
CREATE INDEX "ComRegua_tenantId_ativa_idx" ON "ComRegua"("tenantId", "ativa");

-- CreateIndex
CREATE INDEX "ComReguaEtapa_tenantId_reguaId_idx" ON "ComReguaEtapa"("tenantId", "reguaId");

-- CreateIndex
CREATE INDEX "ComReguaExecucao_tenantId_receivableId_idx" ON "ComReguaExecucao"("tenantId", "receivableId");

-- CreateIndex
CREATE INDEX "ComReguaExecucao_tenantId_reguaId_createdAt_idx" ON "ComReguaExecucao"("tenantId", "reguaId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ComReguaExecucao_etapaId_receivableId_key" ON "ComReguaExecucao"("etapaId", "receivableId");

-- CreateIndex
CREATE INDEX "ComBotFluxo_tenantId_ativo_idx" ON "ComBotFluxo"("tenantId", "ativo");

-- CreateIndex
CREATE INDEX "ComBotFluxo_tenantId_intencao_idx" ON "ComBotFluxo"("tenantId", "intencao");

-- CreateIndex
CREATE INDEX "ComFaq_tenantId_ativo_categoria_idx" ON "ComFaq"("tenantId", "ativo", "categoria");

-- CreateIndex
CREATE INDEX "ComSocialConta_tenantId_rede_idx" ON "ComSocialConta"("tenantId", "rede");

-- CreateIndex
CREATE INDEX "ComSocialPost_tenantId_status_agendadoPara_idx" ON "ComSocialPost"("tenantId", "status", "agendadoPara");

-- CreateIndex
CREATE INDEX "ComSocialPost_tenantId_contaId_idx" ON "ComSocialPost"("tenantId", "contaId");

-- CreateIndex
CREATE INDEX "ComSocialMetrica_tenantId_contaId_data_idx" ON "ComSocialMetrica"("tenantId", "contaId", "data");

-- CreateIndex
CREATE INDEX "ComSocialMetrica_tenantId_postId_idx" ON "ComSocialMetrica"("tenantId", "postId");

-- CreateIndex
CREATE INDEX "ComSocialInteracao_tenantId_status_createdAt_idx" ON "ComSocialInteracao"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ComSocialInteracao_tenantId_contaId_externalId_key" ON "ComSocialInteracao"("tenantId", "contaId", "externalId");

-- CreateIndex
CREATE INDEX "ComChamada_tenantId_inicioEm_idx" ON "ComChamada"("tenantId", "inicioEm");

-- CreateIndex
CREATE INDEX "ComChamada_tenantId_provedorSid_idx" ON "ComChamada"("tenantId", "provedorSid");

-- CreateIndex
CREATE INDEX "ComWebhookLog_canalId_createdAt_idx" ON "ComWebhookLog"("canalId", "createdAt");

-- CreateIndex
CREATE INDEX "DesExame_tenantId_tipo_idx" ON "DesExame"("tenantId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "DesExame_tenantId_codigo_key" ON "DesExame"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "DesEixo_tenantId_exameId_idx" ON "DesEixo"("tenantId", "exameId");

-- CreateIndex
CREATE UNIQUE INDEX "DesEixo_exameId_codigo_key" ON "DesEixo"("exameId", "codigo");

-- CreateIndex
CREATE INDEX "DesEdicao_tenantId_exameId_idx" ON "DesEdicao"("tenantId", "exameId");

-- CreateIndex
CREATE INDEX "DesEdicao_tenantId_dataProva_idx" ON "DesEdicao"("tenantId", "dataProva");

-- CreateIndex
CREATE UNIQUE INDEX "DesEdicao_exameId_ano_titulo_key" ON "DesEdicao"("exameId", "ano", "titulo");

-- CreateIndex
CREATE INDEX "DesInscricao_tenantId_edicaoId_situacao_idx" ON "DesInscricao"("tenantId", "edicaoId", "situacao");

-- CreateIndex
CREATE INDEX "DesInscricao_tenantId_studentId_idx" ON "DesInscricao"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "DesInscricao_edicaoId_studentId_key" ON "DesInscricao"("edicaoId", "studentId");

-- CreateIndex
CREATE INDEX "DesMetaCurso_tenantId_exameId_idx" ON "DesMetaCurso"("tenantId", "exameId");

-- CreateIndex
CREATE UNIQUE INDEX "DesMetaCurso_tenantId_programId_exameId_ano_key" ON "DesMetaCurso"("tenantId", "programId", "exameId", "ano");

-- CreateIndex
CREATE INDEX "DesQuestao_tenantId_exameId_status_idx" ON "DesQuestao"("tenantId", "exameId", "status");

-- CreateIndex
CREATE INDEX "DesQuestao_tenantId_eixoId_idx" ON "DesQuestao"("tenantId", "eixoId");

-- CreateIndex
CREATE INDEX "DesQuestao_tenantId_disciplineId_idx" ON "DesQuestao"("tenantId", "disciplineId");

-- CreateIndex
CREATE INDEX "DesSimulado_tenantId_exameId_status_idx" ON "DesSimulado"("tenantId", "exameId", "status");

-- CreateIndex
CREATE INDEX "DesSimuladoQuestao_tenantId_simuladoId_idx" ON "DesSimuladoQuestao"("tenantId", "simuladoId");

-- CreateIndex
CREATE UNIQUE INDEX "DesSimuladoQuestao_simuladoId_questaoId_key" ON "DesSimuladoQuestao"("simuladoId", "questaoId");

-- CreateIndex
CREATE INDEX "DesSimuladoAlvo_tenantId_simuladoId_idx" ON "DesSimuladoAlvo"("tenantId", "simuladoId");

-- CreateIndex
CREATE INDEX "DesSimuladoAlvo_tenantId_studentId_idx" ON "DesSimuladoAlvo"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "DesSimuladoAlvo_tenantId_classSectionId_idx" ON "DesSimuladoAlvo"("tenantId", "classSectionId");

-- CreateIndex
CREATE INDEX "DesTentativa_tenantId_studentId_idx" ON "DesTentativa"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "DesTentativa_tenantId_simuladoId_status_idx" ON "DesTentativa"("tenantId", "simuladoId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DesTentativa_simuladoId_studentId_key" ON "DesTentativa"("simuladoId", "studentId");

-- CreateIndex
CREATE INDEX "DesResposta_tenantId_questaoId_idx" ON "DesResposta"("tenantId", "questaoId");

-- CreateIndex
CREATE UNIQUE INDEX "DesResposta_tentativaId_questaoId_key" ON "DesResposta"("tentativaId", "questaoId");

-- CreateIndex
CREATE INDEX "DesKit_tenantId_disciplineId_idx" ON "DesKit"("tenantId", "disciplineId");

-- CreateIndex
CREATE INDEX "DesKit_tenantId_visibilidade_idx" ON "DesKit"("tenantId", "visibilidade");

-- CreateIndex
CREATE INDEX "DesKit_tenantId_autorUserId_idx" ON "DesKit"("tenantId", "autorUserId");

-- CreateIndex
CREATE INDEX "DesAtribuicao_tenantId_classSectionId_idx" ON "DesAtribuicao"("tenantId", "classSectionId");

-- CreateIndex
CREATE INDEX "DesAtribuicao_tenantId_professorUserId_status_idx" ON "DesAtribuicao"("tenantId", "professorUserId", "status");

-- CreateIndex
CREATE INDEX "DesAtribuicao_tenantId_prazo_idx" ON "DesAtribuicao"("tenantId", "prazo");

-- CreateIndex
CREATE INDEX "DesEntrega_tenantId_studentId_idx" ON "DesEntrega"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "DesEntrega_atribuicaoId_studentId_key" ON "DesEntrega"("atribuicaoId", "studentId");

-- CreateIndex
CREATE INDEX "DesTrilha_tenantId_studentId_status_idx" ON "DesTrilha"("tenantId", "studentId", "status");

-- CreateIndex
CREATE INDEX "DesTrilha_tenantId_exameId_idx" ON "DesTrilha"("tenantId", "exameId");

-- CreateIndex
CREATE INDEX "DesTrilhaItem_tenantId_trilhaId_idx" ON "DesTrilhaItem"("tenantId", "trilhaId");

-- CreateIndex
CREATE INDEX "DesTrilhaItem_tenantId_dataPrevista_status_idx" ON "DesTrilhaItem"("tenantId", "dataPrevista", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GovSequencia_tenantId_chave_ano_key" ON "GovSequencia"("tenantId", "chave", "ano");

-- CreateIndex
CREATE INDEX "GovPdi_tenantId_status_idx" ON "GovPdi"("tenantId", "status");

-- CreateIndex
CREATE INDEX "GovPdiEixo_tenantId_pdiId_idx" ON "GovPdiEixo"("tenantId", "pdiId");

-- CreateIndex
CREATE INDEX "GovPdiObjetivo_tenantId_eixoId_idx" ON "GovPdiObjetivo"("tenantId", "eixoId");

-- CreateIndex
CREATE INDEX "GovPdiMeta_tenantId_objetivoId_idx" ON "GovPdiMeta"("tenantId", "objetivoId");

-- CreateIndex
CREATE INDEX "GovPdiMeta_tenantId_proximaColetaEm_idx" ON "GovPdiMeta"("tenantId", "proximaColetaEm");

-- CreateIndex
CREATE INDEX "GovPdiMedicao_tenantId_metaId_dataReferencia_idx" ON "GovPdiMedicao"("tenantId", "metaId", "dataReferencia");

-- CreateIndex
CREATE INDEX "GovPdiAcao_tenantId_metaId_idx" ON "GovPdiAcao"("tenantId", "metaId");

-- CreateIndex
CREATE INDEX "GovPdiAcao_tenantId_status_prazo_idx" ON "GovPdiAcao"("tenantId", "status", "prazo");

-- CreateIndex
CREATE INDEX "GovDocumento_tenantId_tipo_idx" ON "GovDocumento"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "GovDocumento_tenantId_programId_idx" ON "GovDocumento"("tenantId", "programId");

-- CreateIndex
CREATE INDEX "GovDocumentoVersao_tenantId_status_idx" ON "GovDocumentoVersao"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GovDocumentoVersao_documentoId_versao_key" ON "GovDocumentoVersao"("documentoId", "versao");

-- CreateIndex
CREATE INDEX "GovCpa_tenantId_idx" ON "GovCpa"("tenantId");

-- CreateIndex
CREATE INDEX "GovCpaMembro_tenantId_cpaId_idx" ON "GovCpaMembro"("tenantId", "cpaId");

-- CreateIndex
CREATE INDEX "GovCpaMembro_tenantId_fimMandato_idx" ON "GovCpaMembro"("tenantId", "fimMandato");

-- CreateIndex
CREATE INDEX "GovCpaCiclo_tenantId_status_idx" ON "GovCpaCiclo"("tenantId", "status");

-- CreateIndex
CREATE INDEX "GovCpaQuestionario_tenantId_cicloId_idx" ON "GovCpaQuestionario"("tenantId", "cicloId");

-- CreateIndex
CREATE UNIQUE INDEX "GovCpaModeloQuestionario_tenantId_chave_key" ON "GovCpaModeloQuestionario"("tenantId", "chave");

-- CreateIndex
CREATE INDEX "GovCpaPergunta_tenantId_questionarioId_idx" ON "GovCpaPergunta"("tenantId", "questionarioId");

-- CreateIndex
CREATE UNIQUE INDEX "GovCpaConvite_tokenHash_key" ON "GovCpaConvite"("tokenHash");

-- CreateIndex
CREATE INDEX "GovCpaConvite_tenantId_questionarioId_usado_idx" ON "GovCpaConvite"("tenantId", "questionarioId", "usado");

-- CreateIndex
CREATE INDEX "GovCpaResposta_tenantId_cicloId_segmento_idx" ON "GovCpaResposta"("tenantId", "cicloId", "segmento");

-- CreateIndex
CREATE INDEX "GovCpaRespostaItem_tenantId_respostaId_idx" ON "GovCpaRespostaItem"("tenantId", "respostaId");

-- CreateIndex
CREATE INDEX "GovCpaRespostaItem_tenantId_perguntaId_idx" ON "GovCpaRespostaItem"("tenantId", "perguntaId");

-- CreateIndex
CREATE INDEX "GovCpaRelatorio_tenantId_cicloId_idx" ON "GovCpaRelatorio"("tenantId", "cicloId");

-- CreateIndex
CREATE INDEX "GovCpaPlanoAcao_tenantId_cicloId_status_idx" ON "GovCpaPlanoAcao"("tenantId", "cicloId", "status");

-- CreateIndex
CREATE INDEX "GovNde_tenantId_programId_idx" ON "GovNde"("tenantId", "programId");

-- CreateIndex
CREATE INDEX "GovNdeMembro_tenantId_ndeId_idx" ON "GovNdeMembro"("tenantId", "ndeId");

-- CreateIndex
CREATE INDEX "GovNdeMembro_tenantId_docenteId_idx" ON "GovNdeMembro"("tenantId", "docenteId");

-- CreateIndex
CREATE INDEX "GovNdeReuniao_tenantId_ndeId_data_idx" ON "GovNdeReuniao"("tenantId", "ndeId", "data");

-- CreateIndex
CREATE INDEX "GovOrgao_tenantId_tipo_idx" ON "GovOrgao"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "GovOrgaoMembro_tenantId_orgaoId_idx" ON "GovOrgaoMembro"("tenantId", "orgaoId");

-- CreateIndex
CREATE INDEX "GovOrgaoMembro_tenantId_fimMandato_idx" ON "GovOrgaoMembro"("tenantId", "fimMandato");

-- CreateIndex
CREATE INDEX "GovReuniao_tenantId_orgaoId_data_idx" ON "GovReuniao"("tenantId", "orgaoId", "data");

-- CreateIndex
CREATE INDEX "GovPauta_tenantId_reuniaoId_idx" ON "GovPauta"("tenantId", "reuniaoId");

-- CreateIndex
CREATE UNIQUE INDEX "GovPautaModelo_tenantId_chave_key" ON "GovPautaModelo"("tenantId", "chave");

-- CreateIndex
CREATE INDEX "GovDeliberacao_tenantId_orgaoId_status_idx" ON "GovDeliberacao"("tenantId", "orgaoId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GovDeliberacao_tenantId_ano_numero_key" ON "GovDeliberacao"("tenantId", "ano", "numero");

-- CreateIndex
CREATE INDEX "GovVotoRegistro_tenantId_deliberacaoId_idx" ON "GovVotoRegistro"("tenantId", "deliberacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "GovVotoRegistro_deliberacaoId_membroId_key" ON "GovVotoRegistro"("deliberacaoId", "membroId");

-- CreateIndex
CREATE INDEX "GovCipaGestao_tenantId_status_idx" ON "GovCipaGestao"("tenantId", "status");

-- CreateIndex
CREATE INDEX "GovCipaMembro_tenantId_gestaoId_idx" ON "GovCipaMembro"("tenantId", "gestaoId");

-- CreateIndex
CREATE INDEX "GovCipaReuniao_tenantId_gestaoId_competencia_idx" ON "GovCipaReuniao"("tenantId", "gestaoId", "competencia");

-- CreateIndex
CREATE INDEX "GovCipaRisco_tenantId_nivel_status_idx" ON "GovCipaRisco"("tenantId", "nivel", "status");

-- CreateIndex
CREATE INDEX "GovCipaInspecao_tenantId_data_idx" ON "GovCipaInspecao"("tenantId", "data");

-- CreateIndex
CREATE INDEX "GovCipaAcidente_tenantId_data_idx" ON "GovCipaAcidente"("tenantId", "data");

-- CreateIndex
CREATE INDEX "GovCipaAcidente_tenantId_catObrigatoria_catEmitida_idx" ON "GovCipaAcidente"("tenantId", "catObrigatoria", "catEmitida");

-- CreateIndex
CREATE INDEX "GovCipaSipat_tenantId_ano_idx" ON "GovCipaSipat"("tenantId", "ano");

-- CreateIndex
CREATE INDEX "GovCipaPlanoAcao_tenantId_status_prazo_idx" ON "GovCipaPlanoAcao"("tenantId", "status", "prazo");

-- CreateIndex
CREATE INDEX "GovCarreiraPlano_tenantId_tipo_idx" ON "GovCarreiraPlano"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "GovCarreiraNivel_tenantId_planoId_idx" ON "GovCarreiraNivel"("tenantId", "planoId");

-- CreateIndex
CREATE UNIQUE INDEX "GovCarreiraNivel_planoId_ordem_key" ON "GovCarreiraNivel"("planoId", "ordem");

-- CreateIndex
CREATE INDEX "GovCarreiraEnquadramento_tenantId_planoId_idx" ON "GovCarreiraEnquadramento"("tenantId", "planoId");

-- CreateIndex
CREATE INDEX "GovCarreiraEnquadramento_tenantId_docenteId_idx" ON "GovCarreiraEnquadramento"("tenantId", "docenteId");

-- CreateIndex
CREATE INDEX "GovCarreiraProgressao_tenantId_status_idx" ON "GovCarreiraProgressao"("tenantId", "status");

-- CreateIndex
CREATE INDEX "GovCarreiraProgressao_tenantId_enquadramentoId_idx" ON "GovCarreiraProgressao"("tenantId", "enquadramentoId");

-- CreateIndex
CREATE UNIQUE INDEX "InfSequencia_tenantId_chave_key" ON "InfSequencia"("tenantId", "chave");

-- CreateIndex
CREATE INDEX "InfCategoriaBem_tenantId_idx" ON "InfCategoriaBem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "InfCategoriaBem_tenantId_codigo_key" ON "InfCategoriaBem"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "InfBem_tenantId_categoriaId_idx" ON "InfBem"("tenantId", "categoriaId");

-- CreateIndex
CREATE INDEX "InfBem_tenantId_spaceId_idx" ON "InfBem"("tenantId", "spaceId");

-- CreateIndex
CREATE INDEX "InfBem_tenantId_status_idx" ON "InfBem"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InfBem_tenantId_tombamento_key" ON "InfBem"("tenantId", "tombamento");

-- CreateIndex
CREATE INDEX "InfMovimentacaoBem_tenantId_bemId_createdAt_idx" ON "InfMovimentacaoBem"("tenantId", "bemId", "createdAt");

-- CreateIndex
CREATE INDEX "InfInventario_tenantId_status_idx" ON "InfInventario"("tenantId", "status");

-- CreateIndex
CREATE INDEX "InfInventarioItem_tenantId_inventarioId_idx" ON "InfInventarioItem"("tenantId", "inventarioId");

-- CreateIndex
CREATE INDEX "InfInventarioItem_tenantId_bemId_idx" ON "InfInventarioItem"("tenantId", "bemId");

-- CreateIndex
CREATE INDEX "InfPlanoPreventivo_tenantId_ativo_proximaExecucao_idx" ON "InfPlanoPreventivo"("tenantId", "ativo", "proximaExecucao");

-- CreateIndex
CREATE INDEX "InfOrdemServico_tenantId_status_prazoSla_idx" ON "InfOrdemServico"("tenantId", "status", "prazoSla");

-- CreateIndex
CREATE INDEX "InfOrdemServico_tenantId_bemId_idx" ON "InfOrdemServico"("tenantId", "bemId");

-- CreateIndex
CREATE INDEX "InfOrdemServico_tenantId_spaceId_idx" ON "InfOrdemServico"("tenantId", "spaceId");

-- CreateIndex
CREATE INDEX "InfOrdemServico_tenantId_planoId_idx" ON "InfOrdemServico"("tenantId", "planoId");

-- CreateIndex
CREATE UNIQUE INDEX "InfOrdemServico_tenantId_numero_key" ON "InfOrdemServico"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "InfOsPeca_tenantId_osId_idx" ON "InfOsPeca"("tenantId", "osId");

-- CreateIndex
CREATE INDEX "InfChamado_tenantId_status_idx" ON "InfChamado"("tenantId", "status");

-- CreateIndex
CREATE INDEX "InfChamado_tenantId_solicitanteUserId_idx" ON "InfChamado"("tenantId", "solicitanteUserId");

-- CreateIndex
CREATE UNIQUE INDEX "InfChamado_tenantId_numero_key" ON "InfChamado"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "InfChamadoComentario_tenantId_chamadoId_idx" ON "InfChamadoComentario"("tenantId", "chamadoId");

-- CreateIndex
CREATE INDEX "InfProjeto_tenantId_status_idx" ON "InfProjeto"("tenantId", "status");

-- CreateIndex
CREATE INDEX "InfProjetoEtapa_tenantId_projetoId_idx" ON "InfProjetoEtapa"("tenantId", "projetoId");

-- CreateIndex
CREATE INDEX "InfAreaEstacionamento_tenantId_idx" ON "InfAreaEstacionamento"("tenantId");

-- CreateIndex
CREATE INDEX "InfVaga_tenantId_areaId_idx" ON "InfVaga"("tenantId", "areaId");

-- CreateIndex
CREATE UNIQUE INDEX "InfVaga_tenantId_areaId_codigo_key" ON "InfVaga"("tenantId", "areaId", "codigo");

-- CreateIndex
CREATE INDEX "InfVeiculo_tenantId_credencialStatus_idx" ON "InfVeiculo"("tenantId", "credencialStatus");

-- CreateIndex
CREATE UNIQUE INDEX "InfVeiculo_tenantId_placa_key" ON "InfVeiculo"("tenantId", "placa");

-- CreateIndex
CREATE INDEX "InfAcessoEstacionamento_tenantId_areaId_saidaEm_idx" ON "InfAcessoEstacionamento"("tenantId", "areaId", "saidaEm");

-- CreateIndex
CREATE INDEX "InfAcessoEstacionamento_tenantId_placa_idx" ON "InfAcessoEstacionamento"("tenantId", "placa");

-- CreateIndex
CREATE INDEX "InfAcessoEstacionamento_tenantId_entradaEm_idx" ON "InfAcessoEstacionamento"("tenantId", "entradaEm");

-- CreateIndex
CREATE INDEX "InfOcorrenciaEstacionamento_tenantId_status_idx" ON "InfOcorrenciaEstacionamento"("tenantId", "status");

-- CreateIndex
CREATE INDEX "InfOcorrenciaEstacionamento_tenantId_placa_idx" ON "InfOcorrenciaEstacionamento"("tenantId", "placa");

-- CreateIndex
CREATE INDEX "InfReservaArea_tenantId_spaceId_inicio_fim_idx" ON "InfReservaArea"("tenantId", "spaceId", "inicio", "fim");

-- CreateIndex
CREATE INDEX "InfReservaArea_tenantId_status_idx" ON "InfReservaArea"("tenantId", "status");

-- CreateIndex
CREATE INDEX "InfRegraUso_tenantId_spaceId_idx" ON "InfRegraUso"("tenantId", "spaceId");

-- CreateIndex
CREATE INDEX "InfPontoLuz_tenantId_status_idx" ON "InfPontoLuz"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InfPontoLuz_tenantId_codigo_key" ON "InfPontoLuz"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "InfMedidor_tenantId_tipo_idx" ON "InfMedidor"("tenantId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "InfMedidor_tenantId_codigo_key" ON "InfMedidor"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "InfLeitura_tenantId_medidorId_dataLeitura_idx" ON "InfLeitura"("tenantId", "medidorId", "dataLeitura");

-- CreateIndex
CREATE INDEX "InfAcaoEficiencia_tenantId_status_idx" ON "InfAcaoEficiencia"("tenantId", "status");

-- CreateIndex
CREATE INDEX "InfRequisitoCurso_tenantId_programId_idx" ON "InfRequisitoCurso"("tenantId", "programId");

-- CreateIndex
CREATE INDEX "JorTemplate_tenantId_persona_status_idx" ON "JorTemplate"("tenantId", "persona", "status");

-- CreateIndex
CREATE UNIQUE INDEX "JorTemplate_tenantId_chave_versao_key" ON "JorTemplate"("tenantId", "chave", "versao");

-- CreateIndex
CREATE INDEX "JorNo_tenantId_templateId_idx" ON "JorNo"("tenantId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "JorNo_templateId_chave_key" ON "JorNo"("templateId", "chave");

-- CreateIndex
CREATE INDEX "JorTransicao_tenantId_templateId_idx" ON "JorTransicao"("tenantId", "templateId");

-- CreateIndex
CREATE INDEX "JorTransicao_templateId_deChave_idx" ON "JorTransicao"("templateId", "deChave");

-- CreateIndex
CREATE INDEX "JorInstancia_tenantId_status_idx" ON "JorInstancia"("tenantId", "status");

-- CreateIndex
CREATE INDEX "JorInstancia_tenantId_personType_personId_idx" ON "JorInstancia"("tenantId", "personType", "personId");

-- CreateIndex
CREATE INDEX "JorInstancia_tenantId_templateId_status_idx" ON "JorInstancia"("tenantId", "templateId", "status");

-- CreateIndex
CREATE INDEX "JorEtapa_tenantId_status_prazoEm_idx" ON "JorEtapa"("tenantId", "status", "prazoEm");

-- CreateIndex
CREATE INDEX "JorEtapa_instanciaId_status_idx" ON "JorEtapa"("instanciaId", "status");

-- CreateIndex
CREATE INDEX "JorEtapa_tenantId_papel_status_idx" ON "JorEtapa"("tenantId", "papel", "status");

-- CreateIndex
CREATE INDEX "JorEtapa_tenantId_noChave_idx" ON "JorEtapa"("tenantId", "noChave");

-- CreateIndex
CREATE INDEX "JorHistorico_tenantId_instanciaId_createdAt_idx" ON "JorHistorico"("tenantId", "instanciaId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModConfig_tenantId_key" ON "ModConfig"("tenantId");

-- CreateIndex
CREATE INDEX "ModVerificacao_tenantId_programId_idx" ON "ModVerificacao"("tenantId", "programId");

-- CreateIndex
CREATE INDEX "ModOferta_tenantId_programId_idx" ON "ModOferta"("tenantId", "programId");

-- CreateIndex
CREATE INDEX "ModOferta_tenantId_classSectionId_idx" ON "ModOferta"("tenantId", "classSectionId");

-- CreateIndex
CREATE INDEX "ModEncontro_tenantId_inicio_idx" ON "ModEncontro"("tenantId", "inicio");

-- CreateIndex
CREATE INDEX "ModEncontro_ofertaId_idx" ON "ModEncontro"("ofertaId");

-- CreateIndex
CREATE INDEX "ModAulaLive_tenantId_inicio_idx" ON "ModAulaLive"("tenantId", "inicio");

-- CreateIndex
CREATE INDEX "ModLiveEvento_liveId_studentId_idx" ON "ModLiveEvento"("liveId", "studentId");

-- CreateIndex
CREATE INDEX "ModLiveEvento_tenantId_idx" ON "ModLiveEvento"("tenantId");

-- CreateIndex
CREATE INDEX "ModLivePresenca_tenantId_idx" ON "ModLivePresenca"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ModLivePresenca_liveId_studentId_key" ON "ModLivePresenca"("liveId", "studentId");

-- CreateIndex
CREATE INDEX "ModPolo_tenantId_statusCredenciamento_idx" ON "ModPolo"("tenantId", "statusCredenciamento");

-- CreateIndex
CREATE UNIQUE INDEX "ModPolo_tenantId_codigo_key" ON "ModPolo"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "ModPoloChecklistItem_tenantId_idx" ON "ModPoloChecklistItem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ModPoloChecklistItem_poloId_chave_key" ON "ModPoloChecklistItem"("poloId", "chave");

-- CreateIndex
CREATE INDEX "ModPoloOferta_tenantId_programId_idx" ON "ModPoloOferta"("tenantId", "programId");

-- CreateIndex
CREATE UNIQUE INDEX "ModPoloOferta_poloId_programId_termId_key" ON "ModPoloOferta"("poloId", "programId", "termId");

-- CreateIndex
CREATE INDEX "ModPoloAluno_tenantId_studentId_idx" ON "ModPoloAluno"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ModPoloAluno_poloId_studentId_key" ON "ModPoloAluno"("poloId", "studentId");

-- CreateIndex
CREATE INDEX "ModTutor_tenantId_ativo_idx" ON "ModTutor"("tenantId", "ativo");

-- CreateIndex
CREATE INDEX "ModTutorAlocacao_tenantId_tutorId_idx" ON "ModTutorAlocacao"("tenantId", "tutorId");

-- CreateIndex
CREATE INDEX "ModTutorAlocacao_tenantId_classSectionId_idx" ON "ModTutorAlocacao"("tenantId", "classSectionId");

-- CreateIndex
CREATE INDEX "ModAtendimento_tenantId_status_slaLimite_idx" ON "ModAtendimento"("tenantId", "status", "slaLimite");

-- CreateIndex
CREATE INDEX "ModAtendimento_tenantId_tutorId_idx" ON "ModAtendimento"("tenantId", "tutorId");

-- CreateIndex
CREATE INDEX "ModAtendimento_tenantId_studentId_idx" ON "ModAtendimento"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ModAtendimentoMensagem_atendimentoId_idx" ON "ModAtendimentoMensagem"("atendimentoId");

-- CreateIndex
CREATE INDEX "ModTutorAvaliacao_tenantId_tutorId_idx" ON "ModTutorAvaliacao"("tenantId", "tutorId");

-- CreateIndex
CREATE INDEX "ModEngajamentoEvento_tenantId_studentId_ocorridoEm_idx" ON "ModEngajamentoEvento"("tenantId", "studentId", "ocorridoEm");

-- CreateIndex
CREATE INDEX "ModEngajamentoEvento_tenantId_classSectionId_ocorridoEm_idx" ON "ModEngajamentoEvento"("tenantId", "classSectionId", "ocorridoEm");

-- CreateIndex
CREATE INDEX "ModEngajamentoResumo_tenantId_nivel_idx" ON "ModEngajamentoResumo"("tenantId", "nivel");

-- CreateIndex
CREATE UNIQUE INDEX "ModEngajamentoResumo_tenantId_studentId_key" ON "ModEngajamentoResumo"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ModAlertaInatividade_tenantId_status_idx" ON "ModAlertaInatividade"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ModAlertaInatividade_tenantId_studentId_idx" ON "ModAlertaInatividade"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ModAgendaPratica_tenantId_inicio_idx" ON "ModAgendaPratica"("tenantId", "inicio");

-- CreateIndex
CREATE INDEX "ModAgendaPratica_tenantId_poloId_idx" ON "ModAgendaPratica"("tenantId", "poloId");

-- CreateIndex
CREATE INDEX "ModPraticaInscricao_tenantId_studentId_idx" ON "ModPraticaInscricao"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ModPraticaInscricao_agendaId_studentId_key" ON "ModPraticaInscricao"("agendaId", "studentId");

-- CreateIndex
CREATE INDEX "ModEstagio_tenantId_studentId_idx" ON "ModEstagio"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ModHoraPratica_tenantId_studentId_idx" ON "ModHoraPratica"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ModPosPrograma_tenantId_nivel_idx" ON "ModPosPrograma"("tenantId", "nivel");

-- CreateIndex
CREATE UNIQUE INDEX "ModPosPrograma_tenantId_codigo_key" ON "ModPosPrograma"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "ModPosArea_tenantId_posId_idx" ON "ModPosArea"("tenantId", "posId");

-- CreateIndex
CREATE INDEX "ModPosLinha_tenantId_posId_idx" ON "ModPosLinha"("tenantId", "posId");

-- CreateIndex
CREATE INDEX "ModPosModulo_tenantId_posId_idx" ON "ModPosModulo"("tenantId", "posId");

-- CreateIndex
CREATE INDEX "ModPosTurma_tenantId_idx" ON "ModPosTurma"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ModPosTurma_posId_codigo_key" ON "ModPosTurma"("posId", "codigo");

-- CreateIndex
CREATE INDEX "ModPosDocente_tenantId_posId_idx" ON "ModPosDocente"("tenantId", "posId");

-- CreateIndex
CREATE INDEX "ModPosDisciplina_tenantId_idx" ON "ModPosDisciplina"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ModPosDisciplina_posId_codigo_key" ON "ModPosDisciplina"("posId", "codigo");

-- CreateIndex
CREATE INDEX "ModPosColegiado_tenantId_posId_idx" ON "ModPosColegiado"("tenantId", "posId");

-- CreateIndex
CREATE INDEX "ModPosAluno_tenantId_status_idx" ON "ModPosAluno"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ModPosAluno_tenantId_orientadorId_idx" ON "ModPosAluno"("tenantId", "orientadorId");

-- CreateIndex
CREATE UNIQUE INDEX "ModPosAluno_posId_studentId_key" ON "ModPosAluno"("posId", "studentId");

-- CreateIndex
CREATE INDEX "ModPosBanca_tenantId_dataHora_idx" ON "ModPosBanca"("tenantId", "dataHora");

-- CreateIndex
CREATE INDEX "ModPosBolsa_tenantId_status_fim_idx" ON "ModPosBolsa"("tenantId", "status", "fim");

-- CreateIndex
CREATE INDEX "ModPosOferta_tenantId_status_idx" ON "ModPosOferta"("tenantId", "status");

-- CreateIndex
CREATE INDEX "NtRegraAvaliacao_tenantId_escopo_idx" ON "NtRegraAvaliacao"("tenantId", "escopo");

-- CreateIndex
CREATE INDEX "NtRegraAvaliacao_tenantId_programId_idx" ON "NtRegraAvaliacao"("tenantId", "programId");

-- CreateIndex
CREATE INDEX "NtRegraAvaliacao_tenantId_classSectionId_idx" ON "NtRegraAvaliacao"("tenantId", "classSectionId");

-- CreateIndex
CREATE INDEX "NtComponente_tenantId_classSectionId_idx" ON "NtComponente"("tenantId", "classSectionId");

-- CreateIndex
CREATE UNIQUE INDEX "NtComponente_classSectionId_codigo_key" ON "NtComponente"("classSectionId", "codigo");

-- CreateIndex
CREATE INDEX "NtLancamento_tenantId_classSectionId_idx" ON "NtLancamento"("tenantId", "classSectionId");

-- CreateIndex
CREATE INDEX "NtLancamento_tenantId_studentId_idx" ON "NtLancamento"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "NtLancamento_componenteId_studentId_key" ON "NtLancamento"("componenteId", "studentId");

-- CreateIndex
CREATE INDEX "NtLancamentoHistorico_tenantId_lancamentoId_idx" ON "NtLancamentoHistorico"("tenantId", "lancamentoId");

-- CreateIndex
CREATE INDEX "NtLancamentoHistorico_tenantId_classSectionId_idx" ON "NtLancamentoHistorico"("tenantId", "classSectionId");

-- CreateIndex
CREATE INDEX "NtDiario_tenantId_status_idx" ON "NtDiario"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NtDiario_classSectionId_key" ON "NtDiario"("classSectionId");

-- CreateIndex
CREATE INDEX "NtResultado_tenantId_studentId_idx" ON "NtResultado"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "NtResultado_tenantId_termId_idx" ON "NtResultado"("tenantId", "termId");

-- CreateIndex
CREATE INDEX "NtResultado_tenantId_situacao_idx" ON "NtResultado"("tenantId", "situacao");

-- CreateIndex
CREATE UNIQUE INDEX "NtResultado_classSectionId_studentId_key" ON "NtResultado"("classSectionId", "studentId");

-- CreateIndex
CREATE INDEX "NtRevisao_tenantId_status_idx" ON "NtRevisao"("tenantId", "status");

-- CreateIndex
CREATE INDEX "NtRevisao_tenantId_studentId_idx" ON "NtRevisao"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "NtRevisao_tenantId_classSectionId_idx" ON "NtRevisao"("tenantId", "classSectionId");

-- CreateIndex
CREATE INDEX "PesPublicacao_tenantId_tipo_ano_idx" ON "PesPublicacao"("tenantId", "tipo", "ano");

-- CreateIndex
CREATE INDEX "PesPublicacao_tenantId_programId_idx" ON "PesPublicacao"("tenantId", "programId");

-- CreateIndex
CREATE INDEX "PesPublicacao_tenantId_grupoId_idx" ON "PesPublicacao"("tenantId", "grupoId");

-- CreateIndex
CREATE INDEX "PesPublicacao_tenantId_doi_idx" ON "PesPublicacao"("tenantId", "doi");

-- CreateIndex
CREATE UNIQUE INDEX "PesPublicacao_tenantId_hashDedupe_key" ON "PesPublicacao"("tenantId", "hashDedupe");

-- CreateIndex
CREATE INDEX "PesPublicacaoAutor_tenantId_userId_idx" ON "PesPublicacaoAutor"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "PesPublicacaoAutor_tenantId_studentId_idx" ON "PesPublicacaoAutor"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "PesPublicacaoAutor_publicacaoId_idx" ON "PesPublicacaoAutor"("publicacaoId");

-- CreateIndex
CREATE INDEX "PesGrupo_tenantId_ativo_idx" ON "PesGrupo"("tenantId", "ativo");

-- CreateIndex
CREATE INDEX "PesGrupo_tenantId_liderUserId_idx" ON "PesGrupo"("tenantId", "liderUserId");

-- CreateIndex
CREATE INDEX "PesGrupoLinha_tenantId_grupoId_idx" ON "PesGrupoLinha"("tenantId", "grupoId");

-- CreateIndex
CREATE INDEX "PesGrupoMembro_tenantId_grupoId_idx" ON "PesGrupoMembro"("tenantId", "grupoId");

-- CreateIndex
CREATE INDEX "PesGrupoMembro_tenantId_userId_idx" ON "PesGrupoMembro"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "PesGrupoMembro_tenantId_studentId_idx" ON "PesGrupoMembro"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "PesProjeto_tenantId_status_idx" ON "PesProjeto"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PesProjeto_tenantId_coordenadorUserId_idx" ON "PesProjeto"("tenantId", "coordenadorUserId");

-- CreateIndex
CREATE INDEX "PesProjeto_tenantId_grupoId_idx" ON "PesProjeto"("tenantId", "grupoId");

-- CreateIndex
CREATE INDEX "PesProjeto_tenantId_programId_idx" ON "PesProjeto"("tenantId", "programId");

-- CreateIndex
CREATE UNIQUE INDEX "PesProjeto_tenantId_codigo_key" ON "PesProjeto"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "PesProjetoMembro_tenantId_projetoId_idx" ON "PesProjetoMembro"("tenantId", "projetoId");

-- CreateIndex
CREATE INDEX "PesProjetoMembro_tenantId_studentId_idx" ON "PesProjetoMembro"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "PesProjetoMembro_tenantId_userId_idx" ON "PesProjetoMembro"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "PesProjetoEtapa_tenantId_projetoId_idx" ON "PesProjetoEtapa"("tenantId", "projetoId");

-- CreateIndex
CREATE INDEX "PesProjetoRubrica_tenantId_projetoId_idx" ON "PesProjetoRubrica"("tenantId", "projetoId");

-- CreateIndex
CREATE INDEX "PesProjetoLancamento_tenantId_projetoId_idx" ON "PesProjetoLancamento"("tenantId", "projetoId");

-- CreateIndex
CREATE INDEX "PesProjetoLancamento_rubricaId_idx" ON "PesProjetoLancamento"("rubricaId");

-- CreateIndex
CREATE INDEX "PesProjetoEntregavel_tenantId_projetoId_idx" ON "PesProjetoEntregavel"("tenantId", "projetoId");

-- CreateIndex
CREATE INDEX "PesProjetoEntregavel_tenantId_status_prazo_idx" ON "PesProjetoEntregavel"("tenantId", "status", "prazo");

-- CreateIndex
CREATE INDEX "PesProjetoRelatorio_tenantId_projetoId_idx" ON "PesProjetoRelatorio"("tenantId", "projetoId");

-- CreateIndex
CREATE INDEX "PesProjetoRelatorio_tenantId_status_prazo_idx" ON "PesProjetoRelatorio"("tenantId", "status", "prazo");

-- CreateIndex
CREATE INDEX "PesEdital_tenantId_status_idx" ON "PesEdital"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PesEdital_tenantId_numero_key" ON "PesEdital"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "PesEditalInscricao_tenantId_editalId_status_idx" ON "PesEditalInscricao"("tenantId", "editalId", "status");

-- CreateIndex
CREATE INDEX "PesEditalInscricao_tenantId_proponenteUserId_idx" ON "PesEditalInscricao"("tenantId", "proponenteUserId");

-- CreateIndex
CREATE INDEX "PesEditalAvaliacao_tenantId_avaliadorUserId_concluida_idx" ON "PesEditalAvaliacao"("tenantId", "avaliadorUserId", "concluida");

-- CreateIndex
CREATE UNIQUE INDEX "PesEditalAvaliacao_inscricaoId_avaliadorUserId_key" ON "PesEditalAvaliacao"("inscricaoId", "avaliadorUserId");

-- CreateIndex
CREATE INDEX "PesBolsa_tenantId_status_idx" ON "PesBolsa"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PesBolsa_tenantId_studentId_idx" ON "PesBolsa"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "PesBolsa_tenantId_projetoId_idx" ON "PesBolsa"("tenantId", "projetoId");

-- CreateIndex
CREATE INDEX "PesBolsaPagamento_tenantId_status_competencia_idx" ON "PesBolsaPagamento"("tenantId", "status", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "PesBolsaPagamento_bolsaId_competencia_key" ON "PesBolsaPagamento"("bolsaId", "competencia");

-- CreateIndex
CREATE INDEX "PesTrabalho_tenantId_status_idx" ON "PesTrabalho"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PesTrabalho_tenantId_studentId_idx" ON "PesTrabalho"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "PesTrabalho_tenantId_orientadorUserId_idx" ON "PesTrabalho"("tenantId", "orientadorUserId");

-- CreateIndex
CREATE INDEX "PesTrabalho_tenantId_programId_idx" ON "PesTrabalho"("tenantId", "programId");

-- CreateIndex
CREATE INDEX "PesTrabalhoBanca_tenantId_trabalhoId_idx" ON "PesTrabalhoBanca"("tenantId", "trabalhoId");

-- CreateIndex
CREATE INDEX "PesTrabalhoBanca_tenantId_userId_idx" ON "PesTrabalhoBanca"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "PesTrabalhoVersao_tenantId_trabalhoId_idx" ON "PesTrabalhoVersao"("tenantId", "trabalhoId");

-- CreateIndex
CREATE UNIQUE INDEX "PesTrabalhoVersao_trabalhoId_numero_key" ON "PesTrabalhoVersao"("trabalhoId", "numero");

-- CreateIndex
CREATE INDEX "PesTrabalhoEvento_tenantId_trabalhoId_idx" ON "PesTrabalhoEvento"("tenantId", "trabalhoId");

-- CreateIndex
CREATE INDEX "PesTrabalhoOrientacao_tenantId_trabalhoId_idx" ON "PesTrabalhoOrientacao"("tenantId", "trabalhoId");

-- CreateIndex
CREATE INDEX "PesPeriodico_tenantId_ativo_idx" ON "PesPeriodico"("tenantId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "PesPeriodico_tenantId_slug_key" ON "PesPeriodico"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "PesPeriodicoEquipe_tenantId_periodicoId_papel_idx" ON "PesPeriodicoEquipe"("tenantId", "periodicoId", "papel");

-- CreateIndex
CREATE INDEX "PesPeriodicoEquipe_tenantId_userId_idx" ON "PesPeriodicoEquipe"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "PesEdicao_tenantId_periodicoId_status_idx" ON "PesEdicao"("tenantId", "periodicoId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PesEdicao_periodicoId_volume_numero_ano_key" ON "PesEdicao"("periodicoId", "volume", "numero", "ano");

-- CreateIndex
CREATE INDEX "PesSecao_tenantId_periodicoId_idx" ON "PesSecao"("tenantId", "periodicoId");

-- CreateIndex
CREATE INDEX "PesSubmissao_tenantId_periodicoId_status_idx" ON "PesSubmissao"("tenantId", "periodicoId", "status");

-- CreateIndex
CREATE INDEX "PesSubmissao_tenantId_edicaoId_idx" ON "PesSubmissao"("tenantId", "edicaoId");

-- CreateIndex
CREATE INDEX "PesSubmissao_tenantId_submissorUserId_idx" ON "PesSubmissao"("tenantId", "submissorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PesSubmissao_tenantId_codigo_key" ON "PesSubmissao"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "PesSubmissaoVersao_tenantId_submissaoId_idx" ON "PesSubmissaoVersao"("tenantId", "submissaoId");

-- CreateIndex
CREATE UNIQUE INDEX "PesSubmissaoVersao_submissaoId_numero_key" ON "PesSubmissaoVersao"("submissaoId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "PesRevisao_token_key" ON "PesRevisao"("token");

-- CreateIndex
CREATE INDEX "PesRevisao_tenantId_submissaoId_rodada_idx" ON "PesRevisao"("tenantId", "submissaoId", "rodada");

-- CreateIndex
CREATE INDEX "PesRevisao_tenantId_revisorUserId_status_idx" ON "PesRevisao"("tenantId", "revisorUserId", "status");

-- CreateIndex
CREATE INDEX "PesRevisao_tenantId_status_prazo_idx" ON "PesRevisao"("tenantId", "status", "prazo");

-- CreateIndex
CREATE INDEX "PesDecisao_tenantId_submissaoId_idx" ON "PesDecisao"("tenantId", "submissaoId");

-- CreateIndex
CREATE INDEX "PesEvento_tenantId_status_idx" ON "PesEvento"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PesEvento_tenantId_slug_key" ON "PesEvento"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "PesEventoTrabalho_tenantId_eventoId_status_idx" ON "PesEventoTrabalho"("tenantId", "eventoId", "status");

-- CreateIndex
CREATE INDEX "PesEventoTrabalho_tenantId_submissorUserId_idx" ON "PesEventoTrabalho"("tenantId", "submissorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PesEventoTrabalho_tenantId_codigo_key" ON "PesEventoTrabalho"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "PesEventoAvaliacao_tenantId_avaliadorUserId_concluida_idx" ON "PesEventoAvaliacao"("tenantId", "avaliadorUserId", "concluida");

-- CreateIndex
CREATE UNIQUE INDEX "PesEventoAvaliacao_trabalhoId_avaliadorUserId_key" ON "PesEventoAvaliacao"("trabalhoId", "avaliadorUserId");

-- CreateIndex
CREATE INDEX "RegProcesso_tenantId_etapa_idx" ON "RegProcesso"("tenantId", "etapa");

-- CreateIndex
CREATE INDEX "RegProcesso_tenantId_tipo_idx" ON "RegProcesso"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "RegProcesso_tenantId_programId_idx" ON "RegProcesso"("tenantId", "programId");

-- CreateIndex
CREATE INDEX "RegProcessoHistorico_tenantId_processoId_idx" ON "RegProcessoHistorico"("tenantId", "processoId");

-- CreateIndex
CREATE INDEX "RegDiligencia_tenantId_status_prazoResposta_idx" ON "RegDiligencia"("tenantId", "status", "prazoResposta");

-- CreateIndex
CREATE INDEX "RegDiligencia_tenantId_processoId_idx" ON "RegDiligencia"("tenantId", "processoId");

-- CreateIndex
CREATE INDEX "RegAto_tenantId_vencimento_idx" ON "RegAto"("tenantId", "vencimento");

-- CreateIndex
CREATE INDEX "RegAto_tenantId_programId_idx" ON "RegAto"("tenantId", "programId");

-- CreateIndex
CREATE UNIQUE INDEX "RegAto_tenantId_tipo_numero_key" ON "RegAto"("tenantId", "tipo", "numero");

-- CreateIndex
CREATE INDEX "RegChecklistModelo_tenantId_tipoProcesso_idx" ON "RegChecklistModelo"("tenantId", "tipoProcesso");

-- CreateIndex
CREATE UNIQUE INDEX "RegChecklistModelo_tenantId_chave_key" ON "RegChecklistModelo"("tenantId", "chave");

-- CreateIndex
CREATE INDEX "RegChecklistModeloItem_tenantId_modeloId_idx" ON "RegChecklistModeloItem"("tenantId", "modeloId");

-- CreateIndex
CREATE INDEX "RegChecklist_tenantId_processoId_idx" ON "RegChecklist"("tenantId", "processoId");

-- CreateIndex
CREATE INDEX "RegChecklist_tenantId_programId_idx" ON "RegChecklist"("tenantId", "programId");

-- CreateIndex
CREATE INDEX "RegChecklistItem_tenantId_checklistId_idx" ON "RegChecklistItem"("tenantId", "checklistId");

-- CreateIndex
CREATE INDEX "RegChecklistItem_tenantId_status_prazo_idx" ON "RegChecklistItem"("tenantId", "status", "prazo");

-- CreateIndex
CREATE INDEX "RegIndicador_tenantId_instrumento_dimensao_idx" ON "RegIndicador"("tenantId", "instrumento", "dimensao");

-- CreateIndex
CREATE INDEX "RegIndicador_tenantId_programId_idx" ON "RegIndicador"("tenantId", "programId");

-- CreateIndex
CREATE INDEX "RegSimulacao_tenantId_tipo_createdAt_idx" ON "RegSimulacao"("tenantId", "tipo", "createdAt");

-- CreateIndex
CREATE INDEX "RegAnaliseDocumento_tenantId_processoId_idx" ON "RegAnaliseDocumento"("tenantId", "processoId");

-- CreateIndex
CREATE INDEX "RegAnaliseDocumento_tenantId_createdAt_idx" ON "RegAnaliseDocumento"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ReiObjetivo_tenantId_ciclo_status_idx" ON "ReiObjetivo"("tenantId", "ciclo", "status");

-- CreateIndex
CREATE INDEX "ReiObjetivo_tenantId_programId_idx" ON "ReiObjetivo"("tenantId", "programId");

-- CreateIndex
CREATE UNIQUE INDEX "ReiObjetivo_tenantId_codigo_key" ON "ReiObjetivo"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "ReiResultadoChave_tenantId_objetivoId_idx" ON "ReiResultadoChave"("tenantId", "objetivoId");

-- CreateIndex
CREATE INDEX "ReiResultadoChave_tenantId_indicadorChave_idx" ON "ReiResultadoChave"("tenantId", "indicadorChave");

-- CreateIndex
CREATE INDEX "ReiCheckin_tenantId_resultadoId_createdAt_idx" ON "ReiCheckin"("tenantId", "resultadoId", "createdAt");

-- CreateIndex
CREATE INDEX "ReiSnapshot_tenantId_dia_idx" ON "ReiSnapshot"("tenantId", "dia");

-- CreateIndex
CREATE UNIQUE INDEX "ReiSnapshot_tenantId_chave_dia_key" ON "ReiSnapshot"("tenantId", "chave", "dia");

-- CreateIndex
CREATE INDEX "ReiRelatorio_tenantId_createdAt_idx" ON "ReiRelatorio"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ReiConsultaIA_tenantId_createdAt_idx" ON "ReiConsultaIA"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SecContador_tenantId_chave_key" ON "SecContador"("tenantId", "chave");

-- CreateIndex
CREATE INDEX "SecTipoRequerimento_tenantId_ativo_idx" ON "SecTipoRequerimento"("tenantId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "SecTipoRequerimento_tenantId_codigo_key" ON "SecTipoRequerimento"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "SecProtocolo_tenantId_status_idx" ON "SecProtocolo"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SecProtocolo_tenantId_studentId_idx" ON "SecProtocolo"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "SecProtocolo_tenantId_prazoEm_idx" ON "SecProtocolo"("tenantId", "prazoEm");

-- CreateIndex
CREATE UNIQUE INDEX "SecProtocolo_tenantId_ano_seq_key" ON "SecProtocolo"("tenantId", "ano", "seq");

-- CreateIndex
CREATE INDEX "SecTramite_tenantId_protocoloId_createdAt_idx" ON "SecTramite"("tenantId", "protocoloId", "createdAt");

-- CreateIndex
CREATE INDEX "SecAnexo_tenantId_protocoloId_idx" ON "SecAnexo"("tenantId", "protocoloId");

-- CreateIndex
CREATE INDEX "SecChecklistModelo_tenantId_processo_idx" ON "SecChecklistModelo"("tenantId", "processo");

-- CreateIndex
CREATE UNIQUE INDEX "SecChecklistModelo_tenantId_codigo_key" ON "SecChecklistModelo"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "SecChecklistItemModelo_tenantId_modeloId_idx" ON "SecChecklistItemModelo"("tenantId", "modeloId");

-- CreateIndex
CREATE INDEX "SecConferencia_tenantId_status_idx" ON "SecConferencia"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SecConferencia_tenantId_protocoloId_idx" ON "SecConferencia"("tenantId", "protocoloId");

-- CreateIndex
CREATE INDEX "SecConferencia_tenantId_studentId_idx" ON "SecConferencia"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "SecConferencia_tenantId_refType_refId_idx" ON "SecConferencia"("tenantId", "refType", "refId");

-- CreateIndex
CREATE INDEX "SecConferenciaItem_tenantId_conferenciaId_idx" ON "SecConferenciaItem"("tenantId", "conferenciaId");

-- CreateIndex
CREATE UNIQUE INDEX "SecDocumentoEmitido_codigo_key" ON "SecDocumentoEmitido"("codigo");

-- CreateIndex
CREATE INDEX "SecDocumentoEmitido_tenantId_tipo_idx" ON "SecDocumentoEmitido"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "SecDocumentoEmitido_tenantId_studentId_idx" ON "SecDocumentoEmitido"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "SecCertModelo_tenantId_tipo_idx" ON "SecCertModelo"("tenantId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "SecCertModelo_tenantId_codigo_key" ON "SecCertModelo"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "SecCertLote_tenantId_modeloId_idx" ON "SecCertLote"("tenantId", "modeloId");

-- CreateIndex
CREATE UNIQUE INDEX "SecCertificado_codigo_key" ON "SecCertificado"("codigo");

-- CreateIndex
CREATE INDEX "SecCertificado_tenantId_status_idx" ON "SecCertificado"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SecCertificado_tenantId_studentId_idx" ON "SecCertificado"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "SecCertificado_tenantId_modeloId_idx" ON "SecCertificado"("tenantId", "modeloId");

-- CreateIndex
CREATE UNIQUE INDEX "SecCertificado_tenantId_numero_key" ON "SecCertificado"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "SecLivro_tenantId_tipo_aberto_idx" ON "SecLivro"("tenantId", "tipo", "aberto");

-- CreateIndex
CREATE UNIQUE INDEX "SecLivro_tenantId_tipo_numero_key" ON "SecLivro"("tenantId", "tipo", "numero");

-- CreateIndex
CREATE INDEX "SecAta_tenantId_tipo_idx" ON "SecAta"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "SecAta_tenantId_colacaoId_idx" ON "SecAta"("tenantId", "colacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "SecDiploma_codigoVerificacao_key" ON "SecDiploma"("codigoVerificacao");

-- CreateIndex
CREATE INDEX "SecDiploma_tenantId_status_idx" ON "SecDiploma"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SecDiploma_tenantId_studentId_idx" ON "SecDiploma"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "SecDiploma_tenantId_colacaoId_idx" ON "SecDiploma"("tenantId", "colacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "SecDiploma_livroId_numeroRegistro_key" ON "SecDiploma"("livroId", "numeroRegistro");

-- CreateIndex
CREATE INDEX "SecColacao_tenantId_status_data_idx" ON "SecColacao"("tenantId", "status", "data");

-- CreateIndex
CREATE INDEX "SecColacaoFormando_tenantId_studentId_idx" ON "SecColacaoFormando"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "SecColacaoFormando_colacaoId_studentId_key" ON "SecColacaoFormando"("colacaoId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "SecTemporalidade_tenantId_codigo_key" ON "SecTemporalidade"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "SecArquivoItem_tenantId_status_idx" ON "SecArquivoItem"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SecArquivoItem_tenantId_eliminarApos_idx" ON "SecArquivoItem"("tenantId", "eliminarApos");

-- CreateIndex
CREATE INDEX "SecArquivoItem_tenantId_studentId_idx" ON "SecArquivoItem"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "SecDescarte_tenantId_status_idx" ON "SecDescarte"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SecDescarte_tenantId_numero_key" ON "SecDescarte"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "SupFornecedor_tenantId_status_idx" ON "SupFornecedor"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SupFornecedor_tenantId_cnpj_key" ON "SupFornecedor"("tenantId", "cnpj");

-- CreateIndex
CREATE INDEX "SupFornecedorDocumento_tenantId_validade_idx" ON "SupFornecedorDocumento"("tenantId", "validade");

-- CreateIndex
CREATE INDEX "SupFornecedorDocumento_fornecedorId_idx" ON "SupFornecedorDocumento"("fornecedorId");

-- CreateIndex
CREATE INDEX "SupFornecedorAvaliacao_tenantId_fornecedorId_idx" ON "SupFornecedorAvaliacao"("tenantId", "fornecedorId");

-- CreateIndex
CREATE INDEX "SupCategoria_tenantId_idx" ON "SupCategoria"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SupCategoria_tenantId_nome_key" ON "SupCategoria"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "SupItem_tenantId_categoriaId_idx" ON "SupItem"("tenantId", "categoriaId");

-- CreateIndex
CREATE UNIQUE INDEX "SupItem_tenantId_codigo_key" ON "SupItem"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "SupAlmoxarifado_tenantId_idx" ON "SupAlmoxarifado"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SupAlmoxarifado_tenantId_codigo_key" ON "SupAlmoxarifado"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "SupSaldo_tenantId_itemId_idx" ON "SupSaldo"("tenantId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "SupSaldo_almoxarifadoId_itemId_key" ON "SupSaldo"("almoxarifadoId", "itemId");

-- CreateIndex
CREATE INDEX "SupLote_tenantId_validade_idx" ON "SupLote"("tenantId", "validade");

-- CreateIndex
CREATE UNIQUE INDEX "SupLote_almoxarifadoId_itemId_numero_key" ON "SupLote"("almoxarifadoId", "itemId", "numero");

-- CreateIndex
CREATE INDEX "SupMovimentacao_tenantId_itemId_createdAt_idx" ON "SupMovimentacao"("tenantId", "itemId", "createdAt");

-- CreateIndex
CREATE INDEX "SupMovimentacao_tenantId_cursoId_idx" ON "SupMovimentacao"("tenantId", "cursoId");

-- CreateIndex
CREATE INDEX "SupMovimentacao_tenantId_origemTipo_origemId_idx" ON "SupMovimentacao"("tenantId", "origemTipo", "origemId");

-- CreateIndex
CREATE INDEX "SupInventario_tenantId_status_idx" ON "SupInventario"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SupInventarioItem_tenantId_idx" ON "SupInventarioItem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SupInventarioItem_inventarioId_itemId_key" ON "SupInventarioItem"("inventarioId", "itemId");

-- CreateIndex
CREATE INDEX "SupAlcada_tenantId_idx" ON "SupAlcada"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SupAlcada_tenantId_nivel_key" ON "SupAlcada"("tenantId", "nivel");

-- CreateIndex
CREATE INDEX "SupRequisicao_tenantId_status_idx" ON "SupRequisicao"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SupRequisicao_tenantId_numero_key" ON "SupRequisicao"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "SupRequisicaoItem_tenantId_requisicaoId_idx" ON "SupRequisicaoItem"("tenantId", "requisicaoId");

-- CreateIndex
CREATE INDEX "SupAprovacao_tenantId_status_papel_idx" ON "SupAprovacao"("tenantId", "status", "papel");

-- CreateIndex
CREATE UNIQUE INDEX "SupAprovacao_requisicaoId_nivel_key" ON "SupAprovacao"("requisicaoId", "nivel");

-- CreateIndex
CREATE INDEX "SupCotacao_tenantId_status_idx" ON "SupCotacao"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SupCotacao_tenantId_numero_key" ON "SupCotacao"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "SupCotacaoProposta_tenantId_idx" ON "SupCotacaoProposta"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SupCotacaoProposta_cotacaoId_fornecedorId_key" ON "SupCotacaoProposta"("cotacaoId", "fornecedorId");

-- CreateIndex
CREATE INDEX "SupCotacaoPreco_tenantId_idx" ON "SupCotacaoPreco"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SupCotacaoPreco_propostaId_requisicaoItemId_key" ON "SupCotacaoPreco"("propostaId", "requisicaoItemId");

-- CreateIndex
CREATE INDEX "SupPedido_tenantId_status_idx" ON "SupPedido"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SupPedido_tenantId_fornecedorId_idx" ON "SupPedido"("tenantId", "fornecedorId");

-- CreateIndex
CREATE UNIQUE INDEX "SupPedido_tenantId_numero_key" ON "SupPedido"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "SupPedidoItem_tenantId_pedidoId_idx" ON "SupPedidoItem"("tenantId", "pedidoId");

-- CreateIndex
CREATE INDEX "SupRecebimento_tenantId_pedidoId_idx" ON "SupRecebimento"("tenantId", "pedidoId");

-- CreateIndex
CREATE INDEX "SupRecebimentoItem_tenantId_recebimentoId_idx" ON "SupRecebimentoItem"("tenantId", "recebimentoId");

-- CreateIndex
CREATE INDEX "SupContrato_tenantId_status_vigenciaFim_idx" ON "SupContrato"("tenantId", "status", "vigenciaFim");

-- CreateIndex
CREATE UNIQUE INDEX "SupContrato_tenantId_numero_key" ON "SupContrato"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "SupKit_tenantId_disciplineId_idx" ON "SupKit"("tenantId", "disciplineId");

-- CreateIndex
CREATE INDEX "SupKitItem_tenantId_idx" ON "SupKitItem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SupKitItem_kitId_itemId_key" ON "SupKitItem"("kitId", "itemId");

-- CreateIndex
CREATE INDEX "SupKitConsumo_tenantId_classSectionId_idx" ON "SupKitConsumo"("tenantId", "classSectionId");

-- CreateIndex
CREATE INDEX "SupKitConsumo_tenantId_kitId_idx" ON "SupKitConsumo"("tenantId", "kitId");

-- CreateIndex
CREATE INDEX "SupProduto_tenantId_canal_idx" ON "SupProduto"("tenantId", "canal");

-- CreateIndex
CREATE UNIQUE INDEX "SupProduto_tenantId_itemId_almoxarifadoId_key" ON "SupProduto"("tenantId", "itemId", "almoxarifadoId");

-- CreateIndex
CREATE INDEX "SupCaixa_tenantId_status_idx" ON "SupCaixa"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SupCaixaMov_tenantId_caixaId_idx" ON "SupCaixaMov"("tenantId", "caixaId");

-- CreateIndex
CREATE INDEX "SupVenda_tenantId_createdAt_idx" ON "SupVenda"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "SupVenda_tenantId_studentId_idx" ON "SupVenda"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "SupVenda_tenantId_numero_key" ON "SupVenda"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "SupVendaItem_tenantId_vendaId_idx" ON "SupVendaItem"("tenantId", "vendaId");

-- CreateIndex
CREATE INDEX "SupDevolucao_tenantId_vendaId_idx" ON "SupDevolucao"("tenantId", "vendaId");

-- CreateIndex
CREATE UNIQUE INDEX "SupSequencia_tenantId_chave_key" ON "SupSequencia"("tenantId", "chave");

-- AddForeignKey
ALTER TABLE "CurriculumDiscipline" ADD CONSTRAINT "CurriculumDiscipline_programId_fkey" FOREIGN KEY ("programId") REFERENCES "AcademicProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumDiscipline" ADD CONSTRAINT "CurriculumDiscipline_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "AcademicProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_termId_fkey" FOREIGN KEY ("termId") REFERENCES "AcademicTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_termId_fkey" FOREIGN KEY ("termId") REFERENCES "AcademicTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSectionEnrollment" ADD CONSTRAINT "ClassSectionEnrollment_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSectionEnrollment" ADD CONSTRAINT "ClassSectionEnrollment_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSessionBooking" ADD CONSTRAINT "ClassSessionBooking_classSessionId_fkey" FOREIGN KEY ("classSessionId") REFERENCES "ClassSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSessionBooking" ADD CONSTRAINT "ClassSessionBooking_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_classSessionId_fkey" FOREIGN KEY ("classSessionId") REFERENCES "ClassSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerSubmission" ADD CONSTRAINT "AnswerSubmission_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerSubmission" ADD CONSTRAINT "AnswerSubmission_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountPayable" ADD CONSTRAINT "AccountPayable_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "EduCostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_accountPayableId_fkey" FOREIGN KEY ("accountPayableId") REFERENCES "AccountPayable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_accountReceivableId_fkey" FOREIGN KEY ("accountReceivableId") REFERENCES "AccountReceivable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_contaDebitoId_fkey" FOREIGN KEY ("contaDebitoId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_contaCreditoId_fkey" FOREIGN KEY ("contaCreditoId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalInvoice" ADD CONSTRAINT "FiscalInvoice_accountReceivableId_fkey" FOREIGN KEY ("accountReceivableId") REFERENCES "AccountReceivable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentLibraryAccess" ADD CONSTRAINT "StudentLibraryAccess_libraryProviderId_fkey" FOREIGN KEY ("libraryProviderId") REFERENCES "LibraryProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmOferta" ADD CONSTRAINT "AdmOferta_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "AdmProcessoSeletivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmCampanhaGasto" ADD CONSTRAINT "AdmCampanhaGasto_campanhaId_fkey" FOREIGN KEY ("campanhaId") REFERENCES "AdmCampanha"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmCandidato" ADD CONSTRAINT "AdmCandidato_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "AdmProcessoSeletivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmCandidato" ADD CONSTRAINT "AdmCandidato_campanhaId_fkey" FOREIGN KEY ("campanhaId") REFERENCES "AdmCampanha"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmInteracao" ADD CONSTRAINT "AdmInteracao_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "AdmCandidato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmResultadoProva" ADD CONSTRAINT "AdmResultadoProva_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "AdmCandidato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmChamada" ADD CONSTRAINT "AdmChamada_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "AdmProcessoSeletivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmConvocacao" ADD CONSTRAINT "AdmConvocacao_chamadaId_fkey" FOREIGN KEY ("chamadaId") REFERENCES "AdmChamada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmConvocacao" ADD CONSTRAINT "AdmConvocacao_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "AdmCandidato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmDocumentoCandidato" ADD CONSTRAINT "AdmDocumentoCandidato_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "AdmCandidato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmMatricula" ADD CONSTRAINT "AdmMatricula_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "AdmCandidato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmBolsaConcessao" ADD CONSTRAINT "AdmBolsaConcessao_bolsaId_fkey" FOREIGN KEY ("bolsaId") REFERENCES "AdmBolsa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmRematricula" ADD CONSTRAINT "AdmRematricula_campanhaId_fkey" FOREIGN KEY ("campanhaId") REFERENCES "AdmRematriculaCampanha"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoAdaptacao" ADD CONSTRAINT "ApoAdaptacao_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "ApoPlanoAee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoMonitoriaCandidatura" ADD CONSTRAINT "ApoMonitoriaCandidatura_vagaId_fkey" FOREIGN KEY ("vagaId") REFERENCES "ApoMonitoriaVaga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoMonitor" ADD CONSTRAINT "ApoMonitor_vagaId_fkey" FOREIGN KEY ("vagaId") REFERENCES "ApoMonitoriaVaga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoMonitoriaFrequencia" ADD CONSTRAINT "ApoMonitoriaFrequencia_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "ApoMonitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoTurmaApoioParticipante" ADD CONSTRAINT "ApoTurmaApoioParticipante_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "ApoTurmaApoio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoMentoriaEncontro" ADD CONSTRAINT "ApoMentoriaEncontro_mentoriaId_fkey" FOREIGN KEY ("mentoriaId") REFERENCES "ApoMentoria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoVaga" ADD CONSTRAINT "ApoVaga_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "ApoEmpresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoCandidaturaVaga" ADD CONSTRAINT "ApoCandidaturaVaga_vagaId_fkey" FOREIGN KEY ("vagaId") REFERENCES "ApoVaga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoTermoEstagio" ADD CONSTRAINT "ApoTermoEstagio_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "ApoEmpresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoRelatorioEstagio" ADD CONSTRAINT "ApoRelatorioEstagio_termoId_fkey" FOREIGN KEY ("termoId") REFERENCES "ApoTermoEstagio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoContatoEvasao" ADD CONSTRAINT "ApoContatoEvasao_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "ApoPlanoAcao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoFormacaoInscricao" ADD CONSTRAINT "ApoFormacaoInscricao_formacaoId_fkey" FOREIGN KEY ("formacaoId") REFERENCES "ApoFormacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoAplicacao" ADD CONSTRAINT "ApoAplicacao_instrumentoId_fkey" FOREIGN KEY ("instrumentoId") REFERENCES "ApoInstrumento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoParticipacao" ADD CONSTRAINT "ApoParticipacao_aplicacaoId_fkey" FOREIGN KEY ("aplicacaoId") REFERENCES "ApoAplicacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoResposta" ADD CONSTRAINT "ApoResposta_aplicacaoId_fkey" FOREIGN KEY ("aplicacaoId") REFERENCES "ApoAplicacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoDevolutiva" ADD CONSTRAINT "ApoDevolutiva_aplicacaoId_fkey" FOREIGN KEY ("aplicacaoId") REFERENCES "ApoAplicacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoEncaminhamento" ADD CONSTRAINT "ApoEncaminhamento_manifestacaoId_fkey" FOREIGN KEY ("manifestacaoId") REFERENCES "ApoManifestacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoEgressoTrajetoria" ADD CONSTRAINT "ApoEgressoTrajetoria_egressoId_fkey" FOREIGN KEY ("egressoId") REFERENCES "ApoEgresso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoEventoParticipante" ADD CONSTRAINT "ApoEventoParticipante_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "ApoEventoEgresso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoEventoParticipante" ADD CONSTRAINT "ApoEventoParticipante_egressoId_fkey" FOREIGN KEY ("egressoId") REFERENCES "ApoEgresso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BibExemplar" ADD CONSTRAINT "BibExemplar_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "BibObra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BibEmprestimo" ADD CONSTRAINT "BibEmprestimo_leitorId_fkey" FOREIGN KEY ("leitorId") REFERENCES "BibLeitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BibEmprestimo" ADD CONSTRAINT "BibEmprestimo_exemplarId_fkey" FOREIGN KEY ("exemplarId") REFERENCES "BibExemplar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BibReserva" ADD CONSTRAINT "BibReserva_leitorId_fkey" FOREIGN KEY ("leitorId") REFERENCES "BibLeitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BibReserva" ADD CONSTRAINT "BibReserva_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "BibObra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BibMulta" ADD CONSTRAINT "BibMulta_leitorId_fkey" FOREIGN KEY ("leitorId") REFERENCES "BibLeitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BibInventarioItem" ADD CONSTRAINT "BibInventarioItem_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "BibInventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BibAcessoVirtual" ADD CONSTRAINT "BibAcessoVirtual_recursoId_fkey" FOREIGN KEY ("recursoId") REFERENCES "BibRecursoVirtual"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalExameFiscal" ADD CONSTRAINT "CalExameFiscal_exameId_fkey" FOREIGN KEY ("exameId") REFERENCES "CalExame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalPrazoExcecao" ADD CONSTRAINT "CalPrazoExcecao_prazoId_fkey" FOREIGN KEY ("prazoId") REFERENCES "CalPrazoNotas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalPrazoConclusao" ADD CONSTRAINT "CalPrazoConclusao_prazoId_fkey" FOREIGN KEY ("prazoId") REFERENCES "CalPrazoNotas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComPreferencia" ADD CONSTRAINT "ComPreferencia_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "ComContato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComConversa" ADD CONSTRAINT "ComConversa_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "ComContato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComMensagem" ADD CONSTRAINT "ComMensagem_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "ComConversa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComCampanhaDestinatario" ADD CONSTRAINT "ComCampanhaDestinatario_campanhaId_fkey" FOREIGN KEY ("campanhaId") REFERENCES "ComCampanha"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComReguaEtapa" ADD CONSTRAINT "ComReguaEtapa_reguaId_fkey" FOREIGN KEY ("reguaId") REFERENCES "ComRegua"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComReguaExecucao" ADD CONSTRAINT "ComReguaExecucao_etapaId_fkey" FOREIGN KEY ("etapaId") REFERENCES "ComReguaEtapa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComSocialPost" ADD CONSTRAINT "ComSocialPost_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ComSocialConta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComSocialMetrica" ADD CONSTRAINT "ComSocialMetrica_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ComSocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComSocialInteracao" ADD CONSTRAINT "ComSocialInteracao_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ComSocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesEixo" ADD CONSTRAINT "DesEixo_exameId_fkey" FOREIGN KEY ("exameId") REFERENCES "DesExame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesEdicao" ADD CONSTRAINT "DesEdicao_exameId_fkey" FOREIGN KEY ("exameId") REFERENCES "DesExame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesInscricao" ADD CONSTRAINT "DesInscricao_edicaoId_fkey" FOREIGN KEY ("edicaoId") REFERENCES "DesEdicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesSimuladoQuestao" ADD CONSTRAINT "DesSimuladoQuestao_simuladoId_fkey" FOREIGN KEY ("simuladoId") REFERENCES "DesSimulado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesSimuladoAlvo" ADD CONSTRAINT "DesSimuladoAlvo_simuladoId_fkey" FOREIGN KEY ("simuladoId") REFERENCES "DesSimulado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesTentativa" ADD CONSTRAINT "DesTentativa_simuladoId_fkey" FOREIGN KEY ("simuladoId") REFERENCES "DesSimulado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesResposta" ADD CONSTRAINT "DesResposta_tentativaId_fkey" FOREIGN KEY ("tentativaId") REFERENCES "DesTentativa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesAtribuicao" ADD CONSTRAINT "DesAtribuicao_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "DesKit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesEntrega" ADD CONSTRAINT "DesEntrega_atribuicaoId_fkey" FOREIGN KEY ("atribuicaoId") REFERENCES "DesAtribuicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesTrilhaItem" ADD CONSTRAINT "DesTrilhaItem_trilhaId_fkey" FOREIGN KEY ("trilhaId") REFERENCES "DesTrilha"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovPdiEixo" ADD CONSTRAINT "GovPdiEixo_pdiId_fkey" FOREIGN KEY ("pdiId") REFERENCES "GovPdi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovPdiObjetivo" ADD CONSTRAINT "GovPdiObjetivo_eixoId_fkey" FOREIGN KEY ("eixoId") REFERENCES "GovPdiEixo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovPdiMeta" ADD CONSTRAINT "GovPdiMeta_objetivoId_fkey" FOREIGN KEY ("objetivoId") REFERENCES "GovPdiObjetivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovPdiMedicao" ADD CONSTRAINT "GovPdiMedicao_metaId_fkey" FOREIGN KEY ("metaId") REFERENCES "GovPdiMeta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovPdiAcao" ADD CONSTRAINT "GovPdiAcao_metaId_fkey" FOREIGN KEY ("metaId") REFERENCES "GovPdiMeta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovDocumentoVersao" ADD CONSTRAINT "GovDocumentoVersao_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "GovDocumento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovCpaMembro" ADD CONSTRAINT "GovCpaMembro_cpaId_fkey" FOREIGN KEY ("cpaId") REFERENCES "GovCpa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovCpaQuestionario" ADD CONSTRAINT "GovCpaQuestionario_cicloId_fkey" FOREIGN KEY ("cicloId") REFERENCES "GovCpaCiclo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovCpaPergunta" ADD CONSTRAINT "GovCpaPergunta_questionarioId_fkey" FOREIGN KEY ("questionarioId") REFERENCES "GovCpaQuestionario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovCpaConvite" ADD CONSTRAINT "GovCpaConvite_questionarioId_fkey" FOREIGN KEY ("questionarioId") REFERENCES "GovCpaQuestionario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovCpaResposta" ADD CONSTRAINT "GovCpaResposta_questionarioId_fkey" FOREIGN KEY ("questionarioId") REFERENCES "GovCpaQuestionario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovCpaRespostaItem" ADD CONSTRAINT "GovCpaRespostaItem_respostaId_fkey" FOREIGN KEY ("respostaId") REFERENCES "GovCpaResposta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovCpaRelatorio" ADD CONSTRAINT "GovCpaRelatorio_cicloId_fkey" FOREIGN KEY ("cicloId") REFERENCES "GovCpaCiclo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovCpaPlanoAcao" ADD CONSTRAINT "GovCpaPlanoAcao_cicloId_fkey" FOREIGN KEY ("cicloId") REFERENCES "GovCpaCiclo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovNdeMembro" ADD CONSTRAINT "GovNdeMembro_ndeId_fkey" FOREIGN KEY ("ndeId") REFERENCES "GovNde"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovNdeReuniao" ADD CONSTRAINT "GovNdeReuniao_ndeId_fkey" FOREIGN KEY ("ndeId") REFERENCES "GovNde"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovOrgaoMembro" ADD CONSTRAINT "GovOrgaoMembro_orgaoId_fkey" FOREIGN KEY ("orgaoId") REFERENCES "GovOrgao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovReuniao" ADD CONSTRAINT "GovReuniao_orgaoId_fkey" FOREIGN KEY ("orgaoId") REFERENCES "GovOrgao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovPauta" ADD CONSTRAINT "GovPauta_reuniaoId_fkey" FOREIGN KEY ("reuniaoId") REFERENCES "GovReuniao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovDeliberacao" ADD CONSTRAINT "GovDeliberacao_reuniaoId_fkey" FOREIGN KEY ("reuniaoId") REFERENCES "GovReuniao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovVotoRegistro" ADD CONSTRAINT "GovVotoRegistro_deliberacaoId_fkey" FOREIGN KEY ("deliberacaoId") REFERENCES "GovDeliberacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovCipaMembro" ADD CONSTRAINT "GovCipaMembro_gestaoId_fkey" FOREIGN KEY ("gestaoId") REFERENCES "GovCipaGestao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovCipaReuniao" ADD CONSTRAINT "GovCipaReuniao_gestaoId_fkey" FOREIGN KEY ("gestaoId") REFERENCES "GovCipaGestao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovCarreiraNivel" ADD CONSTRAINT "GovCarreiraNivel_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "GovCarreiraPlano"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovCarreiraProgressao" ADD CONSTRAINT "GovCarreiraProgressao_enquadramentoId_fkey" FOREIGN KEY ("enquadramentoId") REFERENCES "GovCarreiraEnquadramento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfBem" ADD CONSTRAINT "InfBem_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "InfCategoriaBem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfMovimentacaoBem" ADD CONSTRAINT "InfMovimentacaoBem_bemId_fkey" FOREIGN KEY ("bemId") REFERENCES "InfBem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfInventarioItem" ADD CONSTRAINT "InfInventarioItem_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "InfInventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfOsPeca" ADD CONSTRAINT "InfOsPeca_osId_fkey" FOREIGN KEY ("osId") REFERENCES "InfOrdemServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfChamadoComentario" ADD CONSTRAINT "InfChamadoComentario_chamadoId_fkey" FOREIGN KEY ("chamadoId") REFERENCES "InfChamado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfProjetoEtapa" ADD CONSTRAINT "InfProjetoEtapa_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "InfProjeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfVaga" ADD CONSTRAINT "InfVaga_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "InfAreaEstacionamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfLeitura" ADD CONSTRAINT "InfLeitura_medidorId_fkey" FOREIGN KEY ("medidorId") REFERENCES "InfMedidor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JorNo" ADD CONSTRAINT "JorNo_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JorTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JorTransicao" ADD CONSTRAINT "JorTransicao_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JorTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JorInstancia" ADD CONSTRAINT "JorInstancia_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JorTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JorEtapa" ADD CONSTRAINT "JorEtapa_instanciaId_fkey" FOREIGN KEY ("instanciaId") REFERENCES "JorInstancia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JorHistorico" ADD CONSTRAINT "JorHistorico_instanciaId_fkey" FOREIGN KEY ("instanciaId") REFERENCES "JorInstancia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModEncontro" ADD CONSTRAINT "ModEncontro_ofertaId_fkey" FOREIGN KEY ("ofertaId") REFERENCES "ModOferta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModAulaLive" ADD CONSTRAINT "ModAulaLive_ofertaId_fkey" FOREIGN KEY ("ofertaId") REFERENCES "ModOferta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModLiveEvento" ADD CONSTRAINT "ModLiveEvento_liveId_fkey" FOREIGN KEY ("liveId") REFERENCES "ModAulaLive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModLivePresenca" ADD CONSTRAINT "ModLivePresenca_liveId_fkey" FOREIGN KEY ("liveId") REFERENCES "ModAulaLive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPoloChecklistItem" ADD CONSTRAINT "ModPoloChecklistItem_poloId_fkey" FOREIGN KEY ("poloId") REFERENCES "ModPolo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPoloOferta" ADD CONSTRAINT "ModPoloOferta_poloId_fkey" FOREIGN KEY ("poloId") REFERENCES "ModPolo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPoloAluno" ADD CONSTRAINT "ModPoloAluno_poloId_fkey" FOREIGN KEY ("poloId") REFERENCES "ModPolo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModTutorAlocacao" ADD CONSTRAINT "ModTutorAlocacao_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "ModTutor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModAtendimentoMensagem" ADD CONSTRAINT "ModAtendimentoMensagem_atendimentoId_fkey" FOREIGN KEY ("atendimentoId") REFERENCES "ModAtendimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModTutorAvaliacao" ADD CONSTRAINT "ModTutorAvaliacao_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "ModTutor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPraticaInscricao" ADD CONSTRAINT "ModPraticaInscricao_agendaId_fkey" FOREIGN KEY ("agendaId") REFERENCES "ModAgendaPratica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModHoraPratica" ADD CONSTRAINT "ModHoraPratica_estagioId_fkey" FOREIGN KEY ("estagioId") REFERENCES "ModEstagio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPosArea" ADD CONSTRAINT "ModPosArea_posId_fkey" FOREIGN KEY ("posId") REFERENCES "ModPosPrograma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPosLinha" ADD CONSTRAINT "ModPosLinha_posId_fkey" FOREIGN KEY ("posId") REFERENCES "ModPosPrograma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPosLinha" ADD CONSTRAINT "ModPosLinha_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "ModPosArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPosModulo" ADD CONSTRAINT "ModPosModulo_posId_fkey" FOREIGN KEY ("posId") REFERENCES "ModPosPrograma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPosTurma" ADD CONSTRAINT "ModPosTurma_posId_fkey" FOREIGN KEY ("posId") REFERENCES "ModPosPrograma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPosDocente" ADD CONSTRAINT "ModPosDocente_posId_fkey" FOREIGN KEY ("posId") REFERENCES "ModPosPrograma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPosDisciplina" ADD CONSTRAINT "ModPosDisciplina_posId_fkey" FOREIGN KEY ("posId") REFERENCES "ModPosPrograma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPosColegiado" ADD CONSTRAINT "ModPosColegiado_posId_fkey" FOREIGN KEY ("posId") REFERENCES "ModPosPrograma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPosAluno" ADD CONSTRAINT "ModPosAluno_posId_fkey" FOREIGN KEY ("posId") REFERENCES "ModPosPrograma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPosBanca" ADD CONSTRAINT "ModPosBanca_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "ModPosAluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPosBolsa" ADD CONSTRAINT "ModPosBolsa_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "ModPosAluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPosOferta" ADD CONSTRAINT "ModPosOferta_posId_fkey" FOREIGN KEY ("posId") REFERENCES "ModPosPrograma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NtLancamento" ADD CONSTRAINT "NtLancamento_componenteId_fkey" FOREIGN KEY ("componenteId") REFERENCES "NtComponente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NtLancamentoHistorico" ADD CONSTRAINT "NtLancamentoHistorico_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "NtLancamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesPublicacaoAutor" ADD CONSTRAINT "PesPublicacaoAutor_publicacaoId_fkey" FOREIGN KEY ("publicacaoId") REFERENCES "PesPublicacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesGrupoLinha" ADD CONSTRAINT "PesGrupoLinha_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "PesGrupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesGrupoMembro" ADD CONSTRAINT "PesGrupoMembro_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "PesGrupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesProjetoMembro" ADD CONSTRAINT "PesProjetoMembro_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "PesProjeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesProjetoEtapa" ADD CONSTRAINT "PesProjetoEtapa_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "PesProjeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesProjetoRubrica" ADD CONSTRAINT "PesProjetoRubrica_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "PesProjeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesProjetoLancamento" ADD CONSTRAINT "PesProjetoLancamento_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "PesProjeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesProjetoLancamento" ADD CONSTRAINT "PesProjetoLancamento_rubricaId_fkey" FOREIGN KEY ("rubricaId") REFERENCES "PesProjetoRubrica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesProjetoEntregavel" ADD CONSTRAINT "PesProjetoEntregavel_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "PesProjeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesProjetoRelatorio" ADD CONSTRAINT "PesProjetoRelatorio_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "PesProjeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesEditalInscricao" ADD CONSTRAINT "PesEditalInscricao_editalId_fkey" FOREIGN KEY ("editalId") REFERENCES "PesEdital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesEditalAvaliacao" ADD CONSTRAINT "PesEditalAvaliacao_inscricaoId_fkey" FOREIGN KEY ("inscricaoId") REFERENCES "PesEditalInscricao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesBolsaPagamento" ADD CONSTRAINT "PesBolsaPagamento_bolsaId_fkey" FOREIGN KEY ("bolsaId") REFERENCES "PesBolsa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesTrabalhoBanca" ADD CONSTRAINT "PesTrabalhoBanca_trabalhoId_fkey" FOREIGN KEY ("trabalhoId") REFERENCES "PesTrabalho"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesTrabalhoVersao" ADD CONSTRAINT "PesTrabalhoVersao_trabalhoId_fkey" FOREIGN KEY ("trabalhoId") REFERENCES "PesTrabalho"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesTrabalhoEvento" ADD CONSTRAINT "PesTrabalhoEvento_trabalhoId_fkey" FOREIGN KEY ("trabalhoId") REFERENCES "PesTrabalho"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesTrabalhoOrientacao" ADD CONSTRAINT "PesTrabalhoOrientacao_trabalhoId_fkey" FOREIGN KEY ("trabalhoId") REFERENCES "PesTrabalho"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesPeriodicoEquipe" ADD CONSTRAINT "PesPeriodicoEquipe_periodicoId_fkey" FOREIGN KEY ("periodicoId") REFERENCES "PesPeriodico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesEdicao" ADD CONSTRAINT "PesEdicao_periodicoId_fkey" FOREIGN KEY ("periodicoId") REFERENCES "PesPeriodico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesSecao" ADD CONSTRAINT "PesSecao_periodicoId_fkey" FOREIGN KEY ("periodicoId") REFERENCES "PesPeriodico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesSubmissao" ADD CONSTRAINT "PesSubmissao_periodicoId_fkey" FOREIGN KEY ("periodicoId") REFERENCES "PesPeriodico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesSubmissao" ADD CONSTRAINT "PesSubmissao_edicaoId_fkey" FOREIGN KEY ("edicaoId") REFERENCES "PesEdicao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesSubmissao" ADD CONSTRAINT "PesSubmissao_secaoId_fkey" FOREIGN KEY ("secaoId") REFERENCES "PesSecao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesSubmissaoVersao" ADD CONSTRAINT "PesSubmissaoVersao_submissaoId_fkey" FOREIGN KEY ("submissaoId") REFERENCES "PesSubmissao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesRevisao" ADD CONSTRAINT "PesRevisao_submissaoId_fkey" FOREIGN KEY ("submissaoId") REFERENCES "PesSubmissao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesDecisao" ADD CONSTRAINT "PesDecisao_submissaoId_fkey" FOREIGN KEY ("submissaoId") REFERENCES "PesSubmissao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesEventoTrabalho" ADD CONSTRAINT "PesEventoTrabalho_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "PesEvento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesEventoAvaliacao" ADD CONSTRAINT "PesEventoAvaliacao_trabalhoId_fkey" FOREIGN KEY ("trabalhoId") REFERENCES "PesEventoTrabalho"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegProcessoHistorico" ADD CONSTRAINT "RegProcessoHistorico_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "RegProcesso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegDiligencia" ADD CONSTRAINT "RegDiligencia_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "RegProcesso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegChecklistModeloItem" ADD CONSTRAINT "RegChecklistModeloItem_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "RegChecklistModelo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegChecklist" ADD CONSTRAINT "RegChecklist_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "RegProcesso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegChecklistItem" ADD CONSTRAINT "RegChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "RegChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReiResultadoChave" ADD CONSTRAINT "ReiResultadoChave_objetivoId_fkey" FOREIGN KEY ("objetivoId") REFERENCES "ReiObjetivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReiCheckin" ADD CONSTRAINT "ReiCheckin_resultadoId_fkey" FOREIGN KEY ("resultadoId") REFERENCES "ReiResultadoChave"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecProtocolo" ADD CONSTRAINT "SecProtocolo_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "SecTipoRequerimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecTramite" ADD CONSTRAINT "SecTramite_protocoloId_fkey" FOREIGN KEY ("protocoloId") REFERENCES "SecProtocolo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecAnexo" ADD CONSTRAINT "SecAnexo_protocoloId_fkey" FOREIGN KEY ("protocoloId") REFERENCES "SecProtocolo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecChecklistItemModelo" ADD CONSTRAINT "SecChecklistItemModelo_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "SecChecklistModelo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecConferenciaItem" ADD CONSTRAINT "SecConferenciaItem_conferenciaId_fkey" FOREIGN KEY ("conferenciaId") REFERENCES "SecConferencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecCertLote" ADD CONSTRAINT "SecCertLote_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "SecCertModelo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecCertificado" ADD CONSTRAINT "SecCertificado_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "SecCertModelo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecCertificado" ADD CONSTRAINT "SecCertificado_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "SecCertLote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecAta" ADD CONSTRAINT "SecAta_livroId_fkey" FOREIGN KEY ("livroId") REFERENCES "SecLivro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecDiploma" ADD CONSTRAINT "SecDiploma_livroId_fkey" FOREIGN KEY ("livroId") REFERENCES "SecLivro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecColacaoFormando" ADD CONSTRAINT "SecColacaoFormando_colacaoId_fkey" FOREIGN KEY ("colacaoId") REFERENCES "SecColacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupFornecedorDocumento" ADD CONSTRAINT "SupFornecedorDocumento_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "SupFornecedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupFornecedorAvaliacao" ADD CONSTRAINT "SupFornecedorAvaliacao_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "SupFornecedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupItem" ADD CONSTRAINT "SupItem_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "SupCategoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupSaldo" ADD CONSTRAINT "SupSaldo_almoxarifadoId_fkey" FOREIGN KEY ("almoxarifadoId") REFERENCES "SupAlmoxarifado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupSaldo" ADD CONSTRAINT "SupSaldo_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "SupItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupLote" ADD CONSTRAINT "SupLote_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "SupItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupMovimentacao" ADD CONSTRAINT "SupMovimentacao_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "SupItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupInventarioItem" ADD CONSTRAINT "SupInventarioItem_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "SupInventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupRequisicaoItem" ADD CONSTRAINT "SupRequisicaoItem_requisicaoId_fkey" FOREIGN KEY ("requisicaoId") REFERENCES "SupRequisicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupAprovacao" ADD CONSTRAINT "SupAprovacao_requisicaoId_fkey" FOREIGN KEY ("requisicaoId") REFERENCES "SupRequisicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupCotacao" ADD CONSTRAINT "SupCotacao_requisicaoId_fkey" FOREIGN KEY ("requisicaoId") REFERENCES "SupRequisicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupCotacaoProposta" ADD CONSTRAINT "SupCotacaoProposta_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "SupCotacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupCotacaoPreco" ADD CONSTRAINT "SupCotacaoPreco_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "SupCotacaoProposta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupPedido" ADD CONSTRAINT "SupPedido_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "SupFornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupPedidoItem" ADD CONSTRAINT "SupPedidoItem_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "SupPedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupRecebimento" ADD CONSTRAINT "SupRecebimento_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "SupPedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupRecebimentoItem" ADD CONSTRAINT "SupRecebimentoItem_recebimentoId_fkey" FOREIGN KEY ("recebimentoId") REFERENCES "SupRecebimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupContrato" ADD CONSTRAINT "SupContrato_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "SupFornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupKitItem" ADD CONSTRAINT "SupKitItem_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "SupKit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupKitConsumo" ADD CONSTRAINT "SupKitConsumo_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "SupKit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupCaixaMov" ADD CONSTRAINT "SupCaixaMov_caixaId_fkey" FOREIGN KEY ("caixaId") REFERENCES "SupCaixa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupVenda" ADD CONSTRAINT "SupVenda_caixaId_fkey" FOREIGN KEY ("caixaId") REFERENCES "SupCaixa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupVendaItem" ADD CONSTRAINT "SupVendaItem_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "SupVenda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupDevolucao" ADD CONSTRAINT "SupDevolucao_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "SupVenda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

