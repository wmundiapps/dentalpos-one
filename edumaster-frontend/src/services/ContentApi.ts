const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface ContentItem {
  id: string;
  subjectId: string | null;
  type: "VIDEO" | "PDF" | "RESUMO" | "MATERIAL_COMPLEMENTAR" | "APOSTILA";
  title: string;
  description: string | null;
  url: string | null;
  sourceText: string | null;
  summary8020: string | null;
  isActive: boolean;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  storageProvider: string;
  storageStatus: "AVAILABLE" | "PENDING_UPLOAD" | "AWAITING_STORAGE_CONFIGURATION";
}

export interface UploadAccess {
  configured: boolean;
  provider: string;
  method?: "PUT";
  url: string | null;
  headers?: Record<string, string>;
  expiresAt: string | null;
  reason?: string;
}

export interface FlashcardDeck {
  id: string;
  subjectId: string | null;
  title: string;
  description: string | null;
  isActive: boolean;
  cards?: Flashcard[];
}

export interface Flashcard {
  id: string;
  deckId: string;
  front: string;
  back: string;
  order: number;
}

export interface Forum {
  id: string;
  classId: string | null;
  subjectId: string | null;
  title: string;
  description: string | null;
  isActive: boolean;
}

export interface ForumTopic {
  id: string;
  forumId: string;
  title: string;
  body: string;
}

export interface LibrarySubscription {
  id: string;
  studentId: string | null;
  scope: "INSTITUCIONAL" | "INDIVIDUAL";
  provider: string;
  plan: string;
  amount: number;
  endDate: string | null;
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

export const listContentItems = () => get<ContentItem[]>("/edu/content-items");
export const createContentItem = (input: {
  title: string; type: string; url: string; subjectId?: string; classId?: string; description?: string; sourceText?: string;
}) => post<ContentItem>("/edu/content-items", input);
export const generateSummary8020 = (contentItemId: string) => post<ContentItem>(`/edu/content-items/${contentItemId}/generate-summary-8020`, {});

export const contentUploadIntent = (input: {
  title: string; type: string; subjectId?: string; classId?: string; description?: string;
  originalName: string; mimeType: string; sizeBytes: number; durationMinutes?: number;
}) => post<{ item: ContentItem; upload: UploadAccess }>("/edu/content-items/upload-intent", input);
export const completeContentUpload = (contentItemId: string) => post<ContentItem>(`/edu/content-items/${contentItemId}/complete-upload`, {});
export const getContentAccess = (contentItemId: string) => get<UploadAccess>(`/edu/content-items/${contentItemId}/access`);

export const listFlashcardDecks = () => get<FlashcardDeck[]>("/edu/flashcard-decks");
export const createFlashcardDeck = (input: Partial<FlashcardDeck>) => post<FlashcardDeck>("/edu/flashcard-decks", input);
export const addFlashcard = (deckId: string, input: { front: string; back: string }) => post<Flashcard>(`/edu/flashcard-decks/${deckId}/cards`, input);

export const listForums = () => get<Forum[]>("/edu/forums");
export const createForum = (input: Partial<Forum>) => post<Forum>("/edu/forums", input);
export const listForumTopics = (forumId: string) => get<ForumTopic[]>(`/edu/forums/${forumId}/topics`);
export const createForumTopic = (forumId: string, input: { title: string; body: string }) => post<ForumTopic>(`/edu/forums/${forumId}/topics`, input);

export const listLibrarySubscriptions = () => get<LibrarySubscription[]>("/edu/library-subscriptions");
export const createLibrarySubscription = (input: { scope: string; provider: string; plan: string; amount: number; studentId?: string }) =>
  post<LibrarySubscription>("/edu/library-subscriptions", input);
