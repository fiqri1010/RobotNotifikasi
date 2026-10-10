/**
 * @file server.js
 * @description Controller & Orchestration Server Utama Workstation 98.
 * Menghubungkan GUI Windows 98, Playwright Scraper, dan Baileys WhatsApp secara realtime
 * menggunakan Express dan WebSocket (ws) dengan penanganan graceful shutdown.
 */

import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { jobRunner } from './src/scraper/jobRunner.js';
import { adapterRegistry } from './src/scraper/registry.js';
import { baileysClient } from './src/whatsapp/baileysClient.js';
import { formatPriokWhatsAppMessage } from './src/whatsapp/formatters.js';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const DOWNLOADS_DIR = path.resolve(process.cwd(), 'downloads');

// Pastikan folder unduhan ada
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

app.use(express.json());

// ==========================================
// 1. STATE MANAGEMENT & EVENT BUS
// ==========================================
let isMonitoring = false;
let pollingIntervalMinutes = 3;
let nextRunInSeconds = pollingIntervalMinutes * 60;
let monitorIntervalTimer = null;
let countdownTimer = null;
let lastRunTimestamp = null;

let totalItemsScraped = 0;
let totalPdfDownloaded = 0;
let totalWhatsAppSent = 0;

const systemLogs = [];
const chatHistory = [];
const queueDocuments = [];
const MAX_LOGS = 250;
const MAX_CHATS = 100;

function addLog(source, level, message) {
  const logItem = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toLocaleTimeString('id-ID', { hour12: false }),
    source,
    level,
    message,
  };
  systemLogs.unshift(logItem);
  if (systemLogs.length > MAX_LOGS) systemLogs.pop();
  broadcast('log', logItem);
}

