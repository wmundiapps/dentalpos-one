import { prisma } from '../../lib/prisma'

// Catálogo padrão (bootstrap idempotente). Pesos = nº típico de questões por área na prova (referência
// aproximada, editável pela instituição).
type E = [codigo: string, nome: string, peso: number, tipo?: 'AREA' | 'EIXO' | 'COMPETENCIA', meta?: number]
export interface ExameModelo { codigo: string; nome: string; tipo: string; descricao: string; numQuestoes?: number; duracaoMin?: number; notaCorte?: number; eixos: E[] }

const ENADE_FG: E[] = [
  ['FG-ETICA', 'Formação Geral — Ética, cidadania e responsabilidade social', 2.5, 'COMPETENCIA'],
  ['FG-DIVERSIDADE', 'Formação Geral — Diversidade, inclusão e direitos humanos', 2, 'COMPETENCIA'],
  ['FG-SUSTENT', 'Formação Geral — Sustentabilidade e meio ambiente', 1.5, 'COMPETENCIA'],
  ['FG-TECNOLOGIA', 'Formação Geral — Ciência, tecnologia e inovação', 2, 'COMPETENCIA'],
  ['FG-SOCIEDADE', 'Formação Geral — Sociedade, política e cultura brasileira', 2, 'COMPETENCIA'],
]
const ceArea = (sigla: string, eixos: Array<[string, number]>): E[] => eixos.map(([n, p], i) => [`CE-${sigla}-${i + 1}`, `Específico — ${n}`, p, 'EIXO'] as E)

const ENADE_AREAS: Array<{ sigla: string; nome: string; eixos: Array<[string, number]> }> = [
  { sigla: 'DIR', nome: 'Direito', eixos: [['Teoria do Direito e Constitucional', 6], ['Direito Civil e Processo Civil', 7], ['Direito Penal e Processo Penal', 6], ['Direito Empresarial, Tributário e Trabalho', 6], ['Ética, Direitos Humanos e Administrativo', 5]] },
  { sigla: 'MED', nome: 'Medicina', eixos: [['Clínica Médica', 7], ['Cirurgia', 5], ['Pediatria', 5], ['Ginecologia e Obstetrícia', 5], ['Saúde Coletiva', 5], ['Urgência e Emergência', 3]] },
  { sigla: 'ODO', nome: 'Odontologia', eixos: [['Dentística e Materiais', 5], ['Cirurgia Bucomaxilofacial', 5], ['Periodontia e Endodontia', 6], ['Odontopediatria e Ortodontia', 5], ['Saúde Coletiva e Epidemiologia', 5], ['Patologia e Diagnóstico Bucal', 4]] },
  { sigla: 'ENF', nome: 'Enfermagem', eixos: [['Fundamentos e Processo de Enfermagem', 6], ['Saúde do Adulto e Idoso', 6], ['Saúde da Mulher e da Criança', 6], ['Saúde Coletiva e Gestão', 7], ['Urgência e Emergência', 5]] },
  { sigla: 'FAR', nome: 'Farmácia', eixos: [['Farmacologia e Farmacoterapia', 7], ['Assistência Farmacêutica e Farmácia Clínica', 7], ['Análises Clínicas e Toxicologia', 6], ['Tecnologia Farmacêutica e Controle de Qualidade', 6], ['Legislação e Saúde Pública', 4]] },
  { sigla: 'ADM', nome: 'Administração', eixos: [['Gestão de Pessoas e Comportamento', 6], ['Finanças e Contabilidade', 7], ['Marketing e Mercado', 6], ['Operações, Logística e Processos', 6], ['Estratégia e Empreendedorismo', 5]] },
  { sigla: 'PED', nome: 'Pedagogia', eixos: [['Fundamentos da Educação', 7], ['Didática e Currículo', 7], ['Alfabetização e Letramento', 6], ['Gestão Escolar e Políticas Públicas', 6], ['Educação Inclusiva', 4]] },
  { sigla: 'PSI', nome: 'Psicologia', eixos: [['Fundamentos e Teorias Psicológicas', 7], ['Psicologia do Desenvolvimento e Social', 6], ['Psicopatologia e Avaliação', 7], ['Processos Clínicos e Saúde', 6], ['Ética e Pesquisa', 4]] },
  { sigla: 'ENG', nome: 'Engenharia Civil', eixos: [['Estruturas e Materiais', 8], ['Geotecnia e Hidráulica', 7], ['Construção e Planejamento', 7], ['Transportes e Saneamento', 5], ['Meio Ambiente e Gestão', 3]] },
  { sigla: 'CC', nome: 'Ciência da Computação / Sistemas', eixos: [['Algoritmos e Estruturas de Dados', 8], ['Engenharia de Software', 7], ['Bancos de Dados e Redes', 7], ['Sistemas Operacionais e Arquitetura', 5], ['Inteligência Artificial e Segurança', 3]] },
]

const AREAS_MEDICAS: E[] = [
  ['CLM', 'Clínica Médica', 20, 'AREA'], ['CIR', 'Cirurgia Geral', 20, 'AREA'], ['PED', 'Pediatria', 20, 'AREA'],
  ['GO', 'Ginecologia e Obstetrícia', 20, 'AREA'], ['MPS', 'Medicina Preventiva e Social', 20, 'AREA'], ['SM', 'Saúde Mental e Urgência/Emergência', 10, 'AREA'],
]

