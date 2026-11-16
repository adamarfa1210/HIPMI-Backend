# Backend Architecture & API Specification
## Unified Backend API (`hipmi-pt-telkom-api`) — HIPMI PT Telkom University

**Versi:** 1.0  
**Target:** Implementasi Backend (Fase 1 Testing & Fase 2 Production)  
**Catatan:** Integrasi WhatsApp Gateway dinonaktifkan/ditunda pada rilis v1.0.

---

## 1. Struktur Direktori Proyek Backend

```text
hipmi-pt-telkom-api/
├── drizzle/                    # File migrasi SQL hasil generate drizzle-kit
├── src/
│   ├── config/
│   │   ├── env.ts              # Validasi environment variables dengan Zod
│   │   ├── db.ts               # Koneksi PostgreSQL pool (postgres.js + Drizzle)
│   │   └── s3.ts               # Konfigurasi S3 client (Supabase Storage / Cloudflare R2)
│   ├── db/
│   │   ├── schema/
│   │   │   ├── auth.ts         # roles, modules, role_permissions, kaders, audit_logs
│   │   │   ├── erp.ts          # transactions, prokers, proker_committees, meetings, attendances, score_ledgers, calendar_events
│   │   │   └── cms.ts          # site_settings, announcements, hero_slides, partners, kader_businesses, achievements, testimonials, program_kerja
│   │   └── seed.ts             # Seeder default 6 roles, daftar modul, & akun Super Admin
│   ├── middlewares/
│   │   ├── auth.middleware.ts  # Verifikasi JWT Bearer Token -> inject user & role ke context
│   │   ├── rbac.middleware.ts  # Pengecekan izin dinamis (moduleCode, action: read/create/update/delete/approve)
│   │   └── error.middleware.ts # Global error handler & formatter response JSON standar
│   ├── modules/
│   │   ├── auth/               # Login NIM, get current user (/me), ubah password
│   │   ├── admin-rbac/         # Manajemen Role Matrix & bobot poin skor
│   │   ├── kaders/             # CRUD master data kader, import/export Excel, filter minat
│   │   ├── finance/            # Cash In/Out, approval workflow, generator nomor resi, summary chart
│   │   ├── tracking/           # Manajemen proker, sesi rapat, presensi, & auto-scoring engine
│   │   ├── leaderboard/        # Query peringkat kader real-time & point ledger
│   │   ├── calendar/           # CRUD agenda internal & publik
│   │   ├── cms/                # Edit UKM Profile, Header Info Berita, upload media + webhook revalidate
│   │   └── public/             # Endpoint publik read-only untuk hipmipttelkom.vercel.app
│   ├── services/
│   │   ├── media.service.ts    # Pipeline Sharp (.webp conversion, resize, EXIF strip) + S3 upload
│   │   ├── scoring.service.ts  # Kalkulasi otomatis poin kepanitiaan & presensi + update total_score
│   │   └── revalidate.service.ts # Trigger webhook POST ke Next.js web profil publik
│   ├── app.ts                  # Inisialisasi Hono app, CORS, logger, & registrasi route
│   └── index.ts                # Entry point server (Node.js serve / Vercel export)
├── drizzle.config.ts
├── package.json
└── tsconfig.json
```

---

## 2. Format Response API Standar

Seluruh *endpoint* mengembalikan struktur JSON yang seragam:

```json
{
  "success": true,
  "message": "Data berhasil diambil",
  "data": {},
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 145
  }
}
```

---

## 3. Spesifikasi Endpoint API

### A. Public Endpoints (Tanpa Token — Dikonsumsi Web Profil `hipmipttelkom.vercel.app`)
* `GET /api/public/home` — Mengambil `hero_slides` aktif, `site_settings`, `announcements` publik, dan statistik otomatis (jumlah bidang, kompartemen, proker, mitra).
* `GET /api/public/partners` — Daftar mitra terurut (`sort_order ASC`).
* `GET /api/public/kader-businesses` — Daftar bisnis kader terpublikasi.
* `GET /api/public/achievements` — Daftar prestasi kader terpublikasi.
* `GET /api/public/program-kerja/:bidang` — Detail bidang beserta relasi `compartment_stages` dan `program_slides`.
* `GET /api/public/testimonials` — Daftar testimoni dengan filter wajib `verified = true`.
* `GET /api/public/calendar` — Agenda kegiatan dengan filter `is_public = true`.

### B. Auth & Profile Endpoints (Protected — Semua Role Terautentikasi)
* `POST /api/auth/login` — Body: `{ nim, password }`. Mengembalikan `accessToken` (JWT) dan profil user beserta matriks izin modul miliknya.
* `GET /api/auth/me` — Mengembalikan profil kader aktif, skor saat ini, dan daftar modul yang diizinkan untuk ditampilkan di Sidebar ERP.
* `PATCH /api/auth/change-password` — Pembaruan password mandiri oleh kader.

### C. Core ERP Endpoints (Protected — Validasi via `rbacMiddleware(moduleCode, action)`)

