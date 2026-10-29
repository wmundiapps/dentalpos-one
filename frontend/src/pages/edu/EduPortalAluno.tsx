import { Alert, Box, Button, Paper, Snackbar, Tab, Tabs, Typography } from "@mui/material";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import EventNoteOutlinedIcon from "@mui/icons-material/EventNoteOutlined";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import EduShell from "../../edu/EduShell";
import { MeusDocumentos, NovoRequerimento, RevisaoDialog } from "../../edu/portal/PortalAcoes";
import { AvisosCard, Card, FinanceiroCard, Kpi, ProvasCard, RequerimentosCard } from "../../edu/portal/PortalSecoes";
import PortalBoletim from "../../edu/portal/PortalBoletim";
import PortalFrequencia from "../../edu/portal/PortalFrequencia";
import { SalasDoAluno } from "../../edu/portal/SalaVirtual";
import PortalHorario from "../../edu/portal/PortalHorario";
import PortalFluxograma from "../../edu/portal/PortalFluxograma";
import PortalRequerimentos from "../../edu/portal/PortalRequerimentos";
import PortalFinanceiro from "../../edu/portal/PortalFinanceiro";
import PortalBiblioteca from "../../edu/portal/PortalBiblioteca";
import MinhaBiometria from "../../edu/presenca/MinhaBiometria";
import PortalServicos from "../../edu/atendimento/PortalServicos";
import { PortalAvaliacaoDocente, PortalCarteirinha, PortalMensagens, PortalPrivacidade } from "../../edu/portal/PortalPessoal";
import { qsOf } from "../../services/EduApi";
import { Feedback, StudentSearch, fmtNum, useLoad } from "../../edu/secretaria/util";

const ABAS: Array<[string, string]> = [
  ["geral", "Visão geral"], ["notas", "Notas e boletim"], ["frequencia", "Frequência"], ["salas", "Salas e materiais"], ["horario", "Horários"], ["fluxograma", "Fluxograma"],
  ["requerimentos", "Requerimentos e processos"], ["servicos", "Serviços e atendimento"], ["financeiro", "Financeiro"], ["biblioteca", "Biblioteca"], ["mensagens", "Mensagens"], ["documentos", "Documentos"],
  ["carteirinha", "Carteirinha"], ["biometria", "Presença facial e QR"], ["privacidade", "Privacidade (LGPD)"], ["avaliacao", "Avaliação docente"],
];

