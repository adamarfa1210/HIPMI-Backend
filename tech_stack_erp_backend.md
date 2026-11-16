# Tech Stack & Architecture Specification
## Sistem Informasi Manajemen (ERP) & Unified Backend API — HIPMI PT Telkom University

**Versi:** 1.0  
**Cakupan:** Frontend ERP Internal (`hipmi-pt-telkom-erp`) & Unified Backend API (`hipmi-pt-telkom-api`)  
**Integrasi Eksternal:** Website Company Profile (`hipmipttelkom.vercel.app`)  
**Target Infrastruktur:**
* **Fase 1 (Testing & CMS Web Profile):** Vercel + Supabase Cloud (PostgreSQL & S3 Storage)
* **Fase 2 (Production Release >500 Users):** VPS 2 vCPU / 4 GB RAM (PostgreSQL 16 + Hono API + Caddy) + Cloudflare R2

---

## 1. Arsitektur Umum (Decoupled Multi-Frontend, Single Backend)

Sistem menerapkan arsitektur **Single Source of Truth**:
1. **Web Profil Publik (`hipmipttelkom.vercel.app`):** Sudah berjalan menggunakan Next.js App Router. Mengambil data dari *Public Endpoints* backend dan menerima *webhook* ISR Revalidation saat data diperbarui melalui CMS ERP.
2. **Portal ERP Internal (`hipmi-pt-telkom-erp`):** Aplikasi Next.js terpisah untuk operasional internal (Database Kader, Keuangan, Tracking Proker, Leaderboard, Calendar, dan CMS Web Profile).
3. **Unified Backend API (`hipmi-pt-telkom-api`):** Satu layanan REST API berbasis TypeScript yang melayani kedua frontend di atas dengan pemisahan otorisasi (*Public Read-Only* vs *JWT + Dynamic RBAC Protected*).

---

## 2. Frontend ERP Stack (`hipmi-pt-telkom-erp`)

| Lapisan | Teknologi | Alasan & Peran dalam Sistem |
| :--- | :--- | :--- |
| **Framework & Bahasa** | **Next.js (App Router) + TypeScript (Strict)** | Konsisten dengan web profil publik, mendukung *route groups* `(auth)` dan `(dashboard)` secara terisolasi. |
| **Styling & Design System** | **Tailwind CSS v4 + `tokens.css`** | Mempertahankan palet Emerald-Lime-Cream (`#06231D`, `#0C342C`, `#FFFDEE`, `#E3EF26`, `#E2FBCE`) serta tipografi `Montserrat` & `Inter` dengan adaptasi *Light-First Workspace* (`#FFFDEE` canvas + `#06231D` sidebar). |
| **UI Primitives** | **shadcn/ui (Radix UI)** | Komponen aksesibel (*Dialog, Dropdown, Popover, Tabs, Checkbox Matrix, Toast, Sheet*) yang mematuhi target sentuh minimal `44px` dan navigasi keyboard. |
| **Data Table** | **TanStack Table v8** | Mengelola tabel Database Kader dan Riwayat Transaksi Keuangan dengan fitur *sorting*, *multi-filter* (Prodi, Fakultas, Minat, Status), *pagination*, dan *column toggle*. |
| **Data Visualization** | **Recharts** | Merender **Line Chart Pemasukan & Pengeluaran** dan **Pie Chart Proker Selesai** menggunakan warna brand (`#076653` & `#E3EF26`). |
| **Server State & Cache** | **TanStack Query (React Query)** | Sinkronisasi state *real-time*, *optimistic updates* pada Role Matrix Admin dan *approval* transaksi keuangan. |
| **Form & Validasi** | **React Hook Form + Zod** | Menerapkan batas karakter keras (`BACKEND-REQUIREMENTS.md`) lengkap dengan penghitung karakter *real-time* di modul CMS. |
| **Kalender Interaktif** | **FullCalendar (`@fullcalendar/react`)** | Menampilkan jadwal Proker, Rapat Internal, dan Event Publik dalam tampilan bulanan/mingguan. |
| **Image Cropper** | **`react-easy-crop`** | Memastikan foto yang diunggah pengurus di modul Edit UKM Profile sudah terpotong sesuai rasio wajib (`16:9`, `4:5`, `1:1`). |
| **Export & Print** | **SheetJS (`xlsx`) + `@react-pdf/renderer`** | `xlsx` untuk ekspor laporan keuangan & database kader ke Excel; `@react-pdf/renderer` & `@media print` untuk cetak **Resi Otomatis** dan laporan PDF. |

