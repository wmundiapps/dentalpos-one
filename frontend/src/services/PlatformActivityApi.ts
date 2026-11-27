const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface AtividadeLogin {
  horario: string;
  nome: string;
  role: string;
  ip: string;
}

export interface AtividadeUsuario {
  nome: string;
  role: string;
  acoes: Array<{ chave: string; total: number }>;
}

export interface PlatformActivity {
  desde: string;
  ate: string;
  logins: AtividadeLogin[];
  totalEventos: number;
  porUsuario: AtividadeUsuario[];
}

function headers() {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return {
    Authorization: `Bearer ${token}`,
    ...(clinicId ? { "X-Clinic-ID": clinicId } : {}),
  };
}

export async function loadPlatformActivity(desde: string, ate: string): Promise<PlatformActivity> {
  const qs = new URLSearchParams({ desde, ate }).toString();
  const response = await fetch(`${API}/platform/atividade?${qs}`, { headers: headers() });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível consultar a atividade.");
  return data as PlatformActivity;
}