function addChat(chatItem) {
  const entry = {
    id: `chat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toLocaleTimeString('id-ID', { hour12: false }),
    ...chatItem,
  };
  chatHistory.push(entry);
  if (chatHistory.length > MAX_CHATS) chatHistory.shift();
  broadcast('chat', entry);
}

function getSystemStatus() {
  const waStatus = baileysClient.getStatus();
  const runnerStatus = jobRunner.getStatus();

  return {
    isMonitoringActive: isMonitoring,
    intervalMinutes: pollingIntervalMinutes,
    nextRunInSeconds,
    lastRunTimestamp,
    scraperStatus: jobRunner.isRunning ? 'RUNNING' : 'IDLE',
    browserSessionSaved: runnerStatus.hasSavedSession,
    whatsappStatus: waStatus.connectionState,
    whatsappQrCode: waStatus.qrDataUrl,
    whatsappUserPhone: waStatus.userJid,
    ownerNumber: waStatus.ownerNumber,
    portals: adapterRegistry.getStatusSummary(),
    totalItemsScraped,
    totalPdfDownloaded,
    totalWhatsAppSent,
  };
}

// Broadcast pesan ke seluruh browser klien yang terhubung via WebSocket
function broadcast(type, payload) {
  const packet = JSON.stringify({
    type,
    data: payload,
    timestamp: new Date().toLocaleTimeString('id-ID', { hour12: false }),
  });

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(packet);
    }
  }
}

// ==========================================
// 2. ORKESTRASI SCRAPER & WHATSAPP
// ==========================================

// Menjalankan satu siklus inspeksi scraper & transmisi WhatsApp
async function executeScrapeCycle() {
  lastRunTimestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
  addLog('SCRAPER', 'info', 'Memulai siklus pemindaian antrean dokumen web...');
  broadcast('status_update', getSystemStatus());

  const result = await jobRunner.runOnce();

  if (result.success) {
    const docs = result.documents || [];
    addLog(
      'SCRAPER',
      'success',
      `Pemindaian selesai (${(result.durationMs / 1000).toFixed(1)}s). Ditemukan ${docs.length} dokumen baru.`
    );

    if (docs.length > 0) {
      totalItemsScraped += docs.length;
      totalPdfDownloaded += docs.length;

      for (const doc of docs) {
        queueDocuments.unshift(doc);
        broadcast('document', doc);

        // Format caption notifikasi WhatsApp
        let caption = '';
        if (doc.siteId === 'siap_priok' || doc.pibNumber) {
          caption = formatPriokWhatsAppMessage({
            pibNumber: doc.pibNumber || doc.queueNo,
            pibDate: doc.pibDate || new Date().toLocaleDateString('id-ID'),
            importerName: doc.importerName || doc.applicantName,
            picName: doc.picName,
            picContact: doc.picContact,
            locationTpft: doc.locationTpft || 'Belum Terjadwal di TPFT',
            fclLcl: doc.fclLcl || (doc.jc ? (doc.jc.toUpperCase().includes('LCL') ? 'LCL' : 'FCL') : 'FCL'),
            docs: doc.docs || {
              pib: { available: true, fileName: doc.pdfFilename },
              invPl: { available: true, fileName: `INV_PL_${doc.queueNo}.pdf` },
              bl: { available: true, fileName: `BL_${doc.queueNo}.pdf` },
            },
          });
        } else {
          const portalTag = doc.siteName ? `[${doc.siteName}]` : '[Workstation 98]';
          caption = `📄 *DOKUMEN BARU TERDETEKSI* ${portalTag}\n━━━━━━━━━━━━━━━━━━━━\n• *Portal:* ${doc.siteName || 'Web Portal'}\n• *No Tiket:* ${doc.queueNo}\n• *Judul:* ${doc.documentTitle}\n• *Pemohon:* ${doc.applicantName}\n• *PIC:* ${doc.picName} (${doc.picContact})\n• *Arsip:* ./downloads/${doc.siteId || 'general'}/${doc.pdfFilename}\n━━━━━━━━━━━━━━━━━━━━\nLampiran berkas resmi terlampir di bawah.`;
        }

        addLog(
          'WHATSAPP',
          'info',
          `Mengirimkan berkas #${doc.queueNo} (${doc.siteName}) ke WhatsApp ${baileysClient.ownerNumber}...`
        );

        // Jika SIAP Priok memiliki set berkas (PIB, Inv/PL, BL), kirimkan secara berantai
        let sent = false;
        if (doc.docs && (doc.docs.pib?.filePath || doc.docs.invPl?.filePath || doc.docs.bl?.filePath)) {
          // Kirim dokumen utama beserta caption
          if (doc.docs.pib?.filePath && fs.existsSync(doc.docs.pib.filePath)) {
            sent = await baileysClient.sendPdfDocument(baileysClient.ownerNumber, doc.docs.pib.filePath, caption);
          } else {
            sent = await baileysClient.sendPdfDocument(baileysClient.ownerNumber, doc.pdfPath, caption);
          }

          // Kirim Inv/PL jika ada
          if (doc.docs.invPl?.filePath && fs.existsSync(doc.docs.invPl.filePath)) {
            await baileysClient.sendPdfDocument(baileysClient.ownerNumber, doc.docs.invPl.filePath, `Lampiran Invoice & Packing List (PIB ${doc.queueNo})`);
          }

          // Kirim BL jika ada
          if (doc.docs.bl?.filePath && fs.existsSync(doc.docs.bl.filePath)) {
            await baileysClient.sendPdfDocument(baileysClient.ownerNumber, doc.docs.bl.filePath, `Lampiran Bill of Lading (PIB ${doc.queueNo})`);
          }
        } else {
          sent = await baileysClient.sendPdfDocument(baileysClient.ownerNumber, doc.pdfPath, caption);
        }

        if (sent) {
          totalWhatsAppSent++;
          addLog('WHATSAPP', 'success', `Semua lampiran PDF penugasan #${doc.queueNo} berhasil terkirim ke WhatsApp.`);
        } else {
          // Fallback log jika WA offline
          addChat({
            direction: 'OUTGOING',
            sender: baileysClient.ownerNumber,
            text: caption,
            hasAttachment: true,
            attachmentName: doc.pdfFilename,
          });
        }
      }
    }
  } else {
    addLog('SCRAPER', 'error', `Galat pada siklus scraper: ${result.error}`);
  }

  broadcast('status_update', getSystemStatus());
}

