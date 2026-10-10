import fs from 'fs';
import path from 'path';

export interface WorkstationConfig {
  targetUrl: string;
  authUsername: string;
  authPassword: string;
  acceptTerms1Selector: string;
  acceptTerms2Selector: string;
  storageStatePath: string;
  downloadsDir: string;
  pollingIntervalMinutes: number;
  personalWhatsAppNumber: string;
  autoSendPdf: boolean;
  headless: boolean;
}

const DEFAULT_CONFIG: WorkstationConfig = {
  targetUrl: 'http://localhost:3000/api/mock-portal',
  authUsername: 'petugas_operator',
  authPassword: 'PasswordRahasia98!',
  acceptTerms1Selector: '#chk-disclaimer',
  acceptTerms2Selector: '#chk-privacy',
  storageStatePath: path.resolve(process.cwd(), 'sessions', 'storageState.json'),
  downloadsDir: path.resolve(process.cwd(), 'downloads'),
  pollingIntervalMinutes: 3,
  personalWhatsAppNumber: '6281234567890',
  autoSendPdf: true,
  headless: true,
};

class ConfigManager {
  private config: WorkstationConfig;
  private readonly configFilePath: string;

  constructor() {
    this.configFilePath = path.resolve(process.cwd(), 'config.json');
    this.config = { ...DEFAULT_CONFIG };
    this.ensureDirectories();
    this.loadConfig();
  }

  private ensureDirectories(): void {
    const sessionDir = path.dirname(this.config.storageStatePath);
    if (!fs.existsSync(sessionDir)) {
      try {
        fs.mkdirSync(sessionDir, { recursive: true });
      } catch {
        // ignore
      }
    }

    if (!fs.existsSync(this.config.downloadsDir)) {
      try {
        fs.mkdirSync(this.config.downloadsDir, { recursive: true });
      } catch {
        // ignore
      }
    }
  }

  public getConfig(): WorkstationConfig {
    return { ...this.config };
  }

  public updateConfig(partial: Partial<WorkstationConfig>): WorkstationConfig {
    this.config = { ...this.config, ...partial };
    this.ensureDirectories();
    this.saveConfig();
    return this.getConfig();
  }

  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configFilePath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch {
      // In web fallback environments where filesystem is mocked or read-only
    }
  }

  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configFilePath)) {
        const raw = fs.readFileSync(this.configFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.config = { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch {
      this.config = { ...DEFAULT_CONFIG };
    }
  }
}

export const configManager = new ConfigManager();
