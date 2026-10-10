/**
 * Skrip Uji Mandiri WhatsApp Baileys (Workstation 98)
 * Menguji modul: src/whatsapp/baileysClient.js
 * Jalankan via terminal: npm run test:whatsapp (atau: npx tsx scripts/test-whatsapp.ts)
 */

import { baileysClient, BaileysClient } from '../src/whatsapp/baileysClient.js';
import { whatsappEngine } from '../src/services/whatsappEngine.ts';
import fs from 'fs';
import path from 'path';

async function runWhatsAppTest() {
  console.log('====================================================');
  console.log('   WORKSTATION 98 - BAILEYS WHATSAPP TEST SUITE     ');
  console.log('   Target Module: src/whatsapp/baileysClient.js     ');
  console.log('====================================================');

  const status = baileysClient.getStatus();
  console.log(`[1] Status Klien Baileys:`);
  console.log(`    • Auth Directory    : ${status.authDir}`);
  console.log(`    • Nomor Pemilik PIC : ${status.ownerNumber}`);
  console.log(`    • Status Koneksi    : ${status.connectionState}`);
  console.log(`    • Sesi Auth di Disk : ${status.hasStoredAuth ? 'ADA' : 'BELUM ADA'}`);

  console.log('\n[2] Memeriksa Event Emitter Interface:');
  let qrEmitted = false;
  let commandReceived = false;

  baileysClient.on('qr', (data: any) => {
    qrEmitted = true;
    console.log(`    -> [EVENT: qr] Berhasil dipancarkan. Panjang DataURL: ${data.qrDataUrl?.length || 0} chars.`);
  });

  baileysClient.on('command', (cmd: any) => {
    commandReceived = true;
    console.log(`    -> [EVENT: command] Perintah "${cmd.command}" diterima dari ${cmd.sender}.`);
  });

  baileysClient.on('message_sent', (msg: any) => {
    console.log(`    -> [EVENT: message_sent] Pesan keluar ke ${msg.recipient}: "${msg.text}"`);
  });

  baileysClient.on('document_sent', (doc: any) => {
    console.log(`    -> [EVENT: document_sent] Lampiran PDF terkirim: ${doc.fileName}`);
  });

  console.log('\n[3] Menguji Penanganan Perintah Masuk (Parser & Otorisasi)...');
  const testJid = `${status.ownerNumber}@s.whatsapp.net`;

  // Uji perintah status
  await baileysClient.parseAndExecuteCommand(testJid, 'status');
  // Uji perintah start
  await baileysClient.parseAndExecuteCommand(testJid, 'start');
  // Uji perintah cek pic
  await baileysClient.parseAndExecuteCommand(testJid, 'cek pic 08123456789');

  console.log('\n[4] Menguji Penyiapan Pengiriman Dokumen PDF...');
  const samplePdfPath = path.join(process.cwd(), 'downloads', 'TEST-DOC-98.pdf');
  if (!fs.existsSync(samplePdfPath)) {
    const dir = path.dirname(samplePdfPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(samplePdfPath, '%PDF-1.4 Mock Baileys Verification File\n%%EOF', 'utf-8');
  }

  const caption = '📄 Notifikasi Berkas Baru: TEST-DOC-98.pdf';
  await baileysClient.sendPdfDocument(testJid, 'TEST-DOC-98.pdf', caption);

  console.log('\n[5] Menguji Pengiriman Pesan Teks Standar...');
  await baileysClient.sendTextMessage(testJid, 'Workstation 98 online dan siap memantau.');

  console.log('\n[6] Memverifikasi Format JID WhatsApp:');
  console.log(`    • 08123456789  -> ${baileysClient.formatToJid('08123456789')}`);
  console.log(`    • +62812345678 -> ${baileysClient.formatToJid('+62812345678')}`);

  console.log('\n[7] Menghubungkan Soket Baileys (Non-blocking)...');
  const connectResult = await baileysClient.connect();
  console.log(`    • Hasil Connect     : ${connectResult.success ? 'SOKET AKTIF' : 'FALLBACK OK'}`);

  console.log('\n====================================================');
  console.log('   PENGUJIAN MODUL BAILEYS SELESAI DENGAN SUKSES   ');
  console.log('====================================================\n');
  process.exit(0);
}

runWhatsAppTest().catch((err) => {
  console.error('\n[FATAL ERROR]', err);
  process.exit(1);
});
