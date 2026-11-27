import type { IncomingMessage, ServerResponse } from 'node:http';
import { app, ensureInitialized } from '../src/server/app.ts';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.url) {
    const parsed = new URL(req.url, 'http://localhost');
    const rewrittenPath = parsed.searchParams.get('__path');

    if (req.url === '/api/index' || req.url.startsWith('/api/index?')) {
      if (rewrittenPath !== null) {
        parsed.searchParams.delete('__path');
        const remainingQuery = parsed.searchParams.toString();
        const normalizedSubPath = rewrittenPath.replace(/^\/+/, '');
        req.url = `/api/${normalizedSubPath}${remainingQuery ? `?${remainingQuery}` : ''}`;
      } else if (
        typeof req.headers['x-matched-path'] === 'string' &&
        req.headers['x-matched-path'].startsWith('/api/')
      ) {
        req.url = req.headers['x-matched-path'];
      }
    } else if (rewrittenPath !== null) {
      parsed.searchParams.delete('__path');
      const remainingQuery = parsed.searchParams.toString();
      req.url = `${parsed.pathname}${remainingQuery ? `?${remainingQuery}` : ''}`;
    }
  }

  await ensureInitialized();
  app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
}
