const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface EduProgram {
  id: string;
  name: string;
  code: string;
  level: "GRADUACAO" | "POS_LATO" | "POS_STRICTO" | "TECNICO" | "LIVRE";
  modality: "PRESENCIAL" | "EAD" | "HIBRIDO";
  totalTerms: number;
  isActive: boolean;
}

export interface EduSubject {
  id: string;
  name: string;
  code: string;
  workloadHours: number;
  isActive: boolean;
}

export interface EduCurriculumSubject {
  id: string;
  curriculumId: string;
  subjectId: string;
  termNumber: number;
  workloadHours: number;
  isMandatory: boolean;
  subject: EduSubject;
}

export interface EduCurriculum {
  id: string;
  programId: string;
  version: string;
  name: string;
  isActive: boolean;
  subjects: EduCurriculumSubject[];
}

export interface EduTerm {
  id: string;
  programId: string;
  name: string;
  type: "BIMESTRE" | "TRIMESTRE" | "SEMESTRE" | "ANUAL";
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface EduStudent {
  id: string;
  userId: string | null;
  fullName: string;
  email: string;
  phone: string | null;
  documentNumber: string | null;
  status: "ATIVO" | "TRANCADO" | "FORMADO" | "EVADIDO" | "CANCELADO";
}

export interface EduEnrollment {
  id: string;
  studentId: string;
  programId: string;
  curriculumId: string;
  termId: string;
  enrollmentNumber: string;
  status: string;
  monthlyFee: number | null;
  student?: EduStudent;
  program?: EduProgram;
  term?: EduTerm;
}

export interface EduClass {
  id: string;
  programId: string;
  curriculumSubjectId: string;
  termId: string;
  code: string;
  modality: string;
  capacity: number;
  isActive: boolean;
  enrolledCount?: number;
  vacancies?: number;
  curriculumSubject?: EduCurriculumSubject;
  term?: EduTerm;
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

export const listPrograms = () => get<EduProgram[]>("/edu/programs");
export const createProgram = (input: Partial<EduProgram>) => post<EduProgram>("/edu/programs", input);

export const listSubjects = () => get<EduSubject[]>("/edu/subjects");
export const createSubject = (input: Partial<EduSubject>) => post<EduSubject>("/edu/subjects", input);

export const listCurriculums = (programId?: string) =>
  get<EduCurriculum[]>(`/edu/curriculums${programId ? `?programId=${encodeURIComponent(programId)}` : ""}`);
export const createCurriculum = (input: { programId: string; version: string; name: string }) =>
  post<EduCurriculum>("/edu/curriculums", input);
export const addCurriculumSubject = (
  curriculumId: string,
  input: { subjectId: string; termNumber: number; workloadHours?: number },
) => post<EduCurriculumSubject>(`/edu/curriculums/${curriculumId}/subjects`, input);

export const listTerms = (programId?: string) =>
  get<EduTerm[]>(`/edu/terms${programId ? `?programId=${encodeURIComponent(programId)}` : ""}`);
export const createTerm = (input: { programId: string; name: string; type: string; startDate: string; endDate: string }) =>
  post<EduTerm>("/edu/terms", input);

export const listStudents = () => get<EduStudent[]>("/edu/students");
export const createStudent = (input: { fullName: string; email: string; phone?: string; documentNumber?: string }) =>
  post<EduStudent>("/edu/students", input);
export const activateStudentAccess = (studentId: string) =>
  post<{ userId: string; email: string; delivered: boolean; activationUrl: string }>(
    `/edu/students/${studentId}/activate-access`,
    {},
  );

export const listEnrollments = () => get<EduEnrollment[]>("/edu/enrollments");
export const createEnrollment = (input: {
  studentId: string;
  programId: string;
  curriculumId: string;
  termId: string;
  monthlyFee?: number;
}) => post<EduEnrollment>("/edu/enrollments", input);

export const listClasses = (termId?: string) =>
  get<EduClass[]>(`/edu/classes${termId ? `?termId=${encodeURIComponent(termId)}` : ""}`);
export const createClass = (input: {
  programId: string;
  curriculumSubjectId: string;
  termId: string;
  code: string;
  capacity?: number;
}) => post<EduClass>("/edu/classes", input);
export const enrollStudentInClass = (classId: string, input: { studentId: string; enrollmentId: string }) =>
  post(`/edu/classes/${classId}/enrollments`, input);
