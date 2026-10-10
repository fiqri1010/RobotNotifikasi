/**
 * @file src/scraper/registry.js
 * @description Central Registry untuk mengelola seluruh plugin adapter portal target.
 * Memungkinkan aktivasi/deaktivasi portal dan pendaftaran portal target baru secara dinamis.
 */

import { MockPortalAdapter } from './adapters/mockPortalAdapter.js';
import { SecondPortalAdapter } from './adapters/secondPortalAdapter.js';
import { SiapPriokAdapter } from './adapters/siapPriokAdapter.js';

export class AdapterRegistry {
  constructor() {
    this.adapters = new Map();
    this.initializeDefaults();
  }

  initializeDefaults() {
    this.register(new SiapPriokAdapter());
    this.register(new MockPortalAdapter());
    this.register(new SecondPortalAdapter());
  }

  /**
   * Mendaftarkan plugin adapter baru ke sistem
   * @param {import('./adapters/baseAdapter.js').BaseSiteAdapter} adapter 
   */
  register(adapter) {
    if (!adapter || !adapter.id) {
      throw new Error('Adapter harus memiliki id unik.');
    }
    this.adapters.set(adapter.id, adapter);
  }

  /**
   * Mengambil seluruh adapter yang terdaftar
   * @returns {Array<import('./adapters/baseAdapter.js').BaseSiteAdapter>}
   */
  getAll() {
    return Array.from(this.adapters.values());
  }

  /**
   * Mengambil hanya adapter yang statusnya aktif (enabled: true)
   * @returns {Array<import('./adapters/baseAdapter.js').BaseSiteAdapter>}
   */
  getActive() {
    return this.getAll().filter((adapter) => adapter.enabled);
  }

  /**
   * Mengambil adapter berdasarkan ID
   * @param {string} id 
   */
  getById(id) {
    return this.adapters.get(id) || null;
  }

  /**
   * Mengubah status aktif/nonaktif portal target
   * @param {string} id 
   * @param {boolean} enabled 
   */
  setEnabled(id, enabled) {
    const adapter = this.adapters.get(id);
    if (adapter) {
      adapter.enabled = Boolean(enabled);
      return true;
    }
    return false;
  }

  /**
   * Memperbarui konfigurasi adapter secara dinamis
   * @param {string} id 
   * @param {object} partial 
   */
  update(id, partial) {
    const adapter = this.adapters.get(id);
    if (adapter) {
      if (partial.name) adapter.name = partial.name;
      if (partial.targetUrl) adapter.targetUrl = partial.targetUrl;
      if (partial.authUsername) adapter.authUsername = partial.authUsername;
      if (partial.authPassword) adapter.authPassword = partial.authPassword;
      if (partial.loginFormSelector) adapter.loginFormSelector = partial.loginFormSelector;
      if (partial.passwordSelector) adapter.passwordSelector = partial.passwordSelector;
      if (partial.checkboxSelectors) {
        adapter.checkboxSelectors = Array.isArray(partial.checkboxSelectors)
          ? partial.checkboxSelectors
          : [partial.checkboxSelectors];
      }
      if (partial.submitBtnSelector) adapter.submitBtnSelector = partial.submitBtnSelector;
      if (partial.tableRowsSelector) adapter.tableRowsSelector = partial.tableRowsSelector;
      if (partial.idColSelector) adapter.idColSelector = partial.idColSelector;
      if (partial.applicantColSelector) adapter.applicantColSelector = partial.applicantColSelector;
      if (partial.titleColSelector) adapter.titleColSelector = partial.titleColSelector;
      if (partial.picColSelector) adapter.picColSelector = partial.picColSelector;
      if (partial.downloadBtnSelector) adapter.downloadBtnSelector = partial.downloadBtnSelector;
      if (partial.enabled !== undefined) adapter.enabled = Boolean(partial.enabled);
      return true;
    }
    return false;
  }

  /**
   * Mengambil ringkasan status dan parameter seluruh portal untuk dikirim ke GUI
   */
  getStatusSummary() {
    return this.getAll().map((a) => ({
      id: a.id,
      name: a.name,
      targetUrl: a.targetUrl,
      enabled: a.enabled,
      authUsername: a.authUsername,
      authPassword: a.authPassword,
      loginFormSelector: a.loginFormSelector,
      passwordSelector: a.passwordSelector,
      checkboxSelectors: a.checkboxSelectors,
      submitBtnSelector: a.submitBtnSelector,
      tableRowsSelector: a.tableRowsSelector,
      idColSelector: a.idColSelector,
      applicantColSelector: a.applicantColSelector,
      titleColSelector: a.titleColSelector,
      picColSelector: a.picColSelector,
      downloadBtnSelector: a.downloadBtnSelector,
      sessionPath: a.sessionPath,
      downloadsDir: a.downloadsDir,
    }));
  }
}

export const adapterRegistry = new AdapterRegistry();
export default adapterRegistry;
