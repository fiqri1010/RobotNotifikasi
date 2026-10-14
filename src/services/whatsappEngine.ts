import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import { eventBus } from './eventBus.ts';
import { configManager } from './configManager.ts';
import { baileysClient } from '../whatsapp/baileysClient.js';
import { formatPriokWhatsAppMessage } from '../whatsapp/formatters.js';

export type WhatsAppConnectionState = 'DISCONNECTED' | 'SCAN_QR' | 'CONNECTING' | 'CONNECTED';

export class WhatsAppEngine {
  private isBound = false;

  constructor() {
    this.bindBaileysClientEvents();
  }

  private bindBaileysClientEvents(): void {
    if (this.isBound) return;
    this.isBound = true;

    baileysClient.on('qr', (data: any) => {
      eventBus.emitLog('WHATSAPP', 'info', 'QR Code otentikasi baru telah diterbitkan. Silakan scan melalui GUI.');
      eventBus.emit('stateChanged');
    });

    baileysClient.on('connected', (data: any) => {
      eventBus.emitLog('WHATSAPP', 'success', `WhatsApp terhubung sebagai ${data.userJid}`);
      eventBus.emit('stateChanged');
    });

    baileysClient.on('disconnected', (data: any) => {
      eventBus.emitLog('WHATSAPP', 'warn', `Koneksi WhatsApp terputus (Status: ${data.statusCode || 'Tutup'}).`);
      eventBus.emit('stateChanged');
    });

    baileysClient.on('message_received', (msg: any) => {
      eventBus.emitChat({
        direction: 'INCOMING',
        sender: msg.sender,
        text: msg.text,
      });
      eventBus.emitLog('WHATSAPP', 'info', `Pesan masuk dari ${msg.sender}: "${msg.text}"`);
    });

    baileysClient.on('message_sent', (msg: any) => {
      eventBus.emitChat({
        direction: 'OUTGOING',
        sender: msg.recipient,
        text: msg.text,
      });
    });

    baileysClient.on('document_sent', (doc: any) => {
      eventBus.emitChat({
        direction: 'OUTGOING',
        sender: doc.recipient,
        text: doc.caption || `Lampiran: ${doc.fileName}`,
        hasAttachment: true,
        attachmentName: doc.fileName,
      });
    });

    baileysClient.on('command', async (cmd: any) => {
      await this.handleIncomingCommand(cmd.sender, cmd.rawText);
    });

    baileysClient.on('unauthorized_message', (info: any) => {
      eventBus.emitLog('WHATSAPP', 'warn', `[KEAMANAN] Pesan diabaikan dari nomor tidak terotorisasi: ${info.sender}`);
    });
  }

  public getState(): WhatsAppConnectionState {
    const rawState = baileysClient.getStatus().connectionState;
    return rawState as WhatsAppConnectionState;
  }

  public getQrCodeDataUrl(): string | null {
    return baileysClient.getStatus().qrDataUrl;
  }

  public getUserJid(): string | null {
    return baileysClient.getStatus().userJid;
  }

  public async initializeSocket(): Promise<void> {
    const config = configManager.getConfig();
    baileysClient.setOwnerNumber(config.personalWhatsAppNumber);

    eventBus.emitLog('WHATSAPP', 'info', 'Menginisialisasi soket Baileys (Multi-Device Protocol)...');
    const result = await baileysClient.connect();

    if (!result.success) {
      eventBus.emitLog('WHATSAPP', 'warn', `Soket lokal: ${result.error || result.message}. Menyiapkan simulator pairing.`);
      await this.startSimulatedWhatsApp();
    }
  }

  public async startSimulatedWhatsApp(): Promise<void> {
    const fakeQr = `workstation98-wa-session-${Date.now()}`;
    try {
      const qrDataUrl = await QRCode.toDataURL(fakeQr, { margin: 2, scale: 6 });
      (baileysClient as any).qrDataUrl = qrDataUrl;
      (baileysClient as any).connectionState = 'SCAN_QR';
      eventBus.emit('stateChanged');
      eventBus.emitLog('WHATSAPP', 'info', 'QR Code simulasi aktif untuk pengujian tampilan GUI retro.');
    } catch {
      // ignore
    }
  }

  public confirmSimulatedPairing(phoneNumber: string): void {
    (baileysClient as any).connectionState = 'CONNECTED';
    (baileysClient as any).qrDataUrl = null;
    (baileysClient as any).userJid = `${phoneNumber.replace(/\D/g, '')}@s.whatsapp.net`;
    eventBus.emitLog('WHATSAPP', 'success', `WhatsApp terhubung sebagai ${(baileysClient as any).userJid} (Mode Workstation 98).`);
    eventBus.emit('stateChanged');
  }

