const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface InstitutionProfile {
  clinicId: string;
  name: string;
  displayName: string | null;
  logo: string | null;
  email: string;
  phone: string;
  cnpj: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  primaryColor: string;
  site: string | null;
  contactUrl: string | null;
  ombudsmanEmail: string | null;
  ombudsmanPhone: string | null;
}

export interface Campus {
  id: string;
  name: string;
  type: "SEDE" | "POLO";
  addressStreet: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  phone: string | null;
  email: string | null;
  mapLat: number | null;
  mapLng: number | null;
  isActive: boolean;
}

function headers(json: boolean) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return {
    Authorization: `Bearer ${token}`,
    ...(clinicId ? { "X-Clinic-ID": clinicId } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...headers(Boolean(init?.body)), ...(init?.headers || {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Erro HTTP ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

const get = <T,>(path: string) => request<T>(path);
const post = <T,>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });
const put = <T,>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) });

export const getInstitutionProfile = () => get<InstitutionProfile>("/edu/institution-profile");
export const updateInstitutionProfile = (input: Partial<InstitutionProfile>) =>
  put<InstitutionProfile>("/edu/institution-profile", input);

export const listCampuses = () => get<Campus[]>("/edu/campuses");
export const createCampus = (input: Partial<Campus>) => post<Campus>("/edu/campuses", input);
export const updateCampus = (id: string, input: Partial<Campus>) => put<Campus>(`/edu/campuses/${id}`, input);

export function osmEmbedUrl(lat: number, lng: number) {
  const delta = 0.01;
  const bbox = `${lng - delta}%2C${lat - delta}%2C${lng + delta}%2C${lat + delta}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
}

export function osmViewUrl(lat: number, lng: number) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}
