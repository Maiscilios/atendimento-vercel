import 'dotenv/config';
import { Pool } from 'pg';

let pool: Pool | undefined;

export function isDatabaseConfigured(): boolean {
  return Boolean(
    process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim(),
  );
}

function createMockPool(): Pool {
  return {
    query: async () => ({ rows: [], rowCount: 0 }),
    connect: async () => ({
      query: async () => ({ rows: [], rowCount: 0 }),
      release: () => {},
    }),
    end: async () => {},
    on: () => {},
  } as unknown as Pool;
}

export function getDatabase(): Pool {
  if (pool) return pool;

  const connectionString =
    process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
  const hosted =
    Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';

  if (!connectionString) {
    if (!hosted) {
      console.warn(
        '[AI Studio] DATABASE_URL not configured — using in-memory store.',
      );
      pool = createMockPool();
      return pool;
    }
    throw new Error(
      'Configure DATABASE_URL com a conexão PostgreSQL fornecida pela integração Neon na Vercel.',
    );
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('Configure DATABASE_URL com uma URL PostgreSQL válida.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
    throw new Error('Configure DATABASE_URL com uma URL PostgreSQL válida.');
  }

  if (hosted || url.hostname.endsWith('.neon.tech')) {
    url.searchParams.set('sslmode', 'verify-full');
  }

  try {
    pool = new Pool({
      connectionString: url.toString(),
      max: 5,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 15_000,
      allowExitOnIdle: true,
      enableChannelBinding: true,
    });
    pool.on('error', (error) => {
      console.error('Erro em conexão ociosa com PostgreSQL:', error.message);
    });
  } catch {
    console.warn('[AI Studio] DB not connected — mock active');
    pool = createMockPool();
  }
  return pool;
}

export async function closeDatabase(): Promise<void> {
  const current = pool;
  pool = undefined;
  await current?.end();
}
