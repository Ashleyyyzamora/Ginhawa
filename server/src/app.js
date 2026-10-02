import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config.js';
import { query } from './db.js';
import adminRoutes from './routes/admin.js';
import enrollRouter from './routes/enroll.js';
import devicesRouter from './routes/devices.js';
import alertRoutes from './routes/alerts.js';
import ingestRouter from './routes/ingest.js';
import { errorHandler, notFound } from './http.js';

export function createApp(realtime) {
  const app = express();
  app.set('trust proxy', 1); // behind Caddy / nginx
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') }));
  app.use(express.json({ limit: '1mb' }));

  const api = express.Router();
  api.get('/health', async (req, res) => {
    await query('SELECT 1');
    res.json({ status: 'ok', time: new Date().toISOString() });
  });
  api.use('/admin', adminRoutes);
  api.use('/enroll', enrollRouter(realtime));
  api.use('/devices', devicesRouter(realtime));
  api.use('/alerts', alertRoutes);
  api.use('/ingest', ingestRouter(realtime));

  app.use('/api/v1', api);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
