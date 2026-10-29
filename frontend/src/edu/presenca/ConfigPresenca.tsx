import { Alert, Box, Button, Checkbox, FormControlLabel, TextField } from "@mui/material";
import { useEffect, useState } from "react";
import { eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { Async, FormDialog, Panel, SubNav, Tag, itemsOf, label, useApi, useSpaces, useToast } from "../infraestrutura/kit";

const CAMPOS_REGRA: Array<[string, string, string]> = [
  ["toleranciaAtrasoMin", "Tolerância de atraso (min)", "Até este atraso a entrada ainda conta como presente."],
  ["limiteFaltaMin", "Limite para falta (min)", "Entrada depois disso não computa presença."],
  ["antecedenciaMin", "Marcação antes do início (min)", "Janela em que a chamada já aceita marcações."],
  ["toleranciaSaidaMin", "Tolerância de saída (min)", "Saída até este tempo antes do fim não é saída antecipada."],
  ["toleranciaIntervaloMin", "Tolerância do intervalo (min)", "Retorno do intervalo além do previsto."],
  ["debounceSegundos", "Ignorar repetição (s)", "Marcações repetidas da mesma pessoa."],
  ["limiarDistancia", "Limiar de reconhecimento (distância)", "Menor = mais rígido (0,2–0,7). Ajuste após teste de campo."],
  ["margemAmbiguidade", "Margem de ambiguidade", "Diferença mínima para o 2º colocado."],
  ["maxTentativas", "Tentativas antes do bloqueio", "Falhas seguidas por dispositivo/operador."],
  ["janelaTentativasMin", "Janela das tentativas (min)", ""], ["bloqueioMin", "Bloqueio (min)", ""],
  ["retencaoLogDias", "Retenção de logs (dias)", "Log de reconhecimento e acessos."], ["retencaoTemplateDias", "Excluir template sem uso após (dias)", "Retenção mínima de biometria."],
  ["emprestimoMaxSimultaneos", "Empréstimos simultâneos (itens)", ""], ["multaDiaItem", "Multa por dia de atraso (R$)", ""], ["multaMaximaItem", "Multa máxima (R$)", ""], ["bloqueioAposAtrasoDias", "Bloquear após atraso de (dias)", ""],
];

function Regras() {
  const cfg = useApi<any>("/presenca/config");
  const [f, setF] = useState<Record<string, any>>({});
  const toast = useToast();
  useEffect(() => { if (cfg.data) setF(cfg.data); }, [cfg.data]);
  async function salvar() {
    const body: any = {};
    for (const [k] of CAMPOS_REGRA) body[k] = Number(f[k]);
    body.livenessObrigatorio = !!f.livenessObrigatorio;
    await toast.run(() => eduApi.put("/presenca/config", body), "Regras salvas.", () => cfg.reload());
  }
  return (
    <Panel title="Regras de tolerância e reconhecimento" subtitle="Valem para toda a instituição; o horário programado da turma pode sobrescrever as tolerâncias de atraso e saída.">
      <Async state={cfg}>
        {() => (
          <Box sx={{ display: "grid", gap: 2 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2 }}>
              {CAMPOS_REGRA.map(([k, l, h]) => <TextField key={k} size="small" type="number" label={l} helperText={h || undefined} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} slotProps={{ htmlInput: { step: "any" } }} />)}
            </Box>
            <FormControlLabel control={<Checkbox checked={!!f.livenessObrigatorio} onChange={(e) => setF({ ...f, livenessObrigatorio: e.target.checked })} />} label="Exigir verificação de vivacidade (piscar/mover a cabeça) — recomendado" />
            <Alert severity="info">Precisão depende do modelo, da câmera e da luz. Faça um piloto com os equipamentos reais e ajuste o limiar. A alternativa sem biometria (QR/código/lista manual) deve estar sempre disponível.</Alert>
            <Box><Button variant="contained" onClick={salvar}>Salvar regras</Button></Box>
          </Box>
        )}
      </Async>
      {toast.node}
    </Panel>
  );
}

