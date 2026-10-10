# Cetak Biru Otomasi Monitoring Pemeriksa Barang Impor (SIAP 3.0 Bea Cukai Priok & 3 Portal TPFT)

Rencana ini merinci arsitektur, alur scraper multi-tahap, cross-matching status lokasi fisik kontainer, pengunduhan dokumen impor, dan transmisi notifikasi terpadu ke WhatsApp pribadi pemeriksa.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Keputusan dan parameter operasional resmi yang telah dikonfirmasi:
> - **Kunci Pencocokan (Cross-Check Key):** Kombinasi **Nomor PIB** dan **Tanggal PIB**.
> - **Alur Unduh Berkas:** Halaman `pendok_mk/browse` dengan melakukan filter/pencarian Nomor PIB untuk mengunduh PIB, Inv/PL, BL, dan Dokumen Pendukung.
> - **Sumber Data Pengurus:** Sub-halaman `#browse/browse_data_filter` untuk mengambil Nama Pengurus dan Nomor Telepon/WhatsApp Pengurus.
> - **Format Notifikasi WhatsApp:** Standar laporan tugas harian pemeriksa impor dengan rincian berkas dokumen dan lokasi kesiapan fisik kontainer.

---

## 1. Overview & Core Workflow

Aplikasi bertindak sebagai asisten monitoring otonom bagi Pemeriksa Barang Impor di KPU Bea dan Cukai Tipe A Tanjung Priok.

### Alur Kerja 4 Tahap Otomatis:
```text
┌────────────────────────────────────────────────────────────────────────┐
│  TAHAP 1: SIAP 3.0 - Pengecekan Antrean Tugas Pemeriksa                │
│  - URL: https://bcpriok.net/siap3.0/home#siapfb_pemeriksa/pemeriksa    │
│  - Ekstraksi: Nomor PIB, Tanggal PIB, Nama Importir                    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Nomor PIB & Tanggal PIB)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  TAHAP 2: SIAP 3.0 - Ekstraksi Kontak Pengurus & Unduh Berkas          │
│  - Data Pengurus : #browse/browse_data_filter -> Nama & No Kontak      │
│  - Dokumen       : #pendok_mk/browse -> Unduh PIB, Inv/PL, BL, Dokumen │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  TAHAP 3: Cross-Check Status Lokasi Fisik di 3 Portal TPFT             │
│  1. TPFT Graha Segara / CDC : http://103.130.242.88/tpft/MON_SIAP_PERIKSA/
│  2. BOS MTI / IPC           : https://bos.multiterminal.co.id/tpk_ipc/ 
│  3. SIAP 3.0 Antrean PKB    : https://bcpriok.net/siap3.0/antrian_pkb  
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  TAHAP 4: Konsolidasi & Notifikasi WhatsApp Baileys                    │
│  - Transmisi teks berformat standar                                    │
│  - Transmisi lampiran dokumen PDF yang berhasil diunduh                │
│  - Update realtime ke GUI Windows 98                                   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Rincian Modul & Struktur Berkas

### A. Modul Adapter SIAP 3.0 (`src/scraper/adapters/siapPriokAdapter.js`)
Menggantikan adapter pengujian sebelumnya untuk menangani portal riil `bcpriok.net`:
- **Login & Sesi:** Mengunjungi `https://bcpriok.net/siap3.0`, mengisi akun pemeriksa, mengamankan sesi ke `./sessions/siap_priok/storageState.json`.
- **Ekstraksi Antrean:** Membuka hash URL `#siapfb_pemeriksa/pemeriksa`, membaca baris penugasan baru.
- **Ekstraksi Kontak Pengurus:** Membuka hash URL `#browse/browse_data_filter`, mencari data berdasarkan No PIB untuk mendapatkan Nama Pengurus dan Nomor HP/Kontak.
- **Unduh Dokumen Pendok:** Membuka hash URL `#pendok_mk/browse`, memasukkan filter No PIB, lalu mengunduh:
  - Berkas PIB (`PIB_[NO_PIB].pdf`)
  - Berkas Invoice & Packing List (`INV_PL_[NO_PIB].pdf`)
  - Berkas Bill of Lading (`BL_[NO_PIB].pdf`)
  - Dokumen Pendukung tambahan jika tersedia.

