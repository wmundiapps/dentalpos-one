export type UserRole =
  | "Administrador"
  | "Dentista"
  | "Recepção"
  | "Financeiro"
  | "Comercial"
  | "Laboratório"
  | "Professor"
  | "Aluno";

export interface User {
  id: number;
  nome: string;
  cargo: UserRole;
  email: string;
  ativo: boolean;
}