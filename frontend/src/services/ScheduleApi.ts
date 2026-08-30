const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface BackendSchedule {
  id: string;
  doctorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDuration: number;
}

export interface AgendaBlock {
  id: string;
  doctorId: string | null;
  startAt: string;
  endAt: string;
  reason: string;
}

export interface RecurringBreak {
  id: string;
  doctorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  reason: string;
}

function headers(json = false) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return {
    Authorization: `Bearer ${token}`,
    ...(clinicId ? { "X-Clinic-ID": clinicId } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function errorMessage(response: Response) {
  const body = await response.json().catch(() => null);
  return body?.error || `Erro HTTP ${response.status}`;
}

export async function loadBackendSchedules(): Promise<BackendSchedule[]> {
  const response = await fetch(`${API}/schedules`, { headers: headers() });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}

export async function createBackendSchedule(input: {
  doctorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDuration: number;
}): Promise<BackendSchedule> {
  const response = await fetch(`${API}/schedules`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}

export async function deleteBackendSchedule(id: string): Promise<void> {
  const response = await fetch(`${API}/schedule/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
}

export async function loadAgendaBlocks(): Promise<AgendaBlock[]> {
  const response = await fetch(`${API}/agenda-blocks`, { headers: headers() });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}

export async function createAgendaBlock(input: {
  doctorId?: string | null;
  startAt: string;
  endAt: string;
  reason: string;
}): Promise<AgendaBlock> {
  const response = await fetch(`${API}/agenda-blocks`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}

export async function deleteAgendaBlock(id: string): Promise<void> {
  const response = await fetch(`${API}/agenda-blocks/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
}

export async function loadRecurringBreaks(): Promise<RecurringBreak[]> {
  const response = await fetch(`${API}/agenda-recurring-breaks`, { headers: headers() });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}

export async function createRecurringBreak(input: {
  doctorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  reason: string;
}): Promise<RecurringBreak> {
  const response = await fetch(`${API}/agenda-recurring-breaks`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}

export async function createRecurringBreaks(input: {
  doctorId: string;
  dayOfWeeks: number[];
  startTime: string;
  endTime: string;
  reason: string;
}): Promise<RecurringBreak[]> {
  const response = await fetch(`${API}/agenda-recurring-breaks`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  const body = await response.json();
  return Array.isArray(body) ? body : [body];
}

export async function deleteRecurringBreak(id: string): Promise<void> {
  const response = await fetch(`${API}/agenda-recurring-breaks/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
}
