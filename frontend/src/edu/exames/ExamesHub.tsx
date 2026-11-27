// Central "ENADE · ENAMED · OAB": telas do aluno (trilha, simulados, flashcards, desempenho) e do coordenador/docente.
import { Alert, Box, Tab, Tabs } from "@mui/material";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LoadBox } from "../desempenho/kit";
import BancoDocente from "./BancoDocente";
import Coordenacao from "./Coordenacao";
import SimuladoAluno from "./SimuladoAluno";
import { DesempenhoAluno, FlashcardsAluno, RankingAluno, SugestoesAluno, TrilhaAluno } from "./EstudoAluno";
import { ehAluno, ehDocente, useVisao } from "./comum";

const ABAS_ALUNO: Array<[string, string]> = [["trilha", "Minha trilha"], ["estudar", "O que estudar"], ["simulados", "Simulados"], ["flashcards", "Flashcards"], ["desempenho", "Meu desempenho"], ["ranking", "Ranking e privacidade"]];
const ABAS_DOCENTE: Array<[string, string]> = [["coordenacao", "Painel do coordenador"], ["banco", "Banco, gerador e simulados"]];

export default function ExamesHub({ embutido }: { embutido?: boolean }) {
  const aluno = ehAluno();
  const abas = aluno ? ABAS_ALUNO : ehDocente() ? ABAS_DOCENTE : ABAS_ALUNO;
  const [params, setParams] = useSearchParams();
  const sub = params.get(embutido ? "exame" : "aba") || abas[0][0];
  const aba = abas.some(([k]) => k === sub) ? sub : abas[0][0];
  const ir = (k: string) => setParams((p) => { const n = new URLSearchParams(p); n.set(embutido ? "exame" : "aba", k); return n; }, { replace: true });
  const v = useVisao();
  const [exameId, setExameId] = useState("");
  useEffect(() => {
    if (!exameId && v.exames.length) setExameId((v.exames.find((e) => e.questoes > 0) ?? v.exames[0]).id);
  }, [v.exames, exameId]);

  return (
    <Box>
      <LoadBox loading={v.loading && !v.exames.length} error={v.error} onRetry={v.reload}>
        {!v.exames.length && !v.loading ? (
          <Alert severity="info">Nenhum exame configurado. A coordenação deve abrir "Banco, gerador e simulados" ou rodar o cadastro padrão de exames (ENADE, ENAMED, OAB).</Alert>
        ) : (
          <>
            <Tabs value={aba} onChange={(_, k) => ir(k)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }} aria-label="Seções de preparação para exames">
              {abas.map(([k, l]) => <Tab key={k} value={k} label={l} />)}
            </Tabs>
            {aba === "trilha" && <TrilhaAluno exames={v.exames} exameId={exameId} setExameId={setExameId} irParaSimulados={() => ir("simulados")} />}
            {aba === "estudar" && <SugestoesAluno exames={v.exames} exameId={exameId} setExameId={setExameId} />}
            {aba === "simulados" && <SimuladoAluno exames={v.exames} exameId={exameId} setExameId={setExameId} />}
            {aba === "flashcards" && <FlashcardsAluno exames={v.exames} exameId={exameId} setExameId={setExameId} />}
            {aba === "desempenho" && <DesempenhoAluno exames={v.exames} exameId={exameId} setExameId={setExameId} />}
            {aba === "ranking" && <RankingAluno exames={v.exames} exameId={exameId} setExameId={setExameId} />}
            {aba === "coordenacao" && <Coordenacao exames={v.exames} />}
            {aba === "banco" && <BancoDocente exames={v.exames} config={v.config} recarregar={v.reload} />}
          </>
        )}
      </LoadBox>
    </Box>
  );
}