export const EXAMES_MODELO: ExameModelo[] = [
  {
    codigo: 'OAB-1F', nome: 'Exame de Ordem — OAB 1ª fase (objetiva)', tipo: 'OAB_1FASE', numQuestoes: 80, duracaoMin: 300, notaCorte: 50,
    descricao: '80 questões objetivas; aprovação com 40 acertos (50%).',
    eixos: [
      ['ETICA', 'Ética Profissional', 8], ['FILO', 'Filosofia do Direito', 2], ['CONST', 'Direito Constitucional', 7], ['DH', 'Direitos Humanos', 3], ['INTER', 'Direito Internacional', 2],
      ['TRIB', 'Direito Tributário', 5], ['ADM', 'Direito Administrativo', 6], ['AMB', 'Direito Ambiental', 2], ['CIVIL', 'Direito Civil', 7], ['ECA', 'ECA', 2],
      ['CONSUM', 'Direito do Consumidor', 2], ['EMPR', 'Direito Empresarial', 5], ['PCIVIL', 'Processo Civil', 7], ['PENAL', 'Direito Penal', 6], ['PPENAL', 'Processo Penal', 5],
      ['TRAB', 'Direito do Trabalho', 6], ['PTRAB', 'Processo do Trabalho', 5],
    ].map(([c, n, p]) => [c, n, p, 'AREA', 50] as E),
  },
  {
    codigo: 'OAB-2F', nome: 'Exame de Ordem — OAB 2ª fase (prático-profissional)', tipo: 'OAB_2FASE', numQuestoes: 5, duracaoMin: 300, notaCorte: 60,
    descricao: 'Peça prático-profissional (valor 5,0) + 4 questões discursivas (1,25 cada); aprovação com 6,0.',
    eixos: [['PEN', 'Direito Penal', 1], ['CIV', 'Direito Civil', 1], ['TRA', 'Direito do Trabalho', 1], ['CON', 'Direito Constitucional', 1], ['ADM', 'Direito Administrativo', 1], ['TRI', 'Direito Tributário', 1], ['EMP', 'Direito Empresarial', 1]].map(([c, n, p]) => [c, n, p, 'AREA', 60] as E),
  },
  {
    codigo: 'ENADE-GERAL', nome: 'ENADE — modelo geral (Formação Geral + Específico)', tipo: 'ENADE', numQuestoes: 40, duracaoMin: 240,
    descricao: 'Formação geral (25%) + componente específico (75%). Configure eixos do curso.',
    eixos: [...ENADE_FG, ['CE-1', 'Componente Específico — conhecimentos nucleares', 15, 'EIXO'], ['CE-2', 'Componente Específico — aplicação profissional', 15, 'EIXO']],
  },
  ...ENADE_AREAS.map((a): ExameModelo => ({
    codigo: `ENADE-${a.sigla}`, nome: `ENADE — ${a.nome}`, tipo: 'ENADE', numQuestoes: 40, duracaoMin: 240,
    descricao: `Formação geral + componente específico de ${a.nome}.`,
    eixos: [...ENADE_FG, ...ceArea(a.sigla, a.eixos)],
  })),
  { codigo: 'ENAMED', nome: 'ENAMED — Exame Nacional de Avaliação da Formação Médica', tipo: 'ENAMED', numQuestoes: 100, duracaoMin: 300, descricao: 'Grandes áreas médicas.', eixos: AREAS_MEDICAS },
  { codigo: 'RESIDENCIA-MED', nome: 'Residência Médica — prova de acesso', tipo: 'RESIDENCIA', numQuestoes: 100, duracaoMin: 300, notaCorte: 60, descricao: 'Grandes áreas (Clínica, Cirurgia, Pediatria, GO, Preventiva).', eixos: AREAS_MEDICAS },
  {
    codigo: 'RESIDENCIA-MULTI', nome: 'Residência Multiprofissional em Saúde', tipo: 'RESIDENCIA', numQuestoes: 60, duracaoMin: 240, notaCorte: 60, descricao: 'Políticas de saúde (SUS) + conhecimentos específicos da profissão.',
    eixos: [['SUS', 'Políticas Públicas de Saúde / SUS', 20, 'AREA'], ['ESP', 'Conhecimentos específicos da categoria profissional', 30, 'AREA'], ['EPI', 'Epidemiologia e Bioestatística', 5, 'AREA'], ['ETI', 'Ética e Bioética em Saúde', 5, 'AREA']],
  },
  { codigo: 'REVALIDA', nome: 'Revalida — Revalidação de diploma médico', tipo: 'REVALIDA', numQuestoes: 100, duracaoMin: 300, notaCorte: 60, descricao: 'Fase teórica (objetiva) por grandes áreas.', eixos: AREAS_MEDICAS },
]

export async function aplicarCatalogo(tenantId: string) {
  let exames = 0, eixos = 0
  for (const m of EXAMES_MODELO) {
    const ex = await prisma.desExame.upsert({
      where: { tenantId_codigo: { tenantId, codigo: m.codigo } },
      create: { tenantId, codigo: m.codigo, nome: m.nome, tipo: m.tipo as any, descricao: m.descricao, numQuestoes: m.numQuestoes, duracaoMin: m.duracaoMin, notaCorte: m.notaCorte },
      update: {},
    })
    exames++
    let ordem = 0
    for (const [codigo, nome, peso, tipo, meta] of m.eixos) {
      await prisma.desEixo.upsert({
        where: { exameId_codigo: { exameId: ex.id, codigo } },
        create: { tenantId, exameId: ex.id, codigo, nome, peso, tipo: (tipo ?? 'AREA') as any, metaAcerto: meta ?? 60, ordem: ordem++ },
        update: {},
      })
      eixos++
    }
  }
  return { exames, eixos }
}
