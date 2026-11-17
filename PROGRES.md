# Catatan Progres Proyek
## HIPMI PT Telkom Integrated Management System, Headless CMS & Web UKM Profile

**Tanggal Pembaruan:** 17 November 2026 (Sesi Sore)  
**Status Keseluruhan:** **Seluruh Modul Operasional ERP (`/proker`, `/leaderboard`, `/keuangan/pengajuan`, `/keuangan`, `/kader`, `/kalender`, `/settings`), Fitur Berita HIPMI (Internal ERP + Web Profil UKM + Prioritas Urutan), Optimasi Upload Gambar WebP, dan Sidebar Fixed sudah selesai, terverifikasi, dan Live di Production.**

---

## 1. Peta Repository & URL Production Live

| Komponen | Direktori Lokal | Repository GitHub (`main`) | URL Live Production |
| :--- | :--- | :--- | :--- |
| **Backend API & Headless CMS** | `C:\Users\Adam Arfa\Documents\Project\Test Repo\HIPMI PT TELKOM SISTEM` | `https://github.com/adamarfa1210/HIPMI-Backend` | `https://hipmi-backend.vercel.app` |
| **Frontend Portal ERP & CMS** | `C:\Users\Adam Arfa\Documents\Project\Test Repo\HIPMI ERP` | `https://github.com/adamarfa1210/HIPMI-Sistem` | `https://hipmi-pt-telkom-erp.vercel.app` |
| **Web Profil Publik UKM** | `C:\Users\Adam Arfa\Documents\Project\Test Repo\hipmi-pt-telkom-web` | `https://github.com/adamarfa1210/HIPMI-UKM-profile` | `https://hipmipttelkom.vercel.app` |
| **Database & Object Storage** | — | Supabase (`ap-southeast-2`, Transaction Pooler `:6543`) | Bucket S3: `hipmi-media` |

---

## 2. Pencapaian Segmen 1 – 3 & Production Rollout

### A. Segmen 1 — Kelengkapan Desain UI/UX FigCraft (Selesai)
- Melengkapi seluruh 12 layar ERP & CMS pada [ui-ux-hipmi-pt-telkom.figcraft](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/HIPMI%20PT%20TELKOM%20SISTEM/ui-ux-hipmi-pt-telkom.figcraft) & [ui-ux-hipmi-erp-cms.pdf](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/HIPMI%20PT%20TELKOM%20SISTEM/ui-ux-hipmi-erp-cms.pdf) (termasuk Login, Admin RBAC Matrix, Calendar, Header Info Berita & Template Surat, CMS 8-Section & Image Cropper Modal, Finance Analytics, serta Mobile 390px) dan memperbarui logo menjadi Dual Brand Logo (`logo-bintang.png` + `logo-hipmi-pt-telkom.png`). Salinan sinkron ke `hipmi-pt-telkom-docs`.

### B. Segmen 2 — Backend API, Supabase & Koneksi Web UKM Profile (Selesai & Live)
- **Database & Storage Supabase:**
  - Migrasi Drizzle `0000`–`0002` ([0002_nullable_cms_media.sql](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/HIPMI%20PT%20TELKOM%20SISTEM/drizzle/0002_nullable_cms_media.sql)) berhasil diterapkan ke Supabase (`24 tables` + media nullable).
  - [src/db/index.ts](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/HIPMI%20PT%20TELKOM%20SISTEM/src/db/index.ts) dioptimalkan otomatis memakai Supabase Transaction Pooler (`:6543`, `max: 10`, `idle_timeout: 20`, `prepare: false`) saat berjalan di Vercel Serverless agar bebas `EMAXCONNSESSION`.
  - [src/modules/public/public.service.ts](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/HIPMI%20PT%20TELKOM%20SISTEM/src/modules/public/public.service.ts) memparalelkan query `/api/public/home` dengan `Promise.all` (memangkas latensi dari ~5.000 ms menjadi **1.963 ms** di production).
  - [api/index.ts](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/HIPMI%20PT%20TELKOM%20SISTEM/api/index.ts) menggunakan `getRequestListener(app.fetch)` dari `@hono/node-server` dengan `maxDuration: 60` pada [vercel.json](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/HIPMI%20PT%20TELKOM%20SISTEM/vercel.json), tanpa mengubah entrypoint VPS (`src/index.ts`).
  - [src/services/revalidate.service.ts](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/HIPMI%20PT%20TELKOM%20SISTEM/src/services/revalidate.service.ts) & [src/modules/cms/cms.service.ts](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/HIPMI%20PT%20TELKOM%20SISTEM/src/modules/cms/cms.service.ts) menyinkronkan `REVALIDATE_SECRET` dan melakukan `await` webhook `/api/revalidate`.
