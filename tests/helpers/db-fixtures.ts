import { TEST_USERS, AuthUser } from './auth-helper.js';

export interface TestRole {
  id: string;
  name: string;
  isSystemDefault: boolean;
}

export interface TestModule {
  id: string;
  code: string;
  name: string;
  description: string;
}

export interface TestPermission {
  id: string;
  roleId: string;
  moduleId: string;
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canApprove: boolean;
}

export interface TestTransaction {
  id: string;
  invoiceNumber: string;
  type: 'CASH_IN' | 'CASH_OUT';
  amount: number;
  category: string;
  description: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  receiptUrl?: string;
  createdById: string;
  approvedById?: string;
  createdAt: string;
}

export interface TestProker {
  id: string;
  name: string;
  bidang: string;
  kompartemen?: string;
  status: 'PLANNING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  targetDate: string;
  picCadreId: string;
  createdAt: string;
}

export interface TestMeeting {
  id: string;
  title: string;
  prokerId?: string;
  date: string;
  location: string;
  type: 'INTERNAL' | 'PROKER' | 'GENERAL';
  createdAt: string;
}

export interface TestAttendance {
  id: string;
  meetingId: string;
  cadreId: string;
  status: 'HADIR' | 'IZIN' | 'SAKIT' | 'ALPHA';
  recordedAt: string;
}

export interface TestScoreLedger {
  id: string;
  cadreId: string;
  referenceType: 'MEETING' | 'PROKER' | 'MANUAL';
  referenceId: string;
  points: number;
  description: string;
  createdAt: string;
}

export interface TestHeroSlide {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  imageAlt: string;
  slotStatus: 'ready' | 'pending-asset';
  orderIndex: number;
}

export interface TestPartner {
  id: string;
  name: string;
  logoUrl: string;
  scope: string;
  tier: 'STRATEGIC' | 'MEDIA' | 'COMMUNITY';
  slotStatus: 'ready' | 'pending-asset';
}

export interface TestSiteSetting {
  id: string;
  secretariatAddress: string;
  officialEmail: string;
  instagramUrl: string;
  linkedinUrl: string;
  youtubeUrl: string;
  googleDocsTemplateUrl: string;
}

export const DEFAULT_MODULES: TestModule[] = [
  { id: 'm-auth', code: 'auth', name: 'Autentikasi & Akun', description: 'Manajemen login dan profil' },
  { id: 'm-kader', code: 'kader', name: 'Database Kader', description: 'Direktori dan master data kader' },
  { id: 'm-rbac', code: 'admin-rbac', name: 'Hak Akses & Role Matrix', description: 'Konfigurasi role dan izin' },
  { id: 'm-dashboard', code: 'dashboard', name: 'Dashboard Metrics', description: 'KPI dan statistik organisasi' },
  { id: 'm-finance', code: 'finance', name: 'Keuangan & Resi', description: 'Kas, approval, dan resi digital' },
  { id: 'm-tracking', code: 'tracking', name: 'Tracking Proker & Presensi', description: 'Program kerja, rapat, dan poin' },
  { id: 'm-leaderboard', code: 'leaderboard', name: 'Leaderboard Kader', description: 'Peringkat keaktifan kader' },
  { id: 'm-calendar', code: 'calendar', name: 'Kalender HIPMI', description: 'Jadwal agenda dan rapat' },
  { id: 'm-cms', code: 'cms', name: 'Headless CMS Web Profil', description: 'Konten profil publik UKM' },
];

export const DEFAULT_ROLES: TestRole[] = [
  { id: 'r1111111-1111-1111-1111-111111111111', name: 'Admin', isSystemDefault: true },
  { id: 'r2222222-2222-2222-2222-222222222222', name: 'Topman', isSystemDefault: true },
  { id: 'r3333333-3333-3333-3333-333333333333', name: 'Kabid', isSystemDefault: true },
  { id: 'r4444444-4444-4444-4444-444444444444', name: 'Kadiv', isSystemDefault: true },
  { id: 'r5555555-5555-5555-5555-555555555555', name: 'Staff', isSystemDefault: true },
  { id: 'r6666666-6666-6666-6666-666666666666', name: 'Kader 1', isSystemDefault: true },
];

