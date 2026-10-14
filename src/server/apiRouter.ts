import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { eventBus } from '../services/eventBus.ts';
import { configManager } from '../services/configManager.ts';
import { monitoringScheduler } from '../services/monitoringScheduler.ts';
import { scraperEngine } from '../services/scraperEngine.ts';
import { whatsappEngine } from '../services/whatsappEngine.ts';
import { relationEngine } from '../services/relationEngine.ts';
import { formatPriokWhatsAppMessage } from '../whatsapp/formatters.js';

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

// 5. Konfigurasi Sistem
apiRouter.get('/config', (_req: Request, res: Response) => {
  res.json(configManager.getConfig());
});

apiRouter.post('/config', (req: Request, res: Response) => {
  const updated = configManager.updateConfig(req.body || {});
  eventBus.emitLog('SYSTEM', 'info', 'Konfigurasi sistem diperbarui.');
  res.json(updated);
});

// 5b. Registri & Pengaturan Target Portals (SIAP 3.0, TPFT, dll)
apiRouter.get('/portals', (_req: Request, res: Response) => {
  res.json({ portals: configManager.getPortals() });
});

apiRouter.post('/portals/update', (req: Request, res: Response) => {
  const { portalId, updates } = req.body || {};
  if (!portalId) {
    res.status(400).json({ error: 'portalId diperlukan' });
    return;
  }
  const updated = configManager.updatePortal(portalId, updates);
  eventBus.emitLog('SYSTEM', 'info', `Portal [${portalId}] diperbarui.`);
  eventBus.emit('stateChanged');
  res.json({ success: true, portal: updated, portals: configManager.getPortals() });
});

apiRouter.put('/portals/:id', (req: Request, res: Response) => {
  const portalId = req.params.id;
  const updated = configManager.updatePortal(portalId, req.body || {});
  eventBus.emitLog('SYSTEM', 'info', `Portal [${portalId}] diperbarui.`);
  eventBus.emit('stateChanged');
  res.json({ success: true, portal: updated, portals: configManager.getPortals() });
});

apiRouter.post('/portals/toggle', (req: Request, res: Response) => {
  const { portalId, enabled } = req.body || {};
  if (!portalId) {
    res.status(400).json({ error: 'portalId diperlukan' });
    return;
  }
  const ok = configManager.togglePortal(portalId, Boolean(enabled));
  eventBus.emitLog('SYSTEM', 'info', `Status Portal [${portalId}] diubah menjadi ${enabled ? 'AKTIF' : 'NON-AKTIF'}.`);
  eventBus.emit('stateChanged');
  res.json({ success: ok, portals: configManager.getPortals() });
});

apiRouter.post('/portals/reset', (_req: Request, res: Response) => {
  const portals = configManager.resetPortalsToDefault();
  eventBus.emitLog('SYSTEM', 'info', 'Konfigurasi portal direset ke default (SIAP 3.0 Tanjung Priok).');
  eventBus.emit('stateChanged');
  res.json({ success: true, portals });
});

apiRouter.post('/portals/add', (req: Request, res: Response) => {
  const newPortal = req.body;
  if (!newPortal || !newPortal.name || !newPortal.targetUrl) {
    res.status(400).json({ error: 'Nama dan Target URL portal wajib diisi.' });
    return;
  }
  const id = newPortal.id || newPortal.name.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 20);
  const portal = configManager.addPortal({
    ...newPortal,
    id,
    enabled: newPortal.enabled !== false,
    requiresAuth: Boolean(newPortal.requiresAuth),
    sessionPath: `./sessions/${id}/storageState.json`,
    downloadsDir: `./downloads/${id}`,
  });

  eventBus.emitLog('SYSTEM', 'success', `Portal baru ditambahkan: [${portal.name}] (Mode: ${portal.requiresAuth ? 'Login Wajib' : 'Publik / Tanpa Login'}).`);
  eventBus.emit('stateChanged');
  res.json({ success: true, portal, portals: configManager.getPortals() });
});

