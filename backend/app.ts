import { asyncHandler } from './async-handler.ts';
import { getDatabase, isDatabaseConfigured } from './database.ts';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import {
  DUDA_ADDITIONALS,
  DUDA_RETURN_OPTIONS,
  LAIS_LASH_TYPE_SERVICE_IDS,
  LAIS_RETURN_OPTIONS,
  TIME_SLOTS,
  addDaysToISO,
  calculateReturnDateISO,
  extractDigits,
  formatBrazilPhone,
  getBrazilTodayISO,
  getServicesCatalog,
} from '../shared/catalog.ts';
import type {
  AttendanceRecord,
  AuthUser,
  Professional,
  ReturnOption,
  ServiceItem,
} from '../shared/catalog.ts';
import type {
  DailyCommissionSummary,
  DailyMetricPoint,
  PanelClientSummary,
  PayoutStatus,
} from '../shared/panelTypes.ts';
import {
  cancelAgendaAppointment,
  confirmAttendanceReturnToAgenda,
  createAgendaAppointment,
  deleteAgendaAppointment,
  findConfirmedSlotOwner,
  getAgendaAppointmentById,
  listAgendaAppointments,
  updateAgendaAppointment,
  initializeDatabase,
  configureInitialPassword,
  createSession,
  deleteAttendanceById,
  deleteSession,
  findUserById,
  findUserByUsername,
  getAllCommissionPayoutsMap,
  getAttendanceById,
  getSessionUser,
  getSetupStatus,
  insertAttendance,
  queryAttendances,
  resetUserPasswordSetup,
  updateAttendanceReturnStatus,
  updateUserPassword,
  upsertCommissionPayoutStatus,
  verifyPassword,
} from './db.ts';

const SESSION_COOKIE_NAME = 'maiscilios_session';

interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  sessionToken?: string;
}

function extractTokenFromRequest(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer.length > 0) return bearer;
  }
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return cookieToken;
  }
  return undefined;
}

async function attachUser(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractTokenFromRequest(req);
  if (token) {
    const user = await getSessionUser(token);
    if (user) {
      req.user = user;
      req.sessionToken = token;
    }
  }
  next();
}

function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res
      .status(401)
      .json({ error: 'Autenticação necessária para acessar este painel.' });
    return;
  }
  next();
}

function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Autenticação necessária.' });
    return;
  }
  if (req.user.role !== 'admin') {
    res
      .status(403)
      .json({ error: 'Acesso permitido somente para a administradora Laís.' });
    return;
  }
  next();
}

function isValidISODate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidManualTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isAgendaUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: Boolean(isSecure),
    maxAge: 1000 * 60 * 60 * 24 * 30,
    path: '/',
  });
}

function clearSessionCookie(req: Request, res: Response): void {
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: Boolean(isSecure),
    path: '/',
  });
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildPanelClients(records: AttendanceRecord[]): PanelClientSummary[] {
  const clientMap = new Map<string, PanelClientSummary>();
  for (const rec of records) {
    const key = rec.whatsappDigits || rec.clientName.toLowerCase();
    const existing = clientMap.get(key);
    if (!existing) {
      clientMap.set(key, {
        key,
        clientName: rec.clientName,
        whatsapp: rec.whatsapp,
        whatsappDigits: rec.whatsappDigits,
        totalVisits: 1,
        totalSpent: roundMoney(rec.totalPaid),
        lastVisitDate: rec.serviceDate,
        professionals: [rec.professional],
        attendances: [rec],
      });
    } else {
      existing.totalVisits += 1;
      existing.totalSpent = roundMoney(existing.totalSpent + rec.totalPaid);
      if (rec.serviceDate > existing.lastVisitDate) {
        existing.lastVisitDate = rec.serviceDate;
        existing.clientName = rec.clientName;
        existing.whatsapp = rec.whatsapp;
      }
      if (!existing.professionals.includes(rec.professional)) {
        existing.professionals.push(rec.professional);
      }
      existing.attendances.push(rec);
    }
  }

  return Array.from(clientMap.values()).sort((a, b) =>
    b.lastVisitDate.localeCompare(a.lastVisitDate),
  );
}

function buildDailyChartWindow(
  anchorDate: string,
  records: AttendanceRecord[],
  includeSplit: boolean,
): DailyMetricPoint[] {
  const points: DailyMetricPoint[] = [];
  const startDate = addDaysToISO(anchorDate, -6);

  for (let i = 0; i < 7; i += 1) {
    const date = addDaysToISO(startDate, i);
    const dayRecords = records.filter((r) => r.serviceDate === date);
    const totalProduced = roundMoney(
      dayRecords.reduce((acc, r) => acc + r.totalPaid, 0),
    );
    const commissionAmount = roundMoney(
      dayRecords.reduce((acc, r) => acc + r.commissionAmount, 0),
    );

    const point: DailyMetricPoint = {
      date,
      totalProduced,
      commissionAmount,
      count: dayRecords.length,
    };

    if (includeSplit) {
      point.laisProduced = roundMoney(
        dayRecords
          .filter((r) => r.professional === 'lais')
          .reduce((acc, r) => acc + r.totalPaid, 0),
      );
      point.dudaProduced = roundMoney(
        dayRecords
          .filter((r) => r.professional === 'duda')
          .reduce((acc, r) => acc + r.totalPaid, 0),
      );
    }

    points.push(point);
  }

  return points;
}

