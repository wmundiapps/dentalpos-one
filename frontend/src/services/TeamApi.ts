const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export type TeamRole = "ASB" | "TSB" | "LAB_PROTESE";

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  ASB: "ASB (auxiliar em saúde bucal)",
  TSB: "TSB (técnico em saúde bucal)",
  LAB_PROTESE: "Laboratório de prótese",
};

export interface TeamMember {
  id: string;
  role: TeamRole;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  registryNumber?: string | null;
  companyName?: string | null;
  notes?: string | null;
  showInAgenda: boolean;
  isActive: boolean;
}

export type TeamMemberInput = Partial<Omit<TeamMember, "id" | "isActive">> & { role: TeamRole; fullName: string };

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

export async function loadTeamMembers(): Promise<TeamMember[]> {
  return parse(await fetch(`${API}/team-members`, { headers: headers() }));
}

export async function createTeamMember(input: TeamMemberInput): Promise<TeamMember> {
  return parse(await fetch(`${API}/team-members`, { method: "POST", headers: headers(true), body: JSON.stringify(input) }));
}

export async function updateTeamMember(id: string, input: Partial<TeamMemberInput>): Promise<TeamMember> {
  return parse(await fetch(`${API}/team-member/${id}`, { method: "PUT", headers: headers(true), body: JSON.stringify(input) }));
}

export async function removeTeamMember(id: string): Promise<void> {
  await parse(await fetch(`${API}/team-member/${id}`, { method: "DELETE", headers: headers() }));
}
