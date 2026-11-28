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
  RETURN_PERIOD_OPTIONS,
  SERVICE_CATEGORIES,
  addDaysToISO,
  calculateReturnDateISO,
  classifyServiceCategory,
  extractDigits,
  findStudioServiceById,
  formatBrazilPhone,
  getBrazilTodayISO,
  getServicesCatalog,
  isValidHHMMTime,
  normalizeWhatsAppDigits,
} from '../shared/catalog.ts';
import type {
  AttendanceRecord,
  AuthUser,
  ExtraReturnService,
  Professional,
  ReturnOption,
  ServiceCategoryId,
  ServiceItem,
} from '../shared/catalog.ts';
import type {
  AgendaAppointment,
  DailyCommissionSummary,
  DailyMetricPoint,
  InterestedLeadService,
  PanelClientSummary,
  PayoutStatus,
  ReturnRequestStatus,
} from '../shared/panelTypes.ts';
import {
  approveReturnRequest,
  cancelAgendaAppointment,
  confirmAttendanceReturnToAgenda,
  createAgendaAppointment,
  createAndPublishStudioNotification,
  deleteAgendaAppointment,
  deleteInterestedLead,
  deletePushSubscriptionForUser,
  findConfirmedSlotOwner,
  getAgendaAppointmentById,
  getReturnRequestById,
  insertInterestedLead,
  insertPublicPreBooking,
  listAgendaAppointments,
  listInterestedLeads,
  listPushSubscriptionsForUser,
  listReturnRequests,
  listStudioNotifications,
  markStudioNotificationsRead,
  updateAgendaAppointment,
  upsertPushSubscription,
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
  lookupClientsByWhatsappDigits,
  queryAttendances,
  resetUserPasswordSetup,
  updateAttendanceReturnStatus,
  updateUserPassword,
  upsertCommissionPayoutStatus,
  verifyPassword,
} from './db.ts';
import { subscribeNotificationStream } from './notificationsBus.ts';
import {
  getPublicVapidKey,
  initializePushSubsystem,
  isValidPushEndpoint,
  isValidPushKey,
} from './push.ts';

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

