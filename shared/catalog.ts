export type Professional = 'lais' | 'duda';

export type UserRole = 'admin' | 'professional';

export type ReturnOption =
  | '15_days'
  | '20_days'
  | '25_days'
  | 'to_arrange'
  | 'specific_date'
  | 'no_schedule';

export type ReturnStatus = 'waiting' | 'confirmed' | 'not_applicable';

export interface ServiceItem {
  id: string;
  name: string;
  price: number;
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  professional: Professional;
}

export interface AttendanceRecord {
  id: string;
  clientId?: string | null;
  professional: Professional;
  clientName: string;
  whatsapp: string;
  whatsappDigits: string;
  serviceDate: string;
  services: ServiceItem[];
  additionals: string[];
  totalPaid: number;
  commissionRate: number;
  commissionAmount: number;
  returnOption: ReturnOption;
  returnDays: number | null;
  returnDate: string | null;
  preferredTimes: string[];
  returnStatus: ReturnStatus;
  extraReturnServices?: ExtraReturnService[];
  createdAt: string;
  updatedAt: string;
}

export interface ExtraReturnService {
  id: string;
  name: string;
  price: number;
  professional: Professional;
}

export interface ClientSummary {
  key: string;
  clientName: string;
  whatsapp: string;
  whatsappDigits: string;
  totalVisits: number;
  lastVisitDate: string;
  professionals: Professional[];
  attendances: AttendanceRecord[];
}

export const DUDA_SERVICES: ServiceItem[] = [
  { id: 'duda_manutencao', name: 'Manutenção', price: 135 },
  { id: 'duda_alongamento_fibra', name: 'Alongamento em fibra', price: 195 },
  { id: 'duda_alongamento_f1', name: 'Alongamento molde F1', price: 175 },
  { id: 'duda_banho_gel', name: 'Banho de gel', price: 140 },
  { id: 'duda_blindagem', name: 'Blindagem / esmaltação em gel', price: 115 },
  { id: 'duda_manicure_pedicure', name: 'Manicure e pedicure', price: 75 },
  { id: 'duda_manicure', name: 'Manicure', price: 40 },
  { id: 'duda_pedicure', name: 'Pedicure', price: 45 },
  { id: 'duda_spa_pes', name: 'Spa dos pés', price: 95 },
  { id: 'duda_remocao', name: 'Remoção', price: 70 },
];

export const DUDA_ADDITIONALS: string[] = [
  'Reposição de unha faltando',
  'Desenho / decoração',
];

export type LashAttendanceType = 'Aplicação' | 'Manutenção';

export const LAIS_LASH_TYPE_SERVICE_IDS: string[] = [
  'lais_volume_brasileiro',
  'lais_volume_brasileiro_express',
  'lais_5d',
  'lais_5d_express',
  'lais_fox',
];

export const LAIS_SERVICES: ServiceItem[] = [
  { id: 'lais_volume_brasileiro', name: 'Volume Brasileiro', price: 150 },
  { id: 'lais_volume_brasileiro_express', name: 'Volume Brasileiro Expresso', price: 100 },
  { id: 'lais_5d', name: '5D', price: 160 },
  { id: 'lais_5d_express', name: '5D Expresso', price: 135 },
  { id: 'lais_fox', name: 'Fox', price: 160 },
  { id: 'lais_efeito_sirena', name: 'Efeito sirena', price: 135 },
  { id: 'lais_sobrancelha', name: 'Sobrancelha', price: 35 },
  { id: 'lais_henna', name: 'Henna', price: 50 },
  { id: 'lais_buco', name: 'Buço', price: 15 },
  { id: 'lais_epilacao_facial', name: 'Epilação facial', price: 50 },
];

export const TIME_SLOTS: string[] = ['Manhã', 'Tarde', 'Noite'];

export interface ReturnOptionMeta {
  value: ReturnOption;
  label: string;
  days: number | null;
}

