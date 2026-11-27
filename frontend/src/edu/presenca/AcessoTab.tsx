import { Alert, Box, Button, Chip, LinearProgress, MenuItem, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { Async, Bars, FormDialog, Panel, SubNav, Tag, fmtDateTime, itemsOf, label, useApi, useSpaces, useToast } from "../infraestrutura/kit";
import { STATUS_COR, hora } from "./comum";

function Ocupacao() {
  const oc = useApi<any>("/presenca/ocupacao");
  const [sel, setSel] = useState<string | null>(null);
  const det = useApi<any>(sel ? `/presenca/ocupacao/${sel}` : null);
  const toast = useToast();
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Panel title="Ocupação em tempo real" subtitle="Espaços com controle de acesso ou com pessoas dentro." actions={<Button onClick={() => { oc.reload(); det.reload(); }}>Atualizar</Button>}>
        <Async state={oc}>
          {(d) => (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", xl: "repeat(3, 1fr)" }, gap: 1.5 }}>
              {(d.items || []).map((e: any) => {
                const cor = e.percentual === null ? "primary" : e.percentual >= 100 ? "error" : e.percentual >= 80 ? "warning" : "success";
                return (
                  <Box key={e.spaceId} onClick={() => setSel(e.spaceId)} role="button" tabIndex={0} onKeyDown={(k) => k.key === "Enter" && setSel(e.spaceId)}
                    sx={{ p: 2, border: 2, borderColor: sel === e.spaceId ? "primary.main" : "divider", borderRadius: 3, cursor: "pointer", display: "grid", gap: 0.5 }}>
                    <Typography sx={{ fontWeight: 800 }}>{e.nome}</Typography>
                    <Typography sx={{ fontSize: 34, fontWeight: 900, lineHeight: 1 }}>{e.ocupacao}<Typography component="span" color="text.secondary" sx={{ fontSize: 18 }}>{e.capacidade ? ` / ${e.capacidade}` : ""}</Typography></Typography>
                    {e.percentual !== null && <LinearProgress variant="determinate" value={Math.min(100, e.percentual)} color={cor as any} sx={{ height: 8, borderRadius: 4 }} />}
                    <Typography variant="caption" color="text.secondary">{label(e.tipo)} · acesso {String(e.modoAcesso).toLowerCase()}{e.percentual !== null ? ` · ${e.percentual}%` : ""}</Typography>
                  </Box>
                );
              })}
              {!d.items?.length && <Typography color="text.secondary">Nenhum espaço controlado ainda. Configure na aba “Espaços”.</Typography>}
            </Box>
          )}
        </Async>
      </Panel>
      {sel && (
        <Panel title="Quem está no espaço" actions={<Button color="error" onClick={() => toast.run(() => eduApi.post(`/presenca/espacos/${sel}/esvaziar`, {}), "Permanências encerradas.", () => { det.reload(); oc.reload(); }, "Encerrar a permanência de todos neste espaço (ex.: fim do expediente)?")}>Esvaziar espaço</Button>}>
          <Async state={det}>
            {(d) => (
              <Box sx={{ display: "grid", gap: 0.5 }}>
                <Typography variant="body2" color="text.secondary">{d.espaco.nome} — {d.ocupacao}{d.capacidade ? ` de ${d.capacidade}` : ""} pessoa(s)</Typography>
                {d.presentes.map((p: any) => <Box key={p.visitaId} sx={{ display: "flex", justifyContent: "space-between", py: 0.5, borderBottom: "1px solid", borderColor: "divider" }}><Typography variant="body2">{p.nome}{p.tipo === "VISITANTE" ? " (visitante)" : ""}</Typography><Typography variant="caption" color="text.secondary">desde {hora(p.entradaEm)} · {p.metodo}</Typography></Box>)}
                {!d.presentes.length && <Typography color="text.secondary">Ninguém no momento.</Typography>}
              </Box>
            )}
          </Async>
        </Panel>
      )}
      {toast.node}
    </Box>
  );
}