- **Web UKM Profile (`hipmi-pt-telkom-web`):**
  - Seluruh halaman (`/` , `/partnership`, `/bisnis-kader`, `/prestasi`, `/program-kerja/[bidang]`, `/testimoni`) telah beralih menjadi dynamic SSR (`ƒ`) yang mengambil data langsung dari `https://hipmi-backend.vercel.app/api/public/*` tanpa fallback data statis/mock, lengkap dengan empty state pada Navbar, Footer, dan halaman Bidang serta endpoint `POST /api/revalidate`.
  - [VideoModal.tsx](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/hipmi-pt-telkom-web/src/components/VideoModal.tsx) (`getYouTubeEmbedUrl`) kini mendukung pemutaran URL YouTube (`youtu.be`, `watch?v=`, `shorts/`, `live/`, `embed/`) via `<iframe>` serta tetap mendukung video `.mp4`.

### C. Segmen 3 — Fondasi Frontend CMS Web UKM Profile & Login (`HIPMI ERP`) (Selesai & Live)
- Dibangun pada `C:\Users\Adam Arfa\Documents\Project\Test Repo\HIPMI ERP`:
  - **Login Page & Auth RBAC:** [login/page.tsx](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/HIPMI%20ERP/src/app/login/page.tsx), [auth.tsx](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/HIPMI%20ERP/src/lib/auth.tsx), [api.ts](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/HIPMI%20ERP/src/lib/api.ts) (`normalizeAuthUser`, `normalizePermissions`, `hasPermission`, `authEpochRef`), dan [AppShell.tsx](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/HIPMI%20ERP/src/components/AppShell.tsx).
  - **Editor 8-Section CMS + Image Cropper:** [cms/page.tsx](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/HIPMI%20ERP/src/app/cms/page.tsx), [HeroTentangSections.tsx](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/HIPMI%20ERP/src/components/cms/HeroTentangSections.tsx), [DirectorySections.tsx](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/HIPMI%20ERP/src/components/cms/DirectorySections.tsx), [ProkerSettingsSections.tsx](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/HIPMI%20ERP/src/components/cms/ProkerSettingsSections.tsx), dan [ImageCropperModal.tsx](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/HIPMI%20ERP/src/components/ImageCropperModal.tsx).
  - **Akun Admin Aktif di Database:**
    - Superadmin seeded: NIM `1201220001` (Role: `Admin`, akun bawaan seed).
    - Akun tambahan terdaftar: NIM `104012400205` (Nama: `Alwin`, Role: `Admin`, Status: `Aktif`).

### D. Segmen 4 — Modul Operasional ERP, Fitur Berita Terpisah & Prioritas Urutan, Upload WebP, serta Sidebar Fixed (Selesai & Live)
- **Modul Operasional ERP Lengkap (`HIPMI PT TELKOM SISTEM` + `HIPMI ERP`):**
  - **Proker & Leaderboard (`487b226`, `f06b448`):** Halaman `/proker` (progress program kerja, presensi & notulensi rapat) dan `/leaderboard` (audit poin keaktifan kader), lengkap dengan endpoint `GET /api/tracking/prokers/:id` dan `GET /api/tracking/meetings`.
  - **Keuangan Terpisah (`a610a94`, `1b2ec06`, `937ffc1`):** Memisahkan modul **Pengajuan Keuangan** (`/keuangan/pengajuan`, modul `finance-request`) dan **Persetujuan & Kas** (`/keuangan`, modul `finance` + preview resi kas PDF) agar pemisahan role pengaju vs bendahara/approver berjalan ketat.
  - **Database Master Kader (`aa44cf6`, `11c02c2`):** Halaman `/kader` untuk direktori kader, import/export, serta endpoint `GET /api/kaders/roles` & `POST /api/kaders/:id/reset-password`.
  - **Calendar HIPMI (`d05552d`, `dcf667a`):** Halaman `/kalender` dengan tampilan bulanan, daftar jadwal, dan CRUD agenda (`PATCH`/`DELETE /api/calendar/:id`) tersimpan di database PostgreSQL.
  - **Settings Hak Akses Dinamis (`875152c`):** Halaman `/settings` mengelola matriks izin **6 role** (`Admin`, `Topman`, `Kabid`, `Kadiv`, `Staff`, `Kader 1`) × **12 modul** (`72` baris izin) dengan 5 opsi (`Read`, `Create`, `Update`, `Delete`, `Approve`).
