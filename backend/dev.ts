import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import { createApiApp } from './app.ts';

async function start(): Promise<void> {
  const app = createApiApp();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) =>
      res.sendFile(path.join(distPath, 'index.html')),
    );
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`MAIS CÍLIOS: http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error('Não foi possível iniciar o servidor:', error);
  process.exitCode = 1;
});