async function buildDailyCommissions(
  dudaRecords: AttendanceRecord[],
  selectedDate: string,
): Promise<{
  selectedDay: DailyCommissionSummary;
  availableDays: DailyCommissionSummary[];
}> {
  const payoutsMap = await getAllCommissionPayoutsMap();
  const byDate = new Map<string, AttendanceRecord[]>();

  for (const rec of dudaRecords) {
    const existing = byDate.get(rec.serviceDate);
    if (existing) {
      existing.push(rec);
    } else {
      byDate.set(rec.serviceDate, [rec]);
    }
  }

  const summarizeDay = (
    date: string,
    list: AttendanceRecord[],
  ): DailyCommissionSummary => {
    const payout = payoutsMap.get(date);
    return {
      date,
      count: list.length,
      totalProduced: roundMoney(list.reduce((acc, r) => acc + r.totalPaid, 0)),
      commissionAmount: roundMoney(
        list.reduce((acc, r) => acc + r.commissionAmount, 0),
      ),
      payoutStatus: payout?.status === 'paid' ? 'paid' : 'pending',
      paidAt: payout?.paid_at ?? null,
      attendances: list,
    };
  };

  const availableDays = Array.from(byDate.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => summarizeDay(date, list));

  const selectedDayRecords = byDate.get(selectedDate) ?? [];
  const selectedDay = summarizeDay(selectedDate, selectedDayRecords);

  return { selectedDay, availableDays };
}

