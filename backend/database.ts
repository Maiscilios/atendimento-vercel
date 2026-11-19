import 'dotenv/config';
import { Pool } from 'pg';
import { attachDatabasePool } from '@vercel/functions';

let pool: Pool | undefined;

export function getDatabase(): Pool {
  if (pool) return pool;

  const connectionString =
    process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
  const hosted =
    Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';

  if (!connectionString) {
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
  if (hosted && (process.env.SETUP_KEY?.trim().length ?? 0) < 32) {
    throw new Error(
      'Configure SETUP_KEY com pelo menos 32 caracteres para proteger o primeiro acesso.',
    );
  }

  if (hosted || url.hostname.endsWith('.neon.tech')) {
    url.searchParams.set('sslmode', 'verify-full');
  }

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
  if (process.env.VERCEL) attachDatabasePool(pool);
  return pool;
}

export async function closeDatabase(): Promise<void> {
  const current = pool;
  pool = undefined;
  await current?.end();
}
