/**
 * @file src/whatsapp/baileysClient.js
 * @description Modul pengontrol komunikasi dua arah WhatsApp menggunakan @whiskeysockets/baileys.
 * Menangani persistensi Multi-File Auth, penanganan siklus soket, pembuatan QR code,
 * filtering otorisasi pengirim, penerjemah perintah (command parser), dan pengiriman dokumen PDF.
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';

export class BaileysClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.authDir = options.authDir || path.resolve(process.cwd(), 'auth_info_baileys');
    this.downloadsDir = options.downloadsDir || path.resolve(process.cwd(), 'downloads');
    this.ownerNumber = options.ownerNumber || '6281234567890';
    
    // Status internal
    this.sock = null;
    this.connectionState = 'DISCONNECTED'; // DISCONNECTED | CONNECTING | SCAN_QR | CONNECTED
    this.userJid = null;
    this.qrRaw = null;
    this.qrDataUrl = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 8;
    this.isManualDisconnect = false;

    this.ensureDirectories();
  }

  /**
   * Memastikan direktori auth dan downloads tersedia
   */
  ensureDirectories() {
    if (!fs.existsSync(this.authDir)) {
      try {
        fs.mkdirSync(this.authDir, { recursive: true });
      } catch (err) {
        console.error(`[BaileysClient] Gagal membuat direktori auth: ${err.message}`);
      }
    }

    if (!fs.existsSync(this.downloadsDir)) {
      try {
        fs.mkdirSync(this.downloadsDir, { recursive: true });
      } catch (err) {
        console.error(`[BaileysClient] Gagal membuat direktori downloads: ${err.message}`);
      }
    }
  }

  /**
   * Format nomor telepon biasa ke format JID WhatsApp (@s.whatsapp.net)
   * @param {string} phone 
   * @returns {string}
   */
  formatToJid(phone) {
    if (!phone) return '';
    if (phone.includes('@s.whatsapp.net')) return phone;
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('08')) {
      clean = '62' + clean.slice(1);
    }
    return `${clean}@s.whatsapp.net`;
  }

  /**
   * Mengatur nomor pemilik yang terotorisasi
   * @param {string} number 
   */
  setOwnerNumber(number) {
    this.ownerNumber = number;
    this.emit('owner_updated', this.ownerNumber);
  }

  /**
   * Memverifikasi apakah pengirim adalah pemilik terotorisasi
   * @param {string} senderJid 
   * @returns {boolean}
   */
  isAuthorizedUser(senderJid) {
    if (!this.ownerNumber) return true;
    const cleanSender = (senderJid || '').split('@')[0].split(':')[0];
    const cleanOwner = this.ownerNumber.replace(/\D/g, '');
    
    const ownerVariants = [
      cleanOwner,
      cleanOwner.startsWith('62') ? '0' + cleanOwner.slice(2) : '',
      cleanOwner.startsWith('0') ? '62' + cleanOwner.slice(1) : '',
    ].filter(Boolean);

    return ownerVariants.includes(cleanSender);
  }

  /**
   * 1 & 2. INISIALISASI SOKET & PENANGANAN SIKLUS KONEKSI (Connection Lifecycle)
   */
  async connect() {
    if (this.connectionState === 'CONNECTED' || this.connectionState === 'CONNECTING') {
      return { success: false, message: 'Soket sudah aktif atau sedang menghubungkan.' };
    }

    this.isManualDisconnect = false;
    this.connectionState = 'CONNECTING';
    this.emit('connecting');

    try {
      // Dynamic import modul Baileys
      const baileys = await import('@whiskeysockets/baileys');
      const { makeWASocket, useMultiFileAuthState, DisconnectReason } = baileys;

      // 1. Multi-File Auth State persisten di ./auth_info_baileys/
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ['Workstation 98', 'Chrome', '1.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: true,
      });

      // Simpan pembaruan kredensial sesi ke disk
      this.sock.ev.on('creds.update', saveCreds);

      // 2. Listener siklus koneksi
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Pindai QR Code
        if (qr) {
          this.qrRaw = qr;
          this.connectionState = 'SCAN_QR';
          try {
            this.qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 5 });
          } catch {
            this.qrDataUrl = null;
          }

          this.emit('qr', {
            qrRaw: this.qrRaw,
            qrDataUrl: this.qrDataUrl,
          });
        }

        // Koneksi Berhasil Terbuka
        if (connection === 'open') {
          this.connectionState = 'CONNECTED';
          this.qrRaw = null;
          this.qrDataUrl = null;
          this.reconnectAttempts = 0;
          this.userJid = this.sock.user?.id || 'Workstation Bot User';

          this.emit('connected', {
            userJid: this.userJid,
            ownerNumber: this.ownerNumber,
          });
        }

        // Koneksi Terputus (Disconnect)
        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason?.loggedOut;
          this.connectionState = 'DISCONNECTED';
          this.qrDataUrl = null;

          this.emit('disconnected', {
            statusCode,
            isLoggedOut,
            error: lastDisconnect?.error?.message,
          });

          // Auto-reconnect loop jika bukan logout manual
          if (!this.isManualDisconnect && !isLoggedOut) {
            this.handleAutoReconnect();
          } else if (isLoggedOut) {
            this.emit('logged_out');
          }
        }
      });

      // 3. Listener pesan masuk
      this.sock.ev.on('messages.upsert', async (upsert) => {
        await this.handleMessagesUpsert(upsert);
      });

      return { success: true };
    } catch (err) {
      this.connectionState = 'DISCONNECTED';
      this.emit('error', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Logika rekoneksi otomatis dengan backoff eksponensial
   */
  handleAutoReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('error', new Error(`Batas maksimum rekoneksi (${this.maxReconnectAttempts}x) tercapai.`));
      return;
    }

    this.reconnectAttempts++;
    const delayMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 20000);

    this.emit('reconnecting', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delayMs,
    });

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delayMs);
  }

  /**
   * 3. PENANGANAN PESAN MASUK (Command Listener & Security)
   * @param {object} upsert 
   */
  async handleMessagesUpsert(upsert) {
    const { messages, type } = upsert;
    if (type !== 'notify' || !messages || !messages.length) return;

    for (const m of messages) {
      // Abaikan pesan dari diri sendiri atau pesan kosong
      if (!m.message || m.key.fromMe) continue;

      const senderJid = m.key.remoteJid;
      if (!senderJid) continue;

      // Filter Otorisasi Keamanan: Hanya terima dari pemilik terdaftar
      const isAuth = this.isAuthorizedUser(senderJid);
      if (!isAuth) {
        this.emit('unauthorized_message', {
          sender: senderJid,
          message: 'Pesan ditolak: Nomor pengirim tidak terotorisasi.',
        });
        continue;
      }

      // Ekstraksi isi pesan teks
      const textMessage =
        m.message.conversation ||
        m.message.extendedTextMessage?.text ||
        m.message.imageMessage?.caption ||
        '';

      if (!textMessage.trim()) continue;

      const messagePayload = {
        id: m.key.id || `msg-${Date.now()}`,
        sender: senderJid,
        text: textMessage.trim(),
        timestamp: new Date().toLocaleTimeString('id-ID', { hour12: false }),
        direction: 'INCOMING',
      };

      // Pancarkan event pesan masuk untuk riwayat chat GUI
      this.emit('message_received', messagePayload);

      // Jalankan Parser Perintah
      await this.parseAndExecuteCommand(senderJid, textMessage.trim());
    }
  }

  /**
   * Parser perintah dasar teks:
   * "status", "start", "stop", "cek pic <nomor>", "ping"
   * @param {string} senderJid 
   * @param {string} rawText 
   */
  async parseAndExecuteCommand(senderJid, rawText) {
    const trimmed = rawText.trim();
    const lower = trimmed.toLowerCase();

    // 1. Command: status / !status / cek status
    if (lower === 'status' || lower === '!status' || lower === 'cek status') {
      this.emit('command', {
        command: 'status',
        sender: senderJid,
        rawText: trimmed,
        reply: (text) => this.sendTextMessage(senderJid, text),
      });
      return;
    }

    // 2. Command: start / !start
    if (lower === 'start' || lower === '!start') {
      this.emit('command', {
        command: 'start',
        sender: senderJid,
        rawText: trimmed,
        reply: (text) => this.sendTextMessage(senderJid, text),
      });
      return;
    }

    // 3. Command: stop / !stop
    if (lower === 'stop' || lower === '!stop') {
      this.emit('command', {
        command: 'stop',
        sender: senderJid,
        rawText: trimmed,
        reply: (text) => this.sendTextMessage(senderJid, text),
      });
      return;
    }

    // 4. Command: ping / !ping
    if (lower === 'ping' || lower === '!ping') {
      await this.sendTextMessage(senderJid, '🏓 *Pong!*\nSistem Workstation 98 aktif dan siap menerima instruksi.');
      return;
    }

    // 5. Command: cek pic <nomor>
    const picMatch = trimmed.match(/^cek\s+pic\s+(.+)$/i);
    if (picMatch) {
      const targetQuery = picMatch[1].trim();
      this.emit('command', {
        command: 'cek_pic',
        query: targetQuery,
        sender: senderJid,
        rawText: trimmed,
        reply: (text) => this.sendTextMessage(senderJid, text),
      });
      return;
    }

    // Perintah umum lainnya
    this.emit('command_unrecognized', {
      sender: senderJid,
      text: trimmed,
      reply: (text) => this.sendTextMessage(senderJid, text),
    });
  }

  /**
   * 4. PENANGANAN PESAN KELUAR: Mengirim Pesan Teks
   * @param {string} toPhoneOrJid 
   * @param {string} text 
   * @returns {Promise<boolean>}
   */
  async sendTextMessage(toPhoneOrJid, text) {
    const targetJid = this.formatToJid(toPhoneOrJid || this.ownerNumber);

    const messageRecord = {
      id: `out-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      recipient: targetJid,
      text,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour12: false }),
      direction: 'OUTGOING',
    };

    // Pancarkan event pesan keluar untuk sinkronisasi GUI mini chat
    this.emit('message_sent', messageRecord);

    if (!this.sock || this.connectionState !== 'CONNECTED') {
      return false;
    }

    try {
      await this.sock.sendMessage(targetJid, { text });
      return true;
    } catch (err) {
      this.emit('error', new Error(`Gagal mengirim WhatsApp ke ${targetJid}: ${err.message}`));
      return false;
    }
  }

  /**
   * 4. PENANGANAN PESAN KELUAR: Mengirim Lampiran Berkas PDF dari ./downloads/
   * @param {string} toPhoneOrJid 
   * @param {string} pdfFilename Nama file di ./downloads/ atau full path
   * @param {string} caption 
   * @returns {Promise<boolean>}
   */
  async sendPdfDocument(toPhoneOrJid, pdfFilename, caption = '') {
    const targetJid = this.formatToJid(toPhoneOrJid || this.ownerNumber);
    const fullPath = path.isAbsolute(pdfFilename)
      ? pdfFilename
      : path.join(this.downloadsDir, pdfFilename);

    const baseName = path.basename(fullPath);

    const documentRecord = {
      id: `doc-out-${Date.now()}`,
      recipient: targetJid,
      fileName: baseName,
      caption,
      text: caption || `[Lampiran Berkas PDF: ${baseName}]`,
      hasAttachment: true,
      attachmentName: baseName,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour12: false }),
      direction: 'OUTGOING',
    };

    // Pancarkan ke riwayat chat mini GUI
    this.emit('document_sent', documentRecord);

    if (!this.sock || this.connectionState !== 'CONNECTED') {
      return false;
    }

    try {
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Berkas PDF tidak ditemukan pada path: ${fullPath}`);
      }

      const fileBuffer = fs.readFileSync(fullPath);

      await this.sock.sendMessage(targetJid, {
        document: fileBuffer,
        mimetype: 'application/pdf',
        fileName: baseName,
        caption: caption || `Lampiran Berkas: ${baseName}`,
      });

      return true;
    } catch (err) {
      this.emit('error', new Error(`Gagal mentransmisikan berkas PDF ${baseName}: ${err.message}`));
      return false;
    }
  }

  /**
   * Memutuskan sambungan soket secara aman
   */
  disconnect() {
    this.isManualDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.sock) {
      try {
        this.sock.end(undefined);
      } catch {
        // ignore
      }
      this.sock = null;
    }

    this.connectionState = 'DISCONNECTED';
    this.qrDataUrl = null;
    this.emit('disconnected', { manual: true });
  }

  /**
   * Menghapus sesi lokal Multi-File Auth
   */
  logout() {
    this.disconnect();
    if (fs.existsSync(this.authDir)) {
      try {
        fs.rmSync(this.authDir, { recursive: true, force: true });
        this.emit('logged_out');
        return true;
      } catch (err) {
        this.emit('error', err);
        return false;
      }
    }
    return true;
  }

  /**
   * Mengambil status terkini klien Baileys
   */
  getStatus() {
    return {
      connectionState: this.connectionState,
      userJid: this.userJid,
      ownerNumber: this.ownerNumber,
      hasQr: Boolean(this.qrDataUrl),
      qrDataUrl: this.qrDataUrl,
      authDir: this.authDir,
      hasStoredAuth: fs.existsSync(this.authDir) && fs.readdirSync(this.authDir).length > 0,
    };
  }
}

// Instance singleton siap pakai
export const baileysClient = new BaileysClient();
export default baileysClient;
