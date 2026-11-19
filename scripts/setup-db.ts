import { initializeDatabase } from '../backend/db.ts';
import { closeDatabase } from '../backend/database.ts';

try {
  await initializeDatabase();
  console.log(
    'Banco inicializado. As tabelas e contas da equipe estão prontas.',
  );
} finally {
  await closeDatabase();
}