export const DUDA_RETURN_OPTIONS: ReturnOptionMeta[] = [
  { value: '15_days', label: '15 dias', days: 15 },
  { value: '20_days', label: '20 dias', days: 20 },
  { value: '25_days', label: '25 dias', days: 25 },
  { value: 'to_arrange', label: 'Prefiro combinar outra data', days: null },
  { value: 'no_schedule', label: 'Não desejo agendar no momento', days: null },
];

export const LAIS_RETURN_OPTIONS: ReturnOptionMeta[] = [
  { value: '15_days', label: '15 dias', days: 15 },
  { value: '20_days', label: '20 dias', days: 20 },
  { value: 'to_arrange', label: 'Dia a combinar', days: null },
  { value: 'no_schedule', label: 'Não desejo agendar no momento', days: null },
];

export type ServiceCategoryId =
  | 'extensao_cilios'
  | 'sobrancelhas'
  | 'epilacao_facial_buco'
  | 'alongamento_unhas'
  | 'manicure_pedicure'
  | 'procedimentos_gel'
  | 'spa_pes';

export interface ServiceCategoryMeta {
  id: ServiceCategoryId;
  label: string;
}

export const SERVICE_CATEGORIES: ServiceCategoryMeta[] = [
  { id: 'extensao_cilios', label: 'Extensão de cílios' },
  { id: 'sobrancelhas', label: 'Sobrancelhas' },
  { id: 'epilacao_facial_buco', label: 'Epilação facial e buço' },
  { id: 'alongamento_unhas', label: 'Alongamento de unhas' },
  { id: 'manicure_pedicure', label: 'Manicure e pedicure' },
  { id: 'procedimentos_gel', label: 'Procedimentos em gel' },
  { id: 'spa_pes', label: 'Spa dos pés' },
];

const SERVICE_ID_CATEGORY_MAP: Record<string, ServiceCategoryId> = {
  lais_volume_brasileiro: 'extensao_cilios',
  lais_volume_brasileiro_express: 'extensao_cilios',
  lais_5d: 'extensao_cilios',
  lais_5d_express: 'extensao_cilios',
  lais_fox: 'extensao_cilios',
  lais_efeito_sirena: 'extensao_cilios',
  lais_sobrancelha: 'sobrancelhas',
  lais_henna: 'sobrancelhas',
  lais_buco: 'epilacao_facial_buco',
  lais_epilacao_facial: 'epilacao_facial_buco',
  duda_alongamento_fibra: 'alongamento_unhas',
  duda_alongamento_f1: 'alongamento_unhas',
  duda_manutencao: 'alongamento_unhas',
  duda_remocao: 'alongamento_unhas',
  duda_manicure_pedicure: 'manicure_pedicure',
  duda_manicure: 'manicure_pedicure',
  duda_pedicure: 'manicure_pedicure',
  duda_banho_gel: 'procedimentos_gel',
  duda_blindagem: 'procedimentos_gel',
  duda_spa_pes: 'spa_pes',
};

