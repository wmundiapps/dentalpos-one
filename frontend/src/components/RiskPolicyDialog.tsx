import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Typography } from "@mui/material";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";

export const RISK_YELLOW = "#fbc02d";

const STEPS = [
  "Advertência verbal",
  "Advertência formal (por escrito)",
  "Segunda advertência (por escrito)",
  "Suspensão por 1 dia",
  "Suspensão por 3 dias",
  "Suspensão por 1 semana",
  "Notificação ao gestor por insubordinação e encaminhamento ao RH para resolver",
];

const LAWS = [
  ["CLT, art. 2º", "O empregador dirige a prestação do serviço. É a base do poder de direção e de organização da clínica."],
  ["CLT, art. 3º", "O empregado trabalha com subordinação, isto é, segue as ordens e os prazos definidos pela clínica."],
  ["CLT, art. 482, alíneas \"e\" e \"h\"", "Desídia no desempenho das funções e ato de indisciplina ou de insubordinação são motivos de justa causa."],
  ["CLT, art. 474", "A suspensão por mais de 30 dias consecutivos equivale à rescisão injusta. Por isso as suspensões aqui são curtas (1 dia, 3 dias e 1 semana)."],
  ["Jurisprudência do TST", "A lei não traz uma tabela de punições. O poder disciplinar decorre dos artigos acima, e os tribunais exigem gradação (da mais leve para a mais grave), proporcionalidade, punição logo após o fato e uma só punição por falta."],
];

export default function RiskPolicyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.2, fontWeight: 900 }}>
        <ReportProblemIcon sx={{ color: RISK_YELLOW, fontSize: 38 }} />
        Você está em risco
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ fontWeight: 800, mb: 1 }}>As pendências têm prazo de 24 horas para serem resolvidas.</Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>Se continuarem sem resolução, a clínica poderá aplicar, nesta ordem:</Typography>
        <Box component="ol" sx={{ m: 0, pl: 3, mb: 2 }}>
          {STEPS.map((s) => <Typography component="li" key={s} variant="body2" sx={{ mb: 0.4 }}>{s}</Typography>)}
        </Box>
        <Divider sx={{ my: 1.5 }} />
        <Typography sx={{ fontWeight: 800, mb: 1 }}>Base legal (empregados CLT)</Typography>
        <Box sx={{ display: "grid", gap: 1 }}>
          {LAWS.map(([t, d]) => (
            <Box key={t}>
              <Typography variant="body2" sx={{ fontWeight: 800 }}>{t}</Typography>
              <Typography variant="body2" color="text.secondary">{d}</Typography>
            </Box>
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
          Esta tela é informativa. A aplicação de qualquer penalidade é decisão do gestor, deve seguir o regulamento interno da clínica e ser registrada por escrito. Para estagiários e prestadores autônomos vale o contrato firmado. Em caso de dúvida, consulte um advogado trabalhista.
        </Typography>
      </DialogContent>
      <DialogActions><Button variant="contained" onClick={onClose}>Entendi, vou resolver</Button></DialogActions>
    </Dialog>
  );
}
