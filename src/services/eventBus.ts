import { EventEmitter } from 'events';
import type { PortalConfig } from './configManager.ts';

export type LogLevel = 'info' | 'warn' | 'error' | 'success' | 'debug';

export interface SystemLog {
  id: string;
  timestamp: string;
  source: 'SYSTEM' | 'SCRAPER' | 'WHATSAPP' | 'SCHEDULER';
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface SystemStatus {
  isMonitoringActive: boolean;
  intervalMinutes: number;
  nextRunInSeconds: number;
  lastRunTimestamp: string | null;
  scraperStatus: 'IDLE' | 'RUNNING' | 'SUCCESS' | 'ERROR';
  browserSessionSaved: boolean;
  whatsappStatus: 'DISCONNECTED' | 'SCAN_QR' | 'CONNECTING' | 'CONNECTED';
  whatsappQrCode: string | null;
  whatsappUserPhone: string | null;
  portals?: PortalConfig[];
  totalItemsScraped: number;
  totalPdfDownloaded: number;
  totalWhatsAppSent: number;
}

export interface ScrapedDocument {
  id: string;
  queueNo: string;
  applicantName: string;
  documentTitle: string;
  picName: string;
  picContact: string;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
  pdfFilename: string;
  pdfPath: string;
  detectedAt: string;
  downloadedAt?: string;
  whatsappSentAt?: string;
}

export interface ChatMessage {
  id: string;
  timestamp: string;
  direction: 'INCOMING' | 'OUTGOING';
  sender: string;
  text: string;
  hasAttachment?: boolean;
  attachmentName?: string;
}

class WorkstationEventBus extends EventEmitter {
  private logs: SystemLog[] = [];
  private chatHistory: ChatMessage[] = [];
  private documents: ScrapedDocument[] = [];
  private readonly MAX_LOGS = 300;
  private readonly MAX_CHATS = 100;

  constructor() {
    super();
    this.setMaxListeners(50);
  }

  public emitLog(
    source: SystemLog['source'],
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    const log: SystemLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour12: false }),
      source,
      level,
      message,
      metadata,
    };

    this.logs.unshift(log);
    if (this.logs.length > this.MAX_LOGS) {
      this.logs.pop();
    }

    this.emit('log', log);
    this.emit('stateChanged');
  }

  public emitChat(chat: Omit<ChatMessage, 'id' | 'timestamp'>): void {
    const fullChat: ChatMessage = {
      ...chat,
      id: `chat-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour12: false }),
    };

    this.chatHistory.push(fullChat);
    if (this.chatHistory.length > this.MAX_CHATS) {
      this.chatHistory.shift();
    }

    this.emit('chat', fullChat);
    this.emit('stateChanged');
  }

  public addDocument(doc: ScrapedDocument): void {
    const existingIndex = this.documents.findIndex((d) => d.id === doc.id || d.queueNo === doc.queueNo);
    if (existingIndex >= 0) {
      this.documents[existingIndex] = doc;
    } else {
      this.documents.unshift(doc);
    }
    this.emit('document', doc);
    this.emit('stateChanged');
  }

  public getLogs(): SystemLog[] {
    return [...this.logs];
  }

  public getChatHistory(): ChatMessage[] {
    return [...this.chatHistory];
  }

  public getDocuments(): ScrapedDocument[] {
    return [...this.documents];
  }

  public clearLogs(): void {
    this.logs = [];
    this.emit('stateChanged');
  }
}

export const eventBus = new WorkstationEventBus();
