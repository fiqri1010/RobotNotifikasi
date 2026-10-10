/**
 * Skrip Uji Mandiri Playwright Scraper Multi-Website (Workstation 98)
 * Menguji modul: src/scraper/jobRunner.js dan src/scraper/registry.js
 * Jalankan via terminal: npm run test:scraper (atau: npx tsx scripts/test-scraper.ts)
 */

import { jobRunner } from '../src/scraper/jobRunner.js';
import { adapterRegistry } from '../src/scraper/registry.js';
import fs from 'fs';
import path from 'path';

async function runMultiSiteScraperTest() {
  console.log('====================================================');
  console.log(' WORKSTATION 98 - MULTI-WEBSITE SCRAPER TEST SUITE  ');
  console.log(' Architecture: Plugin Adapter Registry & Round-Robin');
  console.log('====================================================');

  const status = jobRunner.getStatus();
  console.log(`[1] Status Plugin Adapter Registry:`);
  console.log(`    • Total Portal Terdaftar : ${status.allPortalsCount} website`);
  console.log(`    • Portal Aktif Saat Ini  : ${status.activePortalsCount} website`);

  const activePortals = adapterRegistry.getActive();
  activePortals.forEach((portal, idx) => {
    console.log(`    [Portal ${idx + 1}] ID: ${portal.id} | Nama: ${portal.name}`);
    console.log(`        Target URL   : ${portal.targetUrl}`);
    console.log(`        Folder Sesi  : ${portal.sessionPath}`);
    console.log(`        Folder Unduh : ${portal.downloadsDir}`);
  });

  console.log('\n[2] Memulai Siklus Round-Robin runOnce()...');
  const result = await jobRunner.runOnce();

  console.log('\n[3] Hasil Eksekusi Multi-Website:');
  console.log(`    • Status Eksekusi        : ${result.success ? 'BERHASIL (OK)' : 'GAGAL'}`);
  console.log(`    • Durasi Waktu           : ${(result.durationMs / 1000).toFixed(2)} detik`);
  console.log(`    • Total Dokumen Baru     : ${result.documents.length} berkas`);

  if (result.documents.length > 0) {
    console.log('\n[4] Data Dokumen yang Berhasil Diekstraksi per Portal:');
    result.documents.forEach((doc: any, idx: number) => {
      console.log(`    [${idx + 1}] Sumber: [${doc.siteName}] | No: ${doc.queueNo}`);
      console.log(`        Pemohon  : ${doc.applicantName}`);
      console.log(`        Judul    : ${doc.documentTitle}`);
      console.log(`        PIC      : ${doc.picName} (${doc.picContact})`);
      console.log(`        Path PDF : ${doc.pdfPath} (${fs.existsSync(doc.pdfPath) ? 'TERVERIFIKASI DI DISK' : 'BELUM DITEMUKAN'})`);
    });
  }

  console.log('\n[5] Verifikasi Isolasi Direktori Unduhan Disk:');
  activePortals.forEach((portal) => {
    if (fs.existsSync(portal.downloadsDir)) {
      const files = fs.readdirSync(portal.downloadsDir);
      console.log(`    • [${portal.name}] Folder ./downloads/${portal.id}/ memuat ${files.length} file:`);
      files.forEach((f) => console.log(`        -> ${f}`));
    }
  });

  console.log('\n[6] Uji Fitur Dinamis: Toggle Nonaktifkan Portal 2...');
  adapterRegistry.setEnabled('tender_portal', false);
  console.log(`    • Jumlah portal aktif setelah toggle: ${adapterRegistry.getActive().length} portal`);
  adapterRegistry.setEnabled('tender_portal', true);
  console.log(`    • Dikembalikan aktif: ${adapterRegistry.getActive().length} portal`);

  console.log('\n====================================================');
  console.log(' PENGUJIAN MULTI-WEBSITE SCRAPER SELESAI DENGAN SUKSES');
  console.log('====================================================\n');
  process.exit(result.success ? 0 : 1);
}

runMultiSiteScraperTest().catch((err) => {
  console.error('\n[FATAL ERROR]', err);
  process.exit(1);
});
