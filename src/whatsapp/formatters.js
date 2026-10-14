/**
 * @file src/whatsapp/formatters.js
 * @description Modul Formatter Pesan WhatsApp Dinamis & Multi-Portal.
 * Mendukung kustomisasi template teks bebas dengan placeholder dinamis
 * serta pemformatan relasi data lintas website (SIAP 3.0, TPFT, Pelindo, dsb).
 */

/**
 * @param {any} data
 * @param {any} [templateConfig]
 */
export function formatPriokWhatsAppMessage(data, templateConfig) {
  const pibStatus = data.docs?.pib?.available ? 'Tersedia & Terlampir' : (data.pdfFilename ? 'Terarsip' : 'Tidak Ditemukan');
  const invPlStatus = data.docs?.invPl?.available ? 'Tersedia & Terlampir' : 'Tidak Ditemukan';
  const blStatus = data.docs?.bl?.available ? 'Tersedia & Terlampir' : 'Tidak Ditemukan';
  const supportingStatus = data.docs?.supporting?.available ? 'Tersedia & Terlampir' : 'Tidak Ada';
  const fclLcl = data.fclLcl || (data.jc ? (data.jc.toUpperCase().includes('LCL') ? 'LCL' : 'FCL') : 'FCL');
  const noPib = data.pibNumber || data.queueNo || '-';
  const tglPib = data.pibDate || '-';
  const importir = data.importerName || data.applicantName || '-';
  const picNama = data.picName || 'Pengurus (PPJK)';
  const picKontak = data.picContact || '-';
  const lokasiTpft = data.locationTpft || 'Belum Terjadwal di TPFT';
  const sumberPortal = data.siteName || data.siteId || 'SIAP 3.0 Priok';

  // Format data relasi lintas website jika ada
  let relasiText = '';
  if (data.relatedPortals && Array.isArray(data.relatedPortals) && data.relatedPortals.length > 0) {
    relasiText = '*HASIL RELASI DATA LINTAS WEBSITE:*\n' +
      data.relatedPortals.map((r, i) => 
        `  ${i + 1}. [${r.portalName || r.portalId}]: ${r.matchedKey ? `(Key: ${r.matchedKey})` : ''}\n` +
        `     • Lokasi/Terminal: ${r.location || '-'}\n` +
        `     • Status: ${r.status || r.statusBehandle || 'Terhubung'}`
      ).join('\n') + '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  } else if (data.tpftDetail?.foundLocation) {
    relasiText = `*Cross-Check TPFT:* Terverifikasi di ${data.tpftDetail.foundLocation}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  }

  // Jika ada custom template text yang ditentukan pengguna di pengaturan GUI
  if (templateConfig && templateConfig.customTemplateText && templateConfig.customTemplateText.trim().length > 0) {
    let result = templateConfig.customTemplateText;
    result = result.replace(/\{no_pib\}/g, noPib);
    result = result.replace(/\{tgl_pib\}/g, tglPib);
    result = result.replace(/\{importir\}/g, importir);
    result = result.replace(/\{pemohon\}/g, importir);
    result = result.replace(/\{fcl_lcl\}/g, fclLcl);
    result = result.replace(/\{pic_nama\}/g, picNama);
    result = result.replace(/\{pic_kontak\}/g, picKontak);
    result = result.replace(/\{lokasi_tpft\}/g, lokasiTpft);
    result = result.replace(/\{sumber_portal\}/g, sumberPortal);
    result = result.replace(/\{status_pib\}/g, pibStatus);
    result = result.replace(/\{status_inv\}/g, invPlStatus);
    result = result.replace(/\{status_bl\}/g, blStatus);
    result = result.replace(/\{status_pendukung\}/g, supportingStatus);
    result = result.replace(/\{relasi_lintas_portal\}/g, relasiText);
    result = result.replace(/\{waktu_deteksi\}/g, data.detectedAt || new Date().toLocaleTimeString('id-ID'));
    return result;
  }

  // Pemformatan modular berdasarkan konfigurasi toggle centang
  const lines = [];

  if (!templateConfig || templateConfig.includeHeader !== false) {
    lines.push(templateConfig?.headerTitle || '*PEMBERITAHUAN PENUGASAN PEMERIKSAAN FISIK*\n*KPU BEA DAN CUKAI TIPE A TANJUNG PRIOK*');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  if (!templateConfig || templateConfig.includeFclLcl !== false) {
    lines.push(`*FCL/LCL:* ${fclLcl}`);
  }

  if (!templateConfig || templateConfig.includePibNumber !== false) {
    lines.push(`*Nomor PIB:* ${noPib}`);
  }

  if (!templateConfig || templateConfig.includePibDate !== false) {
    lines.push(`*Tanggal PIB:* ${tglPib}`);
  }

  if (!templateConfig || templateConfig.includeImporter !== false) {
    lines.push(`*Importir:* ${importir}`);
  }

  if (!templateConfig || templateConfig.includePicName !== false) {
    lines.push(`*Nama Pengurus (PPJK):* ${picNama}`);
  }

  if (!templateConfig || templateConfig.includePicContact !== false) {
    lines.push(`*Nomor Kontak PPJK:* ${picKontak}`);
  }

  if (!templateConfig || templateConfig.includeLocationTpft !== false) {
    lines.push(`*Lokasi / Status Kesiapan Barang:* ${lokasiTpft}`);
  }

  if (!templateConfig || templateConfig.includeDocsStatus !== false) {
    lines.push('\n*Status Dokumen Terlampir:*');
    lines.push(`- PIB: ${pibStatus}`);
    lines.push(`- Inv/PL: ${invPlStatus}`);
    lines.push(`- BL: ${blStatus}`);
    lines.push(`- Dokumen Pendukung: ${supportingStatus}`);
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if ((!templateConfig || templateConfig.includeCrossCheckRelation !== false) && relasiText) {
    lines.push(relasiText);
  }

  if (!templateConfig || templateConfig.includeFooter !== false) {
    lines.push('_Lampiran berkas PDF resmi terlampir pada pesan ini._');
  }

  return lines.join('\n');
}

export default formatPriokWhatsAppMessage;