function Dispositivos() {
  const spaces = useSpaces();
  const [rk, setRk] = useState(0);
  const [novo, setNovo] = useState(false);
  const toast = useToast();
  const campos = [
    { key: "nome", label: "Nome do quiosque/tablet", required: true },
    { key: "finalidade", label: "Finalidade", type: "select" as const, options: ["CHAMADA", "PORTARIA", "BIBLIOTECA", "LABORATORIO", "AUDIOVISUAL"], required: true, def: "CHAMADA" },
    { key: "spaceId", label: "Espaço", type: "select" as const, options: spaces },
    { key: "modo", label: "Modo", type: "select" as const, options: ["AUTO", "ENTRADA", "SAIDA", "INTERVALO"], def: "AUTO" },
  ];
  return (
    <Panel title="Dispositivos (quiosques)" subtitle="Cadastre cada tablet/celular/portaria. O bloqueio por excesso de tentativas é por dispositivo." actions={<Button variant="contained" onClick={() => setNovo(true)}>Novo dispositivo</Button>}>
      <ListTable path="/presenca/dispositivos" refreshKey={rk} searchable
        columns={[{ key: "nome", label: "Nome" }, { key: "finalidade", label: "Finalidade", render: (r) => label(r.finalidade) }, { key: "modo", label: "Modo" }, { key: "ultimoUsoEm", label: "Último uso", render: (r) => (r.ultimoUsoEm ? new Date(r.ultimoUsoEm).toLocaleString("pt-BR") : "—") },
          { key: "estado", label: "Estado", render: (r) => (r.bloqueadoAte && new Date(r.bloqueadoAte) > new Date() ? <Tag text="Bloqueado" tone="error" /> : r.ativo ? <Tag text="Ativo" tone="success" /> : <Tag text="Inativo" />) }]}
        actions={(r) => (<>
          {r.bloqueadoAte && new Date(r.bloqueadoAte) > new Date() && <Button size="small" onClick={() => toast.run(() => eduApi.post(`/presenca/dispositivos/${r.id}/desbloquear`, {}), "Dispositivo desbloqueado.", () => setRk((k) => k + 1))}>Desbloquear</Button>}
          {r.ativo && <Button size="small" color="error" onClick={() => toast.run(() => eduApi.del(`/presenca/dispositivos/${r.id}`), "Dispositivo desativado.", () => setRk((k) => k + 1), "Desativar este dispositivo?")}>Desativar</Button>}
        </>)} />
      <FormDialog open={novo} title="Novo dispositivo" fields={campos} onClose={() => setNovo(false)} onSubmit={async (b) => { await eduApi.post("/presenca/dispositivos", b); setRk((k) => k + 1); }} />
      {toast.node}
    </Panel>
  );
}

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
function Horarios() {
  const spaces = useSpaces();
  const [turmas, setTurmas] = useState<Array<{ value: string; label: string }>>([]);
  const [rk, setRk] = useState(0);
  const [novo, setNovo] = useState(false);
  const toast = useToast();
  useEffect(() => { eduApi.get("/academico/class-sections").then((r) => setTurmas(itemsOf(r).map((t: any) => ({ value: t.id, label: `${t.nome} — ${t.discipline?.nome ?? ""}` })))).catch(() => {}); }, []);
  const nomeTurma = (id: string) => turmas.find((t) => t.value === id)?.label || id;
  return (
    <Panel title="Horários programados" subtitle="Entrada, intervalo e saída por turma/sala e dia da semana. Quando existe, a chamada usa estes horários no lugar do horário da aula." actions={<Button variant="contained" onClick={() => setNovo(true)}>Novo horário</Button>}>
      <ListTable path="/presenca/horarios" refreshKey={rk} searchable={false}
        columns={[{ key: "classSectionId", label: "Turma", render: (r) => nomeTurma(r.classSectionId) }, { key: "diaSemana", label: "Dia", render: (r) => DIAS[r.diaSemana] }, { key: "horaEntrada", label: "Entrada" },
          { key: "intervalo", label: "Intervalo", render: (r) => (r.inicioIntervalo ? `${r.inicioIntervalo}–${r.fimIntervalo}` : "—") }, { key: "horaSaida", label: "Saída" },
          { key: "toleranciaAtrasoMin", label: "Tolerância", render: (r) => (r.toleranciaAtrasoMin != null ? `${r.toleranciaAtrasoMin} min` : "padrão") }, { key: "spaceId", label: "Sala", render: (r) => spaces.find((s) => s.value === r.spaceId)?.label || "—" }]}
        actions={(r) => <Button size="small" color="error" onClick={() => toast.run(() => eduApi.del(`/presenca/horarios/${r.id}`), "Horário removido.", () => setRk((k) => k + 1), "Remover este horário?")}>Remover</Button>} />
      <FormDialog open={novo} title="Novo horário programado" onClose={() => setNovo(false)} onSubmit={async (b) => { await eduApi.post("/presenca/horarios", b); setRk((k) => k + 1); }}
        fields={[
          { key: "classSectionId", label: "Turma", type: "select", options: turmas, required: true }, { key: "spaceId", label: "Sala", type: "select", options: spaces },
          { key: "diaSemana", label: "Dia da semana", type: "select", options: DIAS.map((d, i) => ({ value: String(i), label: d })), required: true },
          { key: "horaEntrada", label: "Entrada (HH:mm)", required: true, def: "19:00" }, { key: "inicioIntervalo", label: "Início do intervalo (HH:mm)" }, { key: "fimIntervalo", label: "Fim do intervalo (HH:mm)" },
          { key: "horaSaida", label: "Saída (HH:mm)", required: true, def: "22:10" }, { key: "toleranciaAtrasoMin", label: "Tolerância de atraso (min) — opcional", type: "number" }, { key: "toleranciaSaidaMin", label: "Tolerância de saída (min) — opcional", type: "number" },
        ]} />
      {toast.node}
    </Panel>
  );
}

export default function ConfigPresenca() {
  const [sub, setSub] = useState("regras");
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <SubNav value={sub} onChange={setSub} items={[{ key: "regras", label: "Regras" }, { key: "horarios", label: "Horários" }, { key: "disp", label: "Dispositivos" }]} />
      {sub === "regras" && <Regras />}{sub === "horarios" && <Horarios />}{sub === "disp" && <Dispositivos />}
    </Box>
  );
}
