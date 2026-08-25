const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface ReadinessCheck {
  key: string;
  label: string;
  ok: boolean;
  critical: boolean;
  detail: string;
}

export interface PlatformReadiness {
  environment: {
    nodeEnv: string;
    appEnv: string;
    releaseChannel: string;
    publicAppUrl: string | null;
  };
  checks: ReadinessCheck[];
  integrations: {
    paymentProviders: Array<{
      provider: string;
      environment: string;
      isActive: boolean;
      credentialsConfigured: boolean;
      webhookConfigured: boolean;
    }>;
    activeRevahSenders: number;
    activeStorageConfigs: number;
  };
  productionReady: boolean;
  criticalPending: number;
}

function headers() {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return {
    Authorization: `Bearer ${token}`,
    ...(clinicId ? { "X-Clinic-ID": clinicId } : {}),
  };
}

export async function loadPlatformReadiness(): Promise<PlatformReadiness> {
  const response = await fetch(`${API}/platform/readiness`, { headers: headers() });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível consultar a homologação.");
  return data as PlatformReadiness;
}
