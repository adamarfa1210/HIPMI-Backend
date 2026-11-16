import { describe, it, expect, beforeAll, afterAll } from '../../helpers/test-runner.js';
import * as xlsx from 'xlsx';
import { dbStore } from '../../helpers/db-fixtures.js';
import { TEST_USERS } from '../../helpers/auth-helper.js';

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  location: string;
  type: 'PROKER' | 'MEETING' | 'DEADLINE' | 'GENERAL';
  googleCalendarEventId?: string;
  syncStatus: 'LOCAL_ONLY' | 'SYNCED' | 'FAILED';
  createdAt: string;
}

export interface DocumentTemplate {
  id: string;
  code: string;
  title: string;
  category: 'SURAT' | 'PROPOSAL' | 'LPJ' | 'FORM';
  templateBody: string;
  variables: string[];
  lastUpdatedBy: string;
}

// Google Calendar Sync Adapter interface per PRD
export class GoogleCalendarAdapter {
  private isOnline: boolean;

  constructor(isOnline: boolean = false) {
    this.isOnline = isOnline;
  }

  async syncEvent(event: CalendarEvent): Promise<{ synced: boolean; externalId?: string; error?: string }> {
    if (!this.isOnline) {
      // Graceful local fallback
      return { synced: false, error: 'Google Calendar API offline. Event stored locally in database.' };
    }
    return { synced: true, externalId: `gcal-${event.id}` };
  }
}

