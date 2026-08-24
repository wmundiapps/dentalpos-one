// ======================
// AUTH
// ======================

export interface RegisterInput {
  firstName: string
  lastName: string
  email: string
  password: string
  phone?: string
  clinicId: string
  tenantId: string
}

export interface LoginInput {
  email: string
  password: string
  clinicId: string
}

// ======================
// USER
// ======================

export interface UpdateUserInput {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  role?: string
}

// ======================
// PATIENT
// ======================

export interface CreatePatientInput {
  fullName: string
  email?: string
  phone: string
  cpf?: string
  rg?: string
  birthDate?: string
  gender?: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
  odontogram?: string
  photos?: string[]
  xrays?: string[]
  medicalHistory?: string
  allergies?: string
  notes?: string
  tenantId: string
}

export interface UpdatePatientInput
  extends Partial<CreatePatientInput> {}

// ======================
// DOCTOR
// ======================

export interface CreateDoctorInput {
  cro: string
  specialty: string
  bio?: string
  photo?: string
  userId: string
  tenantId: string
}

export interface UpdateDoctorInput {
  cro?: string
  specialty?: string
  bio?: string
  photo?: string
  isActive?: boolean
}

// ======================
// APPOINTMENT
// ======================

export interface CreateAppointmentInput {
  patientId: string
  doctorId: string
  userId: string
  procedure: string
  scheduledAt: string
  notes?: string
  tenantId: string
}

export interface UpdateAppointmentInput {
  scheduledAt?: string
  startedAt?: string
  endedAt?: string
  procedure?: string
  status?: string
  notes?: string
}

// ======================
// SCHEDULE
// ======================

export interface CreateScheduleInput {
  doctorId: string
  userId: string
  patientId?: string
  dayOfWeek: number
  startTime: string
  endTime: string
  slotDuration?: number
  tenantId: string
}

export interface UpdateScheduleInput {
  patientId?: string
  dayOfWeek?: number
  startTime?: string
  endTime?: string
  slotDuration?: number
}

// ======================
// BUDGET
// ======================

export interface CreateBudgetInput {
  patientId: string
  description: string
  totalAmount: number
  installments?: number
  validUntil: string
  tenantId: string
}

export interface UpdateBudgetInput {
  description?: string
  totalAmount?: number
  installments?: number
 status?: string
  validUntil?: string
}

// ======================
// PAYMENT
// ======================

export interface CreatePaymentInput {
  budgetId: string
  appointmentId?: string
  amount: number
  method: string
  dueDate: string
  installment?: number
  tenantId: string
}

export interface UpdatePaymentInput {
  amount?: number
  method?: string
  status?: string
  paidDate?: string
  notes?: string
}

// ======================
// CLINIC
// ======================

export interface CreateClinicInput {
  name: string
  email: string
  phone: string
  cnpj: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
  tenantId: string
}

export interface UpdateClinicInput {
  name?: string
  email?: string
  phone?: string
  address?: string
  city?: string
 state?: string
  zipCode?: string
  language?: string
  maxDoctors?: number
  maxPatients?: number
}

// ======================
// FEEDBACK
// ======================

export interface CreateFeedbackInput {
  patientId: string
  appointmentId: string
  rating: number
  comment?: string
  isAnonymous?: boolean
  tenantId: string
}

export interface UpdateFeedbackInput {
  rating?: number
  comment?: string
  isAnonymous?: boolean
}