export function createApiApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', asyncHandler(attachUser));

  // Health check
  app.get(
    '/api/health',
    asyncHandler(async (_req: Request, res: Response) => {
      await initializeDatabase();
      if (isDatabaseConfigured()) {
        await getDatabase().query('SELECT 1');
      }
      res.json({ ok: true });
    }),
  );

  // Auth setup & login routes
  app.get(
    '/api/auth/setup-status',
    asyncHandler(async (_req: Request, res: Response) => {
      res.json({
        ...(await getSetupStatus()),
        setupKeyRequired: false,
      });
    }),
  );

  app.get(
    '/api/auth/me',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      res.json({ user: req.user ?? null });
    }),
  );

  app.post(
    '/api/auth/setup-password',
    asyncHandler(async (req: Request, res: Response) => {
      const { username, password } = req.body as {
        username?: unknown;
        password?: unknown;
      };
      if (username !== 'lais' && username !== 'duda') {
        res.status(400).json({ error: 'Profissional inválida.' });
        return;
      }

      if (typeof password !== 'string' || password.trim().length < 6) {
        res
          .status(400)
          .json({ error: 'A senha inicial deve ter pelo menos 6 caracteres.' });
        return;
      }

      const userRow = await findUserByUsername(username);
      if (!userRow) {
        res.status(404).json({ error: 'Conta não encontrada.' });
        return;
      }

      if (userRow.password_configured === 1) {
        res.status(409).json({
          error:
            'A senha desta conta já foi cadastrada. Utilize a tela de entrada.',
        });
        return;
      }

      const updated = await configureInitialPassword(
        userRow.id,
        password.trim(),
      );
      if (!updated) {
        res.status(409).json({ error: 'A senha inicial já foi configurada.' });
        return;
      }

      const { token } = await createSession(userRow.id);
      setSessionCookie(req, res, token);

      const user: AuthUser = {
        id: userRow.id,
        username: userRow.username,
        displayName: userRow.display_name,
        role: userRow.role,
        professional: userRow.professional,
      };

      res.status(201).json({ user, token });
    }),
  );

  app.post(
    '/api/auth/login',
    asyncHandler(async (req: Request, res: Response) => {
      const { username, password } = req.body as {
        username?: unknown;
        password?: unknown;
      };
      if (typeof username !== 'string' || typeof password !== 'string') {
        res.status(400).json({ error: 'Informe usuário e senha.' });
        return;
      }

      const userRow = await findUserByUsername(username);
      if (!userRow) {
        res.status(401).json({ error: 'Usuário ou senha inválidos.' });
        return;
      }

      if (userRow.password_configured !== 1) {
        res.status(400).json({
          error:
            'Senha ainda não cadastrada. Cadastre a senha de primeiro acesso.',
        });
        return;
      }

      if (!verifyPassword(password, userRow.password_hash)) {
        res.status(401).json({ error: 'Senha incorreta.' });
        return;
      }

      const { token } = await createSession(userRow.id);
      setSessionCookie(req, res, token);

      const user: AuthUser = {
        id: userRow.id,
        username: userRow.username,
        displayName: userRow.display_name,
        role: userRow.role,
        professional: userRow.professional,
      };

      res.json({ user, token });
    }),
  );

  app.post(
    '/api/auth/logout',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      if (req.sessionToken) {
        await deleteSession(req.sessionToken);
      }
      clearSessionCookie(req, res);
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/auth/change-password',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const { currentPassword, newPassword } = req.body as {
        currentPassword?: unknown;
        newPassword?: unknown;
      };

      if (
        typeof currentPassword !== 'string' ||
        typeof newPassword !== 'string'
      ) {
        res
          .status(400)
          .json({ error: 'Informe a senha atual e a nova senha.' });
        return;
      }

      if (newPassword.trim().length < 6) {
        res
          .status(400)
          .json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
        return;
      }

      const userRow = await findUserById(req.user!.id);
      if (!userRow || !verifyPassword(currentPassword, userRow.password_hash)) {
        res.status(400).json({ error: 'A senha atual está incorreta.' });
        return;
      }

      await updateUserPassword(userRow.id, newPassword.trim());
      res.json({ ok: true });
    }),
  );

  // Public client submission route (preserved untouched)
  app.post(
    '/api/attendances',
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body as {
        professional?: unknown;
        clientName?: unknown;
        whatsapp?: unknown;
        totalPaid?: unknown;
        serviceIds?: unknown;
        serviceAttendanceTypes?: unknown;
        additionals?: unknown;
        returnOption?: unknown;
        preferredTimes?: unknown;
        serviceDate?: unknown;
        idempotencyKey?: unknown;
      };

      const professional = body.professional;
      if (professional !== 'duda' && professional !== 'lais') {
        res.status(400).json({ error: 'Profissional inválida.' });
        return;
      }

      if (
        typeof body.clientName !== 'string' ||
        body.clientName.trim().length < 2
      ) {
        res.status(400).json({ error: 'Informe seu nome completo.' });
        return;
      }
      const clientName = body.clientName.trim().slice(0, 120);

      if (typeof body.whatsapp !== 'string') {
        res
          .status(400)
          .json({ error: 'Informe um número de WhatsApp válido.' });
        return;
      }
      const whatsappDigits = extractDigits(body.whatsapp);
      if (whatsappDigits.length < 10 || whatsappDigits.length > 13) {
        res
          .status(400)
          .json({ error: 'Informe o WhatsApp com DDD (10 ou 11 dígitos).' });
        return;
      }
      const whatsapp = formatBrazilPhone(whatsappDigits);

      const totalPaidNum =
        typeof body.totalPaid === 'number'
          ? body.totalPaid
          : Number(body.totalPaid);
      if (!Number.isFinite(totalPaidNum) || totalPaidNum <= 0) {
        res.status(400).json({ error: 'Informe o valor total pago em reais.' });
        return;
      }
      const totalPaid = roundMoney(totalPaidNum);

      if (!Array.isArray(body.serviceIds) || body.serviceIds.length === 0) {
        res
          .status(400)
          .json({ error: 'Selecione pelo menos um serviço realizado.' });
        return;
      }

      const rawAttendanceTypes =
        body.serviceAttendanceTypes &&
        typeof body.serviceAttendanceTypes === 'object' &&
        !Array.isArray(body.serviceAttendanceTypes)
          ? (body.serviceAttendanceTypes as Record<string, unknown>)
          : {};

      const catalog = getServicesCatalog(professional);
      const selectedServices: ServiceItem[] = [];
      const seenIds = new Set<string>();
      for (const rawId of body.serviceIds) {
        if (typeof rawId !== 'string' || seenIds.has(rawId)) continue;
        const found = catalog.find((item) => item.id === rawId);
        if (found) {
          seenIds.add(rawId);
          if (
            professional === 'lais' &&
            LAIS_LASH_TYPE_SERVICE_IDS.includes(found.id)
          ) {
            const attendanceType = rawAttendanceTypes[found.id];
            if (
              attendanceType !== 'Aplicação' &&
              attendanceType !== 'Manutenção'
            ) {
              res.status(400).json({
                error: `Selecione Aplicação ou Manutenção para ${found.name}.`,
              });
              return;
            }
            selectedServices.push({
              ...found,
              name: `${found.name} — ${attendanceType}`,
            });
          } else {
            selectedServices.push(found);
          }
        }
      }

      if (selectedServices.length === 0) {
        res
          .status(400)
          .json({ error: 'Selecione pelo menos um serviço válido.' });
        return;
      }

      let selectedAdditionals: string[] = [];
      if (professional === 'duda' && Array.isArray(body.additionals)) {
        const seenAdd = new Set<string>();
        for (const rawAdd of body.additionals) {
          if (
            typeof rawAdd === 'string' &&
            DUDA_ADDITIONALS.includes(rawAdd) &&
            !seenAdd.has(rawAdd)
          ) {
            seenAdd.add(rawAdd);
            selectedAdditionals.push(rawAdd);
          }
        }
      }

      const allowedReturnOptions =
        professional === 'duda' ? DUDA_RETURN_OPTIONS : LAIS_RETURN_OPTIONS;
      const returnOptionMeta = allowedReturnOptions.find(
        (opt) => opt.value === (body.returnOption as ReturnOption),
      );
      if (!returnOptionMeta) {
        res.status(400).json({
          error: 'Selecione uma opção válida para a próxima manutenção.',
        });
        return;
      }

      const serviceDate = isValidISODate(body.serviceDate)
        ? body.serviceDate
        : getBrazilTodayISO();

      const returnDays = returnOptionMeta.days;
      const returnDate =
        returnDays !== null
          ? calculateReturnDateISO(serviceDate, returnDays)
          : null;

      let preferredTimes: string[] = [];
      if (returnDays !== null && Array.isArray(body.preferredTimes)) {
        const uniqueTimes: string[] = [];
        for (const slot of body.preferredTimes) {
          if (
            typeof slot === 'string' &&
            TIME_SLOTS.includes(slot) &&
            !uniqueTimes.includes(slot)
          ) {
            uniqueTimes.push(slot);
          }
        }
        preferredTimes = uniqueTimes.slice(0, 1);
      }

      const returnStatus =
        returnOptionMeta.value === 'no_schedule' ? 'not_applicable' : 'waiting';

      const commissionRate = professional === 'duda' ? 0.25 : 0;
      const commissionAmount =
        professional === 'duda' ? roundMoney(totalPaid * 0.25) : 0;

      const idempotencyKey =
        typeof body.idempotencyKey === 'string' &&
        body.idempotencyKey.trim().length > 0
          ? body.idempotencyKey.trim().slice(0, 128)
          : null;

      const record = await insertAttendance({
        professional: professional as Professional,
        clientName,
        whatsapp,
        whatsappDigits,
        serviceDate,
        services: selectedServices,
        additionals: selectedAdditionals,
        totalPaid,
        commissionRate,
        commissionAmount,
        returnOption: returnOptionMeta.value,
        returnDays,
        returnDate,
        preferredTimes,
        returnStatus,
        idempotencyKey,
      });

      res.status(201).json({
        confirmation: {
          id: record.id,
          professional: record.professional,
          clientName: record.clientName,
          serviceDate: record.serviceDate,
          createdAt: record.createdAt,
          returnOption: record.returnOption,
          returnDate: record.returnDate,
          preferredTimes: record.preferredTimes,
          returnStatus: record.returnStatus,
        },
      });
    }),
  );

  // ============================================================================
  // DUDA PANEL ROUTES (Strictly scoped to professional = 'duda' in database)
  // ============================================================================
  app.get(
    '/api/duda/dashboard',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const selectedDate = isValidISODate(req.query.date)
        ? req.query.date
        : getBrazilTodayISO();

      const startDate = addDaysToISO(selectedDate, -6);
      const windowRecords = await queryAttendances({
        professional: 'duda',
        startDate,
        endDate: selectedDate,
      });

      const dayAttendances = windowRecords.filter(
        (r) => r.serviceDate === selectedDate,
      );
      const dayTotalProduced = roundMoney(
        dayAttendances.reduce((acc, item) => acc + item.totalPaid, 0),
      );
      const dayCommissionToLais = roundMoney(
        dayAttendances.reduce((acc, item) => acc + item.commissionAmount, 0),
      );
      const dailyChart = buildDailyChartWindow(
        selectedDate,
        windowRecords,
        false,
      );

      res.json({
        selectedDate,
        dayTotalProduced,
        dayCommissionToLais,
        dayAttendances,
        dailyChart,
      });
    }),
  );

  app.get(
    '/api/duda/clients',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const search =
        typeof req.query.search === 'string' ? req.query.search : undefined;
      // Strictly Duda's clients only
      const dudaAttendances = await queryAttendances({
        professional: 'duda',
        search,
      });
      const clients = buildPanelClients(dudaAttendances);
      res.json({ clients });
    }),
  );

  app.get(
    '/api/duda/attendances',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const startDate = isValidISODate(req.query.startDate)
        ? req.query.startDate
        : undefined;
      const endDate = isValidISODate(req.query.endDate)
        ? req.query.endDate
        : undefined;
      const search =
        typeof req.query.search === 'string' ? req.query.search : undefined;
      const returnStatus =
        req.query.returnStatus === 'waiting' ||
        req.query.returnStatus === 'confirmed'
          ? req.query.returnStatus
          : undefined;
      const onlyReturns = req.query.onlyReturns === 'true';

      const attendances = await queryAttendances({
        professional: 'duda',
        startDate,
        endDate,
        search,
        returnStatus,
        onlyReturns,
      });

      const totalReceived = roundMoney(
        attendances.reduce((acc, item) => acc + item.totalPaid, 0),
      );
      const totalCommissionToLais = roundMoney(
        attendances.reduce((acc, item) => acc + item.commissionAmount, 0),
      );

      res.json({
        attendances,
        summary: {
          count: attendances.length,
          totalReceived,
          totalCommissionToLais,
        },
      });
    }),
  );

  app.get(
    '/api/duda/commissions',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const selectedDate = isValidISODate(req.query.date)
        ? req.query.date
        : getBrazilTodayISO();

      // Strictly Duda's records; returns ONLY per-day figures (no accumulated balance)
      const dudaRecords = await queryAttendances({ professional: 'duda' });
      const result = await buildDailyCommissions(dudaRecords, selectedDate);
      res.json(result);
    }),
  );

  app.patch(
    '/api/duda/attendances/:id/return-status',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const id = req.params.id;
      const existing = await getAttendanceById(id);
      if (!existing) {
        res.status(404).json({ error: 'Atendimento não encontrado.' });
        return;
      }

      if (existing.professional !== 'duda' && req.user!.role !== 'admin') {
        res.status(403).json({
          error:
            'Você só pode atualizar agendamentos dos seus próprios atendimentos.',
        });
        return;
      }

      const { status } = req.body as { status?: unknown };
      if (status !== 'waiting' && status !== 'confirmed') {
        res.status(400).json({ error: 'Situação de retorno inválida.' });
        return;
      }

      if (existing.returnOption === 'no_schedule') {
        res.status(400).json({
          error: 'Este atendimento não possui solicitação de retorno.',
        });
        return;
      }

      const updated = await updateAttendanceReturnStatus(id, status);
      res.json({ attendance: updated });
    }),
  );

  // ============================================================================
  // LAÍS ADMIN ROUTES (403 Forbidden for Duda)
  // ============================================================================
  app.get(
    '/api/admin/dashboard',
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const selectedDate = isValidISODate(req.query.date)
        ? req.query.date
        : getBrazilTodayISO();
      const profParam = req.query.professional;
      const professional: Professional | undefined =
        profParam === 'lais' || profParam === 'duda' ? profParam : undefined;

      const startDate = addDaysToISO(selectedDate, -6);
      const windowRecords = await queryAttendances({
        professional,
        startDate,
        endDate: selectedDate,
      });

      const dayAttendances = windowRecords.filter(
        (r) => r.serviceDate === selectedDate,
      );
      const dayTotalProduced = roundMoney(
        dayAttendances.reduce((acc, item) => acc + item.totalPaid, 0),
      );
      const dayLaisProduced = roundMoney(
        dayAttendances
          .filter((item) => item.professional === 'lais')
          .reduce((acc, item) => acc + item.totalPaid, 0),
      );
      const dayDudaProduced = roundMoney(
        dayAttendances
          .filter((item) => item.professional === 'duda')
          .reduce((acc, item) => acc + item.totalPaid, 0),
      );
      const dayDudaCommission = roundMoney(
        dayAttendances.reduce((acc, item) => acc + item.commissionAmount, 0),
      );
      const dailyChart = buildDailyChartWindow(
        selectedDate,
        windowRecords,
        true,
      );

      res.json({
        selectedDate,
        dayTotalProduced,
        dayLaisProduced,
        dayDudaProduced,
        dayDudaCommission,
        dayAttendances,
        dailyChart,
      });
    }),
  );

  app.get(
    '/api/admin/attendances',
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const profParam = req.query.professional;
      const professional: Professional | undefined =
        profParam === 'lais' || profParam === 'duda' ? profParam : undefined;
      const startDate = isValidISODate(req.query.startDate)
        ? req.query.startDate
        : undefined;
      const endDate = isValidISODate(req.query.endDate)
        ? req.query.endDate
        : undefined;
      const serviceId =
        typeof req.query.serviceId === 'string'
          ? req.query.serviceId
          : undefined;
      const search =
        typeof req.query.search === 'string' ? req.query.search : undefined;
      const returnStatus =
        req.query.returnStatus === 'waiting' ||
        req.query.returnStatus === 'confirmed'
          ? req.query.returnStatus
          : undefined;
      const onlyReturns = req.query.onlyReturns === 'true';

      const attendances = await queryAttendances({
        professional,
        startDate,
        endDate,
        serviceId,
        search,
        returnStatus,
        onlyReturns,
      });

      res.json({ attendances });
    }),
  );

  app.get(
    '/api/admin/clients',
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const search =
        typeof req.query.search === 'string' ? req.query.search : undefined;
      const profParam = req.query.professional;
      const professional: Professional | undefined =
        profParam === 'lais' || profParam === 'duda' ? profParam : undefined;
      const allAttendances = await queryAttendances({ professional, search });
      const clients = buildPanelClients(allAttendances);
      res.json({ clients });
    }),
  );

  app.get(
    '/api/admin/commissions',
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const selectedDate = isValidISODate(req.query.date)
        ? req.query.date
        : getBrazilTodayISO();

      const dudaRecords = await queryAttendances({ professional: 'duda' });
      const result = await buildDailyCommissions(dudaRecords, selectedDate);
      res.json(result);
    }),
  );

  app.patch(
    '/api/admin/commissions/:date/status',
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const date = req.params.date;
      if (!isValidISODate(date)) {
        res.status(400).json({ error: 'Data inválida.' });
        return;
      }

      const { status } = req.body as { status?: unknown };
      if (status !== 'pending' && status !== 'paid') {
        res.status(400).json({ error: 'Situação de repasse inválida.' });
        return;
      }

      const updated = await upsertCommissionPayoutStatus(
        date,
        status as PayoutStatus,
        req.user!.username,
      );
      res.json({
        payoutDate: updated.payout_date,
        payoutStatus: updated.status,
        paidAt: updated.paid_at,
      });
    }),
  );

  app.get(
    '/api/admin/duda-finance',
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const startDate = isValidISODate(req.query.startDate)
        ? req.query.startDate
        : undefined;
      const endDate = isValidISODate(req.query.endDate)
        ? req.query.endDate
        : undefined;

      const allInPeriod = await queryAttendances({ startDate, endDate });
      const dudaAttendances = allInPeriod.filter(
        (item) => item.professional === 'duda',
      );
      const laisAttendances = allInPeriod.filter(
        (item) => item.professional === 'lais',
      );

      const totalLaisProduced = roundMoney(
        laisAttendances.reduce((acc, item) => acc + item.totalPaid, 0),
      );
      const totalReceived = roundMoney(
        dudaAttendances.reduce((acc, item) => acc + item.totalPaid, 0),
      );
      const totalCommissionToReceive = roundMoney(
        dudaAttendances.reduce((acc, item) => acc + item.commissionAmount, 0),
      );

      res.json({
        attendances: dudaAttendances,
        summary: {
          count: dudaAttendances.length,
          laisCount: laisAttendances.length,
          totalLaisProduced,
          totalReceived,
          totalCommissionToReceive,
        },
      });
    }),
  );

  app.post(
    '/api/admin/reset-duda-password',
    requireAdmin,
    asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
      await resetUserPasswordSetup('duda');
      res.json({ ok: true });
    }),
  );

  app.patch(
    '/api/admin/attendances/:id/return-status',
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const id = req.params.id;
      const existing = await getAttendanceById(id);
      if (!existing) {
        res.status(404).json({ error: 'Atendimento não encontrado.' });
        return;
      }

      const { status } = req.body as { status?: unknown };
      if (status !== 'waiting' && status !== 'confirmed') {
        res.status(400).json({ error: 'Situação de retorno inválida.' });
        return;
      }

      if (existing.returnOption === 'no_schedule') {
        res.status(400).json({
          error: 'Este atendimento não possui solicitação de retorno.',
        });
        return;
      }

      const updated = await updateAttendanceReturnStatus(id, status);
      res.json({ attendance: updated });
    }),
  );

  app.delete(
    '/api/admin/attendances/:id',
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const deleted = await deleteAttendanceById(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Atendimento não encontrado.' });
        return;
      }
      res.json({ ok: true });
    }),
  );

  // Agendas de Laís e Duda.
  app.get(
    '/api/duda/agenda',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const startDate = isValidISODate(req.query.startDate)
        ? req.query.startDate
        : undefined;
      const endDate = isValidISODate(req.query.endDate)
        ? req.query.endDate
        : undefined;

      const appointments = await listAgendaAppointments({
        professional: 'duda',
        startDate,
        endDate,
      });

      res.json({ appointments });
    }),
  );

  app.post(
    '/api/duda/agenda/appointments',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const body = req.body as {
        clientName?: unknown;
        whatsapp?: unknown;
        procedureName?: unknown;
        appointmentDate?: unknown;
        appointmentTime?: unknown;
        notes?: unknown;
      };

      if (
        typeof body.clientName !== 'string' ||
        body.clientName.trim().length < 2
      ) {
        res.status(400).json({ error: 'Informe o nome completo da cliente.' });
        return;
      }
      const clientName = body.clientName.trim().slice(0, 120);

      if (typeof body.whatsapp !== 'string') {
        res.status(400).json({ error: 'Informe o WhatsApp da cliente.' });
        return;
      }
      const whatsappDigits = extractDigits(body.whatsapp);
      if (whatsappDigits.length < 10 || whatsappDigits.length > 13) {
        res
          .status(400)
          .json({ error: 'Informe o WhatsApp com DDD (10 ou 11 dígitos).' });
        return;
      }
      const whatsapp = formatBrazilPhone(whatsappDigits);

      if (
        typeof body.procedureName !== 'string' ||
        body.procedureName.trim().length < 2
      ) {
        res.status(400).json({ error: 'Selecione ou informe o serviço.' });
        return;
      }
      const procedureName = body.procedureName.trim().slice(0, 200);

      if (!isValidISODate(body.appointmentDate)) {
        res.status(400).json({ error: 'Informe uma data válida.' });
        return;
      }

      if (!isValidManualTime(body.appointmentTime)) {
        res
          .status(400)
          .json({
            error: 'Digite um horário válido no formato HH:MM (ex: 14:30).',
          });
        return;
      }

      const notes =
        typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : '';

      const occupant = await findConfirmedSlotOwner(
        'duda',
        body.appointmentDate,
        body.appointmentTime,
      );
      if (occupant) {
        res.status(409).json({
          error: `Horário duplicado: ${occupant.clientName} já possui agendamento confirmado neste dia às ${body.appointmentTime}.`,
        });
        return;
      }

      try {
        const appointment = await createAgendaAppointment({
          professional: 'duda',
          clientName,
          whatsapp,
          whatsappDigits,
          procedureName,
          appointmentDate: body.appointmentDate,
          appointmentTime: body.appointmentTime,
          notes,
        });
        res.status(201).json({ appointment });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (isAgendaUniqueViolation(err)) {
          res
            .status(409)
            .json({
              error: 'Já existe um agendamento confirmado neste dia e horário.',
            });
          return;
        }
        throw err;
      }
    }),
  );

  app.post(
    '/api/duda/agenda/confirm-request/:attendanceId',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const attendanceId = req.params.attendanceId;
      const body = req.body as {
        appointmentDate?: unknown;
        appointmentTime?: unknown;
        procedureName?: unknown;
        notes?: unknown;
      };

      if (!isValidISODate(body.appointmentDate)) {
        res
          .status(400)
          .json({ error: 'Informe uma data válida para o agendamento.' });
        return;
      }

      if (!isValidManualTime(body.appointmentTime)) {
        res
          .status(400)
          .json({
            error: 'Digite o horário definitivo no formato HH:MM (ex: 14:30).',
          });
        return;
      }

      if (
        typeof body.procedureName !== 'string' ||
        body.procedureName.trim().length < 2
      ) {
        res
          .status(400)
          .json({ error: 'Selecione pelo menos um procedimento da Duda.' });
        return;
      }

      const notes =
        typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : '';

      try {
        const result = await confirmAttendanceReturnToAgenda({
          attendanceId,
          expectedProfessional: 'duda',
          appointmentDate: body.appointmentDate,
          appointmentTime: body.appointmentTime,
          procedureName: body.procedureName.trim().slice(0, 200),
          notes,
        });
        res.status(201).json(result);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Erro ao confirmar agendamento.';
        if (message.startsWith('NOT_FOUND:')) {
          res.status(404).json({ error: message.replace('NOT_FOUND:', '') });
          return;
        }
        if (message.startsWith('FORBIDDEN:')) {
          res.status(403).json({ error: message.replace('FORBIDDEN:', '') });
          return;
        }
        if (message.startsWith('BAD_REQUEST:')) {
          res.status(400).json({ error: message.replace('BAD_REQUEST:', '') });
          return;
        }
        if (message.startsWith('CONFLICT:') || isAgendaUniqueViolation(err)) {
          res.status(409).json({
            error: message.startsWith('CONFLICT:')
              ? message.replace('CONFLICT:', '')
              : 'Já existe um agendamento confirmado para este dia e horário.',
          });
          return;
        }
        throw err;
      }
    }),
  );

  app.patch(
    '/api/duda/agenda/appointments/:id',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const existing = await getAgendaAppointmentById(req.params.id);
      if (!existing || existing.professional !== 'duda') {
        res.status(404).json({ error: 'Agendamento não encontrado.' });
        return;
      }
      if (existing.status === 'cancelled') {
        res
          .status(400)
          .json({ error: 'Não é possível editar um agendamento cancelado.' });
        return;
      }

      const body = req.body as {
        clientName?: unknown;
        whatsapp?: unknown;
        procedureName?: unknown;
        appointmentDate?: unknown;
        appointmentTime?: unknown;
        notes?: unknown;
      };

      const clientName =
        typeof body.clientName === 'string'
          ? body.clientName.trim().slice(0, 120)
          : '';
      if (clientName.length < 2) {
        res.status(400).json({ error: 'Informe o nome completo da cliente.' });
        return;
      }

      if (typeof body.whatsapp !== 'string') {
        res.status(400).json({ error: 'Informe o WhatsApp da cliente.' });
        return;
      }
      const whatsappDigits = extractDigits(body.whatsapp);
      if (whatsappDigits.length < 10 || whatsappDigits.length > 13) {
        res
          .status(400)
          .json({ error: 'Informe o WhatsApp com DDD (10 ou 11 dígitos).' });
        return;
      }
      const whatsapp = formatBrazilPhone(whatsappDigits);

      const procedureName =
        typeof body.procedureName === 'string'
          ? body.procedureName.trim().slice(0, 200)
          : '';
      if (procedureName.length < 2) {
        res.status(400).json({ error: 'Selecione ou informe o serviço.' });
        return;
      }

      if (!isValidISODate(body.appointmentDate)) {
        res.status(400).json({ error: 'Informe uma data válida.' });
        return;
      }

      if (!isValidManualTime(body.appointmentTime)) {
        res
          .status(400)
          .json({ error: 'Digite um horário válido no formato HH:MM.' });
        return;
      }

      const notes =
        typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : '';

      const occupant = await findConfirmedSlotOwner(
        'duda',
        body.appointmentDate,
        body.appointmentTime,
        existing.id,
      );
      if (occupant) {
        res.status(409).json({
          error: `Horário duplicado: ${occupant.clientName} já possui agendamento confirmado neste dia às ${body.appointmentTime}.`,
        });
        return;
      }

      try {
        const appointment = await updateAgendaAppointment(existing.id, {
          clientName,
          whatsapp,
          whatsappDigits,
          procedureName,
          appointmentDate: body.appointmentDate,
          appointmentTime: body.appointmentTime,
          notes,
        });
        if (!appointment) {
          res
            .status(409)
            .json({
              error:
                'O agendamento foi alterado. Atualize a agenda e tente novamente.',
            });
          return;
        }
        res.json({ appointment });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (isAgendaUniqueViolation(err)) {
          res
            .status(409)
            .json({
              error: 'Já existe um agendamento confirmado neste dia e horário.',
            });
          return;
        }
        throw err;
      }
    }),
  );

  app.patch(
    '/api/duda/agenda/appointments/:id/cancel',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const existing = await getAgendaAppointmentById(req.params.id);
      if (!existing || existing.professional !== 'duda') {
        res.status(404).json({ error: 'Agendamento não encontrado.' });
        return;
      }
      const appointment = await cancelAgendaAppointment(existing.id);
      res.json({ appointment });
    }),
  );

  app.delete(
    '/api/duda/agenda/appointments/:id',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const existing = await getAgendaAppointmentById(req.params.id);
      if (!existing || existing.professional !== 'duda') {
        res.status(404).json({ error: 'Agendamento não encontrado.' });
        return;
      }
      await deleteAgendaAppointment(existing.id);
      res.json({ ok: true });
    }),
  );

  app.get(
    '/api/admin/agenda',
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const professional: Professional =
        req.query.professional === 'duda' ? 'duda' : 'lais';
      const startDate = isValidISODate(req.query.startDate)
        ? req.query.startDate
        : undefined;
      const endDate = isValidISODate(req.query.endDate)
        ? req.query.endDate
        : undefined;

      const appointments = await listAgendaAppointments({
        professional,
        startDate,
        endDate,
      });

      res.json({ professional, appointments });
    }),
  );

  app.post(
    '/api/admin/agenda/appointments',
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const body = req.body as {
        professional?: unknown;
        clientName?: unknown;
        whatsapp?: unknown;
        procedureName?: unknown;
        appointmentDate?: unknown;
        appointmentTime?: unknown;
        notes?: unknown;
      };

      const professional: Professional =
        body.professional === 'duda' ? 'duda' : 'lais';

      if (
        typeof body.clientName !== 'string' ||
        body.clientName.trim().length < 2
      ) {
        res.status(400).json({ error: 'Informe o nome completo da cliente.' });
        return;
      }
      const clientName = body.clientName.trim().slice(0, 120);

      if (typeof body.whatsapp !== 'string') {
        res.status(400).json({ error: 'Informe o WhatsApp da cliente.' });
        return;
      }
      const whatsappDigits = extractDigits(body.whatsapp);
      if (whatsappDigits.length < 10 || whatsappDigits.length > 13) {
        res
          .status(400)
          .json({ error: 'Informe o WhatsApp com DDD (10 ou 11 dígitos).' });
        return;
      }
      const whatsapp = formatBrazilPhone(whatsappDigits);

      if (
        typeof body.procedureName !== 'string' ||
        body.procedureName.trim().length < 2
      ) {
        res.status(400).json({ error: 'Selecione ou informe o serviço.' });
        return;
      }
      const procedureName = body.procedureName.trim().slice(0, 200);

      if (!isValidISODate(body.appointmentDate)) {
        res.status(400).json({ error: 'Informe uma data válida.' });
        return;
      }

      if (!isValidManualTime(body.appointmentTime)) {
        res
          .status(400)
          .json({
            error: 'Digite um horário válido no formato HH:MM (ex: 14:30).',
          });
        return;
      }

      const notes =
        typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : '';

      const occupant = await findConfirmedSlotOwner(
        professional,
        body.appointmentDate,
        body.appointmentTime,
      );
      if (occupant) {
        res.status(409).json({
          error: `Horário duplicado: ${occupant.clientName} já possui agendamento confirmado neste dia às ${body.appointmentTime}.`,
        });
        return;
      }

      try {
        const appointment = await createAgendaAppointment({
          professional,
          clientName,
          whatsapp,
          whatsappDigits,
          procedureName,
          appointmentDate: body.appointmentDate,
          appointmentTime: body.appointmentTime,
          notes,
        });
        res.status(201).json({ appointment });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (isAgendaUniqueViolation(err)) {
          res
            .status(409)
            .json({
              error: 'Já existe um agendamento confirmado neste dia e horário.',
            });
          return;
        }
        throw err;
      }
    }),
  );

  app.post(
    '/api/admin/agenda/confirm-request/:attendanceId',
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const attendanceId = req.params.attendanceId;
      const body = req.body as {
        appointmentDate?: unknown;
        appointmentTime?: unknown;
        procedureName?: unknown;
        notes?: unknown;
      };

      if (!isValidISODate(body.appointmentDate)) {
        res
          .status(400)
          .json({ error: 'Informe uma data válida para o agendamento.' });
        return;
      }

      if (!isValidManualTime(body.appointmentTime)) {
        res
          .status(400)
          .json({
            error: 'Digite o horário definitivo no formato HH:MM (ex: 14:30).',
          });
        return;
      }

      if (
        typeof body.procedureName !== 'string' ||
        body.procedureName.trim().length < 2
      ) {
        res.status(400).json({ error: 'Selecione ou informe o procedimento.' });
        return;
      }

      const notes =
        typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : '';

      try {
        const result = await confirmAttendanceReturnToAgenda({
          attendanceId,
          appointmentDate: body.appointmentDate,
          appointmentTime: body.appointmentTime,
          procedureName: body.procedureName.trim().slice(0, 200),
          notes,
        });
        res.status(201).json(result);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Erro ao confirmar agendamento.';
        if (message.startsWith('NOT_FOUND:')) {
          res.status(404).json({ error: message.replace('NOT_FOUND:', '') });
          return;
        }
        if (message.startsWith('BAD_REQUEST:')) {
          res.status(400).json({ error: message.replace('BAD_REQUEST:', '') });
          return;
        }
        if (message.startsWith('CONFLICT:') || isAgendaUniqueViolation(err)) {
          res.status(409).json({
            error: message.startsWith('CONFLICT:')
              ? message.replace('CONFLICT:', '')
              : 'Já existe um agendamento confirmado neste dia e horário.',
          });
          return;
        }
        throw err;
      }
    }),
  );

  app.patch(
    '/api/admin/agenda/appointments/:id',
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const existing = await getAgendaAppointmentById(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Agendamento não encontrado.' });
        return;
      }
      if (existing.status === 'cancelled') {
        res
          .status(400)
          .json({ error: 'Não é possível editar um agendamento cancelado.' });
        return;
      }

      const body = req.body as {
        clientName?: unknown;
        whatsapp?: unknown;
        procedureName?: unknown;
        appointmentDate?: unknown;
        appointmentTime?: unknown;
        notes?: unknown;
      };

      const clientName =
        typeof body.clientName === 'string'
          ? body.clientName.trim().slice(0, 120)
          : '';
      if (clientName.length < 2) {
        res.status(400).json({ error: 'Informe o nome completo da cliente.' });
        return;
      }

      if (typeof body.whatsapp !== 'string') {
        res.status(400).json({ error: 'Informe o WhatsApp da cliente.' });
        return;
      }
      const whatsappDigits = extractDigits(body.whatsapp);
      if (whatsappDigits.length < 10 || whatsappDigits.length > 13) {
        res
          .status(400)
          .json({ error: 'Informe o WhatsApp com DDD (10 ou 11 dígitos).' });
        return;
      }
      const whatsapp = formatBrazilPhone(whatsappDigits);

      const procedureName =
        typeof body.procedureName === 'string'
          ? body.procedureName.trim().slice(0, 200)
          : '';
      if (procedureName.length < 2) {
        res.status(400).json({ error: 'Selecione ou informe o serviço.' });
        return;
      }

      if (!isValidISODate(body.appointmentDate)) {
        res.status(400).json({ error: 'Informe uma data válida.' });
        return;
      }

      if (!isValidManualTime(body.appointmentTime)) {
        res
          .status(400)
          .json({ error: 'Digite um horário válido no formato HH:MM.' });
        return;
      }

      const notes =
        typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : '';

      const occupant = await findConfirmedSlotOwner(
        existing.professional,
        body.appointmentDate,
        body.appointmentTime,
        existing.id,
      );
      if (occupant) {
        res.status(409).json({
          error: `Horário duplicado: ${occupant.clientName} já possui agendamento confirmado neste dia às ${body.appointmentTime}.`,
        });
        return;
      }

      try {
        const appointment = await updateAgendaAppointment(existing.id, {
          clientName,
          whatsapp,
          whatsappDigits,
          procedureName,
          appointmentDate: body.appointmentDate,
          appointmentTime: body.appointmentTime,
          notes,
        });
        if (!appointment) {
          res
            .status(409)
            .json({
              error:
                'O agendamento foi alterado. Atualize a agenda e tente novamente.',
            });
          return;
        }
        res.json({ appointment });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (isAgendaUniqueViolation(err)) {
          res
            .status(409)
            .json({
              error: 'Já existe um agendamento confirmado neste dia e horário.',
            });
          return;
        }
        throw err;
      }
    }),
  );

  app.patch(
    '/api/admin/agenda/appointments/:id/cancel',
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const existing = await getAgendaAppointmentById(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Agendamento não encontrado.' });
        return;
      }
      const appointment = await cancelAgendaAppointment(existing.id);
      res.json({ appointment });
    }),
  );

  app.delete(
    '/api/admin/agenda/appointments/:id',
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const deleted = await deleteAgendaAppointment(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Agendamento não encontrado.' });
        return;
      }
      res.json({ ok: true });
    }),
  );

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Rota da API não encontrada.' });
  });

  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      console.error('Falha na API:', error);
      const status = (error as { status?: number })?.status;
      if (status === 400 || status === 413) {
        res.status(status).json({
          error: status === 413 ? 'Requisição muito grande.' : 'JSON inválido.',
        });
        return;
      }
      res.status(500).json({
        error: 'Não foi possível concluir a operação. Tente novamente.',
      });
    },
  );

  return app;
}
