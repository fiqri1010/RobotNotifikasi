import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { eventBus } from '../services/eventBus.ts';
import { configManager } from '../services/configManager.ts';
import { monitoringScheduler } from '../services/monitoringScheduler.ts';
import { scraperEngine } from '../services/scraperEngine.ts';
import { whatsappEngine } from '../services/whatsappEngine.ts';

export const apiRouter = express.Router();

apiRouter.use(express.json());

// 1. Status & Telemetri
apiRouter.get('/status', (_req: Request, res: Response) => {
  res.json({
    status: monitoringScheduler.getStatus(),
    config: configManager.getConfig(),
  });
});

// 2. Kontrol Monitoring
apiRouter.post('/monitoring/start', (_req: Request, res: Response) => {
  const started = monitoringScheduler.startMonitoring();
  res.json({ success: started, status: monitoringScheduler.getStatus() });
});

apiRouter.post('/monitoring/stop', (_req: Request, res: Response) => {
  const stopped = monitoringScheduler.stopMonitoring();
  res.json({ success: stopped, status: monitoringScheduler.getStatus() });
});

apiRouter.post('/scraper/trigger', async (_req: Request, res: Response) => {
  // Trigger scraper secara asinkron agar tidak memblokir response
  monitoringScheduler.triggerManualScrape().catch((err) => {
    eventBus.emitLog('SCRAPER', 'error', `Gagal mengeksekusi manual scraper: ${err.message}`);
  });
  res.json({ success: true, message: 'Job scraper berhasil dipicu di latar belakang.' });
});

// 3. Log Sistem & Riwayat Dokumen
apiRouter.get('/logs', (_req: Request, res: Response) => {
  res.json({ logs: eventBus.getLogs() });
});

apiRouter.post('/logs/clear', (_req: Request, res: Response) => {
  eventBus.clearLogs();
  res.json({ success: true });
});

apiRouter.get('/documents', (_req: Request, res: Response) => {
  res.json({ documents: eventBus.getDocuments() });
});

apiRouter.get('/chats', (_req: Request, res: Response) => {
  res.json({ chats: eventBus.getChatHistory() });
});

// 4. WhatsApp Controller
apiRouter.post('/whatsapp/connect', async (_req: Request, res: Response) => {
  whatsappEngine.initializeSocket().catch((err) => {
    eventBus.emitLog('WHATSAPP', 'error', `Inisialisasi soket gagal: ${err.message}`);
  });
  res.json({ success: true, state: whatsappEngine.getState() });
});

apiRouter.post('/whatsapp/disconnect', (_req: Request, res: Response) => {
  whatsappEngine.disconnect();
  res.json({ success: true, state: whatsappEngine.getState() });
});

apiRouter.post('/whatsapp/pair-simulated', (req: Request, res: Response) => {
  const phone = req.body?.phoneNumber || configManager.getConfig().personalWhatsAppNumber;
  whatsappEngine.confirmSimulatedPairing(phone);
  res.json({ success: true, state: whatsappEngine.getState() });
});

apiRouter.post('/whatsapp/send', async (req: Request, res: Response) => {
  const { recipient, message } = req.body || {};
  if (!message) {
    res.status(400).json({ error: 'Pesan tidak boleh kosong' });
    return;
  }

  const target = recipient || `${configManager.getConfig().personalWhatsAppNumber.replace(/\D/g, '')}@s.whatsapp.net`;
  const sent = await whatsappEngine.sendTextMessage(target, message);

  // Jika pesan berupa perintah bot (contoh: !status, !check)
  if (message.startsWith('!') || message.toLowerCase().includes('status')) {
    await whatsappEngine.handleIncomingCommand(target, message);
  }

  res.json({ success: sent });
});

// 5. Konfigurasi
apiRouter.get('/config', (_req: Request, res: Response) => {
  res.json(configManager.getConfig());
});

apiRouter.post('/config', (req: Request, res: Response) => {
  const updated = configManager.updateConfig(req.body || {});
  eventBus.emitLog('SYSTEM', 'info', 'Konfigurasi sistem diperbarui.');
  res.json(updated);
});

// 6. Daftar Unduhan Berkas PDF
apiRouter.get('/downloads', (_req: Request, res: Response) => {
  const downloadsDir = configManager.getConfig().downloadsDir;
  let files: Array<{ name: string; size: number; createdAt: string }> = [];

  if (fs.existsSync(downloadsDir)) {
    try {
      files = fs.readdirSync(downloadsDir).map((filename) => {
        const fullPath = path.join(downloadsDir, filename);
        const stats = fs.statSync(fullPath);
        return {
          name: filename,
          size: stats.size,
          createdAt: stats.birthtime.toISOString(),
        };
      });
    } catch {
      // ignore
    }
  }

  res.json({ files });
});