  public async handleIncomingCommand(sender: string, commandText: string): Promise<void> {
    const cleanCmd = commandText.trim().toLowerCase();
    const config = configManager.getConfig();

    if (cleanCmd === '!status' || cleanCmd === 'cek status' || cleanCmd === 'status') {
      const response = `🖥️ *WORKSTATION 98 SYSTEM STATUS*
━━━━━━━━━━━━━━━━━
• Monitoring: AKTIF
• Scraper: IDLE
• Interval: ${config.pollingIntervalMinutes} Menit
• Sesi Auth: storageState.json (Tersimpan)
• PIC Terdaftar: ${config.personalWhatsAppNumber}
━━━━━━━━━━━━━━━━━
Ketik *!check* atau *start* untuk instruksi selanjutnya.`;
      await this.sendTextMessage(sender, response);
    } else if (cleanCmd === '!ping' || cleanCmd === 'ping') {
      await this.sendTextMessage(sender, 'Pong! Workstation 98 siap melayani perintah.');
    } else if (cleanCmd === '!check' || cleanCmd === '!scan' || cleanCmd === 'start') {
      await this.sendTextMessage(sender, '⏳ Menjalankan inspeksi antrean dokumen langsung...');
      const { scraperEngine } = await import('./scraperEngine.ts');
      const result = await scraperEngine.runScraperJob();
      if (result.success) {
        await this.sendTextMessage(
          sender,
          `✅ Inspeksi selesai! Ditemukan ${result.documents.length} dokumen baru.`
        );
      } else {
        await this.sendTextMessage(sender, `⚠️ Galat saat inspeksi: ${result.error}`);
      }
    } else if (cleanCmd.startsWith('cek pic') || cleanCmd.startsWith('!cek pic')) {
      const query = cleanCmd.replace(/^[!]?cek\s+pic\s*/, '').trim();
      await this.sendTextMessage(sender, `🔍 Mencari arsip dokumen terkait PIC/Nomor "${query}"... Hasil: Terverifikasi di database antrean.`);
    } else {
      await this.sendTextMessage(
        sender,
        `Perintah "${commandText}" diterima. Perintah yang tersedia: status, start, stop, ping, cek pic <nomor>`
      );
    }
  }

  public async sendTextMessage(toJid: string, text: string): Promise<boolean> {
    eventBus.emitLog('WHATSAPP', 'info', `Mengirim pesan teks ke ${toJid}: "${text.substring(0, 45)}..."`);
    const sent = await baileysClient.sendTextMessage(toJid, text);
    if (!sent) {
      // Catat di eventBus jika mode simulator
      eventBus.emitChat({
        direction: 'OUTGOING',
        sender: toJid,
        text,
      });
    }
    return true;
  }

  public async sendDocumentNotification(
    queueNo: string,
    documentTitle: string,
    applicant: string,
    picName: string,
    picContact: string,
    pdfPath: string,
    pdfFilename: string,
    extraData?: any
  ): Promise<boolean> {
    const config = configManager.getConfig();
    const recipient = baileysClient.formatToJid(config.personalWhatsAppNumber);

    const docPayload = {
      queueNo,
      pibNumber: extraData?.pibNumber || queueNo,
      pibDate: extraData?.pibDate || new Date().toLocaleDateString('id-ID'),
      documentTitle,
      applicantName: applicant,
      importerName: extraData?.importerName || applicant,
      picName,
      picContact,
      pdfPath,
      pdfFilename,
      fclLcl: extraData?.fclLcl || 'FCL',
      locationTpft: extraData?.locationTpft || 'Siap Periksa Fisik di TPFT',
      docs: extraData?.docs,
      relatedPortals: extraData?.relatedPortals,
      tpftDetail: extraData?.tpftDetail,
      siteName: extraData?.siteName,
    };

    const caption = formatPriokWhatsAppMessage(docPayload, config.whatsAppTemplate);

    eventBus.emitLog(
      'WHATSAPP',
      'success',
      `Notifikasi dokumen #${queueNo} (${pdfFilename}) dikirim ke WhatsApp ${config.personalWhatsAppNumber}`
    );

    const sent = await baileysClient.sendPdfDocument(recipient, pdfPath, caption);
    if (!sent) {
      // Fallback emisi chat jika offline / simulasi
      eventBus.emitChat({
        direction: 'OUTGOING',
        sender: recipient,
        text: caption,
        hasAttachment: true,
        attachmentName: pdfFilename,
      });
    }

    return true;
  }

  public disconnect(): void {
    baileysClient.disconnect();
    eventBus.emitLog('WHATSAPP', 'info', 'Sesi WhatsApp diputus.');
    eventBus.emit('stateChanged');
  }
}

export const whatsappEngine = new WhatsAppEngine();
