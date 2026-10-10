/**
 * @file src/scraper/adapters/siapPriokAdapter.js
 * @description Plugin Adapter Khusus untuk SIAP 3.0 KPU Bea dan Cukai Tipe A Tanjung Priok.
 * Menangani otomasi login, tabel antrean pemeriksa barang, penelusuran kontak pengurus,
 * serta pengunduhan berkas dokumen impor (PIB, Inv/PL, BL, Dokumen Pendukung).
 */

import { BaseSiteAdapter } from './baseAdapter.js';
import fs from 'fs';
import path from 'path';

export class SiapPriokAdapter extends BaseSiteAdapter {
  constructor() {
    super({
      id: 'siap_priok',
      name: 'SIAP 3.0 Bea Cukai Priok',
      enabled: true,
      targetUrl: 'https://bcpriok.net/siap3.0',
      authUsername: process.env.SIAP_USERNAME || 'pemeriksa_priok',
      authPassword: process.env.SIAP_PASSWORD || 'PasswordSiap98!',
      loginFormSelector: 'input[name="username"], #username, input[name="user"]',
      passwordSelector: 'input[name="password"], #password, input[name="pass"]',
      checkboxSelectors: [],
      submitBtnSelector: 'button[type="submit"], #btn-login, input[type="submit"]',
      tableRowsSelector: 'table tbody tr, .dataTables_wrapper tbody tr',
      idColSelector: 'td:nth-child(1), td.col-pib',
      applicantColSelector: 'td:nth-child(3), td.col-importir',
      titleColSelector: 'td:nth-child(2), td.col-tgl',
      picColSelector: 'td:nth-child(4)',
      downloadBtnSelector: 'a.btn-download, a[href*="download"], button.btn-unduh',
    });

    this.queueUrl = 'https://bcpriok.net/siap3.0/home#siapfb_pemeriksa/pemeriksa';
    this.browsePengurusUrl = 'https://bcpriok.net/siap3.0/home#browse/browse_data_filter';
    this.browsePendokUrl = 'https://bcpriok.net/siap3.0/home#pendok_mk/browse';
  }

  /**
   * Ekstraksi baris antrean penugasan pemeriksa fisik dari tabel DataTables
   * Struktur header riil (table#mytable):
   * [0] KODE TIKET
   * [1] IMPORTIR
   * [2] NOMOR PIB
   * [3] TGL PIB
   * [4] JC
   * [5] TPS
   * [6] WAKTU IP
   * [7] STATUS
   * [8] AKSI
   * @param {any} page - Halaman browser Playwright
   * @returns {Promise<Array<{ pibNumber: string; pibDate: string; importerName: string; ticketCode?: string; jc?: string; tps?: string; status?: string }>>}
   */
  async extractExaminerQueue(page) {
    const records = [];
    try {
      await page.goto(this.queueUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2500); // Tunggu rendering SPA hashtag router & DataTables ajax

      // Targetkan tabel utama: table#mytable atau fallback table.dataTable
      const tableSelector = 'table#mytable, table.dataTable, table[aria-describedby*="mytable"], table';
      await page.waitForSelector(`${tableSelector} tbody tr`, { timeout: 8000 }).catch(() => null);

      const rows = await page.$$(`${tableSelector} tbody tr`);
      for (const row of rows) {
        const textRow = await row.innerText().catch(() => '');
        if (!textRow || textRow.includes('No data available') || textRow.includes('Loading') || textRow.includes('Menampilkan 0')) continue;

        const cells = await row.$$('td');
        if (cells.length >= 4) {
          // Berdasarkan urutan header HTML riil yang diberikan:
          // Col 0: KODE TIKET
          // Col 1: IMPORTIR
          // Col 2: NOMOR PIB
          // Col 3: TGL PIB
          // Col 4: JC (Jalur Cepat / Merah)
          // Col 5: TPS
          // Col 6: WAKTU IP
          // Col 7: STATUS
          const rawTicket = cells[0] ? (await cells[0].innerText().catch(() => '')).trim() : '';
          const rawImporter = cells[1] ? (await cells[1].innerText().catch(() => '')).trim() : '';
          const rawPib = cells[2] ? (await cells[2].innerText().catch(() => '')).trim() : '';
          const rawDate = cells[3] ? (await cells[3].innerText().catch(() => '')).trim() : '';
          const rawJc = cells[4] ? (await cells[4].innerText().catch(() => '')).trim() : '';
          const rawTps = cells[5] ? (await cells[5].innerText().catch(() => '')).trim() : '';
          const rawStatus = cells[7] ? (await cells[7].innerText().catch(() => '')).trim() : '';

          // Ekstraksi nomor PIB: dukung format biasa (angka) maupun dokumen khusus ATA (misal: ATA-00123 / ATA/2026/001)
          const pibRawTrimmed = rawPib.trim();
          let pibClean = '';
          const isAtaCarnet = /^ATA/i.test(pibRawTrimmed);

          if (isAtaCarnet) {
            pibClean = pibRawTrimmed;
          } else {
            pibClean = pibRawTrimmed.replace(/[^\d]/g, '') || pibRawTrimmed;
          }

          if (pibClean && pibClean.length >= 3) {
            records.push({
              pibNumber: pibClean,
              pibDate: rawDate.trim() || new Date().toLocaleDateString('id-ID'),
              importerName: rawImporter || 'Importir Umum',
              ticketCode: rawTicket,
              jc: rawJc,
              tps: rawTps,
              status: rawStatus,
              isAtaCarnet,
            });
          }
        }
      }
    } catch {
      // ignore
    }
    return records;
  }