function Historico() {
  const spaces = useSpaces();
  return (
    <Panel title="Histórico de entradas e saídas" subtitle="Inclui acessos negados. Por pessoa ou por espaço.">
      <ListTable path="/presenca/acesso/historico" searchable={false} pageSize={25}
        filters={[{ key: "spaceId", label: "Espaço", options: spaces }, { key: "resultado", label: "Resultado", options: ["LIBERADO", "NEGADO"] }, { key: "sentido", label: "Sentido", options: ["ENTRADA", "SAIDA"] }, { key: "metodo", label: "Método", options: ["FACIAL", "QR", "CODIGO", "MANUAL", "CATRACA"] }]}
        columns={[
          { key: "em", label: "Quando", render: (r) => fmtDateTime(r.em) }, { key: "nome", label: "Pessoa", render: (r) => r.nome || "—" }, { key: "espaco", label: "Espaço" },
          { key: "sentido", label: "Sentido", render: (r) => label(r.sentido) }, { key: "metodo", label: "Método", render: (r) => label(r.metodo) },
          { key: "resultado", label: "Resultado", render: (r) => <Chip size="small" color={STATUS_COR[r.resultado] || "default"} label={r.resultado === "NEGADO" ? `Negado${r.motivo ? ` · ${label(r.motivo)}` : ""}` : "Liberado"} /> },
        ]} />
    </Panel>
  );
}

function Alertas() {
  const toast = useToast();
  const [rk, setRk] = useState(0);
  return (
    <Panel title="Alertas" subtitle="Capacidade, acesso indevido, tentativas de reconhecimento, dispositivos bloqueados, atrasos e divergências.">
      <ListTable path="/presenca/alertas" searchable={false} refreshKey={rk}
        filters={[{ key: "status", label: "Status", options: ["ABERTO", "RECONHECIDO", "RESOLVIDO"] }, { key: "tipo", label: "Tipo", options: ["CAPACIDADE", "ACESSO_INDEVIDO", "TENTATIVAS", "ATRASO_DEVOLUCAO", "DIVERGENCIA"] }]}
        columns={[
          { key: "createdAt", label: "Quando", render: (r) => fmtDateTime(r.createdAt) }, { key: "tipo", label: "Tipo", render: (r) => <Tag text={label(r.tipo)} tone={r.severidade === "CRITICO" ? "error" : "warning"} /> },
          { key: "mensagem", label: "Mensagem" }, { key: "status", label: "Status", render: (r) => <Chip size="small" color={STATUS_COR[r.status] || "default"} label={label(r.status)} /> },
        ]}
        actions={(r) => r.status !== "RESOLVIDO" ? (
          <>
            {r.status === "ABERTO" && <Button size="small" onClick={() => toast.run(() => eduApi.post(`/presenca/alertas/${r.id}/reconhecer`, {}), "Alerta reconhecido.", () => setRk((k) => k + 1))}>Reconhecer</Button>}
            <Button size="small" onClick={() => toast.run(() => eduApi.post(`/presenca/alertas/${r.id}/resolver`, {}), "Alerta resolvido.", () => setRk((k) => k + 1))}>Resolver</Button>
          </>
        ) : null} />
      {toast.node}
    </Panel>
  );
}

