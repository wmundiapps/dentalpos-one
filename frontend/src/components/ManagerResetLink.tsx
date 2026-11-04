const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
// Só mostra o item de menu para o e-mail autorizado; quem decide de verdade é o servidor (confere o e-mail no banco).
const ALLOWED_EMAILS = ["clinicaravel@gmail.com"];

export function canUseManagerReset(email?: string | null): boolean {
  return !!email && ALLOWED_EMAILS.includes(email.trim().toLowerCase());
}

// Gera um link de uso único (10 min) para redefinir a senha do administrador do DentalPos Manager
// e abre em nova aba. Chame direto de um clique (senão o navegador bloqueia a aba).
// Devolve uma mensagem de erro, ou null se deu certo.
export async function openManagerReset(): Promise<string | null> {
  const tab = window.open("", "_blank");
  try {
    const token = localStorage.getItem("dentalpos.token") || "";
    const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
    const r = await fetch(`${API}/manager/reset-link`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(clinicId ? { "X-Clinic-ID": clinicId } : {}) },
      body: "{}",
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`);
    if (tab) { tab.opener = null; tab.location.href = d.url; }
    else window.location.href = d.url;
    return null;
  } catch (e) {
    if (tab) tab.close();
    return e instanceof Error ? e.message : "Não foi possível gerar o link.";
  }
}
