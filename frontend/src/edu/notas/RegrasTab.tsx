import { Alert, Box, Button } from "@mui/material";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import EduResourcePage from "../EduResourcePage";
import { fmtNum, useLoad } from "../secretaria/util";

const opt = (a: string[]) => a;

export default function RegrasTab() {
  const [ver, setVer] = useState(0);
  const [msg, setMsg] = useState<{ t: "success" | "error"; m: string } | null>(null);
  const cursos = useLoad<any[]>("/academico/programs");
  const progOpts = (cursos.data || []).map((p: any) => ({ value: p.id, label: p.nome }));
  async function bootstrap() {
    if (!window.confirm("Criar as regras de avaliação padrão para IES (graduação, EAD, pós, saúde)? Regras já existentes não são duplicadas.")) return;
    try { const r: any = await eduApi.post("/notas/bootstrap", {}); setMsg({ t: "success", m: `${r.criadas?.length ?? 0} regra(s) criada(s); ${r.jaExistiam?.length ?? 0} já existiam.` }); setVer((v) => v + 1); } catch (e: any) { setMsg({ t: "error", m: e.message }); }
  }
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {msg && <Alert severity={msg.t} onClose={() => setMsg(null)}>{msg.m}</Alert>}
      <Box><Button variant="outlined" onClick={bootstrap}>Criar regras padrão para IES</Button></Box>
      <EduResourcePage key={ver} title="Regras de avaliação" base="/notas" resource="/regras" dense
        description="Resolução: turma > curso > padrão da instituição. A regra define média, recuperação, exame, frequência e o modelo de componentes (P1, P2, trabalhos…)."
        columns={[{ key: "nome", label: "Regra" }, { key: "escopo", label: "Escopo" }, { key: "padrao", label: "Padrão" }, { key: "regraMedia", label: "Média" },
          { key: "mediaAprovacao", label: "Aprovação", render: (r) => fmtNum(r.mediaAprovacao) }, { key: "frequenciaMinima", label: "Freq. mín. %" }, { key: "recuperacao", label: "Recuperação" }, { key: "exame", label: "Exame" },
          { key: "comp", label: "Componentes", render: (r) => (Array.isArray(r.componentes) ? r.componentes.map((c: any) => c.codigo).join(" · ") : "—") }, { key: "ativo", label: "Ativa" }]}
        fields={[
          { key: "nome", label: "Nome", required: true },
          { key: "escopo", label: "Escopo", type: "select", options: opt(["TENANT", "CURSO", "TURMA"]) },
          { key: "programId", label: "Curso (escopo CURSO)", type: "select", options: progOpts },
          { key: "classSectionId", label: "ID da turma (escopo TURMA)" },
          { key: "padrao", label: "Regra padrão da instituição", type: "bool" },
          { key: "regraMedia", label: "Cálculo da média", type: "select", options: ["ARITMETICA", "PONDERADA"] },
          { key: "notaMaxima", label: "Nota máxima", type: "number" }, { key: "mediaAprovacao", label: "Média de aprovação", type: "number" }, { key: "mediaMinimaRecuperacao", label: "Média mínima p/ recuperação", type: "number" },
          { key: "recuperacao", label: "Recuperação", type: "select", options: ["NENHUMA", "SUBSTITUI_MENOR", "SUBSTITUI_MEDIA", "MEDIA_COM_PARCIAL"] },
          { key: "exame", label: "Exame final", type: "select", options: ["NENHUM", "MEDIA_PONDERADA", "SUBSTITUI"] },
          { key: "pesoParcial", label: "Peso da média parcial (0–1)", type: "number" }, { key: "pesoExame", label: "Peso do exame (0–1)", type: "number", helper: "Parcial + exame = 1" },
          { key: "mediaAprovacaoExame", label: "Média de aprovação após exame", type: "number" }, { key: "frequenciaMinima", label: "Frequência mínima (%)", type: "number" },
          { key: "abonaJustificadas", label: "Abona faltas justificadas", type: "bool" },
          { key: "arredondamento", label: "Arredondamento", type: "select", options: ["NENHUM", "UM_DECIMAL", "MEIO_PONTO", "INTEIRO"] },
          { key: "diasRevisao", label: "Prazo p/ revisão de nota (dias)", type: "number" }, { key: "ativo", label: "Ativa", type: "bool" },
        ]}
        filters={[{ key: "escopo", label: "Escopo", options: ["TENANT", "CURSO", "TURMA"] }]} />
    </Box>
  );
}
