const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface PermissionItem { id: string; code: string; module: string; action: string }
export interface AccessProfile {
  id: string;
  code: string;
  name: string;
  isSystem: boolean;
  permissions: Array<{ permission: PermissionItem }>;
  _count?: { users: number };
}
export interface AccessUser { id: string; firstName: string; lastName: string; email: string; role: string; profileIds: string[] }

function headers(json = false) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return {
    Authorization: `Bearer ${token}`,
    ...(clinicId ? { "X-Clinic-ID": clinicId } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Erro HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const AccessApi = {
  catalog: async () => parse<PermissionItem[]>(await fetch(`${API}/permissions`, { headers: headers() })),
  profiles: async () => parse<AccessProfile[]>(await fetch(`${API}/access-profiles`, { headers: headers() })),
  users: async () => parse<AccessUser[]>(await fetch(`${API}/users-access`, { headers: headers() })),
  bootstrap: async () => parse<{ ok: boolean }>(await fetch(`${API}/access-profiles/bootstrap`, { method: "POST", headers: headers(true), body: "{}" })),
  setPermissions: async (profileId: string, codes: string[]) =>
    parse<{ ok: boolean }>(await fetch(`${API}/access-profiles/${profileId}/permissions`, { method: "PUT", headers: headers(true), body: JSON.stringify({ codes }) })),
  assign: async (userId: string, profileId: string) =>
    parse<{ ok: boolean }>(await fetch(`${API}/users/${userId}/access-profiles`, { method: "POST", headers: headers(true), body: JSON.stringify({ profileId }) })),
  unassign: async (userId: string, profileId: string) =>
    parse<{ ok: boolean }>(await fetch(`${API}/users/${userId}/access-profiles/${profileId}`, { method: "DELETE", headers: headers() })),
};