- **Berita HIPMI (ERP Internal & Web Profil UKM) + Prioritas Tingkatan (`858031e`, `d1fa020`, `50e5e93`, `2750be0`, `d6b8897`, `b4eb551`):**
  - Menghapus ticker `INFO TERKINI` dari topbar ERP ([AppShell.tsx](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/HIPMI%20ERP/src/components/AppShell.tsx)) maupun Navbar Web UKM ([Navbar.tsx](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/hipmi-pt-telkom-web/src/components/Navbar.tsx)), serta merapikan Tab 8 `/cms` menjadi `8. Settings Web & Kontak`.
  - Menambah tabel `news_articles` (dengan `sort_order`, `target_audience` `INTERNAL` | `PUBLIC` | `BOTH`, `is_featured`, `is_published`) di Supabase & backend, endpoint publik (`/api/public/news`, `/api/public/news/:id`), endpoint ERP (`/api/news`, `/api/news/manage`, `PATCH /api/news/manage/reorder`), serta 2 modul RBAC (`news` & `news-manage`) yang dapat diatur di `/settings`.
  - Di Web UKM ([/berita](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/hipmi-pt-telkom-web/src/app/berita/page.tsx) & [/berita/[id]](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/hipmi-pt-telkom-web/src/app/berita/%5Bid%5D/page.tsx)), tab **Berita** hadir di Navbar & Footer dengan layout **1 kotak utama besar di atas + grid 3 kolom di bawah** serta filter kategori.
  - Di ERP, `/berita` mempertahankan sidebar & desain ERP (`AppShell`), sedangkan `/berita/kelola` dilengkapi kontrol geser **naik/turun (`↑` / `↓`) di sisi kiri list** untuk menentukan berita peringkat `#1` yang tampil sebagai **Banner Hero** & **Kotak Paling Atas** di tab *Semua Berita* web publik.
- **Perbaikan Upload Gambar & Akses Media (`ce59ca0`, `a1bdbe2`):**
  - Mengoptimalkan [ImageCropperModal.tsx](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/HIPMI%20ERP/src/components/ImageCropperModal.tsx) agar hasil crop dikonversi ke **WebP/JPEG terkompresi (`<= 3,8 MB`, sisi terpanjang maks `1920 px`)** dengan batas file mentah `15 MB` agar tidak ditolak gateway Vercel `4,5 MB` (`Failed to fetch`), menambah helper error jaringan di [api.ts](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/HIPMI%20ERP/src/lib/api.ts), serta mengizinkan modul `news-manage` mengunggah media lewat `rbacAnyMiddleware` di [media.routes.ts](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/HIPMI%20PT%20TELKOM%20SISTEM/src/modules/media/media.routes.ts).