// Kontrol Penjadwal Monitoring
function startMonitoring() {
  if (isMonitoring) return false;
  isMonitoring = true;
  nextRunInSeconds = pollingIntervalMinutes * 60;
  addLog('SCHEDULER', 'info', `Monitoring otomatis diaktifkan. Interval: ${pollingIntervalMinutes} menit.`);

  executeScrapeCycle();

  countdownTimer = setInterval(() => {
    if (nextRunInSeconds > 0) {
      nextRunInSeconds--;
    } else {
      nextRunInSeconds = pollingIntervalMinutes * 60;
    }
  }, 1000);

  const intervalMs = pollingIntervalMinutes * 60 * 1000;
  monitorIntervalTimer = setInterval(() => {
    nextRunInSeconds = pollingIntervalMinutes * 60;
    executeScrapeCycle();
  }, intervalMs);

  broadcast('status_update', getSystemStatus());
  return true;
}

function stopMonitoring() {
  if (!isMonitoring) return false;
  isMonitoring = false;

  if (monitorIntervalTimer) {
    clearInterval(monitorIntervalTimer);
    monitorIntervalTimer = null;
  }
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

  nextRunInSeconds = pollingIntervalMinutes * 60;
  addLog('SCHEDULER', 'warn', 'Monitoring otomatis dihentikan oleh pengguna.');
  broadcast('status_update', getSystemStatus());
  return true;
}

// ==========================================
// 3. EVENT LISTENERS BAILEYS WHATSAPP
// ==========================================
baileysClient.on('qr', ({ qrDataUrl }) => {
  addLog('WHATSAPP', 'info', 'QR Code autentikasi baru diterbitkan. Silakan pindai di GUI.');
  broadcast('qr', { qrDataUrl });
  broadcast('status_update', getSystemStatus());
});

baileysClient.on('connected', ({ userJid }) => {
  addLog('WHATSAPP', 'success', `Soket WhatsApp terhubung sebagai ${userJid}`);
  broadcast('status_update', getSystemStatus());
});

baileysClient.on('disconnected', ({ statusCode }) => {
  addLog('WHATSAPP', 'warn', `Koneksi WhatsApp terputus (Kode: ${statusCode || 'Tutup'}).`);
  broadcast('status_update', getSystemStatus());
});

baileysClient.on('message_received', (msg) => {
  addChat({
    direction: 'INCOMING',
    sender: msg.sender,
    text: msg.text,
  });
  addLog('WHATSAPP', 'info', `Pesan masuk dari ${msg.sender}: "${msg.text}"`);
});

baileysClient.on('message_sent', (msg) => {
  addChat({
    direction: 'OUTGOING',
    sender: msg.recipient,
    text: msg.text,
  });
});

baileysClient.on('document_sent', (doc) => {
  addChat({
    direction: 'OUTGOING',
    sender: doc.recipient,
    text: doc.caption || `Lampiran PDF: ${doc.fileName}`,
    hasAttachment: true,
    attachmentName: doc.fileName,
  });
});

