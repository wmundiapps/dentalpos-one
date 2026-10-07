import { useEffect, useState } from "react";
import { Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import PaymentsIcon from "@mui/icons-material/Payments";
import NewChargeDialog from "./NewChargeDialog";
import { loadBackendPatients, type BackendPatient } from "../../services/PatientApi";
import { errorMessage, toast } from "../../utils/toast";

// Botão "Gerar financeiro": abre uma busca pelo nome do paciente e, ao escolher, cai direto na janela de gerar a cobrança
// (boleto, Pix, cartão, cheque pré-datado ou dinheiro). Usado em Pacientes e em Contas a Receber.
export default function GerarFinanceiroButton({ onDone, label = "Gerar financeiro (buscar paciente)", size = "medium" }: { onDone?: () => void; label?: string; size?: "small" | "medium" | "large" }) {
  const [searching, setSearching] = useState(false);
  const [patients, setPatients] = useState<BackendPatient[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<BackendPatient | null>(null);

  useEffect(() => {
    if (!searching || patients.length) return;
    setLoading(true);
    loadBackendPatients()
      .then((rows) => setPatients(rows.sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR"))))
      .catch((e) => toast.error(errorMessage(e, "Não foi possível carregar os pacientes.")))
      .finally(() => setLoading(false));
  }, [searching, patients.length]);

  return (
    <>
      <Button variant="contained" color="success" size={size} startIcon={<PaymentsIcon />} onClick={() => setSearching(true)}>{label}</Button>
      <Dialog open={searching} onClose={() => setSearching(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>Gerar financeiro: de quem é?</DialogTitle>
        <DialogContent sx={{ pt: "12px!important" }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Digite o nome do paciente, o telefone ou o CPF e escolha na lista. Em seguida você escolhe boleto, Pix, cartão, cheque pré-datado ou dinheiro.</Typography>
          <Autocomplete
            autoFocus
            options={patients}
            loading={loading}
            loadingText="Carregando pacientes..."
            noOptionsText="Nenhum paciente encontrado"
            getOptionLabel={(p) => p.fullName}
            filterOptions={(opts, state) => {
              const q = state.inputValue.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
              const digits = q.replace(/\D/g, "");
              if (!q) return opts.slice(0, 50);
              return opts.filter((p) => p.fullName.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(q) || (digits.length >= 3 && ((p.phone || "").replace(/\D/g, "").includes(digits) || (p.cpf || "").replace(/\D/g, "").includes(digits)))).slice(0, 50);
            }}
            renderOption={(props, p) => <li {...props} key={p.id}>{p.fullName}{p.phone ? <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>{p.phone}</Typography> : null}</li>}
            onChange={(_, p) => { if (p) { setSearching(false); setPicked(p); } }}
            renderInput={(params) => <TextField {...params} autoFocus label="Nome do paciente" />}
          />
        </DialogContent>
        <DialogActions><Button onClick={() => setSearching(false)}>Cancelar</Button></DialogActions>
      </Dialog>
      {picked && <NewChargeDialog patient={picked} open onClose={() => setPicked(null)} onDone={() => onDone?.()} />}
    </>
  );
}
