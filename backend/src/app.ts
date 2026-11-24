import express, { ErrorRequestHandler } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { initPaymentModule } from './features/payment/di/PaymentModule';
import { initAuthModule } from './features/auth/AuthModule';
import userModule from './features/user/UserModule';
import matchModule from './features/match/MatchModule';
import messageModule from './features/message/MessageModule';
import feedModule from './features/feed/FeedModule';
import storyModule from './features/story/StoryModule';
import notificationModule from './features/notification/NotificationModule';
import adminModule from './features/admin/AdminModule';
import { createCorsOptions } from './config/cors';
import { createDocsRouter } from './docs/router';
import sequelize from './config/db';

dotenv.config();

export function createApp(isReady = () => true) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  if (process.env.SENTRY_DSN && process.env.NODE_ENV !== 'test') {
    Sentry.init({ dsn: process.env.SENTRY_DSN, integrations: [nodeProfilingIntegration()], tracesSampleRate: 1.0 });
  }
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression(), cors(createCorsOptions()), cookieParser());
  app.use(createDocsRouter());
  app.use('/api/payments/stripe/webhook', express.raw({ type: 'application/json' }));
  app.use(express.json({ limit: '50mb' }), express.urlencoded({ limit: '50mb', extended: true }));

  app.get('/', (_req, res) => { res.send('Dating App Backend is running!'); });
  app.get('/api/health', (_req, res) => {
    const ready = isReady();
    res.status(ready ? 200 : 503).json({
      status: ready ? 'OK' : 'STARTING', message: ready ? 'Backend is running' : 'Database is not ready',
      apiVersion: 2, database: sequelize.getDialect(),
      commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.RENDER_GIT_COMMIT || process.env.APP_COMMIT || null,
    });
  });
  app.use('/api', (_req, res, next) => {
    if (!isReady()) return res.status(503).json({ error: 'Backend is starting. Please try again shortly.' });
    next();
  });
  app.get('/api', (_req, res) => { res.json({ status: 'OK', message: 'HeartConnect API is running', version: '2.0' }); });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: process.env.NODE_ENV === 'production' ? 100 : 1000,
    message: { error: 'Too many login attempts from this IP, please try again after 15 minutes' },
    standardHeaders: true, legacyHeaders: false,
  });
  app.use('/api/payments', initPaymentModule());
  app.use('/api/auth', authLimiter, initAuthModule());
  app.use(userModule, matchModule, messageModule, feedModule, storyModule, notificationModule, adminModule);
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'API route not found' }); });
  if (process.env.SENTRY_DSN && process.env.NODE_ENV !== 'test') Sentry.setupExpressErrorHandler(app);
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = Number(error.status) || 500;
    if (status >= 500) console.error('API request failed:', error);
    res.status(status).json({ error: status === 413 ? 'Request body is too large' : status === 400 ? 'Invalid request body' : 'Internal server error' });
  };
  app.use(handleError);
  return app;
}
