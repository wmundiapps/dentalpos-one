// Catálogo de países atendidos, com moeda, idiomas, cidades (fuso horário),
// meios de pagamento locais e referências legais/regulatórias.
//
// IMPORTANTE: alíquotas e referências legais são valores de REFERÊNCIA para
// parametrização do produto. Antes de operar em cada país, validar com
// contador e advogado locais (ver docs/legal/*/country-rules.md).

import type { LocaleCode, SpaceCategory } from './types';

export type RegionId =
  | 'north_america' | 'south_america' | 'central_america' | 'europe' | 'asia' | 'middle_east' | 'oceania';

export type PaymentMethodId =
  | 'card' | 'apple_pay' | 'google_pay' | 'paypal'
  | 'pix' | 'boleto'
  | 'oxxo' | 'spei'
  | 'interac' | 'ach' | 'pre_authorized_debit'
  | 'mercado_pago' | 'pse' | 'webpay' | 'yape' | 'bank_transfer'
  | 'sepa_debit' | 'mb_way' | 'multibanco' | 'bizum' | 'satispay' | 'cartes_bancaires' | 'klarna' | 'giropay_wero'
  | 'pay_by_bank' | 'bacs_debit'
  | 'alipay' | 'wechat_pay' | 'unionpay'
  | 'konbini' | 'paypay' | 'jcb'
  | 'upi' | 'rupay' | 'netbanking'
  | 'bit' | 'payid' | 'bpay';

export interface City { name: string; tz: string }

export interface CountryConfig {
  code: string;              // ISO 3166-1 alfa-2
  region: RegionId;
  currency: string;          // ISO 4217
  defaultLocale: LocaleCode;
  locales: LocaleCode[];
  cities: City[];
  paymentMethods: PaymentMethodId[];
  taxName: string;           // tributo sobre a taxa de serviço da plataforma
  taxRate: number;           // alíquota de referência (0.16 = 16%)
  taxNote?: string;
  withdrawalDays: number;    // direito de arrependimento para consumidores (0 = não se aplica / ver nota)
  minAge: number;
  dataProtectionLaw: string;
  consumerLaw: string;
  documentLabel: string;     // documento de identificação usual
  companyIdLabel: string;    // identificação fiscal de empresa
  licenseBodies: Partial<Record<SpaceCategory | 'default', string>>;
  notes?: string;
}

export const REGIONS: RegionId[] = [
  'south_america', 'central_america', 'north_america', 'europe', 'middle_east', 'asia', 'oceania',
];

const LATAM_GENERIC_LICENSE = {
  default: 'Colegio/registro profesional competente',
};

