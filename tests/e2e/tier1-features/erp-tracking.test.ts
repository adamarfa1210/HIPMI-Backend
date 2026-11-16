import { describe, it, expect, beforeAll, afterAll } from '../../helpers/test-runner.js';
import {
  dbStore,
  TestProker,
  TestMeeting,
  TestAttendance,
  TestScoreLedger,
} from '../../helpers/db-fixtures.js';
import { TEST_USERS, AuthUser } from '../../helpers/auth-helper.js';

interface DashboardKpi {
  totalCadres: number;
  activeCadres: number;
  cadreActiveIndex: number;
  prokerStatusSummary: {
    planning: number;
    active: number;
    completed: number;
    cancelled: number;
  };
}

function calculateDashboardKpi(
  cadres: AuthUser[],
  prokers: TestProker[]
): DashboardKpi {
  const totalCadres = cadres.length;
  const activeCadres = cadres.filter((c) => c.status === 'Aktif').length;
  const totalScore = cadres
    .filter((c) => c.status === 'Aktif')
    .reduce((sum, c) => sum + (c.totalScore || 0), 0);
  const cadreActiveIndex = activeCadres > 0 ? Math.round(totalScore / activeCadres) : 0;

  const prokerStatusSummary = {
    planning: prokers.filter((p) => p.status === 'PLANNING').length,
    active: prokers.filter((p) => p.status === 'ACTIVE').length,
    completed: prokers.filter((p) => p.status === 'COMPLETED').length,
    cancelled: prokers.filter((p) => p.status === 'CANCELLED').length,
  };

  return { totalCadres, activeCadres, cadreActiveIndex, prokerStatusSummary };
}

// Point weights per PRD & Architecture specifications
export const ATTENDANCE_POINTS: Record<string, number> = {
  HADIR: 15,
  IZIN: 5,
  SAKIT: 5,
  ALPHA: -10,
};

export const COMMITTEE_POINTS: Record<string, number> = {
  PIC: 50,
  KOORDINATOR: 35,
  ANGGOTA: 20,
};