export function classifyServiceCategory(
  service: { id?: string; name?: string },
  professional?: Professional,
): ServiceCategoryId | null {
  if (service.id && SERVICE_ID_CATEGORY_MAP[service.id]) {
    return SERVICE_ID_CATEGORY_MAP[service.id];
  }

  const norm = (service.name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (!norm) return null;

  if (
    norm.includes('volume brasileiro') ||
    norm.includes('5d') ||
    norm.includes('fox') ||
    norm.includes('sirena') ||
    norm.includes('cilios')
  ) {
    return 'extensao_cilios';
  }
  if (norm.includes('sobrancelha') || norm.includes('henna')) {
    return 'sobrancelhas';
  }
  if (norm.includes('epilacao') || norm.includes('buco')) {
    return 'epilacao_facial_buco';
  }
  if (norm.includes('spa dos pes') || norm.includes('spa')) {
    return 'spa_pes';
  }
  if (
    norm.includes('banho de gel') ||
    norm.includes('blindagem') ||
    norm.includes('esmaltacao em gel')
  ) {
    return 'procedimentos_gel';
  }
  if (norm.includes('manicure') || norm.includes('pedicure')) {
    return 'manicure_pedicure';
  }
  if (
    norm.includes('alongamento') ||
    norm.includes('fibra') ||
    norm.includes('molde f1') ||
    norm.includes('remocao') ||
    (norm.includes('manutencao') && professional !== 'lais')
  ) {
    return 'alongamento_unhas';
  }
  if (norm.includes('manutencao') && professional === 'lais') {
    return 'extensao_cilios';
  }

  return null;
}

export function getServicesCatalog(professional: Professional): ServiceItem[] {
  return professional === 'duda' ? DUDA_SERVICES : LAIS_SERVICES;
}

export function findStudioServiceById(
  serviceId: string,
): ExtraReturnService | null {
  const laisMatch = LAIS_SERVICES.find((item) => item.id === serviceId);
  if (laisMatch) {
    return { ...laisMatch, professional: 'lais' };
  }
  const dudaMatch = DUDA_SERVICES.find((item) => item.id === serviceId);
  if (dudaMatch) {
    return { ...dudaMatch, professional: 'duda' };
  }
  return null;
}

export function getReturnOptionLabel(
  option: ReturnOption,
  professional?: Professional,
): string {
  if (option === 'specific_date') {
    return 'Data e horário específicos';
  }
  const list =
    professional === 'lais' ? LAIS_RETURN_OPTIONS : DUDA_RETURN_OPTIONS;
  const found = list.find((item) => item.value === option);
  return found ? found.label : option;
}

export function getReturnStatusLabel(status: ReturnStatus): string {
  switch (status) {
    case 'waiting':
      return 'Aguardando confirmação';
    case 'confirmed':
      return 'Confirmado';
    default:
      return 'Sem retorno agendado';
  }
}

export function getLocalDateISO(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getBrazilTodayISO(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

export function addDaysToISO(isoDate: string, days: number): string {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return isoDate;
  }
  const [year, month, day] = parts;
  const dt = new Date(year, month - 1, day + days);
  return getLocalDateISO(dt);
}

export function calculateReturnDateISO(serviceDate: string, days: number): string {
  const parts = serviceDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return serviceDate;
  }
  const [year, month, day] = parts;
  const dt = new Date(Date.UTC(year, month - 1, day + days));
  if (dt.getUTCDay() === 0) {
    dt.setUTCDate(dt.getUTCDate() - 1);
  }
  const outYear = dt.getUTCFullYear();
  const outMonth = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const outDay = String(dt.getUTCDate()).padStart(2, '0');
  return `${outYear}-${outMonth}-${outDay}`;
}

export function formatDateBR(isoDate: string | null): string {
  if (!isoDate) return '—';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatBrazilTimeBR(
  isoTimestamp: string | null | undefined,
): string {
  if (!isoTimestamp) return '—';
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function extractDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function normalizeWhatsAppDigits(value: string): string {
  let digits = extractDigits(value);
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  if ((digits.length === 11 || digits.length === 12) && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return digits;
}

export function formatBrazilPhone(value: string): string {
  let digits = extractDigits(value);
  if (digits.length >= 12 && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  if (digits.length >= 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  digits = digits.slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function buildWhatsAppLink(phone: string, message?: string): string {
  let digits = extractDigits(phone);
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }
  const base = `https://wa.me/${digits}`;
  if (message && message.trim().length > 0) {
    return `${base}?text=${encodeURIComponent(message)}`;
  }
  return base;
}

export function parseCurrencyInput(raw: string): number {
  const cleaned = raw.replace(/[^\d.,]/g, '').trim();
  if (!cleaned) return 0;

  // Handle Brazilian formatting like "1.250,50" or "200,00" or "200.50"
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  let normalized = cleaned;
  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma && lastComma !== -1) {
    normalized = cleaned.replace(/,/g, '');
  } else {
    normalized = cleaned.replace(',', '.');
  }

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100) / 100;
}
