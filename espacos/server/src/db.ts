// Persistência simples em arquivo JSON (adequada para demonstração e
// desenvolvimento). Para produção, trocar por PostgreSQL mantendo a mesma
// interface de coleções — ver README.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  Booking, ClientReviewInvite, Incident, Listing, Message, Notification, Payment, Review, User,
} from '../../shared/types';

export interface DbShape {
  users: User[];
  listings: Listing[];
  bookings: Booking[];
  payments: Payment[];
  reviews: Review[];
  clientInvites: ClientReviewInvite[];
  messages: Message[];
  incidents: Incident[];
  notifications: Notification[];
  favorites: Array<{ userId: string; listingId: string }>;
}

const DATA_FILE = process.env.SPACEHOUR_DB ?? path.resolve(process.cwd(), 'data', 'db.json');

function empty(): DbShape {
  return { users: [], listings: [], bookings: [], payments: [], reviews: [], clientInvites: [], messages: [], incidents: [], notifications: [], favorites: [] };
}

export const db: DbShape = load();

function load(): DbShape {
  if (process.env.SPACEHOUR_DB === ':memory:') return empty();
  try {
    return { ...empty(), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
  } catch {
    return empty();
  }
}

let saveTimer: NodeJS.Timeout | null = null;
export function save(): void {
  if (process.env.SPACEHOUR_DB === ':memory:') return;
  if (saveTimer) return;
  saveTimer = setTimeout(flush, 50);
}

export function flush(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (process.env.SPACEHOUR_DB === ':memory:') return;
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DATA_FILE);
}

export function reset(): void {
  Object.assign(db, empty());
}

export const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
export const token = () => crypto.randomBytes(24).toString('base64url');
export const nowIso = () => new Date().toISOString();
