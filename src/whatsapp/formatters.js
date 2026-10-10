/**
 * @file src/whatsapp/formatters.js
 * @description Modul Formatter Pesan WhatsApp Khusus Pemeriksa Barang Impor Bea Cukai Priok.
 * Menghasilkan format pesan standar resmi yang memuat rincian PIB, Importir,
 * Kontak Pengurus, Status Lokasi Fisik di 3 Website TPFT, dan kelengkapan dokumen.
 */

export function formatPriokWhatsAppMessage(data) {
  const pibStatus = data.docs?.pib?.available ? 'Tersedia & Terlampir' : 'Tidak Ditemukan';
  const invPlStatus = data.docs?.invPl?.available ? 'Tersedia & Terlampir' : 'Tidak Ditemukan';
  const blStatus = data.docs?.bl?.available ? 'Tersedia & Terlampir' : 'Tidak Ditemukan';
  const supportingStatus = data.docs?.supporting?.available ? 'Tersedia & Terlampir' : 'Tidak Ada';
  const fclLcl = data.fclLcl || (data.jc ? (data.jc.toUpperCase().includes('LCL') ? 'LCL' : 'FCL') : 'FCL');

  return `*PEMBERITAHUAN PENUGASAN PEMERIKSAAN FISIK*
*KPU BEA DAN CUKAI TIPE A TANJUNG PRIOK*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*FCL/LCL: *${fclLcl}
*Nomor PIB:* ${data.pibNumber || data.queueNo || '-'}
*Tanggal PIB:* ${data.pibDate || '-'}
*Importir:* ${data.importerName || data.applicantName || '-'}
*Nama Pengurus:* ${data.picName || '-'}
*Nomor Pengurus:* ${data.picContact || '-'}
*Lokasi / Status Kesiapan Barang:* ${data.locationTpft || 'Belum Terjadwal di TPFT'}

*Dokumen:*
- PIB: ${pibStatus}
- Inv/PL: ${invPlStatus}
- BL: ${blStatus}
- Dokumen Pendukung (jika ada): ${supportingStatus}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Lampiran berkas PDF resmi terlampir pada pesan ini._`;
}

export default formatPriokWhatsAppMessage;
