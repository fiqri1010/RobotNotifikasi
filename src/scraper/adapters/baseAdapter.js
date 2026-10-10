/**
 * @file src/scraper/adapters/baseAdapter.js
 * @description Kelas basis standar untuk seluruh plugin adapter website target scraper.
 * Setiap portal web target mengimplementasikan konfigurasi URL, form login,
 * selector tabel antrean, ekstraksi kontak PIC, dan unduh PDF sendiri.
 */

import path from 'path';

export class BaseSiteAdapter {
  constructor(options = {}) {
    this.id = options.id || 'default_site';
    this.name = options.name || 'Default Web Portal';
    this.enabled = options.enabled !== undefined ? options.enabled : true;

    // Konfigurasi URL dan autentikasi
    this.targetUrl = options.targetUrl || 'http://localhost:3000/api/mock-portal';
    this.authUsername = options.authUsername || 'petugas_operator';
    this.authPassword = options.authPassword || 'PasswordRahasia98!';
    this.loginFormSelector = options.loginFormSelector || 'input[name="username"], #username';
    this.passwordSelector = options.passwordSelector || 'input[name="password"], #password';
    this.checkboxSelectors = options.checkboxSelectors || ['#chk-disclaimer', '#chk-privacy'];
    this.submitBtnSelector = options.submitBtnSelector || 'button[type="submit"], #btn-login';

    // Konfigurasi tabel antrean
    this.tableRowsSelector = options.tableRowsSelector || 'table#queue-table tbody tr, .queue-row';
    this.idColSelector = options.idColSelector || '.col-id, td:nth-child(1)';
    this.applicantColSelector = options.applicantColSelector || '.col-applicant, td:nth-child(2)';
    this.titleColSelector = options.titleColSelector || '.col-title, td:nth-child(3)';
    this.picColSelector = options.picColSelector || '.col-pic, td:nth-child(4)';
    this.downloadBtnSelector = options.downloadBtnSelector || 'a.btn-download, button.btn-download, a[href*="download"], a[href$=".pdf"]';

    // Direktori khusus terisolasi per portal
    this.sessionPath = path.resolve(process.cwd(), 'sessions', this.id, 'storageState.json');
    this.downloadsDir = path.resolve(process.cwd(), 'downloads', this.id);
  }

  /**
   * Ekstraksi nama dan nomor telepon PIC dari teks kolom
   * @param {string} rawPicText 
   * @returns {{ picName: string, picContact: string }}
   */
  extractPicInfo(rawPicText) {
    const text = (rawPicText || '').trim();
    const phoneRegex = /(?:08|\+?62)\d{8,12}/;
    const phoneMatch = text.match(phoneRegex);
    const picContact = phoneMatch ? phoneMatch[0] : '-';
    const picName = text.replace(phoneRegex, '').replace(/[()\-]/g, '').trim() || 'PIC Terdaftar';

    return { picName, picContact };
  }

  /**
   * Hook opsional untuk validasi atau navigasi pra-scraping kustom
   */
  async beforeScrape(_page) {
    // Default no-op, dapat di-override oleh adapter spesifik
  }

  /**
   * Hook opsional pasca-scraping
   */
  async afterScrape(_page, _documents) {
    // Default no-op
  }
}

export default BaseSiteAdapter;
