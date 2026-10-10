export interface Tutorial {
  title: string;
  what: string;
  steps: string[];
  tips?: string[];
}

/** Guia por módulo, chaveado pelo caminho base da rota. Telas sem guia próprio recebem um guia geral. */
export const TUTORIALS: Record<string, Tutorial> = {
  "/": { title: "Dashboard", what: "Resumo do dia da clínica: agenda, financeiro, pendências e indicadores.", steps: ["Veja os cartões no topo para o panorama de hoje.", "Clique em um cartão ou alerta para abrir a tela correspondente.", "Use a busca do cabeçalho para ir direto a qualquer módulo."], tips: ["Alertas em amarelo/vermelho pedem ação; resolva-os para limpar a lista."] },
  "/agenda": { title: "Agenda", what: "Marcação e acompanhamento das consultas por profissional e sala.", steps: ["Clique em um horário livre para criar um agendamento (ou use o agendamento rápido).", "Escolha paciente, procedimento e profissional; a duração vem do procedimento.", "Arraste ou abra o compromisso para remarcar, confirmar, cancelar ou marcar chegada.", "Use as configurações de disponibilidade para definir horários e bloqueios."], tips: ["O status do atendimento alimenta o Painel de Atendimentos (sala de espera)."] },
  "/pacientes": { title: "Pacientes", what: "Cadastro e consulta de pacientes.", steps: ["Use 'Novo paciente' e preencha ao menos nome e telefone com DDD.", "Busque por nome, telefone ou CPF.", "Abra o paciente para ver ficha, prontuário, arquivos e histórico.", "Para trazer pacientes de outro sistema use Configurações → Importar Pacientes."], tips: ["Pacientes são inativados, não apagados, para preservar o histórico."] },
  "/prontuario": { title: "Prontuário", what: "Registro clínico do paciente: anamnese, evoluções, odontograma e documentos.", steps: ["Selecione o paciente.", "Preencha anamnese e registre cada atendimento em Evolução.", "Anexe exames e fotos pela área de arquivos clínicos.", "As revisões ficam salvas: nada é sobrescrito sem histórico."], tips: ["Cada abertura de prontuário é registrada na auditoria (LGPD)."] },
  "/smile-design": { title: "DentalPod Design", what: "Simulação digital do sorriso (DSD) e projeto CAD de facetas, coroas e próteses.", steps: ["Selecione o paciente e importe uma foto de sorriso/face.", "Em Análise, deixe a IA marcar os pontos faciais e ajuste se preciso.", "Em Desenho, use 'Desenho automático' e refine tamanhos, formas e posições.", "Em 3D/Produção gere os modelos e exporte STL/OBJ/PLY/3MF para impressão ou fresagem."], tips: ["Imagens impróprias são bloqueadas automaticamente; envie apenas fotos clínicas."] },
  "/orcamentos-tratamentos": { title: "Orçamentos e Tratamentos", what: "Plano de tratamento com valores, aprovação e acompanhamento.", steps: ["Escolha o paciente e adicione procedimentos ao orçamento.", "Ajuste valores/descontos e gere o PDF para o paciente.", "Aprovado o orçamento, os itens viram tratamentos a executar."] },
  "/documentos-clinicos": { title: "Documentos Clínicos", what: "Receitas, atestados, termos e demais documentos do paciente.", steps: ["Escolha o modelo e o paciente.", "Revise o texto preenchido automaticamente.", "Imprima ou salve em PDF; a assinatura segue o fluxo configurado."] },
  "/laboratorio": { title: "Laboratório", what: "Pedidos de próteses e trabalhos protéticos ao laboratório.", steps: ["Crie o pedido ligado ao paciente e ao tratamento.", "Acompanhe as etapas e prazos.", "Registre a chegada e a conferência do trabalho."] },
  "/financeiro": { title: "Financeiro", what: "Contas a receber e a pagar, baixas e fluxo de caixa.", steps: ["Use 'Novo lançamento' para receitas e despesas.", "Filtre por tipo, período e situação.", "Use 'Baixar' ao receber/pagar e gere a cobrança quando houver gateway conectado."], tips: ["Cancelar não apaga: mantém o histórico para auditoria."] },
  "/pagamentos": { title: "Cobranças", what: "Gestão de cobranças e meios de recebimento.", steps: ["Ative os meios de recebimento desejados.", "Gere PIX, boleto ou cartão para um lançamento.", "Acompanhe a situação até a baixa automática."] },
  "/recebimentos-online": { title: "Recebimentos online", what: "Conta de recebimentos da clínica e divisão automática com dentistas.", steps: ["Conecte a conta de recebimentos com a chave de API.", "Cadastre a carteira de cada dentista para a divisão.", "Acompanhe repasses e totais."] },
  "/crm": { title: "CRM", what: "Funil de oportunidades e relacionamento com pacientes.", steps: ["Cadastre ou receba leads.", "Mova os cartões pelas etapas do funil.", "Registre contatos e próximos passos."] },
  "/recall": { title: "Recall e Reativação", what: "Chamar pacientes para retorno e reativar inativos.", steps: ["Escolha o segmento (ex.: sem retorno há 6 meses).", "Revise a mensagem e os canais.", "Dispare e acompanhe as respostas."] },
  "/equipe": { title: "Equipe", what: "Usuários, funções e acesso da clínica.", steps: ["Convide/cadastre o membro com a função certa.", "Ajuste permissões em Configurações → Permissões.", "Inative quem sair; o histórico é preservado."] },
  "/permissoes": { title: "Permissões", what: "Controle do que cada função pode ver e fazer.", steps: ["Escolha o usuário ou a função.", "Marque apenas o necessário para o trabalho dele.", "As mudanças valem no próximo acesso."] },
  "/seguranca": { title: "Segurança da conta", what: "Verificação em 2 etapas para proteger seu acesso.", steps: ["Clique em 'Ativar agora' e escaneie o QR no app autenticador.", "Digite o código de 6 dígitos para confirmar.", "Guarde os códigos de recuperação em local seguro."], tips: ["Sem celular? Use um código de recuperação (vale uma vez)."] },
  "/configuracoes": { title: "Configurações", what: "Dados e preferências da clínica.", steps: ["Atualize dados da clínica, logotipo e preferências.", "Configure alertas, agenda e integrações nas respectivas telas."] },
  "/importar-pacientes": { title: "Importar Pacientes", what: "Traz pacientes de planilha para o sistema.", steps: ["Baixe o modelo, preencha e envie o arquivo.", "Confira a prévia; duplicados são ignorados.", "Confirme a importação."] },
  "/sugestoes-problemas": { title: "Sugestões e Problemas", what: "Central do que você reportou pelo botão Feedback.", steps: ["Use o botão 'Feedback' (canto da tela) em qualquer página.", "Descreva o que houve; a tela de origem vai junto automaticamente.", "Acompanhe aqui o andamento."] },
  "/estoque": { title: "Estoque", what: "Materiais, entradas, saídas e alertas de mínimo.", steps: ["Cadastre os itens com estoque mínimo.", "Registre entradas e consumos.", "Veja os alertas de reposição."] },
  "/rh": { title: "RH e Gestão de Pessoas", what: "Colaboradores, ponto e documentos.", steps: ["Cadastre colaboradores e jornada.", "Use 'Registrar ponto' no início/fim do expediente.", "Consulte horas e ocorrências."] },
  "/relatorios": { title: "Relatórios", what: "Relatórios de gestão exportáveis.", steps: ["Escolha o relatório e o período.", "Exporte em PDF/Excel/CSV pelo menu de exportação."] },
  "/painel-atendimentos": { title: "Painel de Atendimentos", what: "Sala de espera em tempo real.", steps: ["Mantenha esta tela aberta na recepção.", "Os pacientes avançam conforme a agenda registra chegada e atendimento."] },
};

const GENERIC: Tutorial = {
  title: "Como usar esta tela",
  what: "Cada módulo do Dentalpos One segue o mesmo padrão.",
  steps: ["Use o menu lateral (ou a busca do cabeçalho) para trocar de módulo.", "Botões principais ficam no topo da tela; filtros acima das listas.", "Ao salvar, aparece a barra de progresso no topo e um aviso de confirmação.", "Algo errado ou faltando? Use o botão 'Feedback' no canto da tela."],
};

export function tutorialFor(pathname: string): Tutorial {
  if (TUTORIALS[pathname]) return TUTORIALS[pathname];
  const hit = Object.keys(TUTORIALS)
    .filter((k) => k !== "/" && (pathname === k || pathname.startsWith(k + "/")))
    .sort((a, b) => b.length - a.length)[0];
  return hit ? TUTORIALS[hit] : GENERIC;
}
