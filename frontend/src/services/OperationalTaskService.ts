import type { OperationalTask } from "../types/operationalTask";

export const operationalTasks: OperationalTask[] = [
  {
    id: 1,
    title: "Realizar teste da autoclave",
    description:
      "Executar o teste definido no protocolo de esterilização e anexar fotografia do resultado.",
    sector: "Esterilização",
    responsible: "Auxiliar responsável",
    priority: "Crítica",
    status: "Aguardando evidência",
    evidenceRequirement: "Foto e assinatura",
    dueAt: "Hoje, 08:00",
  },
  {
    id: 2,
    title: "Conferir geladeira de toxina botulínica",
    description:
      "Registrar a temperatura e anexar fotografia legível do termômetro.",
    sector: "Farmácia clínica",
    responsible: "Responsável técnico",
    priority: "Crítica",
    status: "Pendente",
    evidenceRequirement: "Foto",
    dueAt: "Hoje, 08:15",
  },
  {
    id: 3,
    title: "Limpeza terminal do consultório 1",
    description:
      "Executar o POP de limpeza terminal e fotografar o ambiente concluído.",
    sector: "Limpeza",
    responsible: "Equipe de limpeza",
    priority: "Alta",
    status: "Pendente",
    evidenceRequirement: "Foto",
    dueAt: "Hoje, 18:00",
  },
  {
    id: 4,
    title: "Preparar café",
    description:
      "Preparar conforme POP-001: três colheres de pó para uma garrafa de água.",
    sector: "Copa",
    responsible: "Equipe de apoio",
    priority: "Baixa",
    status: "Pendente",
    evidenceRequirement: "Nenhuma",
    dueAt: "Hoje, 07:45",
  },
];