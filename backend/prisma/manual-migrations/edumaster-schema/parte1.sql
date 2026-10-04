-- EduMaster Pro: schema isolado "edumaster" (nao toca no schema public). Parte 1 de 3. Rode as partes em ordem.
BEGIN;
CREATE SCHEMA edumaster;
SET LOCAL search_path TO edumaster;

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
CREATE TABLE "Clinic" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "logo" TEXT,
    "displayName" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#0F5FDB',
    "secondaryColor" TEXT NOT NULL DEFAULT '#0B1F3A',
    "accentColor" TEXT NOT NULL DEFAULT '#21C7A8',
    "themeMode" TEXT NOT NULL DEFAULT 'LIGHT',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "plan" TEXT NOT NULL DEFAULT 'STARTER',
    "language" TEXT NOT NULL DEFAULT 'pt-BR',
    "maxDoctors" INTEGER NOT NULL DEFAULT 1,
    "maxPatients" INTEGER NOT NULL DEFAULT 500,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "phone" TEXT,
    "avatar" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Doctor" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cro" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "bio" TEXT,
    "photo" TEXT,
    "consultationValue" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "contractType" TEXT NOT NULL DEFAULT 'CLINICA',
    "croState" TEXT,
    "rqe" TEXT,
    "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cpf" TEXT,
    "rg" TEXT,
    "birthDate" TIMESTAMP(3),
    "personalAddress" TEXT,
    "personalCity" TEXT,
    "personalState" TEXT,
    "personalZipCode" TEXT,
    "companyName" TEXT,
    "tradeName" TEXT,
    "cnpj" TEXT,
    "companyCro" TEXT,
    "technicalManager" TEXT,
    "companyAddress" TEXT,
    "companyCity" TEXT,
    "companyState" TEXT,
    "companyZipCode" TEXT,
    "municipalRegistration" TEXT,
    "documentIssuer" TEXT NOT NULL DEFAULT 'CLINICA',
    "revenueModel" TEXT NOT NULL DEFAULT 'HONORARIO',
    "revenuePercent" DOUBLE PRECISION,
    "revenueBase" TEXT NOT NULL DEFAULT 'BRUTO',
    "materialSplit" TEXT NOT NULL DEFAULT 'RATEADO',
    "labSplit" TEXT NOT NULL DEFAULT 'RATEADO',
    "cardFeeSplit" TEXT NOT NULL DEFAULT 'RATEADO',
    "commissionPercent" DOUBLE PRECISION,
    "payoutDay" INTEGER,
    "bankName" TEXT,
    "bankAgency" TEXT,
    "bankAccount" TEXT,
    "pixKey" TEXT,
    "contractStartDate" TIMESTAMP(3),
    "contractEndDate" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "Doctor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "cpf" TEXT,
    "rg" TEXT,
    "birthDate" TIMESTAMP(3),
    "gender" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "odontogram" TEXT,
    "photos" TEXT[],
    "xrays" TEXT[],
    "medicalHistory" TEXT,
    "allergies" TEXT,
    "notes" TEXT,
    "status" TEXT DEFAULT 'Ativo',
    "treatment" TEXT,
    "mainComplaint" TEXT,
    "medications" TEXT,
    "recordNumber" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "slotDuration" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "procedure" TEXT NOT NULL,
    "nextProcedure" TEXT,
    "room" TEXT,
    "source" TEXT NOT NULL DEFAULT 'INTERNAL',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "confirmation" TEXT,
    "confirmChannel" TEXT,
    "assistantId" TEXT,
    "budgetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentHistory" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "requestedBy" TEXT,
    "reason" TEXT,
    "previousScheduledAt" TIMESTAMP(3),
    "newScheduledAt" TIMESTAMP(3),
    "previousStatus" TEXT,
    "newStatus" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentReminder" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "installments" INTEGER NOT NULL DEFAULT 1,
    "installmentValue" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "entryAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monthlyRatePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL DEFAULT 'PIX',
    "paymentProvider" TEXT NOT NULL DEFAULT 'MANUAL',
    "version" INTEGER NOT NULL DEFAULT 1,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByName" TEXT,
    "acceptedByDocument" TEXT,
    "acceptanceEvidence" JSONB,
    "optionsJson" JSONB,
    "simulaClinicJson" JSONB,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetRevision" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL,
    "installment" INTEGER NOT NULL DEFAULT 1,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "asaasId" TEXT,
    "provider" TEXT,
    "externalId" TEXT,
    "grossAmount" DOUBLE PRECISION,
    "feeAmount" DOUBLE PRECISION,
    "netAmount" DOUBLE PRECISION,
    "transactionStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialEntry" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GERAL',
    "personName" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "competenceDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT,
    "provider" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'MANUAL',
    "originId" TEXT,
    "installment" INTEGER,
    "installments" INTEGER,
    "paidAt" TIMESTAMP(3),
    "settledById" TEXT,
    "settledByName" TEXT,
    "paymentReceipt" TEXT,
    "notes" TEXT,
    "externalId" TEXT,
    "barcode" TEXT,
    "digitableLine" TEXT,
    "documentUrl" TEXT,
    "accountingMode" TEXT,
    "costCenter" TEXT,
    "supplier" TEXT,
    "supplierId" TEXT,
    "accountingAccountId" TEXT,
    "costCenterId" TEXT,
    "documentNumber" TEXT,
    "fiscalDocumentType" TEXT,
    "taxWithheld" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION,
    "accountingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "accountantNotes" TEXT,
    "recurrence" TEXT,
    "recurringBillId" TEXT,
    "autoDebit" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceKey" TEXT,
    "issuerEntity" TEXT NOT NULL DEFAULT 'INSTITUTO_RAVEL',
    "approvedAt" TIMESTAMP(3),
    "sourceDocumentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProviderConfig" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'TEST',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "credentialsConfigured" BOOLEAN NOT NULL DEFAULT false,
    "webhookConfigured" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB,
    "encryptedCredentials" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tradeName" TEXT,
    "document" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "pixKey" TEXT,
    "bankData" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GERAL',
    "paymentTerms" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingAccount" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "parentCode" TEXT,
    "nature" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCenter" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxObligation" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "legalEntity" TEXT NOT NULL DEFAULT 'PJ',
    "regime" TEXT,
    "competence" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "estimatedValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalValue" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'TO_CALCULATE',
    "responsible" TEXT,
    "requiresAccountantApproval" BOOLEAN NOT NULL DEFAULT true,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "financialEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountantPortalAccess" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "canViewFinance" BOOLEAN NOT NULL DEFAULT true,
    "canViewTax" BOOLEAN NOT NULL DEFAULT true,
    "canViewPayroll" BOOLEAN NOT NULL DEFAULT false,
    "canExport" BOOLEAN NOT NULL DEFAULT true,
    "canApproveTax" BOOLEAN NOT NULL DEFAULT false,
    "lastAccessAt" TIMESTAMP(3),
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountantPortalAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalEvolution" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT,
    "professionalName" TEXT NOT NULL,
    "procedure" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "nextProcedure" TEXT NOT NULL,
    "nextAppointmentCreated" BOOLEAN NOT NULL DEFAULT false,
    "appointmentId" TEXT,
    "teeth" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "regions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "anesthetic" TEXT,
    "materials" TEXT,
    "complications" TEXT,
    "guidance" TEXT,
    "attachments" JSONB,
    "authoredBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalEvolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientClinicalRecord" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "data" JSONB NOT NULL,
    "riskFlags" TEXT[],
    "alertSummary" TEXT,
    "responsibleProfessionalId" TEXT,
    "responsibleProfessionalName" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientClinicalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientClinicalRecordRevision" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicalRecordId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "dataSnapshot" JSONB NOT NULL,
    "riskFlags" TEXT[],
    "alertSummary" TEXT,
    "changeReason" TEXT NOT NULL,
    "changedFields" TEXT[],
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientClinicalRecordRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalCustomFieldDefinition" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL,
    "options" TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sensitive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalCustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OdontogramMark" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "tooth" INTEGER NOT NULL,
    "surface" TEXT,
    "finding" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "sourceEvolutionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OdontogramMark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentItem" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "tooth" INTEGER,
    "surfaces" TEXT[],
    "procedure" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "origin" TEXT NOT NULL DEFAULT 'MANUAL',
    "clinicalEvolutionId" TEXT,
    "odontogramMarkId" TEXT,
    "completedAt" TIMESTAMP(3),
    "planningData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentPlanRevision" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreatmentPlanRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaboratoryWork" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT,
    "trackingCode" TEXT NOT NULL,
    "dentistName" TEXT NOT NULL,
    "workType" TEXT NOT NULL,
    "teeth" TEXT,
    "material" TEXT,
    "responsibleTechnician" TEXT,
    "impressionType" TEXT,
    "receivedItems" TEXT[],
    "toothShade" TEXT NOT NULL,
    "shadeSystem" TEXT,
    "shadeNotes" TEXT,
    "patientAge" INTEGER,
    "patientSex" TEXT,
    "faceBiotype" TEXT,
    "faceShape" TEXT,
    "faceDescription" TEXT,
    "dueDate" TIMESTAMP(3),
    "patientReturnDate" TIMESTAMP(3),
    "nextAction" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "source" TEXT NOT NULL DEFAULT 'LABORATORY',
    "observations" TEXT,
    "designStatus" TEXT NOT NULL DEFAULT 'NOT_SENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaboratoryWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaboratoryWorkHistory" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "laboratoryWorkId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaboratoryWorkHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DentalDesignCase" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT,
    "laboratoryWorkId" TEXT,
    "toothNumbers" TEXT[],
    "selectedTooth" INTEGER,
    "toothCharacter" TEXT NOT NULL DEFAULT 'ADULT',
    "archShape" TEXT,
    "primaryFileName" TEXT,
    "antagonistFileName" TEXT,
    "biteFileName" TEXT,
    "activeTool" TEXT NOT NULL DEFAULT 'NAVIGATION',
    "brushStrength" INTEGER NOT NULL DEFAULT 35,
    "marginPoints" JSONB,
    "occlusionState" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PREPARING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DentalDesignCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessProfile" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessProfilePermission" (
    "profileId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessProfilePermission_pkey" PRIMARY KEY ("profileId","permissionId")
);

