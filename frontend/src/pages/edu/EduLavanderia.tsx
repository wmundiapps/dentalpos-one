import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Step, StepLabel, Stepper, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useState } from "react";
import EduShell from "../../edu/EduShell";
import { eduApi } from "../../services/EduApi";
import { Section, Stat, StateBox, useLoad, useToast } from "../../edu/admissoes/common";
import { FormDialog, Pill, dt, dth } from "../../edu/operacao/ui";

const ROTULO: Record<string, string> = { SOLICITADA: "Solicitada", COLETADA: "Coletada", EM_TRANSPORTE: "Em transporte", NA_LAVANDERIA: "Na lavanderia", LAVADA: "Lavada", EM_RETORNO: "Em retorno", ENTREGUE: "Entregue", CONFERIDA: "Conferida" };
const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export default function EduLavanderia() {
  const painel = useLoad<any>("/lavanderia/painel");
  const rem = useLoad<any[]>("/lavanderia/remessas");
  const rotas = useLoad<any[]>("/lavanderia/rotas");
  const { setMsg, node } = useToast();
  const [dlg, setDlg] = useState<string | null>(null);
  const [det, setDet] = useState<any>(null);
  const [avanco, setAvanco] = useState({ responsavel: "", qtdPecas: "", observacao: "" });
  const recarregar = () => { painel.reload(); rem.reload(); rotas.reload(); };
  const run = async (fn: () => Promise<any>, ok: string) => { try { await fn(); setMsg({ type: "success", text: ok }); setDlg(null); recarregar(); } catch (e: any) { setMsg({ type: "error", text: e.message }); } };
  const abrir = async (r: any) => { setAvanco({ responsavel: "", qtdPecas: "", observacao: "" }); setDet(await eduApi.get(`/lavanderia/remessas/${r.id}`)); };
  const p = painel.data;
  return (
    <EduShell title="Lavanderia e rouparia" subtitle="Rol de rouparia enviada por departamento e jornada completa: coleta, transporte, lavagem, retorno, entrega e conferência.">
      <StateBox loading={painel.loading} error={painel.error} onRetry={painel.reload}>
        {p && (<>
          <Stack direction="row" gap={2} flexWrap="wrap" sx={{ mb: 3 }}>
            <Stat label="Remessas em andamento" value={p.abertas} /><Stat label="Atrasadas" value={p.atrasadas} color={p.atrasadas ? "#B91C1C" : "#15803D"} />
            <Stat label="Peças em processo" value={p.pecasEmProcesso} /><Stat label="Divergências de conferência" value={p.divergencias} color={p.divergencias ? "#B45309" : undefined} />
          </Stack>
          <Section title="Jornada da rouparia" description="Quantas remessas estão em cada etapa agora.">
            <Stack direction="row" gap={1} flexWrap="wrap">{p.etapas.map((e: any) => <Chip key={e.etapa} label={`${e.rotulo}: ${p.porStatus[e.etapa] ?? 0}`} color={p.porStatus[e.etapa] ? "primary" : "default"} variant={p.porStatus[e.etapa] ? "filled" : "outlined"} />)}</Stack>
          </Section>
          <Section title="Rol por departamento"><Table size="small"><TableHead><TableRow><TableCell>Departamento</TableCell><TableCell>Remessas</TableCell><TableCell>Peças enviadas</TableCell><TableCell>Em aberto</TableCell></TableRow></TableHead>
            <TableBody>{p.porDepartamento.map((d: any) => <TableRow key={d.departamento}><TableCell>{d.departamento}</TableCell><TableCell>{d.enviadas}</TableCell><TableCell>{d.pecas}</TableCell><TableCell>{d.abertas}</TableCell></TableRow>)}</TableBody></Table></Section>
        </>)}
      </StateBox>
      <Section title="Remessas" actions={<Button variant="contained" onClick={() => setDlg("remessa")}>Enviar rouparia</Button>}>
        <StateBox loading={rem.loading} error={rem.error} onRetry={rem.reload} empty={!rem.data?.length}>
          <Table size="small"><TableHead><TableRow><TableCell>Código</TableCell><TableCell>Departamento</TableCell><TableCell>Peças</TableCell><TableCell>Situação</TableCell><TableCell>Previsão de retorno</TableCell><TableCell>Última movimentação</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>{rem.data?.map((r) => (<TableRow key={r.id}><TableCell>{r.codigo}</TableCell><TableCell>{r.departamento}</TableCell><TableCell>{r.totalPecas}</TableCell><TableCell><Chip size="small" color={r.status === "CONFERIDA" ? "success" : r.atrasada ? "error" : "info"} label={ROTULO[r.status]} /></TableCell><TableCell>{dt(r.previsaoRetornoEm)}{r.atrasada && " ⚠"}</TableCell><TableCell>{r.ultimaEtapa ? `${r.ultimaEtapa.responsavel} · ${dth(r.ultimaEtapa.em)}` : "—"}</TableCell><TableCell><Button size="small" onClick={() => abrir(r)}>Jornada</Button></TableCell></TableRow>))}</TableBody></Table>
        </StateBox>
      </Section>
      <Section title="Logística combinada (rotas)" description="Dia e horário de coleta e entrega, transportador e responsáveis de cada setor." actions={<Button variant="outlined" onClick={() => setDlg("rota")}>Nova rota</Button>}>
        <StateBox loading={rotas.loading} error={rotas.error} onRetry={rotas.reload} empty={!rotas.data?.length}>
          <Table size="small"><TableHead><TableRow><TableCell>Rota</TableCell><TableCell>Dia</TableCell><TableCell>Coleta</TableCell><TableCell>Entrega</TableCell><TableCell>Retorno em</TableCell><TableCell>Coleta por</TableCell><TableCell>Transporte</TableCell><TableCell>Recebe</TableCell></TableRow></TableHead>
            <TableBody>{rotas.data?.map((r) => (<TableRow key={r.id}><TableCell>{r.nome}</TableCell><TableCell>{DIAS[r.diaSemana]}</TableCell><TableCell>{r.horaColeta}</TableCell><TableCell>{r.horaEntrega}</TableCell><TableCell>{r.prazoRetornoDias} dia(s)</TableCell><TableCell>{r.responsavelColeta ?? "—"}</TableCell><TableCell>{r.transportador ?? "—"}</TableCell><TableCell>{r.responsavelEntrega ?? "—"}</TableCell></TableRow>))}</TableBody></Table>
        </StateBox>
      </Section>

      <Dialog open={!!det} onClose={() => setDet(null)} fullWidth maxWidth="md">
        <DialogTitle>{det?.codigo} — {det?.departamento}</DialogTitle>
        <DialogContent dividers>
          {det && (<Stack gap={2}>
            <Typography>{det.itens.map((i: any) => `${i.qtd}× ${i.peca}`).join(" · ")} — <b>{det.totalPecas} peças</b>{det.rota ? ` · Rota: ${det.rota.nome}` : ""}</Typography>
            {det.divergencia && <Alert severity="warning">{det.divergencia}</Alert>}
            <Stepper orientation="vertical" activeStep={det.jornada.findIndex((j: any) => !j.registro)}>
              {det.jornada.map((j: any) => (<Step key={j.etapa} completed={!!j.registro}><StepLabel optional={j.registro ? <Typography variant="caption">{j.registro.responsavel} · {dth(j.registro.em)}{j.registro.qtdPecas != null ? ` · ${j.registro.qtdPecas} peças` : ""}{j.registro.observacao ? ` · ${j.registro.observacao}` : ""}</Typography> : undefined}>{j.rotulo}</StepLabel></Step>))}
            </Stepper>
            {det.status !== "CONFERIDA" && (<Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { md: "2fr 1fr 2fr" } }}>
              <TextField size="small" label="Responsável por esta etapa" value={avanco.responsavel} onChange={(e) => setAvanco({ ...avanco, responsavel: e.target.value })} />
              <TextField size="small" type="number" label="Peças conferidas" value={avanco.qtdPecas} onChange={(e) => setAvanco({ ...avanco, qtdPecas: e.target.value })} />
              <TextField size="small" label="Observação" value={avanco.observacao} onChange={(e) => setAvanco({ ...avanco, observacao: e.target.value })} />
            </Box>)}
          </Stack>)}
        </DialogContent>
        <DialogActions><Button onClick={() => setDet(null)}>Fechar</Button>{det && det.status !== "CONFERIDA" && <Button variant="contained" disabled={!avanco.responsavel.trim()} onClick={async () => { await run(() => eduApi.post(`/lavanderia/remessas/${det.id}/avancar`, avanco), "Etapa registrada."); setDet(await eduApi.get(`/lavanderia/remessas/${det.id}`)); }}>Registrar próxima etapa</Button>}</DialogActions>
      </Dialog>
      <FormDialog open={dlg === "remessa"} title="Enviar rouparia" onClose={() => setDlg(null)} campos={[{ k: "departamento", label: "Departamento de origem", required: true }, { k: "tipo", label: "Tipo", type: "select", options: [["UNIFORME", "Uniformes"], ["JALECO", "Jalecos"], ["ENXOVAL", "Enxoval"], ["CAMPO_CIRURGICO", "Campos cirúrgicos"], ["OUTRO", "Outro"]] }, { k: "peca1", label: "Peça 1", required: true }, { k: "qtd1", label: "Quantidade 1", type: "number", required: true }, { k: "peca2", label: "Peça 2" }, { k: "qtd2", label: "Quantidade 2", type: "number" }, { k: "solicitante", label: "Quem está enviando" }]}
        onSave={(v) => run(() => eduApi.post("/lavanderia/remessas", { departamento: v.departamento, tipo: v.tipo, solicitante: v.solicitante, itens: [{ peca: v.peca1, qtd: v.qtd1 }, ...(v.peca2 ? [{ peca: v.peca2, qtd: v.qtd2 }] : [])] }), "Remessa registrada.")} />
      <FormDialog open={dlg === "rota"} title="Nova rota logística" onClose={() => setDlg(null)} campos={[{ k: "nome", label: "Nome da rota", required: true }, { k: "departamento", label: "Departamento", required: true }, { k: "diaSemana", label: "Dia da semana", type: "select", options: DIAS.map((d, i) => [String(i), d] as [string, string]) }, { k: "horaColeta", label: "Horário da coleta" }, { k: "horaEntrega", label: "Horário da entrega" }, { k: "prazoRetornoDias", label: "Prazo de retorno (dias)", type: "number" }, { k: "responsavelColeta", label: "Quem coleta" }, { k: "transportador", label: "Transporte" }, { k: "responsavelEntrega", label: "Quem recebe" }]} onSave={(v) => run(() => eduApi.post("/lavanderia/rotas", { ...v, diaSemana: Number(v.diaSemana ?? 1) }), "Rota criada.")} />
      {node}
    </EduShell>
  );
}
