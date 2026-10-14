import fs from 'fs';
import path from 'path';

export interface PortalConfig {
  id: string;
  name: string;
  targetUrl: string;
  enabled: boolean;
  requiresAuth: boolean;
  portalType?: 'customs' | 'tpft_terminal' | 'public_portal' | 'other';
  relationKey?: string; // key yang digunakan untuk menghubungkan data: 'pibNumber' | 'containerNo' | 'queueNo'
  authUsername?: string;
  authPassword?: string;
  loginFormSelector?: string;
  passwordSelector?: string;
  checkboxSelectors?: string[];
  submitBtnSelector?: string;
  tableRowsSelector?: string;
  idColSelector?: string;
  applicantColSelector?: string;
  titleColSelector?: string;
  picColSelector?: string;
  downloadBtnSelector?: string;
  sessionPath: string;
  downloadsDir: string;
}

export interface WhatsAppTemplateConfig {
  includeHeader: boolean;
  headerTitle: string;
  includePibNumber: boolean;
  includePibDate: boolean;
  includeFclLcl: boolean;
  includeImporter: boolean;
  includePicName: boolean;
  includePicContact: boolean;
  includeLocationTpft: boolean;
  includeDocsStatus: boolean;
  includeCrossCheckRelation: boolean;
  includeFooter: boolean;
  customTemplateText?: string;
}

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
  portals: PortalConfig[];
  whatsAppTemplate: WhatsAppTemplateConfig;
}

export const DEFAULT_WHATSAPP_TEMPLATE: WhatsAppTemplateConfig = {
  includeHeader: true,
  headerTitle: '*PEMBERITAHUAN PENUGASAN PEMERIKSAAN FISIK*\n*KPU BEA DAN CUKAI TIPE A TANJUNG PRIOK*',
  includePibNumber: true,
  includePibDate: true,
  includeFclLcl: true,
  includeImporter: true,
  includePicName: true,
  includePicContact: true,
  includeLocationTpft: true,
  includeDocsStatus: true,
  includeCrossCheckRelation: true,
  includeFooter: true,
  customTemplateText: `*PEMBERITAHUAN PENUGASAN PEMERIKSAAN FISIK*
*KPU BEA DAN CUKAI TIPE A TANJUNG PRIOK*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*FCL/LCL:* {fcl_lcl}
*Nomor PIB:* {no_pib}
*Tanggal PIB:* {tgl_pib}
*Importir:* {importir}
*Nama Pengurus (PPJK):* {pic_nama}
*Nomor Kontak PPJK:* {pic_kontak}
*Lokasi / Status Kesiapan Barang:* {lokasi_tpft}

*Status Dokumen Terlampir:*
- PIB: {status_pib}
- Inv/PL: {status_inv}
- BL: {status_bl}
- Dokumen Pendukung: {status_pendukung}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{relasi_lintas_portal}
_Lampiran berkas PDF resmi terlampir pada pesan ini._`,
};

export const DEFAULT_PORTALS: PortalConfig[] = [
  {
    id: 'siap_priok',
    name: 'Portal SIAP 3.0 (KPU BC Tanjung Priok)',
    targetUrl: 'https://bcpriok.net/',
    enabled: true,
    requiresAuth: true,
    portalType: 'customs',
    relationKey: 'pibNumber',
    authUsername: 'petugas_pemeriksa',
    authPassword: 'PasswordSIAP2026!',
    loginFormSelector: '#username',
    passwordSelector: '#password',
    checkboxSelectors: ['#chk-disclaimer', '#chk-privacy'],
    submitBtnSelector: '#btn-login',
    tableRowsSelector: 'table#queue-table tbody tr.queue-row, table#queue-table tbody tr',
    idColSelector: '.col-id, td:nth-child(1)',
    applicantColSelector: '.col-applicant, td:nth-child(2)',
    titleColSelector: '.col-title, td:nth-child(3)',
    picColSelector: '.col-pic, td:nth-child(4)',
    downloadBtnSelector: 'a.btn-download',
    sessionPath: './sessions/siap_priok/storageState.json',
    downloadsDir: './downloads/siap_priok',
  },
  {
    id: 'tpft_monitoring',
    name: 'Monitoring Posisi Kontainer (TPFT Graha Segara)',
    targetUrl: 'https://graha-segara.co.id/monitoring',
    enabled: true,
    requiresAuth: true,
    portalType: 'tpft_terminal',
    relationKey: 'pibNumber',
    authUsername: 'pemeriksa_priok',
    authPassword: 'PasswordTPFT2026!',
    loginFormSelector: '#txt-user',
    passwordSelector: '#txt-pass',
    checkboxSelectors: ['#chk-terms'],
    submitBtnSelector: '#btn-submit',
    tableRowsSelector: 'table tbody tr',
    idColSelector: 'td:nth-child(1)',
    applicantColSelector: 'td:nth-child(2)',
    titleColSelector: 'td:nth-child(3)',
    picColSelector: 'td:nth-child(4)',
    downloadBtnSelector: 'a[href$=".pdf"]',
    sessionPath: './sessions/tpft_monitoring/storageState.json',
    downloadsDir: './downloads/tpft_monitoring',
  },
  {
    id: 'pelindo_gate_public',
    name: 'Portal Gate In Terminal Pelindo (Publik / Tanpa Login)',
    targetUrl: 'https://terminal.pelindo.co.id/public-tracking',
    enabled: true,
    requiresAuth: false,
    portalType: 'public_portal',
    relationKey: 'containerNo',
    tableRowsSelector: 'table.public-queue tbody tr',
    idColSelector: 'td:nth-child(1)',
    applicantColSelector: 'td:nth-child(2)',
    titleColSelector: 'td:nth-child(3)',
    picColSelector: 'td:nth-child(4)',
    downloadBtnSelector: 'a.btn-pdf',
    sessionPath: './sessions/pelindo_gate_public/storageState.json',
    downloadsDir: './downloads/pelindo_gate_public',
  },
];

