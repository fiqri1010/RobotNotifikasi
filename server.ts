import express from 'express';
import path from 'path';
import fs from 'fs';
import { apiRouter } from './src/server/apiRouter.ts';
import { eventBus } from './src/services/eventBus.ts';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Logging middleware
app.use((req, _res, next) => {
  if (req.url.startsWith('/api') && !req.url.includes('/events')) {
    eventBus.emitLog('SYSTEM', 'debug', `${req.method} ${req.url}`);
  }
  next();
});

// Pasang Router API
app.use('/api', apiRouter);

// Sajikan folder dist jika build statis tersedia
const distPath = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const server = app.listen(PORT, '0.0.0.0', () => {
  eventBus.emitLog('SYSTEM', 'info', `Workstation 98 Server berjalan di port ${PORT}`);
  console.log(`[Workstation 98] Server listening on http://0.0.0.0:${PORT}`);
});

process.on('SIGINT', () => {
  eventBus.emitLog('SYSTEM', 'warn', 'Menerima sinyal SIGINT. Menghentikan proses dengan aman...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0);
  });
});

export default app;
