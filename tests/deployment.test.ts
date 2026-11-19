import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { Client } from 'pg';
import test from 'node:test';

const execFileAsync = promisify(execFile);

test(
  'API PostgreSQL com dados e sessões persistentes',
  { timeout: 60_000 },
  async (t) => {
    assert.ok(
      process.env.TEST_DATABASE_URL,
      'Defina TEST_DATABASE_URL com uma conexão PostgreSQL direta para executar os testes de integração.',
    );
    const connection = new URL(process.env.TEST_DATABASE_URL);
    const schema = `maiscilios_test_${randomUUID().replaceAll('-', '')}`;
    const admin = new Client({
      connectionString: connection.toString(),
      connectionTimeoutMillis: 15_000,
    });
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    connection.searchParams.set('options', `-c search_path=${schema}`);

    process.env.NODE_ENV = 'test';
    delete process.env.VERCEL;
    process.env.DATABASE_URL = connection.toString();
    delete process.env.POSTGRES_URL;
    process.env.SETUP_KEY = 'test-only-setup-key-with-at-least-32-characters';

    const { default: app } = await import('../api/index.ts');
    const { closeDatabase } = await import('../backend/database.ts');
    const server = app.listen(0, '127.0.0.1');
    t.after(async () => {
      try {
        await new Promise<void>((resolve, reject) =>
          server.close((err) => (err ? reject(err) : resolve())),
        );
        await closeDatabase();
      } finally {
        try {
          await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
        } finally {
          await admin.end();
        }
      }
    });
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;

    async function request(
      url: string,
      method = 'GET',
      body?: unknown,
      token?: string,
    ) {
      const response = await fetch(`${origin}${url}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return {
        status: response.status,
        headers: response.headers,
        data: await response.json(),
      };
    }

    let laisToken = '';
    let dudaToken = '';
    let dudaAttendanceId = '';
    const date = '2026-11-19';

    await t.test(
      'inicializa tabelas e usuários em processos concorrentes',
      async () => {
        await Promise.all(
          Array.from({ length: 3 }, () =>
            execFileAsync(
              process.execPath,
              [
                '--import',
                'tsx',
                '--input-type=module',
                '-e',
                `
        import { initializeDatabase } from './backend/db.ts';
        import { closeDatabase } from './backend/database.ts';
        try { await initializeDatabase(); } finally { await closeDatabase(); }
      `,
              ],
              { cwd: process.cwd(), env: process.env },
            ),
          ),
        );
      },
    );

    await t.test(
      'inicializa o banco uma vez sob requisições concorrentes',
      async () => {
        const responses = await Promise.all(
          Array.from({ length: 5 }, () => request('/api/health')),
        );
        for (const response of responses) {
          assert.equal(response.status, 200);
          assert.deepEqual(response.data, { ok: true });
        }
        const status = await request('/api/auth/setup-status');
        assert.deepEqual(status.data, {
          laisConfigured: false,
          dudaConfigured: false,
          setupKeyRequired: true,
        });
        assert.equal(status.headers.get('cache-control'), 'no-store');
        assert.equal((await request('/api/admin/clients')).status, 401);
      },
    );

    await t.test(
      'protege o primeiro cadastro e impede sobrescrita simultânea da senha',
      async () => {
        assert.equal(
          (
            await request('/api/auth/setup-password', 'POST', {
              username: 'lais',
              password: 'test-password',
            })
          ).status,
          403,
        );
        const payload = {
          username: 'lais',
          password: 'test-password',
          setupKey: process.env.SETUP_KEY,
        };
        const responses = await Promise.all([
          request('/api/auth/setup-password', 'POST', payload),
          request('/api/auth/setup-password', 'POST', payload),
        ]);
        assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
        laisToken = responses.find((r) => r.status === 201)!.data.token;
        const duda = await request('/api/auth/setup-password', 'POST', {
          ...payload,
          username: 'duda',
        });
        assert.equal(duda.status, 201);
        dudaToken = duda.data.token;
        assert.equal(
          (await request('/api/admin/clients', 'GET', undefined, dudaToken))
            .status,
          403,
        );
        assert.equal(
          (await request('/api/auth/me', 'GET', undefined, laisToken)).data.user
            .role,
          'admin',
        );
      },
    );

    await t.test(
      'aceita login por cookie HTTPS e rejeita senha incorreta',
      async () => {
        assert.equal(
          (
            await request('/api/auth/login', 'POST', {
              username: 'lais',
              password: 'incorrect',
            })
          ).status,
          401,
        );
        const response = await fetch(`${origin}/api/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-Proto': 'https',
          },
          body: JSON.stringify({ username: 'lais', password: 'test-password' }),
        });
        assert.equal(response.status, 200);
        const cookie = response.headers.get('set-cookie')!;
        assert.match(cookie, /HttpOnly/);
        assert.match(cookie, /Secure/);
        assert.match(cookie, /SameSite=Lax/);
        const current = await fetch(`${origin}/api/auth/me`, {
          headers: { Cookie: cookie.split(';')[0] },
        });
        assert.equal((await current.json()).user.username, 'lais');
      },
    );

    await t.test(
      'salva atendimentos e mantém isolamento dos painéis e cálculos de comissão',
      async () => {
        for (const professional of ['duda', 'lais']) {
          const response = await request('/api/attendances', 'POST', {
            professional,
            clientName: `Cliente ${professional}`,
            whatsapp: '11999998888',
            totalPaid: professional === 'duda' ? 135.95 : 100,
            serviceIds: [
              professional === 'duda' ? 'duda_manicure' : 'lais_henna',
            ],
            additionals: [],
            returnOption: '15_days',
            preferredTimes: ['08:00', '09:00', '10:00'],
            serviceDate: date,
          });
          assert.equal(response.status, 201, JSON.stringify(response.data));
          assert.equal(response.data.confirmation.returnDate, '2026-12-04');
          if (professional === 'duda')
            dudaAttendanceId = response.data.confirmation.id;
        }
        const duda = await request(
          `/api/duda/dashboard?date=${date}`,
          'GET',
          undefined,
          dudaToken,
        );
        assert.equal(duda.data.dayTotalProduced, 135.95);
        assert.equal(duda.data.dayAttendances[0].commissionRate, 0.25);
        assert.equal(typeof duda.data.dayAttendances[0].totalPaid, 'number');
        assert.equal(duda.data.dayCommissionToLais, 33.99);
        const admin = await request(
          `/api/admin/dashboard?date=${date}`,
          'GET',
          undefined,
          laisToken,
        );
        assert.equal(admin.data.dayTotalProduced, 235.95);
        const filtered = await request(
          `/api/admin/attendances?professional=lais&search=Cliente&serviceId=lais_henna&startDate=${date}&endDate=${date}&returnStatus=waiting&onlyReturns=true`,
          'GET',
          undefined,
          laisToken,
        );
        assert.equal(filtered.data.attendances.length, 1);
        assert.equal(filtered.data.attendances[0].professional, 'lais');
        const clients = await request(
          '/api/duda/clients',
          'GET',
          undefined,
          dudaToken,
        );
        assert.equal(clients.data.clients.length, 1);
        assert.deepEqual(clients.data.clients[0].professionals, ['duda']);
        for (const endpoint of [
          '/api/admin/clients',
          '/api/admin/duda-finance',
          '/api/duda/attendances',
        ]) {
          assert.equal(
            (await request(endpoint, 'GET', undefined, laisToken)).status,
            200,
          );
        }
      },
    );

    await t.test(
      'atualiza retornos e pagamentos sem perder os dados',
      async () => {
        const updated = await request(
          `/api/duda/attendances/${dudaAttendanceId}/return-status`,
          'PATCH',
          {
            status: 'confirmed',
          },
          dudaToken,
        );
        assert.equal(updated.data.attendance.returnStatus, 'confirmed');
        const paid = await request(
          `/api/admin/commissions/${date}/status`,
          'PATCH',
          { status: 'paid' },
          laisToken,
        );
        assert.equal(paid.data.payoutStatus, 'paid');
        for (const endpoint of [
          '/api/admin/commissions',
          '/api/duda/commissions',
        ]) {
          const commissions = await request(
            `${endpoint}?date=${date}`,
            'GET',
            undefined,
            laisToken,
          );
          assert.equal(commissions.data.selectedDay.payoutStatus, 'paid');
          assert.equal(commissions.data.selectedDay.commissionAmount, 33.99);
        }
      },
    );

    await t.test(
      'outro processo lê os mesmos atendimentos, senhas e sessões',
      () => {
        const result = spawnSync(
          process.execPath,
          [
            '--import',
            'tsx',
            '--input-type=module',
            '-e',
            `
      import { queryAttendances, getSessionUser } from './backend/db.ts';
      import { closeDatabase } from './backend/database.ts';
      const records = await queryAttendances({});
      const user = await getSessionUser(process.env.TEST_SESSION_TOKEN);
      console.log(JSON.stringify({ count: records.length, user: user?.username }));
      await closeDatabase();
    `,
          ],
          {
            cwd: process.cwd(),
            env: { ...process.env, TEST_SESSION_TOKEN: laisToken },
            encoding: 'utf8',
          },
        );
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(JSON.parse(result.stdout), { count: 2, user: 'lais' });
      },
    );

    await t.test(
      'troca e redefine senhas, revoga sessão e exclui atendimento',
      async () => {
        assert.equal(
          (
            await request(
              '/api/auth/change-password',
              'POST',
              {
                currentPassword: 'test-password',
                newPassword: 'new-test-password',
              },
              dudaToken,
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await request('/api/auth/login', 'POST', {
              username: 'duda',
              password: 'new-test-password',
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await request(
              '/api/admin/reset-duda-password',
              'POST',
              {},
              laisToken,
            )
          ).status,
          200,
        );
        assert.equal(
          (await request('/api/auth/me', 'GET', undefined, dudaToken)).data
            .user,
          null,
        );
        assert.equal(
          (await request('/api/auth/setup-status')).data.dudaConfigured,
          false,
        );
        assert.equal(
          (
            await request('/api/auth/setup-password', 'POST', {
              username: 'duda',
              password: 'new-password',
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              `/api/admin/attendances/${dudaAttendanceId}`,
              'DELETE',
              undefined,
              laisToken,
            )
          ).status,
          200,
        );
        assert.equal(
          (await request('/api/auth/logout', 'POST', {}, laisToken)).status,
          200,
        );
        assert.equal(
          (await request('/api/auth/me', 'GET', undefined, laisToken)).data
            .user,
          null,
        );
        assert.equal((await request('/api/does-not-exist')).status, 404);
      },
    );
  },
);

test('produção exige conexão PostgreSQL e código de configuração', () => {
  for (const configuration of [
    { DATABASE_URL: '', SETUP_KEY: '' },
    { DATABASE_URL: 'file:data/maiscilios.db', SETUP_KEY: '' },
    { DATABASE_URL: 'https://example.com/database', SETUP_KEY: '' },
    { DATABASE_URL: 'invalid-url', SETUP_KEY: '' },
    {
      DATABASE_URL: 'postgresql://test:password@example.com/test',
      SETUP_KEY: '',
    },
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `
      import { getDatabase } from './backend/database.ts';
      getDatabase();
    `,
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          VERCEL: '',
          POSTGRES_URL: '',
          ...configuration,
          NODE_ENV: 'production',
        },
        encoding: 'utf8',
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Configure (DATABASE_URL|SETUP_KEY)/);
    assert.ok(
      !result.stderr.includes('test:password'),
      'A conexão não deve aparecer nos erros.',
    );
  }
});

test('aceita POSTGRES_URL, prioriza DATABASE_URL e configura TLS para Neon', () => {
  for (const primary of [
    '',
    'postgresql://test:password@primary-pooler.neon.tech/test?sslmode=require',
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `
      import assert from 'node:assert/strict';
      import { getDatabase, closeDatabase } from './backend/database.ts';
      const pool = getDatabase();
      const url = new URL(pool.options.connectionString);
      assert.equal(url.hostname, process.env.DATABASE_URL ? 'primary-pooler.neon.tech' : 'fallback-pooler.neon.tech');
      assert.equal(url.searchParams.get('sslmode'), 'verify-full');
      assert.equal(pool.options.enableChannelBinding, true);
      await closeDatabase();
    `,
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          VERCEL: '',
          NODE_ENV: 'production',
          DATABASE_URL: primary,
          POSTGRES_URL:
            'postgresql://test:password@fallback-pooler.neon.tech/test?sslmode=require',
          SETUP_KEY: 'test-only-setup-key-with-at-least-32-characters',
        },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, result.stderr);
  }
});
