import { Box, Button, Typography } from "@mui/material";
import TabletAndroidIcon from "@mui/icons-material/TabletAndroid";
import { useNavigate } from "react-router-dom";
import { eduApi } from "../../services/EduApi";
import { Async, Panel, Stat, StatGrid, Tag, fmtDateTime, num, useApi, useToast } from "../infraestrutura/kit";
import { AvisoBiometria } from "./comum";

export default function PainelPresenca() {
  const nav = useNavigate();
  const p = useApi<any>("/presenca/painel");
  const al = useApi<any>("/presenca/alertas?status=ABERTO&pageSize=8");
  const toast = useToast();
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Panel title="Quiosque" subtitle="Abra em um tablet ou celular, em tela cheia, para chamada facial, portaria e empréstimos." actions={<Button variant="contained" startIcon={<TabletAndroidIcon />} onClick={() => nav("/edu/presenca/quiosque")}>Abrir quiosque</Button>}>
        <AvisoBiometria />
      </Panel>
      <Async state={p}>
        {(d) => (
          <StatGrid>
            <Stat label="Chamadas hoje" value={num(d.chamadasHoje, 0)} hint={`${d.chamadasAbertas} aberta(s)`} />
            <Stat label="Presentes hoje" value={num(d.presencaHoje.presentes, 0)} tone="success" hint={`de ${d.presencaHoje.total} lançamentos`} />
            <Stat label="Atrasos hoje" value={num(d.presencaHoje.atrasos, 0)} tone={d.presencaHoje.atrasos ? "warning" : "default"} />
            <Stat label="Faltas hoje" value={num(d.presencaHoje.faltas, 0)} tone={d.presencaHoje.faltas ? "error" : "default"} />
            <Stat label="Divergências com o diário" value={num(d.divergenciasPendentes, 0)} tone={d.divergenciasPendentes ? "warning" : "success"} />
            <Stat label="Pessoas nos espaços" value={num(d.pessoasNosEspacos, 0)} />
            <Stat label="Empréstimos ativos" value={num(d.emprestimosAtivos, 0)} hint={`${d.emprestimosAtrasados} em atraso`} tone={d.emprestimosAtrasados ? "error" : "default"} />
            <Stat label="Alertas abertos" value={num(d.alertasAbertos, 0)} tone={d.alertasAbertos ? "error" : "success"} />
          </StatGrid>
        )}
      </Async>
      <Panel title="Alertas abertos" subtitle="Capacidade, acesso indevido, tentativas de reconhecimento, atrasos.">
        <Async state={al}>
          {(d) => (
            <Box sx={{ display: "grid", gap: 1 }}>
              {(d.items || []).map((a: any) => (
                <Box key={a.id} sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
                  <Tag text={a.tipo.replace(/_/g, " ")} tone={a.severidade === "CRITICO" ? "error" : "warning"} />
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 220 }}>{a.mensagem}</Typography>
                  <Typography variant="caption" color="text.secondary">{fmtDateTime(a.createdAt)}</Typography>
                  <Button size="small" onClick={() => toast.run(() => eduApi.post(`/presenca/alertas/${a.id}/resolver`, {}), "Alerta resolvido.", () => { al.reload(); p.reload(); })}>Resolver</Button>
                </Box>
              ))}
              {!d.items?.length && <Typography color="text.secondary">Nenhum alerta aberto.</Typography>}
            </Box>
          )}
        </Async>
      </Panel>
      {toast.node}
    </Box>
  );
}