export const COUNTRIES: CountryConfig[] = [
  // ───────────── América do Sul ─────────────
  {
    code: 'BR', region: 'south_america', currency: 'BRL', defaultLocale: 'pt-BR', locales: ['pt-BR', 'en', 'es'],
    cities: [
      { name: 'São Paulo', tz: 'America/Sao_Paulo' }, { name: 'Rio de Janeiro', tz: 'America/Sao_Paulo' },
      { name: 'Belo Horizonte', tz: 'America/Sao_Paulo' }, { name: 'Brasília', tz: 'America/Sao_Paulo' },
      { name: 'Curitiba', tz: 'America/Sao_Paulo' }, { name: 'Porto Alegre', tz: 'America/Sao_Paulo' },
      { name: 'Salvador', tz: 'America/Bahia' }, { name: 'Recife', tz: 'America/Recife' },
      { name: 'Fortaleza', tz: 'America/Fortaleza' }, { name: 'Goiânia', tz: 'America/Sao_Paulo' },
      { name: 'Florianópolis', tz: 'America/Sao_Paulo' }, { name: 'Manaus', tz: 'America/Manaus' },
    ],
    paymentMethods: ['pix', 'card', 'boleto', 'apple_pay', 'google_pay', 'mercado_pago'],
    taxName: 'ISS', taxRate: 0.05,
    taxNote: 'ISS municipal (2% a 5%). Na transição da Reforma Tributária (LC 214/2025) observar CBS/IBS.',
    withdrawalDays: 7, minAge: 18,
    dataProtectionLaw: 'LGPD — Lei 13.709/2018',
    consumerLaw: 'Código de Defesa do Consumidor — Lei 8.078/1990 (art. 49: arrependimento em 7 dias)',
    documentLabel: 'CPF', companyIdLabel: 'CNPJ',
    licenseBodies: {
      dental: 'CRO — Conselho Regional de Odontologia', medical: 'CRM — Conselho Regional de Medicina',
      psychology: 'CRP — Conselho Regional de Psicologia', law: 'OAB — Ordem dos Advogados do Brasil',
      physio: 'CREFITO', nutrition: 'CRN', veterinary: 'CRMV', aesthetics: 'Conselho profissional da área (CRBM, CRF, CRO, CRM…)',
      default: 'Conselho profissional competente',
    },
    notes: 'Estabelecimentos de saúde exigem alvará/licença sanitária (Vigilância Sanitária) e responsável técnico. A cessão por hora não caracteriza locação empresarial (Lei 8.245/1991) nem gera direito a renovação.',
  },
  {
    code: 'AR', region: 'south_america', currency: 'ARS', defaultLocale: 'es', locales: ['es', 'en', 'pt-BR'],
    cities: [
      { name: 'Buenos Aires', tz: 'America/Argentina/Buenos_Aires' }, { name: 'Córdoba', tz: 'America/Argentina/Cordoba' },
      { name: 'Rosario', tz: 'America/Argentina/Cordoba' }, { name: 'Mendoza', tz: 'America/Argentina/Mendoza' },
    ],
    paymentMethods: ['card', 'mercado_pago', 'bank_transfer'],
    taxName: 'IVA', taxRate: 0.21, withdrawalDays: 10, minAge: 18,
    dataProtectionLaw: 'Ley 25.326 de Protección de Datos Personales',
    consumerLaw: 'Ley 24.240 de Defensa del Consumidor (art. 34: revocación en 10 días)',
    documentLabel: 'DNI', companyIdLabel: 'CUIT',
    licenseBodies: { dental: 'Colegio de Odontólogos / matrícula provincial', medical: 'Matrícula médica (Ministerio de Salud / provincia)', psychology: 'Colegio de Psicólogos', law: 'Colegio de Abogados', default: 'Matrícula profesional' },
  },
  {
    code: 'BO', region: 'south_america', currency: 'BOB', defaultLocale: 'es', locales: ['es', 'en'],
    cities: [{ name: 'La Paz', tz: 'America/La_Paz' }, { name: 'Santa Cruz de la Sierra', tz: 'America/La_Paz' }, { name: 'Cochabamba', tz: 'America/La_Paz' }],
    paymentMethods: ['card', 'bank_transfer'],
    taxName: 'IVA', taxRate: 0.13, withdrawalDays: 0, minAge: 18,
    dataProtectionLaw: 'Constitución Política del Estado (art. 130) y normas sectoriales',
    consumerLaw: 'Ley 453 General de los Derechos de las Usuarias y los Usuarios y de las Consumidoras y los Consumidores',
    documentLabel: 'CI', companyIdLabel: 'NIT', licenseBodies: LATAM_GENERIC_LICENSE,
  },
  {
    code: 'CL', region: 'south_america', currency: 'CLP', defaultLocale: 'es', locales: ['es', 'en'],
    cities: [{ name: 'Santiago', tz: 'America/Santiago' }, { name: 'Valparaíso', tz: 'America/Santiago' }, { name: 'Concepción', tz: 'America/Santiago' }],
    paymentMethods: ['card', 'webpay', 'mercado_pago', 'bank_transfer'],
    taxName: 'IVA', taxRate: 0.19, withdrawalDays: 10, minAge: 18,
    dataProtectionLaw: 'Ley 19.628 y Ley 21.719 (nueva ley de datos personales)',
    consumerLaw: 'Ley 19.496 de Protección de los Derechos de los Consumidores (retracto en compras a distancia)',
    documentLabel: 'RUT', companyIdLabel: 'RUT', licenseBodies: { dental: 'Superintendencia de Salud — Registro Nacional de Prestadores', medical: 'Superintendencia de Salud — Registro Nacional de Prestadores', psychology: 'Superintendencia de Salud — Registro Nacional de Prestadores', law: 'Título de abogado — Corte Suprema', default: 'Registro profesional' },
  },
  {
    code: 'CO', region: 'south_america', currency: 'COP', defaultLocale: 'es', locales: ['es', 'en'],
    cities: [{ name: 'Bogotá', tz: 'America/Bogota' }, { name: 'Medellín', tz: 'America/Bogota' }, { name: 'Cali', tz: 'America/Bogota' }, { name: 'Barranquilla', tz: 'America/Bogota' }],
    paymentMethods: ['card', 'pse', 'mercado_pago', 'bank_transfer'],
    taxName: 'IVA', taxRate: 0.19, withdrawalDays: 5, minAge: 18,
    dataProtectionLaw: 'Ley 1581 de 2012 (Habeas Data)',
    consumerLaw: 'Ley 1480 de 2011 — Estatuto del Consumidor (retracto 5 días hábiles)',
    documentLabel: 'Cédula de ciudadanía', companyIdLabel: 'NIT',
    licenseBodies: { dental: 'ReTHUS — Registro Único Nacional del Talento Humano en Salud', medical: 'ReTHUS', psychology: 'Colegio Colombiano de Psicólogos (tarjeta profesional)', law: 'Tarjeta profesional — Consejo Superior de la Judicatura', default: 'Tarjeta profesional' },
  },
  {
    code: 'EC', region: 'south_america', currency: 'USD', defaultLocale: 'es', locales: ['es', 'en'],
    cities: [{ name: 'Quito', tz: 'America/Guayaquil' }, { name: 'Guayaquil', tz: 'America/Guayaquil' }, { name: 'Cuenca', tz: 'America/Guayaquil' }],
    paymentMethods: ['card', 'bank_transfer', 'paypal'],
    taxName: 'IVA', taxRate: 0.15, withdrawalDays: 0, minAge: 18,
    dataProtectionLaw: 'Ley Orgánica de Protección de Datos Personales (2021)',
    consumerLaw: 'Ley Orgánica de Defensa del Consumidor',
    documentLabel: 'Cédula', companyIdLabel: 'RUC', licenseBodies: { default: 'Registro en SENESCYT / ACESS (salud)' },
  },
  {
    code: 'PY', region: 'south_america', currency: 'PYG', defaultLocale: 'es', locales: ['es', 'en', 'pt-BR'],
    cities: [{ name: 'Asunción', tz: 'America/Asuncion' }, { name: 'Ciudad del Este', tz: 'America/Asuncion' }, { name: 'Encarnación', tz: 'America/Asuncion' }],
    paymentMethods: ['card', 'bank_transfer'],
    taxName: 'IVA', taxRate: 0.10, withdrawalDays: 0, minAge: 18,
    dataProtectionLaw: 'Legislación vigente de protección de datos personales',
    consumerLaw: 'Ley 1334/98 de Defensa del Consumidor y del Usuario',
    documentLabel: 'Cédula', companyIdLabel: 'RUC', licenseBodies: { default: 'Registro profesional — Ministerio de Salud / Corte Suprema' },
  },
  {
    code: 'PE', region: 'south_america', currency: 'PEN', defaultLocale: 'es', locales: ['es', 'en'],
    cities: [{ name: 'Lima', tz: 'America/Lima' }, { name: 'Arequipa', tz: 'America/Lima' }, { name: 'Trujillo', tz: 'America/Lima' }, { name: 'Cusco', tz: 'America/Lima' }],
    paymentMethods: ['card', 'yape', 'mercado_pago', 'bank_transfer'],
    taxName: 'IGV', taxRate: 0.18, withdrawalDays: 0, minAge: 18,
    dataProtectionLaw: 'Ley 29733 de Protección de Datos Personales',
    consumerLaw: 'Código de Protección y Defensa del Consumidor — Ley 29571',
    documentLabel: 'DNI', companyIdLabel: 'RUC',
    licenseBodies: { dental: 'Colegio Odontológico del Perú', medical: 'Colegio Médico del Perú', psychology: 'Colegio de Psicólogos del Perú', law: 'Colegio de Abogados', default: 'Colegiatura profesional' },
  },
  {
    code: 'UY', region: 'south_america', currency: 'UYU', defaultLocale: 'es', locales: ['es', 'en', 'pt-BR'],
    cities: [{ name: 'Montevideo', tz: 'America/Montevideo' }, { name: 'Punta del Este', tz: 'America/Montevideo' }],
    paymentMethods: ['card', 'mercado_pago', 'bank_transfer'],
    taxName: 'IVA', taxRate: 0.22, withdrawalDays: 5, minAge: 18,
    dataProtectionLaw: 'Ley 18.331 de Protección de Datos Personales',
    consumerLaw: 'Ley 17.250 de Relaciones de Consumo (rescisión 5 días hábiles)',
    documentLabel: 'Cédula de identidad', companyIdLabel: 'RUT', licenseBodies: { default: 'Registro MSP / Suprema Corte de Justicia' },
  },
  // ───────────── América Central ─────────────
  {
    code: 'PA', region: 'central_america', currency: 'USD', defaultLocale: 'es', locales: ['es', 'en'],
    cities: [{ name: 'Ciudad de Panamá', tz: 'America/Panama' }, { name: 'David', tz: 'America/Panama' }],
    paymentMethods: ['card', 'bank_transfer', 'paypal'],
    taxName: 'ITBMS', taxRate: 0.07, withdrawalDays: 0, minAge: 18,
    dataProtectionLaw: 'Ley 81 de 2019 sobre Protección de Datos Personales',
    consumerLaw: 'Ley 45 de 2007 (ACODECO)', documentLabel: 'Cédula', companyIdLabel: 'RUC', licenseBodies: { default: 'Consejo Técnico de Salud / Corte Suprema (idoneidad)' },
  },
  {
    code: 'CR', region: 'central_america', currency: 'CRC', defaultLocale: 'es', locales: ['es', 'en'],
    cities: [{ name: 'San José', tz: 'America/Costa_Rica' }, { name: 'Heredia', tz: 'America/Costa_Rica' }, { name: 'Liberia', tz: 'America/Costa_Rica' }],
    paymentMethods: ['card', 'bank_transfer', 'paypal'],
    taxName: 'IVA', taxRate: 0.13, withdrawalDays: 8, minAge: 18,
    dataProtectionLaw: 'Ley 8968 de Protección de la Persona frente al Tratamiento de sus Datos Personales',
    consumerLaw: 'Ley 7472 de Promoción de la Competencia y Defensa Efectiva del Consumidor',
    documentLabel: 'Cédula', companyIdLabel: 'Cédula jurídica', licenseBodies: { dental: 'Colegio de Cirujanos Dentistas', medical: 'Colegio de Médicos y Cirujanos', psychology: 'Colegio de Profesionales en Psicología', law: 'Colegio de Abogados y Abogadas', default: 'Colegio profesional' },
  },
  {
    code: 'GT', region: 'central_america', currency: 'GTQ', defaultLocale: 'es', locales: ['es', 'en'],
    cities: [{ name: 'Ciudad de Guatemala', tz: 'America/Guatemala' }, { name: 'Quetzaltenango', tz: 'America/Guatemala' }],
    paymentMethods: ['card', 'bank_transfer'], taxName: 'IVA', taxRate: 0.12, withdrawalDays: 0, minAge: 18,
    dataProtectionLaw: 'Ley de Acceso a la Información Pública (normas aplicables)', consumerLaw: 'Ley de Protección al Consumidor y Usuario (Decreto 006-2003)',
    documentLabel: 'DPI', companyIdLabel: 'NIT', licenseBodies: LATAM_GENERIC_LICENSE,
  },
  {
    code: 'SV', region: 'central_america', currency: 'USD', defaultLocale: 'es', locales: ['es', 'en'],
    cities: [{ name: 'San Salvador', tz: 'America/El_Salvador' }, { name: 'Santa Ana', tz: 'America/El_Salvador' }],
    paymentMethods: ['card', 'bank_transfer'], taxName: 'IVA', taxRate: 0.13, withdrawalDays: 8, minAge: 18,
    dataProtectionLaw: 'Legislación vigente de protección de datos personales', consumerLaw: 'Ley de Protección al Consumidor',
    documentLabel: 'DUI', companyIdLabel: 'NIT', licenseBodies: LATAM_GENERIC_LICENSE,
  },
  {
    code: 'HN', region: 'central_america', currency: 'HNL', defaultLocale: 'es', locales: ['es', 'en'],
    cities: [{ name: 'Tegucigalpa', tz: 'America/Tegucigalpa' }, { name: 'San Pedro Sula', tz: 'America/Tegucigalpa' }],
    paymentMethods: ['card', 'bank_transfer'], taxName: 'ISV', taxRate: 0.15, withdrawalDays: 0, minAge: 18,
    dataProtectionLaw: 'Normas constitucionales de hábeas data', consumerLaw: 'Ley de Protección al Consumidor (Decreto 24-2008)',
    documentLabel: 'DNI', companyIdLabel: 'RTN', licenseBodies: LATAM_GENERIC_LICENSE,
  },
  {
    code: 'NI', region: 'central_america', currency: 'NIO', defaultLocale: 'es', locales: ['es', 'en'],
    cities: [{ name: 'Managua', tz: 'America/Managua' }, { name: 'León', tz: 'America/Managua' }],
    paymentMethods: ['card', 'bank_transfer'], taxName: 'IVA', taxRate: 0.15, withdrawalDays: 0, minAge: 18,
    dataProtectionLaw: 'Ley 787 de Protección de Datos Personales', consumerLaw: 'Ley 842 de Protección de los Derechos de las Personas Consumidoras y Usuarias',
    documentLabel: 'Cédula', companyIdLabel: 'RUC', licenseBodies: LATAM_GENERIC_LICENSE,
  },
  {
    code: 'BZ', region: 'central_america', currency: 'BZD', defaultLocale: 'en', locales: ['en', 'es'],
    cities: [{ name: 'Belize City', tz: 'America/Belize' }, { name: 'Belmopan', tz: 'America/Belize' }],
    paymentMethods: ['card', 'bank_transfer', 'paypal'], taxName: 'GST', taxRate: 0.125, withdrawalDays: 0, minAge: 18,
    dataProtectionLaw: 'Data Protection Act 2021', consumerLaw: 'Consumer Protection legislation in force',
    documentLabel: 'Social Security Card / Passport', companyIdLabel: 'TIN', licenseBodies: { default: 'Professional council / Ministry of Health' },
  },
  // ───────────── América do Norte ─────────────
  {
    code: 'MX', region: 'north_america', currency: 'MXN', defaultLocale: 'es', locales: ['es', 'en'],
    cities: [
      { name: 'Ciudad de México', tz: 'America/Mexico_City' }, { name: 'Guadalajara', tz: 'America/Mexico_City' },
      { name: 'Monterrey', tz: 'America/Monterrey' }, { name: 'Puebla', tz: 'America/Mexico_City' },
      { name: 'Querétaro', tz: 'America/Mexico_City' }, { name: 'Tijuana', tz: 'America/Tijuana' }, { name: 'Cancún', tz: 'America/Cancun' },
    ],
    paymentMethods: ['card', 'oxxo', 'spei', 'mercado_pago', 'paypal', 'apple_pay', 'google_pay'],
    taxName: 'IVA', taxRate: 0.16, withdrawalDays: 5, minAge: 18,
    dataProtectionLaw: 'Ley Federal de Protección de Datos Personales en Posesión de los Particulares (2025)',
    consumerLaw: 'Ley Federal de Protección al Consumidor — PROFECO (revocación 5 días hábiles)',
    documentLabel: 'CURP / INE', companyIdLabel: 'RFC',
    licenseBodies: { dental: 'Cédula profesional (SEP) + COFEPRIS para el establecimiento', medical: 'Cédula profesional (SEP) + COFEPRIS', psychology: 'Cédula profesional (SEP)', law: 'Cédula profesional (SEP)', default: 'Cédula profesional (SEP)' },
    notes: 'Plataformas digitales extranjeras deben observar retenciones de IVA/ISR aplicables (Ley del IVA, Cap. III Bis).',
  },
  {
    code: 'US', region: 'north_america', currency: 'USD', defaultLocale: 'en', locales: ['en', 'es'],
    cities: [
      { name: 'New York', tz: 'America/New_York' }, { name: 'Miami', tz: 'America/New_York' }, { name: 'Orlando', tz: 'America/New_York' },
      { name: 'Boston', tz: 'America/New_York' }, { name: 'Chicago', tz: 'America/Chicago' }, { name: 'Houston', tz: 'America/Chicago' },
      { name: 'Dallas', tz: 'America/Chicago' }, { name: 'Denver', tz: 'America/Denver' }, { name: 'Los Angeles', tz: 'America/Los_Angeles' },
      { name: 'San Francisco', tz: 'America/Los_Angeles' }, { name: 'Seattle', tz: 'America/Los_Angeles' },
    ],
    paymentMethods: ['card', 'ach', 'apple_pay', 'google_pay', 'paypal'],
    taxName: 'Sales tax', taxRate: 0, taxNote: 'Sales tax varies by state/city; marketplace facilitator rules may apply.',
    withdrawalDays: 0, minAge: 18,
    dataProtectionLaw: 'State privacy laws (e.g., CCPA/CPRA in California), HIPAA when handling health data',
    consumerLaw: 'FTC Act and state consumer protection laws', documentLabel: 'Driver license / State ID / Passport', companyIdLabel: 'EIN',
    licenseBodies: { dental: 'State Board of Dentistry', medical: 'State Medical Board', psychology: 'State Board of Psychology', law: 'State Bar', physio: 'State Board of Physical Therapy', default: 'State licensing board' },
    notes: 'Forms 1099-K may be required for host payouts. ADA accessibility rules apply to places of public accommodation.',
  },
  {
    code: 'CA', region: 'north_america', currency: 'CAD', defaultLocale: 'en', locales: ['en', 'fr'],
    cities: [
      { name: 'Toronto', tz: 'America/Toronto' }, { name: 'Montréal', tz: 'America/Toronto' }, { name: 'Vancouver', tz: 'America/Vancouver' },
      { name: 'Calgary', tz: 'America/Edmonton' }, { name: 'Ottawa', tz: 'America/Toronto' }, { name: 'Québec', tz: 'America/Toronto' },
    ],
    paymentMethods: ['card', 'interac', 'pre_authorized_debit', 'apple_pay', 'google_pay', 'paypal'],
    taxName: 'GST/HST', taxRate: 0.05, taxNote: 'GST 5%; HST 13–15% nas províncias harmonizadas; QST no Québec.',
    withdrawalDays: 0, minAge: 18,
    dataProtectionLaw: 'PIPEDA; Québec Law 25', consumerLaw: 'Provincial consumer protection acts (e.g., Ontario CPA 2002, Québec CPA)',
    documentLabel: 'Driver licence / Passport', companyIdLabel: 'Business Number (BN)',
    licenseBodies: { dental: 'Provincial dental regulator (e.g., RCDSO, ODQ)', medical: 'Provincial College of Physicians and Surgeons', psychology: 'Provincial College of Psychologists', law: 'Provincial Law Society / Barreau du Québec', default: 'Provincial regulatory college' },
    notes: 'No Québec, conteúdo e contrato devem estar disponíveis em francês (Charte de la langue française).',
  },
  // ───────────── Europa ─────────────
  {
    code: 'PT', region: 'europe', currency: 'EUR', defaultLocale: 'pt-BR', locales: ['pt-BR', 'en', 'es'],
    cities: [{ name: 'Lisboa', tz: 'Europe/Lisbon' }, { name: 'Porto', tz: 'Europe/Lisbon' }, { name: 'Braga', tz: 'Europe/Lisbon' }, { name: 'Coimbra', tz: 'Europe/Lisbon' }, { name: 'Faro', tz: 'Europe/Lisbon' }, { name: 'Funchal', tz: 'Atlantic/Madeira' }],
    paymentMethods: ['card', 'mb_way', 'multibanco', 'sepa_debit', 'apple_pay', 'google_pay', 'paypal'],
    taxName: 'IVA', taxRate: 0.23, withdrawalDays: 14, minAge: 18,
    dataProtectionLaw: 'RGPD (Regulamento UE 2016/679) e Lei 58/2019', consumerLaw: 'Decreto-Lei 24/2014 (contratos à distância; exceções do art. 17)',
    documentLabel: 'Cartão de Cidadão / NIF', companyIdLabel: 'NIPC',
    licenseBodies: { dental: 'Ordem dos Médicos Dentistas', medical: 'Ordem dos Médicos', psychology: 'Ordem dos Psicólogos Portugueses', law: 'Ordem dos Advogados', physio: 'Ordem dos Fisioterapeutas', nutrition: 'Ordem dos Nutricionistas', default: 'Ordem profissional competente' },
    notes: 'Unidades de saúde licenciadas pela ERS — Entidade Reguladora da Saúde. Plataforma sujeita ao Regulamento de Serviços Digitais (DSA) e à Diretiva DAC7.',
  },
  {
    code: 'ES', region: 'europe', currency: 'EUR', defaultLocale: 'es', locales: ['es', 'en'],
    cities: [{ name: 'Madrid', tz: 'Europe/Madrid' }, { name: 'Barcelona', tz: 'Europe/Madrid' }, { name: 'Valencia', tz: 'Europe/Madrid' }, { name: 'Sevilla', tz: 'Europe/Madrid' }, { name: 'Málaga', tz: 'Europe/Madrid' }, { name: 'Bilbao', tz: 'Europe/Madrid' }, { name: 'Las Palmas de Gran Canaria', tz: 'Atlantic/Canary' }],
    paymentMethods: ['card', 'bizum', 'sepa_debit', 'apple_pay', 'google_pay', 'paypal'],
    taxName: 'IVA', taxRate: 0.21, withdrawalDays: 14, minAge: 18,
    dataProtectionLaw: 'RGPD y LOPDGDD (Ley Orgánica 3/2018)', consumerLaw: 'Real Decreto Legislativo 1/2007 (TRLGDCU; excepciones del art. 103)',
    documentLabel: 'DNI / NIE', companyIdLabel: 'NIF/CIF',
    licenseBodies: { dental: 'Colegio Oficial de Dentistas', medical: 'Colegio Oficial de Médicos', psychology: 'Colegio Oficial de la Psicología', law: 'Colegio de Abogados', physio: 'Colegio de Fisioterapeutas', default: 'Colegio profesional' },
    notes: 'Centros sanitarios requieren autorización sanitaria autonómica (RD 1277/2003).',
  },
  {
    code: 'IT', region: 'europe', currency: 'EUR', defaultLocale: 'it', locales: ['it', 'en'],
    cities: [{ name: 'Roma', tz: 'Europe/Rome' }, { name: 'Milano', tz: 'Europe/Rome' }, { name: 'Napoli', tz: 'Europe/Rome' }, { name: 'Torino', tz: 'Europe/Rome' }, { name: 'Firenze', tz: 'Europe/Rome' }, { name: 'Bologna', tz: 'Europe/Rome' }],
    paymentMethods: ['card', 'satispay', 'sepa_debit', 'klarna', 'apple_pay', 'google_pay', 'paypal'],
    taxName: 'IVA', taxRate: 0.22, withdrawalDays: 14, minAge: 18,
    dataProtectionLaw: 'GDPR e Codice Privacy (D.Lgs. 196/2003)', consumerLaw: 'Codice del Consumo (D.Lgs. 206/2005; eccezioni art. 59)',
    documentLabel: "Carta d'identità / Codice fiscale", companyIdLabel: 'Partita IVA',
    licenseBodies: { dental: 'Albo degli Odontoiatri (OMCeO)', medical: 'Ordine dei Medici (OMCeO)', psychology: 'Ordine degli Psicologi', law: "Ordine degli Avvocati", physio: 'Ordine TSRM-PSTRP', default: 'Ordine/Albo professionale' },
    notes: 'Studi medici/odontoiatrici soggetti ad autorizzazione sanitaria regionale.',
  },
  {
    code: 'FR', region: 'europe', currency: 'EUR', defaultLocale: 'fr', locales: ['fr', 'en'],
    cities: [{ name: 'Paris', tz: 'Europe/Paris' }, { name: 'Lyon', tz: 'Europe/Paris' }, { name: 'Marseille', tz: 'Europe/Paris' }, { name: 'Toulouse', tz: 'Europe/Paris' }, { name: 'Nice', tz: 'Europe/Paris' }, { name: 'Bordeaux', tz: 'Europe/Paris' }, { name: 'Lille', tz: 'Europe/Paris' }],
    paymentMethods: ['card', 'cartes_bancaires', 'sepa_debit', 'klarna', 'apple_pay', 'google_pay', 'paypal'],
    taxName: 'TVA', taxRate: 0.20, withdrawalDays: 14, minAge: 18,
    dataProtectionLaw: 'RGPD et Loi Informatique et Libertés', consumerLaw: 'Code de la consommation (exceptions art. L221-28)',
    documentLabel: "Carte d'identité / Passeport", companyIdLabel: 'SIRET',
    licenseBodies: { dental: 'Ordre national des chirurgiens-dentistes', medical: 'Ordre des médecins (RPPS)', psychology: 'Registre ADELI / RPPS (psychologues)', law: 'Barreau (Ordre des avocats)', physio: 'Ordre des masseurs-kinésithérapeutes', default: 'Ordre professionnel' },
    notes: 'Conformité ERP (établissements recevant du public) et accessibilité.',
  },
  {
    code: 'DE', region: 'europe', currency: 'EUR', defaultLocale: 'de', locales: ['de', 'en'],
    cities: [{ name: 'Berlin', tz: 'Europe/Berlin' }, { name: 'München', tz: 'Europe/Berlin' }, { name: 'Hamburg', tz: 'Europe/Berlin' }, { name: 'Frankfurt am Main', tz: 'Europe/Berlin' }, { name: 'Köln', tz: 'Europe/Berlin' }, { name: 'Stuttgart', tz: 'Europe/Berlin' }, { name: 'Düsseldorf', tz: 'Europe/Berlin' }],
    paymentMethods: ['card', 'sepa_debit', 'klarna', 'giropay_wero', 'paypal', 'apple_pay', 'google_pay'],
    taxName: 'USt.', taxRate: 0.19, withdrawalDays: 14, minAge: 18,
    dataProtectionLaw: 'DSGVO und BDSG', consumerLaw: 'BGB §§ 312g, 355 (Widerrufsrecht; Ausnahmen § 312g Abs. 2)',
    documentLabel: 'Personalausweis / Reisepass', companyIdLabel: 'USt-IdNr.',
    licenseBodies: { dental: 'Landeszahnärztekammer (Approbation)', medical: 'Landesärztekammer (Approbation)', psychology: 'Psychotherapeutenkammer', law: 'Rechtsanwaltskammer', physio: 'Berufserlaubnis (Gesundheitsamt)', default: 'Zuständige Kammer' },
    notes: 'Impressumspflicht (DDG) e AGB conforme §§ 305 ff. BGB.',
  },
  {
    code: 'GB', region: 'europe', currency: 'GBP', defaultLocale: 'en', locales: ['en'],
    cities: [{ name: 'London', tz: 'Europe/London' }, { name: 'Manchester', tz: 'Europe/London' }, { name: 'Birmingham', tz: 'Europe/London' }, { name: 'Liverpool', tz: 'Europe/London' }, { name: 'Leeds', tz: 'Europe/London' }, { name: 'Bristol', tz: 'Europe/London' }],
    paymentMethods: ['card', 'pay_by_bank', 'bacs_debit', 'apple_pay', 'google_pay', 'paypal', 'klarna'],
    taxName: 'VAT', taxRate: 0.20, withdrawalDays: 14, minAge: 18,
    dataProtectionLaw: 'UK GDPR and Data Protection Act 2018', consumerLaw: 'Consumer Rights Act 2015; Consumer Contracts Regulations 2013 (exceptions reg. 28)',
    documentLabel: 'Passport / Driving licence', companyIdLabel: 'Company number / VAT number',
    licenseBodies: { dental: 'General Dental Council (GDC)', medical: 'General Medical Council (GMC)', psychology: 'Health and Care Professions Council (HCPC)', law: 'Solicitors Regulation Authority / Bar Standards Board', physio: 'HCPC', default: 'Professional regulator' },
    notes: 'Clinics providing regulated activities must be registered with the CQC (England).',
  },
  // ───────────── Oriente Médio ─────────────
  {
    code: 'AE', region: 'middle_east', currency: 'AED', defaultLocale: 'en', locales: ['en', 'ar'],
    cities: [{ name: 'Dubai', tz: 'Asia/Dubai' }, { name: 'Abu Dhabi', tz: 'Asia/Dubai' }, { name: 'Sharjah', tz: 'Asia/Dubai' }],
    paymentMethods: ['card', 'apple_pay', 'google_pay', 'bank_transfer'],
    taxName: 'VAT', taxRate: 0.05, withdrawalDays: 0, minAge: 21,
    dataProtectionLaw: 'Federal Decree-Law 45/2021 (PDPL); DIFC Data Protection Law 2020 (in DIFC)',
    consumerLaw: 'Federal Law 15/2020 on Consumer Protection', documentLabel: 'Emirates ID / Passport', companyIdLabel: 'Trade licence / TRN',
    licenseBodies: { dental: 'Dubai Health Authority (DHA) / DoH Abu Dhabi / MOHAP', medical: 'DHA / DoH / MOHAP', psychology: 'DHA / DoH / MOHAP', law: 'Legal Affairs Department (Dubai) / Ministry of Justice', default: 'Competent licensing authority' },
    notes: 'Atividades comerciais exigem trade licence; espaços em free zones seguem regras da respectiva zona.',
  },
  {
    code: 'IL', region: 'middle_east', currency: 'ILS', defaultLocale: 'he', locales: ['he', 'en', 'ar'],
    cities: [{ name: 'Tel Aviv', tz: 'Asia/Jerusalem' }, { name: 'Jerusalem', tz: 'Asia/Jerusalem' }, { name: 'Haifa', tz: 'Asia/Jerusalem' }, { name: "Be'er Sheva", tz: 'Asia/Jerusalem' }],
    paymentMethods: ['card', 'bit', 'apple_pay', 'google_pay', 'paypal', 'bank_transfer'],
    taxName: 'VAT (Ma"am)', taxRate: 0.18, withdrawalDays: 14, minAge: 18,
    dataProtectionLaw: 'Protection of Privacy Law 5741-1981 (and Amendment 13)', consumerLaw: 'Consumer Protection Law 5741-1981 (cancellation of distance transactions — 14 days)',
    documentLabel: "Teudat Zehut / Passport", companyIdLabel: 'Company / Osek number',
    licenseBodies: { dental: 'Ministry of Health — Dental licence', medical: 'Ministry of Health — Medical licence', psychology: 'Ministry of Health — Psychologists Register', law: 'Israel Bar Association', default: 'Competent licensing authority' },
    notes: 'Atenção ao Shabat e feriados: anfitrião define disponibilidade.',
  },
  // ───────────── Ásia ─────────────
  {
    code: 'CN', region: 'asia', currency: 'CNY', defaultLocale: 'zh', locales: ['zh', 'en'],
    cities: [{ name: '上海 Shanghai', tz: 'Asia/Shanghai' }, { name: '北京 Beijing', tz: 'Asia/Shanghai' }, { name: '深圳 Shenzhen', tz: 'Asia/Shanghai' }, { name: '广州 Guangzhou', tz: 'Asia/Shanghai' }, { name: '杭州 Hangzhou', tz: 'Asia/Shanghai' }, { name: '成都 Chengdu', tz: 'Asia/Shanghai' }],
    paymentMethods: ['alipay', 'wechat_pay', 'unionpay', 'card'],
    taxName: 'VAT 增值税', taxRate: 0.06, withdrawalDays: 0, minAge: 18,
    dataProtectionLaw: 'Personal Information Protection Law (PIPL), Data Security Law, Cybersecurity Law',
    consumerLaw: 'Law on the Protection of Consumer Rights and Interests; E-Commerce Law',
    documentLabel: '居民身份证 / Passport', companyIdLabel: '统一社会信用代码',
    licenseBodies: { dental: '医师执业证书 (卫健委)', medical: '医师执业证书 (卫健委)', psychology: '心理咨询/治疗资质', law: '律师执业证 (司法局)', default: '主管部门执业资质' },
    notes: 'Operação local exige ICP licence, armazenamento de dados no país (PIPL) e entidade local. Dados de brasileiros e chineses devem ter regras de transferência internacional.',
  },
  {
    code: 'JP', region: 'asia', currency: 'JPY', defaultLocale: 'ja', locales: ['ja', 'en'],
    cities: [{ name: '東京 Tokyo', tz: 'Asia/Tokyo' }, { name: '大阪 Osaka', tz: 'Asia/Tokyo' }, { name: '名古屋 Nagoya', tz: 'Asia/Tokyo' }, { name: '福岡 Fukuoka', tz: 'Asia/Tokyo' }, { name: '札幌 Sapporo', tz: 'Asia/Tokyo' }, { name: '京都 Kyoto', tz: 'Asia/Tokyo' }],
    paymentMethods: ['card', 'jcb', 'konbini', 'paypay', 'apple_pay', 'google_pay'],
    taxName: '消費税', taxRate: 0.10, withdrawalDays: 0, minAge: 18,
    dataProtectionLaw: 'Act on the Protection of Personal Information (APPI)', consumerLaw: 'Consumer Contract Act; Act on Specified Commercial Transactions (表示義務)',
    documentLabel: 'マイナンバーカード / 運転免許証 / Passport', companyIdLabel: '法人番号 / インボイス登録番号',
    licenseBodies: { dental: '歯科医師免許 (厚生労働省)', medical: '医師免許 (厚生労働省)', psychology: '公認心理師', law: '日本弁護士連合会', default: '所管官庁の資格' },
    notes: 'Exibir 特定商取引法に基づく表記. Clínicas precisam de 診療所開設届 no posto de saúde.',
  },
  {
    code: 'IN', region: 'asia', currency: 'INR', defaultLocale: 'en', locales: ['en', 'hi'],
    cities: [{ name: 'Mumbai', tz: 'Asia/Kolkata' }, { name: 'New Delhi', tz: 'Asia/Kolkata' }, { name: 'Bengaluru', tz: 'Asia/Kolkata' }, { name: 'Hyderabad', tz: 'Asia/Kolkata' }, { name: 'Chennai', tz: 'Asia/Kolkata' }, { name: 'Pune', tz: 'Asia/Kolkata' }, { name: 'Kolkata', tz: 'Asia/Kolkata' }],
    paymentMethods: ['upi', 'card', 'rupay', 'netbanking', 'paypal'],
    taxName: 'GST', taxRate: 0.18, withdrawalDays: 0, minAge: 18,
    dataProtectionLaw: 'Digital Personal Data Protection Act, 2023', consumerLaw: 'Consumer Protection Act 2019; Consumer Protection (E-Commerce) Rules 2020',
    documentLabel: 'Aadhaar / PAN / Passport', companyIdLabel: 'GSTIN / PAN',
    licenseBodies: { dental: 'Dental Council of India / State Dental Council', medical: 'National Medical Commission / State Medical Council', psychology: 'Rehabilitation Council of India (clinical psychologists)', law: 'Bar Council of India / State Bar Council', default: 'Competent council' },
    notes: 'E-commerce operators must appoint a grievance officer and collect TCS under GST where applicable. RBI rules on recurring card payments (e-mandates).',
  },
  // ───────────── Oceania ─────────────
  {
    code: 'AU', region: 'oceania', currency: 'AUD', defaultLocale: 'en', locales: ['en', 'zh'],
    cities: [{ name: 'Sydney', tz: 'Australia/Sydney' }, { name: 'Melbourne', tz: 'Australia/Melbourne' }, { name: 'Brisbane', tz: 'Australia/Brisbane' }, { name: 'Perth', tz: 'Australia/Perth' }, { name: 'Adelaide', tz: 'Australia/Adelaide' }, { name: 'Canberra', tz: 'Australia/Sydney' }],
    paymentMethods: ['card', 'payid', 'bpay', 'apple_pay', 'google_pay', 'paypal'],
    taxName: 'GST', taxRate: 0.10, withdrawalDays: 0, minAge: 18,
    dataProtectionLaw: 'Privacy Act 1988 and Australian Privacy Principles', consumerLaw: 'Australian Consumer Law (Competition and Consumer Act 2010, Sch. 2)',
    documentLabel: "Driver licence / Passport", companyIdLabel: 'ABN',
    licenseBodies: { dental: 'Dental Board of Australia (Ahpra)', medical: 'Medical Board of Australia (Ahpra)', psychology: 'Psychology Board of Australia (Ahpra)', law: 'State Law Society', physio: 'Physiotherapy Board of Australia (Ahpra)', default: 'Ahpra / competent board' },
    notes: 'Cancellation fees must be reasonable under ACL unfair contract terms rules.',
  },
];