-- CreateTable
CREATE TABLE "UserAccessProfile" (
    "userId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAccessProfile_pkey" PRIMARY KEY ("userId","profileId")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "summary" TEXT,
    "beforeData" JSONB,
    "afterData" JSONB,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HREmployee" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "employmentModel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "admissionDate" TIMESTAMP(3) NOT NULL,
    "experienceEndDate" TIMESTAMP(3),
    "terminationDate" TIMESTAMP(3),
    "baseSalary" DECIMAL(12,2) NOT NULL,
    "monthlyWorkload" INTEGER NOT NULL DEFAULT 220,
    "supervisor" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "cpf" TEXT,
    "pixKey" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HREmployee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HRAttendance" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "clockIn" TEXT,
    "clockOut" TEXT,
    "overtimeHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "balanceHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "observation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HRAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HRPayrollEntry" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HRPayrollEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HRPayrollClosing" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "grossPayroll" DECIMAL(12,2) NOT NULL,
    "discounts" DECIMAL(12,2) NOT NULL,
    "employerCharges" DECIMAL(12,2) NOT NULL,
    "netPayroll" DECIMAL(12,2) NOT NULL,
    "employeeCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CALCULATING',
    "paymentDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HRPayrollClosing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HRVacation" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "acquisitionStart" TIMESTAMP(3) NOT NULL,
    "acquisitionEnd" TIMESTAMP(3) NOT NULL,
    "concessionDeadline" TIMESTAMP(3) NOT NULL,
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "vacationDays" INTEGER NOT NULL DEFAULT 30,
    "soldDays" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HRVacation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HRDocument" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "digitallySigned" BOOLEAN NOT NULL DEFAULT false,
    "fileUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HRDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HRDisciplinaryAction" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "daysSuspended" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HRDisciplinaryAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevahContact" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "telegramChatId" TEXT,
    "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false,
    "smsOptIn" BOOLEAN NOT NULL DEFAULT false,
    "emailOptIn" BOOLEAN NOT NULL DEFAULT false,
    "telegramOptIn" BOOLEAN NOT NULL DEFAULT false,
    "phoneOptIn" BOOLEAN NOT NULL DEFAULT false,
    "optedOutAt" TIMESTAMP(3),
    "tags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevahContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevahCampaign" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "recurrence" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "senderId" TEXT,

    CONSTRAINT "RevahCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevahMessage" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT,
    "contactName" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "provider" TEXT,
    "senderId" TEXT,
    "providerMessageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevahMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesLead" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'NEW',
    "temperature" TEXT NOT NULL DEFAULT 'WARM',
    "estimatedValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "nextAction" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "ownerId" TEXT,
    "notes" TEXT,
    "convertedAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesProduct" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "salePrice" DECIMAL(12,2) NOT NULL,
    "costPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stockQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "minStock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "batchTracked" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicUnit" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantStorageConfig" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'S3_COMPATIBLE',
    "bucket" TEXT NOT NULL,
    "rootPrefix" TEXT NOT NULL,
    "region" TEXT,
    "endpoint" TEXT,
    "encryptedSecret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantStorageConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantFeatureFlag" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloutStage" TEXT NOT NULL DEFAULT 'INTERNAL',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantFeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevahSender" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT,
    "channel" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "encryptedCredentials" TEXT,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevahSender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadImport" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "query" JSONB,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "imported" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "legalBasis" TEXT,
    "sourceReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "LeadImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationWebhookEvent" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT,
    "tenantId" TEXT,
    "provider" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankConnection" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountLabel" TEXT NOT NULL,
    "accountType" TEXT,
    "last4" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "syncMode" TEXT NOT NULL DEFAULT 'MANUAL',
    "encryptedCredentials" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseImportRule" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "matchText" TEXT,
    "matchDocument" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GERAL',
    "costCenter" TEXT,
    "accountingMode" TEXT,
    "autoCreate" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseImportRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialDocument" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "financialEntryId" TEXT,
    "type" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "barcode" TEXT,
    "digitableLine" TEXT,
    "detectedAmount" DECIMAL(12,2),
    "detectedDueDate" TIMESTAMP(3),
    "detectedSupplier" TEXT,
    "source" TEXT NOT NULL DEFAULT 'UPLOAD',
    "status" TEXT NOT NULL DEFAULT 'REVIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevahAutomation" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    "recurrence" TEXT,
    "filters" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevahAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesLeadEvent" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "fromStage" TEXT,
    "toStage" TEXT,
    "channel" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesLeadEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevahConversation" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT,
    "leadId" TEXT,
    "channel" TEXT NOT NULL,
    "provider" TEXT,
    "externalConversationId" TEXT,
    "contactName" TEXT NOT NULL,
    "destination" TEXT,
    "status" TEXT NOT NULL DEFAULT 'BOT',
    "assignedUserId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevahConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevahConversationMessage" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "sentByUserId" TEXT,
    "error" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevahConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmartSchedulingPolicy" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "respectPreferredWeekday" BOOLEAN NOT NULL DEFAULT true,
    "financeOptimizationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "financeNeverOverridesClinical" BOOLEAN NOT NULL DEFAULT true,
    "overdueWarningOnly" BOOLEAN NOT NULL DEFAULT true,
    "defaultDurationMinutes" INTEGER NOT NULL DEFAULT 30,
    "defaultReturnIntervalDays" INTEGER NOT NULL DEFAULT 14,
    "maxLookAheadDays" INTEGER NOT NULL DEFAULT 180,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmartSchedulingPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmartProcedureRule" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "procedureKey" TEXT NOT NULL,
    "procedureName" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "clinicalMinReturnDays" INTEGER NOT NULL DEFAULT 0,
    "clinicalMaxReturnDays" INTEGER,
    "preferredReturnIntervalDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmartProcedureRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmartLaboratoryRule" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "laboratoryName" TEXT NOT NULL,
    "serviceKey" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 15,
    "safetyDays" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmartLaboratoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientSchedulingPreference" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "preferredWeekday" INTEGER,
    "preferredTimeStart" TEXT,
    "preferredTimeEnd" TEXT,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientSchedulingPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmartSchedulingDecision" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "procedure" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "referenceAt" TIMESTAMP(3) NOT NULL,
    "clinicalEarliestAt" TIMESTAMP(3) NOT NULL,
    "clinicalLatestAt" TIMESTAMP(3),
    "laboratoryReadyAt" TIMESTAMP(3),
    "financeReferenceAt" TIMESTAMP(3),
    "suggestedReturnAt" TIMESTAMP(3) NOT NULL,
    "chosenReturnAt" TIMESTAMP(3),
    "recommendation" TEXT NOT NULL,
    "warnings" JSONB,
    "factors" JSONB,
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmartSchedulingDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalDocumentTemplate" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "footer" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalDocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalDocument" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT,
    "professionalName" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "footer" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "authoredBy" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalDocumentHistory" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "footer" TEXT,
    "status" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "authoredBy" TEXT NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalDocumentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalFileCategory" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalFileCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalFile" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "categoryId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageProvider" TEXT NOT NULL DEFAULT 'PENDING',
    "storageKey" TEXT NOT NULL,
    "storageStatus" TEXT NOT NULL DEFAULT 'PENDING_UPLOAD',
    "externalUrl" TEXT,
    "checksum" TEXT,
    "previewKind" TEXT NOT NULL DEFAULT 'DOWNLOAD',
    "examDate" TIMESTAMP(3),
    "origin" TEXT,
    "requesterProfessionalId" TEXT,
    "requesterProfessionalName" TEXT,
    "description" TEXT,
    "tags" TEXT[],
    "tooth" TEXT,
    "region" TEXT,
    "treatmentItemId" TEXT,
    "clinicalEvolutionId" TEXT,
    "metadata" JSONB,
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecializedClinicalRecord" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "chiefComplaint" TEXT,
    "diagnosis" TEXT,
    "diagnosticHypothesis" TEXT,
    "treatmentPlan" TEXT,
    "responsibleId" TEXT,
    "responsibleName" TEXT,
    "clinicalData" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecializedClinicalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecializedClinicalEvolution" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "evolutionType" TEXT NOT NULL,
    "professionalId" TEXT,
    "professionalName" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "clinicalData" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecializedClinicalEvolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecializedClinicalAttachment" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "clinicalFileId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "storageKey" TEXT,
    "capturedAt" TIMESTAMP(3),
    "notes" TEXT,
    "metadata" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecializedClinicalAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAlertResolution" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "action" TEXT,
    "reason" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "patientId" TEXT,
    "supplierId" TEXT,
    "personName" TEXT,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "replacementEntityType" TEXT,
    "replacementEntityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialAlertResolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalAlertResolution" (
    "id" TEXT NOT NULL,
    "sequence" SERIAL NOT NULL,
    "protocol" TEXT,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "alertKey" TEXT,
    "area" TEXT NOT NULL,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "status" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "resolvedById" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalAlertResolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformFeedback" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "module" TEXT,
    "pagePath" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'Média',
    "rating" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'Enviado',
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorDocument" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT,
    "storageKey" TEXT,
    "storageProvider" TEXT NOT NULL DEFAULT 'PENDING',
    "storageStatus" TEXT NOT NULL DEFAULT 'PENDING_UPLOAD',
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "issueDate" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAccount" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'ASAAS',
    "beneficiaryType" TEXT NOT NULL,
    "doctorId" TEXT,
    "holderName" TEXT NOT NULL,
    "holderDocument" TEXT NOT NULL,
    "holderType" TEXT NOT NULL,
    "externalAccountId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnershipAgreement" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "arrangement" TEXT NOT NULL,
    "professionalPercent" DECIMAL(5,2),
    "tableMode" TEXT,
    "taxLoadPercent" DECIMAL(5,2),
    "taxLoadReviewedAt" DATE,
    "dailyRate" DECIMAL(12,2),
    "rentAmount" DECIMAL(12,2),
    "rentDueDay" INTEGER,
    "defaultRisk" TEXT NOT NULL DEFAULT 'COMPARTILHADA',
    "separateFinance" BOOLEAN NOT NULL DEFAULT false,
    "paymentDay" INTEGER,
    "startDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnershipAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgreementProcedurePrice" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "procedureCode" TEXT,
    "procedureName" TEXT NOT NULL,
    "grossAmount" DECIMAL(12,2),
    "professionalAmount" DECIMAL(12,2),
    "professionalPercent" DECIMAL(5,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgreementProcedurePrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SingleChargeTerm" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agreementId" TEXT,
    "patientId" TEXT,
    "issuerAccountId" TEXT,
    "termVersion" TEXT NOT NULL DEFAULT 'v1',
    "textSnapshot" TEXT NOT NULL,
    "acceptedByUserId" TEXT NOT NULL,
    "acceptedByName" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedIp" TEXT,
    "acceptedDevice" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SingleChargeTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargeGroup" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "treatmentPlanId" TEXT,
    "groupingMode" TEXT NOT NULL DEFAULT 'BENEFICIARIO',
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "singleChargeTermId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChargeGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeneficiaryCharge" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chargeGroupId" TEXT NOT NULL,
    "paymentAccountId" TEXT NOT NULL,
    "agreementId" TEXT,
    "doctorId" TEXT,
    "beneficiaryType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "grossAmount" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "financialCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "installments" INTEGER NOT NULL DEFAULT 1,
    "interestOwner" TEXT NOT NULL DEFAULT 'CLINICA',
    "dueDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "paidAt" TIMESTAMP(3),
    "paidAmount" DECIMAL(12,2),
    "externalChargeId" TEXT,
    "externalInvoiceUrl" TEXT,
    "financialEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BeneficiaryCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargeCalculation" (
    "id" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "procedureCode" TEXT,
    "procedureName" TEXT NOT NULL,
    "toothOrArch" TEXT,
    "grossAmount" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "professionalPercent" DECIMAL(5,2),
    "professionalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "clinicAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "financialCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "materialCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "labCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxLoadPercent" DECIMAL(5,2),
    "taxLoadAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netToBeneficiary" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChargeCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'ASAAS',
    "tenantId" TEXT,
    "eventType" TEXT NOT NULL,
    "externalId" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEBIDO',
    "errorMessage" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditWallet" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "balance" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "freeAllowance" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "freeUsed" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "freeResetAt" DATE,
    "lowAlertAt" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "autoRecharge" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ATIVA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "movement" TEXT NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "balanceAfter" DECIMAL(14,4) NOT NULL,
    "description" TEXT NOT NULL,
    "providerCost" DECIMAL(14,6),
    "provider" TEXT,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "actorId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditPackage" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "units" DECIMAL(14,4) NOT NULL,
    "priceAmount" DECIMAL(12,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditPurchase" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT,
    "kind" TEXT NOT NULL,
    "units" DECIMAL(14,4) NOT NULL,
    "priceAmount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" TEXT,
    "externalChargeId" TEXT,
    "invoiceUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "creditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanAllowance" (
    "id" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "monthlyFree" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "maxPerTask" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanAllowance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalDocument" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "financialEntryId" TEXT,
    "patientId" TEXT,
    "issuerType" TEXT NOT NULL DEFAULT 'PJ',
    "issuerName" TEXT,
    "issuerDocument" TEXT,
    "payerName" TEXT NOT NULL,
    "payerDocument" TEXT,
    "payerEmail" TEXT,
    "payerPhone" TEXT,
    "description" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "competence" TEXT,
    "paymentDate" DATE,
    "paymentMethod" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'INDEFINIDO',
    "status" TEXT NOT NULL DEFAULT 'AGUARDANDO_EMISSAO',
    "scheduledAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "documentNumber" TEXT,
    "protocolNumber" TEXT,
    "documentUrl" TEXT,
    "externalId" TEXT,
    "failureReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalSendRecord" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fiscalDocumentId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "recipientName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROGRAMADO',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalSendRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalAlert" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fiscalDocumentId" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIA',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalRule" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "autoProcess" BOOLEAN NOT NULL DEFAULT false,
    "issueDelayMinutes" INTEGER NOT NULL DEFAULT 60,
    "defaultKindPJ" TEXT NOT NULL DEFAULT 'NFSE',
    "defaultKindPF" TEXT NOT NULL DEFAULT 'RECEITA_SAUDE',
    "sendChannels" TEXT NOT NULL DEFAULT 'EMAIL',
    "requireAccountantApproval" BOOLEAN NOT NULL DEFAULT false,
    "serviceCode" TEXT,
    "issRate" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringBill" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'EXPENSE',
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GERAL',
    "personName" TEXT NOT NULL,
    "supplierId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "amountIsVariable" BOOLEAN NOT NULL DEFAULT false,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "dueDay" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "occurrences" INTEGER,
    "autoDebit" BOOLEAN NOT NULL DEFAULT false,
    "paymentMethod" TEXT,
    "costCenterId" TEXT,
    "accountingAccountId" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastGeneratedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "registryNumber" TEXT,
    "companyName" TEXT,
    "telegramChatId" TEXT,
    "notes" TEXT,
    "showInAgenda" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabNotification" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workRef" TEXT NOT NULL,
    "labMemberId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabOrder" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "trackingCode" TEXT,
    "patientName" TEXT NOT NULL,
    "dentistName" TEXT,
    "workType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "priority" TEXT,
    "dueDate" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "data" JSONB NOT NULL,
    "notifyLabMemberId" TEXT,
    "notifyChannels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceivableCharge" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "financialEntryId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'ASAAS',
    "externalId" TEXT NOT NULL,
    "installmentId" TEXT,
    "billingType" TEXT NOT NULL,
    "installmentCount" INTEGER NOT NULL DEFAULT 1,
    "value" DECIMAL(12,2) NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "invoiceUrl" TEXT,
    "pixCopyPaste" TEXT,
    "barcode" TEXT,
    "digitableLine" TEXT,
    "paidPaymentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "paidAt" TIMESTAMP(3),
    "netValue" DECIMAL(12,2),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceivableCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSplitLine" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "percent" DECIMAL(7,4),
    "plannedAmount" DECIMAL(12,2) NOT NULL,
    "finalAmount" DECIMAL(12,2),
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentSplitLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DunningNotice" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "financialEntryId" TEXT NOT NULL,
    "patientId" TEXT,
    "stage" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DunningNotice_pkey" PRIMARY KEY ("id")
);

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
    "consentimentoMarketing" BOOLEAN NOT NULL DEFAULT false,
    "consentimentoMarketingEm" TIMESTAMP(3),
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

COMMIT;
