# Workstation 98 - Automation Monitor Desktop

Aplikasi desktop bot monitoring mandiri dengan antarmuka klasik **Windows 98** (`98.css`), mesin web scraping tangguh berbasis **Playwright**, dan pengontrol komunikasi dua arah **WhatsApp** berbasis **Baileys**.

---

## 📁 Struktur Direktori Proyek

```text
workstation-98/
├── config.json                     # Konfigurasi sistem (URL target, kredensial, interval, PIC)
├── index.html                      # Entry point antarmuka Windows 98 (98.css)
├── package.json                    # Dependensi (playwright, baileys, express, qrcode, dll)
├── server.ts                       # Server utama Node.js Express & API controller
├── tsconfig.json                   # Konfigurasi TypeScript
├── vite.config.ts                  # Bundler Vite dengan Express middleware plugin
├── downloads/                      # Direktori arsip berkas PDF yang diunduh
├── sessions/
│   ├── storageState.json           # Sesi login browser tersimpan (Playwright)
│   └── baileys_auth/               # Kunci otentikasi multi-device WhatsApp Baileys
├── scripts/
│   ├── test-scraper.ts             # Skrip CLI pengujian mandiri Playwright
│   └── test-whatsapp.ts            # Skrip CLI pengujian mandiri Baileys WhatsApp
└── src/
    ├── App.tsx                     # GUI Windows 98 (Dashboard, Terminal, Mini Chat, Taskbar)
    ├── index.css                   # Tema retro Windows 98, palet teal, bevel 3D, sunken box
    ├── main.tsx                    # Entry point React
    ├── server/
    │   └── apiRouter.ts            # Router API Express, SSE stream, & mock target portal
    └── services/
        ├── configManager.ts        # Pengelola konfigurasi terpusat
        ├── eventBus.ts             # Central EventBus decoupler (mencegah locking proses)
        ├── monitoringScheduler.ts  # Penjadwal interval monitoring otomatis (default 3 menit)
        ├── scraperEngine.ts        # Mesin scraping Playwright, login & unduh PDF
        └── whatsappEngine.ts       # Soket Baileys, pembuat QR code, & pengirim dokumen
```

---

## ⚡ Alur Komunikasi Data Asinkron

```text
┌────────────────────────────────────────────────────────┐
│             GUI Antarmuka (98.css)                     │
│  - Tombol Kontrol (Start / Stop / Scrape Now)          │
│  - Indikator Status & Live Clock                       │
│  - Terminal Log Aktivitas                              │
│  - Mini Chat Dua Arah & QR Code Scanner                │
└───────────────▲──────────────────────────┬─────────────┘
                │                          │
         SSE (/api/events)            REST API (/api/*)
                │                          │
┌───────────────┴──────────────────────────▼─────────────┐
│                 Controller Server (Express)            │
│               Central EventBus (EventEmitter)          │
└───────────────▲──────────────────────────┬─────────────┘
                │                          │
     [Event / Notifikasi]         [Triggers & Scheduler]
                │                          │
   ┌────────────┴─────────────┐ ┌──────────▼────────────┐
   │    WhatsApp Controller   │ │   Playwright Scraper   │
   │         (Baileys)        │ │        (Chromium)      │
   │  - Socket Multi-Device   │ │  - Sesi storageState   │
   │  - Transmisi Dokumen PDF │ │  - Ekstraksi Tabel     │
   │  - Eksekusi Perintah Bot │ │  - Unduh Berkas PDF    │
   └──────────────────────────┘ └───────────────────────┘
```

---

## 🛠️ Panduan Pengujian & Eksekusi Lokal di VS Code

### 1. Instalasi Dependensi
```bash
npm install
```

Jika Playwright belum mengunduh browser Chromium pada sistem Windows lokal:
```bash
npx playwright install chromium
```

### 2. Pengujian Mandiri Mesin Scraper (Tanpa GUI)
Untuk memastikan Playwright dapat mengisi form login, mencentang 2 checkbox, menyimpan `storageState.json`, dan mengunduh berkas PDF ke `./downloads/`:
```bash
npm run test:scraper
```

### 3. Pengujian Mandiri WhatsApp Baileys (Tanpa GUI)
Untuk memeriksa inisialisasi soket, QR code, dan simulasi penanganan pesan:
```bash
npm run test:whatsapp
```

### 4. Menjalankan Aplikasi Workstation 98 Penuh
Jalankan dev server yang menyatukan GUI Windows 98 dan API controller:
```bash
npm run dev
```
Buka browser di `http://localhost:3000`.

Atau jalankan server Node.js standalone:
```bash
npm run server
```

---

## 📱 Perintah WhatsApp yang Didukung

Kirim pesan berikut dari WhatsApp Anda ke bot Workstation 98:
- `!status` atau `cek status` : Memeriksa kondisi scheduler, Playwright, dan dokumen.
- `!ping` : Memeriksa responsivitas soket bot.
- `!check` : Memicu inspeksi scraping halaman web secara langsung.
