// Base REFERENCIAL de CNAEs comuns (CNAE 2.0, subclasses de 7 dígitos) com sinalizadores de apoio à abertura de empresas.
// ATENÇÃO: o enquadramento (anexo do Simples, ISS/ICMS, risco, licenças e MEI) é INDICATIVO e simplificado — sempre conferir na tabela oficial
// (CONCLA/IBGE, Resolução CGSN 140/2018, anexos da LC 123/2006, legislação municipal) e com o contador. Dados sem valor legal.

export type Setor = 'EDU' | 'SAUDE' | 'BELEZA' | 'COM' | 'SERV' | 'IND' | 'ALIM' | 'TRANS' | 'CONS' | 'TI' | 'ADV' | 'IMOB' | 'ARTE' | 'OUT'
export type Risco = 'BAIXO' | 'MEDIO' | 'ALTO'
export interface Cnae {
  codigo: string; descricao: string; setor: Setor
  anexoSimples: string            // I | II | III | IV | V | III/V (depende do fator R)
  iss: boolean; icms: boolean
  risco: Risco
  mei: boolean                    // costuma ser permitido ao MEI (conferir a lista oficial de ocupações)
  vigilanciaSanitaria: boolean; bombeiros: boolean; ambiental: boolean; conselhoClasse: boolean; educacaoRegulada: boolean
}

export const SETORES: Record<Setor, string> = { EDU: 'Educação', SAUDE: 'Saúde', BELEZA: 'Beleza e bem-estar', COM: 'Comércio', SERV: 'Serviços em geral', IND: 'Indústria', ALIM: 'Alimentação e hospedagem', TRANS: 'Transporte e logística', CONS: 'Construção e reparos', TI: 'Tecnologia da informação', ADV: 'Jurídico, contábil e consultoria', IMOB: 'Imobiliário', ARTE: 'Arte, esporte e lazer', OUT: 'Outros' }

const ANEXO_PADRAO: Record<Setor, string> = { EDU: 'III', SAUDE: 'III', BELEZA: 'III', COM: 'I', SERV: 'III', IND: 'II', ALIM: 'I', TRANS: 'III', CONS: 'IV', TI: 'III/V', ADV: 'III/V', IMOB: 'III', ARTE: 'III', OUT: 'III' }

