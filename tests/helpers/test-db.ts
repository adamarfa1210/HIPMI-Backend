import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as authSchema from "../../src/db/schema/auth.js";
import * as erpSchema from "../../src/db/schema/erp.js";
import * as cmsSchema from "../../src/db/schema/cms.js";
import { seedDatabase } from "../../src/db/seeds/initial.seed.js";
import { setTestDb } from "../../src/db/index.js";

export async function createTestDatabase() {
  const client = new PGlite();
  const testDb = drizzle(client, {
    schema: {
      ...authSchema,
      ...erpSchema,
      ...cmsSchema,
    },
  });

  // Initialize Enums & Tables
  await client.exec(`
    CREATE TYPE cadre_interest AS ENUM (
      'Kompetisi',
      'Punya Bisnis',
      'Belum Punya Bisnis',
      'Belum Punya Bisnis tapi Minat Kompetisi'
    );

    CREATE TYPE cadre_status AS ENUM (
      'Aktif',
      'Non-Aktif',
      'Alumni'
    );

    CREATE TABLE roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(60) NOT NULL UNIQUE,
      is_system_default BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE modules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code VARCHAR(40) NOT NULL UNIQUE,
      label VARCHAR(80) NOT NULL
    );

    CREATE TABLE role_permissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      can_read BOOLEAN NOT NULL DEFAULT false,
      can_create BOOLEAN NOT NULL DEFAULT false,
      can_update BOOLEAN NOT NULL DEFAULT false,
      can_delete BOOLEAN NOT NULL DEFAULT false,
      can_approve BOOLEAN NOT NULL DEFAULT false,
      CONSTRAINT idx_role_module_unique UNIQUE (role_id, module_id)
    );

    CREATE TABLE kaders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
      nim VARCHAR(20) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name VARCHAR(120) NOT NULL,
      whatsapp_number VARCHAR(20) NOT NULL,
      prodi VARCHAR(80) NOT NULL,
      fakultas VARCHAR(80) NOT NULL,
      instagram VARCHAR(60),
      business_name VARCHAR(120),
      interest_category cadre_interest NOT NULL,
      status cadre_status NOT NULL DEFAULT 'Aktif',
      total_score INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_kader_id UUID REFERENCES kaders(id) ON DELETE SET NULL,
      action VARCHAR(80) NOT NULL,
      entity_name VARCHAR(60) NOT NULL,
      entity_id UUID NOT NULL,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_kaders_nim ON kaders (nim);
    CREATE INDEX idx_kaders_total_score ON kaders (total_score);
    CREATE INDEX idx_kaders_status ON kaders (status);
    CREATE INDEX idx_kaders_prodi ON kaders (prodi);
    CREATE INDEX idx_kaders_fakultas ON kaders (fakultas);
    CREATE INDEX idx_audit_logs_actor ON audit_logs (actor_kader_id);
    CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_name, entity_id);

    -- ERP Enums
    CREATE TYPE transaction_type AS ENUM ('CASH_IN', 'CASH_OUT');
    CREATE TYPE transaction_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
    CREATE TYPE proker_bidang AS ENUM ('OKK', 'MEDKOMINFO', 'EKSTERNAL', 'EKRAF');
    CREATE TYPE proker_status AS ENUM ('PLANNED', 'ON_PROGRESS', 'COMPLETED', 'ACTIVE');
    CREATE TYPE attendance_status AS ENUM ('HADIR', 'IZIN', 'SAKIT', 'ALPHA');
    CREATE TYPE score_source_type AS ENUM ('PROKER_COMMITTEE', 'MEETING_ATTENDANCE', 'MANUAL_ADJUSTMENT', 'PROKER', 'MEETING');
    CREATE TYPE calendar_category AS ENUM ('PROKER', 'INTERNAL_MEETING', 'COMPETITION_DEADLINE', 'ORGANIZATION_HOLIDAY');

    -- ERP Tables
    CREATE TABLE transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      receipt_number VARCHAR(40) UNIQUE,
      invoice_number VARCHAR(40),
      type transaction_type NOT NULL,
      category VARCHAR(80),
      from_entity VARCHAR(120) NOT NULL DEFAULT 'Organisasi',
      to_entity VARCHAR(120) NOT NULL DEFAULT 'Pihak Terkait',
      amount NUMERIC(15, 2) NOT NULL,
      description TEXT NOT NULL,
      transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
      status transaction_status NOT NULL DEFAULT 'PENDING',
      receipt_pdf_url TEXT,
      created_by UUID REFERENCES kaders(id) ON DELETE RESTRICT,
      created_by_id UUID REFERENCES kaders(id) ON DELETE RESTRICT,
      approved_by UUID REFERENCES kaders(id) ON DELETE SET NULL,
      approved_by_id UUID REFERENCES kaders(id) ON DELETE SET NULL,
      approved_at TIMESTAMPTZ,
      rejection_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE prokers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bidang proker_bidang NOT NULL,
      title VARCHAR(120) NOT NULL DEFAULT '',
      name VARCHAR(120),
      pic_kader_id UUID REFERENCES kaders(id) ON DELETE SET NULL,
      start_date DATE NOT NULL DEFAULT CURRENT_DATE,
      end_date DATE NOT NULL DEFAULT CURRENT_DATE,
      target_date DATE,
      status proker_status NOT NULL DEFAULT 'PLANNED',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE proker_committees (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      proker_id UUID NOT NULL REFERENCES prokers(id) ON DELETE CASCADE,
      kader_id UUID REFERENCES kaders(id) ON DELETE CASCADE,
      cadre_id UUID REFERENCES kaders(id) ON DELETE CASCADE,
      committee_role VARCHAR(60) NOT NULL DEFAULT '',
      role VARCHAR(60),
      points_awarded INTEGER NOT NULL DEFAULT 20,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE meetings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      proker_id UUID REFERENCES prokers(id) ON DELETE SET NULL,
      title VARCHAR(120) NOT NULL,
      location VARCHAR(140),
      type VARCHAR(60),
      meeting_date TIMESTAMPTZ NOT NULL DEFAULT now(),
      points_per_attendance INTEGER NOT NULL DEFAULT 5,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE meeting_attendances (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      kader_id UUID REFERENCES kaders(id) ON DELETE CASCADE,
      cadre_id UUID REFERENCES kaders(id) ON DELETE CASCADE,
      status attendance_status NOT NULL,
      points_awarded INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE score_ledgers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      kader_id UUID REFERENCES kaders(id) ON DELETE CASCADE,
      cadre_id UUID REFERENCES kaders(id) ON DELETE CASCADE,
      source_type score_source_type NOT NULL DEFAULT 'MANUAL_ADJUSTMENT',
      source_id UUID,
      reference_type VARCHAR(60),
      reference_id UUID,
      points INTEGER NOT NULL,
      description VARCHAR(180) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE calendar_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      proker_id UUID REFERENCES prokers(id) ON DELETE SET NULL,
      title VARCHAR(140) NOT NULL,
      category calendar_category NOT NULL,
      start_at TIMESTAMPTZ NOT NULL,
      end_at TIMESTAMPTZ NOT NULL,
      location VARCHAR(140) NOT NULL,
      is_public BOOLEAN NOT NULL DEFAULT false,
      google_event_id VARCHAR(120),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_transactions_status_date ON transactions (status, transaction_date);
    CREATE INDEX idx_transactions_created_by ON transactions (created_by);
    CREATE INDEX idx_prokers_bidang_status ON prokers (bidang, status);
    CREATE INDEX idx_score_ledgers_kader ON score_ledgers (kader_id, created_at);
    CREATE INDEX idx_score_ledgers_idempotency ON score_ledgers (kader_id, source_type, source_id);
    CREATE INDEX idx_calendar_events_start ON calendar_events (start_at);
    CREATE INDEX idx_calendar_events_public ON calendar_events (is_public, start_at);

    -- CMS Enums
    CREATE TYPE partner_category AS ENUM (
      'Korporasi & BUMN',
      'Asosiasi & HIPMI',
      'Dinas & Inkubator',
      'Komunitas & Media',
      'Mitra Strategis'
    );

    CREATE TYPE business_sector AS ENUM (
      'Teknologi & Jasa',
      'Kuliner / F&B',
      'Kreatif & Media',
      'Fesyen & Ritel'
    );

    CREATE TYPE slot_status AS ENUM (
      'ready',
      'pending-asset'
    );

    CREATE TYPE achievement_category AS ENUM (
      'Kompetisi Bisnis',
      'Pendanaan & Hibah',
      'Tingkat Nasional',
      'Rekognisi'
    );

    CREATE TYPE bidang_slug AS ENUM (
      'okk',
      'medkominfo',
      'eksternal',
      'ekraf'
    );

    CREATE TYPE operational_pattern AS ENUM (
      'proker-only',
      'jobdesk-only',
      'proker-jobdesk'
    );

    CREATE TYPE program_kind AS ENUM (
      'proker',
      'jobdesk'
    );

    CREATE TYPE testimonial_category AS ENUM (
      'Kader & Alumni',
      'Mitra Kolaborasi'
    );

    CREATE TYPE announcement_audience AS ENUM (
      'INTERNAL',
      'PUBLIC',
      'BOTH'
    );

    -- CMS Tables
    CREATE TABLE hero_slides (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(45) NOT NULL,
      subtitle VARCHAR(180) NOT NULL,
      image_src TEXT NOT NULL,
      image_alt VARCHAR(140) NOT NULL,
      index_label VARCHAR(10),
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_published BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE tentang_profile (
      id INTEGER PRIMARY KEY DEFAULT 1,
      eyebrow VARCHAR(30) NOT NULL DEFAULT 'TENTANG HIPMI PT',
      title VARCHAR(70) NOT NULL,
      description VARCHAR(320) NOT NULL,
      secondary_description VARCHAR(280),
      video_poster_src TEXT,
      video_url TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE tentang_pillars (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(32) NOT NULL,
      description VARCHAR(120) NOT NULL,
      sort_order INTEGER NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE partners (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(35) NOT NULL,
      category partner_category NOT NULL,
      scope VARCHAR(160) NOT NULL,
      period VARCHAR(60) NOT NULL,
      status VARCHAR(30) NOT NULL,
      image_src TEXT NOT NULL,
      image_alt VARCHAR(140) NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_published BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE kader_businesses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      kader_id UUID REFERENCES kaders(id) ON DELETE SET NULL,
      business_name VARCHAR(45) NOT NULL,
      sector business_sector NOT NULL DEFAULT 'Teknologi & Jasa',
      description VARCHAR(180) NOT NULL,
      owner_label VARCHAR(45) NOT NULL DEFAULT '',
      owner_name VARCHAR(60),
      verified_label VARCHAR(40) NOT NULL DEFAULT 'Terverifikasi',
      image_src TEXT,
      image_url TEXT,
      image_alt VARCHAR(140),
      slot_status slot_status NOT NULL DEFAULT 'ready',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_published BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE achievements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(55) NOT NULL,
      category achievement_category NOT NULL,
      description VARCHAR(180) NOT NULL,
      recipient_label VARCHAR(50) NOT NULL,
      organizer_label VARCHAR(55) NOT NULL,
      image_src TEXT,
      image_url TEXT,
      image_alt VARCHAR(140),
      slot_status slot_status NOT NULL DEFAULT 'ready',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_published BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE work_program_bidangs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug bidang_slug NOT NULL UNIQUE,
      short_name VARCHAR(15) NOT NULL,
      title VARCHAR(25) NOT NULL,
      eyebrow VARCHAR(40) NOT NULL,
      description VARCHAR(240) NOT NULL,
      compartment_summary VARCHAR(50) NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE compartment_stages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bidang_id UUID NOT NULL REFERENCES work_program_bidangs(id) ON DELETE CASCADE,
      code VARCHAR(35) NOT NULL,
      name VARCHAR(35) NOT NULL,
      operational_pattern operational_pattern NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE program_slides (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      compartment_id UUID REFERENCES compartment_stages(id) ON DELETE CASCADE,
      kind program_kind NOT NULL,
      title VARCHAR(45) NOT NULL,
      description VARCHAR(200) NOT NULL,
      media_source_label VARCHAR(50),
      image_src TEXT,
      image_alt VARCHAR(140),
      slot_status slot_status NOT NULL DEFAULT 'ready',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE testimonials (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category testimonial_category NOT NULL,
      quote VARCHAR(240) NOT NULL,
      author_label VARCHAR(40) NOT NULL,
      role_or_org VARCHAR(55) NOT NULL,
      verified BOOLEAN NOT NULL DEFAULT false,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_published BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE site_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      google_docs_template_url TEXT,
      score_weight_meeting INTEGER NOT NULL DEFAULT 5,
      score_weight_proker INTEGER NOT NULL DEFAULT 10,
      cta_collaboration_href TEXT NOT NULL DEFAULT '/partnership#ajukan',
      cta_business_href TEXT NOT NULL DEFAULT '/bisnis-kader#daftar',
      cta_achievement_href TEXT NOT NULL DEFAULT '/prestasi#lapor',
      secretariat_address VARCHAR(150) NOT NULL DEFAULT 'Student Center Lantai 2, Universitas Telkom, Jl. Telekomunikasi No. 1, Terusan Buahbatu, Bandung 40257',
      official_email VARCHAR(80) NOT NULL DEFAULT 'hipmipttelkom@gmail.com',
      official_instagram VARCHAR(40) NOT NULL DEFAULT '@yechipmitelkom',
      whatsapp_contact_label VARCHAR(60) NOT NULL DEFAULT 'Humas & Kemitraan HIPMI PT Telkom',
      whatsapp_contact_url TEXT NOT NULL DEFAULT 'https://wa.me/6281234567890',
      copyright_text VARCHAR(80) NOT NULL DEFAULT '© 2026 HIPMI PT Universitas Telkom. All rights reserved.',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE announcements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(120) NOT NULL,
      content TEXT NOT NULL,
      target_audience announcement_audience NOT NULL DEFAULT 'BOTH',
      start_date TIMESTAMPTZ NOT NULL,
      end_date TIMESTAMPTZ NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Seed Default Singleton Records & 4 Bidangs
    INSERT INTO site_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
    INSERT INTO tentang_profile (id, eyebrow, title, description)
    VALUES (1, 'TENTANG HIPMI PT', 'Membentuk Karakter Wirausaha Tangguh Mahasiswa Telkom', 'HIPMI PT Universitas Telkom adalah organisasi kemahasiswaan pencetak kader pengusaha muda unggul.')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO tentang_pillars (title, description, sort_order)
    VALUES
      ('Inkubasi Bisnis Kader', 'Pendampingan intensif dari ide hingga validasi pasar untuk mencetak wirausahawan mandiri.', 1),
      ('Jejaring Kemitraan', 'Akses langsung ke ratusan jejaring pengusaha BPC dan BPD HIPMI di seluruh Indonesia.', 2),
      ('Kepemimpinan Wirausaha', 'Pelatihan tata kelola organisasi, etika bisnis, dan integritas kepemimpinan pemuda.', 3);

    INSERT INTO work_program_bidangs (slug, short_name, title, eyebrow, description, compartment_summary, sort_order)
    VALUES 
      ('okk', 'OKK', 'BIDANG OKK', 'PROGRAM KERJA BIDANG OKK', 'Bidang Organisasi, Keanggotaan, dan Kelembagaan berfokus pada pengkaderan dan pembinaan internal kader.', 'PSDM & ADKESKA', 1),
      ('medkominfo', 'MEDKOMINFO', 'BIDANG MEDKOMINFO', 'PROGRAM KERJA BIDANG MEDKOMINFO', 'Bidang Media, Komunikasi, dan Informasi mengelola citra, branding, dan publikasi digital organisasi.', 'MULTIMEDIA & HUMAS', 2),
      ('eksternal', 'EKSTERNAL', 'BIDANG EKSTERNAL', 'PROGRAM KERJA BIDANG EKSTERNAL', 'Bidang Hubungan Eksternal memperluas relasi kelembagaan, sponsorship, dan kemitraan strategis HIPMI.', 'KEMITRAAN & SPONSORSHIP', 3),
      ('ekraf', 'EKRAF', 'BIDANG EKRAF', 'PROGRAM KERJA BIDANG EKRAF', 'Bidang Ekonomi Kreatif mengakselerasi inkubasi ide bisnis, komersialisasi produk, dan jejaring usaha kader.', 'INKUBASI & BISNIS', 4)
    ON CONFLICT (slug) DO NOTHING;
  `);

  // Wire testDb into app's db proxy
  setTestDb(testDb, client);

  // Seed default roles, modules, permissions, and superadmin
  await seedDatabase(testDb);

  return {
    client,
    db: testDb,
    cleanup: async () => {
      await client.close();
    },
  };
}
