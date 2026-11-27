import { Box, Button, Card, CardActionArea, CardContent, Typography } from "@mui/material";
import { useState } from "react";
import { Async, Panel, Tabela, brl, fmtDate, num, useApi, useToast } from "./host";
import { abrirHtml, baixar } from "./kit";

const P = "/contabil/carteira";
const fmt = (v: any, t?: string) => (v === null || v === undefined || v === "" ? "—" : t === "moeda" ? brl(v) : t === "pct" ? `${num(v, 1)}%` : t === "data" ? fmtDate(v) : t === "numero" ? num(v, 1).replace(/,0$/, "") : String(v));

function Resultado({ chave, nome }: { chave: string; nome: string }) {
  const st = useApi<any>(`${P}/relatorios/${chave}`);
  const toast = useToast();
  return (
    <Panel title={nome} subtitle={st.data?.subtitulo} actions={<Box sx={{ display: "flex", gap: 1 }}><Button size="small" onClick={() => toast.run(() => abrirHtml(`/relatorios/${chave}?format=html`), "Aberto para impressão.")}>Imprimir</Button><Button size="small" onClick={() => toast.run(() => baixar(`/relatorios/${chave}?format=csv`, `${chave}.csv`), "CSV gerado.")}>Exportar CSV</Button></Box>} sx={{ mt: 2 }}>
      <Async state={st}>{(r) => <>
        <Tabela rows={r.linhas.map((l: any, i: number) => ({ ...l, id: String(i) }))} vazio="Sem dados para este relatório." cols={r.colunas.map((c: any) => ({ h: c.label, r: (l: any) => fmt(l[c.key], c.tipo) }))} />
        {r.totais ? <Typography variant="body2" sx={{ mt: 1, fontWeight: 700 }}>Totais: {Object.entries(r.totais).map(([k, v]) => `${r.colunas.find((c: any) => c.key === k)?.label ?? k}: ${fmt(v, r.colunas.find((c: any) => c.key === k)?.tipo)}`).join(" · ")}</Typography> : null}
      </>}</Async>
      {toast.node}
    </Panel>
  );
}

export default function RelatoriosTab() {
  const lista = useApi<any>(`${P}/relatorios`);
  const [sel, setSel] = useState<{ chave: string; nome: string } | null>(null);
  return (
    <>
      <Async state={lista}>{(d) => (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(4, 1fr)" }, gap: 1.5 }}>
          {d.items.map((r: any) => (
            <Card key={r.chave} variant="outlined" sx={{ borderColor: sel?.chave === r.chave ? "primary.main" : undefined, borderWidth: sel?.chave === r.chave ? 2 : 1 }}>
              <CardActionArea onClick={() => setSel({ chave: r.chave, nome: r.nome })} sx={{ height: "100%" }}><CardContent><Typography sx={{ fontWeight: 800 }}>{r.nome}</Typography><Typography variant="caption" color="text.secondary">{r.descricao}</Typography></CardContent></CardActionArea>
            </Card>
          ))}
        </Box>
      )}</Async>
      {sel ? <Resultado key={sel.chave} chave={sel.chave} nome={sel.nome} /> : <Typography color="text.secondary" sx={{ mt: 3, textAlign: "center" }}>Escolha um relatório acima. Todos podem ser impressos ou exportados em CSV.</Typography>}
    </>
  );
}
