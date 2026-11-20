import { Box, Chip, Divider, Grid, Link as MuiLink, Paper, Typography } from "@mui/material";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import WorkspacePremiumOutlinedIcon from "@mui/icons-material/WorkspacePremiumOutlined";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";
import GavelOutlinedIcon from "@mui/icons-material/GavelOutlined";
import EduShell from "../../edu/EduShell";

/** Cartão de selo/certificado com a imagem do resultado oficial e o link para conferir. */
function SeloCard({ titulo, nota, img, link, descricao }: { titulo: string; nota: string; img: string; link: string; descricao: string }) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
      <Box component="img" src={img} alt={titulo} sx={{ width: "100%", display: "block", borderBottom: "1px solid", borderColor: "divider" }} />
      <Box sx={{ p: 2, flexGrow: 1, display: "flex", flexDirection: "column", gap: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
          <Typography sx={{ fontWeight: 800 }}>{titulo}</Typography>
          <Chip label={nota} color="success" size="small" sx={{ fontWeight: 800 }} />
        </Box>
        <Typography variant="body2" color="text.secondary">{descricao}</Typography>
        <MuiLink href={link} target="_blank" rel="noopener" sx={{ fontSize: 13, fontWeight: 700 }}>Conferir o teste original ↗</MuiLink>
      </Box>
    </Paper>
  );
}

function PessoaCard({ nome, cargo, icon, itens }: { nome: string; cargo: string; icon: React.ReactNode; itens: string[] }) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, p: 2.5, height: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
        <Box sx={{ width: 42, height: 42, borderRadius: "50%", bgcolor: "primary.main", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {icon}
        </Box>
        <Box>
          <Typography sx={{ fontWeight: 800, lineHeight: 1.2 }}>{nome}</Typography>
          <Typography variant="body2" color="text.secondary">{cargo}</Typography>
        </Box>
      </Box>
      <Box component="ul" sx={{ m: 0, pl: 2.5, display: "flex", flexDirection: "column", gap: 0.6 }}>
        {itens.map((t, i) => <Typography key={i} component="li" variant="body2">{t}</Typography>)}
      </Box>
    </Paper>
  );
}

/**
 * Segurança e Certificações (Configurações / Admin / TI): reúne as provas técnicas de segurança do EduMaster Pro
 * (testes de terceiros, sem autoavaliação) e a qualificação de quem constrói e mantém o sistema.
 */
export default function EduSegurancaCertificacoes() {
  return (
    <EduShell
      title="Segurança e Certificações"
      subtitle="Provas técnicas de segurança do EduMaster Pro, aplicadas por laboratórios independentes, e a qualificação de quem constrói e mantém o sistema."
    >
      <Paper variant="outlined" sx={{ borderRadius: 3, p: 2.5, mb: 3, display: "flex", gap: 1.5, alignItems: "flex-start" }}>
        <VerifiedUserOutlinedIcon color="success" />
        <Typography variant="body2" color="text.secondary">
          Os selos abaixo são de testes feitos por ferramentas independentes (Qualys SSL Labs e Security Headers / Snyk), direto no endereço público do
          EduMaster Pro. Eles avaliam a criptografia do tráfego e os cabeçalhos de segurança do navegador — não substituem um teste de invasão completo,
          que está em andamento conforme o cronograma de implantação.
        </Typography>
      </Paper>

      <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>Testes de segurança (terceiros independentes)</Typography>
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SeloCard
            titulo="SSL Labs — Certificado e criptografia"
            nota="Nota A"
            img="/security/certificacoes/securityheaders-nota.png"
            link="https://www.ssllabs.com/ssltest/analyze.html?d=web-production-5398c.up.railway.app"
            descricao="TLS 1.2/1.3, sigilo direto (Forward Secrecy) e nenhuma das falhas clássicas (Heartbleed, POODLE, ROBOT)."
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SeloCard
            titulo="Security Headers (Snyk) — Cabeçalhos HTTP"
            nota="Nota A+"
            img="/security/certificacoes/securityheaders-1.png"
            link="https://securityheaders.com/?q=https%3A%2F%2Fweb-production-5398c.up.railway.app%2F"
            descricao="Content-Security-Policy, Permissions-Policy, HSTS, X-Frame-Options e X-Content-Type-Options, todos presentes."
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SeloCard
            titulo="Cabeçalhos — detalhe técnico"
            nota="Conferido"
            img="/security/certificacoes/securityheaders-2.png"
            link="https://securityheaders.com/?q=https%3A%2F%2Fweb-production-5398c.up.railway.app%2F"
            descricao="Política de permissões do navegador: câmera liberada só para o próprio sistema (login facial); microfone, localização e pagamento desligados."
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SeloCard
            titulo="Certificado — cadeia de confiança"
            nota="Válido"
            img="/security/certificacoes/securityheaders-3.png"
            link="https://www.ssllabs.com/ssltest/analyze.html?d=web-production-5398c.up.railway.app"
            descricao="Emitido por autoridade reconhecida (Let's Encrypt), sem problema de cadeia, aceito por todos os navegadores."
          />
        </Grid>
      </Grid>

      <Divider sx={{ mb: 3 }} />

      <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>Quem constrói e mantém o EduMaster Pro</Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <PessoaCard
            nome="Prof. Me. Robson Ravel de Oliveira"
            cargo="CEO — WMundi® Technologies"
            icon={<SchoolOutlinedIcon />}
            itens={[
              "Mestre e doutorando.",
              "Aluno do Marketing Entrepreneurship Program — Harvard.",
              "Desenvolvedor certificado Apple e Google.",
              "Idealizador e executor do sistema MaxDonto, no mercado desde 2001 (25 anos) sem perder dados, travar ou apresentar falhas.",
            ]}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <PessoaCard
            nome="Mauro Lemos Júnior"
            cargo="Desenvolvedor Sênior"
            icon={<CodeOutlinedIcon />}
            itens={[
              "Desenvolvedor sênior desde 2006.",
              "Trabalhos executados no Grupo Zacarias Veículos.",
              "Trabalhos executados na Emoreda Saúde Software.",
            ]}
          />
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />

      <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>Jurídico WMundi</Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <PessoaCard
            nome="Dra. Roberta Peralto de Oliveira"
            cargo="Advogada — Jurídico WMundi"
            icon={<GavelOutlinedIcon />}
            itens={["Responsável pelo acompanhamento jurídico e de conformidade (LGPD) do EduMaster Pro."]}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <PessoaCard
            nome="Dr. Gabriel Peralto de Oliveira"
            cargo="Advogado — Jurídico WMundi"
            icon={<GavelOutlinedIcon />}
            itens={["Responsável pelo acompanhamento jurídico e de conformidade (LGPD) do EduMaster Pro."]}
          />
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ borderRadius: 3, p: 2.5, mt: 3, display: "flex", gap: 1.5, alignItems: "flex-start" }}>
        <WorkspacePremiumOutlinedIcon color="primary" />
        <Typography variant="body2" color="text.secondary">
          Informações de qualificação profissional e trajetória, fornecidas pela própria equipe. Os selos de segurança acima são verificáveis
          diretamente nos links indicados, a qualquer momento.
        </Typography>
      </Paper>
    </EduShell>
  );
}
