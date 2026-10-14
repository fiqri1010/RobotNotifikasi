/**
 * @file src/services/relationEngine.ts
 * @description Correlation & Multi-Source Data Relation Engine.
 * Menghubungkan (cross-reference) data dari berbagai website portal berbeda
 * berdasarkan Primary Matching Key (seperti Nomor PIB, Nomor Kontainer, atau No Tiket).
 * Misalnya: Data PIB dari SIAP 3.0 Bea Cukai otomatis dihubungkan dengan posisi
 * kontainer di portal TPFT (Graha Segara/MTI) dan status Gate-In dari Pelindo.
 */

export interface RelatedPortalData {
  portalId: string;
  portalName: string;
  matchedKeyType: 'pibNumber' | 'containerNo' | 'queueNo';
  matchedKeyValue: string;
  location?: string;
  statusBehandle?: string;
  gateInTime?: string;
  terminalBlock?: string;
  notes?: string;
  updatedAt: string;
}

export interface RelationRule {
  id: string;
  name: string;
  primaryKey: 'pibNumber' | 'containerNo' | 'queueNo';
  sourcePortalIds: string[];
  autoMergeToWhatsApp: boolean;
  description: string;
}

export const DEFAULT_RELATION_RULES: RelationRule[] = [
  {
    id: 'rule_pib_tpft',
    name: 'Relasi PIB SIAP 3.0 <-> Posisi Lapangan TPFT',
    primaryKey: 'pibNumber',
    sourcePortalIds: ['siap_priok', 'tpft_monitoring'],
    autoMergeToWhatsApp: true,
    description: 'Menghubungkan nomor PIB dari SIAP 3.0 dengan status kesiapan fisik kontainer di TPFT Graha Segara / TPFT Priok.',
  },
  {
    id: 'rule_container_pelindo',
    name: 'Relasi Nomor Kontainer <-> Portal Terminal Pelindo (Publik)',
    primaryKey: 'containerNo',
    sourcePortalIds: ['tpft_monitoring', 'pelindo_gate_public'],
    autoMergeToWhatsApp: true,
    description: 'Mencocokkan nomor peti kemas dengan waktu gate-in dan blok penumpukan peti kemas di terminal pelabuhan.',
  },
];

class RelationEngine {
  private rules: RelationRule[] = [...DEFAULT_RELATION_RULES];
  // Penyimpanan indeks sekunder di memori untuk pencocokan cepat
  private pibIndex: Map<string, RelatedPortalData[]> = new Map();
  private containerIndex: Map<string, RelatedPortalData[]> = new Map();

  constructor() {
    this.seedSampleCorrelations();
  }

  private seedSampleCorrelations() {
    // Inisialisasi data referensi sampel pelabuhan
    this.addPortalRecord('tpft_monitoring', {
      portalId: 'tpft_monitoring',
      portalName: 'Monitoring Posisi TPFT Graha Segara',
      matchedKeyType: 'pibNumber',
      matchedKeyValue: '012845',
      location: 'TPFT Graha Segara - Blok C-02 Tier 1',
      statusBehandle: 'SIAP BUKA SEGEL & PEMERIKSAAN FISIK',
      terminalBlock: 'Blok C-02',
      notes: 'Peti kemas 40ft sudah ditempatkan di jalur inspeksi.',
      updatedAt: new Date().toLocaleTimeString('id-ID'),
    });

    this.addPortalRecord('pelindo_gate_public', {
      portalId: 'pelindo_gate_public',
      portalName: 'Terminal Pelindo Tracking (Publik)',
      matchedKeyType: 'pibNumber',
      matchedKeyValue: '012845',
      location: 'Gate 3 Tanjung Priok',
      statusBehandle: 'Gate-In Selesai',
      gateInTime: '06:45:10 WIB',
      terminalBlock: 'Jalur Masuk TPFT',
      notes: 'Truk pengangkut terverifikasi masuk pelabuhan.',
      updatedAt: new Date().toLocaleTimeString('id-ID'),
    });
  }

  public getRules(): RelationRule[] {
    return [...this.rules];
  }

  public addRule(rule: RelationRule): void {
    const existingIndex = this.rules.findIndex((r) => r.id === rule.id);
    if (existingIndex >= 0) {
      this.rules[existingIndex] = rule;
    } else {
      this.rules.push(rule);
    }
  }

  public addPortalRecord(portalId: string, record: RelatedPortalData) {
    const key = record.matchedKeyValue.trim();
    if (!key) return;

    if (record.matchedKeyType === 'pibNumber') {
      const current = this.pibIndex.get(key) || [];
      const filtered = current.filter((r) => r.portalId !== portalId);
      filtered.push(record);
      this.pibIndex.set(key, filtered);
    } else if (record.matchedKeyType === 'containerNo') {
      const current = this.containerIndex.get(key) || [];
      const filtered = current.filter((r) => r.portalId !== portalId);
      filtered.push(record);
      this.containerIndex.set(key, filtered);
    }
  }

  /**
   * Memperkaya (enrich) dokumen dengan data relasi dari seluruh portal terkait
   */
  public enrichDocument(doc: any): any {
    const key = (doc.pibNumber || doc.queueNo || '').trim();
    if (!key) return doc;

    const matchedRelations = this.pibIndex.get(key) || [];
    
    // Jika ada data relasi yang ditemukan
    if (matchedRelations.length > 0) {
      const existingRelated = Array.isArray(doc.relatedPortals) ? doc.relatedPortals : [];
      const mergedRelated = [...existingRelated];

      for (const rel of matchedRelations) {
        if (!mergedRelated.some((m) => m.portalId === rel.portalId)) {
          mergedRelated.push(rel);
        }
      }

      // Perbarui lokasi TPFT jika portal relasi memiliki data lebih spesifik
      const tpftRelation = matchedRelations.find((r) => r.portalId === 'tpft_monitoring');
      const updatedLocation = tpftRelation?.location || doc.locationTpft;

      return {
        ...doc,
        locationTpft: updatedLocation,
        relatedPortals: mergedRelated,
      };
    }

    return doc;
  }
}

export const relationEngine = new RelationEngine();