// Penanganan Perintah Teks WhatsApp Masuk
baileysClient.on('command', async (cmd) => {
  const { command, sender, query, reply } = cmd;

  if (command === 'status') {
    const statusText = `🖥️ *WORKSTATION 98 SYSTEM STATUS*\n━━━━━━━━━━━━━━━━━\n• Monitoring : ${isMonitoring ? 'AKTIF' : 'IDLE'}\n• Scraper    : ${jobRunner.isRunning ? 'RUNNING' : 'IDLE'}\n• Interval   : ${pollingIntervalMinutes} Menit\n• Sesi Auth  : ${jobRunner.getStatus().hasSavedSession ? 'storageState.json (OK)' : 'Belum Ada'}\n• Total PDF  : ${totalPdfDownloaded} berkas\n• PIC Admin  : ${baileysClient.ownerNumber}\n━━━━━━━━━━━━━━━━━`;
    await reply(statusText);
  } else if (command === 'start') {
    startMonitoring();
    await reply('✅ *Perintah Diterima:* Siklus monitoring Workstation 98 telah diaktifkan.');
  } else if (command === 'stop') {
    stopMonitoring();
    await reply('⏹️ *Perintah Diterima:* Siklus monitoring Workstation 98 telah dihentikan.');
  } else if (command === 'cek_pic') {
    const matchedDocs = queueDocuments.filter(
      (d) =>
        (d.picName && d.picName.toLowerCase().includes(query.toLowerCase())) ||
        (d.picContact && d.picContact.includes(query))
    );

    if (matchedDocs.length > 0) {
      let resp = `🔍 *HASIL PENCARIAN PIC: "${query}"*\n━━━━━━━━━━━━━━━━━\n`;
      matchedDocs.slice(0, 3).forEach((d) => {
        resp += `• #${d.queueNo} - ${d.applicantName}\n  PIC: ${d.picName} (${d.picContact})\n  PDF: ${d.pdfFilename}\n`;
      });
      await reply(resp);
    } else {
      await reply(`🔍 PIC atau nomor "${query}" tidak ditemukan dalam catatan antrean terkini.`);
    }
  }
});

// ==========================================
// 4. WEBSOCKET SERVER CONTROLLER (GUI CLIENT)
// ==========================================
wss.on('connection', (ws) => {
  // Kirim data inisialisasi awal ke GUI saat tersambung
  ws.send(
    JSON.stringify({
      type: 'init',
      data: {
        status: getSystemStatus(),
        logs: systemLogs,
        chats: chatHistory,
        documents: queueDocuments,
      },
    })
  );

  ws.on('message', async (raw) => {
    try {
      const payload = JSON.parse(raw.toString());
      const { action, data } = payload;

      switch (action) {
        case 'START_MONITORING':
          startMonitoring();
          break;

        case 'STOP_MONITORING':
          stopMonitoring();
          break;

        case 'TRIGGER_SCRAPE':
          executeScrapeCycle();
          break;

        case 'CONNECT_WHATSAPP':
          baileysClient.connect();
          break;

        case 'DISCONNECT_WHATSAPP':
          baileysClient.disconnect();
          break;

        case 'SEND_CHAT':
          if (data && data.message) {
            await baileysClient.sendTextMessage(baileysClient.ownerNumber, data.message);
            // Jika diawali tanda perintah, proses parser
            if (data.message.startsWith('!') || data.message.toLowerCase().includes('status')) {
              await baileysClient.parseAndExecuteCommand(
                `${baileysClient.ownerNumber}@s.whatsapp.net`,
                data.message.replace(/^!/, '')
              );
            }
          }
          break;

        case 'CLEAR_LOGS':
          systemLogs.length = 0;
          broadcast('clear_logs', {});
          break;

        case 'SIMULATE_PAIRING':
          baileysClient.connectionState = 'CONNECTED';
          baileysClient.userJid = `${(data?.phone || baileysClient.ownerNumber).replace(/\D/g, '')}@s.whatsapp.net`;
          baileysClient.qrDataUrl = null;
          addLog('WHATSAPP', 'success', `WhatsApp terhubung sebagai ${baileysClient.userJid} (Uji Pair Mandiri).`);
          broadcast('status_update', getSystemStatus());
          break;

        case 'TOGGLE_PORTAL':
          if (data && data.portalId !== undefined) {
            adapterRegistry.setEnabled(data.portalId, data.enabled);
            addLog('SYSTEM', 'info', `Status portal ${data.portalId} diubah menjadi: ${data.enabled ? 'AKTIF' : 'NONAKTIF'}`);
            broadcast('status_update', getSystemStatus());
          }
          break;

        case 'UPDATE_PORTAL':
          if (data && data.portalId) {
            adapterRegistry.update(data.portalId, data.updates || {});
            addLog('SYSTEM', 'info', `Konfigurasi portal ${data.portalId} diperbarui.`);
            broadcast('status_update', getSystemStatus());
          }
          break;

        default:
          break;
      }
    } catch (err) {
      console.error('[WS Message Error]', err);
    }
  });
});