// 7. Mock Target Portal untuk Uji Mandiri Playwright
apiRouter.get('/mock-portal', (_req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Portal Sistem Dokumen Terpadu (Target Scraper)</title>
  <style>
    body { font-family: Tahoma, sans-serif; background: #e0e0e0; margin: 20px; }
    .card { background: white; border: 2px solid #808080; padding: 20px; max-width: 800px; margin: 0 auto; box-shadow: 4px 4px 0 #404040; }
    h2 { margin-top: 0; color: #000080; border-bottom: 2px solid #000080; padding-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }
    th, td { border: 1px solid #808080; padding: 8px; text-align: left; }
    th { background: #c0c0c0; color: black; font-weight: bold; }
    .btn { background: #c0c0c0; border: 2px outset #ffffff; padding: 4px 10px; cursor: pointer; text-decoration: none; color: black; display: inline-block; font-size: 12px; }
    .btn:active { border-style: inset; }
    .auth-box { background: #f8f8f8; border: 1px solid #aaa; padding: 15px; margin-bottom: 20px; }
    .form-group { margin-bottom: 10px; }
    label { display: block; font-size: 12px; font-weight: bold; margin-bottom: 3px; }
    input[type="text"], input[type="password"] { width: 250px; padding: 4px; border: 2px inset #fff; }
    .badge { background: #008000; color: white; padding: 2px 6px; font-size: 11px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Portal Administrasi Antrean Dokumen Resmi</h2>
    <div class="auth-box">
      <h3>Form Autentikasi Operator</h3>
      <form id="login-form" action="/api/mock-portal" method="get">
        <div class="form-group">
          <label for="username">Username Operator:</label>
          <input type="text" id="username" name="username" value="petugas_operator" />
        </div>
        <div class="form-group">
          <label for="password">Password:</label>
          <input type="password" id="password" name="password" value="PasswordRahasia98!" />
        </div>
        <div class="form-group">
          <input type="checkbox" id="chk-disclaimer" checked />
          <label for="chk-disclaimer" style="display:inline;">Saya menyatakan persetujuan disclaimer operasional.</label>
        </div>
        <div class="form-group">
          <input type="checkbox" id="chk-privacy" checked />
          <label for="chk-privacy" style="display:inline;">Saya menyetujui kebijakan privasi & audit kepatuhan.</label>
        </div>
        <button type="submit" id="btn-login" class="btn">Simpan & Verifikasi Sesi (storageState.json)</button>
      </form>
    </div>

    <h3>Daftar Antrean Terkini (Target Ekstraksi)</h3>
    <table id="queue-table">
      <thead>
        <tr>
          <th>No Tiket</th>
          <th>Nama Pemohon</th>
          <th>Judul Berkas</th>
          <th>PIC & Kontak</th>
          <th>Aksi</th>
        </tr>
      </thead>
      <tbody>
        <tr class="queue-row">
          <td class="col-id">DOC-98-042</td>
          <td class="col-applicant">PT Karya Gemilang</td>
          <td class="col-title">Izin Usaha Pertambangan Mineral</td>
          <td class="col-pic">Bpk. Bambang Sutrisno (081234567890)</td>
          <td><a class="btn btn-download" href="/api/mock-portal/download/DOC-98-042">Unduh PDF</a></td>
        </tr>
        <tr class="queue-row">
          <td class="col-id">DOC-98-043</td>
          <td class="col-applicant">CV Maju Terus Mandiri</td>
          <td class="col-title">Permohonan Sertifikasi ISO 9001</td>
          <td class="col-pic">Ibu Sri Wahyuni (085698765432)</td>
          <td><a class="btn btn-download" href="/api/mock-portal/download/DOC-98-043">Unduh PDF</a></td>
        </tr>
      </tbody>
    </table>
  </div>
</body>
</html>`);
});

apiRouter.get('/mock-portal/download/:id', (req: Request, res: Response) => {
  const docId = req.params.id || 'DOC-SAMPLE';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${docId}.pdf"`);
  res.send(`%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >> endobj
4 0 obj << /Length 120 >> stream
BT /F1 18 Tf 50 720 Td (MOCK PORTAL OFFICIAL ARCHIVE: ${docId}) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000224 00000 n 
trailer << /Size 5 /Root 1 0 R >>
startxref
380
%%EOF`);
});

// 8. Server-Sent Events (SSE) Stream untuk Pembaruan Real-Time ke GUI
apiRouter.get('/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Kirim initial state
  sendEvent('status', monitoringScheduler.getStatus());
  sendEvent('logs', eventBus.getLogs());
  sendEvent('chats', eventBus.getChatHistory());
  sendEvent('documents', eventBus.getDocuments());

  const onLog = (log: any) => sendEvent('log', log);
  const onChat = (chat: any) => sendEvent('chat', chat);
  const onDoc = (doc: any) => sendEvent('document', doc);
  const onTick = (seconds: number) => sendEvent('tick', { seconds });
  const onStateChange = () => sendEvent('status', monitoringScheduler.getStatus());

  eventBus.on('log', onLog);
  eventBus.on('chat', onChat);
  eventBus.on('document', onDoc);
  eventBus.on('tick', onTick);
  eventBus.on('stateChanged', onStateChange);

  req.on('close', () => {
    eventBus.off('log', onLog);
    eventBus.off('chat', onChat);
    eventBus.off('document', onDoc);
    eventBus.off('tick', onTick);
    eventBus.off('stateChanged', onStateChange);
  });
});
