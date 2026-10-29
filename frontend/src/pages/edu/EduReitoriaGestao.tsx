import type { ReactElement } from "react";
import EduShell from "../../edu/EduShell";
import AgendaView from "../../edu/reitoria/exec/AgendaView";
import ComparativoView from "../../edu/reitoria/exec/ComparativoView";
import ConveniosView from "../../edu/reitoria/exec/ConveniosView";
import DouView from "../../edu/reitoria/exec/DouView";
import NiveisView from "../../edu/reitoria/exec/NiveisView";
import PaineisView from "../../edu/reitoria/exec/PaineisView";
import PessoasView from "../../edu/reitoria/exec/PessoasView";

export type SecaoReitoria = "agenda" | "dou" | "paineis" | "convenios" | "pessoas" | "niveis" | "comparativo";

const SECOES: Record<SecaoReitoria, { titulo: string; subtitulo: string; ver: () => ReactElement }> = {
  agenda: { titulo: "Agenda da Reitoria", subtitulo: "Compromissos, reuniões, audiências, prazos regulatórios e jurídicos, aniversários e efemérides em um só lugar.", ver: () => <AgendaView /> },
  dou: { titulo: "Diário Oficial e assuntos regulatórios", subtitulo: "Publicações do DOU (MEC, INEP, CNE) que dizem respeito à instituição: classificação, prazo, responsável e vínculo com o Regulatório.", ver: () => <DouView /> },
  paineis: { titulo: "Painéis executivos", subtitulo: "Finanças, infraestrutura, implantação de cursos, investimentos por disciplina, CIPA, provas, professores, vestibular e publicações.", ver: () => <PaineisView ids={["financeiro", "infraestrutura", "implantacao", "investimentos", "cipa", "professores", "provas", "vestibular", "publicacoes"]} /> },
  convenios: { titulo: "Acordos e convênios", subtitulo: "Cadastro executivo com vigência, alertas de vencimento, aditivos e integração com o Jurídico.", ver: () => <ConveniosView /> },
  pessoas: { titulo: "Pessoas — avaliação de funcionários", subtitulo: "Resultados agregados por setor, integrados ao módulo de RH.", ver: () => <PessoasView /> },
  niveis: { titulo: "Graduação e pós-graduação", subtitulo: "Matrículas, evasão, conclusão e produção por nível (graduação, lato e stricto sensu).", ver: () => <NiveisView /> },
  comparativo: { titulo: "Comparativo com outras instituições", subtitulo: "CPC, CC, IGC, ENADE, mensalidade, cursos e alunos das IES concorrentes e de referência.", ver: () => <ComparativoView /> },
};

export default function EduReitoriaGestao({ secao }: { secao: SecaoReitoria }) {
  const s = SECOES[secao];
  return <EduShell title={s.titulo} subtitle={s.subtitulo}>{s.ver()}</EduShell>;
}
