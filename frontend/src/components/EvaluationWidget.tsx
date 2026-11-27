import { Box } from "@mui/material";
import HelpChat from "./HelpChat";

// Só o assistente de ajuda fica flutuante. A avaliação e as sugestões foram para a "caixinha de sugestões" (rodapé e cabeçalho),
// para não ficar um botão em cima da tela do sistema.
export default function EvaluationWidget() {
  return (
    <Box sx={{ position: "fixed", right: { xs: 16, md: 24 }, bottom: { xs: 16, md: 24 }, zIndex: 1300, "@media print": { display: "none" } }}>
      <HelpChat onOpen={() => undefined} />
    </Box>
  );
}