export class InMemoryDbStore {
  public roles: Map<string, TestRole> = new Map();
  public modules: Map<string, TestModule> = new Map();
  public permissions: Map<string, TestPermission> = new Map();
  public kaders: Map<string, AuthUser> = new Map();
  public transactions: Map<string, TestTransaction> = new Map();
  public prokers: Map<string, TestProker> = new Map();
  public meetings: Map<string, TestMeeting> = new Map();
  public attendances: Map<string, TestAttendance> = new Map();
  public scoreLedgers: Map<string, TestScoreLedger> = new Map();
  public heroSlides: Map<string, TestHeroSlide> = new Map();
  public partners: Map<string, TestPartner> = new Map();
  public siteSettings: Map<string, TestSiteSetting> = new Map();

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.roles.clear();
    this.modules.clear();
    this.permissions.clear();
    this.kaders.clear();
    this.transactions.clear();
    this.prokers.clear();
    this.meetings.clear();
    this.attendances.clear();
    this.scoreLedgers.clear();
    this.heroSlides.clear();
    this.partners.clear();
    this.siteSettings.clear();

    // Load defaults
    for (const r of DEFAULT_ROLES) this.roles.set(r.id, { ...r });
    for (const m of DEFAULT_MODULES) this.modules.set(m.id, { ...m });

    // Seed default permissions for all roles x modules
    for (const r of DEFAULT_ROLES) {
      for (const m of DEFAULT_MODULES) {
        const isAdmin = r.name === 'Admin';
        const isTopman = r.name === 'Topman';
        const isStaff = r.name === 'Staff';
        const isKader1 = r.name === 'Kader 1';

        const permId = `${r.id}_${m.id}`;
        this.permissions.set(permId, {
          id: permId,
          roleId: r.id,
          moduleId: m.id,
          canRead: isAdmin || isTopman || (!isKader1 && m.code !== 'admin-rbac') || (isKader1 && ['dashboard', 'leaderboard', 'calendar'].includes(m.code)),
          canCreate: isAdmin || (isTopman && m.code !== 'admin-rbac') || (!isStaff && !isKader1 && ['tracking', 'calendar'].includes(m.code)),
          canUpdate: isAdmin || (isTopman && m.code !== 'admin-rbac') || (!isStaff && !isKader1 && ['tracking', 'calendar'].includes(m.code)),
          canDelete: isAdmin || (isTopman && ['kader', 'tracking'].includes(m.code)),
          canApprove: isAdmin || isTopman,
        });
      }
    }

    // Seed test cadres
    for (const u of Object.values(TEST_USERS) as AuthUser[]) {
      this.kaders.set(u.id, { ...u });
    }
  }
}

export const dbStore = new InMemoryDbStore();

/**
 * High-level Database Fixture utilities supporting either live Postgres or in-memory fallback.
 */
