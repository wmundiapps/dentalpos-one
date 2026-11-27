import { Box, Button, Checkbox, FormControlLabel, MenuItem, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import ListTable from "./ListTable";
import { AreasVagasPanel, OcorrenciasPanel, VeiculosPanel } from "./EstacionamentoCadastros";
import { Async, Bars, Light, Panel, ProgressBar, Stat, StatGrid, SubNav, Tag, fmtDateTime, itemsOf, label, num, useApi, useToast } from "./kit";

const tone = (p: number) => (p >= 90 ? "error" : p >= 70 ? "warning" : "success") as "error" | "warning" | "success";

function Ocupacao({ rk }: { rk: number }) {
  const st = useApi<any>(`/infraestrutura/estacionamento/ocupacao?k=${rk}`);
  return (
    <Async state={st}>
      {(d) => (
        <Box sx={{ display: "grid", gap: 2 }}>
          <StatGrid>
            <Stat label="Vagas" value={num(d.total?.totalVagas, 0)} />
            <Stat label="Ocupadas" value={num(d.total?.ocupadas, 0)} />
            <Stat label="Livres" value={num(d.total?.livres, 0)} tone="success" />
            <Stat label="Ocupação" value={`${num(d.total?.ocupacaoPct, 0)}%`} tone={tone(d.total?.ocupacaoPct || 0)} />
          </StatGrid>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 2 }}>
            {(d.areas || []).map((a: any) => (
              <Panel key={a.areaId} title={a.nome} actions={<Light tone={tone(a.ocupacaoPct)} text={`${num(a.ocupacaoPct, 0)}%`} />}>
                <ProgressBar value={a.ocupacaoPct} color={tone(a.ocupacaoPct)} />
                <Typography variant="body2" sx={{ mt: 1 }}>{a.ocupadas} ocupadas · {a.livres} livres de {a.totalVagas}</Typography>
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 1 }}>
                  {Object.entries(a.porTipo || {}).map(([t, v]: any) => <Tag key={t} text={`${label(t)} ${v.ocupadas}/${v.total}`} />)}
                </Box>
              </Panel>
            ))}
          </Box>
          {!(d.areas || []).length && <Typography color="text.secondary">Nenhuma área cadastrada. Use a aba "Áreas e vagas".</Typography>}
        </Box>
      )}
    </Async>
  );
}

function Portaria({ areas, onChanged }: { areas: Array<{ value: string; label: string }>; onChanged: () => void }) {
  const [placa, setPlaca] = useState("");
  const [areaId, setAreaId] = useState("");
  const [vagaId, setVagaId] = useState("");
  const [visitante, setVisitante] = useState(false);
  const [vagas, setVagas] = useState<any[]>([]);
  const [key, setKey] = useState(0);
  const [dentro, setDentro] = useState(false);
  const toast = useToast();
  useEffect(() => {
    setVagaId("");
    if (!areaId) { setVagas([]); return; }
    eduApi.get(`/infraestrutura/estacionamento/vagas${qsOf({ areaId, ativo: "true", pageSize: 200 })}`).then((r) => setVagas(itemsOf(r))).catch(() => setVagas([]));
  }, [areaId]);
  const done = () => { setKey((k) => k + 1); onChanged(); };
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Panel title="Controle de acesso" subtitle="Registre entradas e saídas pela placa; a credencial e o tipo de vaga são validados.">
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
          <TextField size="small" label="Placa" value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} sx={{ width: 140 }} />
          <TextField select size="small" label="Área" value={areaId} onChange={(e) => setAreaId(e.target.value)} sx={{ minWidth: 190 }}>
            {areas.map((a) => <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Vaga (opcional)" value={vagaId} onChange={(e) => setVagaId(e.target.value)} sx={{ minWidth: 150 }}>
            <MenuItem value="">Sem vaga definida</MenuItem>
            {vagas.map((v) => <MenuItem key={v.id} value={v.id}>{v.codigo} ({label(v.tipo)})</MenuItem>)}
          </TextField>
          <FormControlLabel control={<Checkbox checked={visitante} onChange={(e) => setVisitante(e.target.checked)} />} label="Visitante" />
          <Button variant="contained" color="success" disabled={!placa || !areaId}
            onClick={() => toast.run(() => eduApi.post("/infraestrutura/estacionamento/acessos/entrada", { placa, areaId, visitante, ...(vagaId ? { vagaId } : {}) }), "Entrada registrada.", done)}>Registrar entrada</Button>
          <Button variant="outlined" disabled={!placa}
            onClick={() => toast.run(() => eduApi.post("/infraestrutura/estacionamento/acessos/saida", { placa }), "Saída registrada.", done)}>Registrar saída</Button>
        </Box>
      </Panel>
      <Panel title="Acessos recentes">
        <FormControlLabel control={<Checkbox checked={dentro} onChange={(e) => setDentro(e.target.checked)} />} label="Somente veículos dentro agora" />
        <ListTable path="/infraestrutura/estacionamento/acessos" refreshKey={key} searchable={false} extraQuery={dentro ? { dentro: "true" } : {}}
          columns={[
            { key: "placa", label: "Placa" }, { key: "areaId", label: "Área", render: (r) => areas.find((a) => a.value === r.areaId)?.label || "—" },
            { key: "entradaEm", label: "Entrada", render: (r) => fmtDateTime(r.entradaEm) }, { key: "saidaEm", label: "Saída", render: (r) => (r.saidaEm ? fmtDateTime(r.saidaEm) : r.autorizado ? "No local" : "—") },
            { key: "autorizado", label: "Resultado", render: (r) => (r.autorizado ? <Tag text="Autorizado" tone="success" /> : <Tag text={r.motivoNegado || "Negado"} tone="error" />) },
          ]} />
      </Panel>
      {toast.node}
    </Box>
  );
}

