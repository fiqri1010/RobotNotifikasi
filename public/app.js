/**
 * @file public/app.js
 * @description Client-side WebSocket controller murni untuk antarmuka Windows 98.
 * Menangani stream log aktivitas, status LED indikator, pemindaian QR code,
 * dan perenderan riwayat obrolan dua arah dengan auto-scroll.
 */

(function () {
  let ws = null;
  let status = {
    isMonitoringActive: false,
    nextRunInSeconds: 180,
    scraperStatus: 'IDLE',
    browserSessionSaved: false,
    whatsappStatus: 'DISCONNECTED',
    whatsappQrCode: null,
  };

  const logsEl = document.getElementById('log-terminal');
  const chatContainerEl = document.getElementById('chat-history');
  const queueTableBodyEl = document.querySelector('#queue-table tbody');
  const qrImageEl = document.getElementById('qr-image');
  const qrModalEl = document.getElementById('qr-modal');

  const ledScheduler = document.getElementById('led-scheduler');
  const ledBrowser = document.getElementById('led-browser');
  const ledWhatsapp = document.getElementById('led-whatsapp');

  const textScheduler = document.getElementById('text-scheduler');
  const textBrowser = document.getElementById('text-browser');
  const textWhatsapp = document.getElementById('text-whatsapp');

  const btnStart = document.getElementById('btn-start');
  const btnStop = document.getElementById('btn-stop');
  const btnScrape = document.getElementById('btn-scrape');
  const btnPairWa = document.getElementById('btn-pair-wa');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const btnClearLogs = document.getElementById('btn-clear-logs');

  function connectWs() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    ws = new WebSocket(wsUrl);

    ws.onopen = function () {
      appendLog('SYSTEM', 'info', 'Terhubung ke server controller via WebSocket.');
    };

    ws.onmessage = function (event) {
      try {
        const packet = JSON.parse(event.data);
        const { type, data } = packet;

        if (type === 'init') {
          if (data.status) updateStatusUI(data.status);
          if (data.logs) renderInitialLogs(data.logs);
          if (data.chats) renderInitialChats(data.chats);
          if (data.documents) renderInitialDocs(data.documents);
        } else if (type === 'status_update' || type === 'heartbeat') {
          updateStatusUI(data);
        } else if (type === 'log') {
          appendLog(data.source, data.level, data.message, data.timestamp);
        } else if (type === 'chat') {
          appendChat(data);
        } else if (type === 'document') {
          prependDoc(data);
        } else if (type === 'qr') {
          if (data.qrDataUrl) {
            qrImageEl.src = data.qrDataUrl;
            qrModalEl.style.display = 'flex';
          }
        } else if (type === 'clear_logs') {
          if (logsEl) logsEl.innerHTML = '';
        }
      } catch (err) {
        console.error('Error parsing WS message:', err);
      }
    };

    ws.onclose = function () {
      appendLog('SYSTEM', 'warn', 'Koneksi WebSocket terputus. Mencoba rekoneksi dalam 3 detik...');
      setTimeout(connectWs, 3000);
    };

    ws.onerror = function () {
      ws.close();
    };
  }

  function sendAction(action, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action, data }));
    }
  }

  function updateStatusUI(newStatus) {
    status = { ...status, ...newStatus };

    // 1. Scheduler LED
    if (status.isMonitoringActive) {
      if (ledScheduler) ledScheduler.className = 'led-indicator led-green';
      const mins = Math.floor((status.nextRunInSeconds || 0) / 60);
      const secs = (status.nextRunInSeconds || 0) % 60;
      const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      if (textScheduler) textScheduler.innerText = `AKTIF (${formatted})`;
      if (btnStart) btnStart.disabled = true;
      if (btnStop) btnStop.disabled = false;
    } else {
      if (ledScheduler) ledScheduler.className = 'led-indicator led-red';
      if (textScheduler) textScheduler.innerText = 'STOPPED';
      if (btnStart) btnStart.disabled = false;
      if (btnStop) btnStop.disabled = true;
    }

    // 2. Browser LED
    if (status.scraperStatus === 'RUNNING') {
      if (ledBrowser) ledBrowser.className = 'led-indicator led-yellow';
      if (textBrowser) textBrowser.innerText = 'Running...';
    } else if (status.browserSessionSaved) {
      if (ledBrowser) ledBrowser.className = 'led-indicator led-green';
      if (textBrowser) textBrowser.innerText = 'storageState.json OK';
    } else {
      if (ledBrowser) ledBrowser.className = 'led-indicator led-gray';
      if (textBrowser) textBrowser.innerText = 'Siap Login';
    }

    // 3. WhatsApp LED
    if (status.whatsappStatus === 'CONNECTED') {
      if (ledWhatsapp) ledWhatsapp.className = 'led-indicator led-green';
      if (textWhatsapp) textWhatsapp.innerText = 'Terhubung';
      if (qrModalEl) qrModalEl.style.display = 'none';
    } else if (status.whatsappStatus === 'SCAN_QR') {
      if (ledWhatsapp) ledWhatsapp.className = 'led-indicator led-yellow';
      if (textWhatsapp) textWhatsapp.innerText = 'Scan QR';
      if (status.whatsappQrCode && qrImageEl) {
        qrImageEl.src = status.whatsappQrCode;
        if (qrModalEl) qrModalEl.style.display = 'flex';
      }
    } else {
      if (ledWhatsapp) ledWhatsapp.className = 'led-indicator led-red';
      if (textWhatsapp) textWhatsapp.innerText = 'Disconnected';
    }
  }

  function appendLog(source, level, message, timestamp) {
    if (!logsEl) return;
    const timeStr = timestamp || new Date().toLocaleTimeString('id-ID');
    const div = document.createElement('div');
    div.style.padding = '1px 0';

    let colorClass = '#00ff66';
    if (level === 'error') colorClass = '#ff5555';
    if (level === 'warn') colorClass = '#ffff55';
    if (level === 'success') colorClass = '#55ff55';

    let srcColor = '#aaa';
    if (source === 'SCRAPER') srcColor = '#ffd700';
    if (source === 'WHATSAPP') srcColor = '#00ffff';
    if (source === 'SCHEDULER') srcColor = '#ff77ff';

    div.innerHTML = `<span style="color:#888;">[${timeStr}]</span> <span style="color:${srcColor}; font-weight:bold;">[${source}]</span> <span style="color:${colorClass};">${message}</span>`;
    logsEl.insertBefore(div, logsEl.firstChild);
  }

  function renderInitialLogs(logs) {
    if (!logsEl) return;
    logsEl.innerHTML = '';
    logs.forEach((l) => appendLog(l.source, l.level, l.message, l.timestamp));
  }

  function appendChat(chat) {
    if (!chatContainerEl) return;
    const div = document.createElement('div');
    const isIncoming = chat.direction === 'INCOMING';

    div.style.maxWidth = '85%';
    div.style.padding = '6px 8px';
    div.style.marginBottom = '6px';
    div.style.borderRadius = '2px';
    div.style.border = '1px solid #808080';
    div.style.boxShadow = '1px 1px 0 #404040';

    if (isIncoming) {
      div.style.background = '#ffffff';
      div.style.alignSelf = 'flex-start';
    } else {
      div.style.background = '#d8f5c4';
      div.style.alignSelf = 'flex-end';
      div.style.border = '1px solid #70a060';
    }

    let attachmentHtml = '';
    if (chat.hasAttachment) {
      attachmentHtml = `<div style="margin-top:4px; padding-top:4px; border-top:1px solid #aaa; font-family:monospace; font-size:10.5px; color:#000080;">📄 Berkas PDF: ${chat.attachmentName}</div>`;
    }

    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; font-size:10px; color:#666; margin-bottom:2px;">
        <span style="font-weight:bold;">${isIncoming ? `Dari: ${chat.sender}` : 'Workstation Bot'}</span>
        <span>${chat.timestamp || ''}</span>
      </div>
      <div style="font-size:11.5px; white-space:pre-wrap; word-break:break-word;">${chat.text || ''}</div>
      ${attachmentHtml}
    `;

    chatContainerEl.appendChild(div);
    chatContainerEl.scrollTop = chatContainerEl.scrollHeight;
  }

  function renderInitialChats(chats) {
    if (!chatContainerEl) return;
    chatContainerEl.innerHTML = '';
    chats.forEach((c) => appendChat(c));
    chatContainerEl.scrollTop = chatContainerEl.scrollHeight;
  }

  function prependDoc(doc) {
    if (!queueTableBodyEl) return;
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #ddd';
    tr.innerHTML = `
      <td style="padding:3px; font-family:monospace; font-weight:bold; color:#000080;">${doc.queueNo}</td>
      <td style="padding:3px;">${doc.applicantName}</td>
      <td style="padding:3px; font-weight:bold;">${doc.documentTitle}</td>
      <td style="padding:3px;">${doc.picName} <span style="font-family:monospace; color:#008000;">(${doc.picContact})</span></td>
      <td style="padding:3px; font-family:monospace; color:#800080;">${doc.pdfFilename}</td>
      <td style="padding:3px; color:#555;">${doc.detectedAt}</td>
    `;
    queueTableBodyEl.insertBefore(tr, queueTableBodyEl.firstChild);
  }

  function renderInitialDocs(docs) {
    if (!queueTableBodyEl) return;
    queueTableBodyEl.innerHTML = '';
    docs.forEach((d) => prependDoc(d));
  }

  // Event Listeners Tombol GUI
  if (btnStart) btnStart.addEventListener('click', () => sendAction('START_MONITORING'));
  if (btnStop) btnStop.addEventListener('click', () => sendAction('STOP_MONITORING'));
  if (btnScrape) btnScrape.addEventListener('click', () => sendAction('TRIGGER_SCRAPE'));
  if (btnPairWa) btnPairWa.addEventListener('click', () => {
    sendAction('CONNECT_WHATSAPP');
    if (qrModalEl) qrModalEl.style.display = 'flex';
  });

  if (btnClearLogs) btnClearLogs.addEventListener('click', () => sendAction('CLEAR_LOGS'));

  if (chatForm) {
    chatForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const msg = chatInput.value.trim();
      if (!msg) return;
      chatInput.value = '';
      sendAction('SEND_CHAT', { message: msg });
    });
  }

  // Tombol pintas perintah
  document.querySelectorAll('.btn-quick-cmd').forEach((btn) => {
    btn.addEventListener('click', function () {
      const cmd = this.getAttribute('data-cmd');
      if (cmd && chatInput) {
        chatInput.value = cmd;
        chatInput.focus();
      }
    });
  });

  // Modal close buttons
  document.querySelectorAll('.btn-close-modal').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (qrModalEl) qrModalEl.style.display = 'none';
    });
  });

  document.getElementById('btn-sim-pair')?.addEventListener('click', () => {
    sendAction('SIMULATE_PAIRING', {});
    if (qrModalEl) qrModalEl.style.display = 'none';
  });

  // Start WS connection
  connectWs();
})();