// [codigo, descricao, setor, anexo ('' = padrão do setor), risco (B/M/A), flags: M mei, S vigilância sanitária, A ambiental, B bombeiros, C conselho de classe, E educação regulada]
type Linha = [string, string, Setor, string, 'B' | 'M' | 'A', string]
const L: Linha[] = [
  // ---- Educação
  ['8511200', 'Educação infantil - creche', 'EDU', '', 'M', 'SBE'],
  ['8512100', 'Educação infantil - pré-escola', 'EDU', '', 'M', 'SBE'],
  ['8513900', 'Ensino fundamental', 'EDU', '', 'M', 'BE'],
  ['8520100', 'Ensino médio', 'EDU', '', 'M', 'BE'],
  ['8531700', 'Educação superior - graduação', 'EDU', '', 'M', 'BE'],
  ['8532500', 'Educação superior - graduação e pós-graduação', 'EDU', '', 'M', 'BE'],
  ['8533300', 'Educação superior - pós-graduação e extensão', 'EDU', '', 'M', 'BE'],
  ['8541400', 'Educação profissional de nível técnico', 'EDU', '', 'M', 'BE'],
  ['8542200', 'Educação profissional de nível tecnológico', 'EDU', '', 'M', 'BE'],
  ['8550302', 'Atividades de apoio à educação, exceto caixas escolares', 'EDU', '', 'B', ''],
  ['8591100', 'Ensino de esportes', 'EDU', '', 'B', 'MB'],
  ['8592901', 'Ensino de dança', 'EDU', '', 'B', 'MB'],
  ['8592902', 'Ensino de artes cênicas, exceto dança', 'EDU', '', 'B', 'M'],
  ['8592903', 'Ensino de música', 'EDU', '', 'B', 'M'],
  ['8592999', 'Ensino de arte e cultura não especificado anteriormente', 'EDU', '', 'B', 'M'],
  ['8593700', 'Ensino de idiomas', 'EDU', '', 'B', 'M'],
  ['8599601', 'Formação de condutores', 'EDU', '', 'M', 'B'],
  ['8599603', 'Treinamento em informática', 'EDU', '', 'B', 'M'],
  ['8599604', 'Treinamento em desenvolvimento profissional e gerencial', 'EDU', '', 'B', 'M'],
  ['8599605', 'Cursos preparatórios para concursos', 'EDU', '', 'B', 'M'],
  ['8599699', 'Outras atividades de ensino não especificadas anteriormente', 'EDU', '', 'B', 'M'],
  // ---- Saúde
  ['8610101', 'Atividades de atendimento hospitalar, exceto pronto-socorro e unidades para atendimento a urgências', 'SAUDE', '', 'A', 'SABC'],
  ['8610102', 'Atividades de atendimento em pronto-socorro e unidades hospitalares para atendimento a urgências', 'SAUDE', '', 'A', 'SABC'],
  ['8630501', 'Atividade médica ambulatorial com recursos para realização de procedimentos cirúrgicos', 'SAUDE', 'III/V', 'A', 'SBC'],
  ['8630502', 'Atividade médica ambulatorial com recursos para realização de exames complementares', 'SAUDE', 'III/V', 'M', 'SBC'],
  ['8630503', 'Atividade médica ambulatorial restrita a consultas', 'SAUDE', 'III/V', 'M', 'SC'],
  ['8630504', 'Atividade odontológica', 'SAUDE', 'III/V', 'M', 'SC'],
  ['8630506', 'Serviços de vacinação e imunização humana', 'SAUDE', '', 'A', 'SBC'],
  ['8630507', 'Atividades de reprodução humana assistida', 'SAUDE', '', 'A', 'SBC'],
  ['8630599', 'Atividades de atenção ambulatorial não especificadas anteriormente', 'SAUDE', '', 'M', 'SC'],
  ['8640201', 'Laboratórios de anatomia patológica e citológica', 'SAUDE', '', 'A', 'SABC'],
  ['8640202', 'Laboratórios clínicos', 'SAUDE', '', 'A', 'SABC'],
  ['8640205', 'Serviços de diagnóstico por imagem com uso de radiação ionizante, exceto tomografia', 'SAUDE', '', 'A', 'SBC'],
  ['8640206', 'Serviços de ressonância magnética', 'SAUDE', '', 'A', 'SBC'],
  ['8640207', 'Serviços de diagnóstico por imagem sem uso de radiação ionizante, exceto ressonância magnética', 'SAUDE', '', 'M', 'SC'],
  ['8650001', 'Atividades de enfermagem', 'SAUDE', '', 'M', 'SC'],
  ['8650002', 'Atividades de profissionais da nutrição', 'SAUDE', '', 'B', 'SC'],
  ['8650003', 'Atividades de psicologia e psicanálise', 'SAUDE', '', 'B', 'C'],
  ['8650004', 'Atividades de fisioterapia', 'SAUDE', '', 'M', 'SC'],
  ['8650005', 'Atividades de terapia ocupacional', 'SAUDE', '', 'B', 'SC'],
  ['8650006', 'Atividades de fonoaudiologia', 'SAUDE', '', 'B', 'SC'],
  ['8650099', 'Atividades de profissionais da área de saúde não especificadas anteriormente', 'SAUDE', '', 'M', 'SC'],
  ['8690901', 'Atividades de práticas integrativas e complementares em saúde humana', 'SAUDE', '', 'M', 'S'],
  ['7500100', 'Atividades veterinárias', 'SAUDE', '', 'M', 'SC'],
  ['3250706', 'Serviços de prótese dentária', 'SAUDE', 'III', 'M', 'SC'],
  ['4771701', 'Comércio varejista de produtos farmacêuticos, sem manipulação de fórmulas', 'COM', '', 'A', 'SBC'],
  ['4771702', 'Comércio varejista de produtos farmacêuticos, com manipulação de fórmulas', 'COM', '', 'A', 'SABC'],
  ['4773300', 'Comércio varejista de artigos médicos e ortopédicos', 'COM', '', 'M', 'S'],
  ['4774100', 'Comércio varejista de artigos de óptica', 'COM', '', 'B', 'C'],
  // ---- Beleza e bem-estar
  ['9602501', 'Cabeleireiros, manicure e pedicure', 'BELEZA', '', 'M', 'MS'],
  ['9602502', 'Atividades de estética e outros serviços de cuidados com a beleza', 'BELEZA', '', 'M', 'MS'],
  ['9609208', 'Higiene e embelezamento de animais domésticos', 'BELEZA', '', 'M', 'MS'],
  ['9609299', 'Outras atividades de serviços pessoais não especificadas anteriormente', 'BELEZA', '', 'B', 'M'],
  ['4772500', 'Comércio varejista de cosméticos, produtos de perfumaria e de higiene pessoal', 'COM', '', 'M', 'MS'],
  ['9313100', 'Atividades de condicionamento físico', 'ARTE', '', 'M', 'BC'],
  ['9601701', 'Lavanderias', 'BELEZA', '', 'M', 'MA'],
  ['9603301', 'Gestão e manutenção de cemitérios', 'OUT', '', 'A', 'SAB'],
  // ---- Comércio
  ['4711301', 'Comércio varejista de mercadorias em geral, com predominância de produtos alimentícios - hipermercados', 'COM', '', 'A', 'SB'],
  ['4711302', 'Comércio varejista de mercadorias em geral, com predominância de produtos alimentícios - supermercados', 'COM', '', 'A', 'SB'],
  ['4712100', 'Comércio varejista de mercadorias em geral, com predominância de produtos alimentícios - minimercados, mercearias e armazéns', 'COM', '', 'M', 'MS'],
  ['4713002', 'Lojas de variedades, exceto lojas de departamentos ou magazines', 'COM', '', 'M', 'MB'],
  ['4721102', 'Padaria e confeitaria com predominância de produção própria', 'COM', '', 'M', 'MS'],
  ['4721104', 'Comércio varejista de doces, balas, bombons e semelhantes', 'COM', '', 'B', 'MS'],
  ['4722901', 'Comércio varejista de carnes - açougues', 'COM', '', 'A', 'SB'],
  ['4724500', 'Comércio varejista de hortifrutigranjeiros', 'COM', '', 'B', 'MS'],
  ['4729699', 'Comércio varejista de produtos alimentícios em geral ou especializado em produtos alimentícios não especificados anteriormente', 'COM', '', 'M', 'MS'],
  ['4731800', 'Comércio varejista de combustíveis para veículos automotores', 'COM', '', 'A', 'ABC'],
  ['4741500', 'Comércio varejista de tintas e materiais para pintura', 'COM', '', 'M', 'AB'],
  ['4742300', 'Comércio varejista de material elétrico', 'COM', '', 'B', 'M'],
  ['4744001', 'Comércio varejista de ferragens e ferramentas', 'COM', '', 'B', 'M'],
  ['4744099', 'Comércio varejista de materiais de construção em geral', 'COM', '', 'M', 'MB'],
  ['4751201', 'Comércio varejista especializado de equipamentos e suprimentos de informática', 'COM', '', 'B', 'M'],
  ['4752100', 'Comércio varejista especializado de equipamentos de telefonia e comunicação', 'COM', '', 'B', 'M'],
  ['4753900', 'Comércio varejista especializado de eletrodomésticos e equipamentos de áudio e vídeo', 'COM', '', 'B', 'M'],
  ['4754701', 'Comércio varejista de móveis', 'COM', '', 'B', 'M'],
  ['4755501', 'Comércio varejista de tecidos', 'COM', '', 'B', 'M'],
  ['4756300', 'Comércio varejista especializado de instrumentos musicais e acessórios', 'COM', '', 'B', 'M'],
  ['4761001', 'Comércio varejista de livros', 'COM', '', 'B', 'M'],
  ['4761003', 'Comércio varejista de artigos de papelaria', 'COM', '', 'B', 'M'],
  ['4763601', 'Comércio varejista de brinquedos e artigos recreativos', 'COM', '', 'B', 'M'],
  ['4763602', 'Comércio varejista de artigos esportivos', 'COM', '', 'B', 'M'],
  ['4781400', 'Comércio varejista de artigos do vestuário e acessórios', 'COM', '', 'B', 'M'],
  ['4782201', 'Comércio varejista de calçados', 'COM', '', 'B', 'M'],
  ['4783101', 'Comércio varejista de artigos de joalheria', 'COM', '', 'B', ''],
  ['4789004', 'Comércio varejista de animais vivos e de artigos e alimentos para animais de estimação', 'COM', '', 'M', 'MS'],
  ['4789099', 'Comércio varejista de outros produtos novos não especificados anteriormente', 'COM', '', 'B', 'M'],
  ['4511101', 'Comércio a varejo de automóveis, camionetas e utilitários novos', 'COM', '', 'M', 'B'],
  ['4530703', 'Comércio de peças e acessórios novos para veículos automotores', 'COM', '', 'B', 'M'],
  ['4541206', 'Comércio a varejo de peças e acessórios novos para motocicletas e motonetas', 'COM', '', 'B', 'M'],
  ['4616800', 'Representantes comerciais e agentes do comércio de mercadorias em geral não especializado', 'SERV', 'III', 'B', 'M'],
  ['4639701', 'Comércio atacadista de produtos alimentícios em geral', 'COM', '', 'M', 'SB'],
  ['4649408', 'Comércio atacadista de produtos de higiene, limpeza e conservação domiciliar', 'COM', '', 'M', 'B'],
  // ---- Alimentação e hospedagem
  ['5611201', 'Restaurantes e similares', 'ALIM', '', 'M', 'SB'],
  ['5611203', 'Lanchonetes, casas de chá, de sucos e similares', 'ALIM', '', 'M', 'MS'],
  ['5611204', 'Bares e outros estabelecimentos especializados em servir bebidas, sem entretenimento', 'ALIM', '', 'M', 'SB'],
  ['5612100', 'Serviços ambulantes de alimentação', 'ALIM', '', 'M', 'MS'],
  ['5620102', 'Serviços de alimentação para eventos e recepções - bufê', 'ALIM', '', 'M', 'S'],
  ['5620104', 'Fornecimento de alimentos preparados preponderantemente para consumo domiciliar', 'ALIM', '', 'M', 'MS'],
  ['5510801', 'Hotéis', 'ALIM', 'III', 'A', 'SBA'],
  ['5590601', 'Albergues, exceto assistenciais', 'ALIM', 'III', 'M', 'SB'],
  ['1091102', 'Fabricação de produtos de padaria e confeitaria com predominância de produção própria', 'IND', 'I', 'M', 'MS'],
  // ---- Indústria leve
  ['1091101', 'Fabricação de produtos de panificação industrial', 'IND', '', 'A', 'SAB'],
  ['1412601', 'Confecção de peças do vestuário, exceto roupas íntimas e as confeccionadas sob medida', 'IND', '', 'B', 'M'],
  ['1413401', 'Confecção de roupas profissionais, exceto sob medida', 'IND', '', 'B', ''],
  ['1811301', 'Impressão de jornais', 'IND', '', 'M', 'A'],
  ['1813099', 'Impressão de material para outros usos', 'IND', '', 'M', 'A'],
  ['1821100', 'Serviços de pré-impressão', 'IND', '', 'B', ''],
  ['1822900', 'Serviços de acabamentos gráficos, exceto encadernação e plastificação', 'IND', '', 'B', ''],
  ['3101200', 'Fabricação de móveis com predominância de madeira', 'IND', '', 'M', 'AB'],
  ['3329501', 'Serviços de montagem de móveis de qualquer material', 'CONS', 'III', 'B', 'M'],
  ['3250701', 'Fabricação de instrumentos não eletrônicos e utensílios para uso médico, cirúrgico, odontológico e de laboratório', 'IND', '', 'A', 'SA'],
  // ---- Tecnologia
  ['6201501', 'Desenvolvimento de programas de computador sob encomenda', 'TI', '', 'B', ''],
  ['6201502', 'Web design', 'TI', '', 'B', ''],
  ['6202300', 'Desenvolvimento e licenciamento de programas de computador customizáveis', 'TI', '', 'B', ''],
  ['6203100', 'Desenvolvimento e licenciamento de programas de computador não-customizáveis', 'TI', '', 'B', ''],
  ['6204000', 'Consultoria em tecnologia da informação', 'TI', '', 'B', ''],
  ['6209100', 'Suporte técnico, manutenção e outros serviços em tecnologia da informação', 'TI', '', 'B', 'M'],
  ['6311900', 'Tratamento de dados, provedores de serviços de aplicação e serviços de hospedagem na internet', 'TI', '', 'B', ''],
  ['6319400', 'Portais, provedores de conteúdo e outros serviços de informação na internet', 'TI', '', 'B', ''],
  ['6190601', 'Provedores de acesso às redes de comunicações', 'TI', '', 'M', ''],
  ['9511800', 'Reparação e manutenção de computadores e de equipamentos periféricos', 'SERV', '', 'B', 'M'],
  ['9521500', 'Reparação e manutenção de equipamentos eletroeletrônicos de uso pessoal e doméstico', 'SERV', '', 'B', 'M'],
  // ---- Jurídico, contábil, consultoria e escritório
  ['6911701', 'Serviços advocatícios', 'ADV', 'IV', 'B', 'C'],
  ['6920601', 'Atividades de contabilidade', 'ADV', 'III', 'B', 'C'],
  ['6920602', 'Atividades de consultoria e auditoria contábil e tributária', 'ADV', 'III', 'B', 'C'],
  ['7020400', 'Atividades de consultoria em gestão empresarial, exceto consultoria técnica específica', 'ADV', '', 'B', ''],
  ['7111100', 'Serviços de arquitetura', 'ADV', '', 'B', 'C'],
  ['7112000', 'Serviços de engenharia', 'ADV', '', 'B', 'C'],
  ['7119703', 'Serviços de desenho técnico relacionados à arquitetura e engenharia', 'ADV', '', 'B', 'M'],
  ['7311400', 'Agências de publicidade', 'ADV', 'III/V', 'B', ''],
  ['7319002', 'Promoção de vendas', 'ADV', '', 'B', ''],
  ['7319003', 'Marketing direto', 'ADV', '', 'B', ''],
  ['7320300', 'Pesquisas de mercado e de opinião pública', 'ADV', '', 'B', ''],
  ['7410202', 'Design de interiores', 'ADV', '', 'B', 'M'],
  ['7410203', 'Design de produto', 'ADV', '', 'B', ''],
  ['7420001', 'Atividades de produção de fotografias, exceto aérea e submarina', 'ARTE', '', 'B', 'M'],
  ['7490104', 'Atividades de intermediação e agenciamento de serviços e negócios em geral, exceto imobiliários', 'ADV', '', 'B', 'M'],
  ['7810800', 'Seleção e agenciamento de mão de obra', 'SERV', '', 'B', ''],
  ['7820500', 'Locação de mão de obra temporária', 'SERV', 'IV', 'B', ''],
  ['7830200', 'Fornecimento e gestão de recursos humanos para terceiros', 'SERV', 'IV', 'B', ''],
  ['8211300', 'Serviços combinados de escritório e apoio administrativo', 'SERV', '', 'B', 'M'],
  ['8219999', 'Preparação de documentos e serviços especializados de apoio administrativo não especificados anteriormente', 'SERV', '', 'B', 'M'],
  ['8220200', 'Atividades de teleatendimento', 'SERV', '', 'B', ''],
  ['8230001', 'Serviços de organização de feiras, congressos, exposições e festas', 'SERV', '', 'B', 'M'],
  ['8299799', 'Outras atividades de serviços prestados principalmente às empresas não especificadas anteriormente', 'SERV', '', 'B', 'M'],
  ['6462000', 'Holdings de instituições não-financeiras', 'OUT', 'III', 'B', ''],
  ['6499999', 'Outras atividades de serviços financeiros não especificadas anteriormente', 'OUT', 'V', 'B', ''],
  ['6629100', 'Atividades auxiliares dos seguros e da previdência complementar', 'OUT', '', 'B', 'C'],
  // ---- Limpeza, segurança e condomínios
  ['8121400', 'Limpeza em prédios e em domicílios', 'SERV', 'IV', 'B', 'M'],
  ['8112500', 'Condomínios prediais', 'IMOB', '', 'B', ''],
  ['8011101', 'Atividades de vigilância e segurança privada', 'SERV', 'IV', 'M', 'B'],
  ['8130300', 'Atividades paisagísticas', 'SERV', '', 'B', 'MA'],
  ['8122200', 'Imunização e controle de pragas urbanas', 'SERV', '', 'A', 'SAM'],
  // ---- Construção e reparos
  ['4110700', 'Incorporação de empreendimentos imobiliários', 'IMOB', 'III', 'A', 'A'],
  ['4120400', 'Construção de edifícios', 'CONS', '', 'A', 'AB'],
  ['4321500', 'Instalação e manutenção elétrica', 'CONS', '', 'M', 'M'],
  ['4322301', 'Instalações hidráulicas, sanitárias e de gás', 'CONS', '', 'M', 'M'],
  ['4330404', 'Serviços de pintura de edifícios em geral', 'CONS', '', 'B', 'M'],
  ['4399103', 'Obras de alvenaria', 'CONS', '', 'M', 'M'],
  ['4520001', 'Serviços de manutenção e reparação mecânica de veículos automotores', 'SERV', '', 'M', 'MA'],
  ['4520005', 'Serviços de lavagem, lubrificação e polimento de veículos automotores', 'SERV', '', 'M', 'MA'],
  // ---- Transporte e logística
  ['4921301', 'Transporte rodoviário coletivo de passageiros, com itinerário fixo, municipal', 'TRANS', '', 'M', ''],
  ['4923001', 'Serviço de táxi', 'TRANS', '', 'B', ''],
  ['4924800', 'Transporte escolar', 'TRANS', '', 'M', ''],
  ['4929901', 'Transporte rodoviário coletivo de passageiros, sob regime de fretamento, municipal', 'TRANS', '', 'M', ''],
  ['4930201', 'Transporte rodoviário de carga, exceto produtos perigosos e mudanças, municipal', 'TRANS', '', 'B', 'M'],
  ['4930202', 'Transporte rodoviário de carga, exceto produtos perigosos e mudanças, intermunicipal, interestadual e internacional', 'TRANS', '', 'B', ''],
  ['5229099', 'Outras atividades auxiliares dos transportes terrestres não especificadas anteriormente', 'TRANS', '', 'B', ''],
  ['5320202', 'Serviços de entrega rápida', 'TRANS', '', 'B', 'M'],
  ['5211701', 'Armazéns gerais - emissão de warrant', 'TRANS', '', 'M', 'B'],
  // ---- Imobiliário
  ['6810201', 'Compra e venda de imóveis próprios', 'IMOB', 'III', 'B', ''],
  ['6810202', 'Aluguel de imóveis próprios', 'IMOB', 'III', 'B', ''],
  ['6821801', 'Corretagem na compra e venda e avaliação de imóveis', 'IMOB', '', 'B', 'C'],
  ['6822600', 'Gestão e administração da propriedade imobiliária', 'IMOB', '', 'B', ''],
  ['7721700', 'Aluguel de equipamentos recreativos e esportivos', 'SERV', '', 'B', 'M'],
  ['7739099', 'Aluguel de outras máquinas e equipamentos comerciais e industriais não especificados anteriormente', 'SERV', '', 'B', 'M'],
  // ---- Arte, esporte, lazer e mídia
  ['9311500', 'Gestão de instalações de esportes', 'ARTE', '', 'M', 'B'],
  ['9319101', 'Produção e promoção de eventos esportivos', 'ARTE', '', 'B', 'B'],
  ['9001901', 'Produção teatral', 'ARTE', '', 'B', 'B'],
  ['9001906', 'Atividades de sonorização e de iluminação', 'ARTE', '', 'B', 'M'],
  ['9002701', 'Atividades de artistas plásticos, jornalistas independentes e escritores', 'ARTE', '', 'B', 'M'],
  ['9003500', 'Gestão de espaços para artes cênicas, espetáculos e outras atividades artísticas', 'ARTE', '', 'M', 'B'],
  ['9329899', 'Outras atividades de recreação e lazer não especificadas anteriormente', 'ARTE', '', 'M', 'B'],
  ['5811500', 'Edição de livros', 'ARTE', 'III', 'B', ''],
  ['5911101', 'Estúdios cinematográficos', 'ARTE', '', 'B', ''],
  ['5920100', 'Atividades de gravação de som e de edição de música', 'ARTE', '', 'B', 'M'],
  // ---- Associações e outros
  ['9412001', 'Atividades de fiscalização profissional', 'OUT', '', 'B', ''],
  ['9430800', 'Atividades de associações de defesa de direitos sociais', 'OUT', '', 'B', ''],
  ['9491000', 'Atividades de organizações religiosas', 'OUT', '', 'B', 'B'],
  ['9529199', 'Reparação e manutenção de outros objetos e equipamentos pessoais e domésticos não especificados anteriormente', 'SERV', '', 'B', 'M'],
]

