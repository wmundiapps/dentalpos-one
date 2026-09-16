import { useState } from "react";
import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import PageHeader from "../components/PageHeader";

const categories = [
  "Busca por região e especialidade",
  "Base de empresas verificada",
  "Redes sociais e campanhas autorizadas",
  "Arquivo próprio (CSV/JSON)",
] as const;

const RESPONSIBILITY_TEXT =
  "Declaro que sou o(a) responsável exclusivo(a) pelo uso ético, legal e em conformidade com a LGPD dos contatos extraídos através desta ferramenta. O DentalPos One atua apenas como intermediário técnico; toda comunicação enviada a esses contatos (finalidade, consentimento, opt-out e demais obrigações legais) é de responsabilidade única e exclusiva da minha clínica.";

export default function LeadDiscovery() {
  const [category, setCategory] = useState<string>(categories[0]);
  const [accepted, setAccepted] = useState(false);
  const [prepared, setPrepared] = useState(false);

  return (
    <Box>
      <PageHeader title="REVAH Leads" description="Captação de leads com origem, consentimento, rastreabilidade e entrada no CRM." />
      <Alert severity="info" sx={{ mb: 2 }}>
        Recurso contratado à parte, sujeito a contrato específico de uso e responsabilidade. A extração real depende da liberação comercial deste módulo para a sua clínica.
      </Alert>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.2fr .8fr" }, gap: 2 }}>
        <Paper elevation={0} sx={{ p: 3, border: "1px solid", borderColor: "divider", borderRadius: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 900 }}>Nova captação</Typography>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <TextField select label="Categoria" value={category} onChange={(event) => { setCategory(event.target.value); setPrepared(false); }}>
              {categories.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
            </TextField>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              <TextField label="Cidade / região" />
              <TextField label="Segmento / especialidade" />
              <TextField label="Palavra-chave" />
              <TextField label="Limite de resultados" type="number" defaultValue={100} />
            </Box>
            <TextField label="Referência da campanha / arquivo" />
            <TextField label="Observação para a equipe" multiline minRows={2} />

            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "action.hover" }}>
              <FormControlLabel
                control={<Checkbox checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />}
                label={<Typography variant="body2">{RESPONSIBILITY_TEXT}</Typography>}
              />
            </Paper>

            <Button variant="contained" disabled={!accepted} onClick={() => setPrepared(true)}>
              Solicitar captação
            </Button>
            {prepared && (
              <Alert severity="success">
                Solicitação registrada para {category}. Nossa equipe entrará em contato para confirmar o contrato e liberar a extração.
              </Alert>
            )}
          </Stack>
        </Paper>
        <Paper elevation={0} sx={{ p: 3, border: "1px solid", borderColor: "divider", borderRadius: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 900 }}>Fluxo do lead</Typography>
          <Stack direction="row" sx={{ mt: 2, flexWrap: "wrap", gap: 1 }}>
            {["Captação", "REVAH Leads", "CRM", "Qualificação", "Automação", "Atendimento humano", "Conversão"].map((step) => <Chip key={step} label={step} />)}
          </Stack>
          <Typography color="text.secondary" sx={{ mt: 2 }}>Cada lead conserva data de entrada, responsável, etapa, histórico de contatos e regras de opt-out antes de qualquer campanha.</Typography>
        </Paper>
      </Box>
    </Box>
  );
}
