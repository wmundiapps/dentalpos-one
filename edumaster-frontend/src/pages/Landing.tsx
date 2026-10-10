import { Box, Button, Chip, Paper, Typography } from "@mui/material";
import SchoolIcon from "@mui/icons-material/School";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { appRootUrl, demoSalesUrl } from "../services/DemoAccess";

const MODULOS = [
  ["Acadêmico", "Cursos, matriz curricular, turmas, matrícula, frequência e equivalência de disciplinas."],
  ["Provas com IA", "Geração de questões, correção objetiva instantânea e dissertativa por IA com rubrica."],
  ["Conteúdo e Biblioteca", "Aulas gravadas, PDFs, flashcards com repetição espaçada e resumo 80/20 por IA."],
  ["Desempenho e Reforço", "Painel por aluno, risco acadêmico e planos de reforço individualizados."],
  ["Protocolo e Certificados", "Solicitação de documentos e emissão de certificados com verificação pública."],
  ["Facilities", "Patrimônio, manutenção, estacionamento, reserva de salas e alertas de vencimento."],
  ["Suprimentos", "Estoque, compras e vendas (cantina, materiais, uniformes)."],
  ["Governança e Regulatório", "Comissões CPA/CIPA/NDE, metas do PDI e triagem de atos do MEC por IA."],
  ["Captação e Ingresso", "Processo seletivo, inscrição pública e conversão em matrícula."],
  ["Pesquisa e Extensão", "Projetos, agências e editais de fomento."],
  ["Jurídico", "Demandas administrativas, conciliação, audiências e prazos."],
  ["Financeiro", "Mensalidade automática, contabilidade e DRE — motor já maduro, não um protótipo."],
];

export default function Landing() {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Box
        sx={{
          background: "radial-gradient(circle at 15% 15%, rgba(21,101,192,.24), transparent 35%), linear-gradient(135deg,#07111f,#102a43 55%,#0b5fff)",
          color: "#fff",
          px: 3,
          py: { xs: 6, md: 10 },
        }}
      >
        <Box sx={{ maxWidth: 960, mx: "auto", textAlign: "center" }}>
          <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1, mb: 2 }}>
            <SchoolIcon fontSize="large" />
            <Typography variant="overline" sx={{ fontWeight: 900, letterSpacing: 2 }}>EDUMASTER PRO</Typography>
          </Box>
          <Typography variant="h3" sx={{ fontWeight: 950, mb: 2, lineHeight: 1.15 }}>
            Gestão acadêmica de ponta a ponta, do jardim de infância à pós-graduação stricto sensu
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 400, opacity: 0.85, mb: 4 }}>
            Um só sistema para secretaria, financeiro, provas com IA, biblioteca, captação, jurídico e governança —
            sem planilha paralela, sem sistema picotado por departamento.
          </Typography>
          <Box sx={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap" }}>
            <Button
              size="large"
              variant="contained"
              color="primary"
              sx={{ px: 4, fontWeight: 800 }}
              onClick={() => { window.location.href = demoSalesUrl(); }}
            >
              Falar com vendas
            </Button>
            <Button
              size="large"
              variant="outlined"
              sx={{ px: 4, fontWeight: 800, color: "#fff", borderColor: "rgba(255,255,255,.5)" }}
              onClick={() => { window.location.href = appRootUrl(); }}
            >
              Já sou cliente — Entrar
            </Button>
          </Box>
        </Box>
      </Box>

      <Box sx={{ maxWidth: 1100, mx: "auto", px: 3, py: { xs: 6, md: 8 } }}>
        <Typography variant="h4" sx={{ fontWeight: 900, textAlign: "center", mb: 1 }}>
          Tudo o que uma instituição de ensino superior precisa
        </Typography>
        <Typography color="text.secondary" sx={{ textAlign: "center", mb: 5, maxWidth: 640, mx: "auto" }}>
          12 módulos integrados, testados ponta a ponta — não é uma lista de recursos planejados, é o que já roda.
        </Typography>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr" }, gap: 2.5 }}>
          {MODULOS.map(([title, desc]) => (
            <Paper key={title} variant="outlined" sx={{ p: 3, borderRadius: 3, height: "100%" }}>
              <Typography sx={{ fontWeight: 800, mb: 1 }}>{title}</Typography>
              <Typography variant="body2" color="text.secondary">{desc}</Typography>
            </Paper>
          ))}
        </Box>
      </Box>

      <Box sx={{ bgcolor: "background.paper", borderTop: "1px solid", borderColor: "divider", py: { xs: 6, md: 8 } }}>
        <Box sx={{ maxWidth: 760, mx: "auto", px: 3, textAlign: "center" }}>
          <Typography variant="h4" sx={{ fontWeight: 900, mb: 3 }}>Por que trocar de sistema</Typography>
          <Box sx={{ display: "grid", gap: 1.5, textAlign: "left", maxWidth: 520, mx: "auto" }}>
            {[
              "Um sistema só — não um por departamento que não conversa entre si",
              "IA embutida em provas, biblioteca e triagem regulatória — não um complemento pago à parte",
              "Financeiro de verdade: mensalidade automática, contabilidade e DRE prontos no primeiro dia",
              "Verificação pública de certificado — qualquer um confere a autenticidade sem precisar logar",
            ].map((item) => (
              <Box key={item} sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
                <CheckCircleIcon color="success" fontSize="small" sx={{ mt: 0.3 }} />
                <Typography>{item}</Typography>
              </Box>
            ))}
          </Box>
          <Button
            size="large"
            variant="contained"
            sx={{ mt: 4, px: 4, fontWeight: 800 }}
            onClick={() => { window.location.href = demoSalesUrl(); }}
          >
            Solicitar demonstração
          </Button>
        </Box>
      </Box>

      <Box sx={{ py: 4, textAlign: "center" }}>
        <Chip label="versão 1.0 — em desenvolvimento ativo" size="small" variant="outlined" />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          © 2026 EduMaster Pro · WMundi Apps ·{" "}
          <Box component="a" href="/termos" sx={{ color: "inherit" }}>Termos de Uso</Box>
          {" · "}
          <Box component="a" href="/privacidade" sx={{ color: "inherit" }}>Privacidade</Box>
        </Typography>
      </Box>
    </Box>
  );
}
