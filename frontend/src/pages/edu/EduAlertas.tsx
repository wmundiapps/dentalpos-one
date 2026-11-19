import { Alert, Accordion, AccordionDetails, AccordionSummary, Box, Button, Chip, List, ListItemButton, ListItemText, Paper, Stack, Table, TableBody, TableCell, TableRow, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { useNavigate, useSearchParams } from "react-router-dom";
import EduShell from "../../edu/EduShell";
import { Section, StateBox, useLoad } from "../../edu/admissoes/common";

const dt = (v: any) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");

function Detalhe({ chave }: { chave: string }) {
  const navigate = useNavigate();
  const { data: a, loading, error } = useLoad<any>(`/alertas/detalhe?chave=${encodeURIComponent(chave)}`);
  return (
    <EduShell title={a?.titulo ?? "Alerta crítico"} subtitle={a ? `${a.departamento} · ${a.resumo}` : "Detalhes do alerta"}>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/edu/alertas")} sx={{ mb: 2 }}>Todos os alertas</Button>
      <StateBox loading={loading} error={error} empty={!a} emptyText="Este alerta já foi resolvido ou não existe mais.">
        {a && (
          <Stack spacing={2.5}>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
              <Chip color="error" label="CRÍTICO" /><Chip variant="outlined" label={a.departamento} />{a.desde && <Chip variant="outlined" label={`Referência: ${dt(a.desde)}`} />}
            </Stack>
            <Section title="O problema"><Typography sx={{ fontSize: 17 }}>{a.problema}</Typography></Section>
            <Section title="Por que isso importa"><Typography>{a.impacto}</Typography></Section>
            {a.detalhes?.length > 0 && (
              <Section title="Dados do alerta">
                <Table size="small"><TableBody>{a.detalhes.map((d: any) => (<TableRow key={d.rotulo}><TableCell sx={{ fontWeight: 700, width: "30%" }}>{d.rotulo}</TableCell><TableCell>{d.valor}</TableCell></TableRow>))}</TableBody></Table>
              </Section>
            )}
            <Section title="O que fazer para resolver" actions={<Button variant="contained" endIcon={<ArrowForwardIcon />} onClick={() => navigate(a.rota)}>{a.rotaRotulo}</Button>}>
              <Stack spacing={1.2}>
                {a.oQueFazer.map((p: string, i: number) => (
                  <Paper key={i} variant="outlined" sx={{ p: 1.5, display: "flex", gap: 1.5, alignItems: "flex-start" }}>
                    <Box sx={{ minWidth: 28, height: 28, borderRadius: "50%", bgcolor: "primary.main", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>{i + 1}</Box>
                    <Typography sx={{ pt: .2 }}>{p}</Typography>
                  </Paper>
                ))}
              </Stack>
            </Section>
            <Section title="Instruções de trabalho e POPs relacionados" description="O procedimento padrão da instituição para este tipo de problema.">
              {a.documentos?.length ? a.documentos.map((d: any) => (
                <Accordion key={d.id} variant="outlined" disableGutters>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography sx={{ fontWeight: 700 }}>{d.titulo}</Typography></AccordionSummary>
                  <AccordionDetails><Typography sx={{ whiteSpace: "pre-line" }}>{d.conteudo || d.descricao || "Abra o material pelo link."}</Typography>{d.url && d.url !== "#" && <Button href={d.url} target="_blank" sx={{ mt: 1 }}>Abrir material</Button>}</AccordionDetails>
                </Accordion>
              )) : <Alert severity="info" action={<Button color="inherit" size="small" onClick={() => navigate("/edu/colaborador?aba=gestao")}>Cadastrar POP</Button>}>Ainda não há POP ou instrução de trabalho cadastrada para este problema. O RH pode publicar um em Portal do colaborador &gt; Biblioteca.</Alert>}
            </Section>
          </Stack>
        )}
      </StateBox>
    </EduShell>
  );
}

function Lista() {
  const navigate = useNavigate();
  const { data, loading, error } = useLoad<any[]>("/alertas");
  const por = new Map<string, any[]>();
  (data ?? []).forEach((a) => por.set(a.departamento, [...(por.get(a.departamento) ?? []), a]));
  return (
    <EduShell title="Alertas críticos" subtitle="O que precisa de atenção agora, por departamento. Abra um alerta para ver o problema e o que fazer.">
      <StateBox loading={loading} error={error} empty={!!data && !data.length} emptyText="Nenhum alerta crítico. Todos os departamentos estão em dia.">
        {[...por.entries()].map(([dep, itens]) => (
          <Section key={dep} title={dep} description={`${itens.length} alerta(s)`}>
            <List disablePadding>
              {itens.map((a) => (
                <ListItemButton key={a.chave} onClick={() => navigate(`/edu/alertas/ver?chave=${encodeURIComponent(a.chave)}`)} sx={{ borderRadius: 2 }}>
                  <ListItemText primary={a.titulo} secondary={a.resumo} slotProps={{ primary: { sx: { fontWeight: 700 } } }} />
                  <ArrowForwardIcon color="action" />
                </ListItemButton>
              ))}
            </List>
          </Section>
        ))}
      </StateBox>
    </EduShell>
  );
}

export default function EduAlertas({ detalhe = false }: { detalhe?: boolean }) {
  const [p] = useSearchParams();
  const chave = p.get("chave");
  return detalhe && chave ? <Detalhe chave={chave} /> : <Lista />;
}