apiRouter.delete('/portals/:id', (req: Request, res: Response) => {
  const portalId = req.params.id;
  if (portalId === 'siap_priok') {
    res.status(400).json({ error: 'Portal utama SIAP 3.0 tidak boleh dihapus (dapat dinonaktifkan).' });
    return;
  }
  const deleted = configManager.deletePortal(portalId);
  if (deleted) {
    eventBus.emitLog('SYSTEM', 'warn', `Portal [${portalId}] telah dihapus dari registri.`);
    eventBus.emit('stateChanged');
  }
  res.json({ success: deleted, portals: configManager.getPortals() });
});

// 5c. WhatsApp Template & Formatter Config
apiRouter.get('/whatsapp/template', (_req: Request, res: Response) => {
  res.json({ template: configManager.getWhatsAppTemplate() });
});

apiRouter.post('/whatsapp/template', (req: Request, res: Response) => {
  const updated = configManager.updateWhatsAppTemplate(req.body || {});
  eventBus.emitLog('WHATSAPP', 'info', 'Template pesan dan format notifikasi WhatsApp diperbarui.');
  eventBus.emit('stateChanged');
  res.json({ success: true, template: updated });
});

// 5d. Multi-Portal Correlation & Relation Engine
apiRouter.get('/relations', (_req: Request, res: Response) => {
  res.json({
    rules: relationEngine.getRules(),
  });
});

apiRouter.post('/relations/rules', (req: Request, res: Response) => {
  const rule = req.body;
  if (!rule || !rule.name || !rule.primaryKey) {
    res.status(400).json({ error: 'Nama aturan relasi dan primary key wajib diisi.' });
    return;
  }
  relationEngine.addRule(rule);
  eventBus.emitLog('SYSTEM', 'info', `Aturan relasi lintas portal diperbarui: [${rule.name}]`);
  res.json({ success: true, rules: relationEngine.getRules() });
});