// Heartbeat berkala setiap 2 detik ke seluruh client
setInterval(() => {
  broadcast('heartbeat', {
    nextRunInSeconds,
    isMonitoring,
    scraperStatus: jobRunner.isRunning ? 'RUNNING' : 'IDLE',
    whatsappStatus: baileysClient.connectionState,
  });
}, 2000);

// ==========================================
// 5. REST API & STATIC SERVING
// ==========================================
app.get('/api/status', (_req, res) => {
  res.json({
    status: getSystemStatus(),
    config: {
      pollingIntervalMinutes,
      personalWhatsAppNumber: baileysClient.ownerNumber,
    },
  });
});

app.get('/api/portals', (_req, res) => res.json({ portals: adapterRegistry.getStatusSummary() }));

app.post('/api/portals/toggle', (req, res) => {
  const { portalId, enabled } = req.body || {};
  if (portalId) {
    adapterRegistry.setEnabled(portalId, enabled);
    broadcast('status_update', getSystemStatus());
  }
  res.json({ success: true, portals: adapterRegistry.getStatusSummary() });
});

app.post('/api/portals/update', (req, res) => {
  const { portalId, updates } = req.body || {};
  if (portalId && updates) {
    adapterRegistry.update(portalId, updates);
    broadcast('status_update', getSystemStatus());
  }
  res.json({ success: true, portals: adapterRegistry.getStatusSummary() });
});

app.get('/api/logs', (_req, res) => res.json({ logs: systemLogs }));
app.get('/api/chats', (_req, res) => res.json({ chats: chatHistory }));
app.get('/api/documents', (_req, res) => res.json({ documents: queueDocuments }));

app.post('/api/monitoring/start', (_req, res) => {
  startMonitoring();
  res.json({ success: true, status: getSystemStatus() });
});

app.post('/api/monitoring/stop', (_req, res) => {
  stopMonitoring();
  res.json({ success: true, status: getSystemStatus() });
});

app.post('/api/scraper/trigger', async (_req, res) => {
  executeScrapeCycle();
  res.json({ success: true, message: 'Scraper triggered' });
});

