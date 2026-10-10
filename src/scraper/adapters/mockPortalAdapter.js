/**
 * @file src/scraper/adapters/mockPortalAdapter.js
 * @description Plugin Adapter untuk Target Portal 1 (Portal Administrasi Antrean PTSP).
 */

import { BaseSiteAdapter } from './baseAdapter.js';

export class MockPortalAdapter extends BaseSiteAdapter {
  constructor() {
    super({
      id: 'ptsp_portal',
      name: 'Portal Perizinan PTSP',
      enabled: true,
      targetUrl: 'http://localhost:3000/api/mock-portal',
      authUsername: 'petugas_operator',
      authPassword: 'PasswordRahasia98!',
      loginFormSelector: '#username',
      passwordSelector: '#password',
      checkboxSelectors: ['#chk-disclaimer', '#chk-privacy'],
      submitBtnSelector: '#btn-login',
      tableRowsSelector: 'table#queue-table tbody tr.queue-row, table#queue-table tbody tr',
      idColSelector: '.col-id, td:nth-child(1)',
      applicantColSelector: '.col-applicant, td:nth-child(2)',
      titleColSelector: '.col-title, td:nth-child(3)',
      picColSelector: '.col-pic, td:nth-child(4)',
      downloadBtnSelector: 'a.btn-download',
    });
  }
}

export default MockPortalAdapter;
