import crypto from 'node:crypto';
import type { PoolClient, QueryResultRow } from 'pg';
import { getDatabase, isDatabaseConfigured } from './database.ts';
import type {
  AttendanceRecord,
  AuthUser,
  Professional,
  ReturnOption,
  ReturnStatus,
  ServiceItem,
  UserRole,
} from '../shared/catalog.ts';
import type {
  AgendaAppointment,
  AgendaAppointmentStatus,
  PayoutStatus,
  SetupStatus,
} from '../shared/panelTypes.ts';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'professional')),
    professional TEXT NOT NULL CHECK(professional IN ('lais', 'duda')),
    password_hash TEXT NOT NULL,
    password_configured INTEGER NOT NULL DEFAULT 0 CHECK(password_configured IN (0, 1)),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS attendances (
    id TEXT PRIMARY KEY,
    professional TEXT NOT NULL CHECK(professional IN ('lais', 'duda')),
    client_name TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    whatsapp_digits TEXT NOT NULL,
    service_date TEXT NOT NULL,
    services_json TEXT NOT NULL,
    additionals_json TEXT NOT NULL,
    total_paid NUMERIC(12, 2) NOT NULL,
    commission_rate NUMERIC(5, 4) NOT NULL,
    commission_amount NUMERIC(12, 2) NOT NULL,
    return_option TEXT NOT NULL CHECK(return_option IN ('15_days', '20_days', '25_days', 'to_arrange', 'no_schedule')),
    return_days INTEGER,
    return_date TEXT,
    preferred_times_json TEXT NOT NULL,
    return_status TEXT NOT NULL CHECK(return_status IN ('waiting', 'confirmed', 'not_applicable')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS commission_payouts (
    payout_date TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK(status IN ('pending', 'paid')),
    paid_at TEXT,
    updated_by TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_attendances_professional_date
    ON attendances(professional, service_date DESC, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_attendances_whatsapp
    ON attendances(whatsapp_digits);

  CREATE TABLE IF NOT EXISTS agenda_appointments (
    id TEXT PRIMARY KEY,
    professional TEXT NOT NULL CHECK(professional IN ('lais', 'duda')),
    source_attendance_id TEXT,
    client_name TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    whatsapp_digits TEXT NOT NULL,
    procedure_name TEXT NOT NULL,
    appointment_date TEXT NOT NULL,
    appointment_time TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK(status IN ('confirmed', 'cancelled')) DEFAULT 'confirmed',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (source_attendance_id) REFERENCES attendances(id) ON DELETE SET NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_agenda_unique_slot
    ON agenda_appointments(professional, appointment_date, appointment_time)
    WHERE status = 'confirmed';

  CREATE UNIQUE INDEX IF NOT EXISTS idx_agenda_unique_source
    ON agenda_appointments(source_attendance_id)
    WHERE source_attendance_id IS NOT NULL AND status = 'confirmed';

  CREATE INDEX IF NOT EXISTS idx_agenda_prof_date
    ON agenda_appointments(professional, appointment_date ASC, appointment_time ASC);
`;

interface DbUserRow {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  professional: Professional;
  password_hash: string;
  password_configured: number;
}

// ============================================================================
// IN-MEMORY FALLBACK STORE (used when DATABASE_URL / POSTGRES_URL is unset)
// ============================================================================
const memoryUsers = new Map<string, DbUserRow>([
  [
    'user_lais',
    {
      id: 'user_lais',
      username: 'lais',
      display_name: 'Laís',
      role: 'admin',
      professional: 'lais',
      password_hash: '',
      password_configured: 0,
    },
  ],
  [
    'user_duda',
    {
      id: 'user_duda',
      username: 'duda',
      display_name: 'Duda',
      role: 'professional',
      professional: 'duda',
      password_hash: '',
      password_configured: 0,
    },
  ],
]);

const memorySessions = new Map<
  string,
  { token: string; user_id: string; expires_at: string; created_at: string }
>();
const memoryAttendances = new Map<string, AttendanceRecord>();
const memoryCommissionPayouts = new Map<string, DbCommissionPayoutRow>();
const memoryAgendaAppointments = new Map<string, AgendaAppointment>();

let initialization: Promise<void> | undefined;

export function initializeDatabase(): Promise<void> {
  if (!isDatabaseConfigured()) {
    return Promise.resolve();
  }
  initialization ??= prepareDatabase().catch((error) => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}

async function prepareDatabase(): Promise<void> {
  const client = await getDatabase().connect();
  try {
    await client.query('BEGIN');
    // The transaction lock also works through Neon's transaction pooler.
    // It serializes schema creation across independent Vercel cold starts.
    await client.query('SELECT pg_advisory_xact_lock(20261119, 1)');
    await client.query(SCHEMA);
    const now = new Date().toISOString();
    for (const user of [
      ['user_lais', 'lais', 'Laís', 'admin', 'lais'],
      ['user_duda', 'duda', 'Duda', 'professional', 'duda'],
    ]) {
      await client.query(
        `INSERT INTO users
          (id, username, display_name, role, professional, password_hash, password_configured, created_at)
          VALUES ($1, $2, $3, $4, $5, '', 0, $6)
          ON CONFLICT (username) DO NOTHING`,
        [...user, now],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function execute<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  args: Array<string | number | null> = [],
  client?: PoolClient,
) {
  await initializeDatabase();
  return (client ?? getDatabase()).query<T>(sql, args);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export async function getSetupStatus(): Promise<SetupStatus> {
  if (!isDatabaseConfigured()) {
    const lais = Array.from(memoryUsers.values()).find(
      (r) => r.username === 'lais',
    );
    const duda = Array.from(memoryUsers.values()).find(
      (r) => r.username === 'duda',
    );
    return {
      laisConfigured: Boolean(lais && lais.password_configured === 1),
      dudaConfigured: Boolean(duda && duda.password_configured === 1),
    };
  }

  const rows = (
    await execute('SELECT username, password_configured FROM users', [])
  ).rows as unknown as Array<{ username: string; password_configured: number }>;

  const lais = rows.find((r) => r.username === 'lais');
  const duda = rows.find((r) => r.username === 'duda');

  return {
    laisConfigured: Boolean(lais && lais.password_configured === 1),
    dudaConfigured: Boolean(duda && duda.password_configured === 1),
  };
}

export async function findUserByUsername(
  username: string,
): Promise<DbUserRow | null> {
  if (!isDatabaseConfigured()) {
    const target = username.trim().toLowerCase();
    return (
      Array.from(memoryUsers.values()).find(
        (u) => u.username.toLowerCase() === target,
      ) ?? null
    );
  }

  const row = (
    await execute(
      'SELECT id, username, display_name, role, professional, password_hash, password_configured FROM users WHERE LOWER(username) = LOWER($1)',
      [username.trim()],
    )
  ).rows[0] as unknown as DbUserRow | undefined;
  return row ?? null;
}

export async function findUserById(userId: string): Promise<DbUserRow | null> {
  if (!isDatabaseConfigured()) {
    return memoryUsers.get(userId) ?? null;
  }

  const row = (
    await execute(
      'SELECT id, username, display_name, role, professional, password_hash, password_configured FROM users WHERE id = $1',
      [userId],
    )
  ).rows[0] as unknown as DbUserRow | undefined;
  return row ?? null;
}

export async function configureInitialPassword(
  userId: string,
  password: string,
): Promise<boolean> {
  if (!isDatabaseConfigured()) {
    const user = memoryUsers.get(userId);
    if (!user || user.password_configured !== 0) return false;
    user.password_hash = hashPassword(password);
    user.password_configured = 1;
    return true;
  }

  const result = await execute(
    'UPDATE users SET password_hash = $1, password_configured = 1 WHERE id = $2 AND password_configured = 0',
    [hashPassword(password), userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function updateUserPassword(
  userId: string,
  newPassword: string,
): Promise<void> {
  if (!isDatabaseConfigured()) {
    const user = memoryUsers.get(userId);
    if (user) {
      user.password_hash = hashPassword(newPassword);
      user.password_configured = 1;
    }
    return;
  }

  await execute(
    'UPDATE users SET password_hash = $1, password_configured = 1 WHERE id = $2',
    [hashPassword(newPassword), userId],
  );
}

export async function resetUserPasswordSetup(username: 'duda'): Promise<void> {
  if (!isDatabaseConfigured()) {
    const row = await findUserByUsername(username);
    if (!row) return;
    row.password_hash = '';
    row.password_configured = 0;
    for (const [token, session] of memorySessions.entries()) {
      if (session.user_id === row.id) memorySessions.delete(token);
    }
    return;
  }

  const row = await findUserByUsername(username);
  if (!row) return;
  await execute(
    "UPDATE users SET password_hash = '', password_configured = 0 WHERE id = $1",
    [row.id],
  );
  await execute('DELETE FROM sessions WHERE user_id = $1', [row.id]);
}

export async function createSession(
  userId: string,
): Promise<{ token: string; expiresAt: string }> {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);
  const expiresAt = expires.toISOString();

  if (!isDatabaseConfigured()) {
    memorySessions.set(token, {
      token,
      user_id: userId,
      expires_at: expiresAt,
      created_at: now.toISOString(),
    });
    return { token, expiresAt };
  }

  await execute(
    'INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)',
    [token, userId, expiresAt, now.toISOString()],
  );

  return { token, expiresAt };
}

export async function getSessionUser(
  token: string | undefined,
): Promise<AuthUser | null> {
  if (!token) return null;

  if (!isDatabaseConfigured()) {
    const session = memorySessions.get(token);
    if (!session) return null;
    const user = memoryUsers.get(session.user_id);
    if (!user || user.password_configured !== 1) return null;
    if (new Date(session.expires_at).getTime() <= Date.now()) {
      memorySessions.delete(token);
      return null;
    }
    return {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      professional: user.professional,
    };
  }

  const row = (
    await execute(
      `
      SELECT u.id, u.username, u.display_name, u.role, u.professional, u.password_configured, s.expires_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = $1
      `,
      [token],
    )
  ).rows[0] as unknown as
    | (Omit<DbUserRow, 'password_hash'> & { expires_at: string })
    | undefined;

  if (!row || row.password_configured !== 1) return null;

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await execute('DELETE FROM sessions WHERE token = $1', [token]);
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    professional: row.professional,
  };
}

export async function deleteSession(token: string): Promise<void> {
  if (!isDatabaseConfigured()) {
    memorySessions.delete(token);
    return;
  }
  await execute('DELETE FROM sessions WHERE token = $1', [token]);
}

interface DbAttendanceRow {
  id: string;
  professional: Professional;
  client_name: string;
  whatsapp: string;
  whatsapp_digits: string;
  service_date: string;
  services_json: string;
  additionals_json: string;
  total_paid: string | number;
  commission_rate: string | number;
  commission_amount: string | number;
  return_option: ReturnOption;
  return_days: number | null;
  return_date: string | null;
  preferred_times_json: string;
  return_status: ReturnStatus;
  created_at: string;
  updated_at: string;
}

export function mapAttendanceRow(row: DbAttendanceRow): AttendanceRecord {
  let services: ServiceItem[] = [];
  let additionals: string[] = [];
  let preferredTimes: string[] = [];

  try {
    services = JSON.parse(row.services_json) as ServiceItem[];
  } catch {
    services = [];
  }

  try {
    additionals = JSON.parse(row.additionals_json) as string[];
  } catch {
    additionals = [];
  }

  try {
    preferredTimes = JSON.parse(row.preferred_times_json) as string[];
  } catch {
    preferredTimes = [];
  }

  return {
    id: row.id,
    professional: row.professional,
    clientName: row.client_name,
    whatsapp: row.whatsapp,
    whatsappDigits: row.whatsapp_digits,
    serviceDate: row.service_date,
    services,
    additionals,
    totalPaid: Number(row.total_paid),
    commissionRate: Number(row.commission_rate),
    commissionAmount: Number(row.commission_amount),
    returnOption: row.return_option,
    returnDays: row.return_days,
    returnDate: row.return_date,
    preferredTimes,
    returnStatus: row.return_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertAttendanceInput {
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
}

export async function insertAttendance(
  input: InsertAttendanceInput,
): Promise<AttendanceRecord> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  if (!isDatabaseConfigured()) {
    const record: AttendanceRecord = {
      id,
      professional: input.professional,
      clientName: input.clientName,
      whatsapp: input.whatsapp,
      whatsappDigits: input.whatsappDigits,
      serviceDate: input.serviceDate,
      services: input.services,
      additionals: input.additionals,
      totalPaid: input.totalPaid,
      commissionRate: input.commissionRate,
      commissionAmount: input.commissionAmount,
      returnOption: input.returnOption,
      returnDays: input.returnDays,
      returnDate: input.returnDate,
      preferredTimes: input.preferredTimes,
      returnStatus: input.returnStatus,
      createdAt: now,
      updatedAt: now,
    };
    memoryAttendances.set(id, record);
    return record;
  }

  await execute(
    `
    INSERT INTO attendances (
      id, professional, client_name, whatsapp, whatsapp_digits,
      service_date, services_json, additionals_json, total_paid,
      commission_rate, commission_amount, return_option, return_days,
      return_date, preferred_times_json, return_status, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    `,
    [
      id,
      input.professional,
      input.clientName,
      input.whatsapp,
      input.whatsappDigits,
      input.serviceDate,
      JSON.stringify(input.services),
      JSON.stringify(input.additionals),
      input.totalPaid,
      input.commissionRate,
      input.commissionAmount,
      input.returnOption,
      input.returnDays,
      input.returnDate,
      JSON.stringify(input.preferredTimes),
      input.returnStatus,
      now,
      now,
    ],
  );

  const created = (
    await execute('SELECT * FROM attendances WHERE id = $1', [id])
  ).rows[0] as unknown as DbAttendanceRow;
  return mapAttendanceRow(created);
}

export interface AttendanceQueryFilters {
  professional?: Professional;
  startDate?: string;
  endDate?: string;
  serviceId?: string;
  search?: string;
  returnStatus?: ReturnStatus;
  onlyReturns?: boolean;
}

export async function queryAttendances(
  filters: AttendanceQueryFilters,
): Promise<AttendanceRecord[]> {
  let records: AttendanceRecord[];

  if (!isDatabaseConfigured()) {
    records = Array.from(memoryAttendances.values())
      .filter((rec) => {
        if (filters.professional && rec.professional !== filters.professional)
          return false;
        if (filters.startDate && rec.serviceDate < filters.startDate)
          return false;
        if (filters.endDate && rec.serviceDate > filters.endDate) return false;
        if (filters.returnStatus && rec.returnStatus !== filters.returnStatus)
          return false;
        if (filters.onlyReturns && rec.returnOption === 'no_schedule')
          return false;
        return true;
      })
      .sort(
        (a, b) =>
          b.serviceDate.localeCompare(a.serviceDate) ||
          b.createdAt.localeCompare(a.createdAt),
      );
  } else {
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (filters.professional) {
      params.push(filters.professional);
      clauses.push(`professional = $${params.length}`);
    }

    if (filters.startDate) {
      params.push(filters.startDate);
      clauses.push(`service_date >= $${params.length}`);
    }

    if (filters.endDate) {
      params.push(filters.endDate);
      clauses.push(`service_date <= $${params.length}`);
    }

    if (filters.returnStatus) {
      params.push(filters.returnStatus);
      clauses.push(`return_status = $${params.length}`);
    }

    if (filters.onlyReturns) {
      clauses.push("return_option != 'no_schedule'");
    }

    const whereClause =
      clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const sql = `
      SELECT * FROM attendances
      ${whereClause}
      ORDER BY service_date DESC, created_at DESC
    `;

    const rows = (await execute(sql, [...params]))
      .rows as unknown as DbAttendanceRow[];
    records = rows.map(mapAttendanceRow);
  }

  if (filters.serviceId && filters.serviceId !== 'all') {
    records = records.filter((rec) =>
      rec.services.some(
        (svc) => svc.id === filters.serviceId || svc.name === filters.serviceId,
      ),
    );
  }

  if (filters.search && filters.search.trim().length > 0) {
    const q = filters.search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    records = records.filter((rec) => {
      const nameMatch = rec.clientName.toLowerCase().includes(q);
      const phoneMatch =
        qDigits.length > 0 && rec.whatsappDigits.includes(qDigits);
      const rawPhoneMatch = rec.whatsapp.toLowerCase().includes(q);
      return nameMatch || phoneMatch || rawPhoneMatch;
    });
  }

  return records;
}

export async function getAttendanceById(
  id: string,
): Promise<AttendanceRecord | null> {
  if (!isDatabaseConfigured()) {
    return memoryAttendances.get(id) ?? null;
  }
  const row = (await execute('SELECT * FROM attendances WHERE id = $1', [id]))
    .rows[0] as unknown as DbAttendanceRow | undefined;
  return row ? mapAttendanceRow(row) : null;
}

export async function updateAttendanceReturnStatus(
  id: string,
  status: 'waiting' | 'confirmed',
): Promise<AttendanceRecord | null> {
  const now = new Date().toISOString();
  if (!isDatabaseConfigured()) {
    const existing = memoryAttendances.get(id);
    if (!existing) return null;
    const updated = { ...existing, returnStatus: status, updatedAt: now };
    memoryAttendances.set(id, updated);
    return updated;
  }
  await execute(
    'UPDATE attendances SET return_status = $1, updated_at = $2 WHERE id = $3',
    [status, now, id],
  );
  return await getAttendanceById(id);
}

export async function deleteAttendanceById(id: string): Promise<boolean> {
  if (!isDatabaseConfigured()) {
    const deleted = memoryAttendances.delete(id);
    if (deleted) {
      for (const [apptId, appt] of memoryAgendaAppointments.entries()) {
        if (appt.sourceAttendanceId === id) {
          memoryAgendaAppointments.set(apptId, {
            ...appt,
            sourceAttendanceId: null,
          });
        }
      }
    }
    return deleted;
  }
  const info = await execute('DELETE FROM attendances WHERE id = $1', [id]);
  return (info.rowCount ?? 0) > 0;
}

export interface DbCommissionPayoutRow {
  payout_date: string;
  status: PayoutStatus;
  paid_at: string | null;
  updated_by: string | null;
  updated_at: string;
}

export async function getAllCommissionPayoutsMap(): Promise<
  Map<string, DbCommissionPayoutRow>
> {
  if (!isDatabaseConfigured()) {
    return new Map(memoryCommissionPayouts);
  }
  const rows = (await execute('SELECT * FROM commission_payouts', []))
    .rows as unknown as DbCommissionPayoutRow[];
  const map = new Map<string, DbCommissionPayoutRow>();
  for (const row of rows) {
    map.set(row.payout_date, row);
  }
  return map;
}

export async function getCommissionPayoutByDate(
  date: string,
): Promise<DbCommissionPayoutRow | null> {
  if (!isDatabaseConfigured()) {
    return memoryCommissionPayouts.get(date) ?? null;
  }
  const row = (
    await execute('SELECT * FROM commission_payouts WHERE payout_date = $1', [
      date,
    ])
  ).rows[0] as unknown as DbCommissionPayoutRow | undefined;
  return row ?? null;
}

export async function upsertCommissionPayoutStatus(
  date: string,
  status: PayoutStatus,
  updatedBy: string,
): Promise<DbCommissionPayoutRow> {
  const now = new Date().toISOString();
  const paidAt = status === 'paid' ? now : null;

  if (!isDatabaseConfigured()) {
    const row: DbCommissionPayoutRow = {
      payout_date: date,
      status,
      paid_at: paidAt,
      updated_by: updatedBy,
      updated_at: now,
    };
    memoryCommissionPayouts.set(date, row);
    return row;
  }

  await execute(
    `
    INSERT INTO commission_payouts (payout_date, status, paid_at, updated_by, updated_at)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT(payout_date) DO UPDATE SET
      status = excluded.status,
      paid_at = excluded.paid_at,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
    `,
    [date, status, paidAt, updatedBy, now],
  );

  return (await getCommissionPayoutByDate(date))!;
}

// Agenda operations share the same PostgreSQL client throughout each transaction.
async function withTransaction<T>(
  action: (client: PoolClient) => Promise<T>,
): Promise<T> {
  await initializeDatabase();
  const client = await getDatabase().connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

interface DbAgendaRow {
  id: string;
  professional: Professional;
  source_attendance_id: string | null;
  client_name: string;
  whatsapp: string;
  whatsapp_digits: string;
  procedure_name: string;
  appointment_date: string;
  appointment_time: string;
  notes: string;
  status: AgendaAppointmentStatus;
  created_at: string;
  updated_at: string;
}

function mapAgendaRow(row: DbAgendaRow): AgendaAppointment {
  return {
    id: row.id,
    professional: row.professional,
    sourceAttendanceId: row.source_attendance_id,
    clientName: row.client_name,
    whatsapp: row.whatsapp,
    whatsappDigits: row.whatsapp_digits,
    procedureName: row.procedure_name,
    appointmentDate: row.appointment_date,
    appointmentTime: row.appointment_time,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAgendaAppointments(options: {
  professional: Professional;
  startDate?: string;
  endDate?: string;
  includeCancelled?: boolean;
}): Promise<AgendaAppointment[]> {
  if (!isDatabaseConfigured()) {
    return Array.from(memoryAgendaAppointments.values())
      .filter((appt) => {
        if (appt.professional !== options.professional) return false;
        if (!options.includeCancelled && appt.status !== 'confirmed')
          return false;
        if (options.startDate && appt.appointmentDate < options.startDate)
          return false;
        if (options.endDate && appt.appointmentDate > options.endDate)
          return false;
        return true;
      })
      .sort(
        (a, b) =>
          a.appointmentDate.localeCompare(b.appointmentDate) ||
          a.appointmentTime.localeCompare(b.appointmentTime) ||
          a.createdAt.localeCompare(b.createdAt),
      );
  }

  const clauses = ['professional = $1'];
  const params = [options.professional] as string[];
  if (!options.includeCancelled) clauses.push("status = 'confirmed'");
  if (options.startDate) {
    params.push(options.startDate);
    clauses.push(`appointment_date >= $${params.length}`);
  }
  if (options.endDate) {
    params.push(options.endDate);
    clauses.push(`appointment_date <= $${params.length}`);
  }
  const { rows } = await execute<DbAgendaRow>(
    `
    SELECT * FROM agenda_appointments
    WHERE ${clauses.join(' AND ')}
    ORDER BY appointment_date ASC, appointment_time ASC, created_at ASC
  `,
    params,
  );
  return rows.map(mapAgendaRow);
}

export async function getAgendaAppointmentById(
  id: string,
  client?: PoolClient,
): Promise<AgendaAppointment | null> {
  if (!isDatabaseConfigured()) {
    return memoryAgendaAppointments.get(id) ?? null;
  }
  const { rows } = await execute<DbAgendaRow>(
    'SELECT * FROM agenda_appointments WHERE id = $1',
    [id],
    client,
  );
  return rows[0] ? mapAgendaRow(rows[0]) : null;
}

export async function findConfirmedSlotOwner(
  professional: Professional,
  appointmentDate: string,
  appointmentTime: string,
  excludeId?: string,
  client?: PoolClient,
): Promise<AgendaAppointment | null> {
  if (!isDatabaseConfigured()) {
    return (
      Array.from(memoryAgendaAppointments.values()).find(
        (appt) =>
          appt.professional === professional &&
          appt.appointmentDate === appointmentDate &&
          appt.appointmentTime === appointmentTime &&
          appt.status === 'confirmed' &&
          (!excludeId || appt.id !== excludeId),
      ) ?? null
    );
  }

  const { rows } = await execute<DbAgendaRow>(
    `
    SELECT * FROM agenda_appointments
    WHERE professional = $1 AND appointment_date = $2 AND appointment_time = $3
      AND status = 'confirmed' AND ($4::text IS NULL OR id <> $4)
  `,
    [professional, appointmentDate, appointmentTime, excludeId ?? null],
    client,
  );
  return rows[0] ? mapAgendaRow(rows[0]) : null;
}

export interface CreateAgendaInput {
  professional: Professional;
  sourceAttendanceId?: string | null;
  clientName: string;
  whatsapp: string;
  whatsappDigits: string;
  procedureName: string;
  appointmentDate: string;
  appointmentTime: string;
  notes: string;
}

export async function createAgendaAppointment(
  input: CreateAgendaInput,
  client?: PoolClient,
): Promise<AgendaAppointment> {
  const now = new Date().toISOString();

  if (!isDatabaseConfigured()) {
    const appt: AgendaAppointment = {
      id: crypto.randomUUID(),
      professional: input.professional,
      sourceAttendanceId: input.sourceAttendanceId ?? null,
      clientName: input.clientName,
      whatsapp: input.whatsapp,
      whatsappDigits: input.whatsappDigits,
      procedureName: input.procedureName,
      appointmentDate: input.appointmentDate,
      appointmentTime: input.appointmentTime,
      notes: input.notes,
      status: 'confirmed',
      createdAt: now,
      updatedAt: now,
    };
    memoryAgendaAppointments.set(appt.id, appt);
    return appt;
  }

  const { rows } = await execute<DbAgendaRow>(
    `
    INSERT INTO agenda_appointments (
      id, professional, source_attendance_id, client_name, whatsapp, whatsapp_digits,
      procedure_name, appointment_date, appointment_time, notes, status, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'confirmed', $11, $11)
    RETURNING *
  `,
    [
      crypto.randomUUID(),
      input.professional,
      input.sourceAttendanceId ?? null,
      input.clientName,
      input.whatsapp,
      input.whatsappDigits,
      input.procedureName,
      input.appointmentDate,
      input.appointmentTime,
      input.notes,
      now,
    ],
    client,
  );
  return mapAgendaRow(rows[0]);
}

export async function confirmAttendanceReturnToAgenda(input: {
  attendanceId: string;
  expectedProfessional?: Professional;
  appointmentDate: string;
  appointmentTime: string;
  procedureName: string;
  notes?: string;
}): Promise<{ appointment: AgendaAppointment; attendance: AttendanceRecord }> {
  if (!isDatabaseConfigured()) {
    const source = memoryAttendances.get(input.attendanceId);
    if (!source) {
      throw new Error('NOT_FOUND:Solicitação de retorno não encontrada.');
    }
    if (
      input.expectedProfessional &&
      source.professional !== input.expectedProfessional
    ) {
      throw new Error(
        'FORBIDDEN:Você só pode adicionar à agenda os retornos das suas próprias clientes.',
      );
    }
    if (source.returnOption === 'no_schedule') {
      throw new Error(
        'BAD_REQUEST:Este atendimento não possui solicitação de retorno.',
      );
    }
    const alreadyBooked = Array.from(memoryAgendaAppointments.values()).some(
      (a) => a.sourceAttendanceId === source.id && a.status === 'confirmed',
    );
    if (alreadyBooked) {
      throw new Error(
        'CONFLICT:Esta solicitação já foi confirmada e adicionada à agenda.',
      );
    }
    const owner = await findConfirmedSlotOwner(
      source.professional,
      input.appointmentDate,
      input.appointmentTime,
    );
    if (owner) {
      throw new Error(
        `CONFLICT:Já existe um agendamento confirmado para ${owner.clientName} neste dia e horário (${input.appointmentTime}).`,
      );
    }
    const appointment = await createAgendaAppointment({
      professional: source.professional,
      sourceAttendanceId: source.id,
      clientName: source.clientName,
      whatsapp: source.whatsapp,
      whatsappDigits: source.whatsappDigits,
      procedureName: input.procedureName.trim(),
      appointmentDate: input.appointmentDate,
      appointmentTime: input.appointmentTime,
      notes: input.notes?.trim() ?? '',
    });
    const updatedAttendance: AttendanceRecord = {
      ...source,
      returnStatus: 'confirmed',
      updatedAt: new Date().toISOString(),
    };
    memoryAttendances.set(source.id, updatedAttendance);
    return { appointment, attendance: updatedAttendance };
  }

  return withTransaction(async (client) => {
    const { rows } = await execute<DbAttendanceRow>(
      'SELECT * FROM attendances WHERE id = $1 FOR UPDATE',
      [input.attendanceId],
      client,
    );
    const source = rows[0];
    if (!source)
      throw new Error('NOT_FOUND:Solicitação de retorno não encontrada.');
    if (
      input.expectedProfessional &&
      source.professional !== input.expectedProfessional
    ) {
      throw new Error(
        'FORBIDDEN:Você só pode adicionar à agenda os retornos das suas próprias clientes.',
      );
    }
    if (source.return_option === 'no_schedule') {
      throw new Error(
        'BAD_REQUEST:Este atendimento não possui solicitação de retorno.',
      );
    }
    const existing = await execute<DbAgendaRow>(
      "SELECT * FROM agenda_appointments WHERE source_attendance_id = $1 AND status = 'confirmed'",
      [source.id],
      client,
    );
    if (existing.rows.length) {
      throw new Error(
        'CONFLICT:Esta solicitação já foi confirmada e adicionada à agenda.',
      );
    }
    const owner = await findConfirmedSlotOwner(
      source.professional,
      input.appointmentDate,
      input.appointmentTime,
      undefined,
      client,
    );
    if (owner) {
      throw new Error(
        `CONFLICT:Já existe um agendamento confirmado para ${owner.clientName} neste dia e horário (${input.appointmentTime}).`,
      );
    }
    const appointment = await createAgendaAppointment(
      {
        professional: source.professional,
        sourceAttendanceId: source.id,
        clientName: source.client_name,
        whatsapp: source.whatsapp,
        whatsappDigits: source.whatsapp_digits,
        procedureName: input.procedureName.trim(),
        appointmentDate: input.appointmentDate,
        appointmentTime: input.appointmentTime,
        notes: input.notes?.trim() ?? '',
      },
      client,
    );
    const updated = await execute<DbAttendanceRow>(
      "UPDATE attendances SET return_status = 'confirmed', updated_at = $1 WHERE id = $2 RETURNING *",
      [new Date().toISOString(), source.id],
      client,
    );
    return { appointment, attendance: mapAttendanceRow(updated.rows[0]) };
  });
}

export async function updateAgendaAppointment(
  id: string,
  updates: Omit<CreateAgendaInput, 'professional' | 'sourceAttendanceId'>,
): Promise<AgendaAppointment | null> {
  if (!isDatabaseConfigured()) {
    const existing = memoryAgendaAppointments.get(id);
    if (!existing || existing.status !== 'confirmed') return null;
    const updated: AgendaAppointment = {
      ...existing,
      clientName: updates.clientName,
      whatsapp: updates.whatsapp,
      whatsappDigits: updates.whatsappDigits,
      procedureName: updates.procedureName,
      appointmentDate: updates.appointmentDate,
      appointmentTime: updates.appointmentTime,
      notes: updates.notes,
      updatedAt: new Date().toISOString(),
    };
    memoryAgendaAppointments.set(id, updated);
    return updated;
  }

  const { rows } = await execute<DbAgendaRow>(
    `
    UPDATE agenda_appointments
    SET client_name = $1, whatsapp = $2, whatsapp_digits = $3, procedure_name = $4,
        appointment_date = $5, appointment_time = $6, notes = $7, updated_at = $8
    WHERE id = $9 AND status = 'confirmed'
    RETURNING *
  `,
    [
      updates.clientName,
      updates.whatsapp,
      updates.whatsappDigits,
      updates.procedureName,
      updates.appointmentDate,
      updates.appointmentTime,
      updates.notes,
      new Date().toISOString(),
      id,
    ],
  );
  return rows[0] ? mapAgendaRow(rows[0]) : null;
}

async function lockAgendaAppointment(
  id: string,
  client: PoolClient,
): Promise<AgendaAppointment | null> {
  const existing = await getAgendaAppointmentById(id, client);
  if (!existing) return null;
  // Keep the same lock order as confirmation: attendance, then appointment.
  if (existing.sourceAttendanceId) {
    await execute(
      'SELECT id FROM attendances WHERE id = $1 FOR UPDATE',
      [existing.sourceAttendanceId],
      client,
    );
  }
  const { rows } = await execute<DbAgendaRow>(
    'SELECT * FROM agenda_appointments WHERE id = $1 FOR UPDATE',
    [id],
    client,
  );
  return rows[0] ? mapAgendaRow(rows[0]) : null;
}

async function reopenUnbookedReturn(
  sourceId: string,
  client?: PoolClient,
): Promise<void> {
  if (!isDatabaseConfigured()) {
    const source = memoryAttendances.get(sourceId);
    if (!source || source.returnOption === 'no_schedule') return;
    const hasConfirmed = Array.from(memoryAgendaAppointments.values()).some(
      (a) => a.sourceAttendanceId === sourceId && a.status === 'confirmed',
    );
    if (!hasConfirmed) {
      memoryAttendances.set(sourceId, {
        ...source,
        returnStatus: 'waiting',
        updatedAt: new Date().toISOString(),
      });
    }
    return;
  }

  await execute(
    `
    UPDATE attendances SET return_status = 'waiting', updated_at = $1
    WHERE id = $2 AND return_option <> 'no_schedule'
      AND NOT EXISTS (
        SELECT 1 FROM agenda_appointments
        WHERE source_attendance_id = $2 AND status = 'confirmed'
      )
  `,
    [new Date().toISOString(), sourceId],
    client,
  );
}

export async function cancelAgendaAppointment(
  id: string,
): Promise<AgendaAppointment | null> {
  if (!isDatabaseConfigured()) {
    const existing = memoryAgendaAppointments.get(id);
    if (!existing) return null;
    const cancelled: AgendaAppointment = {
      ...existing,
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
    };
    memoryAgendaAppointments.set(id, cancelled);
    if (existing.sourceAttendanceId) {
      await reopenUnbookedReturn(existing.sourceAttendanceId);
    }
    return cancelled;
  }

  return withTransaction(async (client) => {
    const existing = await lockAgendaAppointment(id, client);
    if (!existing) return null;
    const { rows } = await execute<DbAgendaRow>(
      "UPDATE agenda_appointments SET status = 'cancelled', updated_at = $1 WHERE id = $2 RETURNING *",
      [new Date().toISOString(), id],
      client,
    );
    if (existing.sourceAttendanceId)
      await reopenUnbookedReturn(existing.sourceAttendanceId, client);
    return mapAgendaRow(rows[0]);
  });
}

export async function deleteAgendaAppointment(id: string): Promise<boolean> {
  if (!isDatabaseConfigured()) {
    const existing = memoryAgendaAppointments.get(id);
    if (!existing) return false;
    memoryAgendaAppointments.delete(id);
    if (existing.sourceAttendanceId) {
      await reopenUnbookedReturn(existing.sourceAttendanceId);
    }
    return true;
  }

  return withTransaction(async (client) => {
    const existing = await lockAgendaAppointment(id, client);
    if (!existing) return false;
    await execute(
      'DELETE FROM agenda_appointments WHERE id = $1',
      [id],
      client,
    );
    if (existing.sourceAttendanceId)
      await reopenUnbookedReturn(existing.sourceAttendanceId, client);
    return true;
  });
}
