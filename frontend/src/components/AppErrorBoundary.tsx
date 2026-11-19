import { Component, type ErrorInfo, type ReactNode } from "react";
import { Box, Button, Typography } from "@mui/material";

const KEY = "completodonto.chunkReloadAt";
const isChunkError = (e: unknown) => {
  const m = String((e as { message?: string })?.message || e || "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unexpected token '<'|ChunkLoadError|Loading chunk/i.test(m);
};
// Depois de uma atualização do sistema, o navegador pode ter a versão antiga da página aberta e não achar mais o arquivo da tela nova.
// Recarrega sozinho (uma vez por minuto, no máximo) para pegar a versão atual.
export function reloadOnceForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { /* sem sessionStorage: recarrega mesmo assim */ }
  window.location.reload();
  return true;
}

export default class AppErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null; key?: string }> {
  state: { error: Error | null; key?: string } = { error: null, key: this.props.resetKey };
  static getDerivedStateFromError(error: Error) { return { error }; }
  static getDerivedStateFromProps(props: { resetKey?: string }, state: { error: Error | null; key?: string }) {
    // Trocou de tela: tenta de novo.
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erro de tela:", error, info.componentStack);
    if (isChunkError(error)) reloadOnceForNewVersion();
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Box sx={{ p: 4, maxWidth: 560, mx: "auto", textAlign: "center" }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>Não foi possível abrir esta tela</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {isChunkError(this.state.error) ? "O sistema foi atualizado. Recarregue a página para continuar." : "Ocorreu um erro ao carregar. Tente de novo; se continuar, recarregue a página."}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, justifyContent: "center" }}>
          <Button variant="outlined" onClick={() => this.setState({ error: null })}>Tentar de novo</Button>
          <Button variant="contained" onClick={() => window.location.reload()}>Recarregar a página</Button>
        </Box>
      </Box>
    );
  }
}