// Mock Portal untuk pengujian lokal Playwright
app.get('/api/mock-portal', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8"><title>Portal Administrasi Antrean (Target)</title>
  <style>body{font-family:Tahoma,sans-serif;background:#e0e0e0;margin:20px}.card{background:#fff;border:2px solid #808080;padding:20px;max-width:800px;margin:0 auto}h2{color:#000080;border-bottom:2px solid #000080;padding-bottom:6px}table{width:100%;border-collapse:collapse;margin-top:15px;font-size:12.5px}th,td{border:1px solid #808080;padding:7px;text-align:left}th{background:#c0c0c0}.btn{background:#c0c0c0;border:2px outset #fff;padding:3px 8px;cursor:pointer;text-decoration:none;color:#000;display:inline-block}.form-grp{margin-bottom:8px}</style>
</head>
<body>
  <div class="card">
    <h2>Portal Administrasi Antrean Dokumen Resmi</h2>
    <div style="background:#f5f5f5;border:1px solid #aaa;padding:12px;margin-bottom:15px">
      <form id="login-form">
        <div class="form-grp"><label>Username:</label> <input type="text" id="username" name="username" value="petugas_operator" /></div>
        <div class="form-grp"><label>Password:</label> <input type="password" id="password" name="password" value="PasswordRahasia98!" /></div>
        <div class="form-grp"><input type="checkbox" id="chk-disclaimer" checked /> <label for="chk-disclaimer">Saya setuju disclaimer.</label></div>
        <div class="form-grp"><input type="checkbox" id="chk-privacy" checked /> <label for="chk-privacy">Saya setuju kebijakan privasi.</label></div>
        <button type="submit" id="btn-login" class="btn">Simpan Sesi storageState.json</button>
      </form>
    </div>
    <table id="queue-table">
      <thead><tr><th>No Tiket</th><th>Nama Pemohon</th><th>Judul Berkas</th><th>PIC & Kontak</th><th>Aksi</th></tr></thead>
      <tbody>
        <tr class="queue-row"><td class="col-id">DOC-98-042</td><td class="col-applicant">PT Karya Gemilang</td><td class="col-title">Izin Usaha Pertambangan Mineral</td><td class="col-pic">Bpk. Bambang Sutrisno (081234567890)</td><td><a class="btn btn-download" href="/api/mock-portal/download/DOC-98-042">Unduh PDF</a></td></tr>
        <tr class="queue-row"><td class="col-id">DOC-98-043</td><td class="col-applicant">CV Maju Terus Mandiri</td><td class="col-title">Permohonan Sertifikasi ISO 9001</td><td class="col-pic">Ibu Sri Wahyuni (085698765432)</td><td><a class="btn btn-download" href="/api/mock-portal/download/DOC-98-043">Unduh PDF</a></td></tr>
      </tbody>
    </table>
  </div>
</body></html>`);
});

app.get('/api/mock-portal/download/:id', (req, res) => {
  const docId = req.params.id || 'DOC-SAMPLE';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${docId}.pdf"`);
  res.send(`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >> endobj\n4 0 obj << /Length 120 >> stream\nBT /F1 18 Tf 50 720 Td (WORKSTATION 98 ARCHIVE: ${docId}) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000224 00000 n \ntrailer << /Size 5 /Root 1 0 R >>\nstartxref\n380\n%%EOF`);
});