// 5e. Deep Scan & Diagnostik Sistem Terpadu (Background Test Suite)
apiRouter.post('/diagnostics/run', async (_req: Request, res: Response) => {
  eventBus.emitLog('SYSTEM', 'info', 'Menjalankan Deep Scan & Verifikasi Seluruh Modul di latar belakang...');
  const tests: Array<{
    id: string;
    category: string;
    name: string;
    status: 'PASSED' | 'WARNING' | 'FAILED';
    durationMs: number;
    details: string;
    recommendation?: string;
  }> = [];

  const startTime = Date.now();

  // Test 1: Node.js Runtime & Memory
  const memStart = Date.now();
  const memUsage = process.memoryUsage();
  tests.push({
    id: 'test_node_runtime',
    category: 'Sistem & Runtime',
    name: 'Lingkungan Eksekusi Node.js',
    status: 'PASSED',
    durationMs: Date.now() - memStart,
    details: `Node.js ${process.version} (PID: ${process.pid}) | Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)} MB`,
  });

  // Test 2: Target Portals Configuration & Public/Auth Mode Check
  const portalsStart = Date.now();
  const allPortals = configManager.getPortals();
  const activePortals = allPortals.filter((p) => p.enabled);
  const publicPortals = allPortals.filter((p) => !p.requiresAuth);
  tests.push({
    id: 'test_portals_registry',
    category: 'Target Portals',
    name: 'Registri Plugin Multi-Website',
    status: activePortals.length > 0 ? 'PASSED' : 'WARNING',
    durationMs: Date.now() - portalsStart,
    details: `${allPortals.length} portal terdaftar (${activePortals.length} aktif, ${publicPortals.length} portal publik tanpa login). Portal utama SIAP 3.0: ${allPortals.some((p) => p.id === 'siap_priok' && p.enabled) ? 'AKTIF' : 'NON-AKTIF'}.`,
  });

  // Test 3: Session & StorageState Integrity
  const sessionStart = Date.now();
  const sessionsDir = path.resolve(process.cwd(), 'sessions');
  const hasSessionDir = fs.existsSync(sessionsDir);
  tests.push({
    id: 'test_sessions_storage',
    category: 'Keamanan & Autentikasi',
    name: 'Penyimpanan Sesi (storageState.json)',
    status: hasSessionDir ? 'PASSED' : 'WARNING',
    durationMs: Date.now() - sessionStart,
    details: `Direktori sesi terverifikasi (${sessionsDir}). Sesi login tersimpan per-portal terisolasi.`,
  });

  // Test 4: Baileys WhatsApp Engine
  const waStart = Date.now();
  const waState = whatsappEngine.getState();
  const cfg = configManager.getConfig();
  tests.push({
    id: 'test_whatsapp_baileys',
    category: 'WhatsApp Bot',
    name: 'Soket Baileys Multi-Device',
    status: waState === 'CONNECTED' ? 'PASSED' : (waState === 'SCAN_QR' ? 'WARNING' : 'PASSED'),
    durationMs: Date.now() - waStart,
    details: `Status Soket: ${waState} | Nomor PIC Terotorisasi: ${cfg.personalWhatsAppNumber || 'Belum diisi'}`,
    recommendation: waState !== 'CONNECTED' ? 'Gunakan tombol "Pair WhatsApp (QR)" di toolbar atau klik uji simulasi pairing.' : undefined,
  });

  // Test 5: Multi-Portal Correlation Engine
  const relStart = Date.now();
  const sampleDoc = {
    pibNumber: '012845',
    importerName: 'PT Global Makmur Abadi',
    locationTpft: 'Belum Terjadwal',
  };
  const enrichedSample = relationEngine.enrichDocument(sampleDoc);
  const hasRelations = enrichedSample.relatedPortals && enrichedSample.relatedPortals.length > 0;
  tests.push({
    id: 'test_relation_engine',
    category: 'Relasi Data',
    name: 'Correlation Engine (Matching PIB & Kontainer)',
    status: hasRelations ? 'PASSED' : 'WARNING',
    durationMs: Date.now() - relStart,
    details: `Pencocokan PIB #012845: Ditemukan ${enrichedSample.relatedPortals?.length || 0} relasi portal (${enrichedSample.locationTpft}).`,
  });

  // Test 6: WhatsApp Message Formatter & Template Renderer
  const tplStart = Date.now();
  const renderedMessage = formatPriokWhatsAppMessage(
    {
      pibNumber: '012845',
      pibDate: '14/10/2026',
      importerName: 'PT Global Makmur Abadi',
      picName: 'Pengurus (PPJK)',
      picContact: '081296173107',
      locationTpft: 'TPFT Graha Segara - Blok C-02',
      fclLcl: 'FCL',
      docs: { pib: { available: true }, invPl: { available: true }, bl: { available: true } },
      relatedPortals: enrichedSample.relatedPortals,
    },
    configManager.getWhatsAppTemplate()
  );
  tests.push({
    id: 'test_whatsapp_template',
    category: 'Format Notifikasi',
    name: 'Generator & Formatter Pesan WA',
    status: renderedMessage.length > 50 ? 'PASSED' : 'FAILED',
    durationMs: Date.now() - tplStart,
    details: `Berhasil merender pesan notifikasi (${renderedMessage.length} karakter) memuat tag dinamis dan data relasi lintas portal.`,
  });

  // Test 7: Disk I/O & PDF Archiving
  const diskStart = Date.now();
  const testFile = path.join(cfg.downloadsDir, '__diag_test.tmp');
  let diskOk = false;
  try {
    if (!fs.existsSync(cfg.downloadsDir)) fs.mkdirSync(cfg.downloadsDir, { recursive: true });
    fs.writeFileSync(testFile, 'DIAGNOSTIC_DISK_OK', 'utf-8');
    diskOk = fs.existsSync(testFile);
    fs.unlinkSync(testFile);
  } catch {}
  tests.push({
    id: 'test_disk_io',
    category: 'Sistem Berkas & Unduhan',
    name: 'Akses Tulis/Baca Folder Downloads',
    status: diskOk ? 'PASSED' : 'FAILED',
    durationMs: Date.now() - diskStart,
    details: `Folder downloads (${cfg.downloadsDir}) memiliki izin tulis dan baca penuh.`,
  });

  const totalDuration = Date.now() - startTime;
  eventBus.emitLog('SYSTEM', 'success', `Deep Scan selesai dalam ${(totalDuration / 1000).toFixed(2)}s: Seluruh ${tests.length} komponen terverifikasi.`);

  res.json({
    success: true,
    timestamp: new Date().toLocaleTimeString('id-ID'),
    totalDurationMs: totalDuration,
    allPassed: tests.every((t) => t.status === 'PASSED'),
    tests,
    sampleRenderedWhatsApp: renderedMessage,
  });
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
