-- EduMaster Pro: schema isolado "edumaster" (nao toca no schema public). Parte 2 de 3. Rode as partes em ordem.
BEGIN;
SET LOCAL search_path TO edumaster;

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
CREATE INDEX "Clinic_tenantId_idx" ON "Clinic"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_tenantId_cnpj_key" ON "Clinic"("tenantId", "cnpj");

-- CreateIndex
CREATE INDEX "User_clinicId_idx" ON "User"("clinicId");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_clinicId_email_key" ON "User"("clinicId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Doctor_userId_key" ON "Doctor"("userId");

-- CreateIndex
CREATE INDEX "Doctor_clinicId_idx" ON "Doctor"("clinicId");

-- CreateIndex
CREATE INDEX "Doctor_tenantId_idx" ON "Doctor"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Doctor_clinicId_cro_key" ON "Doctor"("clinicId", "cro");

-- CreateIndex
CREATE INDEX "Patient_clinicId_idx" ON "Patient"("clinicId");

-- CreateIndex
CREATE INDEX "Patient_tenantId_idx" ON "Patient"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_clinicId_recordNumber_key" ON "Patient"("clinicId", "recordNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_clinicId_cpf_key" ON "Patient"("clinicId", "cpf");

-- CreateIndex
CREATE INDEX "Schedule_clinicId_doctorId_idx" ON "Schedule"("clinicId", "doctorId");

-- CreateIndex
CREATE INDEX "Schedule_tenantId_idx" ON "Schedule"("tenantId");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_patientId_idx" ON "Appointment"("clinicId", "patientId");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_doctorId_idx" ON "Appointment"("clinicId", "doctorId");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_idx" ON "Appointment"("tenantId");

-- CreateIndex
CREATE INDEX "AppointmentHistory_clinicId_appointmentId_idx" ON "AppointmentHistory"("clinicId", "appointmentId");

-- CreateIndex
CREATE INDEX "AppointmentHistory_tenantId_idx" ON "AppointmentHistory"("tenantId");

-- CreateIndex
CREATE INDEX "AppointmentReminder_clinicId_scheduledFor_status_idx" ON "AppointmentReminder"("clinicId", "scheduledFor", "status");

-- CreateIndex
CREATE INDEX "AppointmentReminder_appointmentId_idx" ON "AppointmentReminder"("appointmentId");

-- CreateIndex
CREATE INDEX "AppointmentReminder_tenantId_idx" ON "AppointmentReminder"("tenantId");

-- CreateIndex
CREATE INDEX "Budget_clinicId_idx" ON "Budget"("clinicId");

-- CreateIndex
CREATE INDEX "Budget_patientId_idx" ON "Budget"("patientId");

-- CreateIndex
CREATE INDEX "Budget_tenantId_idx" ON "Budget"("tenantId");

-- CreateIndex
CREATE INDEX "BudgetRevision_clinicId_budgetId_createdAt_idx" ON "BudgetRevision"("clinicId", "budgetId", "createdAt");

-- CreateIndex
CREATE INDEX "BudgetRevision_tenantId_idx" ON "BudgetRevision"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetRevision_budgetId_version_key" ON "BudgetRevision"("budgetId", "version");

-- CreateIndex
CREATE INDEX "Payment_clinicId_idx" ON "Payment"("clinicId");

-- CreateIndex
CREATE INDEX "Payment_budgetId_idx" ON "Payment"("budgetId");