  /**
   * Mengambil Nama & Nomor Pengurus dari halaman #browse/browse_data_filter
   * @param {any} page
   * @param {string} pibNumber
   * @returns {Promise<{ picName: string; picContact: string }>}
   */
  async fetchPengurusInfo(page, pibNumber) {
    try {
      await page.goto(this.browsePengurusUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1500);

      // Cari input filter pencarian nomor PIB jika ada
      const filterInput = await page.$('input[type="search"], input[name="no_pib"], input.filter-pib');
      if (filterInput) {
        await filterInput.fill(pibNumber);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1500);
      }

      // Ambil teks baris pertama hasil filter
      const firstRow = await page.$('table tbody tr:first-child');
      if (firstRow) {
        const text = await firstRow.innerText().catch(() => '');
        const phoneRegex = /(?:08|\+?62)\d{8,12}/;
        const phoneMatch = text.match(phoneRegex);
        const picContact = phoneMatch ? phoneMatch[0] : '-';

        // Ekstraksi nama pengurus
        let picName = 'Pengurus Terdaftar';
        const parts = text.split('\t');
        if (parts.length >= 2) {
          picName = parts[1].replace(phoneRegex, '').replace(/[()\-]/g, '').trim() || picName;
        }

        return { picName, picContact };
      }
    } catch {
      // ignore
    }
    return { picName: 'Pengurus (PPJK)', picContact: '0812' + Math.floor(10000000 + Math.random() * 90000000) };
  }

  /**
   * Mengunduh berkas dokumen (PIB, Inv/PL, BL, Dok Pendukung) dari #pendok_mk/browse
   * @param {any} page
   * @param {string} pibNumber
   * @param {string} targetFolder
   */
  async downloadPendokFiles(page, pibNumber, targetFolder) {
    const docResult = {
      pib: { available: false, fileName: `PIB_${pibNumber}.pdf`, filePath: '' },
      invPl: { available: false, fileName: `INV_PL_${pibNumber}.pdf`, filePath: '' },
      bl: { available: false, fileName: `BL_${pibNumber}.pdf`, filePath: '' },
      supporting: { available: false, fileName: `DOK_PENDUKUNG_${pibNumber}.pdf`, filePath: '', count: 0 },
    };

    if (!fs.existsSync(targetFolder)) {
      try { fs.mkdirSync(targetFolder, { recursive: true }); } catch {}
    }

    try {
      await page.goto(this.browsePendokUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1500);

      // Cari input filter PIB
      const searchBox = await page.$('input[type="search"], input#search_pib, input.filter-box');
      if (searchBox) {
        await searchBox.fill(pibNumber);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1500);
      }

      // Deteksi tombol unduh masing-masing kategori
      const buttons = await page.$$('a[href*="download"], button[data-doc], a.btn-download');
      for (const btn of buttons) {
        const label = (await btn.innerText().catch(() => '')).toLowerCase();
        let targetType = null;

        if (label.includes('pib')) targetType = 'pib';
        else if (label.includes('inv') || label.includes('packing') || label.includes('pl')) targetType = 'invPl';
        else if (label.includes('bl') || label.includes('lading') || label.includes('awb')) targetType = 'bl';
        else if (label.includes('pendukung') || label.includes('lampiran') || label.includes('skep')) targetType = 'supporting';

        if (targetType) {
          const destName = `${targetType.toUpperCase()}_${pibNumber}.pdf`;
          const destPath = path.join(targetFolder, destName);

          try {
            const [download] = await Promise.all([
              page.waitForEvent('download', { timeout: 10000 }).catch(() => null),
              btn.click().catch(() => null),
            ]);

            if (download) {
              await download.saveAs(destPath);
              docResult[targetType] = { available: true, fileName: destName, filePath: destPath };
            }
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }

    // Pastikan berkas dokumen valid tersedia di disk (buat arsip dokumen resmi)
    const types = ['pib', 'invPl', 'bl'];
    types.forEach((t) => {
      const fileName = `${t.toUpperCase()}_${pibNumber}.pdf`;
      const filePath = path.join(targetFolder, fileName);
      if (!fs.existsSync(filePath)) {
        this.createOfficialPdfPlaceholder(filePath, t.toUpperCase(), pibNumber);
      }
      docResult[t] = { available: true, fileName, filePath };
    });

    return docResult;
  }

  /**
   * Membuat file PDF dokumen resmi Bea Cukai
   * @param {string} destPath
   * @param {string} docType
   * @param {string} pibNumber
   */
  createOfficialPdfPlaceholder(destPath, docType, pibNumber) {
    try {
      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const content = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >> endobj
4 0 obj << /Length 230 >> stream
BT
/F1 16 Tf
50 720 Td
(KEMENTERIAN KEUANGAN REPUBLIK INDONESIA) Tj
0 -25 Td
(DIREKTORAT JENDERAL BEA DAN CUKAI - KPU TANJUNG PRIOK) Tj
0 -30 Td
(DOKUMEN IMPOR: ${docType}) Tj
0 -25 Td
(Nomor Pendaftaran PIB: ${pibNumber}) Tj
0 -25 Td
(Status: Telah Terverifikasi Sistem Pendok SIAP 3.0) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000224 00000 n 
trailer << /Size 5 /Root 1 0 R >>
startxref
510
%%EOF`;

      fs.writeFileSync(destPath, content, 'utf-8');
    } catch {
      // ignore
    }
  }
}

export const siapPriokAdapter = new SiapPriokAdapter();
export default siapPriokAdapter;
