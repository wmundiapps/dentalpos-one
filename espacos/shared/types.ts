// Tipos de domínio compartilhados entre servidor e web.

export type LocaleCode =
  | 'pt-BR' | 'en' | 'es' | 'fr' | 'it' | 'de' | 'zh' | 'ja' | 'hi' | 'ar' | 'he';

export type SpaceCategory =
  | 'dental' | 'medical' | 'psychology' | 'physio' | 'aesthetics' | 'nutrition' | 'veterinary'
  | 'law' | 'classroom' | 'auditorium' | 'meeting' | 'coworking' | 'studio' | 'lab' | 'kitchen' | 'other';

export type CancellationPolicyId = 'flexible' | 'moderate' | 'strict';
export type GuarantorPolicy = 'none' | 'optional' | 'required' | 'required_over_amount';

export type BookingStatus =
  | 'pending_payment'     // aguardando pagamento no checkout do provedor
  | 'pending_guarantor'   // aguardando aceite do avalista
  | 'pending_host'        // aguardando aprovação do anfitrião (reserva por solicitação)
  | 'confirmed'
  | 'checked_in'
  | 'completed'
  | 'cancelled_guest'
  | 'cancelled_host'
  | 'declined'
  | 'expired'
  | 'no_show';

export type PaymentStatus = 'pending' | 'authorized' | 'captured' | 'partially_refunded' | 'refunded' | 'voided' | 'failed';

export type LicenseStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'needs_review';

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = domingo

export interface TimeRange { start: string; end: string } // "HH:mm"

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  phone?: string;
  countryCode: string;
  locale: LocaleCode;
  roles: Array<'guest' | 'host' | 'admin'>;
  createdAt: string;
  // Verificações
  identityVerified: boolean;
  documentType?: string;
  documentNumber?: string;
  professionalLicense?: { body: string; number: string; region?: string; verified: boolean };
  licenseStatus: LicenseStatus;
  companyTaxId?: string;
  bio?: string;
  // Reputação e penalidades
  strikes: Array<{ at: string; reason: string; incidentId?: string }>;
  suspendedUntil?: string;
  banned?: boolean;
  termsAcceptedAt?: string;
  termsVersion?: string;
}

export type PublicUser = Pick<User, 'id' | 'name' | 'countryCode' | 'createdAt' | 'identityVerified' | 'bio'> & {
  professionalLicenseVerified: boolean;
  ratingAsHost?: number;
  ratingAsGuest?: number;
  reviewCountAsHost: number;
  reviewCountAsGuest: number;
};

export interface Listing {
  id: string;
  hostId: string;
  title: string;
  description: string;
  category: SpaceCategory;
  countryCode: string;
  city: string;
  timezone: string;
  neighborhood?: string;
  address: string;          // endereço completo só é revelado após confirmação
  capacity: number;
  areaM2?: number;
  amenities: string[];
  equipment: string;        // texto livre com equipamentos disponíveis
  photos: string[];         // URLs (opcional); se vazio, a web gera ilustração
  currency: string;
  pricePerHour: number;
  pricePerDay?: number;     // diária (turno completo), opcional
  minHours: number;
  cleaningFee: number;
  securityDeposit: number;  // caução (pré-autorização), 0 = sem caução
  instantBook: boolean;
  cancellationPolicy: CancellationPolicyId;
  guarantorPolicy: GuarantorPolicy;
  guarantorThreshold?: number; // p/ required_over_amount
  requiresLicense: boolean;    // exige registro profissional verificado
  hostLicenseResponsibility: boolean; // anfitrião assume conferir o registro do locatário
  houseRules: string;          // normas do espaço
  buildingRules?: string;      // normas do condomínio/edifício
  allowedActivities?: string;
  forbiddenActivities?: string;
  bufferMinutes: number;       // intervalo entre reservas (limpeza/preparo)
  weeklyAvailability: Partial<Record<Weekday, TimeRange[]>>; // horários ociosos
  blockedDates: string[];      // YYYY-MM-DD
  active: boolean;
  createdAt: string;
}

export interface Guarantor {
  name: string;
  email: string;
  phone?: string;
  documentNumber: string;
  relationship?: string;
  token: string;
  status: 'invited' | 'accepted' | 'declined';
  liabilityCap: number;
  respondedAt?: string;
}