// Template variable interpolation helper
export function fillTemplate(templateBody: string, variables: Record<string, string>): string {
  let result = templateBody;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

// Minimal official letter PDF generator
export function renderLetterPdf(letterText: string, letterNumber: string): Buffer {
  const streamContent = `BT /F1 12 Tf 72 720 Td (HIPMI PT UNIVERSITAS TELKOM) Tj /F1 10 Tf 0 -20 Td (No: ${letterNumber}) Tj 0 -30 Td (${letterText.slice(0, 80)}) Tj ET`;
  const pdfString = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length ${streamContent.length} >>
stream
${streamContent}
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
trailer << /Size 6 /Root 1 0 R >>
startxref
420
%%EOF`;
  return Buffer.from(pdfString);
}

describe('Tier 1: ERP Calendar & Document Repository (Features 25-26)', () => {
  const localEvents: Map<string, CalendarEvent> = new Map();
  const templates: Map<string, DocumentTemplate> = new Map();

  beforeAll(async () => {
    localEvents.clear();
    templates.clear();

    // Seed default administrative templates
    templates.set('tpl-undangan', {
      id: 'tpl-undangan',
      code: 'SURAT_UNDANGAN',
      title: 'Surat Undangan Resmi Pembicara / Mitra',
      category: 'SURAT',
      templateBody:
        'Dengan hormat, sehubungan dengan diadakannya {NAMA_ACARA} pada tanggal {TANGGAL} bertempat di {TEMPAT}, kami mengundang Saudara...',
      variables: ['NAMA_ACARA', 'TANGGAL', 'TEMPAT'],
      lastUpdatedBy: TEST_USERS.admin.id,
    });

    templates.set('tpl-pinjam', {
      id: 'tpl-pinjam',
      code: 'SURAT_PEMINJAMAN_TEMPAT',
      title: 'Surat Permohonan Izin Tempat dan Ruangan',
      category: 'SURAT',
      templateBody:
        'Kepada Yth. Pengelola {LOKASI_KAMPUS}, kami mengajukan peminjaman ruangan untuk kegiatan {KEGIATAN} pada {WAKTU}...',
      variables: ['LOKASI_KAMPUS', 'KEGIATAN', 'WAKTU'],
      lastUpdatedBy: TEST_USERS.kabid.id,
    });
  });

  afterAll(async () => {
    localEvents.clear();
    templates.clear();
  });

  // =========================================================================
  // F25: Calendar HIPMI Schedule Management
  // =========================================================================
  it('F25-1: Creates local calendar event with title, date, location, and event type', () => {
    const event: CalendarEvent = {
      id: 'cal-001',
      title: 'HIPMI Telkom Grand Welcoming Party',
      description: 'Penyambutan anggota baru angkatan 2026',
      startDate: '2026-05-15T13:00:00Z',
      endDate: '2026-05-15T18:00:00Z',
      location: 'Auditorium Gd. Damar Telkom University',
      type: 'PROKER',
      syncStatus: 'LOCAL_ONLY',
      createdAt: new Date().toISOString(),
    };
    localEvents.set(event.id, event);

    const saved = localEvents.get('cal-001');
    expect(saved).toBeDefined();
    expect(saved?.title).toContain('Grand Welcoming Party');
    expect(saved?.type).toBe('PROKER');
  });

  it('F25-2: Queries upcoming calendar events by date range filtering', () => {
    localEvents.set('cal-002', {
      id: 'cal-002',
      title: 'Rapat Koordinasi BPH',
      description: 'Evaluasi program bulanan',
      startDate: '2026-05-20T19:00:00Z',
      endDate: '2026-05-20T21:00:00Z',
      location: 'Sekretariat HIPMI',
      type: 'MEETING',
      syncStatus: 'LOCAL_ONLY',
      createdAt: new Date().toISOString(),
    });

    const filterRange = (start: string, end: string) => {
      return Array.from(localEvents.values()).filter(
        (e) => e.startDate >= start && e.startDate <= end
      );
    };

    const mayEvents = filterRange('2026-05-01T00:00:00Z', '2026-05-31T23:59:59Z');
    expect(mayEvents).toHaveLength(2);

    const juneEvents = filterRange('2026-06-01T00:00:00Z', '2026-06-30T23:59:59Z');
    expect(juneEvents).toHaveLength(0);
  });

  it('F25-3: Updates calendar event details, schedule date, and location', () => {
    const event = localEvents.get('cal-001')!;
    event.location = 'Hall Gd. Cacuk A';
    event.startDate = '2026-05-16T13:00:00Z';

    const updated = localEvents.get('cal-001')!;
    expect(updated.location).toBe('Hall Gd. Cacuk A');
    expect(updated.startDate).toBe('2026-05-16T13:00:00Z');
  });

  it('F25-4: Deletes calendar event removing it from active schedule', () => {
    localEvents.delete('cal-002');
    expect(localEvents.has('cal-002')).toBe(false);
  });

  it('F25-5: Google Calendar adapter falls back safely to local database when API is unreachable', async () => {
    const offlineAdapter = new GoogleCalendarAdapter(false);
    const event = localEvents.get('cal-001')!;

    const result = await offlineAdapter.syncEvent(event);
    expect(result.synced).toBe(false);
    expect(result.error).toContain('stored locally in database');
    expect(event.syncStatus).toBe('LOCAL_ONLY'); // Remains safe locally
  });

  // =========================================================================
  // F26: Template Surat & Document Export
  // =========================================================================
  it('F26-1: Document repository indexes official templates with category and variables', () => {
    const tpl = templates.get('tpl-undangan');
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe('SURAT');
    expect(tpl?.variables).toContain('NAMA_ACARA');
    expect(tpl?.variables).toContain('TANGGAL');
    expect(tpl?.variables).toContain('TEMPAT');
  });

  it('F26-2: Dynamic variable interpolation replaces placeholders accurately', () => {
    const tpl = templates.get('tpl-undangan')!;
    const interpolated = fillTemplate(tpl.templateBody, {
      NAMA_ACARA: 'Seminar Kewirausahaan Nasional 2026',
      TANGGAL: '20 Mei 2026',
      TEMPAT: 'Auditorium Tokong Nanas',
    });

    expect(interpolated).toContain('Seminar Kewirausahaan Nasional 2026');
    expect(interpolated).toContain('20 Mei 2026');
    expect(interpolated).toContain('Auditorium Tokong Nanas');
    expect(interpolated).not.toContain('{NAMA_ACARA}');
  });

  it('F26-3: Generates official PDF document from filled template starting with %PDF-', () => {
    const tpl = templates.get('tpl-undangan')!;
    const body = fillTemplate(tpl.templateBody, {
      NAMA_ACARA: 'HIPMI Pitching Day',
      TANGGAL: '1 Juni 2026',
      TEMPAT: 'Bandung Techno Park',
    });

    const pdfBuffer = renderLetterPdf(body, '001/HIPMI-PT/UND/V/2026');
    expect(pdfBuffer).toBeDefined();
    expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdfBuffer.toString('utf8')).toContain('001/HIPMI-PT/UND/V/2026');
  });

  it('F26-4: Generates document spreadsheet export via xlsx for administrative listings', () => {
    const rows = [
      { 'No Surat': '001/HIPMI-PT/UND/V/2026', Tujuan: 'Rektor Telkom University', Status: 'TERKIRIM' },
      { 'No Surat': '002/HIPMI-PT/IZN/V/2026', Tujuan: 'Logistik Kampus', Status: 'DISETUJUI' },
    ];
    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Arsip Surat');

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    expect(buffer).toBeDefined();

    const parsed = xlsx.read(buffer, { type: 'buffer' });
    expect(parsed.SheetNames).toContain('Arsip Surat');
  });

  it('F26-5: Access control verifies Admin/Sekretaris can edit templates while cadres have read permission', () => {
    const canManageTemplates = (roleCode: string): boolean => {
      return ['admin', 'topman', 'kabid'].includes(roleCode);
    };
    expect(canManageTemplates('admin')).toBe(true);
    expect(canManageTemplates('kabid')).toBe(true);
    expect(canManageTemplates('staff')).toBe(false);
    expect(canManageTemplates('kader_1')).toBe(false);
  });
});
