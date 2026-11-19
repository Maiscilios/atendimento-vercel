import crypto from 'node:crypto';
import type { QueryResultRow } from 'pg';
import { getDatabase } from './database.ts';
import type {
  AttendanceRecord,
  AuthUser,
  Professional,
  ReturnOption,
  ReturnStatus,
  ServiceItem,
  UserRole,
} from '../shared/catalog.ts';
import type { PayoutStatus, SetupStatus } from '../shared/panelTypes.ts';

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
`;

let initialization: Promise<void> | undefined;

export function initializeDatabase(): Promise<void> {
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
) {
  await initializeDatabase();
  return getDatabase().query<T>(sql, args);
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

interface DbUserRow {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  professional: Professional;
  password_hash: string;
  password_configured: number;
}

export async function getSetupStatus(): Promise<SetupStatus> {
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
  const row = (
    await execute(
      'SELECT id, username, display_name, role, professional, password_hash, password_configured FROM users WHERE LOWER(username) = LOWER($1)',
      [username.trim()],
    )
  ).rows[0] as unknown as DbUserRow | undefined;
  return row ?? null;
}

export async function findUserById(userId: string): Promise<DbUserRow | null> {
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
  await execute(
    'UPDATE users SET password_hash = $1, password_configured = 1 WHERE id = $2',
    [hashPassword(newPassword), userId],
  );
}

export async function resetUserPasswordSetup(username: 'duda'): Promise<void> {
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
    (Omit<DbUserRow, 'password_hash'> & { expires_at: string }) | undefined;

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
  let records = rows.map(mapAttendanceRow);

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
  const row = (await execute('SELECT * FROM attendances WHERE id = $1', [id]))
    .rows[0] as unknown as DbAttendanceRow | undefined;
  return row ? mapAttendanceRow(row) : null;
}

export async function updateAttendanceReturnStatus(
  id: string,
  status: 'waiting' | 'confirmed',
): Promise<AttendanceRecord | null> {
  const now = new Date().toISOString();
  await execute(
    'UPDATE attendances SET return_status = $1, updated_at = $2 WHERE id = $3',
    [status, now, id],
  );
  return await getAttendanceById(id);
}

export async function deleteAttendanceById(id: string): Promise<boolean> {
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
