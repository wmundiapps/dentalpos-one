import { Box, Button, Chip, Typography } from "@mui/material";
import { qsOf } from "../../services/EduApi";
import { Empty, Feedback, Progress, fmtNum, useLoad } from "../secretaria/util";

type Resumo = { series: number; media: number | null; tentativas: number; tacas: number; ouro: number; prata: number; bronze: number };
type Dados = Resumo & { disciplinas: Array<Resumo & { nome: string }> };

/** Resumo do jogo da memória (ENADE · ENAMED · OAB) no portal do aluno: séries concluídas, média e medalhas por disciplina. */
export default function PortalMemoria({ studentId, onAbrir }: { studentId: string | null; onAbrir: () => void }) {
  const { data, loading, error, reload } = useLoad<Dados>(`/exames/memoria/meu${qsOf({ studentId })}`);
  return (
    <Box>
      <Feedback loading={loading} error={error} onRetry={reload} />
      {data && (data.series === 0 ? (
        <Empty>Nenhuma série jogada ainda. Treine para o ENADE, o ENAMED ou a OAB e o seu progresso aparece aqui.</Empty>
      ) : (
        <Box sx={{ display: "grid", gap: 1.5 }}>
          <Box sx={{ display: "flex", gap: 2, alignItems: "baseline", flexWrap: "wrap" }}>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>{fmtNum(data.media, 1)}</Typography>
            <Typography color="text.secondary">média em {data.series} série(s) · {data.tentativas} tentativa(s)</Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
            {data.tacas > 0 && <Chip size="small" color="warning" label={`${data.tacas} taça(s) de ouro`} />}
            {data.ouro > 0 && <Chip size="small" variant="outlined" label={`${data.ouro} ouro`} />}
            {data.prata > 0 && <Chip size="small" variant="outlined" label={`${data.prata} prata`} />}
            {data.bronze > 0 && <Chip size="small" variant="outlined" label={`${data.bronze} bronze`} />}
          </Box>
          {data.disciplinas.map((d) => (
            <Box key={d.nome}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{d.nome}</Typography>
                <Typography variant="caption" color="text.secondary">{d.series} série(s) · média {fmtNum(d.media, 1)}</Typography>
              </Box>
              <Progress value={(d.media ?? 0) * 10} color={(d.media ?? 0) >= 7 ? "success" : (d.media ?? 0) >= 5 ? "warning" : "error"} />
            </Box>
          ))}
        </Box>
      ))}
      <Button size="small" sx={{ mt: 1.5 }} variant="outlined" onClick={onAbrir}>Jogar agora</Button>
    </Box>
  );
}
