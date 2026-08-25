import { useMemo, useState } from "react";
import { Alert, Box, Button, Chip, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import PageHeader from "../components/PageHeader";

const sources = [
  ["GOOGLE_PLACES", "Google Places / Maps API"],
  ["RECEITA_FEDERAL", "Receita Federal / base CNPJ licenciada"],
  ["META_LEADS", "Meta Lead Ads (API oficial)"],
  ["LINKEDIN_AUTHORIZED", "LinkedIn (API/exportação autorizada)"],
  ["INSTAGRAM_AUTHORIZED", "Instagram (API/exportação autorizada)"],
  ["PHANTOMBUSTER_ALLOWED", "PhantomBuster (somente fluxos permitidos)"],
  ["CSV", "Arquivo CSV"],
  ["JSON", "Arquivo JSON"],
] as const;

export default function LeadDiscovery() {
  const [source, setSource] = useState("GOOGLE_PLACES");
  const [prepared, setPrepared] = useState(false);
  const helper = useMemo(() => sources.find(([value]) => value === source)?.[1], [source]);
  return (
    <Box>
      <PageHeader title="REVAH Leads" description="Captação multicanal de leads com origem, consentimento, rastreabilidade e entrada no CRM." />
      <Alert severity="info" sx={{ mb: 2 }}>As integrações externas permanecem em modo preparado até a clínica informar credenciais válidas e a fonte permitir o uso pretendido. Sem scraping frágil ou bypass de plataforma.</Alert>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.2fr .8fr" }, gap: 2 }}>
        <Paper elevation={0} sx={{ p: 3, border: "1px solid", borderColor: "divider", borderRadius: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 900 }}>Nova captação</Typography>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <TextField select label="Fonte" value={source} onChange={(event) => { setSource(event.target.value); setPrepared(false); }}>
              {sources.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
            </TextField>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              <TextField label="Cidade / região" />
              <TextField label="Segmento / CNAE / especialidade" />
              <TextField label="Palavra-chave" />
              <TextField label="Limite de resultados" type="number" defaultValue={100} />
            </Box>
            <TextField label="Referência da origem / campanha / arquivo" />
            <TextField label="Base legal / observação LGPD" multiline minRows={2} />
            <Button variant="contained" onClick={() => setPrepared(true)}>Preparar captação</Button>
            {prepared && <Alert severity="success">Captação preparada para {helper}. A execução real depende do conector e credenciais da fonte.</Alert>}
          </Stack>
        </Paper>
        <Paper elevation={0} sx={{ p: 3, border: "1px solid", borderColor: "divider", borderRadius: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 900 }}>Fluxo do lead</Typography>
          <Stack direction="row" sx={{ mt: 2, flexWrap: "wrap", gap: 1 }}>
            {["Fonte", "REVAH Leads", "CRM", "Qualificação", "Automação", "Atendimento humano", "Conversão"].map((step) => <Chip key={step} label={step} />)}
          </Stack>
          <Typography color="text.secondary" sx={{ mt: 2 }}>Cada lead deve conservar fonte, data de entrada, responsável, etapa, histórico de contatos e regras de opt-out antes de qualquer campanha.</Typography>
        </Paper>
      </Box>
    </Box>
  );
}