- **Perbaikan UI Sidebar ERP (`8470269`, `a96c41c`, `3fdf735`):**
  - Sidebar desktop pada [AppShell.tsx](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/HIPMI%20ERP/src/components/AppShell.tsx) kini bertipe **fixed** (`lg:fixed lg:inset-y-0 lg:left-0`) dengan cardbox logo HIPMI terpasang tetap di atas dan cardbox akun terpasang tetap di bawah, sehingga hanya daftar modul di tengah yang dapat di-scroll dengan scrollbar tersembunyi (`.no-scrollbar` di [globals.css](file:///C:/Users/Adam%20Arfa/Documents/Project/Test%20Repo/HIPMI%20ERP/src/app/globals.css)).

---

## 3. Ringkasan Pengujian Terakhir yang Terverifikasi

1. **Test Otomatis & Build Lokal (Sesi Terbaru):**
   - Backend (`HIPMI PT TELKOM SISTEM`): `npm run build` (`tsc`) lulus; Vitest `tests/rbac.test.ts` + `tests/news.test.ts` lulus **`11/11`** (termasuk RBAC 72 matriks, isolasi tag penempatan berita, dan `PATCH /api/news/manage/reorder`). Suite Segmen 2–3 (`auth`, `kader`, `rbac`, `erp`, `cms`, `char-limits-boundaries`) sebelumnya lulus `6/6` file (`156/156` tests).
   - Frontend ERP (`HIPMI ERP`): `npx tsc --noEmit` lulus, `node --test src/lib/api.test.mjs` lulus **`7/7`**, `npm run build` lulus (`15/15` static pages pada 13 rute termasuk `/berita`, `/berita/kelola`, `/settings`, `/proker`, `/leaderboard`, `/keuangan`, `/keuangan/pengajuan`, `/kader`, `/kalender`, `/cms`).
   - Web UKM Profile (`hipmi-pt-telkom-web`): `npx tsc --noEmit` lulus, `npm run build` lulus (seluruh rute dynamic `ƒ` termasuk `/berita` & `/berita/[id]`), dan `node --test src/services/web-cycle.test.mjs` lulus **`1/1`** (termasuk verifikasi absennya `INFO TERKINI` & isolasi berita `INTERNAL` vs `PUBLIC`).
2. **Pengujian Live Production (Chrome DevTools & Endpoint Probe):**
   - Verifikasi isolasi tag berita (`INTERNAL` hanya di `/berita` ERP dan `404` di `/berita/[id]` UKM; `PUBLIC` tampil di `https://hipmipttelkom.vercel.app/berita`), penggeseran prioritas `#1`/`#2` via tombol `↑`/`↓` kiri list + persistensi setelah reload, dan pembersihan data uji kembali hingga `0` artikel uji.
   - Uji upload foto nyata dari Notch ([IMG_4195.jpeg](file:///C:/Users/Adam%20Arfa/Downloads/IMG_4195.jpeg), `4032×2268 px`, `2,9 MB`) melalui `ImageCropperModal` → terkompresi menjadi `1920×1080 px` WebP (`234.490 bytes`), `POST /api/media/upload` (`201`), simpan berita baru (`201`), lalu dibersihkan kembali (`200`).
   - Uji sidebar fixed di Chrome (`https://hipmi-pt-telkom-erp.vercel.app/settings`): `position: "fixed"`, scroll hanya pada kontainer modul (`scrollHeight: 755`, `clientHeight: 610`), `brandBox` (`top: 16`) & `accountBox` (`bottom: 750`) terkunci, dan `scrollbarWidth: "none"`.

---

## 4. Rencana Tahap Selanjutnya (Opsional / Backlog)

1. **Optimasi Performa & Rencana Migrasi VPS:**
   - **Jika tetap di Vercel:** Pindahkan region eksekusi ke `sin1` / `syd1` pada `vercel.json` dan ganti `force-dynamic` + `cache: "no-store"` di Web UKM menjadi tag-based ISR (`next: { tags }`) agar memanfaatkan webhook `/api/revalidate` (saat ini request lintas `sin1 → iad1 (AS) ↔ Supabase Sydney` memakan ±738–2.530 ms).
   - **Jika pindah penuh ke VPS:** Backend sudah mendukung PostgreSQL standar (`DATABASE_URL`) tanpa SDK Supabase dan mendukung `STORAGE_DRIVER=local` (`/uploads`) atau `s3` (MinIO) tanpa kehilangan fitur aplikasi; cukup migrasi dump DB + aset bucket `hipmi-media` serta siapkan Nginx/Caddy + cron backup `pg_dump`.
2. **Pengisian Konten & Aset Resmi Organisasi:** Mengunggah foto resmi section CMS UKM dan menayangkan artikel berita perdana melalui `https://hipmi-pt-telkom-erp.vercel.app/berita/kelola`.
3. **Modul Tambahan (Bila Diperlukan):** Penyelarasan `tests/e2e/tier3-cross-feature/` serta fitur *Template Surat / Dokumen* di ERP jika masuk agenda berikutnya.
