import express from 'express';
import { requireHmac } from '../security/hmac.js';
import { sendError } from './errors.js';
import {
  getConnections,
  registerTelegramLinkCode,
  syncSubscription,
  syncWordPressUser
} from '../users/user-service.js';

export function createV1Router(dependencies = {}) {
  const router = express.Router();
  const deps = {
    requireHmac,
    syncWordPressUser,
    registerTelegramLinkCode,
    syncSubscription,
    getConnections,
    ...dependencies
  };

  router.use(deps.requireHmac());

  router.post('/users/sync', async (req, res, next) => {
    try {
      const result = await deps.syncWordPressUser(req.body ?? {});
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  });

  router.post('/telegram/link-codes', async (req, res, next) => {
    try {
      const result = await deps.registerTelegramLinkCode(req.body ?? {});
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  });

  router.post('/subscriptions/sync', async (req, res, next) => {
    try {
      const result = await deps.syncSubscription(req.body ?? {});
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  });

  router.get('/users/:vittushaUserId/connections', async (req, res, next) => {
    try {
      const connections = await deps.getConnections(req.params.vittushaUserId);
      res.json({
        ok: true,
        vittusha_user_id: req.params.vittushaUserId,
        connections
      });
    } catch (error) {
      next(error);
    }
  });

  router.use((error, _req, res, _next) => {
    sendError(res, error);
  });

  return router;
}
