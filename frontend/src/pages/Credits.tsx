import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Paper, TextField, Typography } from "@mui/material";
import PageHeader from "../components/PageHeader";
import { buyPackage, listPackages, type CreditPackage, type PurchaseResult } from "../services/CreditsApi";

const NOMES: Record<string, string> = { IA: "Intelig\u00eancia artificial", SMS: "SMS", VOZ: "Liga\u00e7\u00f5es" };

export default function Credits() {
  const tipo = new URLSearchParams(window.location.search).get("tipo") || undefined;
  const [pacotes, setPacotes] = useState<CreditPackage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState<PurchaseResult | null>(null);

  useEffect(() => { listPackages(tipo).then(setPacotes).catch((e) => setError(e.message)); }, [tipo]);

  const comprar = async (id: string, metodo: string) => {
    setBusy(true); setError(""); setResultado(null);
    try { setResultado(await buyPackage(id, metodo)); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao gerar a cobran\u00e7a."); }
    finally { setBusy(false); }
  };

  return (
    <Box>
      <PageHeader title={"Pacotes de cr\u00e9dito"} description={"Cr\u00e9ditos para intelig\u00eancia artificial, SMS e liga\u00e7\u00f5es. O saldo entra assim que o pagamento \u00e9 confirmado."} />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {resultado && (
        <Alert severity="success" sx={{ mb: 2 }}>
          <Typography sx={{ fontWeight: 700, mb: 1 }}>{"Cobran\u00e7a gerada. Os cr\u00e9ditos entram automaticamente ap\u00f3s o pagamento."}</Typography>
          {resultado.invoiceUrl && <Button size="small" variant="contained" href={resultado.invoiceUrl} target="_blank" rel="noopener">{"Abrir cobran\u00e7a"}</Button>}
          {resultado.pixCopyPaste && (
            <Box sx={{ mt: 2 }}>
              <TextField fullWidth size="small" label={"Pix copia e cola"} value={resultado.pixCopyPaste} slotProps={{ input: { readOnly: true } }} />
              <Button size="small" sx={{ mt: 1 }} onClick={() => navigator.clipboard.writeText(resultado.pixCopyPaste || "")}>{"Copiar c\u00f3digo Pix"}</Button>
            </Box>
          )}
        </Alert>
      )}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" }, gap: 2 }}>
        {pacotes.map((p) => (
          <Paper key={p.id} variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
            <Chip size="small" label={NOMES[p.kind] || p.kind} sx={{ mb: 1 }} />
            <Typography sx={{ fontWeight: 800 }}>{p.name}</Typography>
            <Typography variant="h5" sx={{ my: 1 }}>{p.priceAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Button size="small" variant="contained" disabled={busy} onClick={() => void comprar(p.id, "PIX")}>Pix</Button>
              <Button size="small" variant="outlined" disabled={busy} onClick={() => void comprar(p.id, "BOLETO")}>Boleto</Button>
              <Button size="small" variant="outlined" disabled={busy} onClick={() => void comprar(p.id, "CARTAO")}>{"Cart\u00e3o"}</Button>
            </Box>
          </Paper>
        ))}
      </Box>
    </Box>
  );
}