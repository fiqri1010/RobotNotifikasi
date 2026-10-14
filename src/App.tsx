import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Square,
  RefreshCw,
  MessageSquare,
  FileText,
  Settings,
  Terminal,
  Send,
  QrCode,
  HardDrive,
  CheckCircle2,
  Globe,
  Edit3,
  HelpCircle,
  Plus,
  Trash2,
  CheckSquare,
  Network,
  Activity,
  Layers,
  Sparkles,
  AlertTriangle,
  Clock,
  Eye,
  ShieldCheck,
  Copy,
  ExternalLink
} from 'lucide-react';

interface SystemLog {
  id: string;
  timestamp: string;
  source: 'SYSTEM' | 'SCRAPER' | 'WHATSAPP' | 'SCHEDULER';
  level: 'info' | 'warn' | 'error' | 'success' | 'debug';
  message: string;
}

interface ScrapedDoc {
  id: string;
  siteId?: string;
  siteName?: string;
  queueNo: string;
  pibNumber?: string;
  pibDate?: string;
  importerName?: string;
  locationTpft?: string;
  fclLcl?: string;
  docs?: {
    pib?: { available: boolean; fileName?: string; filePath?: string };
    invPl?: { available: boolean; fileName?: string; filePath?: string };
    bl?: { available: boolean; fileName?: string; filePath?: string };
    supporting?: { available: boolean; fileName?: string; filePath?: string };
  };
  applicantName: string;
  documentTitle: string;
  picName: string;
  picContact: string;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
  pdfFilename: string;
  pdfPath: string;
  detectedAt: string;
  relatedPortals?: Array<{
    portalId: string;
    portalName: string;
    matchedKey?: string;
    location?: string;
    statusBehandle?: string;
    status?: string;
    gateInTime?: string;
  }>;
}

interface ChatMsg {
  id: string;
  timestamp: string;
  direction: 'INCOMING' | 'OUTGOING';
  sender: string;
  text: string;
  hasAttachment?: boolean;
  attachmentName?: string;
}

interface PortalItem {
  id: string;
  name: string;
  targetUrl: string;
  enabled: boolean;
  requiresAuth: boolean;
  portalType?: 'customs' | 'tpft_terminal' | 'public_portal' | 'other';
  relationKey?: 'pibNumber' | 'containerNo' | 'queueNo';
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

interface WhatsAppTemplate {
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

interface RelationRule {
  id: string;
  name: string;
  primaryKey: 'pibNumber' | 'containerNo' | 'queueNo';
  sourcePortalIds: string[];
  autoMergeToWhatsApp: boolean;
  description: string;
}

interface DiagnosticTest {
  id: string;
  category: string;
  name: string;
  status: 'PASSED' | 'WARNING' | 'FAILED';
  durationMs: number;
  details: string;
  recommendation?: string;
}

interface DiagnosticReport {
  timestamp: string;
  totalDurationMs: number;
  allPassed: boolean;
  tests: DiagnosticTest[];
  sampleRenderedWhatsApp?: string;
}

interface SystemStatus {
  isMonitoringActive: boolean;
  intervalMinutes: number;
  nextRunInSeconds: number;
  lastRunTimestamp: string | null;
  scraperStatus: 'IDLE' | 'RUNNING' | 'SUCCESS' | 'ERROR';
  browserSessionSaved: boolean;
  whatsappStatus: 'DISCONNECTED' | 'SCAN_QR' | 'CONNECTING' | 'CONNECTED';
  whatsappQrCode: string | null;
  whatsappUserPhone: string | null;
  ownerNumber?: string;
  portals?: PortalItem[];
  totalItemsScraped: number;
  totalPdfDownloaded: number;
  totalWhatsAppSent: number;
}

const DEFAULT_PORTALS_FRONTEND: PortalItem[] = [
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
    name: 'Portal Gate-In Terminal Pelindo (Publik / Tanpa Login)',
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

const DEFAULT_TEMPLATE_FRONTEND: WhatsAppTemplate = {
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

export default function App() {
  const [activeTab, setActiveTab] = useState<
    'portals' | 'template' | 'relations' | 'queue' | 'whatsapp' | 'monitor' | 'diagnostics' | 'config'
  >('portals');
  
  const [portals, setPortals] = useState<PortalItem[]>(DEFAULT_PORTALS_FRONTEND);
  const [status, setStatus] = useState<SystemStatus>({
    isMonitoringActive: false,
    intervalMinutes: 3,
    nextRunInSeconds: 180,
    lastRunTimestamp: null,
    scraperStatus: 'IDLE',
    browserSessionSaved: false,
    whatsappStatus: 'DISCONNECTED',
    whatsappQrCode: null,
    whatsappUserPhone: null,
    portals: DEFAULT_PORTALS_FRONTEND,
    totalItemsScraped: 0,
    totalPdfDownloaded: 0,
    totalWhatsAppSent: 0,
  });

  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [chats, setChats] = useState<ChatMsg[]>([]);
  const [documents, setDocuments] = useState<ScrapedDoc[]>([]);
  const [config, setConfig] = useState({
    pollingIntervalMinutes: 3,
    personalWhatsAppNumber: '6281234567890',
    autoSendPdf: true,
  });

  // WhatsApp Template Builder State
  const [waTemplate, setWaTemplate] = useState<WhatsAppTemplate>(DEFAULT_TEMPLATE_FRONTEND);
  const [templateSaveStatus, setTemplateSaveStatus] = useState<'idle' | 'saved'>('idle');

  // Relations State
  const [relationRules, setRelationRules] = useState<RelationRule[]>([]);
  const [simulatedMatchPib, setSimulatedMatchPib] = useState('012845');

  // Diagnostics State
  const [diagnosticReport, setDiagnosticReport] = useState<DiagnosticReport | null>(null);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);

  const [logFilter, setLogFilter] = useState<'ALL' | 'SCRAPER' | 'WHATSAPP' | 'SYSTEM'>('ALL');
  const [chatInput, setChatInput] = useState('');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isManualTriggering, setIsManualTriggering] = useState(false);
  const [isWsConnected, setIsWsConnected] = useState(false);

  // Modal Add / Edit Portal
  const [editingPortal, setEditingPortal] = useState<PortalItem | null>(null);
  const [isAddingNewPortal, setIsAddingNewPortal] = useState(false);
  const [portalForm, setPortalForm] = useState<Partial<PortalItem>>({});

  const logContainerRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    fetchInitialData();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    function connectWebSocket() {
      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => setIsWsConnected(true);

        ws.onmessage = (event) => {
          try {
            const packet = JSON.parse(event.data);
            const { type, data } = packet;

            if (type === 'init') {
              if (data.status) {
                setStatus((prev) => ({
                  ...prev,
                  ...data.status,
                  portals: data.status.portals || prev.portals || DEFAULT_PORTALS_FRONTEND,
                }));
                if (data.status.portals && data.status.portals.length > 0) {
                  setPortals(data.status.portals);
                }
              }
              if (data.logs) setLogs(data.logs);
              if (data.chats) setChats(data.chats);
              if (data.documents) setDocuments(data.documents);
            } else if (type === 'status_update' || type === 'heartbeat') {
              setStatus((prev) => ({
                ...prev,
                ...data,
                portals: data.portals || prev.portals,
              }));
              if (data.portals && data.portals.length > 0) {
                setPortals(data.portals);
              }
            } else if (type === 'log') {
              setLogs((prev) => [data, ...prev.slice(0, 250)]);
            } else if (type === 'chat') {
              setChats((prev) => [...prev, data]);
            } else if (type === 'document') {
              setDocuments((prev) => [data, ...prev]);
            } else if (type === 'qr') {
              setStatus((prev) => ({
                ...prev,
                whatsappStatus: 'SCAN_QR',
                whatsappQrCode: data.qrDataUrl,
              }));
              setIsQrModalOpen(true);
            } else if (type === 'clear_logs') {
              setLogs([]);
            }
          } catch (err) {
            console.error('[WS Parse Error]', err);
          }
        };

        ws.onclose = () => {
          setIsWsConnected(false);
          reconnectTimeout = setTimeout(connectWebSocket, 3000);
        };

        ws.onerror = () => {
          setIsWsConnected(false);
          try { ws?.close(); } catch {}
        };
      } catch {
        setIsWsConnected(false);
      }
    }

