// Dados de demonstração. Executado automaticamente com o banco vazio ou via
// `npm run db:reset` (apaga e recria tudo). Senha de todos os usuários: demo12345
import bcrypt from 'bcryptjs';
import { findStateOfCity } from './geo.js';
import { dropAll, id, migrate, pool, token, withTx } from './db.js';
import * as repo from './repo.js';
import { getCity, getCountry } from '../../shared/countries.js';
import { RULES_VERSION, addDays, computePrice, todayInZone } from '../../shared/rules.js';
import type { Booking, ClientReviewInvite, Listing, Payment, Review, SpaceCategory, User, Weekday, TimeRange } from '../../shared/types.js';

// Tudo é montado em memória e gravado numa única transação no fim.
const S = { users: [] as User[], listings: [] as Listing[], bookings: [] as Booking[], payments: [] as Payment[], reviews: [] as Review[], invites: [] as ClientReviewInvite[] };

const PASSWORD = bcrypt.hashSync('demo12345', 8);

function user(name: string, email: string, countryCode: string, locale: User['locale'], roles: User['roles'], extra: Partial<User> = {}): User {
  const u: User = {
    id: id('usr'), email, passwordHash: PASSWORD, name, countryCode, locale, roles, createdAt: '2025-03-01T12:00:00.000Z',
    identityVerified: true, strikes: [], termsAcceptedAt: '2025-03-01T12:00:00.000Z', termsVersion: RULES_VERSION,
    licenseStatus: extra.professionalLicense?.verified ? 'approved' : 'none', ...extra,
  };
  S.users.push(u);
  return u;
}

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];
function avail(week: TimeRange[], sat?: TimeRange[], sun?: TimeRange[]): Listing['weeklyAvailability'] {
  const a: Listing['weeklyAvailability'] = {};
  for (const d of WEEKDAYS) a[d] = week;
  if (sat) a[6] = sat;
  if (sun) a[0] = sun;
  return a;
}

const RULES_HEALTH = 'Uso exclusivo para atendimento profissional compatível com o registro informado. Biossegurança obrigatória: EPIs, descarte de resíduos em recipientes identificados, desinfecção de superfícies ao final. Não acessar armários, prontuários ou computadores do anfitrião. Manter a porta da sala fechada durante atendimentos.';
const RULES_ROOM = 'Silêncio nos corredores e áreas comuns. Proibido fumar, consumir bebidas alcoólicas ou realizar eventos não informados. Devolver mobiliário à posição original. Lixo nos cestos indicados.';
const BUILDING = 'Identificação na portaria com documento. Horário do edifício respeitado. Visitantes/clientes devem ser anunciados. Proibido uso de áreas comuns para atendimento.';

interface L {
  host: User; country: string; city: string; category: SpaceCategory; title: string; description: string; neighborhood: string;
  price: number; day?: number; capacity: number; area: number; amenities: string[]; equipment: string; instant?: boolean;
  policy?: Listing['cancellationPolicy']; guarantor?: Listing['guarantorPolicy']; threshold?: number; license?: boolean;
  deposit?: number; cleaning?: number; minHours?: number; weekly: Listing['weeklyAvailability']; houseRules?: string;
}

const BR_CAPITAL_UF: Record<string, string> = {
  'São Paulo': 'SP', 'Rio de Janeiro': 'RJ', 'Belo Horizonte': 'MG', Brasília: 'DF', Curitiba: 'PR', 'Porto Alegre': 'RS',
  Salvador: 'BA', Recife: 'PE', Fortaleza: 'CE', Goiânia: 'GO', Florianópolis: 'SC', Manaus: 'AM',
};

function listing(o: L): Listing {
  const c = getCountry(o.country);
  const city = getCity(o.country, o.city)!;
  const l: Listing = {
    id: id('lst'), hostId: o.host.id, title: o.title, description: o.description, category: o.category, countryCode: o.country,
    state: o.country === 'BR' ? BR_CAPITAL_UF[o.city] : findStateOfCity(o.country, o.city), city: o.city, timezone: city.tz, neighborhood: o.neighborhood, address: `Endereço de demonstração, 100 — ${o.neighborhood}, ${o.city}`,
    capacity: o.capacity, areaM2: o.area, amenities: o.amenities, equipment: o.equipment, photos: [], currency: c.currency,
    pricePerHour: o.price, pricePerDay: o.day, minHours: o.minHours ?? 2, cleaningFee: o.cleaning ?? 0, securityDeposit: o.deposit ?? 0,
    instantBook: o.instant ?? true, cancellationPolicy: o.policy ?? 'moderate', guarantorPolicy: o.guarantor ?? 'none',
    guarantorThreshold: o.threshold, requiresLicense: o.license ?? false, hostLicenseResponsibility: o.license ?? false,
    houseRules: o.houseRules ?? (['dental', 'medical', 'psychology', 'physio', 'aesthetics', 'nutrition', 'veterinary'].includes(o.category) ? RULES_HEALTH : RULES_ROOM),
    buildingRules: BUILDING, bufferMinutes: 30, weeklyAvailability: o.weekly, blockedDates: [], active: true, createdAt: '2025-04-01T12:00:00.000Z',
  };
  S.listings.push(l);
  return l;
}

