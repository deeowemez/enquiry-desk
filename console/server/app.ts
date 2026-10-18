import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import type { Me } from '../shared/api.js';
import { factsRoutes } from './factsRoutes.js';
import { closeAll } from './pools.js';
import { routes } from './routes.js';

export async function buildApp(opts: { dev?: boolean; logger?: boolean } = {}) {
const app = Fastify({ logger: opts.logger === false ? false : { level: process.env.LOG_LEVEL ?? 'info' } });
const DEV = opts.dev ?? process.env.CONSOLE_DEV === '1';

// Sign-in is the tailnet: Tailscale Serve forwards the caller's identity in these headers. The container only listens
// on 127.0.0.1, so only Serve can reach it and the headers can't be forged from outside. CONSOLE_DEV=1 skips the check.
app.addHook('onRequest', async (req, reply) => {
  if (!req.url.startsWith('/api/')) return;
  if (!DEV && !req.headers['tailscale-user-login']) { reply.code(401).send({ error: 'Open this through the tailnet address' }); }
});
// State-changing calls need a custom header: a cross-site form post cannot send one, and there is no CORS to allow it.
app.addHook('onRequest', async (req, reply) => {
  if (req.url.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-console'] !== '1') reply.code(403).send({ error: 'Missing x-console header' });
});
app.addHook('onSend', async (req, reply) => {
  reply.header('x-content-type-options', 'nosniff');
  reply.header('referrer-policy', 'no-referrer');          // review links carry a token: never leak them in a Referer header
  reply.header('content-security-policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'");
  if (req.url.startsWith('/api/')) reply.header('cache-control', 'no-store');
});

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ZodError) return reply.code(400).send({ error: 'Bad request', issues: err.issues.map(i => i.path.join('.') + ': ' + i.message) });
  const e = err as { statusCode?: number; expose?: boolean; message: string };
  if (String((err as { code?: string }).code ?? '').startsWith('FST_ERR_CTP') && e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: 'Bad request body' });
  if (e.expose && e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: e.message });
  app.log.error(err);
  return reply.code(500).send({ error: 'Something went wrong' });     // never echo database errors to the browser
});

app.get('/api/me', async (req): Promise<Me> => ({
  login: String(req.headers['tailscale-user-login'] ?? (DEV ? 'dev@local' : '')),
  name: String(req.headers['tailscale-user-name'] ?? (DEV ? 'Dev' : '')),
}));
app.get('/healthz', async () => ({ ok: true }));
await app.register(routes);
await app.register(factsRoutes);
app.addHook('onClose', async () => { await closeAll(); });

const webDist = path.resolve(process.env.WEB_DIST ?? 'web/dist');   // relative to the project root (the working directory)
await app.register(fastifyStatic, { root: webDist, wildcard: false });
app.setNotFoundHandler((req, reply) => (req.url.startsWith('/api/') ? reply.code(404).send({ error: 'Not found' }) : reply.sendFile('index.html')));
return app;
}
