import { Alert, Box, Tab, Tabs } from "@mui/material";
import type { ReactElement } from "react";
import { useSearchParams } from "react-router-dom";
import { Shell } from "../../edu/contabil/carteira/host";
import { FaixaLegal, cargo, ehContador, ehFinanceiro } from "../../edu/contabil/carteira/kit";
import PainelTab from "../../edu/contabil/carteira/PainelTab";
import ClientesTab from "../../edu/contabil/carteira/ClientesTab";
import FunilTab from "../../edu/contabil/carteira/FunilTab";
import HonorariosTab from "../../edu/contabil/carteira/HonorariosTab";
import TarefasTab from "../../edu/contabil/carteira/TarefasTab";
import CarteiraTab from "../../edu/contabil/carteira/CarteiraTab";
import ComunicacaoTab from "../../edu/contabil/carteira/ComunicacaoTab";
import RelatoriosTab from "../../edu/contabil/carteira/RelatoriosTab";
import AdminTab from "../../edu/contabil/carteira/AdminTab";

export const CARTEIRA_ABAS = [
  { id: "painel", label: "Painel" }, { id: "clientes", label: "Clientes" }, { id: "funil", label: "Funil comercial" }, { id: "honorarios", label: "Honorários" },
  { id: "tarefas", label: "Tarefas e rotinas" }, { id: "carteira", label: "Carteira e equipe" }, { id: "comunicacao", label: "Comunicação" }, { id: "relatorios", label: "Relatórios" }, { id: "config", label: "Escritório e LGPD" },
] as const;

/** Contabilidade > Carteira de clientes (banco de clientes do escritório). Links: ?aba=clientes&cliente=<id>, ?aba=funil&v=propostas, etc. */
export default function EduCarteira() {
  const [params, setParams] = useSearchParams();
  const papel = cargo();
  // abas por cargo (o servidor é a fonte da verdade e bloqueia o resto)
  const visiveis = CARTEIRA_ABAS.filter((a) => (a.id === "funil" ? ehContador() : a.id === "honorarios" ? ehFinanceiro() || papel === "CONTADOR" : true));
  const atual = visiveis.some((s) => s.id === params.get("aba")) ? (params.get("aba") as string) : "painel";
  const ir = (id: string, extra: Record<string, string> = {}) => setParams({ aba: id, ...extra });
  const corpo: Record<string, ReactElement> = {
    painel: <PainelTab onGo={ir} />, clientes: <ClientesTab />, funil: <FunilTab />, honorarios: <HonorariosTab />, tarefas: <TarefasTab />, carteira: <CarteiraTab />,
    comunicacao: <ComunicacaoTab />, relatorios: <RelatoriosTab />, config: <AdminTab />,
  };
  return (
    <Shell title="Carteira de clientes" subtitle="Banco de clientes, funil comercial, honorários, rotinas e portal do cliente do escritório de contabilidade." hero={false}>
      <Alert severity="info" sx={{ mb: 2 }}>Assinatura de contratos, envio de e-mail/WhatsApp e integração com o módulo fiscal são <b>SIMULADOS</b> nesta versão (há interface de provedor para integração real).</Alert>
      <Box sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        <Tabs value={atual} onChange={(_, v) => ir(v)} variant="scrollable" scrollButtons="auto">
          {visiveis.map((s) => <Tab key={s.id} value={s.id} label={s.label} />)}
        </Tabs>
      </Box>
      {corpo[atual]}
      <FaixaLegal />
    </Shell>
  );
}
