import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Paper, Switch, Tab, Tabs, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { loadBackendDoctors, type BackendDoctor } from "../services/AppointmentApi";
import { createTeamMember, loadTeamMembers, removeTeamMember, TEAM_ROLE_LABELS, updateTeamMember, type TeamMember, type TeamRole } from "../services/TeamApi";

const TABS: Array<TeamRole | "DENTISTA"> = ["DENTISTA", "ASB", "TSB", "LAB_PROTESE"];
const TAB_LABELS: Record<string, string> = { DENTISTA: "Dentistas", ASB: "ASB", TSB: "TSB", LAB_PROTESE: "Laboratório de prótese" };
const EMPTY = { fullName: "", phone: "", email: "", registryNumber: "", companyName: "", notes: "", showInAgenda: true };

export default function Team() {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [doctors, setDoctors] = useState<BackendDoctor[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, d] = await Promise.all([loadTeamMembers(), loadBackendDoctors().catch(() => [] as BackendDoctor[])]);
      setMembers(m);
      setDoctors(d);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar a equipe.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const current = TABS[tab];
  const role = current === "DENTISTA" ? null : current;
  const rows = role ? members.filter((m) => m.role === role) : [];

  const openNew = () => { setEditId(null); setForm(EMPTY); setError(""); setOpen(true); };
  const openEdit = (m: TeamMember) => {
    setEditId(m.id);
    setForm({ fullName: m.fullName, phone: m.phone || "", email: m.email || "", registryNumber: m.registryNumber || "", companyName: m.companyName || "", notes: m.notes || "", showInAgenda: m.showInAgenda });
    setError("");
    setOpen(true);
  };

  const save = async () => {
    if (!role) return;
    setBusy(true);
    setError("");
    try {
      if (editId) await updateTeamMember(editId, { ...form, role });
      else await createTeamMember({ ...form, role });
      setOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: TeamMember) => {
    if (!window.confirm(`Inativar ${m.fullName}? Os agendamentos antigos são preservados.`)) return;
    try { await removeTeamMember(m.id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível inativar."); }
  };

  const isLab = role === "LAB_PROTESE";

  return (
    <Box>
      <PageHeader title="Equipe" description="Cadastre dentistas, auxiliares (ASB), técnicos (TSB) e laboratórios de prótese. Quem estiver marcado para aparecer na agenda pode ser escolhido nos agendamentos." />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }} variant="scrollable">
        {TABS.map((t) => <Tab key={t} label={TAB_LABELS[t]} />)}
      </Tabs>
      {error && !open && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {current === "DENTISTA" ? (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, flexWrap: "wrap", mb: 2 }}>
            <Typography color="text.secondary">Os dentistas já fazem parte da agenda. Para cadastrar ou alterar um dentista (CRO, contrato, repasses), use o Corpo Clínico.</Typography>
            <Button variant="contained" onClick={() => navigate("/corpo-clinico")}>Abrir Corpo Clínico</Button>
          </Box>
          {doctors.length === 0 && <Typography color="text.secondary">Nenhum dentista cadastrado.</Typography>}
          {doctors.map((d) => (
            <Box key={d.id} sx={{ py: 1, borderTop: "1px solid", borderColor: "divider" }}>
              <Typography sx={{ fontWeight: 700 }}>{`${d.user.firstName} ${d.user.lastName}`.trim()}</Typography>
              <Typography variant="body2" color="text.secondary">{d.specialty || ""}</Typography>
            </Box>
          ))}
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openNew} sx={{ mb: 2 }}>{`Cadastrar ${TAB_LABELS[current]}`}</Button>
          {rows.length === 0 && <Typography color="text.secondary">Nenhum cadastro ainda.</Typography>}
          {rows.map((m) => (
            <Box key={m.id} sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap", py: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
              <Box>
                <Typography sx={{ fontWeight: 800 }}>{m.fullName}</Typography>
                <Typography variant="body2" color="text.secondary">{[m.companyName, m.registryNumber && `CRO/registro ${m.registryNumber}`, m.phone, m.email].filter(Boolean).join(" • ")}</Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                {!isLab && <Chip size="small" color={m.showInAgenda ? "success" : "default"} label={m.showInAgenda ? "Na agenda" : "Fora da agenda"} />}
                <Button size="small" onClick={() => openEdit(m)}>Editar</Button>
                <Button size="small" color="error" onClick={() => void remove(m)}>Inativar</Button>
              </Box>
            </Box>
          ))}
        </Paper>
      )}

      <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 800 }}>{role ? `${editId ? "Editar" : "Cadastrar"} — ${TEAM_ROLE_LABELS[role]}` : ""}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          <TextField required label={isLab ? "Nome do responsável / técnico" : "Nome completo"} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          {isLab && <TextField label="Nome do laboratório" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />}
          <TextField label={isLab ? "WhatsApp (com DDD) — recebe os avisos das ordens de serviço" : "Telefone / WhatsApp (com DDD)"} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <TextField label="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          {!isLab && <TextField label="Número do CRO / registro" value={form.registryNumber} onChange={(e) => setForm({ ...form, registryNumber: e.target.value })} />}
          <TextField multiline minRows={2} label="Observações" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          {!isLab && <FormControlLabel control={<Switch checked={form.showInAgenda} onChange={(_, v) => setForm({ ...form, showInAgenda: v })} />} label="Aparece na agenda (pode ser escolhido nos agendamentos)" />}
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={busy} onClick={() => void save()}>{busy ? "Salvando..." : "Salvar"}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