const DEFAULT_CONFIG: WorkstationConfig = {
  targetUrl: 'https://bcpriok.net/',
  authUsername: 'petugas_pemeriksa',
  authPassword: 'PasswordSIAP2026!',
  acceptTerms1Selector: '#chk-disclaimer',
  acceptTerms2Selector: '#chk-privacy',
  storageStatePath: path.resolve(process.cwd(), 'sessions', 'storageState.json'),
  downloadsDir: path.resolve(process.cwd(), 'downloads'),
  pollingIntervalMinutes: 3,
  personalWhatsAppNumber: '6281234567890',
  autoSendPdf: true,
  headless: true,
  portals: DEFAULT_PORTALS,
  whatsAppTemplate: DEFAULT_WHATSAPP_TEMPLATE,
};

class ConfigManager {
  private config: WorkstationConfig;
  private readonly configFilePath: string;

  constructor() {
    this.configFilePath = path.resolve(process.cwd(), 'config.json');
    this.config = {
      ...DEFAULT_CONFIG,
      portals: [...DEFAULT_PORTALS],
      whatsAppTemplate: { ...DEFAULT_WHATSAPP_TEMPLATE },
    };
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
    return {
      ...this.config,
      portals: [...this.config.portals],
      whatsAppTemplate: { ...this.config.whatsAppTemplate },
    };
  }

  public getPortals(): PortalConfig[] {
    if (!this.config.portals || this.config.portals.length === 0) {
      this.config.portals = [...DEFAULT_PORTALS];
    }
    return [...this.config.portals];
  }

  public getWhatsAppTemplate(): WhatsAppTemplateConfig {
    return this.config.whatsAppTemplate || DEFAULT_WHATSAPP_TEMPLATE;
  }

  public updateWhatsAppTemplate(partial: Partial<WhatsAppTemplateConfig>): WhatsAppTemplateConfig {
    this.config.whatsAppTemplate = {
      ...this.getWhatsAppTemplate(),
      ...partial,
    };
    this.saveConfig();
    return this.config.whatsAppTemplate;
  }

  public updateConfig(partial: Partial<WorkstationConfig>): WorkstationConfig {
    this.config = { ...this.config, ...partial };
    this.ensureDirectories();
    this.saveConfig();
    return this.getConfig();
  }

  public updatePortal(portalId: string, updates: Partial<PortalConfig>): PortalConfig | null {
    const index = this.config.portals.findIndex((p) => p.id === portalId);
    if (index >= 0) {
      this.config.portals[index] = { ...this.config.portals[index], ...updates };
      this.saveConfig();
      return this.config.portals[index];
    }
    return null;
  }

  public togglePortal(portalId: string, enabled: boolean): boolean {
    const index = this.config.portals.findIndex((p) => p.id === portalId);
    if (index >= 0) {
      this.config.portals[index].enabled = enabled;
      this.saveConfig();
      return true;
    }
    return false;
  }

  public addPortal(newPortal: PortalConfig): PortalConfig {
    const sanitizedId = newPortal.id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const existingIndex = this.config.portals.findIndex((p) => p.id === sanitizedId);
    
    const portalToSave: PortalConfig = {
      ...newPortal,
      id: sanitizedId,
      sessionPath: newPortal.sessionPath || `./sessions/${sanitizedId}/storageState.json`,
      downloadsDir: newPortal.downloadsDir || `./downloads/${sanitizedId}`,
    };

    if (existingIndex >= 0) {
      this.config.portals[existingIndex] = portalToSave;
    } else {
      this.config.portals.push(portalToSave);
    }

    this.saveConfig();
    return portalToSave;
  }

  public deletePortal(portalId: string): boolean {
    const initialLen = this.config.portals.length;
    this.config.portals = this.config.portals.filter((p) => p.id !== portalId);
    if (this.config.portals.length !== initialLen) {
      this.saveConfig();
      return true;
    }
    return false;
  }

  public resetPortalsToDefault(): PortalConfig[] {
    this.config.portals = [...DEFAULT_PORTALS];
    this.saveConfig();
    return this.getPortals();
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
        this.config = {
          ...DEFAULT_CONFIG,
          ...parsed,
          whatsAppTemplate: {
            ...DEFAULT_WHATSAPP_TEMPLATE,
            ...(parsed.whatsAppTemplate || {}),
          },
        };
        if (!this.config.portals || !Array.isArray(this.config.portals) || this.config.portals.length === 0) {
          this.config.portals = [...DEFAULT_PORTALS];
        }
      }
    } catch {
      this.config = {
        ...DEFAULT_CONFIG,
        portals: [...DEFAULT_PORTALS],
        whatsAppTemplate: { ...DEFAULT_WHATSAPP_TEMPLATE },
      };
    }
  }
}

export const configManager = new ConfigManager();
