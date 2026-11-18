import { Tab, Tabs } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import EduShell from "../../edu/EduShell";
import { BrigadaTab, CalendarioTab, CatTab, InstrucoesTab, MembrosTab, PainelCipa, TelefonesTab } from "../../edu/operacao/CipaTabs";

export const CIPA_SECOES = [
  { id: "painel", label: "Painel" }, { id: "cat", label: "Registro de CAT" }, { id: "instrucoes", label: "Urgência e emergência" }, { id: "membros", label: "Membros da CIPA" },
  { id: "brigada", label: "Brigada de incêndio" }, { id: "calendario", label: "Calendário" }, { id: "telefones", label: "Números de emergência" },
] as const;

export default function EduCipa() {
  const [p, setP] = useSearchParams();
  const atual = CIPA_SECOES.some((s) => s.id === p.get("secao")) ? (p.get("secao") as string) : "painel";
  const ir = (id: string) => setP({ secao: id });
  const corpo: Record<string, JSX.Element> = { painel: <PainelCipa ir={ir} />, cat: <CatTab />, instrucoes: <InstrucoesTab />, membros: <MembrosTab />, brigada: <BrigadaTab />, calendario: <CalendarioTab />, telefones: <TelefonesTab /> };
  return (
    <EduShell title="CIPA e segurança do trabalho" subtitle="Membros, brigada, treinamentos, instruções de emergência e registro de CAT com aviso e confirmação de providência.">
      <Tabs value={atual} onChange={(_, v) => ir(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        {CIPA_SECOES.map((s) => <Tab key={s.id} value={s.id} label={s.label} />)}
      </Tabs>
      {corpo[atual]}
    </EduShell>
  );
}