export const COUNTRY_BY_CODE: Record<string, CountryConfig> = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));

export function getCountry(code: string): CountryConfig {
  const c = COUNTRY_BY_CODE[code];
  if (!c) throw new Error(`País não atendido: ${code}`);
  return c;
}

export function getCity(countryCode: string, cityName: string): City | undefined {
  return COUNTRY_BY_CODE[countryCode]?.cities.find((c) => c.name === cityName);
}

export const SUPPORTED_LOCALES: LocaleCode[] = ['pt-BR', 'en', 'es', 'fr', 'it', 'de', 'zh', 'ja', 'hi', 'ar', 'he'];
export const RTL_LOCALES: LocaleCode[] = ['ar', 'he'];

export const LOCALE_NATIVE_NAMES: Record<LocaleCode, string> = {
  'pt-BR': 'Português', en: 'English', es: 'Español', fr: 'Français', it: 'Italiano', de: 'Deutsch',
  zh: '中文', ja: '日本語', hi: 'हिन्दी', ar: 'العربية', he: 'עברית',
};

// Nome exibido do método de pagamento (marcas/nomes próprios não são traduzidos).
export const PAYMENT_METHOD_LABELS: Record<PaymentMethodId, string> = {
  card: 'Visa / Mastercard / Amex', apple_pay: 'Apple Pay', google_pay: 'Google Pay', paypal: 'PayPal',
  pix: 'Pix', boleto: 'Boleto bancário', oxxo: 'OXXO', spei: 'SPEI', interac: 'Interac', ach: 'ACH bank debit',
  pre_authorized_debit: 'Pre-authorized debit (PAD)', mercado_pago: 'Mercado Pago', pse: 'PSE', webpay: 'Webpay',
  yape: 'Yape', bank_transfer: 'Bank transfer', sepa_debit: 'SEPA Direct Debit', mb_way: 'MB WAY',
  multibanco: 'Multibanco', bizum: 'Bizum', satispay: 'Satispay', cartes_bancaires: 'Cartes Bancaires', klarna: 'Klarna',
  giropay_wero: 'Wero', pay_by_bank: 'Pay by bank (Open Banking)', bacs_debit: 'Bacs Direct Debit',
  alipay: 'Alipay 支付宝', wechat_pay: 'WeChat Pay 微信支付', unionpay: 'UnionPay 银联', konbini: 'コンビニ払い (Konbini)',
  paypay: 'PayPay', jcb: 'JCB', upi: 'UPI', rupay: 'RuPay', netbanking: 'Net banking', bit: 'Bit', payid: 'PayID', bpay: 'BPAY',
};

// Métodos que NÃO permitem pré-autorização (caução) — nesses casos a caução é
// substituída por avalista ou cobrada via cartão adicional.
export const ASYNC_PAYMENT_METHODS: PaymentMethodId[] = [
  'pix', 'boleto', 'oxxo', 'spei', 'multibanco', 'konbini', 'bank_transfer', 'bpay', 'pse', 'netbanking', 'upi', 'bizum', 'mb_way', 'bit', 'payid', 'yape',
];
