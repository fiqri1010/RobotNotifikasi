import { eventBus, SystemStatus } from './eventBus.ts';
import { configManager } from './configManager.ts';
import { scraperEngine } from './scraperEngine.ts';
import { whatsappEngine } from './whatsappEngine.ts';
import fs from 'fs';

export class MonitoringScheduler {
  private isMonitoringActive: boolean = false;
  private intervalTimer: NodeJS.Timeout | null = null;
  private countdownTimer: NodeJS.Timeout | null = null;
  private secondsUntilNextRun: number = 0;
  private lastRunTimestamp: string | null = null;
  private totalItemsScraped: number = 0;
  private totalPdfDownloaded: number = 0;
  private totalWhatsAppSent: number = 0;

  constructor() {
    this.secondsUntilNextRun = configManager.getConfig().pollingIntervalMinutes * 60;
  }

  public getStatus(): SystemStatus {
    const config = configManager.getConfig();
    const hasSession = fs.existsSync(config.storageStatePath);

    return {
      isMonitoringActive: this.isMonitoringActive,
      intervalMinutes: config.pollingIntervalMinutes,
      nextRunInSeconds: this.secondsUntilNextRun,
      lastRunTimestamp: this.lastRunTimestamp,
      scraperStatus: scraperEngine.getIsRunning() ? 'RUNNING' : 'IDLE',
      browserSessionSaved: hasSession,
      whatsappStatus: whatsappEngine.getState(),
      whatsappQrCode: whatsappEngine.getQrCodeDataUrl(),
      whatsappUserPhone: whatsappEngine.getUserJid(),
      totalItemsScraped: this.totalItemsScraped,
      totalPdfDownloaded: this.totalPdfDownloaded,
      totalWhatsAppSent: this.totalWhatsAppSent,
    };
  }

  public startMonitoring(): boolean {
    if (this.isMonitoringActive) {
      return false;
    }

    const config = configManager.getConfig();
    this.isMonitoringActive = true;
    this.secondsUntilNextRun = config.pollingIntervalMinutes * 60;

    eventBus.emitLog(
      'SCHEDULER',
      'info',
      `Siklus monitoring dimulai. Interval: ${config.pollingIntervalMinutes} menit (${this.secondsUntilNextRun} detik).`
    );

    // Jalankan siklus pertama segera
    this.executeCycle();

    // Jalankan countdown tiap detik untuk tampilan visual retro clock di GUI
    this.countdownTimer = setInterval(() => {
      if (this.secondsUntilNextRun > 0) {
        this.secondsUntilNextRun--;
      } else {
        this.secondsUntilNextRun = config.pollingIntervalMinutes * 60;
      }
      eventBus.emit('tick', this.secondsUntilNextRun);
    }, 1000);

    // Jadwalkan siklus berulang
    const intervalMs = config.pollingIntervalMinutes * 60 * 1000;
    this.intervalTimer = setInterval(() => {
      this.secondsUntilNextRun = config.pollingIntervalMinutes * 60;
      this.executeCycle();
    }, intervalMs);

    return true;
  }

  public stopMonitoring(): boolean {
    if (!this.isMonitoringActive) {
      return false;
    }

    this.isMonitoringActive = false;

    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }

    const config = configManager.getConfig();
    this.secondsUntilNextRun = config.pollingIntervalMinutes * 60;

    eventBus.emitLog('SCHEDULER', 'warn', 'Siklus monitoring dihentikan oleh pengguna.');
    return true;
  }

  public async triggerManualScrape(): Promise<void> {
    eventBus.emitLog('SCHEDULER', 'info', 'Pemicu manual diterima dari tombol GUI.');
    await this.executeCycle();
  }

  private async executeCycle(): Promise<void> {
    const config = configManager.getConfig();
    this.lastRunTimestamp = new Date().toLocaleTimeString('id-ID');

    const result = await scraperEngine.runScraperJob();

    if (result.success) {
      this.totalItemsScraped += result.documents.length;
      this.totalPdfDownloaded += result.documents.length;

      // Kirim dokumen baru ke WhatsApp
      if (config.autoSendPdf && result.documents.length > 0) {
        for (const doc of result.documents) {
          eventBus.emitLog(
            'SCHEDULER',
            'info',
            `Mempersiapkan pengiriman notifikasi WhatsApp untuk dokumen #${doc.queueNo}...`
          );

          const sent = await whatsappEngine.sendDocumentNotification(
            doc.queueNo,
            doc.documentTitle,
            doc.applicantName,
            doc.picName,
            doc.picContact,
            doc.pdfPath,
            doc.pdfFilename
          );

          if (sent) {
            this.totalWhatsAppSent++;
          }
        }
      }
    }
  }
}

export const monitoringScheduler = new MonitoringScheduler();