-- CreateIndex
CREATE INDEX "Payment_appointmentId_idx" ON "Payment"("appointmentId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_idx" ON "Payment"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialEntry_recurrenceKey_key" ON "FinancialEntry"("recurrenceKey");

-- CreateIndex
CREATE INDEX "FinancialEntry_clinicId_dueDate_idx" ON "FinancialEntry"("clinicId", "dueDate");

-- CreateIndex
CREATE INDEX "FinancialEntry_tenantId_idx" ON "FinancialEntry"("tenantId");

-- CreateIndex
CREATE INDEX "FinancialEntry_patientId_idx" ON "FinancialEntry"("patientId");

-- CreateIndex
CREATE INDEX "FinancialEntry_origin_originId_idx" ON "FinancialEntry"("origin", "originId");

-- CreateIndex
CREATE INDEX "FinancialEntry_supplierId_idx" ON "FinancialEntry"("supplierId");

-- CreateIndex
CREATE INDEX "FinancialEntry_accountingAccountId_idx" ON "FinancialEntry"("accountingAccountId");

-- CreateIndex
CREATE INDEX "FinancialEntry_costCenterId_idx" ON "FinancialEntry"("costCenterId");

-- CreateIndex
CREATE INDEX "FinancialEntry_accountingStatus_idx" ON "FinancialEntry"("accountingStatus");

-- CreateIndex
CREATE INDEX "PaymentProviderConfig_tenantId_idx" ON "PaymentProviderConfig"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProviderConfig_clinicId_provider_key" ON "PaymentProviderConfig"("clinicId", "provider");

-- CreateIndex
CREATE INDEX "Supplier_clinicId_name_idx" ON "Supplier"("clinicId", "name");

-- CreateIndex
CREATE INDEX "Supplier_tenantId_idx" ON "Supplier"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_clinicId_document_key" ON "Supplier"("clinicId", "document");

-- CreateIndex
CREATE INDEX "AccountingAccount_clinicId_group_idx" ON "AccountingAccount"("clinicId", "group");

-- CreateIndex
CREATE INDEX "AccountingAccount_tenantId_idx" ON "AccountingAccount"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingAccount_clinicId_code_key" ON "AccountingAccount"("clinicId", "code");

-- CreateIndex
CREATE INDEX "CostCenter_clinicId_name_idx" ON "CostCenter"("clinicId", "name");

-- CreateIndex
CREATE INDEX "CostCenter_tenantId_idx" ON "CostCenter"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_clinicId_code_key" ON "CostCenter"("clinicId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "TaxObligation_financialEntryId_key" ON "TaxObligation"("financialEntryId");

-- CreateIndex
CREATE INDEX "TaxObligation_clinicId_dueDate_idx" ON "TaxObligation"("clinicId", "dueDate");

-- CreateIndex
CREATE INDEX "TaxObligation_tenantId_idx" ON "TaxObligation"("tenantId");

-- CreateIndex
CREATE INDEX "TaxObligation_status_idx" ON "TaxObligation"("status");

-- CreateIndex
CREATE INDEX "AccountantPortalAccess_tenantId_idx" ON "AccountantPortalAccess"("tenantId");

-- CreateIndex
CREATE INDEX "AccountantPortalAccess_status_idx" ON "AccountantPortalAccess"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AccountantPortalAccess_clinicId_email_key" ON "AccountantPortalAccess"("clinicId", "email");

-- CreateIndex
CREATE INDEX "Feedback_clinicId_idx" ON "Feedback"("clinicId");

-- CreateIndex
CREATE INDEX "Feedback_patientId_idx" ON "Feedback"("patientId");

-- CreateIndex
CREATE INDEX "Feedback_appointmentId_idx" ON "Feedback"("appointmentId");

-- CreateIndex
CREATE INDEX "Feedback_tenantId_idx" ON "Feedback"("tenantId");

-- CreateIndex
CREATE INDEX "ClinicalEvolution_clinicId_patientId_idx" ON "ClinicalEvolution"("clinicId", "patientId");

-- CreateIndex
CREATE INDEX "ClinicalEvolution_tenantId_idx" ON "ClinicalEvolution"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientClinicalRecord_patientId_key" ON "PatientClinicalRecord"("patientId");

-- CreateIndex
CREATE INDEX "PatientClinicalRecord_clinicId_patientId_idx" ON "PatientClinicalRecord"("clinicId", "patientId");

-- CreateIndex
CREATE INDEX "PatientClinicalRecord_tenantId_idx" ON "PatientClinicalRecord"("tenantId");

-- CreateIndex
CREATE INDEX "PatientClinicalRecord_clinicId_status_idx" ON "PatientClinicalRecord"("clinicId", "status");

-- CreateIndex
CREATE INDEX "PatientClinicalRecordRevision_clinicId_patientId_createdAt_idx" ON "PatientClinicalRecordRevision"("clinicId", "patientId", "createdAt");

-- CreateIndex
CREATE INDEX "PatientClinicalRecordRevision_tenantId_idx" ON "PatientClinicalRecordRevision"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientClinicalRecordRevision_clinicalRecordId_revisionNumb_key" ON "PatientClinicalRecordRevision"("clinicalRecordId", "revisionNumber");

-- CreateIndex
CREATE INDEX "ClinicalCustomFieldDefinition_tenantId_idx" ON "ClinicalCustomFieldDefinition"("tenantId");

-- CreateIndex
CREATE INDEX "ClinicalCustomFieldDefinition_clinicId_section_displayOrder_idx" ON "ClinicalCustomFieldDefinition"("clinicId", "section", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalCustomFieldDefinition_clinicId_key_key" ON "ClinicalCustomFieldDefinition"("clinicId", "key");

-- CreateIndex
CREATE INDEX "OdontogramMark_clinicId_patientId_idx" ON "OdontogramMark"("clinicId", "patientId");

-- CreateIndex
CREATE INDEX "OdontogramMark_tenantId_idx" ON "OdontogramMark"("tenantId");

-- CreateIndex
CREATE INDEX "OdontogramMark_patientId_tooth_idx" ON "OdontogramMark"("patientId", "tooth");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentItem_odontogramMarkId_key" ON "TreatmentItem"("odontogramMarkId");

-- CreateIndex
CREATE INDEX "TreatmentItem_clinicId_patientId_idx" ON "TreatmentItem"("clinicId", "patientId");

-- CreateIndex
CREATE INDEX "TreatmentItem_tenantId_idx" ON "TreatmentItem"("tenantId");

-- CreateIndex
CREATE INDEX "TreatmentPlanRevision_clinicId_patientId_createdAt_idx" ON "TreatmentPlanRevision"("clinicId", "patientId", "createdAt");

-- CreateIndex
CREATE INDEX "TreatmentPlanRevision_tenantId_idx" ON "TreatmentPlanRevision"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentPlanRevision_patientId_version_key" ON "TreatmentPlanRevision"("patientId", "version");

-- CreateIndex
CREATE INDEX "LaboratoryWork_clinicId_status_idx" ON "LaboratoryWork"("clinicId", "status");

-- CreateIndex
CREATE INDEX "LaboratoryWork_tenantId_idx" ON "LaboratoryWork"("tenantId");

-- CreateIndex
CREATE INDEX "LaboratoryWork_patientId_idx" ON "LaboratoryWork"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "LaboratoryWork_clinicId_trackingCode_key" ON "LaboratoryWork"("clinicId", "trackingCode");

-- CreateIndex
CREATE INDEX "LaboratoryWorkHistory_clinicId_laboratoryWorkId_idx" ON "LaboratoryWorkHistory"("clinicId", "laboratoryWorkId");

-- CreateIndex
CREATE INDEX "LaboratoryWorkHistory_tenantId_idx" ON "LaboratoryWorkHistory"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DentalDesignCase_laboratoryWorkId_key" ON "DentalDesignCase"("laboratoryWorkId");

-- CreateIndex
CREATE INDEX "DentalDesignCase_clinicId_status_idx" ON "DentalDesignCase"("clinicId", "status");

-- CreateIndex
CREATE INDEX "DentalDesignCase_tenantId_idx" ON "DentalDesignCase"("tenantId");

-- CreateIndex
CREATE INDEX "DentalDesignCase_patientId_idx" ON "DentalDesignCase"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "AccessProfile_clinicId_idx" ON "AccessProfile"("clinicId");

-- CreateIndex
CREATE INDEX "AccessProfile_tenantId_idx" ON "AccessProfile"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessProfile_clinicId_code_key" ON "AccessProfile"("clinicId", "code");

-- CreateIndex
CREATE INDEX "AccessProfilePermission_permissionId_idx" ON "AccessProfilePermission"("permissionId");

-- CreateIndex
CREATE INDEX "UserAccessProfile_profileId_idx" ON "UserAccessProfile"("profileId");

-- CreateIndex
CREATE INDEX "AuditLog_clinicId_createdAt_idx" ON "AuditLog"("clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_clinicId_idx" ON "RefreshToken"("clinicId");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_clinicId_idx" ON "PasswordResetToken"("clinicId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "HREmployee_clinicId_status_idx" ON "HREmployee"("clinicId", "status");

-- CreateIndex
CREATE INDEX "HREmployee_tenantId_idx" ON "HREmployee"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "HREmployee_clinicId_employeeCode_key" ON "HREmployee"("clinicId", "employeeCode");

-- CreateIndex
CREATE INDEX "HRAttendance_clinicId_date_idx" ON "HRAttendance"("clinicId", "date");

-- CreateIndex
CREATE INDEX "HRAttendance_employeeId_date_idx" ON "HRAttendance"("employeeId", "date");

-- CreateIndex
CREATE INDEX "HRAttendance_tenantId_idx" ON "HRAttendance"("tenantId");

-- CreateIndex
CREATE INDEX "HRPayrollEntry_clinicId_reference_idx" ON "HRPayrollEntry"("clinicId", "reference");

-- CreateIndex
CREATE INDEX "HRPayrollEntry_employeeId_reference_idx" ON "HRPayrollEntry"("employeeId", "reference");

-- CreateIndex
CREATE INDEX "HRPayrollEntry_tenantId_idx" ON "HRPayrollEntry"("tenantId");

-- CreateIndex
CREATE INDEX "HRPayrollClosing_tenantId_idx" ON "HRPayrollClosing"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "HRPayrollClosing_clinicId_reference_key" ON "HRPayrollClosing"("clinicId", "reference");

-- CreateIndex
CREATE INDEX "HRVacation_clinicId_concessionDeadline_idx" ON "HRVacation"("clinicId", "concessionDeadline");

-- CreateIndex
CREATE INDEX "HRVacation_tenantId_idx" ON "HRVacation"("tenantId");

-- CreateIndex
CREATE INDEX "HRDocument_clinicId_expiresAt_idx" ON "HRDocument"("clinicId", "expiresAt");

-- CreateIndex
CREATE INDEX "HRDocument_tenantId_idx" ON "HRDocument"("tenantId");

-- CreateIndex
CREATE INDEX "HRDisciplinaryAction_clinicId_date_idx" ON "HRDisciplinaryAction"("clinicId", "date");

-- CreateIndex
CREATE INDEX "HRDisciplinaryAction_tenantId_idx" ON "HRDisciplinaryAction"("tenantId");

-- CreateIndex
CREATE INDEX "RevahContact_clinicId_name_idx" ON "RevahContact"("clinicId", "name");

-- CreateIndex
CREATE INDEX "RevahContact_tenantId_idx" ON "RevahContact"("tenantId");

-- CreateIndex
CREATE INDEX "RevahCampaign_clinicId_status_idx" ON "RevahCampaign"("clinicId", "status");

-- CreateIndex
CREATE INDEX "RevahCampaign_tenantId_idx" ON "RevahCampaign"("tenantId");

-- CreateIndex
CREATE INDEX "RevahMessage_clinicId_status_idx" ON "RevahMessage"("clinicId", "status");

-- CreateIndex
CREATE INDEX "RevahMessage_tenantId_idx" ON "RevahMessage"("tenantId");

-- CreateIndex
CREATE INDEX "SalesLead_clinicId_stage_idx" ON "SalesLead"("clinicId", "stage");

-- CreateIndex
CREATE INDEX "SalesLead_tenantId_idx" ON "SalesLead"("tenantId");

-- CreateIndex
CREATE INDEX "SalesProduct_tenantId_idx" ON "SalesProduct"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesProduct_clinicId_sku_key" ON "SalesProduct"("clinicId", "sku");

-- CreateIndex
CREATE INDEX "ClinicUnit_tenantId_idx" ON "ClinicUnit"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicUnit_clinicId_code_key" ON "ClinicUnit"("clinicId", "code");

-- CreateIndex
CREATE INDEX "TenantStorageConfig_tenantId_idx" ON "TenantStorageConfig"("tenantId");

COMMIT;