export interface PriceBreakdown {
  currency: string;
  hours: number;
  days: number;
  occurrences: number;
  baseAmount: number;
  cleaningFee: number;
  guestServiceFee: number;
  taxOnServiceFee: number;
  taxName: string;
  total: number;
  hostServiceFee: number;
  hostPayout: number;
  securityDeposit: number;
}

export interface Occurrence { date: string; start: string; end: string } // data local do espaço

export interface Booking {
  id: string;
  listingId: string;
  guestId: string;
  hostId: string;
  occurrences: Occurrence[];   // 1..N (turnos/dias/recorrência semanal)
  guests: number;
  purpose: string;             // atividade declarada
  status: BookingStatus;
  price: PriceBreakdown;
  paymentMethod: string;
  paymentId?: string;
  guarantor?: Guarantor;
  cancellationPolicy: CancellationPolicyId;
  createdAt: string;
  confirmedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  refundAmount?: number;
  attendance: Array<{ date: string; checkInAt?: string; checkOutAt?: string; overstayMinutes?: number }>;
  completedAt?: string;
  hostPenalty?: { amount: number; reason: string; at: string };
  isConsumer: boolean;         // pessoa física destinatária final (direito de arrependimento)
  clientReviewsEnabled: boolean;
  rulesAcceptedAt: string;
  rulesVersion: string;
  hostDecisionDeadline?: string;
  paymentDeadline?: string;
  hostLicenseCheckAt?: string;
}

export interface Payment {
  id: string;
  bookingId: string;
  provider: string;
  method: string;
  providerRef?: string;
  checkoutRef?: string;
  checkoutUrl?: string;
  customerRef?: string;
  paymentMethodRef?: string;
  depositRef?: string;
  currency: string;
  amount: number;
  refunded: number;
  extraCharges: Array<{ at: string; amount: number; reason: string }>;
  depositHold: number;
  depositStatus: 'none' | 'held' | 'released' | 'captured';
  status: PaymentStatus;
  payoutStatus: 'scheduled' | 'paid' | 'held' | 'cancelled';
  payoutAmount: number;
  createdAt: string;
  history: Array<{ at: string; event: string; amount?: number }>;
}

export type ReviewKind = 'guest_to_listing' | 'host_to_guest' | 'client_to_listing';

export interface Review {
  id: string;
  kind: ReviewKind;
  bookingId: string;
  listingId: string;
  authorId?: string;       // ausente em avaliação de cliente final (anônima)
  authorName: string;
  targetUserId?: string;
  rating: number;          // 1..5
  categories: Record<string, number>;
  comment: string;
  privateNote?: string;
  wouldRecommend?: boolean;
  response?: { text: string; at: string };
  createdAt: string;
  visible: boolean;        // avaliação duplo-cega: só fica visível após as duas partes ou fim do prazo
}

export interface ClientReviewInvite {
  token: string;
  bookingId: string;
  listingId: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  label?: string;
}

export interface Message {
  id: string;
  bookingId: string;
  senderId: string;
  text: string;
  createdAt: string;
  flagged?: boolean;
}

export type IncidentType =
  | 'overstay' | 'damage' | 'extra_cleaning' | 'rule_violation' | 'over_capacity'
  | 'unauthorized_activity' | 'sublet' | 'smoking_substances' | 'building_fine'
  | 'harassment' | 'off_platform_payment' | 'no_show' | 'listing_inaccurate'
  | 'host_no_access' | 'safety';

export interface Incident {
  id: string;
  bookingId: string;
  reporterId: string;
  againstUserId: string;
  type: IncidentType;
  description: string;
  evidence: string[];
  requestedAmount: number;
  status: 'open' | 'accepted' | 'contested' | 'resolved' | 'rejected';
  resolution?: { at: string; chargedAmount: number; strike: boolean; note: string; chargedFrom: 'payment' | 'deposit' | 'guarantor' | 'none' };
  responseDeadline: string;
  createdAt: string;
  guestResponse?: string;
}

export interface Notification {
  id: string;
  userId?: string;
  email?: string;
  kind: string;
  text: string;
  link?: string;
  createdAt: string;
  read: boolean;
}
