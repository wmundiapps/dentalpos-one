import { Box, FormControlLabel, Switch, Typography } from "@mui/material";
import { Section, cp, useCp, useToast } from "./kit";

const ITENS: Array<{ id: "estagios" | "clinicas" | "agro" | "animal"; titulo: string; texto: string }> = [
  { id: "estagios", titulo: "Estágios, vagas e convênios", texto: "O aluno vê as vagas, os campos e os convênios para se candidatar." },
  { id: "clinicas", titulo: "Clínicas-escola (escalas e unidades)", texto: "O aluno vê unidades, consultórios e ocupação da agenda." },
  { id: "agro", titulo: "Agronomia", texto: "O aluno vê áreas, talhões, culturas e aulas práticas." },
  { id: "animal", titulo: "Núcleo animal", texto: "O aluno vê animais, baias, propriedades e vacinas pendentes." },
];

/** Chaves de liga/desliga do coordenador: define o que o aluno pode ver em Campos de prática (a API aplica a regra de verdade). */
export default function VisibilidadeAluno() {
  const v = useCp<Record<string, boolean>>("/visibilidade-aluno");
  const { toast, node } = useToast();
  async function alternar(id: string, valor: boolean) {
    if (!v.data) return;
    try {
      await cp("PUT", "/visibilidade-aluno", { ...v.data, [id]: valor });
      v.reload();
      toast({ type: "success", text: valor ? "Liberado para os alunos." : "Oculto para os alunos." });
    } catch (e: any) {
      toast({ type: "error", text: e?.message || "Não foi possível salvar." });
    }
  }
  return (
    <>
      {node}
      <Section title="O que o aluno pode ver">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Ligue ou desligue cada área. A mudança vale na hora para todos os alunos.</Typography>
        <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
          {ITENS.map((i) => (
            <Box key={i.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
              <FormControlLabel
                control={<Switch checked={Boolean(v.data?.[i.id])} disabled={!v.data} onChange={(_, c) => alternar(i.id, c)} />}
                label={<Typography sx={{ fontWeight: 800 }}>{i.titulo}</Typography>}
              />
              <Typography variant="body2" color="text.secondary" sx={{ ml: 6 }}>{i.texto}</Typography>
            </Box>
          ))}
        </Box>
      </Section>
    </>
  );
}