export default function EduPortalAluno() {
  const [override, setOverride] = useState<{ id: string; nome: string; ra?: string } | null>(null);
  const { data: p, loading, error, reload } = useLoad<any>(`/notas/portal/meu-painel${qsOf({ studentId: override?.id })}`);
  const [params, setParams] = useSearchParams();
  const aba = params.get("aba") || "geral";
  const irPara = (k: string) => setParams((p) => { const n = new URLSearchParams(p); n.set("aba", k); return n; }, { replace: true });
  const [novo, setNovo] = useState(false);
  const [rev, setRev] = useState<{ classSectionId: string; componenteId: string; titulo: string } | null>(null);
  const sidAlvo = override?.id ?? null;
  const [toast, setToast] = useState<{ t: "success" | "error"; m: string } | null>(null);
  const podeAgir = !override; // gestão visualizando outro aluno não abre requerimentos em nome dele

  const cor = p?.marca?.cores?.primaria || "#0F5FDB";
  const disc: any[] = p?.notas?.disciplinas || [];
  const freqs = disc.map((d) => d.frequenciaPct).filter((x) => x != null) as number[];
  const freqMedia = freqs.length ? freqs.reduce((a, b) => a + b, 0) / freqs.length : null;
  const primeiro = (p?.aluno?.nome || "").split(" ")[0];

  const seletor = (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 4, mb: 2 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>{override ? "Visualizando o portal de outro aluno" : "Perfil da instituição: escolha um aluno para ver o portal"}</Typography>
      <StudentSearch value={override} onChange={setOverride} />
    </Paper>
  );

  return (
    <EduShell title={primeiro ? `Olá, ${primeiro}!` : "Portal do Aluno"}
      subtitle={p ? `RA ${p.aluno.ra}${p.periodoAtual ? ` · período ${p.periodoAtual.codigo}` : ""} · ${p.aluno.status}` : "Notas, frequência, materiais, financeiro, requerimentos e muito mais em um só lugar."}
      actions={<Button color="inherit" sx={{ color: "#fff", borderColor: "rgba(255,255,255,.6)" }} variant="outlined" startIcon={<RefreshIcon />} onClick={reload}>Atualizar</Button>}>
      {(error || override) && seletor}
      <Feedback loading={loading} error={error ? (/studentId|vinculado/i.test(error) ? "Seu usuário não está vinculado a um aluno. Use a busca acima para consultar o portal de um aluno." : error) : null} onRetry={reload} />
      {p && (
        <Box sx={{ display: "grid", gap: 2.5 }}>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" } }}>
            <Kpi title="Coef. de rendimento" value={fmtNum(p.notas?.cr, 2)} hint={p.notas?.crPeriodo != null ? `Período: ${fmtNum(p.notas.crPeriodo, 2)}` : undefined} color={cor} />
            <Kpi title="Frequência média" value={freqMedia != null ? `${fmtNum(freqMedia, 0)}%` : "—"} hint={`${disc.length} disciplina(s) no período`} color={freqMedia != null && freqMedia < 75 ? "#D32F2F" : "#2E7D32"} />
            <Kpi title="Financeiro" value={p.financeiro ? (p.financeiro.emDia ? "Em dia" : "Pendente") : "—"} hint={p.financeiro && !p.financeiro.emDia ? `${p.financeiro.qtdVencidas} vencida(s)` : undefined} color={p.financeiro && !p.financeiro.emDia ? "#D32F2F" : "#2E7D32"} />
            <Kpi title="Avisos novos" value={p.avisos?.naoLidas ?? 0} hint={`${(p.requerimentosAbertos || []).length} requerimento(s) em andamento`} color="#ED6C02" />
          </Box>

          <Tabs value={aba} onChange={(_, v) => irPara(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label="Seções do portal do aluno">
            {ABAS.map(([k, l]) => <Tab key={k} value={k} label={l} />)}
          </Tabs>

          {aba === "geral" && (
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" } }}>
              <Card title="Próximas provas e aulas" icon={<EventNoteOutlinedIcon color="primary" />} accent={cor}><ProvasCard provas={p.proximasProvas} aulas={p.horarios?.proximasAulas} /></Card>
              <Card title="Financeiro" icon={<PaymentsOutlinedIcon color="primary" />} accent={cor}><FinanceiroCard fin={p.financeiro} /></Card>
              <Card title="Avisos" icon={<NotificationsNoneOutlinedIcon color="primary" />} accent={cor}><AvisosCard avisos={p.avisos} /></Card>
              <Box sx={{ gridColumn: { md: "1 / -1" } }}>
                <Card title="Requerimentos" icon={<AssignmentOutlinedIcon color="primary" />} accent={cor}><RequerimentosCard lista={p.requerimentosAbertos} revisoes={p.revisoesEmAndamento} onNovo={() => setNovo(true)} podeAgir={podeAgir} /></Card>
              </Box>
            </Box>
          )}
          {aba === "notas" && <PortalBoletim studentId={sidAlvo} podeAgir={podeAgir} onRevisao={(a) => setRev(a)} />}
          {aba === "frequencia" && <PortalFrequencia studentId={sidAlvo} podeAgir={podeAgir} />}
          {aba === "salas" && <SalasDoAluno studentId={sidAlvo} podeAgir={podeAgir} />}
          {aba === "horario" && <PortalHorario studentId={sidAlvo} />}
          {aba === "fluxograma" && <PortalFluxograma studentId={sidAlvo} />}
          {aba === "servicos" && (podeAgir ? <PortalServicos /> : <Alert severity="info">Os serviços de autoatendimento são usados pelo próprio aluno logado.</Alert>)}
          {aba === "requerimentos" && <PortalRequerimentos studentId={sidAlvo} podeAgir={podeAgir} onNovoRequerimento={() => setNovo(true)} />}
          {aba === "financeiro" && <PortalFinanceiro studentId={sidAlvo} podeAgir={podeAgir} />}
          {aba === "biblioteca" && <PortalBiblioteca podeAgir={podeAgir} />}
          {aba === "biometria" && (podeAgir ? <MinhaBiometria /> : <Alert severity="info">O cadastro facial é feito pelo próprio aluno logado ou na secretaria (Presença e acesso → Biometria).</Alert>)}
          {aba === "mensagens" && <PortalMensagens studentId={sidAlvo} podeAgir={podeAgir} onMudou={reload} />}
          {aba === "documentos" && <Card title="Declarações e certificados" accent={cor}>{podeAgir ? <MeusDocumentos /> : <Alert severity="info">Documentos pessoais ficam disponíveis apenas para o próprio aluno.</Alert>}</Card>}
          {aba === "carteirinha" && <PortalCarteirinha studentId={sidAlvo} podeAgir={podeAgir} />}
          {aba === "privacidade" && <PortalPrivacidade podeAgir={podeAgir} />}
          {aba === "avaliacao" && <PortalAvaliacaoDocente podeAgir={podeAgir} />}
        </Box>
      )}
      {!p && !loading && !error && <Typography color="text.secondary">Sem dados do portal.</Typography>}
      <NovoRequerimento open={novo} onClose={() => setNovo(false)} onDone={() => { setNovo(false); setToast({ t: "success", m: "Requerimento enviado." }); reload(); }} />
      <RevisaoDialog alvo={rev} onClose={() => setRev(null)} onDone={() => { setRev(null); setToast({ t: "success", m: "Pedido de revisão enviado ao professor." }); reload(); }} />
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)}>{toast ? <Alert severity={toast.t} onClose={() => setToast(null)}>{toast.m}</Alert> : undefined}</Snackbar>
    </EduShell>
  );
}
