import type { Patient } from "../types/patient";

export const patients: Patient[] = [
  {
    id: 1,
    nome: "Maria Oliveira",
    telefone: "(44) 99999-0001",
    email: "maria@email.com",
    nascimento: "1987-04-18",
    cpf: "000.000.000-01",
    convenio: "",
    status: "Consulta",
  },
  {
    id: 2,
    nome: "Carlos Pereira",
    telefone: "(44) 99999-0002",
    email: "carlos@email.com",
    nascimento: "1975-09-12",
    cpf: "000.000.000-02",
    convenio: "",
    status: "Planejamento",
  },
  {
    id: 3,
    nome: "Fernanda Lima",
    telefone: "(44) 99999-0003",
    email: "fernanda@email.com",
    nascimento: "1991-01-05",
    cpf: "000.000.000-03",
    convenio: "",
    status: "Orçamento",
  },
];