// Mock Portal 2: Portal Pengadaan & Tender Dokumen
app.get('/api/mock-portal-2', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8"><title>Portal Layanan Pengadaan & Tender (Target 2)</title>
  <style>body{font-family:Tahoma,sans-serif;background:#ece9d8;margin:20px}.card{background:#fff;border:2px solid #000080;padding:20px;max-width:820px;margin:0 auto;box-shadow:3px 3px 0 #808080}h2{color:#000080;border-bottom:2px solid #000080;padding-bottom:6px}table{width:100%;border-collapse:collapse;margin-top:15px;font-size:12px}th,td{border:1px solid #7f9db9;padding:7px;text-align:left}th{background:#dbeaf9;color:#000080}.btn{background:#ece9d8;border:2px outset #fff;padding:3px 8px;cursor:pointer;text-decoration:none;color:#000;display:inline-block}.form-grp{margin-bottom:8px}</style>
</head>
<body>
  <div class="card">
    <h2>Sistem Pengadaan Barang & Jasa Resmi (Portal 2)</h2>
    <div style="background:#f0f4fc;border:1px solid #7f9db9;padding:12px;margin-bottom:15px">
      <form id="tender-login-form">
        <div class="form-grp"><label>Akun Verifikator:</label> <input type="text" id="txt-user" name="txt-user" value="verifikator_tender" /></div>
        <div class="form-grp"><label>Kunci Akses:</label> <input type="password" id="txt-pass" name="txt-pass" value="PasswordTender98!" /></div>
        <div class="form-grp"><input type="checkbox" id="chk-paktaintegritas" checked /> <label for="chk-paktaintegritas">Saya menyatakan bebas benturan kepentingan.</label></div>
        <div class="form-grp"><input type="checkbox" id="chk-ketentuan" checked /> <label for="chk-ketentuan">Saya mematuhi ketentuan lelang elektronik.</label></div>
        <button type="submit" id="btn-submit-tender" class="btn">Autentikasi Sesi Portal 2</button>
      </form>
    </div>
    <table id="tender-table">
      <thead><tr><th>Kode Tender</th><th>Nama Vendor</th><th>Paket Pekerjaan</th><th>Kontak PIC</th><th>Dokumen Lelang</th></tr></thead>
      <tbody>
        <tr class="tender-row"><td class="col-tender-id">TND-98-011</td><td class="col-vendor">PT Mega Citra Kontruksi</td><td class="col-project">Pembangunan Gedung Arsip Negara</td><td class="col-contact">Bpk. Irfan Maulana (081288990011)</td><td><a class="btn btn-unduh-lampiran" href="/api/mock-portal-2/download/TND-98-011">Unduh Dokumen</a></td></tr>
        <tr class="tender-row"><td class="col-tender-id">TND-98-012</td><td class="col-vendor">PT Telekomunikasi Prima</td><td class="col-project">Pengadaan Jaringan Serat Optik</td><td class="col-contact">Ibu Maya Lestari (087812345678)</td><td><a class="btn btn-unduh-lampiran" href="/api/mock-portal-2/download/TND-98-012">Unduh Dokumen</a></td></tr>
      </tbody>
    </table>
  </div>
</body></html>`);
});

app.get('/api/mock-portal-2/download/:id', (req, res) => {
  const docId = req.params.id || 'TND-SAMPLE';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${docId}.pdf"`);
  res.send(`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >> endobj\n4 0 obj << /Length 120 >> stream\nBT /F1 18 Tf 50 720 Td (MOCK PORTAL 2 TENDER ARCHIVE: ${docId}) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000224 00000 n \ntrailer << /Size 5 /Root 1 0 R >>\nstartxref\n380\n%%EOF`);
});

// Sajikan folder dist jika build tersedia, atau public
const distPath = path.resolve(process.cwd(), 'dist');
const publicPath = path.resolve(process.cwd(), 'public');

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
} else if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
}

// ==========================================
// 6. GRACEFUL SHUTDOWN & CLEANUP
// ==========================================
let isShuttingDown = false;

async function handleGracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[Shutdown] Menerima sinyal ${signal}. Membersihkan proses latar belakang...`);
  addLog('SYSTEM', 'warn', `Server menerima sinyal ${signal}. Menghentikan seluruh proses...`);

  // 1. Hentikan timer monitoring
  stopMonitoring();

  // 2. Hentikan runner scraper
  jobRunner.stop();

  // 3. Putus soket WhatsApp
  baileysClient.disconnect();

  // 4. Tutup seluruh koneksi WebSocket klien
  for (const client of wss.clients) {
    try {
      client.close(1001, 'Server sedang dimatikan.');
    } catch {}
  }

  // 5. Tutup server HTTP
  server.close(() => {
    console.log('[Shutdown] Server Workstation 98 ditutup secara bersih tanpa zombie process.');
    process.exit(0);
  });

  // Paksa keluar jika penutupan melebihi 5 detik
  setTimeout(() => {
    console.error('[Shutdown] Batas waktu pembersihan terlampaui. Keluar paksa.');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));

server.listen(PORT, '0.0.0.0', () => {
  addLog('SYSTEM', 'info', `Workstation 98 Controller aktif pada http://0.0.0.0:${PORT}`);
  console.log(`[Workstation 98] Server listening on http://0.0.0.0:${PORT} (WebSocket on /ws)`);
});

export default server;