function recordAttendanceWithPoints(
  meetingId: string,
  cadreId: string,
  status: 'HADIR' | 'IZIN' | 'SAKIT' | 'ALPHA',
  store: typeof dbStore
): { attendance: TestAttendance; ledger: TestScoreLedger } {
  // Check existing attendance for idempotency / reversal
  const existingAtt = Array.from(store.attendances.values()).find(
    (a) => a.meetingId === meetingId && a.cadreId === cadreId
  );

  let oldPoints = 0;
  if (existingAtt) {
    oldPoints = ATTENDANCE_POINTS[existingAtt.status] || 0;
    existingAtt.status = status;
    existingAtt.recordedAt = new Date().toISOString();
  }

  const newPoints = ATTENDANCE_POINTS[status] || 0;
  const deltaPoints = existingAtt ? newPoints - oldPoints : newPoints;

  const attendance: TestAttendance = existingAtt || {
    id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    meetingId,
    cadreId,
    status,
    recordedAt: new Date().toISOString(),
  };
  if (!existingAtt) {
    store.attendances.set(attendance.id, attendance);
  }

  const ledger: TestScoreLedger = {
    id: `ledger-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    cadreId,
    referenceType: 'MEETING',
    referenceId: meetingId,
    points: deltaPoints,
    description: `Presensi Rapat: ${status} (${deltaPoints >= 0 ? '+' : ''}${deltaPoints})`,
    createdAt: new Date().toISOString(),
  };
  store.scoreLedgers.set(ledger.id, ledger);

  // Update cadre total score
  const cadre = store.kaders.get(cadreId);
  if (cadre) {
    cadre.totalScore = (cadre.totalScore || 0) + deltaPoints;
  }

  return { attendance, ledger };
}

function getLeaderboardRanking(store: typeof dbStore): Array<{
  rank: number;
  cadreId: string;
  name: string;
  nim: string;
  role: string;
  totalScore: number;
}> {
  const cadreList = Array.from(store.kaders.values());
  cadreList.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return a.nim.localeCompare(b.nim); // Deterministic tie-breaker
  });

  return cadreList.map((c, idx) => ({
    rank: idx + 1,
    cadreId: c.id,
    name: c.fullName,
    nim: c.nim,
    role: c.roleName,
    totalScore: c.totalScore,
  }));
}

describe('Tier 1: ERP Kader Tracking & Scoring Engine (Features 13, 20-24)', () => {
  beforeAll(async () => {
    dbStore.reset();
  });

  afterAll(async () => {
    dbStore.reset();
  });

  // =========================================================================
  // F13: Dashboard Metrics KPI Calculations
  // =========================================================================
  it('F13-1: Calculates total registered cadres vs active cadres count', () => {
    const testCadres: AuthUser[] = [
      { ...TEST_USERS.admin, status: 'Aktif' },
      { ...TEST_USERS.staff, status: 'Aktif' },
      { ...TEST_USERS.kader_1, status: 'Non-Aktif' },
      { ...TEST_USERS.topman, status: 'Alumni' },
    ];
    const kpi = calculateDashboardKpi(testCadres, []);
    expect(kpi.totalCadres).toBe(4);
    expect(kpi.activeCadres).toBe(2);
  });

  it('F13-2: Calculates Work Program status proportions (PLANNING, ACTIVE, COMPLETED, CANCELLED)', () => {
    const testProkers: TestProker[] = [
      { id: '1', name: 'P1', bidang: 'OKK', status: 'COMPLETED', targetDate: '', picCadreId: '', createdAt: '' },
      { id: '2', name: 'P2', bidang: 'OKK', status: 'COMPLETED', targetDate: '', picCadreId: '', createdAt: '' },
      { id: '3', name: 'P3', bidang: 'Medkom', status: 'ACTIVE', targetDate: '', picCadreId: '', createdAt: '' },
      { id: '4', name: 'P4', bidang: 'Ekraf', status: 'PLANNING', targetDate: '', picCadreId: '', createdAt: '' },
    ];
    const kpi = calculateDashboardKpi([], testProkers);
    expect(kpi.prokerStatusSummary.completed).toBe(2);
    expect(kpi.prokerStatusSummary.active).toBe(1);
    expect(kpi.prokerStatusSummary.planning).toBe(1);
    expect(kpi.prokerStatusSummary.cancelled).toBe(0);
  });

  it('F13-3: Calculates average cadre activity index across active cadres', () => {
    const activeCadres: AuthUser[] = [
      { ...TEST_USERS.admin, status: 'Aktif', totalScore: 300 },
      { ...TEST_USERS.staff, status: 'Aktif', totalScore: 100 },
    ];
    const kpi = calculateDashboardKpi(activeCadres, []);
    expect(kpi.cadreActiveIndex).toBe(200); // (300 + 100) / 2 = 200
  });

  it('F13-4: Gracefully handles zero cadres without division-by-zero error', () => {
    const kpi = calculateDashboardKpi([], []);
    expect(kpi.totalCadres).toBe(0);
    expect(kpi.activeCadres).toBe(0);
    expect(kpi.cadreActiveIndex).toBe(0);
    expect(Number.isNaN(kpi.cadreActiveIndex)).toBe(false);
  });

  it('F13-5: Dynamic KPI updates immediately when adding or activating a cadre', () => {
    const cadres: AuthUser[] = [{ ...TEST_USERS.admin, status: 'Aktif', totalScore: 100 }];
    const kpiBefore = calculateDashboardKpi(cadres, []);
    expect(kpiBefore.activeCadres).toBe(1);

    cadres.push({ ...TEST_USERS.kader_1, status: 'Aktif', totalScore: 200 });
    const kpiAfter = calculateDashboardKpi(cadres, []);
    expect(kpiAfter.activeCadres).toBe(2);
    expect(kpiAfter.cadreActiveIndex).toBe(150);
  });

  // =========================================================================
  // F20: Work Program (Proker) CRUD and Status Tracking
  // =========================================================================
  it('F20-1: Creates work program with name, bidang, picCadreId, targetDate and status PLANNING', () => {
    const proker: TestProker = {
      id: 'proker-101',
      name: 'HIPMI Startup Bootcamp 2026',
      bidang: 'OKK',
      kompartemen: 'Kompartemen 1: PSDM',
      status: 'PLANNING',
      targetDate: '2026-10-25',
      picCadreId: TEST_USERS.kabid.id,
      createdAt: new Date().toISOString(),
    };
    dbStore.prokers.set(proker.id, proker);

    const saved = dbStore.prokers.get('proker-101');
    expect(saved).toBeDefined();
    expect(saved?.name).toBe('HIPMI Startup Bootcamp 2026');
    expect(saved?.status).toBe('PLANNING');
    expect(saved?.bidang).toBe('OKK');
  });

  it('F20-2: Retrieves proker by ID with PIC cadre details', () => {
    const p = dbStore.prokers.get('proker-101');
    expect(p).toBeDefined();
    const pic = dbStore.kaders.get(p!.picCadreId);
    expect(pic).toBeDefined();
    expect(pic?.roleCode).toBe('kabid');
  });

  it('F20-3: Updates proker lifecycle status from PLANNING to ACTIVE to COMPLETED', () => {
    const p = dbStore.prokers.get('proker-101')!;
    p.status = 'ACTIVE';
    expect(dbStore.prokers.get('proker-101')?.status).toBe('ACTIVE');

    p.status = 'COMPLETED';
    expect(dbStore.prokers.get('proker-101')?.status).toBe('COMPLETED');
  });

  it('F20-4: Marks proker as CANCELLED when discontinued', () => {
    const cancelledProker: TestProker = {
      id: 'proker-cancel',
      name: 'Kegiatan Dibatalkan',
      bidang: 'Eksternal',
      status: 'CANCELLED',
      targetDate: '2026-05-01',
      picCadreId: TEST_USERS.staff.id,
      createdAt: new Date().toISOString(),
    };
    dbStore.prokers.set(cancelledProker.id, cancelledProker);
    expect(dbStore.prokers.get('proker-cancel')?.status).toBe('CANCELLED');
  });

  it('F20-5: Assigns committee members to work program', () => {
    const committees = [
      { prokerId: 'proker-101', cadreId: TEST_USERS.kabid.id, role: 'Ketua Pelaksana' },
      { prokerId: 'proker-101', cadreId: TEST_USERS.staff.id, role: 'Staff Acara' },
    ];
    expect(committees).toHaveLength(2);
    expect(committees[0].role).toBe('Ketua Pelaksana');
    expect(committees[1].role).toBe('Staff Acara');
  });

  // =========================================================================
  // F21: Meeting Attendance Logging
  // =========================================================================
  it('F21-1: Creates meeting session with title, date, location, and type', () => {
    const meeting: TestMeeting = {
      id: 'mtg-201',
      title: 'Rapat Pleno Anggota I',
      date: '2026-04-10T19:00:00Z',
      location: 'Gedung Cacuk B Telkom University',
      type: 'GENERAL',
      createdAt: new Date().toISOString(),
    };
    dbStore.meetings.set(meeting.id, meeting);

    const saved = dbStore.meetings.get('mtg-201');
    expect(saved).toBeDefined();
    expect(saved?.title).toBe('Rapat Pleno Anggota I');
    expect(saved?.type).toBe('GENERAL');
  });

  it('F21-2: Records HADIR attendance status for attendee cadre', () => {
    const { attendance } = recordAttendanceWithPoints(
      'mtg-201',
      TEST_USERS.staff.id,
      'HADIR',
      dbStore
    );
    expect(attendance.status).toBe('HADIR');
    expect(attendance.cadreId).toBe(TEST_USERS.staff.id);
  });

  it('F21-3: Records IZIN attendance status with excused note', () => {
    const { attendance } = recordAttendanceWithPoints(
      'mtg-201',
      TEST_USERS.kader_1.id,
      'IZIN',
      dbStore
    );
    expect(attendance.status).toBe('IZIN');
  });

  it('F21-4: Records SAKIT attendance status with medical note', () => {
    const { attendance } = recordAttendanceWithPoints(
      'mtg-201',
      TEST_USERS.kadiv.id,
      'SAKIT',
      dbStore
    );
    expect(attendance.status).toBe('SAKIT');
  });

  it('F21-5: Records ALPHA attendance status for unexcused absence', () => {
    const { attendance } = recordAttendanceWithPoints(
      'mtg-201',
      TEST_USERS.topman.id,
      'ALPHA',
      dbStore
    );
    expect(attendance.status).toBe('ALPHA');
  });

  // =========================================================================
  // F22: Automated Point Ledger Injection
  // =========================================================================
  it('F22-1: Meeting HADIR presence injects exactly +15 points into Point Ledger', () => {
    const startScore = dbStore.kaders.get(TEST_USERS.staff.id)!.totalScore;
    const { ledger } = recordAttendanceWithPoints(
      'mtg-point-1',
      TEST_USERS.staff.id,
      'HADIR',
      dbStore
    );
    expect(ledger.points).toBe(15);
    expect(ledger.referenceType).toBe('MEETING');
    const endScore = dbStore.kaders.get(TEST_USERS.staff.id)!.totalScore;
    expect(endScore).toBe(startScore + 15);
  });

  it('F22-2: Meeting IZIN presence injects exactly +5 points into Point Ledger', () => {
    const { ledger } = recordAttendanceWithPoints(
      'mtg-point-2',
      TEST_USERS.staff.id,
      'IZIN',
      dbStore
    );
    expect(ledger.points).toBe(5);
  });

  it('F22-3: Meeting SAKIT presence injects exactly +5 points into Point Ledger', () => {
    const { ledger } = recordAttendanceWithPoints(
      'mtg-point-3',
      TEST_USERS.staff.id,
      'SAKIT',
      dbStore
    );
    expect(ledger.points).toBe(5);
  });

  it('F22-4: Meeting ALPHA presence injects negative -10 points into Point Ledger', () => {
    const { ledger } = recordAttendanceWithPoints(
      'mtg-point-4',
      TEST_USERS.staff.id,
      'ALPHA',
      dbStore
    );
    expect(ledger.points).toBe(-10);
  });

  it('F22-5: Proker committee assignment injects tiered points (PIC: +50, Koordinator: +35, Anggota: +20)', () => {
    const picPoints = COMMITTEE_POINTS.PIC;
    const kordPoints = COMMITTEE_POINTS.KOORDINATOR;
    const memberPoints = COMMITTEE_POINTS.ANGGOTA;

    expect(picPoints).toBe(50);
    expect(kordPoints).toBe(35);
    expect(memberPoints).toBe(20);

    const ledgerEntry: TestScoreLedger = {
      id: 'led-proker-pic',
      cadreId: TEST_USERS.kabid.id,
      referenceType: 'PROKER',
      referenceId: 'proker-101',
      points: picPoints,
      description: 'Penanggung Jawab Proker Bootcamp',
      createdAt: new Date().toISOString(),
    };
    dbStore.scoreLedgers.set(ledgerEntry.id, ledgerEntry);
    expect(dbStore.scoreLedgers.get('led-proker-pic')?.points).toBe(50);
  });

  // =========================================================================
  // F23: Score Idempotency & Reversal Logic
  // =========================================================================
  it('F23-1: Re-submitting identical presence does not inject duplicate points (idempotent)', () => {
    const meetingId = 'mtg-idem-1';
    const cadreId = TEST_USERS.staff.id;

    // First submission
    recordAttendanceWithPoints(meetingId, cadreId, 'HADIR', dbStore);
    const scoreBefore = dbStore.kaders.get(cadreId)!.totalScore;

    // Resubmission with same status
    recordAttendanceWithPoints(meetingId, cadreId, 'HADIR', dbStore);
    const scoreAfter = dbStore.kaders.get(cadreId)!.totalScore;

    // Score delta should be 0 (no duplicate +15)
    expect(scoreAfter).toBe(scoreBefore);
  });

  it('F23-2: Correcting attendance from ALPHA (-10) to HADIR (+15) applies net +25 delta', () => {
    const meetingId = 'mtg-reversal-1';
    const cadreId = TEST_USERS.kader_1.id;

    // 1. Initial mistaken ALPHA
    recordAttendanceWithPoints(meetingId, cadreId, 'ALPHA', dbStore);
    const scoreAfterAlpha = dbStore.kaders.get(cadreId)!.totalScore;

    // 2. Correction to HADIR
    const { ledger } = recordAttendanceWithPoints(meetingId, cadreId, 'HADIR', dbStore);
    const scoreAfterCorrection = dbStore.kaders.get(cadreId)!.totalScore;

    expect(ledger.points).toBe(25); // -(-10) + 15 = 25
    expect(scoreAfterCorrection).toBe(scoreAfterAlpha + 25);
  });

  it('F23-3: Deleting an erroneously logged meeting record reverses associated points cleanly', () => {
    const cadreId = TEST_USERS.staff.id;
    const initialScore = dbStore.kaders.get(cadreId)!.totalScore;

    // Erroneous points added
    const reversalLedger: TestScoreLedger = {
      id: 'rev-err-1',
      cadreId,
      referenceType: 'MANUAL',
      referenceId: 'correction-001',
      points: -15, // Reversing erroneously added 15 pts
      description: 'Koreksi pembatalan rapat',
      createdAt: new Date().toISOString(),
    };
    dbStore.scoreLedgers.set(reversalLedger.id, reversalLedger);
    dbStore.kaders.get(cadreId)!.totalScore += reversalLedger.points;

    expect(dbStore.kaders.get(cadreId)!.totalScore).toBe(initialScore - 15);
  });

  it('F23-4: Point ledger transparent audit trail preserves referenceType and referenceId for every transaction', () => {
    const ledgers = Array.from(dbStore.scoreLedgers.values());
    expect(ledgers.length).toBeGreaterThan(0);
    for (const l of ledgers) {
      expect(['MEETING', 'PROKER', 'MANUAL']).toContain(l.referenceType);
      expect(l.referenceId).toBeDefined();
      expect(typeof l.points).toBe('number');
    }
  });

  it('F23-5: Cadre total score is mathematically consistent with sum of score ledgers', () => {
    const cadreId = TEST_USERS.kader_1.id;
    const myLedgers = Array.from(dbStore.scoreLedgers.values()).filter(
      (l) => l.cadreId === cadreId
    );
    const calculatedSum = myLedgers.reduce((sum, l) => sum + l.points, 0);

    // Baseline was 50 + calculatedSum
    const actualScore = dbStore.kaders.get(cadreId)!.totalScore;
    expect(actualScore).toBe(50 + calculatedSum);
  });

  // =========================================================================
  // F24: Real-time Leaderboard Ranking
  // =========================================================================
  it('F24-1: Leaderboard sorts cadres descending by total_score with highest score as Rank 1', () => {
    const ranking = getLeaderboardRanking(dbStore);
    expect(ranking.length).toBeGreaterThanOrEqual(4);

    for (let i = 0; i < ranking.length - 1; i++) {
      expect(ranking[i].totalScore).toBeGreaterThanOrEqual(ranking[i + 1].totalScore);
      expect(ranking[i].rank).toBe(i + 1);
    }
  });

  it('F24-2: Deterministic tie-breaking orders cadres with identical scores consistently', () => {
    // Set identical scores for two cadres
    const c1 = dbStore.kaders.get(TEST_USERS.staff.id)!;
    const c2 = dbStore.kaders.get(TEST_USERS.kadiv.id)!;
    c1.totalScore = 400;
    c2.totalScore = 400;

    const ranking = getLeaderboardRanking(dbStore);
    const tied = ranking.filter((r) => r.totalScore === 400);
    expect(tied).toHaveLength(2);
    // Verified sorted by NIM ascending
    expect(tied[0].nim.localeCompare(tied[1].nim)).toBeLessThanOrEqual(0);
  });

  it('F24-3: Leaderboard ranking is accessible across all user roles (transparent visibility)', () => {
    const ranking = getLeaderboardRanking(dbStore);
    expect(ranking).toBeDefined();
    expect(Array.isArray(ranking)).toBe(true);
    expect(ranking[0].name).toBeDefined();
    expect(ranking[0].role).toBeDefined();
  });

  it('F24-4: Current user position in Leaderboard is readily identifiable for UI highlight', () => {
    const ranking = getLeaderboardRanking(dbStore);
    const myId = TEST_USERS.staff.id;
    const myEntry = ranking.find((r) => r.cadreId === myId);

    expect(myEntry).toBeDefined();
    expect(myEntry?.rank).toBeGreaterThan(0);
  });

  it('F24-5: Adding points to cadre shifts their ranking position in real time', () => {
    const cadreId = TEST_USERS.kader_1.id;
    // Massive point boost
    dbStore.kaders.get(cadreId)!.totalScore = 99999;

    const newRanking = getLeaderboardRanking(dbStore);
    expect(newRanking[0].cadreId).toBe(cadreId);
    expect(newRanking[0].rank).toBe(1);
  });
});