function Espacos() {
  const lista = useApi<any>("/presenca/espacos");
  const [edit, setEdit] = useState<any | null>(null);
  return (
    <Panel title="Controle de acesso por espaço" subtitle="Modo LIVRE só registra; CREDENCIAL exige face/QR/código; RESTRITO também limita por perfil. Capacidade e horário geram negativas e alertas.">
      <Async state={lista}>
        {(d) => (
          <Box sx={{ overflowX: "auto" }}>
            <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", "& td, & th": { p: 1, borderBottom: "1px solid", borderColor: "divider", textAlign: "left", fontSize: 14 } }}>
              <thead><tr><th>Espaço</th><th>Tipo</th><th>Capacidade</th><th>Acesso</th><th>Horário</th><th /></tr></thead>
              <tbody>
                {itemsOf(d).map((e: any) => (
                  <tr key={e.id}>
                    <td><b>{e.nome}</b></td><td>{label(e.tipo)}</td><td>{e.capacidade ?? "—"}</td>
                    <td>{e.config ? <Tag text={e.config.modoAcesso} tone={e.config.modoAcesso === "LIVRE" ? "default" : "info"} /> : <Typography variant="caption" color="text.secondary">sem controle</Typography>}{e.config?.bloquearNaCapacidade ? " · bloqueia lotação" : ""}</td>
                    <td>{e.config?.horaAbertura ? `${e.config.horaAbertura}–${e.config.horaFechamento}` : "—"}</td>
                    <td><Button size="small" onClick={() => setEdit(e)}>Configurar</Button></td>
                  </tr>
                ))}
              </tbody>
            </Box>
          </Box>
        )}
      </Async>
      <FormDialog open={!!edit} title={`Acesso: ${edit?.nome ?? ""}`} onClose={() => setEdit(null)} submitLabel="Salvar"
        initial={edit ? { modoAcesso: edit.config?.modoAcesso ?? "LIVRE", capacidadeMax: edit.config?.capacidadeMax ?? edit.capacidade, alertaCapacidadePct: edit.config?.alertaCapacidadePct ?? 90, bloquearNaCapacidade: edit.config?.bloquearNaCapacidade ?? false, perfisPermitidos: edit.config?.perfisPermitidos ?? [], horaAbertura: edit.config?.horaAbertura, horaFechamento: edit.config?.horaFechamento } : null}
        fields={[
          { key: "modoAcesso", label: "Modo de acesso", type: "select", options: ["LIVRE", "CREDENCIAL", "RESTRITO"], required: true },
          { key: "capacidadeMax", label: "Capacidade máxima", type: "number" }, { key: "alertaCapacidadePct", label: "Alertar a partir de (%)", type: "number" },
          { key: "bloquearNaCapacidade", label: "Negar entrada ao lotar", type: "bool" },
          { key: "perfisPermitidos", label: "Perfis permitidos (RESTRITO)", type: "list", helper: "Ex.: STUDENT, TEACHER, COORDINATOR, STAFF" },
          { key: "horaAbertura", label: "Abre às (HH:mm)" }, { key: "horaFechamento", label: "Fecha às (HH:mm)" },
        ]}
        onSubmit={async (b) => { await eduApi.put(`/presenca/espacos/${edit.id}/config`, b); lista.reload(); }} />
    </Panel>
  );
}

function RelatorioHoras() {
  const spaces = useSpaces();
  const [spaceId, setSpaceId] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const rel = useApi<any>(`/presenca/relatorios/ocupacao?data=${data}${spaceId ? `&spaceId=${spaceId}` : ""}`);
  return (
    <Panel title="Ocupação por hora" subtitle="Ocupação ao fim de cada hora e entradas na hora." actions={<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
      <TextField select size="small" label="Espaço" sx={{ minWidth: 200 }} value={spaceId} onChange={(e) => setSpaceId(e.target.value)}><MenuItem value="">Todos</MenuItem>{spaces.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}</TextField>
      <TextField size="small" type="date" label="Dia" value={data} onChange={(e) => setData(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} /></Box>}>
      <Async state={rel}>
        {(d) => (<>
          <Alert severity="info" sx={{ mb: 1 }}>Pico às {String(d.pico.hora).padStart(2, "0")}h com {d.pico.ocupacaoFimHora} pessoa(s).</Alert>
          <Bars items={d.horas.filter((h: any) => h.ocupacaoFimHora || h.entradas).map((h: any) => ({ label: `${String(h.hora).padStart(2, "0")}h`, value: h.ocupacaoFimHora, hint: `${h.entradas} entrada(s)` }))} empty="Sem movimento neste dia." />
        </>)}
      </Async>
    </Panel>
  );
}

export default function AcessoTab() {
  const [sub, setSub] = useState("ocupacao");
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <SubNav value={sub} onChange={setSub} items={[{ key: "ocupacao", label: "Ocupação" }, { key: "historico", label: "Histórico" }, { key: "alertas", label: "Alertas" }, { key: "espacos", label: "Espaços" }, { key: "horas", label: "Por hora" }]} />
      {sub === "ocupacao" && <Ocupacao />}{sub === "historico" && <Historico />}{sub === "alertas" && <Alertas />}{sub === "espacos" && <Espacos />}{sub === "horas" && <RelatorioHoras />}
    </Box>
  );
}