export const CNAES: Cnae[] = L.map(([codigo, descricao, setor, anexo, risco, f]) => {
  const comercioOuInd = setor === 'COM' || setor === 'IND' || setor === 'ALIM'
  const iss = !(setor === 'COM' || setor === 'IND') && codigo !== '5611201' && codigo !== '5611203' && codigo !== '5611204' && codigo !== '5612100' && codigo !== '5620104' && codigo !== '1091102'
  return {
    codigo, descricao, setor,
    anexoSimples: anexo || ANEXO_PADRAO[setor],
    iss,
    icms: comercioOuInd || setor === 'TRANS',
    risco: risco === 'A' ? 'ALTO' : risco === 'M' ? 'MEDIO' : 'BAIXO',
    mei: f.includes('M'),
    vigilanciaSanitaria: f.includes('S'),
    bombeiros: f.includes('B'),
    ambiental: f.includes('A'),
    conselhoClasse: f.includes('C'),
    educacaoRegulada: f.includes('E'),
  }
})

const porCodigo = new Map(CNAES.map((c) => [c.codigo, c]))
export const cnaeDe = (codigo: string) => porCodigo.get(String(codigo).replace(/\D+/g, ''))
export const formatarCnae = (c: string) => { const d = String(c).replace(/\D+/g, ''); return d.length === 7 ? `${d.slice(0, 4)}-${d.slice(4, 5)}/${d.slice(5)}` : c }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Busca por código (parcial) ou palavras da descrição/setor. Todas as palavras precisam aparecer. */
export function buscarCnaes(q?: string, filtros: { setor?: string; mei?: boolean } = {}, limite = 60): Cnae[] {
  const termos = norm(q || '').split(/\s+/).filter(Boolean)
  return CNAES.filter((c) => {
    if (filtros.setor && c.setor !== filtros.setor) return false
    if (filtros.mei && !c.mei) return false
    if (!termos.length) return true
    const alvo = norm(`${c.codigo} ${formatarCnae(c.codigo)} ${c.descricao} ${SETORES[c.setor]}`)
    return termos.every((t) => alvo.includes(t.replace(/[^0-9a-z]/g, '') || t))
  }).slice(0, limite)
}