---

## 3. Backend API Stack (`hipmi-pt-telkom-api`)

Dirancang ringan agar konsumsi RAM tetap di bawah **200 MB** saat berjalan di VPS 2 vCPU / 4 GB RAM bersama PostgreSQL:

| Lapisan | Teknologi | Alasan & Peran dalam Sistem |
| :--- | :--- | :--- |
| **Runtime & Web Framework** | **Node.js 22 LTS + Hono** | Framework web ultra-ringan, 100% *TypeScript-first*, mendukung adapter untuk **Vercel Serverless** (Fase 1) maupun **Node.js Server di VPS** (Fase 2) tanpa mengubah kode *controller*. |
| **Database & ORM** | **PostgreSQL 16 + Drizzle ORM (`drizzle-kit`)** | *Type-safe* SQL builder dengan jejak memori jauh lebih kecil dibanding Prisma, mendukung transaksi `ACID` untuk keuangan dan *auto-scoring*. |
| **Autentikasi & Keamanan** | **JWT (`jose`) + Argon2 / Bcrypt** | Autentikasi berbasis **NIM & Password** (independen dari Supabase Auth agar bebas *vendor lock-in*) dilengkapi *Middleware Dynamic RBAC* per modul. |
| **Validasi Request** | **Zod (`@hono/zod-validator`)** | Validasi skema input API dan sanitasi *plain-text* (menolak HTML/Markdown tag serta karakter dekoratif pada konten CMS). |
| **Media Processing** | **Sharp** | Mengonversi unggahan gambar mentah (maks 5 MB) menjadi format `.webp` (kualitas 82–85, *strip* EXIF) sebelum dikirim ke Object Storage. |
| **Object Storage Client** | **AWS SDK v3 (`@aws-sdk/client-s3`)** | Berkomunikasi melalui protokol standar S3 sehingga kompatibel dengan **Supabase Storage S3** (Fase 1) maupun **Cloudflare R2 / MinIO** (Fase 2). |

---

## 4. Strategi Migrasi Tanpa Lock-In (Supabase Cloud -> VPS PostgreSQL)

Untuk menghindari *overhead* RAM dari Supabase Self-Hosted (~3 GB RAM idle) pada VPS 4 GB RAM, sistem menggunakan pendekatan **Standard Protocol Abstraction**:

1. **Database Portability:** Aplikasi tidak menggunakan `@supabase/supabase-js` untuk query data. Seluruh akses database melewati `DATABASE_URL` PostgreSQL standar menggunakan Drizzle ORM. Migrasi dari Supabase Cloud ke VPS cukup menggunakan `pg_dump` dan `pg_restore`.
2. **Auth Portability:** Login menggunakan NIM & Password dikelola langsung oleh tabel `kaders` dan `roles` di PostgreSQL dengan token JWT dari server backend.
3. **Storage Portability:** Unggahan media menggunakan protokol S3 (`S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`). Pemindahan file dari Supabase Storage ke Cloudflare R2 hanya memerlukan sinkronisasi bucket (`rclone`) dan pembaruan variabel `.env`.
4. **Template Surat (V1):** Disederhanakan menjadi tautan eksternal terkonfigurasi (`google_docs_template_url` pada tabel `site_settings`) yang mengarahkan pengguna langsung ke folder master Google Docs persuratan organisasi.