export async function seed() {
  for (const list of Object.values(S)) list.length = 0;
  user('Equipe SpaceHour', 'admin@spacehour.demo', 'BR', 'pt-BR', ['admin', 'guest']);
  const guest = user('Dra. Camila Rocha', 'locatario@spacehour.demo', 'BR', 'pt-BR', ['guest'], {
    professionalLicense: { body: 'CRO', number: 'SP-123456', region: 'SP', verified: true }, bio: 'Cirurgiã-dentista, atendo pacientes particulares 2x por semana.',
  });
  const guest2 = user('Lucas Méndez', 'lucas@spacehour.demo', 'MX', 'es', ['guest'], { professionalLicense: { body: 'Cédula profesional', number: '10987654', verified: true } });
  const hBR = user('Clínica Sorriso Paulista', 'anfitriao@spacehour.demo', 'BR', 'pt-BR', ['host', 'guest'], { bio: 'Clínica odontológica com 4 consultórios. Alugamos nos horários livres.' });
  const hBR2 = user('Espaço Mente Viva', 'mente@spacehour.demo', 'BR', 'pt-BR', ['host', 'guest']);
  const hBR3 = user('Centro Educacional Aurora', 'aurora@spacehour.demo', 'BR', 'pt-BR', ['host', 'guest']);
  const hMX = user('Consultorios Reforma', 'reforma@spacehour.demo', 'MX', 'es', ['host', 'guest']);
  const hUS = user('Hudson Medical Suites', 'hudson@spacehour.demo', 'US', 'en', ['host', 'guest']);
  const hCA = user('Studio Plateau', 'plateau@spacehour.demo', 'CA', 'fr', ['host', 'guest']);
  const hPT = user('Clínica Avenida', 'avenida@spacehour.demo', 'PT', 'pt-BR', ['host', 'guest']);
  const hES = user('Aulas Gran Vía', 'granvia@spacehour.demo', 'ES', 'es', ['host', 'guest']);
  const hIT = user('Studio Legale Brera', 'brera@spacehour.demo', 'IT', 'it', ['host', 'guest']);
  const hGB = user('Harley Rooms', 'harley@spacehour.demo', 'GB', 'en', ['host', 'guest']);
  const hFR = user('Cabinet Marais', 'marais@spacehour.demo', 'FR', 'fr', ['host', 'guest']);
  const hDE = user('Praxisräume Mitte', 'mitte@spacehour.demo', 'DE', 'de', ['host', 'guest']);
  const hCN = user('静安共享诊室', 'jingan@spacehour.demo', 'CN', 'zh', ['host', 'guest']);
  const hJP = user('渋谷シェアサロン', 'shibuya@spacehour.demo', 'JP', 'ja', ['host', 'guest']);
  const hIN = user('Bandra Wellness Hub', 'bandra@spacehour.demo', 'IN', 'en', ['host', 'guest']);
  const hAE = user('DIFC Business Rooms', 'difc@spacehour.demo', 'AE', 'en', ['host', 'guest']);
  const hIL = user('Rothschild Clinics', 'rothschild@spacehour.demo', 'IL', 'he', ['host', 'guest']);
  const hAU = user('Surry Hills Practice', 'surry@spacehour.demo', 'AU', 'en', ['host', 'guest']);
  const hAR = user('Palermo Consultorios', 'palermo@spacehour.demo', 'AR', 'es', ['host', 'guest']);
  const hCO = user('Auditorio Chapinero', 'chapinero@spacehour.demo', 'CO', 'es', ['host', 'guest']);
  const hCL = user('Oficinas Providencia', 'providencia@spacehour.demo', 'CL', 'es', ['host', 'guest']);
  const hCR = user('Sala Escazú', 'escazu@spacehour.demo', 'CR', 'es', ['host', 'guest']);
  const hPA = user('Torre Marbella Offices', 'marbella@spacehour.demo', 'PA', 'es', ['host', 'guest']);

  const dental = ['wifi', 'air_conditioning', 'reception', 'waiting_room', 'dental_chair', 'autoclave', 'compressor', 'suction', 'sink', 'biohazard_disposal', 'restroom'];
  const psych = ['wifi', 'air_conditioning', 'soundproofing', 'couch', 'waiting_room', 'restroom', 'accessibility'];
  const medical = ['wifi', 'air_conditioning', 'reception', 'waiting_room', 'stretcher', 'sink', 'biohazard_disposal', 'restroom', 'accessibility'];

  const L1 = listing({ host: hBR, country: 'BR', city: 'São Paulo', category: 'dental', neighborhood: 'Paraíso', title: 'Consultório odontológico completo na Paulista', description: 'Consultório equipado com cadeira odontológica nova, autoclave classe B, compressor isento de óleo e sugador. Recepção compartilhada com secretária no horário comercial. Ideal para atendimentos particulares nos horários ociosos da clínica.', price: 90, day: 700, capacity: 3, area: 14, amenities: [...dental, 'xray', 'elevator', 'parking'], equipment: 'Cadeira Gnatus, raio-X periapical, fotopolimerizador, ultrassom, amalgamador. Materiais de consumo NÃO inclusos.', license: true, deposit: 300, cleaning: 30, policy: 'moderate', guarantor: 'optional', weekly: avail([{ start: '07:00', end: '09:00' }, { start: '18:00', end: '22:00' }], [{ start: '08:00', end: '18:00' }]) });
  const L2 = listing({ host: hBR2, country: 'BR', city: 'Rio de Janeiro', category: 'psychology', neighborhood: 'Botafogo', title: 'Sala de psicologia acolhedora com isolamento acústico', description: 'Sala aconchegante com poltronas, divã, luz indireta e tratamento acústico. Sala de espera silenciosa. Perfeita para psicoterapia individual, casal ou supervisão.', price: 45, capacity: 3, area: 12, amenities: psych, equipment: 'Duas poltronas, divã, mesa auxiliar, lenços, relógio discreto, ruído branco na porta.', instant: true, policy: 'flexible', minHours: 1, weekly: avail([{ start: '07:00', end: '21:00' }], [{ start: '08:00', end: '14:00' }]) });
  const L3 = listing({ host: hBR3, country: 'BR', city: 'Belo Horizonte', category: 'classroom', neighborhood: 'Savassi', title: 'Sala de aula para 30 alunos com projetor', description: 'Sala climatizada com 30 carteiras, projetor Full HD, quadro branco e som ambiente. Ideal para cursos, workshops e treinamentos corporativos.', price: 120, day: 900, capacity: 30, area: 60, amenities: ['wifi', 'air_conditioning', 'projector', 'screen', 'whiteboard', 'sound_system', 'chairs', 'desks', 'restroom', 'coffee', 'accessibility'], equipment: 'Projetor, tela retrátil, caixa de som, microfone sem fio, 30 carteiras.', instant: false, policy: 'moderate', guarantor: 'required_over_amount', threshold: 2000, cleaning: 60, weekly: avail([{ start: '18:00', end: '22:30' }], [{ start: '08:00', end: '18:00' }], [{ start: '08:00', end: '13:00' }]) });
  listing({ host: hBR, country: 'BR', city: 'São Paulo', category: 'auditorium', neighborhood: 'Vila Mariana', title: 'Auditório para 120 pessoas com palco', description: 'Auditório com palco, cadeiras estofadas, sistema de som profissional e cabine de tradução. Ideal para congressos, palestras e formaturas de cursos livres.', price: 450, day: 3800, capacity: 120, area: 220, amenities: ['wifi', 'air_conditioning', 'projector', 'screen', 'sound_system', 'microphone', 'restroom', 'accessibility', 'elevator', 'parking', 'security_24h'], equipment: 'Palco 6x4 m, 2 telões, 4 microfones sem fio, mesa de som, iluminação cênica básica.', instant: false, policy: 'strict', guarantor: 'required', deposit: 2000, cleaning: 400, minHours: 3, weekly: avail([{ start: '18:00', end: '23:00' }], [{ start: '08:00', end: '23:00' }], [{ start: '08:00', end: '20:00' }]) });
  listing({ host: hBR2, country: 'BR', city: 'Curitiba', category: 'law', neighborhood: 'Batel', title: 'Sala de advocacia para reuniões e atendimentos', description: 'Escritório com mesa de reunião para 6 pessoas, biblioteca jurídica e recepção. Endereço nobre para receber clientes com privacidade.', price: 70, capacity: 6, area: 25, amenities: ['wifi', 'air_conditioning', 'reception', 'waiting_room', 'printer', 'coffee', 'video_conference', 'restroom'], equipment: 'Mesa para 6, TV 55" para videoconferência, impressora multifuncional.', policy: 'flexible', minHours: 1, weekly: avail([{ start: '08:00', end: '20:00' }]) });
  listing({ host: hBR3, country: 'BR', city: 'Recife', category: 'medical', neighborhood: 'Boa Viagem', title: 'Consultório médico com maca e pia', description: 'Consultório médico em clínica multiprofissional, com maca, pia, negatoscópio e computador. Recepção incluída.', price: 60, day: 480, capacity: 3, area: 12, amenities: medical, equipment: 'Maca, esfigmomanômetro, balança, otoscópio, negatoscópio.', license: true, policy: 'moderate', weekly: avail([{ start: '07:00', end: '12:00' }, { start: '17:00', end: '21:00' }], [{ start: '07:00', end: '13:00' }]) });
  const L4 = listing({ host: hMX, country: 'MX', city: 'Ciudad de México', category: 'dental', neighborhood: 'Juárez', title: 'Consultorio dental equipado en Reforma', description: 'Consultorio con unidad dental, autoclave y rayos X. Aviso de funcionamiento COFEPRIS vigente. Recepcionista en horario laboral.', price: 450, day: 3500, capacity: 3, area: 15, amenities: [...dental, 'xray'], equipment: 'Unidad dental, autoclave, rayos X intraoral, lámpara de fotocurado.', license: true, policy: 'moderate', deposit: 1500, guarantor: 'optional', weekly: avail([{ start: '07:00', end: '10:00' }, { start: '17:00', end: '21:00' }], [{ start: '09:00', end: '15:00' }]) });
  listing({ host: hMX, country: 'MX', city: 'Guadalajara', category: 'meeting', neighborhood: 'Providencia', title: 'Sala de juntas para 10 personas', description: 'Sala ejecutiva con pantalla, videoconferencia y café. Ideal para reuniones con clientes y entrevistas.', price: 350, capacity: 10, area: 30, amenities: ['wifi', 'air_conditioning', 'screen', 'video_conference', 'coffee', 'whiteboard', 'parking'], equipment: 'Pantalla 65", cámara 4K, pizarrón.', policy: 'flexible', minHours: 1, weekly: avail([{ start: '08:00', end: '20:00' }]) });
  listing({ host: hUS, country: 'US', city: 'New York', category: 'medical', neighborhood: 'Upper East Side', title: 'Turnkey exam room near Central Park', description: 'Fully equipped exam room inside a licensed multi-specialty suite. Front desk, waiting room and ADA-compliant restroom. HIPAA-conscious layout.', price: 95, day: 700, capacity: 3, area: 13, amenities: [...medical, 'elevator'], equipment: 'Exam table, vitals monitor, EKG on request, sharps disposal.', license: true, policy: 'strict', deposit: 500, weekly: avail([{ start: '07:00', end: '09:00' }, { start: '17:00', end: '21:00' }], [{ start: '09:00', end: '17:00' }]) });
  listing({ host: hUS, country: 'US', city: 'Miami', category: 'studio', neighborhood: 'Wynwood', title: 'Podcast & video studio with lighting kit', description: 'Acoustically treated studio with 3 camera angles, lighting kit and green screen. Perfect for podcasts, online classes and interviews.', price: 85, capacity: 5, area: 28, amenities: ['wifi', 'air_conditioning', 'soundproofing', 'microphone', 'lighting_kit', 'restroom'], equipment: '3x Sony cameras, RodeCaster, 4 SM7B mics, green screen.', policy: 'moderate', cleaning: 25, weekly: avail([{ start: '09:00', end: '22:00' }], [{ start: '10:00', end: '20:00' }], [{ start: '10:00', end: '18:00' }]) });
  listing({ host: hCA, country: 'CA', city: 'Montréal', category: 'psychology', neighborhood: 'Le Plateau-Mont-Royal', title: 'Bureau de thérapie lumineux / Bright therapy office', description: 'Bureau calme et insonorisé pour psychothérapeutes et travailleurs sociaux. Quiet, soundproofed office for therapists.', price: 38, capacity: 3, area: 11, amenities: psych, equipment: 'Fauteuils, bureau, bruit blanc.', policy: 'flexible', minHours: 1, weekly: avail([{ start: '08:00', end: '21:00' }], [{ start: '09:00', end: '15:00' }]) });
  listing({ host: hPT, country: 'PT', city: 'Lisboa', category: 'dental', neighborhood: 'Avenidas Novas', title: 'Gabinete de medicina dentária licenciado ERS', description: 'Gabinete totalmente equipado em clínica licenciada pela ERS. Esterilização e assistente disponíveis mediante marcação.', price: 35, day: 250, capacity: 3, area: 13, amenities: [...dental, 'xray', 'elevator'], equipment: 'Cadeira Sirona, autoclave, RX intraoral, micromotor.', license: true, policy: 'moderate', deposit: 150, weekly: avail([{ start: '08:00', end: '10:00' }, { start: '18:00', end: '21:00' }], [{ start: '09:00', end: '14:00' }]) });
  listing({ host: hES, country: 'ES', city: 'Madrid', category: 'classroom', neighborhood: 'Centro', title: 'Aula para formación con 25 plazas', description: 'Aula luminosa con proyector y pizarra, ideal para cursos, oposiciones y talleres.', price: 40, day: 280, capacity: 25, area: 50, amenities: ['wifi', 'air_conditioning', 'projector', 'whiteboard', 'chairs', 'desks', 'restroom', 'accessibility'], equipment: 'Proyector, pizarra, 25 sillas con pala.', policy: 'moderate', instant: false, weekly: avail([{ start: '16:00', end: '22:00' }], [{ start: '09:00', end: '20:00' }]) });
  listing({ host: hIT, country: 'IT', city: 'Milano', category: 'law', neighborhood: 'Brera', title: 'Sala riunioni in studio legale', description: 'Elegante sala riunioni per incontri con clienti, mediazioni e deposizioni. Segreteria disponibile.', price: 45, capacity: 8, area: 28, amenities: ['wifi', 'air_conditioning', 'reception', 'video_conference', 'coffee', 'printer'], equipment: 'Tavolo per 8, schermo, sistema di videoconferenza.', policy: 'moderate', weekly: avail([{ start: '08:00', end: '20:00' }]) });
  listing({ host: hGB, country: 'GB', city: 'London', category: 'medical', neighborhood: 'Marylebone', title: 'CQC-registered consulting room on Harley Street', description: 'Elegant consulting room within a CQC-registered clinic. Reception and patient waiting area included.', price: 55, day: 400, capacity: 3, area: 14, amenities: [...medical, 'elevator'], equipment: 'Examination couch, desk, sink, sharps and clinical waste disposal.', license: true, policy: 'strict', deposit: 200, guarantor: 'optional', weekly: avail([{ start: '07:00', end: '09:00' }, { start: '17:00', end: '21:00' }], [{ start: '09:00', end: '17:00' }]) });
  listing({ host: hFR, country: 'FR', city: 'Paris', category: 'physio', neighborhood: 'Le Marais', title: 'Cabinet de kinésithérapie équipé', description: 'Cabinet avec table électrique, espace de rééducation et vestiaire. Accès PMR.', price: 30, capacity: 3, area: 20, amenities: ['wifi', 'stretcher', 'sink', 'restroom', 'accessibility', 'lockers'], equipment: 'Table électrique, matériel de rééducation, électrothérapie.', license: true, policy: 'moderate', weekly: avail([{ start: '07:00', end: '09:00' }, { start: '19:00', end: '22:00' }], [{ start: '08:00', end: '18:00' }]) });
  listing({ host: hDE, country: 'DE', city: 'Berlin', category: 'psychology', neighborhood: 'Mitte', title: 'Ruhiger Therapieraum in Berlin-Mitte', description: 'Schallgeschützter Therapieraum für Psychotherapie und Coaching, stundenweise buchbar.', price: 25, capacity: 3, area: 16, amenities: psych, equipment: 'Zwei Sessel, Liege, Schreibtisch.', policy: 'flexible', minHours: 1, weekly: avail([{ start: '08:00', end: '21:00' }], [{ start: '09:00', end: '16:00' }]) });
  listing({ host: hCN, country: 'CN', city: '上海 Shanghai', category: 'aesthetics', neighborhood: '静安区 Jing\'an', title: '静安共享美容诊疗室 Shared aesthetics room', description: '设备齐全的共享美容诊疗室,按小时预订。Fully equipped aesthetics room for licensed practitioners.', price: 280, capacity: 3, area: 18, amenities: ['wifi', 'air_conditioning', 'stretcher', 'sink', 'reception', 'restroom'], equipment: '电动美容床、消毒柜、皮肤检测仪', license: true, policy: 'moderate', weekly: avail([{ start: '09:00', end: '21:00' }], [{ start: '10:00', end: '18:00' }]) });
  listing({ host: hJP, country: 'JP', city: '東京 Tokyo', category: 'coworking', neighborhood: '渋谷 Shibuya', title: '渋谷の個室ワークスペース Private workspace in Shibuya', description: '静かな個室。オンライン会議や面談に最適。Quiet private room ideal for online meetings and interviews.', price: 2200, capacity: 4, area: 10, amenities: ['wifi', 'air_conditioning', 'desks', 'chairs', 'video_conference', 'lockers', 'security_24h'], equipment: 'Monitor 27", webcam, ring light.', policy: 'flexible', minHours: 1, weekly: avail([{ start: '07:00', end: '23:00' }], [{ start: '08:00', end: '22:00' }], [{ start: '08:00', end: '22:00' }]) });
  listing({ host: hIN, country: 'IN', city: 'Mumbai', category: 'nutrition', neighborhood: 'Bandra West', title: 'Consultation room for nutritionists & dietitians', description: 'Bright consultation room with body composition analyser and a demo kitchenette.', price: 900, capacity: 4, area: 15, amenities: ['wifi', 'air_conditioning', 'kitchenette', 'reception', 'waiting_room', 'restroom'], equipment: 'InBody analyser, weighing scale, demo kitchen.', policy: 'moderate', weekly: avail([{ start: '08:00', end: '20:00' }], [{ start: '09:00', end: '14:00' }]) });
  listing({ host: hAE, country: 'AE', city: 'Dubai', category: 'meeting', neighborhood: 'DIFC', title: 'Boardroom for 12 in DIFC', description: 'Premium boardroom with skyline views, VC system and concierge. Ideal for arbitration hearings, investor meetings and trainings.', price: 350, day: 2500, capacity: 12, area: 45, amenities: ['wifi', 'air_conditioning', 'reception', 'video_conference', 'coffee', 'screen', 'parking', 'security_24h'], equipment: '85" screen, Poly VC, whiteboard.', policy: 'strict', guarantor: 'optional', weekly: avail([{ start: '08:00', end: '20:00' }], undefined, [{ start: '08:00', end: '20:00' }]) });
  listing({ host: hIL, country: 'IL', city: 'Tel Aviv', category: 'dental', neighborhood: 'Rothschild', title: 'Dental treatment room on Rothschild Blvd', description: 'Modern dental room in a licensed clinic. Assistant available on request.', price: 180, capacity: 3, area: 13, amenities: [...dental, 'xray'], equipment: 'Dental unit, autoclave, intraoral X-ray.', license: true, policy: 'moderate', deposit: 600, weekly: { 0: [{ start: '08:00', end: '20:00' }], 1: [{ start: '17:00', end: '21:00' }], 2: [{ start: '17:00', end: '21:00' }], 3: [{ start: '17:00', end: '21:00' }], 4: [{ start: '17:00', end: '21:00' }] } });
  listing({ host: hAU, country: 'AU', city: 'Sydney', category: 'physio', neighborhood: 'Surry Hills', title: 'Allied health treatment room', description: 'Treatment room for physios, osteos and massage therapists with reception support.', price: 40, capacity: 3, area: 14, amenities: ['wifi', 'air_conditioning', 'stretcher', 'sink', 'reception', 'restroom', 'accessibility'], equipment: 'Electric treatment table, TENS unit.', license: true, policy: 'moderate', weekly: avail([{ start: '07:00', end: '21:00' }], [{ start: '08:00', end: '16:00' }]) });
  listing({ host: hAR, country: 'AR', city: 'Buenos Aires', category: 'psychology', neighborhood: 'Palermo', title: 'Consultorio de psicología en Palermo', description: 'Consultorio cálido e insonorizado para psicoterapia. Sala de espera compartida.', price: 12000, capacity: 3, area: 12, amenities: psych, equipment: 'Diván, dos sillones, escritorio.', policy: 'flexible', minHours: 1, weekly: avail([{ start: '08:00', end: '22:00' }], [{ start: '09:00', end: '14:00' }]) });
  listing({ host: hCO, country: 'CO', city: 'Bogotá', category: 'auditorium', neighborhood: 'Chapinero', title: 'Auditorio para 80 personas', description: 'Auditorio con sonido, proyección y cabina técnica para conferencias y lanzamientos.', price: 380000, day: 2800000, capacity: 80, area: 160, amenities: ['wifi', 'projector', 'screen', 'sound_system', 'microphone', 'restroom', 'accessibility'], equipment: 'Proyector láser, 4 micrófonos inalámbricos, consola.', instant: false, policy: 'strict', guarantor: 'required', minHours: 3, cleaning: 150000, weekly: avail([{ start: '17:00', end: '22:00' }], [{ start: '08:00', end: '22:00' }]) });
  listing({ host: hCL, country: 'CL', city: 'Santiago', category: 'coworking', neighborhood: 'Providencia', title: 'Oficina privada para 4 en Providencia', description: 'Oficina privada amoblada con acceso a café y salas comunes.', price: 12000, capacity: 4, area: 16, amenities: ['wifi', 'desks', 'chairs', 'coffee', 'printer', 'lockers'], equipment: 'Escritorios, sillas ergonómicas, monitor.', policy: 'flexible', minHours: 1, weekly: avail([{ start: '08:00', end: '20:00' }]) });
  listing({ host: hCR, country: 'CR', city: 'San José', category: 'veterinary', neighborhood: 'Escazú', title: 'Consultorio veterinario equipado', description: 'Consultorio con mesa de acero, balanza y área de lavado para veterinarios independientes.', price: 18000, capacity: 3, area: 16, amenities: ['wifi', 'air_conditioning', 'sink', 'biohazard_disposal', 'restroom'], equipment: 'Mesa de acero inoxidable, balanza, autoclave.', license: true, policy: 'moderate', weekly: avail([{ start: '07:00', end: '12:00' }, { start: '16:00', end: '20:00' }], [{ start: '08:00', end: '13:00' }]) });
  listing({ host: hPA, country: 'PA', city: 'Ciudad de Panamá', category: 'meeting', neighborhood: 'Marbella', title: 'Sala de reuniones con vista al mar', description: 'Sala ejecutiva para 8 personas con videoconferencia en Marbella.', price: 35, capacity: 8, area: 24, amenities: ['wifi', 'air_conditioning', 'video_conference', 'coffee', 'screen', 'parking'], equipment: 'Pantalla 65", cámara, altavoz.', policy: 'moderate', weekly: avail([{ start: '08:00', end: '19:00' }]) });

  // Histórico: reservas concluídas com avaliações mútuas visíveis
  pastBooking(L1, guest, 'Atendimento particular — restaurações', [
    { rating: 5, comment: 'Consultório impecável, equipamentos novos e recepção muito atenciosa. Voltarei toda semana.', host: 5, hostComment: 'Dra. Camila deixou tudo organizado e saiu no horário. Recomendo!' },
  ], 40, [{ rating: 5, comment: 'Ambiente limpo, confortável e fácil de chegar pelo metrô.' }, { rating: 4, comment: 'Sala agradável, apenas a recepção estava um pouco cheia.' }]);
  pastBooking(L1, guest2, 'Evaluación de pacientes', [{ rating: 4, comment: 'Muy buen consultorio, el compresor es un poco ruidoso pero todo funcionó bien.', host: 5, hostComment: 'Excelente profesional, muy cuidadoso con el equipo.' }], 25);
  pastBooking(L2, guest, 'Psicoterapia individual', [{ rating: 5, comment: 'Sala silenciosa de verdade, pacientes elogiaram o ambiente acolhedor.', host: 5, hostComment: 'Locatária pontual e cuidadosa.' }], 18, [{ rating: 5, comment: 'Me senti muito à vontade, sala linda e reservada.' }]);
  pastBooking(L3, guest2, 'Curso de capacitação', [{ rating: 4, comment: 'Sala ampla, projetor ótimo. Faltou café no intervalo.', host: 4, hostComment: 'Tudo certo, apenas atrasou 10 minutos para liberar a sala.' }], 30);
  pastBooking(L4, guest2, 'Consulta de ortodoncia', [{ rating: 5, comment: 'Consultorio muy completo y bien ubicado. Recepción amable.', host: 5, hostComment: '¡Excelente huésped!' }], 20);
  await withTx(async (tx) => {
    for (const u of S.users) await repo.insertUser(tx, u);
    for (const l of S.listings) await repo.insertListing(tx, l);
    for (const b of S.bookings) await repo.saveBooking(tx, b);
    for (const p of S.payments) await repo.savePayment(tx, p);
    for (const r of S.reviews) await repo.insertReview(tx, r);
    for (const i of S.invites) await repo.insertInvite(tx, i);
  });
  return { users: S.users.length, listings: S.listings.length };
}

