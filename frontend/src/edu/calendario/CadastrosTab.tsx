import { Box } from "@mui/material";
import EduResourcePage from "../EduResourcePage";

const TURNOS = [{ value: "MANHA", label: "Manhã" }, { value: "TARDE", label: "Tarde" }, { value: "NOITE", label: "Noite" }];
const hhmm = (m: number) => (m == null ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);

/** Cadastros de apoio: categorias de eventos e malha de horários. */
export default function CadastrosTab() {
  return (
    <Box sx={{ display: "grid", gap: 3 }}>
      <EduResourcePage title="Categorias de eventos" base="/calendario" resource="/categorias" description="Cores usadas no calendário mensal."
        columns={[
          { key: "nome", label: "Nome" },
          { key: "cor", label: "Cor", render: (r) => <Box sx={{ display: "inline-block", width: 48, height: 18, borderRadius: 1, bgcolor: r.cor }} /> },
          { key: "ativo", label: "Ativa", render: (r) => (r.ativo === false ? "Não" : "Sim") },
        ]}
        fields={[{ key: "nome", label: "Nome", required: true }, { key: "cor", label: "Cor (#RRGGBB)", required: true, helper: "Ex.: #0F5FDB" }, { key: "ativo", label: "Ativa", type: "bool" }]} />
      <EduResourcePage title="Malha de horários" base="/calendario" resource="/horarios" description="Faixas de aula usadas na grade e no gerador. Horários em minutos desde 00:00 (ex.: 19:00 = 1140)."
        columns={[
          { key: "nome", label: "Nome" }, { key: "turno", label: "Turno" }, { key: "ordem", label: "Ordem" },
          { key: "inicioMin", label: "Início", render: (r) => hhmm(r.inicioMin) }, { key: "fimMin", label: "Fim", render: (r) => hhmm(r.fimMin) },
        ]}
        fields={[
          { key: "nome", label: "Nome", required: true }, { key: "turno", label: "Turno", type: "select", options: TURNOS, required: true }, { key: "ordem", label: "Ordem", type: "number", required: true },
          { key: "inicioMin", label: "Início (minutos)", type: "number", required: true, helper: "07:30 = 450" }, { key: "fimMin", label: "Fim (minutos)", type: "number", required: true },
          { key: "ativo", label: "Ativo", type: "bool" },
        ]} />
    </Box>
  );
}
