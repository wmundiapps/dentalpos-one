import { Alert, Box, Container, Link, Paper, Typography } from "@mui/material";
import { useEffect, useState, type ReactNode } from "react";
import { instituicaoRef, pub } from "./publicApi";

export interface DadosInstituicao {
  instituicao: { nome: string; nomeFantasia?: string | null; cnpj?: string | null; email?: string | null; telefone?: string | null; endereco?: string | null; cidade?: string | null; uf?: string | null; site?: string | null };
  encarregado: null | { nome: string; email: string; telefone?: string | null; cargo?: string | null; horarioAtendimento?: string | null; endereco?: string | null; canalUrl?: string | null; empresa?: string | null };
  aviso?: string | null;
  prazoRespostaDias: number;
}

export function useInstituicao(caminho: "/dpo" | "/politica" = "/dpo") {
  const [dados, setDados] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    pub<any>("GET", caminho).then((d) => vivo && setDados(d)).catch((e) => vivo && setErro(e?.message || "Não foi possível carregar os dados da instituição."));
    return () => { vivo = false; };
  }, [caminho]);
  return { dados: dados as (DadosInstituicao & Record<string, any>) | null, erro };
}

const q = () => (instituicaoRef() ? `?i=${encodeURIComponent(instituicaoRef()!)}` : "");

/** Moldura das páginas públicas de privacidade (sem login). */
export default function PublicShell({ titulo, subtitulo, children, instituicao }: { titulo: string; subtitulo?: string; children: ReactNode; instituicao?: string }) {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", py: { xs: 2, md: 5 } }}>
      <Container maxWidth="md">
        <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 4 }}>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>{instituicao || "Privacidade e proteção de dados"}</Typography>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>{titulo}</Typography>
          {subtitulo && <Typography color="text.secondary" sx={{ mb: 2 }}>{subtitulo}</Typography>}
          <Alert severity="warning" sx={{ mb: 3 }}>
            <b>Texto-modelo.</b> Este conteúdo é um modelo e deve ser revisado e validado por advogado antes de ser adotado pela instituição.
          </Alert>
          {children}
          <Box sx={{ mt: 4, pt: 2, borderTop: 1, borderColor: "divider", display: "flex", gap: 2, flexWrap: "wrap" }}>
            <Link href={`/privacidade${q()}`}>Política de Privacidade</Link>
            <Link href={`/termos${q()}`}>Termos de Uso</Link>
            <Link href={`/portal-titular${q()}`}>Portal do Titular</Link>
            <Link component="button" type="button" onClick={() => window.dispatchEvent(new Event("dentalpos:abrir-cookies"))}>Preferências de cookies</Link>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}

export const H = ({ children }: { children: ReactNode }) => <Typography variant="h6" sx={{ fontWeight: 800, mt: 3, mb: 1 }}>{children}</Typography>;
export const P = ({ children }: { children: ReactNode }) => <Typography variant="body1" sx={{ mb: 1.5, lineHeight: 1.7 }}>{children}</Typography>;
