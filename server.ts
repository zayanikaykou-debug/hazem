import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTodayDateString } from './src/server/availability.ts';
import { app, ensureInitialized } from './src/server/app.ts';
import { isSupabaseConfigured } from './src/server/store.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  await ensureInitialized();

  const PORT = Number(process.env.PORT) || 3000;

  app.use(
    '/assets/optimized',
    express.static(path.resolve(__dirname, 'public/assets/optimized'), {
      maxAge: '30d',
      immutable: true,
      etag: true,
    })
  );

  app.use(
    '/assets/aistudio',
    express.static(path.resolve(__dirname, 'public/assets/aistudio'), {
      maxAge: '7d',
      etag: true,
    })
  );

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(
      '/src/assets/images',
      express.static(path.resolve(__dirname, 'src/assets/images'), {
        maxAge: '7d',
        etag: true,
      })
    );
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath, { maxAge: '1d', etag: true }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    const driverLabel = isSupabaseConfigured() ? 'Supabase PostgreSQL' : 'SQLite local';
    console.log(
      `Hazem Coiff server listening on http://0.0.0.0:${PORT} (${driverLabel}) [${getTodayDateString()}]`
    );
  });
}

startServer();
