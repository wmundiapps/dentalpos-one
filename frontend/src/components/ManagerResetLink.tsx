import { useState } from "react";
import { Alert, Button, Snackbar } from "@mui/material";
import LockResetIcon from "@mui/icons-material/LockReset";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
// Só mostra o botão para o e-mail autorizado; quem decide de verdade é o servidor (confere o e-mail no banco).
const ALLOWED_EMAILS = ["clinicaravel@gmail.com"];

// Gera um link de uso único (10 min) para redefinir a senha do administrador do DentalPos Manager.
export default function ManagerResetLink({ email }: { email?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  if (!email || !ALLOWED_EMAILS.includes(email.trim().toLowerCase())) return null;

  const run = async () => {
    // Abre a aba já no clique (senão o navegador bloqueia) e depois aponta para o link.
    const tab = window.open("", "_blank");
    setBusy(true);
    try {
      const token = localStorage.getItem("dentalpos.token") || "";
      const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
      const r = await fetch(`${API}/manager/reset-link`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(clinicId ? { "X-Clinic-ID": clinicId } : {}) }, body: "{}" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`);
      if (tab) { tab.opener = null; tab.location.href = d.url; }
      else window.location.href = d.url;
      setMsg({ type: "success", text: "Link aberto em nova aba. Ele vale 10 minutos e só uma vez." });
    } catch (e) {
      if (tab) tab.close();
      setMsg({ type: "error", text: e instanceof Error ? e.message : "Não foi possível gerar o link." });
    } finally { setBusy(false); }
  };

  return (
    <>
      <Button size="small" color="inherit" startIcon={<LockResetIcon />} disabled={busy} onClick={run} sx={{ textTransform: "none", mr: 1, display: { xs: "none", md: "inline-flex" } }}>
        Redefinir senha do Manager
      </Button>
      <Snackbar open={Boolean(msg)} autoHideDuration={7000} onClose={() => setMsg(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        {msg ? <Alert severity={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert> : undefined}
      </Snackbar>
    </>
  );
}
