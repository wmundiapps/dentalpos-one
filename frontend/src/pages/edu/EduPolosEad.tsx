import { Tab, Tabs } from "@mui/material";
import { useState } from "react";
import EduShell from "../../edu/EduShell";
import PolosTab from "../../edu/modalidades/PolosTab";
import MapaPolos from "../../edu/modalidades/polos/MapaPolos";
import OfertasAuto from "../../edu/modalidades/polos/OfertasAuto";
import PoloDetalhe from "../../edu/modalidades/polos/PoloDetalhe";
import RedePolos from "../../edu/modalidades/polos/RedePolos";
import { usePolos } from "../../edu/modalidades/kit";

/** Polos EAD: rede, mapa por cidade, painel de cada polo, cadastro e ofertas automáticas de segunda graduação/pós. */
export default function EduPolosEad() {
  const [tab, setTab] = useState(0);
  const polos = usePolos();
  const [poloId, setPoloId] = useState("");
  const atual = poloId || polos[0]?.value || "";
  const abrir = (id: string) => { setPoloId(id); setTab(2); };
  return (
    <EduShell title="Polos EAD" subtitle="Rede de polos de educação semipresencial/EAD: alunos, cobrança, provas presenciais, rematrícula, ENADE, egressos e ofertas automáticas — separados por polo.">
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        <Tab label="Rede de polos" /><Tab label="Mapa e cidades" /><Tab label="Painel do polo" /><Tab label="Cadastro e cursos" /><Tab label="Ofertas automáticas" />
      </Tabs>
      {tab === 0 && <RedePolos onAbrirPolo={abrir} />}
      {tab === 1 && <MapaPolos onAbrirPolo={abrir} />}
      {tab === 2 && (atual ? <PoloDetalhe poloId={atual} onTrocar={setPoloId} /> : <p>Cadastre um polo para ver o painel.</p>)}
      {tab === 3 && <PolosTab />}
      {tab === 4 && <OfertasAuto />}
    </EduShell>
  );
}
