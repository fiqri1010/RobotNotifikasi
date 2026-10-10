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

export default function App() {
  const [activeTab, setActiveTab] = useState<'monitor' | 'portals' | 'whatsapp' | 'queue' | 'config'>('portals');
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
    portals: [
      {
        id: 'ptsp_portal',
        name: 'Portal Perizinan PTSP',
        targetUrl: 'http://localhost:3000/api/mock-portal',
        enabled: true,
        authUsername: 'petugas_operator',
        authPassword: 'PasswordRahasia98!',
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
        sessionPath: './sessions/ptsp_portal/storageState.json',
        downloadsDir: './downloads/ptsp_portal',
      },
      {
        id: 'tender_portal',
        name: 'Portal Pengadaan & Tender',
        targetUrl: 'http://localhost:3000/api/mock-portal-2',
        enabled: true,
        authUsername: 'verifikator_tender',
        authPassword: 'PasswordTender98!',
        loginFormSelector: '#txt-user',
        passwordSelector: '#txt-pass',
        checkboxSelectors: ['#chk-paktaintegritas', '#chk-ketentuan'],
        submitBtnSelector: '#btn-submit-tender',
        tableRowsSelector: 'table#tender-table tbody tr.tender-row, table#tender-table tbody tr',
        idColSelector: '.col-tender-id, td:nth-child(1)',
        applicantColSelector: '.col-vendor, td:nth-child(2)',
        titleColSelector: '.col-project, td:nth-child(3)',
        picColSelector: '.col-contact, td:nth-child(4)',
        downloadBtnSelector: 'a.btn-unduh-lampiran',
        sessionPath: './sessions/tender_portal/storageState.json',
        downloadsDir: './downloads/tender_portal',
      },
    ],
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

  const [logFilter, setLogFilter] = useState<'ALL' | 'SCRAPER' | 'WHATSAPP' | 'SYSTEM'>('ALL');
  const [chatInput, setChatInput] = useState('');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isManualTriggering, setIsManualTriggering] = useState(false);
  const [isWsConnected, setIsWsConnected] = useState(false);

  // Modal Edit Portal
  const [editingPortal, setEditingPortal] = useState<PortalItem | null>(null);
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
              if (data.status) setStatus(data.status);
              if (data.logs) setLogs(data.logs);
              if (data.chats) setChats(data.chats);
              if (data.documents) setDocuments(data.documents);
            } else if (type === 'status_update' || type === 'heartbeat') {
              setStatus((prev) => ({ ...prev, ...data }));
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
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        if (data.status) setStatus(data.status);
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
    } catch {}
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        if (data.status) setStatus((prev) => ({ ...prev, ...data.status }));
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

  const handleTogglePortal = (portalId: string, currentEnabled: boolean) => {
    const nextEnabled = !currentEnabled;
    const sent = sendWsAction('TOGGLE_PORTAL', { portalId, enabled: nextEnabled });
    if (!sent) {
      fetch('/api/portals/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portalId, enabled: nextEnabled }),
      }).catch(() => null);
    }
    setStatus((prev) => ({
      ...prev,
      portals: (prev.portals || []).map((p) =>
        p.id === portalId ? { ...p, enabled: nextEnabled } : p
      ),
    }));
  };

  const openEditModal = (portal: PortalItem) => {
    setEditingPortal(portal);
    setPortalForm({
      name: portal.name,
      targetUrl: portal.targetUrl,
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

  const savePortalConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPortal) return;

    const portalId = editingPortal.id;
    const updates = { ...portalForm };

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
    alert(`Konfigurasi portal ${editingPortal.name} berhasil disimpan!`);
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

  const activePortalsCount = (status.portals || []).filter((p) => p.enabled).length;

  return (
    <div className="w-screen h-screen flex flex-col select-none overflow-hidden text-[12px] bg-[#c0c0c0]">
      {/* TITLE BAR UTAMA APLIKASI */}
      <div className="title-bar title-bar-gradient flex items-center justify-between px-2 py-1 select-none flex-shrink-0">
        <div className="title-bar-text flex items-center gap-2 font-bold tracking-wide text-white text-[12px]">
          <HardDrive size={14} className="text-yellow-300" />
          <span>Workstation Monitor - SIAP 3.0 & WhatsApp Baileys (KPU Bea Cukai Tanjung Priok)</span>
        </div>
        <div className="title-bar-controls flex gap-1">
          <button aria-label="Minimize" title="Minimize" />
          <button aria-label="Maximize" title="Maximize" />
          <button aria-label="Close" title="Close" onClick={() => alert('Workstation aktif di latar belakang.')} />
        </div>
      </div>

        {/* TOOLBAR KONTROL UTAMA & INDIKATOR KONEKSI */}
        <div className="p-1.5 bg-[#c0c0c0] border-b border-[#808080] flex flex-wrap items-center justify-between gap-2">
          {/* Tombol Kontrol Langsung */}
          <div className="flex items-center gap-1.5">
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
          </div>

          {/* Indikator Status Koneksi Real-time */}
          <div className="flex items-center gap-3 text-[11px] bg-[#dfdfdf] px-2 py-1 border border-inset border-[#808080]">
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
                {status.scraperStatus === 'RUNNING' ? 'Memindai...' : 'Round-Robin OK'}
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
          <menu role="tablist" className="flex mb-1">
            <button
              role="tab"
              aria-selected={activeTab === 'portals'}
              onClick={() => setActiveTab('portals')}
              className="font-bold flex items-center gap-1"
            >
              <Globe size={12} /> Target Portals ({activePortalsCount})
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'monitor'}
              onClick={() => setActiveTab('monitor')}
              className="font-bold flex items-center gap-1"
            >
              <Terminal size={12} /> Log Aktivitas ({logs.length})
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'whatsapp'}
              onClick={() => setActiveTab('whatsapp')}
              className="font-bold flex items-center gap-1"
            >
              <MessageSquare size={12} /> WhatsApp Mini Chat ({chats.length})
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'queue'}
              onClick={() => setActiveTab('queue')}
              className="font-bold flex items-center gap-1"
            >
              <FileText size={12} /> Antrean Dokumen ({documents.length})
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'config'}
              onClick={() => setActiveTab('config')}
              className="font-bold flex items-center gap-1"
            >
              <Settings size={12} /> Pengaturan Sistem
            </button>
          </menu>

          {/* ISI PANEL TAB */}
          <article role="tabpanel" className="flex-1 flex flex-col bg-[#c0c0c0] p-2 border-2 border-outset border-white overflow-hidden">
            {/* TAB 1: TARGET PORTALS REGISTRY & CONFIGURATOR */}
            {activeTab === 'portals' && (
              <div className="flex-1 flex flex-col gap-2 overflow-hidden">
                <div className="bg-[#dfdfdf] p-1.5 border border-[#808080] flex justify-between items-center text-[11px]">
                  <span>
                    Daftar Portal Website yang Dipantau Bergiliran (Round-Robin). Klik <b>"Atur / Edit"</b> untuk menyesuaikan URL & Selector:
                  </span>
                  <span className="font-bold text-blue-900">
                    Sesi & Berkas PDF Diisolasi Otomatis
                  </span>
                </div>

                <div className="sunken-panel flex-1 bg-white overflow-auto border-2 border-inset border-gray-400">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-[#c0c0c0] border-b border-[#808080] sticky top-0">
                        <th className="p-1 border-r border-[#808080] w-14 text-center">Status</th>
                        <th className="p-1 border-r border-[#808080]">ID Portal</th>
                        <th className="p-1 border-r border-[#808080]">Nama Portal</th>
                        <th className="p-1 border-r border-[#808080]">Target URL</th>
                        <th className="p-1 border-r border-[#808080]">Username Login</th>
                        <th className="p-1 border-r border-[#808080]">Folder Sesi & Unduhan</th>
                        <th className="p-1 text-center w-32">Pengaturan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(status.portals || []).map((portal) => (
                        <tr key={portal.id} className="border-b border-gray-200 hover:bg-[#e8f0fe]">
                          <td className="p-1 text-center border-r border-gray-300">
                            <span
                              className={`px-1 py-0.5 text-[10px] font-bold ${
                                portal.enabled ? 'bg-green-100 text-green-900 border border-green-500' : 'bg-gray-200 text-gray-600'
                              }`}
                            >
                              {portal.enabled ? 'AKTIF' : 'OFF'}
                            </span>
                          </td>
                          <td className="p-1 font-mono font-bold text-blue-900 border-r border-gray-300">
                            {portal.id}
                          </td>
                          <td className="p-1 font-semibold border-r border-gray-300">
                            {portal.name}
                          </td>
                          <td className="p-1 font-mono text-[10px] text-gray-700 border-r border-gray-300 truncate max-w-[180px]" title={portal.targetUrl}>
                            {portal.targetUrl}
                          </td>
                          <td className="p-1 font-mono text-[10px] border-r border-gray-300">
                            {portal.authUsername || '-'}
                          </td>
                          <td className="p-1 font-mono text-[10px] text-purple-900 border-r border-gray-300">
                            ./downloads/{portal.id}/
                          </td>
                          <td className="p-1 text-center">
                            <div className="flex gap-1 justify-center">
                              <button
                                className="retro-btn text-[10px] py-0.5 px-1.5 flex items-center gap-0.5 font-bold"
                                onClick={() => openEditModal(portal)}
                              >
                                <Edit3 size={10} /> Atur / Edit
                              </button>
                              <button
                                className="retro-btn text-[10px] py-0.5 px-1"
                                onClick={() => handleTogglePortal(portal.id, portal.enabled)}
                              >
                                {portal.enabled ? 'Mati' : 'Hidup'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Petunjuk Praktis di Bawah Tabel */}
                <div className="bg-[#ffffe0] border border-[#d0c000] p-1.5 text-[11px] text-[#403000] flex items-center gap-2">
                  <HelpCircle size={15} className="shrink-0 text-yellow-700" />
                  <span>
                    <b>Cara Mengatur Website Baru:</b> Buka portal target di Chrome, tekan <code>F12</code> (Inspect Element) pada input username, password, dan tabel antrean untuk melihat ID/class-nya, lalu klik tombol <b>"Atur / Edit"</b> di atas untuk memasukkan selector tersebut.
                  </span>
                </div>
              </div>
            )}

            {/* TAB 2: LOG AKTIVITAS */}
            {activeTab === 'monitor' && (
              <div className="flex-1 flex flex-col gap-2 overflow-hidden">
                <div className="grid grid-cols-4 gap-2 bg-[#dfdfdf] p-1.5 border border-[#808080]">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-700">Mode:</span>
                    <span className="font-bold font-mono text-blue-900">Round-Robin Bergiliran</span>
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

            {/* TAB 3: WHATSAPP MINI CHAT */}
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
                        <span className="text-[11px]">Soket WhatsApp Tidak Aktif</span>
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
                        onClick={() => setChatInput('cek pic 081288990011')}
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

            {/* TAB 4: ANTREAN DOKUMEN */}
            {activeTab === 'queue' && (
              <div className="flex-1 flex flex-col gap-2 overflow-hidden">
                <div className="flex justify-between items-center bg-[#dfdfdf] p-1.5 border border-[#808080]">
                  <span className="font-bold text-[11px]">
                    Tabel Antrean Dokumen Terdeteksi (Semua Portal Target)
                  </span>
                  <button className="retro-btn" onClick={triggerManualScraper}>
                    Scrape Ulang Round-Robin
                  </button>
                </div>

                <div className="sunken-panel flex-1 bg-white overflow-auto border-2 border-inset border-gray-400">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-[#c0c0c0] border-b border-[#808080] sticky top-0 text-[10.5px]">
                        <th className="p-1 border-r border-[#808080]">Sumber Portal</th>
                        <th className="p-1 border-r border-[#808080]">No / Tgl PIB</th>
                        <th className="p-1 border-r border-[#808080]">Importir</th>
                        <th className="p-1 border-r border-[#808080]">Pengurus (PPJK) & HP</th>
                        <th className="p-1 border-r border-[#808080]">Lokasi TPFT (3 Portal)</th>
                        <th className="p-1 border-r border-[#808080]">Dokumen (PIB/INV/BL)</th>
                        <th className="p-1">Waktu Deteksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documents.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-8 text-gray-500 italic">
                            Belum ada baris antrean terdeteksi. Silakan klik tombol "Start Monitoring" atau "Scrape Round-Robin".
                          </td>
                        </tr>
                      ) : (
                        documents.map((doc) => (
                          <tr key={doc.id} className="border-b border-gray-200 hover:bg-[#e8f0fe]">
                            <td className="p-1 border-r border-gray-300">
                              <span className="bg-blue-100 text-blue-900 border border-blue-400 px-1 py-0.5 text-[10px] font-bold">
                                {doc.siteName || doc.siteId || 'General'}
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
                              {doc.docs ? (
                                <div className="flex gap-1 text-[9.5px] font-mono">
                                  <span className={doc.docs.pib?.available ? 'text-green-700 font-bold' : 'text-gray-400'}>[PIB]</span>
                                  <span className={doc.docs.invPl?.available ? 'text-blue-700 font-bold' : 'text-gray-400'}>[INV/PL]</span>
                                  <span className={doc.docs.bl?.available ? 'text-purple-700 font-bold' : 'text-gray-400'}>[BL]</span>
                                </div>
                              ) : (
                                <span className="font-mono text-[10px] text-purple-900">{doc.pdfFilename}</span>
                              )}
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

            {/* TAB 5: PENGATURAN SISTEM */}
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
                          Transmisikan berkas PDF otomatis ke WhatsApp admin
                        </label>
                      </div>
                    </div>
                  </fieldset>
                </div>

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

        {/* STATUS BAR BAWAH */}
        <div className="status-bar bg-[#c0c0c0] border-t border-[#808080] flex text-[11px] p-0.5">
          <div className="status-bar-field flex-1 px-1">
            {status.isMonitoringActive
              ? `● Monitoring Multi-Website Aktif (${activePortalsCount} Portal | Siklus berikutnya: ${formatCountdown(status.nextRunInSeconds)})`
              : `○ Workstation Siaga (${activePortalsCount} Portal Terdaftar)`}
          </div>
          <div className="status-bar-field px-2">
            Model: Round-Robin
          </div>
          <div className="status-bar-field px-2">
            WhatsApp: {status.whatsappStatus}
          </div>
          <div className="status-bar-field px-2 font-mono">
            {isWsConnected ? 'WS: Live' : 'WS: Poll'}
          </div>
        </div>

      {/* MODAL EDIT / ATUR PORTAL WEB (WINDOWS 98 DIALOG) */}
      {editingPortal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="window w-[680px] max-h-[92vh] flex flex-col shadow-2xl">
            <div className="title-bar title-bar-gradient flex justify-between items-center px-1">
              <div className="title-bar-text font-bold text-white flex items-center gap-1">
                <Globe size={13} /> Pengaturan Portal Target: {editingPortal.name}
              </div>
              <div className="title-bar-controls">
                <button aria-label="Close" onClick={() => setEditingPortal(null)} />
              </div>
            </div>

            <form onSubmit={savePortalConfig} className="window-body p-2 flex flex-col gap-2 overflow-y-auto bg-[#c0c0c0]">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {/* Kolom Kiri: Target URL & Kredensial */}
                <fieldset className="border border-[#808080] p-2 bg-white">
                  <legend className="font-bold">1. Akses Portal & Form Login</legend>
                  <div className="space-y-1.5">
                    <div>
                      <label className="block font-semibold">Nama Label Portal:</label>
                      <input
                        type="text"
                        value={portalForm.name || ''}
                        onChange={(e) => setPortalForm({ ...portalForm, name: e.target.value })}
                        className="w-full px-1 border-2 border-inset border-gray-300"
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
                        required
                      />
                    </div>
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
                        placeholder="a.btn-download atau a[href*='download']"
                      />
                    </div>
                  </div>
                </fieldset>
              </div>

              <div className="bg-[#e8f0fe] p-1.5 border border-[#80a0e0] text-[10.5px] text-[#002060]">
                <b>Catatan:</b> Sesi login website ini akan otomatis diamankan di <code>./sessions/{editingPortal.id}/storageState.json</code> dan seluruh berkas PDF akan diunduh ke <code>./downloads/{editingPortal.id}/</code>.
              </div>

              <div className="flex justify-end gap-2 pt-1 border-t border-[#808080]">
                <button type="submit" className="retro-btn bg-[#000080] text-black font-bold">
                  Simpan Konfigurasi Portal
                </button>
                <button type="button" className="retro-btn" onClick={() => setEditingPortal(null)}>
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
