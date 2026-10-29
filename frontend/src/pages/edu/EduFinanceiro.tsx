import { Box, Paper, Tab, Tabs } from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import PaymentsIcon from "@mui/icons-material/Payments";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import DescriptionIcon from "@mui/icons-material/Description";
import ReceiptIcon from "@mui/icons-material/Receipt";
import HandshakeIcon from "@mui/icons-material/Handshake";
import SendIcon from "@mui/icons-material/Send";
import { useSearchParams } from "react-router-dom";
import type { ReactElement, ReactNode } from "react";
import EduShell from "../../edu/EduShell";
import PainelTes from "../../edu/tesouraria/PainelTes";
import ReceberTab from "../../edu/tesouraria/ReceberTab";
import PagarTab from "../../edu/tesouraria/PagarTab";
import FilaTab from "../../edu/tesouraria/FilaTab";
import BancosTab from "../../edu/tesouraria/BancosTab";
import NotasTab from "../../edu/tesouraria/NotasTab";
import RecibosTab from "../../edu/tesouraria/RecibosTab";
import PermutasBolsasTab from "../../edu/tesouraria/PermutasBolsasTab";
import RemessasTab from "../../edu/tesouraria/RemessasTab";

const SECOES = ["painel", "receber", "pagar", "fila", "bancos", "notas", "recibos", "permutas", "remessas"] as const;
// atalhos usados pelos alertas do painel
const ALIAS: Record<string, string> = { bolsas: "permutas" };

/** Financeiro Edu (Tesouraria): contas a receber/pagar, fila de conferência e autorização, bancos, notas, recibos, permutas e remessas. */
export default function EduFinanceiro() {
  const [params, setParams] = useSearchParams();
  const atual = ALIAS[params.get("secao") || ""] || params.get("secao") || "painel";
  const idx = Math.max(0, SECOES.indexOf(atual as (typeof SECOES)[number]));
  const ir = (s: string) => setParams({ secao: ALIAS[s] || s }, { replace: false });

  const TABS: Array<{ key: string; label: string; icon: ReactElement; render: () => ReactNode }> = [
    { key: "painel", label: "Painel", icon: <DashboardIcon />, render: () => <PainelTes onGo={ir} /> },
    { key: "receber", label: "Contas a receber", icon: <PaymentsIcon />, render: () => <ReceberTab /> },
    { key: "pagar", label: "Contas a pagar", icon: <ReceiptLongIcon />, render: () => <PagarTab /> },
    { key: "fila", label: "Conferência e autorização", icon: <FactCheckIcon />, render: () => <FilaTab /> },
    { key: "bancos", label: "Bancos e conciliação", icon: <AccountBalanceIcon />, render: () => <BancosTab /> },
    { key: "notas", label: "Notas fiscais", icon: <DescriptionIcon />, render: () => <NotasTab /> },
    { key: "recibos", label: "Recibos", icon: <ReceiptIcon />, render: () => <RecibosTab /> },
    { key: "permutas", label: "Permutas e bolsas", icon: <HandshakeIcon />, render: () => <PermutasBolsasTab /> },
    { key: "remessas", label: "Remessas", icon: <SendIcon />, render: () => <RemessasTab /> },
  ];
  return (
    <EduShell title="Financeiro" subtitle="Tesouraria da instituição: recebimentos, contas a pagar com conferência e autorização, bancos, notas fiscais, recibos, permutas e remessas.">
      <Paper variant="outlined" sx={{ borderRadius: 4, mb: 2 }}>
        <Tabs value={idx} onChange={(_, v) => ir(SECOES[v])} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
          {TABS.map((t) => <Tab key={t.key} label={t.label} icon={t.icon} iconPosition="start" sx={{ textTransform: "none", fontWeight: 700, minHeight: 56 }} />)}
        </Tabs>
      </Paper>
      <Box sx={{ minWidth: 0 }}>{TABS[idx].render()}</Box>
    </EduShell>
  );
}