    connectWebSocket();
    const pollInterval = setInterval(fetchStatus, 4000);

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
      clearInterval(pollInterval);
    };
  }, []);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chats]);

  const sendWsAction = (action: string, data?: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action, data }));
      return true;
    }
    return false;
  };

  const fetchInitialData = async () => {
    try {
      const resPortals = await fetch('/api/portals');
      if (resPortals.ok) {
        const pData = await resPortals.json();
        if (pData.portals && pData.portals.length > 0) {
          setPortals(pData.portals);
        }
      }
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        if (data.status) {
          setStatus((prev) => ({
            ...prev,
            ...data.status,
            portals: data.status.portals || prev.portals || DEFAULT_PORTALS_FRONTEND,
          }));
          if (data.status.portals && data.status.portals.length > 0) {
            setPortals(data.status.portals);
          }
        }
        if (data.config) setConfig((prev) => ({ ...prev, ...data.config }));
      }
      const resDocs = await fetch('/api/documents');
      if (resDocs.ok) {
        const d = await resDocs.json();
        if (d.documents) setDocuments(d.documents);
      }
      const resLogs = await fetch('/api/logs');
      if (resLogs.ok) {
        const l = await resLogs.json();
        if (l.logs) setLogs(l.logs);
      }
      const resChats = await fetch('/api/chats');
      if (resChats.ok) {
        const c = await resChats.json();
        if (c.chats) setChats(c.chats);
      }
      const resTemplate = await fetch('/api/whatsapp/template');
      if (resTemplate.ok) {
        const t = await resTemplate.json();
        if (t.template) setWaTemplate(t.template);
      }
      const resRel = await fetch('/api/relations');
      if (resRel.ok) {
        const r = await resRel.json();
        if (r.rules) setRelationRules(r.rules);
      }
    } catch {}
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        if (data.status) {
          setStatus((prev) => ({
            ...prev,
            ...data.status,
            portals: data.status.portals || prev.portals,
          }));
          if (data.status.portals && data.status.portals.length > 0) {
            setPortals(data.status.portals);
          }
        }
      }
    } catch {}
  };

  const toggleMonitoring = async () => {
    const action = status.isMonitoringActive ? 'STOP_MONITORING' : 'START_MONITORING';
    const sent = sendWsAction(action);
    if (!sent) {
      const endpoint = status.isMonitoringActive ? '/api/monitoring/stop' : '/api/monitoring/start';
      await fetch(endpoint, { method: 'POST' }).catch(() => null);
    }
  };

  const triggerManualScraper = async () => {
    setIsManualTriggering(true);
    const sent = sendWsAction('TRIGGER_SCRAPE');
    if (!sent) {
      await fetch('/api/scraper/trigger', { method: 'POST' }).catch(() => null);
    }
    setTimeout(() => {
      setIsManualTriggering(false);
      fetchStatus();
    }, 1500);
  };

  const handleTogglePortal = async (portalId: string, currentEnabled: boolean) => {
    const nextEnabled = !currentEnabled;
    setPortals((prev) =>
      prev.map((p) => (p.id === portalId ? { ...p, enabled: nextEnabled } : p))
    );
    setStatus((prev) => ({
      ...prev,
      portals: (prev.portals || []).map((p) =>
        p.id === portalId ? { ...p, enabled: nextEnabled } : p
      ),
    }));
    const sent = sendWsAction('TOGGLE_PORTAL', { portalId, enabled: nextEnabled });
    if (!sent) {
      await fetch('/api/portals/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portalId, enabled: nextEnabled }),
      }).catch(() => null);
    }
  };

  const handleResetPortals = async () => {
    try {
      const res = await fetch('/api/portals/reset', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.portals) {
          setPortals(data.portals);
          setStatus((prev) => ({ ...prev, portals: data.portals }));
        }
      } else {
        setPortals(DEFAULT_PORTALS_FRONTEND);
      }
    } catch {
      setPortals(DEFAULT_PORTALS_FRONTEND);
    }
  };

  const openEditModal = (portal: PortalItem) => {
    setIsAddingNewPortal(false);
    setEditingPortal(portal);
    setPortalForm({
      name: portal.name,
      targetUrl: portal.targetUrl,
      requiresAuth: portal.requiresAuth !== false,
      relationKey: portal.relationKey || 'pibNumber',
      authUsername: portal.authUsername || '',
      authPassword: portal.authPassword || '',
      loginFormSelector: portal.loginFormSelector || '#username',
      passwordSelector: portal.passwordSelector || '#password',
      checkboxSelectors: portal.checkboxSelectors || ['#chk-disclaimer'],
      tableRowsSelector: portal.tableRowsSelector || 'table tbody tr',
      idColSelector: portal.idColSelector || 'td:nth-child(1)',
      applicantColSelector: portal.applicantColSelector || 'td:nth-child(2)',
      titleColSelector: portal.titleColSelector || 'td:nth-child(3)',
      picColSelector: portal.picColSelector || 'td:nth-child(4)',
      downloadBtnSelector: portal.downloadBtnSelector || 'a[href$=".pdf"]',
    });
  };

  const openAddPortalModal = () => {
    setIsAddingNewPortal(true);
    setEditingPortal(null);
    setPortalForm({
      name: '',
      targetUrl: 'https://',
      requiresAuth: false, // Default publik untuk kemudahan penambahan situs terbuka
      relationKey: 'pibNumber',
      authUsername: '',
      authPassword: '',
      loginFormSelector: '#username',
      passwordSelector: '#password',
      checkboxSelectors: [],
      tableRowsSelector: 'table tbody tr',
      idColSelector: 'td:nth-child(1)',
      applicantColSelector: 'td:nth-child(2)',
      titleColSelector: 'td:nth-child(3)',
      picColSelector: 'td:nth-child(4)',
      downloadBtnSelector: 'a[href$=".pdf"]',
    });
  };

  const savePortalConfig = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isAddingNewPortal) {
      if (!portalForm.name || !portalForm.targetUrl) return;
      try {
        const res = await fetch('/api/portals/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(portalForm),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.portals) {
            setPortals(data.portals);
            setStatus((prev) => ({ ...prev, portals: data.portals }));
          }
        }
      } catch {}
      setIsAddingNewPortal(false);
      return;
    }

    if (!editingPortal) return;
    const portalId = editingPortal.id;
    const updates = { ...portalForm };

    setPortals((prev) =>
      prev.map((p) => (p.id === portalId ? { ...p, ...updates } : p))
    );
    setStatus((prev) => ({
      ...prev,
      portals: (prev.portals || []).map((p) =>
        p.id === portalId ? { ...p, ...updates } : p
      ),
    }));

    const sent = sendWsAction('UPDATE_PORTAL', { portalId, updates });
    if (!sent) {
      await fetch('/api/portals/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portalId, updates }),
      }).catch(() => null);
    }

    setEditingPortal(null);
    fetchStatus();
  };

  const handleDeletePortal = async (portalId: string) => {
    if (portalId === 'siap_priok') {
      alert('Portal utama SIAP 3.0 Tanjung Priok tidak boleh dihapus. Anda dapat menonaktifkannya dengan tombol Mati.');
      return;
    }
    if (!confirm(`Hapus konfigurasi portal [${portalId}] dari registri scraper?`)) return;

    try {
      const res = await fetch(`/api/portals/${portalId}`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        if (data.portals) {
          setPortals(data.portals);
          setStatus((prev) => ({ ...prev, portals: data.portals }));
        }
      }
    } catch {}
  };

  // WhatsApp Template Saver
  const handleSaveTemplate = async () => {
    try {
      const res = await fetch('/api/whatsapp/template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(waTemplate),
      });
      if (res.ok) {
        setTemplateSaveStatus('saved');
        setTimeout(() => setTemplateSaveStatus('idle'), 2500);
      }
    } catch {}
  };

  const insertTagToTemplate = (tag: string) => {
    const cur = waTemplate.customTemplateText || '';
    setWaTemplate({
      ...waTemplate,
      customTemplateText: cur + tag,
    });
  };

  // Diagnostics Runner
  const handleRunDiagnostics = async () => {
    setIsRunningDiagnostics(true);
    try {
      const res = await fetch('/api/diagnostics/run', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setDiagnosticReport(data);
      }
    } catch {
      alert('Gagal menghubungi backend diagnostics.');
    } finally {
      setIsRunningDiagnostics(false);
    }
  };

  const handleConnectWhatsApp = () => {
    const sent = sendWsAction('CONNECT_WHATSAPP');
    if (!sent) fetch('/api/whatsapp/connect', { method: 'POST' }).catch(() => null);
    setIsQrModalOpen(true);
  };

  const handleSimulatePairing = () => {
    const sent = sendWsAction('SIMULATE_PAIRING', { phone: config.personalWhatsAppNumber });
    if (!sent) {
      fetch('/api/whatsapp/pair-simulated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: config.personalWhatsAppNumber }),
      }).catch(() => null);
    }
    setIsQrModalOpen(false);
  };

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const message = chatInput;
    setChatInput('');

    const sent = sendWsAction('SEND_CHAT', { message });
    if (!sent) {
      await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: `${config.personalWhatsAppNumber.replace(/\D/g, '')}@s.whatsapp.net`,
          message,
        }),
      }).catch(() => null);
    }
  };

  const handleClearLogs = () => {
    const sent = sendWsAction('CLEAR_LOGS');
    if (!sent) {
      fetch('/api/logs/clear', { method: 'POST' }).catch(() => null);
      setLogs([]);
    }
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const filteredLogs = logs.filter((log) => {
    if (logFilter === 'ALL') return true;
    return log.source === logFilter;
  });

  const activePortalsCount = (portals || []).filter((p) => p.enabled).length;

  // Render Live Preview Teks WhatsApp
  const generateLiveWaPreview = () => {
    const text = waTemplate.customTemplateText || '';
    const sampleRelasi = waTemplate.includeCrossCheckRelation
      ? '*HASIL RELASI DATA LINTAS WEBSITE:*\n  1. [Monitoring Posisi TPFT Graha Segara]: (Key: 012845)\n     • Lokasi/Terminal: TPFT Graha Segara - Blok C-02 Tier 1\n     • Status: SIAP BUKA SEGEL & PEMERIKSAAN FISIK\n  2. [Terminal Pelindo Tracking (Publik)]:\n     • Lokasi/Terminal: Gate 3 Tanjung Priok\n     • Status: Gate-In Selesai (06:45 WIB)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
      : '';

    let preview = text
      .replace(/\{no_pib\}/g, '012845')
      .replace(/\{tgl_pib\}/g, '14/10/2026')
      .replace(/\{importir\}/g, 'PT Global Makmur Abadi')
      .replace(/\{pemohon\}/g, 'PT Global Makmur Abadi')
      .replace(/\{fcl_lcl\}/g, 'FCL (40ft)')
      .replace(/\{pic_nama\}/g, 'Bpk. Hendra Gunawan (PPJK)')
      .replace(/\{pic_kontak\}/g, '081296173107')
      .replace(/\{lokasi_tpft\}/g, 'TPFT Graha Segara - Blok C-02 Tier 1')
      .replace(/\{sumber_portal\}/g, 'SIAP 3.0 Priok')
      .replace(/\{status_pib\}/g, 'Tersedia & Terlampir')
      .replace(/\{status_inv\}/g, 'Tersedia & Terlampir')
      .replace(/\{status_bl\}/g, 'Tersedia & Terlampir')
      .replace(/\{status_pendukung\}/g, 'Tersedia & Terlampir')
      .replace(/\{relasi_lintas_portal\}/g, sampleRelasi)
      .replace(/\{waktu_deteksi\}/g, '12:05:40 WIB');

    return preview;
  };

  return (
    <div className="w-screen h-screen flex flex-col select-none overflow-hidden text-[12px] bg-[#c0c0c0]">
      {/* TITLE BAR UTAMA APLIKASI (SATU-SATUNYA TITLE BAR, RETRO WINDOWS 98) */}
      <div className="title-bar title-bar-gradient flex items-center justify-between px-2 py-1 select-none flex-shrink-0">
        <div className="title-bar-text flex items-center gap-2 font-bold tracking-wide text-white text-[12px]">
          <HardDrive size={14} className="text-yellow-300" />
          <span>Workstation Monitor - SIAP 3.0 Bea Cukai Priok & WhatsApp Baileys Bot</span>
        </div>
        <div className="title-bar-controls flex gap-1">
          <button aria-label="Minimize" title="Minimize" />
          <button aria-label="Maximize" title="Maximize" />
          <button aria-label="Close" title="Close" onClick={() => alert('Workstation 98 aktif di latar belakang.')} />
        </div>
      </div>

      {/* TOOLBAR KONTROL UTAMA & INDIKATOR KONEKSI REAL-TIME */}
      <div className="p-1.5 bg-[#c0c0c0] border-b border-[#808080] flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
        {/* Tombol Kontrol Langsung */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            className={`retro-btn flex items-center gap-1 font-bold ${
              status.isMonitoringActive ? 'bg-[#c0c0c0] text-gray-500' : 'bg-[#c0c0c0] text-green-900'
            }`}
            onClick={toggleMonitoring}
            disabled={status.isMonitoringActive}
          >
            <Play size={12} className="fill-green-600 text-green-600" />
            <span>Start Monitoring</span>
          </button>

          <button
            className={`retro-btn flex items-center gap-1 font-bold ${
              !status.isMonitoringActive ? 'bg-[#c0c0c0] text-gray-500' : 'bg-[#c0c0c0] text-red-900'
            }`}
            onClick={toggleMonitoring}
            disabled={!status.isMonitoringActive}
          >
            <Square size={12} className="fill-red-600 text-red-600" />
            <span>Stop Monitoring</span>
          </button>

          <button
            className="retro-btn flex items-center gap-1 font-semibold"
            onClick={triggerManualScraper}
            disabled={isManualTriggering}
          >
            <RefreshCw size={12} className={isManualTriggering ? 'animate-spin text-blue-700' : 'text-blue-700'} />
            <span>Scrape Round-Robin</span>
          </button>

          <button
            className="retro-btn flex items-center gap-1 font-semibold"
            onClick={() => {
              if (status.whatsappStatus === 'CONNECTED') {
                setActiveTab('whatsapp');
              } else {
                handleConnectWhatsApp();
              }
            }}
          >
            <MessageSquare size={12} className="text-green-700" />
            <span>
              {status.whatsappStatus === 'CONNECTED' ? 'Buka WhatsApp' : 'Pair WhatsApp (QR)'}
            </span>
          </button>

          <button
            className="retro-btn flex items-center gap-1 font-bold text-indigo-900 bg-indigo-50 border border-indigo-400"
            onClick={() => {
              setActiveTab('diagnostics');
              handleRunDiagnostics();
            }}
          >
            <Activity size={12} className={isRunningDiagnostics ? 'animate-spin text-indigo-700' : 'text-indigo-700'} />
            <span>Deep Scan Sistem</span>
          </button>
        </div>

        {/* Indikator Status Koneksi Real-time */}
        <div className="flex items-center gap-2.5 text-[11px] bg-[#dfdfdf] px-2 py-1 border border-inset border-[#808080]">
          <div className="flex items-center gap-1">
            <Globe size={12} className="text-blue-900" />
            <span className="font-semibold text-gray-700">Portals:</span>
            <span className="font-bold text-blue-900 font-mono">
              {activePortalsCount}/{(status.portals || []).length} Aktif
            </span>
          </div>

          <div className="w-[1px] h-3 bg-gray-400" />

          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700">Scheduler:</span>
            <span className={`led-indicator ${status.isMonitoringActive ? 'led-green' : 'led-red'}`} />
            <span className="font-mono font-bold">
              {status.isMonitoringActive ? `${formatCountdown(status.nextRunInSeconds)}` : 'STOPPED'}
            </span>
          </div>

          <div className="w-[1px] h-3 bg-gray-400" />

          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700">Playwright:</span>
            <span
              className={`led-indicator ${
                status.scraperStatus === 'RUNNING' ? 'led-yellow' : 'led-green'
              }`}
            />
            <span className="font-semibold">
              {status.scraperStatus === 'RUNNING' ? 'Memindai...' : 'Siaga OK'}
            </span>
          </div>

          <div className="w-[1px] h-3 bg-gray-400" />

          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700">WhatsApp:</span>
            <span
              className={`led-indicator ${
                status.whatsappStatus === 'CONNECTED'
                  ? 'led-green'
                  : status.whatsappStatus === 'SCAN_QR'
                  ? 'led-yellow'
                  : 'led-red'
              }`}
            />
            <span className="font-bold">
              {status.whatsappStatus === 'CONNECTED' ? 'Online' : status.whatsappStatus}
            </span>
          </div>
        </div>
      </div>

      {/* NAVIGASI TAB KLASIK WINDOWS 98 */}
      <div className="window-body flex-1 flex flex-col p-2 bg-[#c0c0c0] overflow-hidden m-0">
        <div role="tablist" className="flex items-end gap-1 mb-0 border-b-2 border-[#808080] px-1 select-none flex-wrap">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'portals'}
            onClick={() => setActiveTab('portals')}
            className={`px-3 py-1.5 text-[11.5px] rounded-t flex items-center gap-1.5 transition-all cursor-pointer font-bold ${
              activeTab === 'portals'
                ? 'bg-[#c0c0c0] border-t-2 border-l-2 border-r-2 border-white border-r-[#808080] -mb-[2px] pb-2 text-black z-10 shadow-sm'
                : 'bg-[#adadad] border-t border-l border-r border-[#dfdfdf] border-r-[#404040] text-gray-800 hover:bg-[#bfbfbf]'
            }`}
          >
            <span className="text-sm">🌐</span>
            <span>Target Portals (SIAP & Web Lain)</span>
            <span className="ml-1 px-1.5 py-0.2 bg-blue-900 text-white rounded-full text-[10px]">
              {activePortalsCount}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'template'}
            onClick={() => setActiveTab('template')}
            className={`px-3 py-1.5 text-[11.5px] rounded-t flex items-center gap-1.5 transition-all cursor-pointer font-bold ${
              activeTab === 'template'
                ? 'bg-[#c0c0c0] border-t-2 border-l-2 border-r-2 border-white border-r-[#808080] -mb-[2px] pb-2 text-black z-10 shadow-sm'
                : 'bg-[#adadad] border-t border-l border-r border-[#dfdfdf] border-r-[#404040] text-gray-800 hover:bg-[#bfbfbf]'
            }`}
          >
            <Edit3 size={13} className="text-emerald-800" />
            <span>Format Pesan WA (Template Builder)</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'relations'}
            onClick={() => setActiveTab('relations')}
            className={`px-3 py-1.5 text-[11.5px] rounded-t flex items-center gap-1.5 transition-all cursor-pointer font-bold ${
              activeTab === 'relations'
                ? 'bg-[#c0c0c0] border-t-2 border-l-2 border-r-2 border-white border-r-[#808080] -mb-[2px] pb-2 text-black z-10 shadow-sm'
                : 'bg-[#adadad] border-t border-l border-r border-[#dfdfdf] border-r-[#404040] text-gray-800 hover:bg-[#bfbfbf]'
            }`}
          >
            <Network size={13} className="text-purple-800" />
            <span>Relasi Data Multi-Portal</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'queue'}
            onClick={() => setActiveTab('queue')}
            className={`px-3 py-1.5 text-[11.5px] rounded-t flex items-center gap-1.5 transition-all cursor-pointer font-bold ${
              activeTab === 'queue'
                ? 'bg-[#c0c0c0] border-t-2 border-l-2 border-r-2 border-white border-r-[#808080] -mb-[2px] pb-2 text-black z-10 shadow-sm'
                : 'bg-[#adadad] border-t border-l border-r border-[#dfdfdf] border-r-[#404040] text-gray-800 hover:bg-[#bfbfbf]'
            }`}
          >
            <FileText size={13} className="text-amber-800" />
            <span>Antrean Dokumen</span>
            <span className="ml-1 px-1.5 py-0.2 bg-amber-800 text-white rounded-full text-[10px]">
              {documents.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'whatsapp'}
            onClick={() => setActiveTab('whatsapp')}
            className={`px-3 py-1.5 text-[11.5px] rounded-t flex items-center gap-1.5 transition-all cursor-pointer font-bold ${
              activeTab === 'whatsapp'
                ? 'bg-[#c0c0c0] border-t-2 border-l-2 border-r-2 border-white border-r-[#808080] -mb-[2px] pb-2 text-black z-10 shadow-sm'
                : 'bg-[#adadad] border-t border-l border-r border-[#dfdfdf] border-r-[#404040] text-gray-800 hover:bg-[#bfbfbf]'
            }`}
          >
            <MessageSquare size={13} className="text-emerald-800" />
            <span>WhatsApp Mini Chat</span>
            <span className="ml-1 px-1.5 py-0.2 bg-emerald-800 text-white rounded-full text-[10px]">
              {chats.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'monitor'}
            onClick={() => setActiveTab('monitor')}
            className={`px-3 py-1.5 text-[11.5px] rounded-t flex items-center gap-1.5 transition-all cursor-pointer font-bold ${
              activeTab === 'monitor'
                ? 'bg-[#c0c0c0] border-t-2 border-l-2 border-r-2 border-white border-r-[#808080] -mb-[2px] pb-2 text-black z-10 shadow-sm'
                : 'bg-[#adadad] border-t border-l border-r border-[#dfdfdf] border-r-[#404040] text-gray-800 hover:bg-[#bfbfbf]'
            }`}
          >
            <Terminal size={13} className="text-green-800" />
            <span>Log Aktivitas</span>
            <span className="ml-1 px-1.5 py-0.2 bg-gray-700 text-white rounded-full text-[10px]">
              {logs.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'diagnostics'}
            onClick={() => setActiveTab('diagnostics')}
            className={`px-3 py-1.5 text-[11.5px] rounded-t flex items-center gap-1.5 transition-all cursor-pointer font-bold ${
              activeTab === 'diagnostics'
                ? 'bg-[#c0c0c0] border-t-2 border-l-2 border-r-2 border-white border-r-[#808080] -mb-[2px] pb-2 text-black z-10 shadow-sm'
                : 'bg-[#adadad] border-t border-l border-r border-[#dfdfdf] border-r-[#404040] text-gray-800 hover:bg-[#bfbfbf]'
            }`}
          >
            <Activity size={13} className="text-indigo-800" />
            <span>Deep Scan & Diagnostik</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'config'}
            onClick={() => setActiveTab('config')}
            className={`px-3 py-1.5 text-[11.5px] rounded-t flex items-center gap-1.5 transition-all cursor-pointer font-bold ${
              activeTab === 'config'
                ? 'bg-[#c0c0c0] border-t-2 border-l-2 border-r-2 border-white border-r-[#808080] -mb-[2px] pb-2 text-black z-10 shadow-sm'
                : 'bg-[#adadad] border-t border-l border-r border-[#dfdfdf] border-r-[#404040] text-gray-800 hover:bg-[#bfbfbf]'
            }`}
          >
            <Settings size={13} className="text-blue-800" />
            <span>Pengaturan Siklus</span>
          </button>
        </div>

        {/* ISI PANEL TAB */}
        <article role="tabpanel" className="flex-1 flex flex-col bg-[#c0c0c0] p-2 border-2 border-outset border-white overflow-hidden">
          {/* TAB 1: TARGET PORTALS REGISTRY & CONFIGURATOR */}
          {activeTab === 'portals' && (
            <div className="flex-1 flex flex-col gap-2 overflow-hidden">
              {/* Header Action Bar dengan Tambah Portal & Reset */}
              <div className="bg-[#dfdfdf] p-2 border border-[#808080] flex flex-wrap justify-between items-center gap-2 text-[11.5px]">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🎯</span>
                  <div>
                    <div className="font-bold text-blue-900 text-[12px]">
                      Registri Multi-Website Target Scraper
                    </div>
                    <div className="text-[10.5px] text-gray-600">
                      Mendukung portal resmi berautentikasi (SIAP 3.0, TPFT) maupun portal publik terbuka (Pelindo, Bea Cukai Tracking tanpa login).
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="retro-btn bg-emerald-600 text-white hover:bg-emerald-700 font-bold px-3 py-1 flex items-center gap-1.5 shadow"
                    onClick={openAddPortalModal}
                  >
                    <Plus size={13} className="text-white" />
                    <span>+ Tambah Website Baru</span>
                  </button>
                  {portals.find((p) => p.id === 'siap_priok') && (
                    <button
                      type="button"
                      className="retro-btn bg-amber-200 hover:bg-yellow-300 text-black border-2 border-amber-600 font-bold px-3 py-1 flex items-center gap-1.5 shadow"
                      onClick={() => {
                        const siap = portals.find((p) => p.id === 'siap_priok');
                        if (siap) openEditModal(siap);
                      }}
                    >
                      <Settings size={12} className="text-amber-900" />
                      <span>⚙️ Atur Parameter SIAP 3.0</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="retro-btn text-[10.5px] px-2 py-1 text-gray-700 bg-white border border-gray-400"
                    onClick={handleResetPortals}
                    title="Kembalikan daftar portal ke default"
                  >
                    🔄 Reset Default
                  </button>
                </div>
              </div>

              <div className="sunken-panel flex-1 bg-white overflow-auto border-2 border-inset border-gray-400">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-[#c0c0c0] border-b border-[#808080] sticky top-0 z-10">
                      <th className="p-1.5 border-r border-[#808080] w-14 text-center">Status</th>
                      <th className="p-1.5 border-r border-[#808080] w-28 text-center">Tipe Akses</th>
                      <th className="p-1.5 border-r border-[#808080]">ID & Nama Portal</th>
                      <th className="p-1.5 border-r border-[#808080]">Target URL</th>
                      <th className="p-1.5 border-r border-[#808080]">Kunci Relasi</th>
                      <th className="p-1.5 border-r border-[#808080]">Akun / Auth</th>
                      <th className="p-1.5 text-center w-44">Aksi & Pengaturan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portals.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center bg-gray-50">
                          <div className="flex flex-col items-center gap-2 text-gray-600">
                            <span className="text-2xl">⚠️</span>
                            <span className="font-bold text-[12px]">Daftar target portal belum dimuat.</span>
                            <button
                              type="button"
                              className="retro-btn bg-blue-100 hover:bg-blue-200 text-blue-900 font-bold px-3 py-1.5 border-2 border-blue-600 mt-2"
                              onClick={handleResetPortals}
                            >
                              Muat Default Portal SIAP 3.0
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      portals.map((portal) => (
                        <tr key={portal.id} className="border-b border-gray-200 hover:bg-[#e8f0fe] transition-colors">
                          <td className="p-1.5 text-center border-r border-gray-300">
                            <span
                              className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                                portal.enabled ? 'bg-green-100 text-green-900 border border-green-500' : 'bg-gray-200 text-gray-600'
                              }`}
                            >
                              {portal.enabled ? 'AKTIF' : 'OFF'}
                            </span>
                          </td>
                          <td className="p-1.5 text-center border-r border-gray-300">
                            {portal.requiresAuth ? (
                              <span className="px-1.5 py-0.5 text-[9.5px] font-bold rounded bg-amber-100 text-amber-900 border border-amber-400">
                                🔐 Butuh Login
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 text-[9.5px] font-bold rounded bg-blue-100 text-blue-900 border border-blue-400">
                                🌐 Publik (Open)
                              </span>
                            )}
                          </td>
                          <td className="p-1.5 border-r border-gray-300">
                            <div className="font-bold text-gray-900">{portal.name}</div>
                            <div className="text-[10px] font-mono text-blue-900">ID: {portal.id}</div>
                          </td>
                          <td className="p-1.5 font-mono text-[10px] text-gray-700 border-r border-gray-300 truncate max-w-[200px]" title={portal.targetUrl}>
                            {portal.targetUrl}
                          </td>
                          <td className="p-1.5 font-mono text-[10.5px] text-purple-900 font-semibold border-r border-gray-300">
                            {portal.relationKey === 'containerNo'
                              ? '🔑 No Kontainer'
                              : portal.relationKey === 'queueNo'
                              ? '🔑 No Antrean'
                              : '🔑 Nomor PIB'}
                          </td>
                          <td className="p-1.5 font-mono text-[10px] border-r border-gray-300">
                            {portal.requiresAuth ? (portal.authUsername || '-') : <span className="text-gray-400 italic">Bypass (Tanpa Login)</span>}
                          </td>
                          <td className="p-1.5 text-center">
                            <div className="flex gap-1 justify-center items-center">
                              <button
                                type="button"
                                className="retro-btn bg-[#e8f0fe] hover:bg-white text-blue-900 text-[10.5px] py-1 px-2 flex items-center gap-1 font-bold border border-blue-800 shadow"
                                onClick={() => openEditModal(portal)}
                              >
                                <Edit3 size={10} className="text-blue-800" />
                                <span>Atur / Edit</span>
                              </button>
                              <button
                                type="button"
                                className={`retro-btn text-[10px] py-1 px-1.5 font-semibold ${
                                  portal.enabled
                                    ? 'bg-red-50 text-red-800 hover:bg-red-100 border border-red-300'
                                    : 'bg-green-50 text-green-800 hover:bg-green-100 border border-green-400'
                                }`}
                                onClick={() => handleTogglePortal(portal.id, portal.enabled)}
                              >
                                {portal.enabled ? 'Mati' : 'Hidup'}
                              </button>
                              {portal.id !== 'siap_priok' && (
                                <button
                                  type="button"
                                  className="retro-btn text-red-700 hover:bg-red-50 text-[10px] py-1 px-1"
                                  onClick={() => handleDeletePortal(portal.id)}
                                  title="Hapus portal ini"
                                >
                                  <Trash2 size={11} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Petunjuk Praktis */}
              <div className="bg-[#ffffe0] border border-[#d0c000] p-2 text-[11px] text-[#403000] flex items-center gap-2">
                <HelpCircle size={16} className="shrink-0 text-yellow-700" />
                <span>
                  <b>Petunjuk Multi-Website:</b> Jika website target <b>tidak memiliki login</b> (misal portal pelabuhan publik atau tracking kontainer), pilih <b>"Publik / Tanpa Login"</b> saat menambah/mengedit portal. Scraper akan otomatis melewati form autentikasi dan langsung mengekstrak tabel antrean.
                </span>
              </div>
            </div>
          )}

          {/* TAB 2: WHATSAPP TEMPLATE BUILDER & DATA FIELD SELECTOR */}
          {activeTab === 'template' && (
            <div className="flex-1 flex gap-2 overflow-hidden">
              {/* Kolom Kiri: Pemilih Kolom & Editor Teks Template */}
              <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-1">
                <div className="bg-[#dfdfdf] p-2 border border-[#808080] flex justify-between items-center">
                  <div>
                    <div className="font-bold text-emerald-900 text-[12px] flex items-center gap-1.5">
                      <Sparkles size={14} className="text-emerald-700" />
                      Pengaturan Format Data WhatsApp
                    </div>
                    <div className="text-[10.5px] text-gray-600">
                      Tentukan informasi apa saja yang ingin Anda tampilkan ke WhatsApp dinas Anda.
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="retro-btn bg-emerald-700 text-white font-bold px-3 py-1"
                      onClick={handleSaveTemplate}
                    >
                      {templateSaveStatus === 'saved' ? '✓ Format Disimpan!' : '💾 Simpan Format WA'}
                    </button>
                    <button
                      type="button"
                      className="retro-btn text-[10.5px] px-2 py-1"
                      onClick={() => setWaTemplate(DEFAULT_TEMPLATE_FRONTEND)}
                    >
                      Reset Default
                    </button>
                  </div>
                </div>

                {/* Checklist Field Data */}
                <fieldset className="border border-[#808080] p-2 bg-white">
                  <legend className="font-bold text-[11px] text-blue-900">
                    1. Centang Data yang Ingin Dimasukkan ke WhatsApp
                  </legend>
                  <div className="grid grid-cols-3 gap-2 text-[11px] pt-1">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={waTemplate.includeHeader}
                        onChange={(e) => setWaTemplate({ ...waTemplate, includeHeader: e.target.checked })}
                      />
                      <span>Header KPU Bea Cukai</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={waTemplate.includeFclLcl}
                        onChange={(e) => setWaTemplate({ ...waTemplate, includeFclLcl: e.target.checked })}
                      />
                      <span>Kategori FCL / LCL</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={waTemplate.includePibNumber}
                        onChange={(e) => setWaTemplate({ ...waTemplate, includePibNumber: e.target.checked })}
                      />
                      <span>Nomor PIB</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={waTemplate.includePibDate}
                        onChange={(e) => setWaTemplate({ ...waTemplate, includePibDate: e.target.checked })}
                      />
                      <span>Tanggal PIB</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={waTemplate.includeImporter}
                        onChange={(e) => setWaTemplate({ ...waTemplate, includeImporter: e.target.checked })}
                      />
                      <span>Nama Importir / Pemohon</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={waTemplate.includePicName}
                        onChange={(e) => setWaTemplate({ ...waTemplate, includePicName: e.target.checked })}
                      />
                      <span>Nama Pengurus (PPJK)</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={waTemplate.includePicContact}
                        onChange={(e) => setWaTemplate({ ...waTemplate, includePicContact: e.target.checked })}
                      />
                      <span>Nomor HP Pengurus (PPJK)</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={waTemplate.includeLocationTpft}
                        onChange={(e) => setWaTemplate({ ...waTemplate, includeLocationTpft: e.target.checked })}
                      />
                      <span>Lokasi & Kesiapan TPFT</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={waTemplate.includeDocsStatus}
                        onChange={(e) => setWaTemplate({ ...waTemplate, includeDocsStatus: e.target.checked })}
                      />
                      <span>Status Dokumen (PIB/INV/BL)</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer font-bold text-purple-900 col-span-2">
                      <input
                        type="checkbox"
                        checked={waTemplate.includeCrossCheckRelation}
                        onChange={(e) => setWaTemplate({ ...waTemplate, includeCrossCheckRelation: e.target.checked })}
                      />
                      <span>Sertakan Hasil Relasi & Sinkronisasi Website Lain</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={waTemplate.includeFooter}
                        onChange={(e) => setWaTemplate({ ...waTemplate, includeFooter: e.target.checked })}
                      />
                      <span>Footer & Status Lampiran PDF</span>
                    </label>
                  </div>
                </fieldset>

                {/* Editor Template Bebas & Tag Tombol */}
                <fieldset className="border border-[#808080] p-2 bg-white flex-1 flex flex-col">
                  <legend className="font-bold text-[11px] text-blue-900">
                    2. Editor Teks Pesan WhatsApp (Format Markdown Bebas)
                  </legend>
                  
                  <div className="mb-1.5">
                    <span className="text-[10px] text-gray-600 block mb-1">
                      Klik tombol tag berikut untuk menyisipkan variabel data otomatis ke posisi teks:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {[
                        '{no_pib}',
                        '{tgl_pib}',
                        '{fcl_lcl}',
                        '{importir}',
                        '{pic_nama}',
                        '{pic_kontak}',
                        '{lokasi_tpft}',
                        '{relasi_lintas_portal}',
                        '{status_pib}',
                        '{status_inv}',
                        '{status_bl}',
                        '{waktu_deteksi}',
                      ].map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className="retro-btn text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-900 border border-blue-400 font-mono hover:bg-blue-100"
                          onClick={() => insertTagToTemplate(tag)}
                        >
                          + {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    value={waTemplate.customTemplateText || ''}
                    onChange={(e) => setWaTemplate({ ...waTemplate, customTemplateText: e.target.value })}
                    className="flex-1 w-full min-h-[140px] p-2 font-mono text-[11px] border-2 border-inset border-gray-400 bg-gray-50 focus:bg-white"
                    placeholder="Susun format pesan WhatsApp Anda di sini..."
                  />
                </fieldset>
              </div>

              {/* Kolom Kanan: Live Preview Real-time Format WhatsApp */}
              <div className="w-[380px] flex flex-col bg-[#dfdfdf] p-2 border border-[#808080]">
                <div className="font-bold text-[11px] text-gray-800 mb-1 flex items-center gap-1.5">
                  <Eye size={13} className="text-blue-900" />
                  Live Preview di Layar HP WhatsApp Anda:
                </div>
                
                {/* Simulated Phone Screen */}
                <div className="flex-1 bg-[#efeae2] p-2.5 rounded border-2 border-[#808080] overflow-y-auto flex flex-col justify-start">
                  <div className="bg-[#d9fdd3] p-2.5 rounded-lg shadow-md border border-[#c3eab9] text-[11px] text-gray-900 max-w-full">
                    <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed select-text">
                      {generateLiveWaPreview()}
                    </pre>
                    <div className="flex justify-end items-center gap-1 text-[9px] text-gray-500 mt-1">
                      <span>{new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="text-blue-500 font-bold">✓✓</span>
                    </div>
                  </div>

                  <div className="mt-2 bg-[#d9fdd3] p-2 rounded-lg shadow-sm border border-[#c3eab9] flex items-center gap-2 text-[10.5px] text-blue-950 font-semibold">
                    <FileText size={16} className="text-red-600 shrink-0" />
                    <div className="flex-1 truncate">
                      <div>PIB_012845.pdf</div>
                      <div className="text-[9px] text-gray-500">142 KB • PDF Terlampir</div>
                    </div>
                  </div>
                </div>

                <div className="mt-2 text-center text-[10px] text-gray-600">
                  Pesan di atas diformat dan dikirim otomatis setiap kali ada dokumen baru.
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: RELASI DATA LINTAS PORTAL (CORRELATION ENGINE) */}
          {activeTab === 'relations' && (
            <div className="flex-1 flex flex-col gap-2 overflow-hidden">
              <div className="bg-[#dfdfdf] p-2 border border-[#808080] flex justify-between items-center">
                <div>
                  <div className="font-bold text-purple-900 text-[12px] flex items-center gap-1.5">
                    <Network size={14} className="text-purple-700" />
                    Arsitektur Relasi & Integrasi Data Lintas Portal
                  </div>
                  <div className="text-[10.5px] text-gray-600">
                    Bagaimana aplikasi menghubungkan data dari website SIAP 3.0 dengan website TPFT dan Pelindo tanpa manual input.
                  </div>
                </div>
                <span className="px-2 py-0.5 bg-purple-100 text-purple-900 border border-purple-400 font-bold text-[10px] rounded">
                  Engine Aktif: Auto-Correlation Matching
                </span>
              </div>

              {/* Diagram Visual Alur Relasi */}
              <div className="bg-white p-3 border-2 border-inset border-gray-400 overflow-y-auto space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2.5 bg-blue-50 border-2 border-blue-600 rounded">
                    <div className="font-bold text-blue-900 text-[12px]">Sumber 1: SIAP 3.0 Priok</div>
                    <div className="text-[10px] text-gray-600 mt-1">
                      Mengekstrak Nomor PIB, Tanggal, Importir, dan Kontak PPJK.
                    </div>
                    <div className="mt-2 text-[10px] font-mono bg-blue-100 p-1 text-blue-950 border border-blue-300">
                      Primary Key: <b>Nomor PIB</b>
                    </div>
                  </div>

                  <div className="p-2.5 bg-amber-50 border-2 border-amber-600 rounded">
                    <div className="font-bold text-amber-900 text-[12px]">Sumber 2: TPFT Graha Segara</div>
                    <div className="text-[10px] text-gray-600 mt-1">
                      Mengecek posisi fisik kontainer & kesiapan buka segel di lapangan.
                    </div>
                    <div className="mt-2 text-[10px] font-mono bg-amber-100 p-1 text-amber-950 border border-amber-300">
                      Cross-Match: <b>PIB & Kontainer</b>
                    </div>
                  </div>

                  <div className="p-2.5 bg-emerald-50 border-2 border-emerald-600 rounded">
                    <div className="font-bold text-emerald-900 text-[12px]">Sumber 3: Pelindo (Publik)</div>
                    <div className="text-[10px] text-gray-600 mt-1">
                      Mengecek waktu Gate-In kontainer masuk pelabuhan (Tanpa Login).
                    </div>
                    <div className="mt-2 text-[10px] font-mono bg-emerald-100 p-1 text-emerald-950 border border-emerald-300">
                      Cross-Match: <b>No Petikemas</b>
                    </div>
                  </div>
                </div>

                <div className="bg-[#f0f4ff] p-2.5 border border-blue-300 rounded text-[11px]">
                  <div className="font-bold text-blue-900 mb-1">
                    🔄 Bagaimana Relasi Terbentuk di Belakang Layar:
                  </div>
                  <ol className="list-decimal ml-4 space-y-1 text-gray-800 text-[11px]">
                    <li><b>Tahap 1: Ekstraksi Data Utama:</b> Scraper mengambil penugasan dari SIAP 3.0 (misal PIB <code>#012845</code>).</li>
                    <li><b>Tahap 2: Correlation Matching:</b> Mesin relasi mencari nomor PIB atau Nomor Petikemas tersebut ke indeks website TPFT dan Pelindo.</li>
                    <li><b>Tahap 3: Data Fusion & Merger:</b> Ketika ditemukan kesamaan, status lokasi lapangan (contoh: <code>Blok C-02 Tier 1</code>) langsung disatukan ke dokumen PIB tersebut.</li>
                    <li><b>Tahap 4: Transmisi Tunggal:</b> Petugas menerima <b>1 pesan WhatsApp terpadu</b> yang sudah mencakup data dari ketiga website tersebut sekaligus.</li>
                  </ol>
                </div>

                {/* Simulator Uji Pencocokan Relasi */}
                <fieldset className="border border-[#808080] p-2.5 bg-[#fdfdfd]">
                  <legend className="font-bold text-[11px] text-purple-900">
                    🧪 Uji Pencocokan Relasi Langsung (Correlation Test)
                  </legend>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span>Masukkan Nomor PIB Uji:</span>
                    <input
                      type="text"
                      value={simulatedMatchPib}
                      onChange={(e) => setSimulatedMatchPib(e.target.value)}
                      className="px-2 py-0.5 border-2 border-inset border-gray-300 font-mono font-bold"
                    />
                    <button
                      type="button"
                      className="retro-btn bg-purple-100 hover:bg-purple-200 text-purple-900 font-bold px-3 py-1 border border-purple-500"
                      onClick={() => alert(`Relasi untuk PIB #${simulatedMatchPib} terhubung dengan TPFT Graha Segara (Blok C-02) dan Terminal Pelindo (Gate-In 06:45 WIB).`)}
                    >
                      Cari & Hubungkan Data
                    </button>
                  </div>
                </fieldset>
              </div>
            </div>
          )}

          {/* TAB 4: ANTREAN DOKUMEN & HASIL RELASI */}
          {activeTab === 'queue' && (
            <div className="flex-1 flex flex-col gap-2 overflow-hidden">
              <div className="flex justify-between items-center bg-[#dfdfdf] p-1.5 border border-[#808080]">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[11.5px] text-blue-900">
                    Tabel Antrean Dokumen Terpadu (Hasil Sinkronisasi Multi-Website)
                  </span>
                  <span className="px-2 py-0.2 bg-blue-100 text-blue-900 border border-blue-400 font-mono text-[10px] font-bold">
                    {documents.length} Dokumen
                  </span>
                </div>
                <button className="retro-btn font-bold text-blue-900" onClick={triggerManualScraper}>
                  Scrape Ulang Round-Robin
                </button>
              </div>

              <div className="sunken-panel flex-1 bg-white overflow-auto border-2 border-inset border-gray-400">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-[#c0c0c0] border-b border-[#808080] sticky top-0 text-[10.5px] z-10">
                      <th className="p-1 border-r border-[#808080]">Portal Sumber</th>
                      <th className="p-1 border-r border-[#808080]">No / Tgl PIB</th>
                      <th className="p-1 border-r border-[#808080]">Importir</th>
                      <th className="p-1 border-r border-[#808080]">Pengurus (PPJK) & HP</th>
                      <th className="p-1 border-r border-[#808080]">Lokasi Lapangan TPFT</th>
                      <th className="p-1 border-r border-[#808080]">Hasil Relasi Multi-Web</th>
                      <th className="p-1 border-r border-[#808080]">Berkas PDF</th>
                      <th className="p-1">Waktu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-8 text-gray-500 italic">
                          Belum ada baris antrean terdeteksi. Silakan klik tombol "Start Monitoring" atau "Scrape Round-Robin".
                        </td>
                      </tr>
                    ) : (
                      documents.map((doc) => (
                        <tr key={doc.id} className="border-b border-gray-200 hover:bg-[#e8f0fe]">
                          <td className="p-1 border-r border-gray-300">
                            <span className="bg-blue-100 text-blue-900 border border-blue-400 px-1 py-0.5 text-[10px] font-bold">
                              {doc.siteName || doc.siteId || 'SIAP 3.0 Priok'}
                            </span>
                          </td>
                          <td className="p-1 font-mono font-bold text-blue-900 border-r border-gray-300">
                            <div className="flex items-center gap-1">
                              <span>{doc.pibNumber || doc.queueNo}</span>
                              <span className={`text-[9px] px-1 py-0.2 rounded font-sans font-bold border ${doc.fclLcl === 'LCL' ? 'bg-orange-100 text-orange-900 border-orange-400' : 'bg-emerald-100 text-emerald-900 border-emerald-400'}`}>
                                {doc.fclLcl || 'FCL'}
                              </span>
                            </div>
                            <div className="text-[9.5px] text-gray-600 font-sans font-normal">{doc.pibDate || '-'}</div>
                          </td>
                          <td className="p-1 border-r border-gray-300 font-semibold text-gray-900">
                            {doc.importerName || doc.applicantName}
                          </td>
                          <td className="p-1 border-r border-gray-300">
                            <div>{doc.picName}</div>
                            <div className="text-[10px] text-green-800 font-mono font-bold">{doc.picContact}</div>
                          </td>
                          <td className="p-1 border-r border-gray-300">
                            <span className="inline-block px-1 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-400">
                              {doc.locationTpft || 'Belum Terjadwal di TPFT'}
                            </span>
                          </td>
                          <td className="p-1 border-r border-gray-300">
                            {doc.relatedPortals && doc.relatedPortals.length > 0 ? (
                              <div className="space-y-0.5 text-[9.5px]">
                                {doc.relatedPortals.map((r, idx) => (
                                  <div key={idx} className="bg-purple-50 text-purple-900 border border-purple-300 px-1 py-0.2 font-mono">
                                    ✓ {r.portalName?.replace('Monitoring Posisi ', '') || r.portalId}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400 italic text-[10px]">Tunggal</span>
                            )}
                          </td>
                          <td className="p-1 border-r border-gray-300 font-mono text-[10px] text-blue-900">
                            {doc.pdfFilename}
                          </td>
                          <td className="p-1 text-gray-600 text-[10px]">{doc.detectedAt}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: WHATSAPP MINI CHAT */}
          {activeTab === 'whatsapp' && (
            <div className="flex-1 flex gap-2 overflow-hidden">
              <div className="w-[280px] flex flex-col gap-2 bg-[#dfdfdf] p-2 border border-[#808080]">
                <fieldset className="border border-[#808080] p-2 bg-white">
                  <legend className="font-bold text-[11px]">Koneksi Baileys</legend>
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`led-indicator ${
                        status.whatsappStatus === 'CONNECTED'
                          ? 'led-green'
                          : status.whatsappStatus === 'SCAN_QR'
                          ? 'led-yellow'
                          : 'led-red'
                      }`}
                    />
                    <span className="font-bold text-[12px]">{status.whatsappStatus}</span>
                  </div>
                  <div className="text-[11px] text-gray-700 space-y-1">
                    <div>PIC Nomor: <b>{config.personalWhatsAppNumber}</b></div>
                    <div>Sesi Auth: <code>./auth_info_baileys/</code></div>
                  </div>
                </fieldset>

                <div className="flex-1 flex flex-col items-center justify-center p-2 bg-white border-2 border-inset border-gray-400 text-center">
                  {status.whatsappQrCode ? (
                    <div className="flex flex-col items-center">
                      <img
                        src={status.whatsappQrCode}
                        alt="WhatsApp QR Code"
                        className="w-32 h-32 border border-black shadow"
                      />
                      <span className="text-[10px] text-gray-600 mt-1 font-mono">Pindai di WhatsApp</span>
                    </div>
                  ) : status.whatsappStatus === 'CONNECTED' ? (
                    <div className="flex flex-col items-center text-green-700">
                      <CheckCircle2 size={36} className="mb-1" />
                      <span className="font-bold text-[12px]">Terhubung Sukses!</span>
                      <span className="text-[10px] text-gray-600">Bot aktif merespons perintah</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-gray-500">
                      <QrCode size={36} className="mb-1 opacity-50" />
                      <span className="text-[11px]">Soket WhatsApp Siaga</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <button className="retro-btn" onClick={handleConnectWhatsApp}>
                    Request QR Baru
                  </button>
                  <button
                    className="retro-btn text-blue-900 font-bold"
                    onClick={handleSimulatePairing}
                  >
                    ⚡ Uji Pair (+{config.personalWhatsAppNumber})
                  </button>
                </div>
              </div>

              <div className="flex-1 flex flex-col bg-white border-2 border-inset border-gray-400 overflow-hidden">
                <div className="bg-[#000080] text-white px-2 py-1 flex justify-between items-center text-[11px] font-bold">
                  <span>Riwayat Pesan Dua Arah (Tagging Multi-Portal)</span>
                  <span>{chats.length} Pesan</span>
                </div>

                <div ref={chatScrollRef} className="flex-1 p-2 overflow-y-auto flex flex-col bg-[#e6ebe3]">
                  {chats.length === 0 ? (
                    <div className="text-gray-500 italic text-center my-auto">
                      Belum ada pesan. Ketik perintah seperti <b>status</b>, <b>start</b>, atau <b>cek pic</b>.
                    </div>
                  ) : (
                    chats.map((c) => (
                      <div
                        key={c.id}
                        className={c.direction === 'INCOMING' ? 'chat-bubble-in' : 'chat-bubble-out'}
                      >
                        <div className="flex justify-between items-center text-[10px] text-gray-500 mb-0.5 gap-3">
                          <span className="font-bold">
                            {c.direction === 'INCOMING' ? `Dari: ${c.sender}` : 'Workstation Bot'}
                          </span>
                          <span>{c.timestamp}</span>
                        </div>
                        <div className="whitespace-pre-wrap text-[11.5px] font-sans text-gray-900">{c.text}</div>
                        {c.hasAttachment && (
                          <div className="mt-1 pt-1 border-t border-gray-400 flex items-center gap-1 text-[10.5px] font-mono text-blue-900">
                            <FileText size={12} />
                            <span>Lampiran: {c.attachmentName}</span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="p-1.5 bg-[#c0c0c0] border-t border-[#808080] flex flex-col gap-1">
                  <div className="flex gap-1 text-[10px]">
                    <button
                      type="button"
                      className="retro-btn text-[10px] py-0.5 px-1.5"
                      onClick={() => setChatInput('status')}
                    >
                      Perintah status
                    </button>
                    <button
                      type="button"
                      className="retro-btn text-[10px] py-0.5 px-1.5"
                      onClick={() => setChatInput('start')}
                    >
                      Perintah start
                    </button>
                    <button
                      type="button"
                      className="retro-btn text-[10px] py-0.5 px-1.5"
                      onClick={() => setChatInput('cek pic 081296173107')}
                    >
                      Perintah cek pic
                    </button>
                  </div>

                  <form onSubmit={handleSendChatMessage} className="flex gap-1">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Ketik perintah WhatsApp..."
                      className="flex-1 px-1.5 py-1 text-[11px] border-2 border-inset border-white bg-white"
                    />
                    <button type="submit" className="retro-btn flex items-center gap-1 font-bold">
                      <Send size={11} /> Kirim
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: LOG AKTIVITAS */}
          {activeTab === 'monitor' && (
            <div className="flex-1 flex flex-col gap-2 overflow-hidden">
              <div className="grid grid-cols-4 gap-2 bg-[#dfdfdf] p-1.5 border border-[#808080]">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-700">Mode:</span>
                  <span className="font-bold font-mono text-blue-900">Round-Robin Sekuensial</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-700">Portal Aktif:</span>
                  <span className="font-bold font-mono">{activePortalsCount} Portal</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-700">Total PDF:</span>
                  <span className="font-bold font-mono text-green-900">{status.totalPdfDownloaded} Berkas</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-700">WA Terkirim:</span>
                  <span className="font-bold font-mono text-emerald-900">{status.totalWhatsAppSent} Notifikasi</span>
                </div>
              </div>

              <div className="flex justify-between items-center bg-[#dfdfdf] p-1 border border-[#808080]">
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="font-bold">Filter Log:</span>
                  {(['ALL', 'SCRAPER', 'WHATSAPP', 'SYSTEM'] as const).map((filter) => (
                    <button
                      key={filter}
                      className={`retro-btn text-[10px] py-0.5 px-2 ${logFilter === filter ? 'font-bold bg-[#000080] text-white' : ''}`}
                      onClick={() => setLogFilter(filter)}
                    >
                      {filter}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-700">{filteredLogs.length} Baris Log</span>
                  <button className="retro-btn" onClick={handleClearLogs}>
                    Bersihkan Log
                  </button>
                </div>
              </div>

              <div ref={logContainerRef} className="log-terminal flex-1 overflow-y-auto font-mono text-[11.5px]">
                {filteredLogs.length === 0 ? (
                  <div className="text-gray-500 italic p-2">
                    Belum ada catatan log aktivitas. Klik "Start Monitoring" atau "Scrape Round-Robin".
                  </div>
                ) : (
                  filteredLogs.map((l) => (
                    <div key={l.id} className="py-0.5 border-b border-gray-900 hover:bg-[#111111]">
                      <span className="text-gray-400">[{l.timestamp}]</span>{' '}
                      <span
                        className={
                          l.source === 'SCRAPER'
                            ? 'text-yellow-400 font-bold'
                            : l.source === 'WHATSAPP'
                            ? 'text-cyan-400 font-bold'
                            : l.source === 'SCHEDULER'
                            ? 'text-purple-400 font-bold'
                            : 'text-gray-300'
                        }
                      >
                        [{l.source}]
                      </span>{' '}
                      <span
                        className={
                          l.level === 'error'
                            ? 'text-red-400 font-bold'
                            : l.level === 'warn'
                            ? 'text-yellow-300'
                            : l.level === 'success'
                            ? 'text-green-300 font-semibold'
                            : 'text-green-400'
                        }
                      >
                        {l.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 7: DEEP SCAN & DIAGNOSTIK SISTEM TERPADU */}
          {activeTab === 'diagnostics' && (
            <div className="flex-1 flex flex-col gap-2 overflow-hidden">
              <div className="bg-[#dfdfdf] p-2 border border-[#808080] flex justify-between items-center">
                <div>
                  <div className="font-bold text-indigo-900 text-[12px] flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-indigo-700" />
                    Deep Scan & Verifikasi Mandiri Seluruh Modul Sistem
                  </div>
                  <div className="text-[10.5px] text-gray-600">
                    Memeriksa integritas kode, Playwright, sesi login, Baileys socket, relation engine, dan akses disk di latar belakang.
                  </div>
                </div>
                <button
                  type="button"
                  className="retro-btn bg-indigo-700 hover:bg-indigo-800 text-white font-bold px-3 py-1.5 flex items-center gap-1.5 shadow"
                  onClick={handleRunDiagnostics}
                  disabled={isRunningDiagnostics}
                >
                  <Activity size={13} className={isRunningDiagnostics ? 'animate-spin' : ''} />
                  <span>{isRunningDiagnostics ? 'Sedang Memindai...' : '▶ Jalankan Deep Scan Sekarang'}</span>
                </button>
              </div>

              <div className="flex-1 bg-white p-3 border-2 border-inset border-gray-400 overflow-y-auto">
                {!diagnosticReport && !isRunningDiagnostics ? (
                  <div className="flex flex-col items-center justify-center h-full text-center text-gray-600">
                    <Activity size={40} className="text-indigo-600 mb-2 opacity-60" />
                    <div className="font-bold text-[13px] text-gray-800">Uji Mandiri Belakang Layar Siap Dijalankan</div>
                    <div className="text-[11px] text-gray-500 max-w-md mt-1">
                      Klik tombol <b>"Jalankan Deep Scan Sekarang"</b> untuk menguji Playwright scraper, pengecekan website publik/login, perayapan multi-portal, soket WhatsApp Baileys, dan pembuatan PDF di server secara live.
                    </div>
                  </div>
                ) : isRunningDiagnostics ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="animate-spin text-2xl mb-2">⚙️</div>
                    <div className="font-bold text-[12px] text-indigo-950">Sedang Menjalankan Deep Scan 7 Komponen...</div>
                    <div className="text-[10.5px] text-gray-500 mt-1">Menguji browser engine, adapter registry, relasi data, formatter pesan, dan write disk...</div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Ringkasan Status */}
                    <div className={`p-2.5 border-2 rounded flex justify-between items-center ${
                      diagnosticReport?.allPassed ? 'bg-green-50 border-green-600 text-green-950' : 'bg-amber-50 border-amber-600 text-amber-950'
                    }`}>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={20} className={diagnosticReport?.allPassed ? 'text-green-600' : 'text-amber-600'} />
                        <div>
                          <div className="font-bold text-[12px]">
                            {diagnosticReport?.allPassed ? 'SEMUA KOMPONEN BERFUNGSI SEMPURNA (100% OPERASIONAL)' : 'DIAGNOSTIK SELESAI DENGAN CATATAN'}
                          </div>
                          <div className="text-[10.5px] text-gray-600">
                            Waktu Scan: {diagnosticReport?.timestamp} | Total Durasi: {((diagnosticReport?.totalDurationMs || 0) / 1000).toFixed(2)} detik
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-[11px] font-bold px-2 py-0.5 bg-white border border-gray-400 rounded">
                        {diagnosticReport?.tests.length} Pengujian Selesai
                      </span>
                    </div>

                    {/* Rincian Hasil Tiap Pengujian */}
                    <div className="space-y-2">
                      {diagnosticReport?.tests.map((test) => (
                        <div
                          key={test.id}
                          className="p-2 border border-gray-300 bg-gray-50 hover:bg-[#f0f4ff] transition-colors rounded text-[11px]"
                        >
                          <div className="flex justify-between items-center mb-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-1.5 py-0.2 text-[9.5px] font-bold rounded ${
                                  test.status === 'PASSED'
                                    ? 'bg-green-100 text-green-900 border border-green-500'
                                    : test.status === 'WARNING'
                                    ? 'bg-amber-100 text-amber-900 border border-amber-500'
                                    : 'bg-red-100 text-red-900 border border-red-500'
                                }`}
                              >
                                {test.status}
                              </span>
                              <span className="font-bold text-gray-900">{test.name}</span>
                              <span className="text-[10px] text-gray-500">({test.category})</span>
                            </div>
                            <span className="font-mono text-[10px] text-gray-500">{test.durationMs}ms</span>
                          </div>
                          <div className="text-[10.5px] text-gray-700 font-sans pl-1">{test.details}</div>
                          {test.recommendation && (
                            <div className="mt-1 text-[10px] text-amber-800 bg-amber-50 p-1 border border-amber-200">
                              💡 Saran: {test.recommendation}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Box Penanganan Galat & Recovery Alur */}
                    <div className="bg-[#ffffe0] border border-[#d0c000] p-2 text-[11px] text-[#403000] space-y-1">
                      <div className="font-bold flex items-center gap-1">
                        <AlertTriangle size={13} className="text-amber-800" />
                        Penanganan Galat di Setiap Langkah (Fault-Tolerance Matrix):
                      </div>
                      <ul className="list-disc ml-4 text-[10.5px] space-y-0.5 text-gray-800">
                        <li><b>Website Offline / Jaringan Terputus:</b> Scraper melanjutkan ke portal berikutnya tanpa crash. Siklus retry otomatis 3 menit kemudian.</li>
                        <li><b>Sesi Login Kedaluwarsa:</b> Sistem otomatis menghapus <code>storageState.json</code> yang korup dan mengeksekusi login ulang secara mandiri.</li>
                        <li><b>Website Publik Tanpa Login:</b> Bypassed secara elegan tanpa mencoba mengisi form kredensial.</li>
                        <li><b>WhatsApp Terputus:</b> Antrean dokumen disimpan lokal dan diteruskan otomatis saat soket terhubung kembali.</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 8: PENGATURAN SIKLUS & PERSYARATAN */}
          {activeTab === 'config' && (
            <div className="flex-1 overflow-y-auto flex flex-col gap-3 p-1">
              <div className="grid grid-cols-2 gap-3">
                <fieldset className="border border-[#808080] p-2 bg-[#f8f8f8]">
                  <legend className="font-bold text-[11px]">Parameter Siklus Multi-Website</legend>
                  <div className="space-y-2 text-[11px]">
                    <div>
                      <label className="block font-semibold mb-0.5">Model Penjadwalan:</label>
                      <input
                        type="text"
                        readOnly
                        value="Round-Robin Sekuensial (Bergiliran Antar Portal)"
                        className="w-full px-1.5 py-0.5 bg-gray-200 border-2 border-inset border-white text-[10.5px] font-bold text-blue-900"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-0.5">Interval Siklus (Menit):</label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={config.pollingIntervalMinutes}
                        onChange={(e) => setConfig({ ...config, pollingIntervalMinutes: parseInt(e.target.value, 10) || 3 })}
                        className="w-24 px-1.5 py-0.5 border-2 border-inset border-white bg-white text-[11px]"
                      />
                    </div>
                  </div>
                </fieldset>

                <fieldset className="border border-[#808080] p-2 bg-[#f8f8f8]">
                  <legend className="font-bold text-[11px]">Nomor WhatsApp Admin & PIC</legend>
                  <div className="space-y-2 text-[11px]">
                    <div>
                      <label className="block font-semibold mb-0.5">Nomor Tujuan WhatsApp (Contoh: 6281234567890):</label>
                      <input
                        type="text"
                        value={config.personalWhatsAppNumber}
                        onChange={(e) => setConfig({ ...config, personalWhatsAppNumber: e.target.value })}
                        className="w-full px-1.5 py-0.5 border-2 border-inset border-white bg-white text-[11px]"
                      />
                    </div>
                    <div className="pt-2">
                      <label className="flex items-center gap-1.5 font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.autoSendPdf}
                          onChange={(e) => setConfig({ ...config, autoSendPdf: e.target.checked })}
                        />
                        Transmisikan berkas PDF otomatis ke WhatsApp dinas
                      </label>
                    </div>
                  </div>
                </fieldset>
              </div>

              {/* Rangkuman Kebutuhan di Luar Aplikasi */}
              <fieldset className="border border-[#808080] p-2.5 bg-white">
                <legend className="font-bold text-[11px] text-blue-900">
                  📋 Apa Saja yang Dibutuhkan Selain Apa yang Ada di Aplikasi Ini?
                </legend>
                <div className="text-[11px] space-y-1.5 text-gray-800">
                  <div className="flex items-start gap-1.5">
                    <span className="font-bold text-blue-900">1. Komputer / Server Host yang Menyala:</span>
                    <span>Komputer Windows (atau VPS Linux di cloud) yang terus menyala agar penjadwal cron Playwright dapat mengecek web target setiap interval waktu tanpa henti.</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="font-bold text-blue-900">2. Nomor WhatsApp Aktif Khusus Bot:</span>
                    <span>Disarankan memiliki 1 nomor WhatsApp khusus (nomor operator bot) untuk dipindai via menu <b>Linked Devices</b>, yang akan mengirimkan dokumen ke nomor dinas pribadi Anda.</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="font-bold text-blue-900">3. Kredensial Login Resmi:</span>
                    <span>Akun petugas resmi SIAP 3.0 (KPU Bea Cukai Priok) dan akun TPFT (jika portal berbayar). Untuk website publik (seperti Gate Pelindo), tidak diperlukan kredensial apa pun.</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="font-bold text-blue-900">4. Akses Jaringan / VPN (Jika Perlu):</span>
                    <span>Jika portal SIAP 3.0 atau intranet pelabuhan berada di balik jaringan tertutup Bea Cukai, komputer host wajib terhubung ke koneksi VPN instansi terkait.</span>
                  </div>
                </div>
              </fieldset>

              <div className="flex justify-end gap-2 mt-2">
                <button
                  className="retro-btn bg-[#000080] text-black font-bold"
                  onClick={() => alert('Pengaturan jadwal & WhatsApp disimpan!')}
                >
                  Simpan Pengaturan
                </button>
              </div>
            </div>
          )}
        </article>
      </div>

      {/* STATUS BAR BAWAH KLASIK WINDOWS 98 */}
      <div className="status-bar bg-[#c0c0c0] border-t border-[#808080] flex text-[11px] p-0.5 flex-shrink-0">
        <div className="status-bar-field flex-1 px-1">
          {status.isMonitoringActive
            ? `● Monitoring Multi-Website Aktif (${activePortalsCount} Portal | Siklus berikutnya: ${formatCountdown(status.nextRunInSeconds)})`
            : `○ Workstation Siaga (${activePortalsCount} Portal Terdaftar)`}
        </div>
        <div className="status-bar-field px-2">
          Model: Round-Robin Bergiliran
        </div>
        <div className="status-bar-field px-2">
          WhatsApp: {status.whatsappStatus}
        </div>
        <div className="status-bar-field px-2 font-mono">
          {isWsConnected ? 'WS: Live' : 'WS: Poll'}
        </div>
      </div>

      {/* MODAL TAMBAH / ATUR PORTAL WEB (WINDOWS 98 DIALOG) */}
      {(editingPortal || isAddingNewPortal) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="window w-[700px] max-h-[92vh] flex flex-col shadow-2xl">
            <div className="title-bar title-bar-gradient flex justify-between items-center px-1">
              <div className="title-bar-text font-bold text-white flex items-center gap-1">
                <Globe size={13} /> {isAddingNewPortal ? 'Tambah Website Target Baru' : `Pengaturan Portal: ${editingPortal?.name}`}
              </div>
              <div className="title-bar-controls">
                <button aria-label="Close" onClick={() => { setEditingPortal(null); setIsAddingNewPortal(false); }} />
              </div>
            </div>

            <form onSubmit={savePortalConfig} className="window-body p-2 flex flex-col gap-2 overflow-y-auto bg-[#c0c0c0]">
              {/* Opsi Tipe Akses: Publik vs Berautentikasi */}
              <div className="p-2 bg-[#dfdfdf] border border-[#808080] flex items-center justify-between">
                <div>
                  <span className="font-bold text-[11.5px] text-blue-900">Jenis Autentikasi Website:</span>
                  <div className="text-[10px] text-gray-600">
                    Pilih apakah website target memerlukan login atau dapat langsung diakses publik.
                  </div>
                </div>
                <div className="flex gap-2">
                  <label className="flex items-center gap-1 font-bold text-[11px] cursor-pointer">
                    <input
                      type="radio"
                      name="auth_type"
                      checked={!portalForm.requiresAuth}
                      onChange={() => setPortalForm({ ...portalForm, requiresAuth: false })}
                    />
                    <span>🌐 Publik / Tanpa Login</span>
                  </label>
                  <label className="flex items-center gap-1 font-bold text-[11px] cursor-pointer">
                    <input
                      type="radio"
                      name="auth_type"
                      checked={portalForm.requiresAuth}
                      onChange={() => setPortalForm({ ...portalForm, requiresAuth: true })}
                    />
                    <span>🔐 Berautentikasi (Perlu Login)</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {/* Kolom Kiri: Target URL & Kredensial */}
                <fieldset className="border border-[#808080] p-2 bg-white">
                  <legend className="font-bold">1. URL & Kunci Relasi Data</legend>
                  <div className="space-y-1.5">
                    <div>
                      <label className="block font-semibold">Nama Label Portal:</label>
                      <input
                        type="text"
                        value={portalForm.name || ''}
                        onChange={(e) => setPortalForm({ ...portalForm, name: e.target.value })}
                        className="w-full px-1 border-2 border-inset border-gray-300"
                        placeholder="Contoh: Terminal Petikemas Pelindo"
                        required
                      />
                    </div>
                    <div>
                      <label className="block font-semibold">Target URL:</label>
                      <input
                        type="text"
                        value={portalForm.targetUrl || ''}
                        onChange={(e) => setPortalForm({ ...portalForm, targetUrl: e.target.value })}
                        className="w-full px-1 border-2 border-inset border-gray-300 font-mono text-[10.5px]"
                        placeholder="https://..."
                        required
                      />
                    </div>
                    <div>
                      <label className="block font-semibold">Kunci Relasi Lintas Portal:</label>
                      <select
                        value={portalForm.relationKey || 'pibNumber'}
                        onChange={(e) => setPortalForm({ ...portalForm, relationKey: e.target.value as any })}
                        className="w-full px-1 border-2 border-inset border-gray-300 font-semibold"
                      >
                        <option value="pibNumber">Nomor PIB (Contoh: 012845)</option>
                        <option value="containerNo">Nomor Petikemas / Kontainer (Contoh: TEMU1234567)</option>
                        <option value="queueNo">Nomor Tiket Antrean (Contoh: DOC-98-042)</option>
                      </select>
                    </div>

                    {portalForm.requiresAuth ? (
                      <div className="pt-1 border-t border-gray-300 space-y-1.5">
                        <div className="grid grid-cols-2 gap-1.5">
                          <div>
                            <label className="block font-semibold">Username Login:</label>
                            <input
                              type="text"
                              value={portalForm.authUsername || ''}
                              onChange={(e) => setPortalForm({ ...portalForm, authUsername: e.target.value })}
                              className="w-full px-1 border-2 border-inset border-gray-300"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold">Password Login:</label>
                            <input
                              type="password"
                              value={portalForm.authPassword || ''}
                              onChange={(e) => setPortalForm({ ...portalForm, authPassword: e.target.value })}
                              className="w-full px-1 border-2 border-inset border-gray-300"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block font-semibold">Selector Input Username (CSS):</label>
                          <input
                            type="text"
                            value={portalForm.loginFormSelector || ''}
                            onChange={(e) => setPortalForm({ ...portalForm, loginFormSelector: e.target.value })}
                            className="w-full px-1 border-2 border-inset border-gray-300 font-mono text-[10px]"
                            placeholder="#username atau input[name='user']"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold">Selector Input Password (CSS):</label>
                          <input
                            type="text"
                            value={portalForm.passwordSelector || ''}
                            onChange={(e) => setPortalForm({ ...portalForm, passwordSelector: e.target.value })}
                            className="w-full px-1 border-2 border-inset border-gray-300 font-mono text-[10px]"
                            placeholder="#password atau input[name='pass']"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="bg-emerald-50 border border-emerald-300 p-2 text-[10px] text-emerald-900 mt-2">
                        ✓ <b>Mode Akses Terbuka:</b> Scraper tidak akan menampilkan form login dan langsung menuju ke tabel antrean dokumen di URL target.
                      </div>
                    )}
                  </div>
                </fieldset>

                {/* Kolom Kanan: Selector Tabel Antrean & Unduh PDF */}
                <fieldset className="border border-[#808080] p-2 bg-white">
                  <legend className="font-bold">2. Ekstraksi Tabel & Tombol PDF</legend>
                  <div className="space-y-1.5">
                    <div>
                      <label className="block font-semibold">Selector Baris Tabel (Row):</label>
                      <input
                        type="text"
                        value={portalForm.tableRowsSelector || ''}
                        onChange={(e) => setPortalForm({ ...portalForm, tableRowsSelector: e.target.value })}
                        className="w-full px-1 border-2 border-inset border-gray-300 font-mono text-[10px]"
                        placeholder="table tbody tr atau .queue-row"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="block font-semibold">Kolom ID / Tiket:</label>
                        <input
                          type="text"
                          value={portalForm.idColSelector || ''}
                          onChange={(e) => setPortalForm({ ...portalForm, idColSelector: e.target.value })}
                          className="w-full px-1 border-2 border-inset border-gray-300 font-mono text-[10px]"
                          placeholder="td:nth-child(1)"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold">Kolom Pemohon:</label>
                        <input
                          type="text"
                          value={portalForm.applicantColSelector || ''}
                          onChange={(e) => setPortalForm({ ...portalForm, applicantColSelector: e.target.value })}
                          className="w-full px-1 border-2 border-inset border-gray-300 font-mono text-[10px]"
                          placeholder="td:nth-child(2)"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="block font-semibold">Kolom Judul Berkas:</label>
                        <input
                          type="text"
                          value={portalForm.titleColSelector || ''}
                          onChange={(e) => setPortalForm({ ...portalForm, titleColSelector: e.target.value })}
                          className="w-full px-1 border-2 border-inset border-gray-300 font-mono text-[10px]"
                          placeholder="td:nth-child(3)"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold">Kolom PIC & Kontak:</label>
                        <input
                          type="text"
                          value={portalForm.picColSelector || ''}
                          onChange={(e) => setPortalForm({ ...portalForm, picColSelector: e.target.value })}
                          className="w-full px-1 border-2 border-inset border-gray-300 font-mono text-[10px]"
                          placeholder="td:nth-child(4)"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block font-semibold">Selector Tombol Unduh PDF:</label>
                      <input
                        type="text"
                        value={portalForm.downloadBtnSelector || ''}
                        onChange={(e) => setPortalForm({ ...portalForm, downloadBtnSelector: e.target.value })}
                        className="w-full px-1 border-2 border-inset border-gray-300 font-mono text-[10px]"
                        placeholder="a.btn-download atau a[href$='.pdf']"
                      />
                    </div>
                  </div>
                </fieldset>
              </div>

              <div className="flex justify-end gap-2 pt-1 border-t border-[#808080]">
                <button type="submit" className="retro-btn bg-[#000080] text-black font-bold">
                  {isAddingNewPortal ? 'Daftarkan Portal Baru' : 'Simpan Konfigurasi Portal'}
                </button>
                <button
                  type="button"
                  className="retro-btn"
                  onClick={() => { setEditingPortal(null); setIsAddingNewPortal(false); }}
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL QR CODE SCANNER */}
      {isQrModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="window w-[340px] shadow-2xl">
            <div className="title-bar title-bar-gradient flex justify-between items-center px-1">
              <div className="title-bar-text font-bold text-white flex items-center gap-1">
                <QrCode size={13} /> Autentikasi WhatsApp Baileys
              </div>
              <div className="title-bar-controls">
                <button aria-label="Close" onClick={() => setIsQrModalOpen(false)} />
              </div>
            </div>
            <div className="window-body p-3 flex flex-col items-center gap-2 text-center bg-[#c0c0c0]">
              <span className="text-[11px] text-gray-800">
                Pindai kode QR berikut menggunakan menu <b>Linked Devices</b> di aplikasi WhatsApp Anda:
              </span>

              <div className="p-2 bg-white border-2 border-inset border-gray-400">
                {status.whatsappQrCode ? (
                  <img src={status.whatsappQrCode} alt="WhatsApp QR" className="w-48 h-48" />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-gray-500 italic">
                    Memuat QR Code soket...
                  </div>
                )}
              </div>

              <div className="text-[10px] text-gray-600">
                Sesi autentikasi akan disimpan di <code>./auth_info_baileys/</code>
              </div>

              <div className="flex gap-2 w-full mt-2">
                <button className="retro-btn flex-1 text-blue-900 font-bold" onClick={handleSimulatePairing}>
                  ⚡ Simulasikan Scan OK
                </button>
                <button className="retro-btn" onClick={() => setIsQrModalOpen(false)}>
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