export const dbFixtures = {
  isLiveDbAvailable(): boolean {
    return Boolean(process.env.DATABASE_URL);
  },

  async seedAll(): Promise<void> {
    dbStore.reset();
  },

  async cleanupAll(): Promise<void> {
    dbStore.reset();
  },

  async seedCadres(cadres?: Partial<AuthUser>[]): Promise<AuthUser[]> {
    if (!cadres || cadres.length === 0) {
      return Array.from(dbStore.kaders.values());
    }
    const created: AuthUser[] = [];
    for (const c of cadres) {
      const full: AuthUser = {
        id: c.id || `kader-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        nim: c.nim || `130121${Math.floor(1000 + Math.random() * 9000)}`,
        fullName: c.fullName || 'Test Kader',
        roleId: c.roleId || DEFAULT_ROLES[5].id,
        roleCode: c.roleCode || 'kader_1',
        roleName: c.roleName || 'Kader 1',
        status: c.status || 'Aktif',
        totalScore: c.totalScore ?? 0,
        fakultas: c.fakultas || 'FIF',
        prodi: c.prodi || 'S1 Informatika',
      };
      dbStore.kaders.set(full.id, full);
      created.push(full);
    }
    return created;
  },

  async seedTransactions(transactions?: Partial<TestTransaction>[]): Promise<TestTransaction[]> {
    if (!transactions) return [];
    const seeded: TestTransaction[] = [];
    for (const t of transactions) {
      const full: TestTransaction = {
        id: t.id || `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        invoiceNumber: t.invoiceNumber || `INV/HIPMI/2026/${Math.floor(1000 + Math.random() * 9000)}`,
        type: t.type || 'CASH_IN',
        amount: t.amount ?? 500000,
        category: t.category || 'Pendaftaran',
        description: t.description || 'Test transaction',
        status: t.status || 'APPROVED',
        createdById: t.createdById || TEST_USERS.staff.id,
        approvedById: t.approvedById,
        createdAt: t.createdAt || new Date().toISOString(),
      };
      dbStore.transactions.set(full.id, full);
      seeded.push(full);
    }
    return seeded;
  },

  async seedProkers(prokers?: Partial<TestProker>[]): Promise<TestProker[]> {
    if (!prokers) return [];
    const seeded: TestProker[] = [];
    for (const p of prokers) {
      const full: TestProker = {
        id: p.id || `proker-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: p.name || 'HIPMI Fest 2026',
        bidang: p.bidang || 'Eksternal',
        status: p.status || 'ACTIVE',
        targetDate: p.targetDate || '2026-12-01',
        picCadreId: p.picCadreId || TEST_USERS.kabid.id,
        createdAt: p.createdAt || new Date().toISOString(),
      };
      dbStore.prokers.set(full.id, full);
      seeded.push(full);
    }
    return seeded;
  },

  async seedMeetings(meetings?: Partial<TestMeeting>[]): Promise<TestMeeting[]> {
    if (!meetings) return [];
    const seeded: TestMeeting[] = [];
    for (const m of meetings) {
      const full: TestMeeting = {
        id: m.id || `meeting-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: m.title || 'Rapat Koordinasi Bidang',
        date: m.date || new Date().toISOString(),
        location: m.location || 'Sekretariat HIPMI',
        type: m.type || 'INTERNAL',
        createdAt: m.createdAt || new Date().toISOString(),
      };
      dbStore.meetings.set(full.id, full);
      seeded.push(full);
    }
    return seeded;
  },

  async seedCmsEntities(entities?: {
    heroSlides?: Partial<TestHeroSlide>[];
    partners?: Partial<TestPartner>[];
  }): Promise<{ heroSlides: TestHeroSlide[]; partners: TestPartner[] }> {
    const slides: TestHeroSlide[] = [];
    const partners: TestPartner[] = [];

    if (entities?.heroSlides) {
      for (const s of entities.heroSlides) {
        const full: TestHeroSlide = {
          id: s.id || `hero-${Date.now()}`,
          title: s.title || 'Membangun Pengusaha Muda',
          subtitle: s.subtitle || 'HIPMI PT Telkom University mencetak wirausahawan masa depan',
          imageUrl: s.imageUrl || 'https://cdn.hipmi.org/hero.webp',
          imageAlt: s.imageAlt || 'Pengurus HIPMI PT Telkom',
          slotStatus: s.slotStatus || 'ready',
          orderIndex: s.orderIndex || 1,
        };
        dbStore.heroSlides.set(full.id, full);
        slides.push(full);
      }
    }

    if (entities?.partners) {
      for (const p of entities.partners) {
        const full: TestPartner = {
          id: p.id || `partner-${Date.now()}`,
          name: p.name || 'PT Telkom Indonesia',
          logoUrl: p.logoUrl || 'https://cdn.hipmi.org/telkom.webp',
          scope: p.scope || 'Kerjasama Inkubasi Startup Kampus',
          tier: p.tier || 'STRATEGIC',
          slotStatus: p.slotStatus || 'ready',
        };
        dbStore.partners.set(full.id, full);
        partners.push(full);
      }
    }

    return { heroSlides: slides, partners };
  },
};
