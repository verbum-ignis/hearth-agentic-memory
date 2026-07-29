import express from 'express';
import { fileURLToPath } from 'node:url';
import { validateAgentChoiceInput } from './agent-choice-service.js';
import { publicError } from './errors.js';
import { validateMemoryInput } from './demo-service.js';
import { requestGuards, securityHeaders, validateRecallInput } from './security.js';

export function createApp({
  resolveSession,
  recall,
  surface,
  choose,
  demo,
  allowedOrigins = [],
  trustProxy = 1,
  logger = console,
} = {}) {
  if (!resolveSession || !recall || !surface || !choose || !demo) {
    throw new TypeError('resolveSession, recall, surface, choose and demo are required');
  }
  const app = express();
  app.set('trust proxy', trustProxy);
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(express.json({ limit: '16kb', strict: true }));
  app.use(requestGuards({ allowedOrigins }));
  app.use(express.static(fileURLToPath(new URL('../../../web/', import.meta.url)), { extensions: ['html'] }));

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

  async function withSession(req, res, next) {
    try {
      req.hearthSession = await resolveSession(req, res);
      next();
    } catch (error) {
      next(error);
    }
  }

  app.post('/recall', withSession, async (req, res, next) => {
    try {
      const input = validateRecallInput(req.body);
      const result = await recall(req.hearthSession, input);
      res.json({
        memories: result.candidates.map(({ score: _score, ...memory }) => memory),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/surface', withSession, async (req, res, next) => {
    try {
      const input = validateRecallInput(req.body);
      res.json(await surface(req.hearthSession, input));
    } catch (error) {
      next(error);
    }
  });

  app.post('/agent/runs/:runId/choice', withSession, async (req, res, next) => {
    try {
      const input = validateAgentChoiceInput(req.body);
      res.json(await choose(req.hearthSession, req.params.runId, input));
    } catch (error) {
      next(error);
    }
  });

  app.post('/demo/memories', withSession, async (req, res, next) => {
    try {
      res.status(202).json(await demo.save(req.hearthSession, validateMemoryInput(req.body)));
    } catch (error) { next(error); }
  });

  app.get('/demo/memories/:id/status', withSession, async (req, res, next) => {
    try { res.json(await demo.status(req.hearthSession, req.params.id)); } catch (error) { next(error); }
  });

  app.get('/demo/constellation', withSession, async (req, res, next) => {
    try { res.json({ memories: await demo.constellation(req.hearthSession) }); } catch (error) { next(error); }
  });

  app.use((error, _req, res, _next) => {
    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'invalid_json', message: 'The request body is not valid JSON.' } });
    }
    const response = publicError(error);
    if (response.status >= 500) logger.error?.({ code: error?.code ?? 'internal_error' }, 'request failed');
    return res.status(response.status).json(response.body);
  });

  return app;
}