1. **Dashboard Summary (`GET /api/dashboard/summary`)**
   * Menghitung indeks keaktifan rata-rata kader, total kader terdata vs status `Aktif`, proporsi *Pie Chart* Proker (`PLANNED`, `ON_PROGRESS`, `COMPLETED`), serta agenda terdekat.
2. **Database Kader (`/api/kaders`)**
   * `GET /` — List kader dengan query filter (`search`, `prodi`, `fakultas`, `interest_category`, `status`, `role_id`, `page`, `limit`).
   * `POST /` — Tambah kader baru (hashing password otomatis).
   * `POST /import` — Bulk insert/upsert dari file Excel/CSV.
   * `PATCH /:id` & `DELETE /:id` — Perbarui data atau status keaktifan kader.
3. **Keuangan & Resi Otomatis (`/api/finance`)**
   * `GET /summary` — Saldo bersih (`SUM(CASH_IN) - SUM(CASH_OUT)` status `APPROVED`), keuntungan periode berjalan, dan agregasi per bulan untuk *Line Chart*.
   * `GET /transactions` — Riwayat transaksi dengan filter tanggal, jenis, dan status.
   * `POST /transactions` — Input transaksi baru (status awal wajib `PENDING`).
   * `PATCH /transactions/:id/approve` *(Izin `can_approve`)* — Mengubah status ke `APPROVED` atau `REJECTED`. Jika `APPROVED`, sistem otomatis men-generate nomor resi (`INV/HIPMI/YYYY/XXXX`) dan mencatat `approved_by` serta `approved_at`.
4. **Tracking Kader & Auto-Scoring (`/api/tracking`)**
   * `GET /prokers`, `POST /prokers`, `PATCH /prokers/:id` — Manajemen Program Kerja.
   * `POST /prokers/:id/committees` — Menambahkan panitia proker dan otomatis menambahkan poin ke `score_ledgers` serta `kaders.total_score`.
   * `POST /meetings` — Membuat sesi rapat baru.
   * `POST /meetings/:id/attendances` — Input presensi massal (`HADIR`, `IZIN`, `SAKIT`, `ALPHA`). Setiap status `HADIR` otomatis memicu *Scoring Engine*.
5. **Leaderboard Kader (`GET /api/leaderboard`)**
   * Terbuka untuk seluruh role yang terautentikasi. Mengurutkan kader berdasarkan `total_score DESC` dan mengembalikan `point_ledger` detail per kader saat diklik.
6. **Calendar HIPMI (`/api/calendar`)**
   * `GET /`, `POST /`, `PATCH /:id`, `DELETE /:id` — Pengelolaan jadwal. Jika `is_public` bernilai `true`, otomatis memicu *revalidation* web profil.
7. **CMS Web Profile & Header Info Berita (`/api/cms`)**
   * `GET /settings`, `PATCH /settings` — Mengatur `site_settings` termasuk `google_docs_template_url`.
   * `CRUD /announcements` — Mengelola **Header Info Berita** (`INTERNAL`, `PUBLIC`, `BOTH`).
   * `CRUD /hero-slides`, `/partners`, `/kader-businesses`, `/achievements`, `/testimonials`, `/program-kerja` — Mengelola konten web profil dengan validasi karakter ketat sesuai `BACKEND-REQUIREMENTS.md`.
   * `POST /media/upload` — Menerima `multipart/form-data`, memvalidasi dimensi minimum & tipe file, mengonversi ke `.webp` via `sharp`, mengunggah ke S3, dan mengembalikan URL publik.
8. **Admin Role Matrix (`/api/admin/rbac`)**
   * `GET /matrix` — Mengambil daftar seluruh `roles`, `modules`, dan mapping `role_permissions`.
   * `PUT /matrix/:roleId` — Menyimpan perubahan hak akses (`can_read`, `can_create`, `can_update`, `can_delete`, `can_approve`) per modul untuk role tertentu (role `Admin` dikunci agar tidak kehilangan akses ke modul `settings`).

---

## 4. Aturan Logika Bisnis Kritis (Business Logic Guardrails)

1. **Idempotency pada Auto-Scoring:** Sebelum menambahkan poin dari kepanitiaan atau presensi rapat ke `score_ledgers`, sistem wajib memeriksa kombinasi `(kader_id, source_type, source_id)`. Jika presensi diubah dari `HADIR` menjadi `IZIN`, poin terkait di `score_ledgers` otomatis ditarik/dikurangi dalam satu transaksi database (`db.transaction`).
2. **Integritas Saldo Keuangan:** Transaksi yang sudah berstatus `APPROVED` tidak dapat diedit nominalnya ataupun dihapus secara permanen; koreksi hanya dilakukan melalui transaksi penyesuaian baru agar riwayat resi tetap auditabel.
3. **Otomatisasi Revalidate Web Profil:** Setiap mutasi (`POST`, `PATCH`, `DELETE`) pada endpoint `/api/cms/*` dan `/api/calendar` (yang bersifat publik) secara asinkron memanggil `POST {PUBLIC_WEB_URL}/api/revalidate` dengan header `x-revalidate-secret`.