function normalizeClientNameCompare(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function buildPanelClients(
  records: AttendanceRecord[],
  upcomingAppointments: AgendaAppointment[] = [],
): PanelClientSummary[] {
  const clientMap = new Map<string, PanelClientSummary>();
  for (const rec of records) {
    const key =
      rec.clientId ||
      (rec.whatsappDigits
        ? `${rec.whatsappDigits}:${rec.clientName.trim().toLowerCase()}`
        : rec.clientName.toLowerCase());
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
        serviceCategories: [],
        performedProcedures: [],
        nextAppointment: null,
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

  const clients = Array.from(clientMap.values());

  // Count how many distinct clients share each phone so ambiguous numbers require a name match
  const phoneClientCounts = new Map<string, number>();
  for (const c of clients) {
    const digits = normalizeWhatsAppDigits(c.whatsappDigits || c.whatsapp);
    if (digits) {
      phoneClientCounts.set(digits, (phoneClientCounts.get(digits) ?? 0) + 1);
    }
  }

  const categoryOrder = SERVICE_CATEGORIES.map((c) => c.id);

  for (const client of clients) {
    const categoriesSet = new Set<ServiceCategoryId>();
    const proceduresSeen = new Set<string>();
    const proceduresList: string[] = [];

    for (const att of client.attendances) {
      for (const svc of att.services) {
        const cat = classifyServiceCategory(svc, att.professional);
        if (cat) {
          categoriesSet.add(cat);
        }
        const trimmedName = svc.name.trim();
        if (trimmedName && !proceduresSeen.has(trimmedName)) {
          proceduresSeen.add(trimmedName);
          proceduresList.push(trimmedName);
        }
      }
    }

    client.serviceCategories = categoryOrder.filter((id) =>
      categoriesSet.has(id),
    );
    client.performedProcedures = proceduresList;

    const clientDigits = normalizeWhatsAppDigits(
      client.whatsappDigits || client.whatsapp,
    );
    const clientNormName = normalizeClientNameCompare(client.clientName);
    const singleOwnerOfPhone =
      Boolean(clientDigits) && (phoneClientCounts.get(clientDigits) ?? 0) === 1;

    const nextAppt = upcomingAppointments.find((appt) => {
      if (appt.status !== 'confirmed') return false;
      const apptDigits = normalizeWhatsAppDigits(
        appt.whatsappDigits || appt.whatsapp,
      );
      if (!clientDigits || apptDigits !== clientDigits) return false;
      const apptNormName = normalizeClientNameCompare(appt.clientName);
      return apptNormName === clientNormName || singleOwnerOfPhone;
    });

    client.nextAppointment = nextAppt
      ? {
          id: nextAppt.id,
          professional: nextAppt.professional,
          appointmentDate: nextAppt.appointmentDate,
          appointmentTime: nextAppt.appointmentTime,
          procedureName: nextAppt.procedureName,
        }
      : null;
  }

  return clients.sort((a, b) =>
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
  initializePushSubsystem();
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

  // Public client lookup by WhatsApp (returns only matching id & name, never history/values)
  app.get(
    '/api/clients/lookup',
    asyncHandler(async (req: Request, res: Response) => {
      const rawWhatsapp =
        typeof req.query.whatsapp === 'string' ? req.query.whatsapp : '';
      const digits = normalizeWhatsAppDigits(rawWhatsapp);
      if (digits.length < 10 || digits.length > 11) {
        res.status(400).json({
          error: 'Informe o WhatsApp com DDD (10 ou 11 dígitos).',
        });
        return;
      }

      const clients = await lookupClientsByWhatsappDigits(digits);
      res.json({ clients });
    }),
  );

  // Public client submission route
  app.post(
    '/api/attendances',
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body as {
        clientId?: unknown;
        professional?: unknown;
        clientName?: unknown;
        whatsapp?: unknown;
        totalPaid?: unknown;
        serviceIds?: unknown;
        serviceAttendanceTypes?: unknown;
        additionals?: unknown;
        extraReturnServiceIds?: unknown;
        returnOption?: unknown;
        returnDate?: unknown;
        preferredTimes?: unknown;
        serviceDate?: unknown;
        idempotencyKey?: unknown;
        source?: unknown;
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
      const whatsappDigits = normalizeWhatsAppDigits(body.whatsapp);
      if (whatsappDigits.length < 10 || whatsappDigits.length > 11) {
        res
          .status(400)
          .json({ error: 'Informe o WhatsApp com DDD (10 ou 11 dígitos).' });
        return;
      }
      const whatsapp = formatBrazilPhone(whatsappDigits);
      const clientId =
        typeof body.clientId === 'string' && body.clientId.trim().length > 0
          ? body.clientId.trim().slice(0, 120)
          : null;

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
      let returnDate: string | null = null;
      if (returnOptionMeta.value === 'specific_date') {
        if (!isValidISODate(body.returnDate)) {
          res.status(400).json({
            error: 'Selecione no calendário uma data válida para o retorno.',
          });
          return;
        }
        if (body.returnDate < getBrazilTodayISO()) {
          res.status(400).json({
            error: 'Selecione uma data futura para o próximo retorno.',
          });
          return;
        }
        returnDate = body.returnDate;
      } else if (returnDays !== null) {
        returnDate = calculateReturnDateISO(serviceDate, returnDays);
      }

      let preferredTimes: string[] = [];
      if (returnDate !== null && Array.isArray(body.preferredTimes)) {
        let pickedPeriod: string | null = null;
        const uniqueHours: string[] = [];
        for (const slot of body.preferredTimes) {
          if (typeof slot !== 'string') continue;
          const trimmed = slot.trim();
          if (
            !pickedPeriod &&
            (RETURN_PERIOD_OPTIONS as readonly string[]).includes(trimmed)
          ) {
            pickedPeriod = trimmed;
            continue;
          }
          if (isValidHHMMTime(trimmed) && !uniqueHours.includes(trimmed)) {
            uniqueHours.push(trimmed);
          }
        }
        preferredTimes = [
          ...(pickedPeriod ? [pickedPeriod] : []),
          ...uniqueHours.slice(0, 3),
        ];
      }

      const returnStatus =
        returnOptionMeta.value === 'no_schedule' ? 'not_applicable' : 'waiting';

      const extraReturnServices: ExtraReturnService[] = [];
      if (
        returnOptionMeta.value !== 'no_schedule' &&
        Array.isArray(body.extraReturnServiceIds)
      ) {
        const seenExtraIds = new Set<string>();
        for (const rawId of body.extraReturnServiceIds) {
          if (typeof rawId !== 'string' || seenExtraIds.has(rawId)) continue;
          const foundExtra = findStudioServiceById(rawId);
          if (foundExtra) {
            seenExtraIds.add(rawId);
            extraReturnServices.push(foundExtra);
          }
        }
      }

      const commissionRate = professional === 'duda' ? 0.25 : 0;
      const commissionAmount =
        professional === 'duda' ? roundMoney(totalPaid * 0.25) : 0;

      const idempotencyKey =
        typeof body.idempotencyKey === 'string' &&
        body.idempotencyKey.trim().length > 0
          ? body.idempotencyKey.trim().slice(0, 128)
          : null;

      const source =
        body.source === 'public_link' ? 'public_link' : 'attendance_form';

      const record = await insertAttendance({
        clientId,
        professional: professional as Professional,
        clientName,
        whatsapp,
        whatsappDigits,
        serviceDate,
        services: selectedServices,
        additionals: selectedAdditionals,
        extraReturnServices,
        totalPaid,
        commissionRate,
        commissionAmount,
        returnOption: returnOptionMeta.value,
        returnDays,
        returnDate,
        preferredTimes,
        returnStatus,
        idempotencyKey,
        source,
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
          extraReturnServices: record.extraReturnServices ?? [],
        },
      });
    }),
  );

  // Standalone public pre-booking route (does NOT count as attendance, revenue, or commission)
  app.post(
    '/api/pre-bookings',
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body as {
        clientId?: unknown;
        clientName?: unknown;
        whatsapp?: unknown;
        serviceIds?: unknown;
        serviceAttendanceTypes?: unknown;
        desiredDate?: unknown;
        desiredTime?: unknown;
        notes?: unknown;
        idempotencyKey?: unknown;
      };

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
      const whatsappDigits = normalizeWhatsAppDigits(body.whatsapp);
      if (whatsappDigits.length < 10 || whatsappDigits.length > 11) {
        res
          .status(400)
          .json({ error: 'Informe o WhatsApp com DDD (10 ou 11 dígitos).' });
        return;
      }
      const whatsapp = formatBrazilPhone(whatsappDigits);
      const clientId =
        typeof body.clientId === 'string' && body.clientId.trim().length > 0
          ? body.clientId.trim().slice(0, 120)
          : null;

      if (!Array.isArray(body.serviceIds) || body.serviceIds.length === 0) {
        res
          .status(400)
          .json({ error: 'Selecione pelo menos um procedimento desejado.' });
        return;
      }

      if (!isValidISODate(body.desiredDate)) {
        res
          .status(400)
          .json({ error: 'Selecione a data desejada para o agendamento.' });
        return;
      }

      if (!isValidManualTime(body.desiredTime)) {
        res.status(400).json({
          error: 'Informe o horário desejado no formato HH:MM (ex: 14:30).',
        });
        return;
      }

      const rawAttendanceTypes =
        body.serviceAttendanceTypes &&
        typeof body.serviceAttendanceTypes === 'object' &&
        !Array.isArray(body.serviceAttendanceTypes)
          ? (body.serviceAttendanceTypes as Record<string, unknown>)
          : {};

      const laisProcedures: string[] = [];
      const dudaProcedures: string[] = [];
      const seenIds = new Set<string>();

      for (const rawId of body.serviceIds) {
        if (typeof rawId !== 'string' || seenIds.has(rawId)) continue;
        const found = findStudioServiceById(rawId);
        if (!found) continue;
        seenIds.add(rawId);

        if (
          found.professional === 'lais' &&
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
          laisProcedures.push(`${found.name} — ${attendanceType}`);
        } else if (found.professional === 'lais') {
          laisProcedures.push(found.name);
        } else {
          dudaProcedures.push(found.name);
        }
      }

      if (laisProcedures.length === 0 && dudaProcedures.length === 0) {
        res
          .status(400)
          .json({ error: 'Selecione pelo menos um procedimento válido.' });
        return;
      }

      const notes =
        typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : '';
      const idempotencyKey =
        typeof body.idempotencyKey === 'string' &&
        body.idempotencyKey.trim().length > 0
          ? body.idempotencyKey.trim().slice(0, 128)
          : null;

      const result = await insertPublicPreBooking({
        clientId,
        clientName,
        whatsapp,
        whatsappDigits,
        laisProcedures,
        dudaProcedures,
        desiredDate: body.desiredDate,
        desiredTime: body.desiredTime,
        notes,
        idempotencyKey,
      });

      res.status(201).json({
        preBooking: {
          clientName: result.clientName,
          desiredDate: result.desiredDate,
          desiredTime: result.desiredTime,
          isJoint: result.isJoint,
          laisProcedures,
          dudaProcedures,
          requests: result.requests,
        },
      });
    }),
  );

  // Public interested-lead registration (does NOT count as attendance, revenue, or commission)
  app.post(
    '/api/interested-leads',
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body as {
        name?: unknown;
        whatsapp?: unknown;
        serviceIds?: unknown;
        acceptsPromotions?: unknown;
        idempotencyKey?: unknown;
      };

      if (typeof body.name !== 'string' || body.name.trim().length < 2) {
        res.status(400).json({ error: 'Informe seu nome completo.' });
        return;
      }
      const name = body.name.trim().slice(0, 120);

      if (typeof body.whatsapp !== 'string') {
        res
          .status(400)
          .json({ error: 'Informe um número de WhatsApp válido.' });
        return;
      }
      const whatsappDigits = normalizeWhatsAppDigits(body.whatsapp);
      if (whatsappDigits.length < 10 || whatsappDigits.length > 11) {
        res
          .status(400)
          .json({ error: 'Informe o WhatsApp com DDD (10 ou 11 dígitos).' });
        return;
      }
      const whatsapp = formatBrazilPhone(whatsappDigits);

      if (!Array.isArray(body.serviceIds) || body.serviceIds.length === 0) {
        res.status(400).json({
          error: 'Selecione pelo menos um serviço de interesse.',
        });
        return;
      }

      if (typeof body.acceptsPromotions !== 'boolean') {
        res.status(400).json({
          error:
            'Informe se deseja receber promoções, novidades e ofertas exclusivas pelo WhatsApp.',
        });
        return;
      }

      const selectedServices: InterestedLeadService[] = [];
      const categoriesSet = new Set<ServiceCategoryId>();
      const seenIds = new Set<string>();

      for (const rawId of body.serviceIds) {
        if (typeof rawId !== 'string' || seenIds.has(rawId)) continue;
        const found = findStudioServiceById(rawId);
        if (!found) continue;
        const category = classifyServiceCategory(found, found.professional);
        if (!category) continue;
        seenIds.add(rawId);
        categoriesSet.add(category);
        selectedServices.push({
          id: found.id,
          name: found.name,
          professional: found.professional,
          category,
        });
      }

      if (selectedServices.length === 0) {
        res.status(400).json({
          error: 'Selecione pelo menos um serviço de interesse válido.',
        });
        return;
      }

      const categoryOrder = SERVICE_CATEGORIES.map((c) => c.id);
      const serviceCategories = categoryOrder.filter((id) =>
        categoriesSet.has(id),
      );

      const idempotencyKey =
        typeof body.idempotencyKey === 'string' &&
        body.idempotencyKey.trim().length > 0
          ? body.idempotencyKey.trim().slice(0, 128)
          : null;

      const lead = await insertInterestedLead({
        name,
        whatsapp,
        whatsappDigits,
        services: selectedServices,
        serviceCategories,
        acceptsPromotions: body.acceptsPromotions,
        idempotencyKey,
      });

      res.status(201).json({ lead });
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
      const brazilToday = getBrazilTodayISO();
      // Strictly Duda's clients and upcoming appointments only
      const [dudaAttendances, upcomingAppointments] = await Promise.all([
        queryAttendances({
          professional: 'duda',
          search,
        }),
        listAgendaAppointments({
          professional: 'duda',
          startDate: brazilToday,
        }),
      ]);
      const clients = buildPanelClients(dudaAttendances, upcomingAppointments);
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
      const brazilToday = getBrazilTodayISO();

      const [allAttendances, upcomingAppointments] = await Promise.all([
        queryAttendances({ professional, search }),
        professional
          ? listAgendaAppointments({ professional, startDate: brazilToday })
          : Promise.all([
              listAgendaAppointments({ professional: 'lais', startDate: brazilToday }),
              listAgendaAppointments({ professional: 'duda', startDate: brazilToday }),
            ]).then(([laisAppts, dudaAppts]) =>
              [...laisAppts, ...dudaAppts].sort(
                (a, b) =>
                  a.appointmentDate.localeCompare(b.appointmentDate) ||
                  a.appointmentTime.localeCompare(b.appointmentTime),
              ),
            ),
      ]);
      const clients = buildPanelClients(allAttendances, upcomingAppointments);
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
          actorProfessional: req.user!.professional,
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
        const appointment = await updateAgendaAppointment(
          existing.id,
          {
            clientName,
            whatsapp,
            whatsappDigits,
            procedureName,
            appointmentDate: body.appointmentDate,
            appointmentTime: body.appointmentTime,
            notes,
          },
          req.user!.professional,
        );
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
        if (msg.startsWith('CONFLICT:')) {
          res.status(409).json({ error: msg.replace('CONFLICT:', '') });
          return;
        }
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
      const appointment = await cancelAgendaAppointment(
        existing.id,
        req.user!.professional,
      );
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
      await deleteAgendaAppointment(existing.id, req.user!.professional);
      res.json({ ok: true });
    }),
  );

  app.get(
    '/api/duda/return-requests',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const statusParam = req.query.status;
      const status: ReturnRequestStatus | undefined =
        statusParam === 'waiting' ||
        statusParam === 'pending_partner' ||
        statusParam === 'confirmed'
          ? statusParam
          : undefined;
      const search =
        typeof req.query.search === 'string' ? req.query.search : undefined;
      const requests = await listReturnRequests({
        professional: 'duda',
        status,
        search,
      });
      res.json({ requests });
    }),
  );

  app.post(
    '/api/duda/return-requests/:id/approve',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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
        res.status(400).json({
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
        const result = await approveReturnRequest({
          returnRequestId: req.params.id,
          expectedProfessional: 'duda',
          actorProfessional: req.user!.professional,
          appointmentDate: body.appointmentDate,
          appointmentTime: body.appointmentTime,
          procedureName: body.procedureName.trim().slice(0, 200),
          notes,
        });
        res.status(result.status === 'confirmed' ? 201 : 200).json(result);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Erro ao aprovar agendamento.';
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

  app.get(
    '/api/duda/notifications',
    requireAuth,
    asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
      const notifications = await listStudioNotifications('duda');
      res.json({ notifications });
    }),
  );

  app.post(
    '/api/duda/notifications/read',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const body = req.body as { id?: unknown } | undefined;
      const notificationId =
        body && typeof body.id === 'string' ? body.id : undefined;
      await markStudioNotificationsRead('duda', notificationId);
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
          actorProfessional: req.user!.professional,
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
        const appointment = await updateAgendaAppointment(
          existing.id,
          {
            clientName,
            whatsapp,
            whatsappDigits,
            procedureName,
            appointmentDate: body.appointmentDate,
            appointmentTime: body.appointmentTime,
            notes,
          },
          req.user!.professional,
        );
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
        if (msg.startsWith('CONFLICT:')) {
          res.status(409).json({ error: msg.replace('CONFLICT:', '') });
          return;
        }
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
      const appointment = await cancelAgendaAppointment(
        existing.id,
        req.user!.professional,
      );
      res.json({ appointment });
    }),
  );

  app.delete(
    '/api/admin/agenda/appointments/:id',
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const deleted = await deleteAgendaAppointment(
        req.params.id,
        req.user!.professional,
      );
      if (!deleted) {
        res.status(404).json({ error: 'Agendamento não encontrado.' });
        return;
      }
      res.json({ ok: true });
    }),
  );

  app.get(
    '/api/admin/return-requests',
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const profParam = req.query.professional;
      const professional: Professional | undefined =
        profParam === 'lais' || profParam === 'duda' ? profParam : undefined;
      const statusParam = req.query.status;
      const status: ReturnRequestStatus | undefined =
        statusParam === 'waiting' ||
        statusParam === 'pending_partner' ||
        statusParam === 'confirmed'
          ? statusParam
          : undefined;
      const search =
        typeof req.query.search === 'string' ? req.query.search : undefined;
      const requests = await listReturnRequests({
        professional,
        status,
        search,
      });
      res.json({ requests });
    }),
  );

  app.post(
    '/api/admin/return-requests/:id/approve',
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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
        res.status(400).json({
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

      const targetReq = await getReturnRequestById(req.params.id);
      if (!targetReq) {
        res
          .status(404)
          .json({ error: 'Solicitação de retorno não encontrada.' });
        return;
      }
      if (targetReq.isJoint && targetReq.professional !== 'lais') {
        res.status(403).json({
          error:
            'No agendamento conjunto, a parte da Duda precisa ser aprovada pela Duda no painel dela.',
        });
        return;
      }

      const notes =
        typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : '';

      try {
        const result = await approveReturnRequest({
          returnRequestId: req.params.id,
          expectedProfessional: targetReq.isJoint ? 'lais' : undefined,
          actorProfessional: req.user!.professional,
          appointmentDate: body.appointmentDate,
          appointmentTime: body.appointmentTime,
          procedureName: body.procedureName.trim().slice(0, 200),
          notes,
        });
        res.status(result.status === 'confirmed' ? 201 : 200).json(result);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Erro ao aprovar agendamento.';
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

  app.get(
    '/api/admin/notifications',
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const recipient: Professional =
        req.query.professional === 'duda' ? 'duda' : 'lais';
      const notifications = await listStudioNotifications(recipient);
      res.json({ notifications });
    }),
  );

  app.post(
    '/api/admin/notifications/read',
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const body = req.body as
        | { id?: unknown; professional?: unknown }
        | undefined;
      const notificationId =
        body && typeof body.id === 'string' ? body.id : undefined;
      const recipient: Professional =
        body && body.professional === 'duda' ? 'duda' : 'lais';
      await markStudioNotificationsRead(recipient, notificationId);
      res.json({ ok: true });
    }),
  );

  // Admin-only Interested Leads ("Interessadas")
  app.get(
    '/api/admin/interested-leads',
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const search =
        typeof req.query.search === 'string' ? req.query.search : undefined;
      const serviceId =
        typeof req.query.serviceId === 'string'
          ? req.query.serviceId
          : undefined;
      const rawCategory =
        typeof req.query.category === 'string' ? req.query.category : undefined;
      const validCategory = SERVICE_CATEGORIES.some(
        (c) => c.id === rawCategory,
      )
        ? (rawCategory as ServiceCategoryId)
        : undefined;
      const promotionsParam = req.query.promotions;
      const acceptsPromotions =
        promotionsParam === 'yes'
          ? true
          : promotionsParam === 'no'
            ? false
            : undefined;

      const leads = await listInterestedLeads({
        search,
        serviceId,
        category: validCategory,
        acceptsPromotions,
      });
      res.json({ leads });
    }),
  );

  app.delete(
    '/api/admin/interested-leads/:id',
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const deleted = await deleteInterestedLead(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Cadastro de interessada não encontrado.' });
        return;
      }
      res.json({ ok: true });
    }),
  );

  // ============================================================================
  // REAL-TIME NOTIFICATIONS SSE STREAM & WEB PUSH SUBSCRIPTIONS
  // ============================================================================

  app.get(
    '/api/notifications/stream',
    requireAuth,
    (req: AuthenticatedRequest, res: Response) => {
      const professional = req.user!.professional;
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);

      const unsubscribe = subscribeNotificationStream(
        professional,
        (notification) => {
          if (res.writableEnded) return;
          res.write(
            `event: notification\ndata: ${JSON.stringify(notification)}\n\n`,
          );
        },
      );

      const keepAliveTimer = setInterval(() => {
        if (!res.writableEnded) {
          res.write(': ping\n\n');
        }
      }, 25_000);

      req.on('close', () => {
        clearInterval(keepAliveTimer);
        unsubscribe();
      });
    },
  );

  app.get(
    '/api/push/vapid-public-key',
    requireAuth,
    asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
      const publicKey = await getPublicVapidKey();
      res.json({ publicKey });
    }),
  );

  app.get(
    '/api/push/status',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const [publicKey, subscriptions] = await Promise.all([
        getPublicVapidKey(),
        listPushSubscriptionsForUser(req.user!.id),
      ]);
      res.json({
        vapidPublicKey: publicKey,
        configured: Boolean(publicKey),
        activeSubscriptionsCount: subscriptions.length,
        subscriptions,
      });
    }),
  );

  app.post(
    '/api/push/subscribe',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const body = req.body as {
        endpoint?: unknown;
        keys?: { p256dh?: unknown; auth?: unknown };
        deviceLabel?: unknown;
      };

      if (!isValidPushEndpoint(body?.endpoint)) {
        res
          .status(400)
          .json({ error: 'Endpoint de notificação push inválido.' });
        return;
      }

      const p256dh = body?.keys?.p256dh;
      const auth = body?.keys?.auth;
      if (!isValidPushKey(p256dh) || !isValidPushKey(auth)) {
        res
          .status(400)
          .json({ error: 'Chaves de assinatura push inválidas.' });
        return;
      }

      const deviceLabel =
        typeof body.deviceLabel === 'string' && body.deviceLabel.trim()
          ? body.deviceLabel.trim().slice(0, 120)
          : 'Celular / Navegador';

      const subscription = await upsertPushSubscription({
        userId: req.user!.id,
        professional: req.user!.professional,
        endpoint: body.endpoint.trim(),
        p256dh: p256dh.trim(),
        auth: auth.trim(),
        deviceLabel,
      });

      res.status(201).json({ ok: true, subscription });
    }),
  );

  app.post(
    '/api/push/unsubscribe',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const body = req.body as { endpoint?: unknown } | undefined;
      const endpoint =
        body && typeof body.endpoint === 'string' && body.endpoint.trim()
          ? body.endpoint.trim()
          : undefined;
      const removed = await deletePushSubscriptionForUser(
        req.user!.id,
        endpoint,
      );
      res.json({ ok: true, removed });
    }),
  );

  app.post(
    '/api/push/test',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const user = req.user!;
      const [notification, subscriptions] = await Promise.all([
        createAndPublishStudioNotification({
          recipient: user.professional,
          type: 'test_notification',
          title: 'MAIS CÍLIOS · Notificação de teste',
          message: `Olá ${user.displayName}! Suas notificações em tempo real e no celular estão ativas.`,
          requestTypeLabel: 'Notificação de teste',
          clientName: user.displayName,
          procedures: ['Alerta de teste do sistema'],
          desiredDate: getBrazilTodayISO(),
          desiredTime: null,
          isJoint: false,
          relatedReturnRequestId: null,
          relatedAppointmentId: null,
          jointGroupId: null,
          targetTab: 'appointments',
          targetDate: getBrazilTodayISO(),
          targetProfessional: user.professional,
        }),
        listPushSubscriptionsForUser(user.id),
      ]);

      res.json({
        ok: true,
        notification,
        activeSubscriptionsCount: subscriptions.length,
      });
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