function pastBooking(l: Listing, guest: User, purpose: string, reviews: Array<{ rating: number; comment: string; host: number; hostComment: string }>, daysAgo: number, clientReviews: Array<{ rating: number; comment: string }> = []) {
  const date = addDays(todayInZone(l.timezone), -daysAgo);
  const windows = Object.values(l.weeklyAvailability)[0] ?? [{ start: '08:00', end: '12:00' }];
  const w = windows[0];
  const startMin = Number(w.start.slice(0, 2));
  const occ = { date, start: w.start, end: `${String(Math.min(startMin + l.minHours, 22)).padStart(2, '0')}:${w.start.slice(3)}` };
  const price = computePrice(l, [occ]);
  const b: Booking = {
    id: id('bk'), listingId: l.id, guestId: guest.id, hostId: l.hostId, occurrences: [occ], guests: 1, purpose, status: 'completed', price,
    paymentMethod: 'card', cancellationPolicy: l.cancellationPolicy, createdAt: new Date(Date.now() - (daysAgo + 7) * 86400000).toISOString(),
    confirmedAt: new Date(Date.now() - (daysAgo + 7) * 86400000).toISOString(), clientReviewsEnabled: clientReviews.length > 0,
    rulesAcceptedAt: new Date().toISOString(), rulesVersion: RULES_VERSION, attendance: [{ date, checkInAt: new Date(Date.now() - daysAgo * 86400000).toISOString(), checkOutAt: new Date(Date.now() - daysAgo * 86400000 + 7200000).toISOString(), overstayMinutes: 0 }],
    completedAt: new Date(Date.now() - daysAgo * 86400000).toISOString(), isConsumer: false,
  };
  S.bookings.push(b);
  S.payments.push({ id: id('pay'), bookingId: b.id, provider: 'simulated', method: 'card', currency: price.currency, amount: price.total, refunded: 0, extraCharges: [], depositHold: 0, depositStatus: 'none', status: 'captured', payoutStatus: 'paid', payoutAmount: price.hostPayout, createdAt: b.createdAt, history: [] });
  b.paymentId = S.payments[S.payments.length - 1].id;
  const at = new Date(Date.now() - (daysAgo - 1) * 86400000).toISOString();
  for (const r of reviews) {
    S.reviews.push({ id: id('rev'), kind: 'guest_to_listing', bookingId: b.id, listingId: l.id, authorId: guest.id, authorName: guest.name.replace('Dra. ', '').split(' ')[0], targetUserId: l.hostId, rating: r.rating, categories: { cleanliness: r.rating, accuracy: r.rating, equipment: r.rating, location: 5, communication: 5, value: r.rating }, comment: r.comment, createdAt: at, visible: true });
    S.reviews.push({ id: id('rev'), kind: 'host_to_guest', bookingId: b.id, listingId: l.id, authorId: l.hostId, authorName: S.users.find((u) => u.id === l.hostId)!.name, targetUserId: guest.id, rating: r.host, categories: { punctuality: r.host, care: 5, rules: 5, communication: 5 }, comment: r.hostComment, wouldRecommend: true, createdAt: at, visible: true });
  }
  for (const c of clientReviews) {
    const tok = token();
    S.invites.push({ token: tok, bookingId: b.id, listingId: l.id, createdAt: at, expiresAt: at, usedAt: at });
    S.reviews.push({ id: id('rev'), kind: 'client_to_listing', bookingId: b.id, listingId: l.id, authorName: 'Cliente', rating: c.rating, categories: { comfort: c.rating, cleanliness: 5, accessibility: 4, location: 5 }, comment: c.comment, createdAt: at, visible: true });
  }
}

// npm run db:reset — apaga o banco de desenvolvimento e recria com dados demo
if (process.argv.includes('--reset')) {
  await dropAll();
  await migrate();
  const n = await seed();
  console.log(`Seed concluído: ${n.users} usuários, ${n.listings} espaços.`);
  await pool.end();
}
