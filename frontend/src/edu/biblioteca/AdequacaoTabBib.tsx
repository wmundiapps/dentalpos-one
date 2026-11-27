import { Box } from "@mui/material";
import { useState } from "react";
import { SubNav } from "../infraestrutura/kit";
import AdequacaoBib from "./AdequacaoBib";
import SugestoesPanel from "./SugestoesPanel";

export default function AdequacaoTabBib() {
  const [sub, setSub] = useState("adequacao");
  return (
    <Box>
      <SubNav value={sub} onChange={setSub} items={[{ key: "adequacao", label: "Adequação da bibliografia" }, { key: "sugestoes", label: "Sugestões de aquisição" }]} />
      {sub === "adequacao" ? <AdequacaoBib /> : <SugestoesPanel />}
    </Box>
  );
}
