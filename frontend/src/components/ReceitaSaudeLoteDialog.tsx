import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from "@mui/material";
import { FiscalApi, type RsExport, type RsPending, type RsProfessional } from "../services/FiscalApi";

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dia = (v?: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "-");

function baixar(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=us-ascii" }));
  const a = document.createElement("a");
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ReceitaSaudeLoteDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [pros, setPros] = useState<RsProfessional[]>([]);
  const [itens, setItens] = useState<RsPending[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [registro, setRegistro] = useState("");
  const [ano, setAno] = useState<number | "">("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState<RsExport | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(""); setResultado(null); setBusy(true);
    Promise.all([FiscalApi.rsProfessionals(), FiscalApi.rsPending()])
      .then(([p, i]) => {
        setPros(p); setItens(i);
        setDoctorId((d) => d || (p.length === 1 ? p[0].id : ""));
        const anos = [...new Set(i.map((x) => x.year).filter((y): y is number => y !== null))].sort();
        const a = anos[anos.length - 1] ?? "";
        setAno(a);
        setMarcados(new Set(i.filter((x) => x.year === a && !x.problem && !x.exported).map((x) => x.id)));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar."))
      .finally(() => setBusy(false));
  }, [open]);

  const anos = useMemo(() => [...new Set(itens.map((x) => x.year).filter((y): y is number => y !== null))].sort(), [itens]);
  const visiveis = itens.filter((x) => x.year === ano);
  const pro = pros.find((p) => p.id === doctorId);
  const total = visiveis.filter((x) => marcados.has(x.id)).reduce((s, x) => s + x.amount, 0);

  const trocarAno = (a: number) => { setAno(a); setMarcados(new Set(itens.filter((x) => x.year === a && !x.problem && !x.exported).map((x) => x.id))); };
  const alternar = (id: string) => setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const gerar = async () => {
    setBusy(true); setError("");
    try {
      const ids = visiveis.filter((x) => marcados.has(x.id)).map((x) => x.id);
      const r = await FiscalApi.rsExport({ doctorId, ids, professionalRegistry: registro });
      baixar(r.filename, r.csv);
      setResultado(r);
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao gerar o arquivo."); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={() => { if (!busy) onClose(); }} fullWidth maxWidth="md">
      <DialogTitle>{"Receita Saúde em lote"}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
        {resultado ? (
          <>
            <Alert severity="success">{`Arquivo ${resultado.filename} baixado com ${resultado.incluidos} recibo(s).`}</Alert>
            {resultado.ignorados.length > 0 && (
              <Alert severity="warning">
                <Typography sx={{ fontWeight: 700 }}>{"Ficaram de fora:"}</Typography>
                {resultado.ignorados.map((i) => <Typography key={i.id} variant="body2">{`${i.payerName}: ${i.motivo}`}</Typography>)}
              </Alert>
            )}
            <Typography sx={{ fontWeight: 800 }}>{"Como importar"}</Typography>
            <Typography variant="body2">{"1. Entre no e-CAC com o gov.br do profissional e abra o Carnê-Leão."}</Typography>
            <Typography variant="body2">{"2. Menu Escrituração > Importar Escrituração e escolha o arquivo."}</Typography>
            <Typography variant="body2">{"3. Clique em Analisar Arquivo; se houver erro, corrija aqui e gere de novo."}</Typography>
            <Typography variant="body2">{"4. Clique em Importar. Baixe a relação de recibos e registre o número de cada um aqui, em Resolver pendência."}</Typography>
          </>
        ) : (
          <>
            <Alert severity="info">{"Gera o arquivo oficial para emitir vários recibos de uma vez no Carnê-Leão Web. Entram os pagamentos com tipo Receita Saúde aguardando emissão."}</Alert>
            {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr 1fr" }, gap: 2 }}>
              <TextField select label={"Profissional (quem importa no Carnê-Leão)"} value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                {pros.map((p) => <MenuItem key={p.id} value={p.id}>{`${p.name}${p.cro ? ` • CRO ${p.cro}` : ""}`}</MenuItem>)}
              </TextField>
              <TextField select label="Ano dos pagamentos" value={ano} onChange={(e) => trocarAno(Number(e.target.value))}>
                {anos.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
              </TextField>
              <TextField label="Registro profissional (opcional)" value={registro} onChange={(e) => setRegistro(e.target.value.slice(0, 15))} helperText={"Só se tiver mais de um registro ativo"} />
            </Box>
            {pro && !pro.cpfOk && <Alert severity="error">{"O CPF deste profissional não está cadastrado ou é inválido. Cadastre o mesmo CPF usado no Carnê-Leão em Profissionais."}</Alert>}
            {!busy && itens.length === 0 && <Typography color="text.secondary">{"Nenhum pagamento aguardando Receita Saúde. Abra o documento e mude o tipo para Receita Saúde."}</Typography>}
            {visiveis.length > 0 && (
              <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, maxHeight: 360, overflow: "auto" }}>
                {visiveis.map((x) => (
                  <Box key={x.id} sx={{ display: "flex", alignItems: "center", gap: 1, px: 1, py: 0.5, borderBottom: "1px solid", borderColor: "divider", opacity: x.problem ? 0.6 : 1 }}>
                    <Checkbox size="small" checked={marcados.has(x.id)} disabled={Boolean(x.problem)} onChange={() => alternar(x.id)} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700 }} noWrap>{x.payerName}</Typography>
                      <Typography variant="body2" color={x.problem ? "error.main" : "text.secondary"} noWrap>{x.problem || `${dia(x.paymentDate)} • ${x.description || "Pagamento"}`}</Typography>
                    </Box>
                    {x.exported && <Chip size="small" color="warning" label={"Já gerado"} />}
                    <Typography sx={{ fontWeight: 800, width: 110, textAlign: "right" }}>{money(x.amount)}</Typography>
                  </Box>
                ))}
              </Box>
            )}
            {visiveis.some((x) => x.exported) && <Typography variant="body2" color="text.secondary">{"\"Já gerado\" entrou em arquivo anterior. Só marque de novo se aquele arquivo não foi importado, para não duplicar recibos."}</Typography>}
            <Typography sx={{ fontWeight: 800 }}>{`${marcados.size} selecionado(s) • ${money(total)}`}</Typography>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={onClose}>{resultado ? "Fechar" : "Cancelar"}</Button>
        {!resultado && <Button variant="contained" disabled={busy || !doctorId || !pro?.cpfOk || marcados.size === 0} onClick={() => void gerar()}>{"Gerar arquivo"}</Button>}
      </DialogActions>
    </Dialog>
  );
}
