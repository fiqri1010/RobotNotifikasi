/**
 * @file src/scraper/adapters/secondPortalAdapter.js
 * @description Plugin Adapter untuk Target Portal 2 (Portal Pengadaan & Tender Berkas).
 */

import { BaseSiteAdapter } from './baseAdapter.js';

export class SecondPortalAdapter extends BaseSiteAdapter {
  constructor() {
    super({
      id: 'tender_portal',
      name: 'Portal Pengadaan & Tender',
      enabled: true,
      targetUrl: 'http://localhost:3000/api/mock-portal-2',
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
    });
  }
}

export default SecondPortalAdapter;