function Relatorio() {
  const st = useApi<any>("/infraestrutura/estacionamento/relatorios/ocupacao");
  return (
    <Async state={st}>
      {(d) => (
        <Box sx={{ display: "grid", gap: 2 }}>
          <StatGrid>
            <Stat label="Entradas autorizadas (30 dias)" value={num(d.entradasAutorizadas, 0)} />
            <Stat label="Acessos negados" value={num(d.acessosNegados, 0)} tone={d.acessosNegados ? "warning" : "success"} />
            <Stat label="Permanência média" value={d.permanenciaMediaMin == null ? "—" : `${num(d.permanenciaMediaMin, 0)} min`} />
            <Stat label="Horário de pico" value={d.horarioPico ? `${d.horarioPico.hora}h` : "—"} hint={d.horarioPico ? `${d.horarioPico.entradas} entradas` : undefined} />
          </StatGrid>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" }, gap: 2 }}>
            <Panel title="Entradas por hora do dia">
              <Box sx={{ display: "flex", alignItems: "flex-end", gap: 0.5, height: 140 }}>
                {(d.porHora || []).map((h: any) => {
                  const max = Math.max(...(d.porHora || []).map((x: any) => x.entradas), 1);
                  return (
                    <Box key={h.hora} title={`${h.hora}h: ${h.entradas}`} sx={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", height: "100%" }}>
                      <Box sx={{ width: "100%", height: `${(h.entradas / max) * 100}%`, minHeight: h.entradas ? 3 : 0, bgcolor: "primary.main", borderRadius: 0.5 }} />
                      <Typography variant="caption" sx={{ fontSize: 9 }}>{h.hora}</Typography>
                    </Box>
                  );
                })}
              </Box>
            </Panel>
            <Panel title="Ocorrências por tipo">
              <Bars items={(d.ocorrenciasPorTipo || []).map((o: any) => ({ label: label(o.tipo), value: o.quantidade, color: "#d32f2f" }))} empty="Sem ocorrências." />
            </Panel>
          </Box>
        </Box>
      )}
    </Async>
  );
}

export default function EstacionamentoTab() {
  const [sub, setSub] = useState("ocupacao");
  const [rk, setRk] = useState(0);
  const areasApi = useApi<any>("/infraestrutura/estacionamento/areas?pageSize=200");
  const areas = itemsOf(areasApi.data).map((a: any) => ({ value: a.id, label: a.nome }));
  return (
    <Box>
      <SubNav value={sub} onChange={setSub} items={[{ key: "ocupacao", label: "Ocupação" }, { key: "portaria", label: "Portaria" }, { key: "veiculos", label: "Veículos e credenciais" }, { key: "areas", label: "Áreas e vagas" }, { key: "ocorrencias", label: "Ocorrências" }, { key: "relatorio", label: "Relatório" }]} />
      {sub === "ocupacao" && <Ocupacao rk={rk} />}
      {sub === "portaria" && <Portaria areas={areas} onChanged={() => setRk((k) => k + 1)} />}
      {sub === "veiculos" && <VeiculosPanel />}
      {sub === "areas" && <AreasVagasPanel areas={areas} />}
      {sub === "ocorrencias" && <OcorrenciasPanel areas={areas} />}
      {sub === "relatorio" && <Relatorio />}
    </Box>
  );
}
