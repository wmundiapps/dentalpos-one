export interface Notification {
  id: number;
  titulo: string;
  descricao: string;
  lida: boolean;
  data: string;
  tipo: "info" | "warning" | "error" | "success";
}