### B. Modul Cross-Checker TPFT (`src/scraper/crossCheckTpft.js`)
Modul otonom yang bertugas mencari posisi kesiapan barang di 3 portal:
1. **Portal A (Graha Segara / CDC / TPFT):** `http://103.130.242.88/tpft/MON_SIAP_PERIKSA/`
   - Melakukan query No PIB / Tanggal PIB -> mengekstrak status (misal: *Siap Periksa / Belum Tarik / Blok Yard / Posisi Behandle*).
2. **Portal B (BOS MTI / IPC TPK):** `https://bos.multiterminal.co.id/tpk_ipc/cgis/application.php/display/list_antrian`
   - Melakukan lookup data antrean TPS / TPK.
3. **Portal C (SIAP 3.0 PKB):** `https://bcpriok.net/siap3.0/antrian_pkb`
   - Melakukan query antrean permohonan kesiapan barang.
4. **Hasil Pencocokan:** Menghasilkan string terpadu, contoh:
   - *"TPFT Graha Segara (Siap Periksa - Blok B4) | PKB Terbit"* atau
   - *"BOS IPC (Antrean Penarikan Kontainer)"* atau
   - *"Belum Terjadwal di TPFT"*.

### C. Modul Formatter & Transmisi WhatsApp (`src/whatsapp/formatters.js`)
Memformat pesan sesuai spesifikasi persis yang diminta:
```text
Nomor PIB: {noPib}
Tanggal PIB: {tglPib}
Importir: {namaImportir}
Nama Pengurus: {namaPengurus}
Nomor Pengurus: {nomorPengurus}
Lokasi / Kesiapan Barang: {lokasiTpft}
Dokumen:
- PIB: {statusPib}
- Inv/PL: {statusInvPl}
- BL: {statusBl}
- Dokumen Pendukung: {statusDokPendukung}
```
Lalu memanggil `baileysClient.sendPdfDocument()` untuk mengirimkan dokumen PDF yang berhasil diunduh dari folder `./downloads/siap_priok/{noPib}/`.

---

## 3. Penyesuaian Antarmuka GUI Windows 98

1. **Dashboard & Tabel Antrean:**
   - Menampilkan kolom khusus: **No PIB**, **Tgl PIB**, **Importir**, **Pengurus & Kontak**, **Status Lokasi TPFT**, dan **Status Dokumen (PIB/INV/BL)**.
2. **Tab Konfigurasi Akun SIAP 3.0:**
   - Form kredensial aman akun SIAP 3.0 (Username NIP/Petugas & Password).
   - Opsi interval pengecekan (default 3 menit).
   - Tombol "Uji Cek Lokasi TPFT" untuk mencoba query mandiri ke portal TPFT.

---

## 4. Rencana Tahapan Eksekusi (Milestones)

1. **Milestone 1 - Implementasi Adapter SIAP 3.0 (`siapPriokAdapter.js`)**:
   - Menangani login SPA (Single Page Application dengan hashtag router `#siapfb_pemeriksa/pemeriksa`).
   - Menyimpan session cookie ke `./sessions/siap_priok/storageState.json`.
   - Mengambil data pengurus dari `#browse/browse_data_filter` dan dokumen dari `#pendok_mk/browse`.
2. **Milestone 2 - Implementasi Cross-Checker TPFT (`crossCheckTpft.js`)**:
   - Logika query HTTP/HTML scraper ke 3 portal lokasi (`103.130.242.88`, `bos.multiterminal.co.id`, `antrian_pkb`).
   - Penyatuan status lokasi fisik kontainer.
3. **Milestone 3 - Integrasi Transmisi WhatsApp & Multi-Attachment**:
   - Pembaruan template caption dan pengiriman berantai dokumen PDF (PIB, Inv/PL, BL) ke WhatsApp pribadi pengguna.
4. **Milestone 4 - Integrasi GUI Windows 98 & CLI Verification**:
   - Pembaruan tabel antrean di `src/App.tsx` dengan kolom PIB, Importir, dan TPFT.
   - Penambahan skrip pengujian offline/online di `scripts/test-scraper.ts` untuk verifikasi menyeluruh.
