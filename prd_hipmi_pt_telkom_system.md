# PRODUCT REQUIREMENTS DOCUMENT (PRD)
**Nama Produk:** HIPMI PT Telkom Integrated Management System & Web Profile  
**Versi:** 1.1 (Updated Architecture & Scope)  
**Target Pengguna:** Pengurus & Kader HIPMI PT Telkom University  
**Status:** Ready for Architecture & Development  

---

## 1. Ringkasan Eksekutif & Tujuan Produk
Sistem ini adalah platform terpadu berbasis web yang menggabungkan **Dashboard Manajemen Internal Organisasi** dan **Headless Backend API** untuk melayani **Website Profil Publik HIPMI PT Telkom** (di repo terpisah `hipmi-pt-telkom-web`). Sistem bertujuan mendigitalisasi pendataan kader, transparansi arus kas, pemantauan keaktifan (gamifikasi via *leaderboard*), kalender terpadu, serta menyediakan kontrol penuh kepada **Admin** untuk mengatur hak akses (RBAC dinamis) tiap jabatan pengurus.

* **Strategi Deployment:** Fase awal menggunakan **Vercel + Supabase (PostgreSQL & Supabase Storage)**, dan dirancang **portable** untuk bermigrasi penuh ke **VPS** (PostgreSQL + Disk Lokal VPS) tanpa mengubah logika bisnis.

---

## 2. Arsitektur Peran & Hak Akses Dinamis (Dynamic RBAC)
Sistem menerapkan pendekatan **Module-First & Admin-Controlled RBAC**:

* **Daftar Role Bawaan:**
  1. `Admin` (Superuser — memegang akses penuh secara *default* ke seluruh modul & konfigurasi sistem)
  2. `Topman` (Top Management / BPH Inti)
  3. `Kepala Bidang & Sekretaris Bidang`
  4. `Kepala Kompartemen`
  5. `Staff`
  6. `Kader 1` (Anggota Tingkat Dasar)

* **Mekanisme Pengaturan Hak Akses (Role Matrix di Dashboard Admin):**
  * Secara *default*, seluruh modul baru hanya aktif untuk role `Admin`.
  * Di dalam **Dashboard Admin**, tersedia matriks konfigurasi per Role untuk menentukan visibilitas dan izin aksi (CRUD: *Create, Read, Update, Delete, Approve*) pada masing-masing modul.
  * Admin juga dapat melakukan *override* atau menambah/mengubah izin modul sewaktu-waktu tanpa perlu mengubah kode program.

---

## 3. Spesifikasi Fungsional Per Modul

### 3.1. Autentikasi & Database Kader
* **Autentikasi:**
  * Login menggunakan kombinasi **NIM** dan **Password**.
  * Fitur *Forgot Password* melalui mekanisme **Reset Password oleh Admin** (atau token reset internal, tanpa OTP WhatsApp).
* **Master Data Kader:**
  * Nama Lengkap
  * NIM (*Unique Identifier*)
  * Nomor WhatsApp Aktif
  * Program Studi (Prodi)
  * Fakultas
  * Username Instagram
  * Nama / Jenis Bisnis Kader (*Opsional / Jika ada*)
  * Kategori Minat *(Single/Multi-select)*:
    1. Kompetisi
    2. Punya Bisnis
    3. Belum Punya Bisnis
    4. Belum Punya Bisnis tapi Minat Kompetisi
  * Status Keaktifan Kader (`Aktif` / `Non-Aktif` / `Alumni`) & Role Organisasi.
* **Fitur Tambahan:** Pencarian, filter berdasarkan Prodi/Fakultas/Minat/Role, serta fitur *Import/Export* data kader (Excel/CSV).

---

### 3.2. Dashboard Utama (Executive Summary)
Menampilkan ringkasan metrik organisasi secara *real-time* dalam satu layar:
* **KPI Card 1 — Keaktifan Kader (Total):** Persentase atau indeks rata-rata keaktifan seluruh kader berdasarkan akumulasi skor.
* **KPI Card 2 — Total Kader Terdata & Aktif:** Perbandingan jumlah total kader dalam database vs kader yang berstatus aktif.
* **Visualisasi — Pie Chart Proker Selesai:** Proporsi status seluruh Program Kerja (`Selesai`, `Sedang Berjalan`, `Belum Terlaksana`).
* **Ringkasan Cepat:** Pintasan menuju agenda terdekat (Calendar HIPMI) dan pengumuman terbaru (Header Info Berita).

---

### 3.3. Keuangan & Resi Otomatis
* **Ringkasan Finansial:**
  * **Saldo Saat Ini:** Total kas bersih yang tersedia saat ini.
  * **Keuntungan Saat Ini:** Selisih bersih antara total pemasukan dan total pengeluaran pada periode berjalan.
  * **Line Chart Pemasukan & Pengeluaran:** Grafik tren arus kas masuk (*Cash In*) vs kas keluar (*Cash Out*) yang dapat difilter per bulan/periode kepengurusan.
* **Manajemen Transaksi (History Cash In & Cash Out):**
  * Tabel riwayat transaksi memuat: Tanggal, Jenis (`Cash In` / `Cash Out`), Sumber/Tujuan (`Dari` & `Ke`), Nominal (`Berapa`), Kategori/Keterangan Proker, Status Persetujuan, dan Bukti/Resi.
* **Alur Persetujuan (Approval Workflow):**
  * Pengguna dengan izin *Add Transaction* dapat menginput transaksi baru dengan status awal `Pending`.
  * Role dengan wewenang verifikasi (misal: Bendahara / Topman / Admin) dapat mengubah status menjadi `Approved` atau `Rejected`.
  * **Saldo Saat Ini**, **Keuntungan**, dan **Line Chart** hanya menghitung transaksi berstatus `Approved`.
* **Resi Otomatis & Export Laporan:**
  * Setiap transaksi yang berstatus `Approved` otomatis men-generate **Resi Digital** (memuat Nomor Resi unik, Tanggal, Dari, Ke, Nominal, Keperluan, dan status lunas/sah) yang dapat **diunduh/dicetak sebagai PDF**.
  * Tersedia opsi **Export Laporan Keuangan** ke format **PDF** dan **Excel (.xlsx)**.

---

### 3.4. Tracking Kader (Proker & Penilaian Keaktifan)
* **Manajemen Proker:**
  * Daftar Program Kerja lengkap dengan penanggung jawab (PIC), bidang terkait, tanggal pelaksanaan, status progres (`Planned`, `On Progress`, `Completed`), serta daftar panitia & peserta yang terlibat.
* **Mekanisme Presensi Rapat:**
  * Pembuatan sesi rapat (Rapat Umum, Rapat Bidang, Rapat Proker) beserta daftar hadir kader (`Hadir`, `Izin`, `Sakit`, `Alpha`).
* **Perhitungan Skor Otomatis (Scoring Engine):**
  * Skor keaktifan kader dikalkulasi secara otomatis oleh sistem berdasarkan bobot poin yang dapat dikonfigurasi Admin, meliputi:
    1. **Keikutsertaan Kepanitiaan / Proker** (berdasarkan peran dalam kepanitiaan, misal: Ketua Pelaksana, Koordinator, Staff Panitia).
    2. **Presensi Rapat** (poin otomatis setiap kali status presensi tercatat `Hadir`).
  * Riwayat penambahan poin tercatat transparan di profil masing-masing kader (*Point Ledger*).

---

### 3.5. Leaderboard Kader
* Menampilkan peringkat kader secara *real-time* berdasarkan total **Score Keaktifan**.
* **Visibilitas:** Terbuka untuk **semua role** (dari `Kader 1` hingga `Admin`) guna mendorong transparansi dan kompetisi positif antar kader.
* Menampilkan peringkat, Nama, Prodi, Role, dan Total Poin, serta highlight posisi peringkat milik pengguna yang sedang login.

---

### 3.6. Header Info Berita (CMS & Running Ticker)
* Modul untuk mengelola pengumuman penting atau berita internal maupun publik.
* **Integrasi Frontend:** Data yang dipublikasikan otomatis muncul sebagai *Header Info / Announcement Banner* di dashboard internal maupun halaman utama Website Profil Publik HIPMI PT Telkom.
* Mendukung pengaturan jadwal tayang (*Start Date* & *End Date*) dan prioritas berita.

---

### 3.7. Calendar HIPMI
* Kalender interaktif terpusat yang menampilkan seluruh jadwal **Program Kerja**, **Rapat Internal**, **Deadline Kompetisi/Event**, dan **Hari Besar Organisasi**.
* **Integrasi Google Calendar API:** Disiapkan adapter/integrasi **Google Calendar API** sebagai sumber/sinkronisasi jadwal kegiatan, serta tetap mendukung penyimpanan lokal/fallback di backend.
* Terintegrasi dengan Website Profil Publik untuk menampilkan jadwal kegiatan publik.

---

### 3.8. Template Surat & Export Dokumen
* Repositori terpusat untuk dokumen administrasi organisasi (Surat Undangan, Surat Peminjaman Tempat, Proposal Kegiatan, LPJ, Surat Tugas, dll.).
* **Fitur Utama:**
  * Admin/Sekretaris dapat mengunggah master template atau menyusun format surat dinamis di sistem (dengan variabel otomatis seperti Nama Kegiatan, Tanggal, Nomor Surat).
  * Kader/Pengurus dapat mengunduh dokumen maupun mengekspor data/dokumen ke format **PDF** dan **Excel (.xlsx)**.

---

### 3.9. Edit UKM Profile (Headless CMS untuk Web Publik)
* Modul pengelolaan konten yang terhubung langsung ke tampilan Website Profil Publik HIPMI PT Telkom (`HIPMI-UKM-profile`).
* Mengatur:
  * Profil Organisasi, Visi & Misi, Sejarah.
  * Struktur Kepengurusan (Foto, Nama, Jabatan Topman hingga Kepala Kompartemen).
  * Galeri Dokumentasi & Portofolio Bisnis Kader unggulan.
  * Kontak resmi & tautan media sosial organisasi.

---

### 3.10. Integrasi WhatsApp `[DITIADAKAN / SKIP]`
* Modul WhatsApp Gateway **ditiadakan** pada fase ini (tidak ada pengiriman OTP, resi otomatis, maupun *broadcast* via WhatsApp).

---

## 4. Kebutuhan Non-Fungsional (Non-Functional Requirements)
1. **Single Backend & Repo Terpisah:** `hipmi-pt-telkom-web` tetap berada di repo terpisah dan mengonsumsi **Public Endpoint** (Read-Only) dari sistem ini, sementara dashboard internal menggunakan **Protected Endpoint** (JWT/Session-based).
2. **Portabilitas Database & Storage:**
   * Menggunakan **PostgreSQL standar + ORM (Prisma/Drizzle)** tanpa *vendor-lock* Supabase agar mudah dipindah dari Vercel+Supabase ke VPS.
   * Menggunakan abstraksi **`StorageAdapter`** untuk upload file/foto/PDF (Fase 1: **Supabase Storage**, Fase 2: **Disk Lokal VPS**).
3. **Keamanan Data:** Password wajib di-hash (Bcrypt/Argon2); validasi hak akses dilakukan di sisi server (*Middleware RBAC*) pada setiap *request*, bukan sekadar menyembunyikan menu di tampilan antarmuka.
4. **Audit Trail:** Pencatatan log aktivitas penting (perubahan transaksi keuangan, perubahan hak akses role oleh Admin, dan manipulasi skor manual jika ada).
5. **Responsivitas:** Antarmuka dashboard dan portal kader optimal diakses melalui desktop maupun perangkat *mobile* (smartphone).

---

## 5. Matriks Ringkasan Modul & Output Utama

| No | Nama Modul | Fitur Utama | Output / Export |
| :--- | :--- | :--- | :--- |
| 1 | **Database Kader** | Login NIM, Master Data Kader, Filter Minat & Prodi | Import/Export Excel & CSV |
| 2 | **Dashboard** | KPI Keaktifan, Total Kader Aktif, Pie Chart Proker | Visualisasi Real-Time |
| 3 | **Keuangan** | Saldo, Keuntungan, Line Chart, Approval Cash In/Out | Resi Otomatis (PDF), Laporan (PDF/Excel) |
| 4 | **Tracking Kader** | Manajemen Proker, Presensi Rapat, Auto Scoring | Point Ledger Kader |
| 5 | **Leaderboard** | Peringkat Keaktifan Terbuka Semua Role | Real-Time Ranking |
| 6 | **Header Info Berita** | CMS Pengumuman & Running Banner | Tampil di Dashboard & Web Profil |
| 7 | **Calendar HIPMI** | Jadwal Proker, Rapat, Event (Google Calendar API) | Sinkronisasi Web Profil |
| 8 | **Template Surat** | Repositori & Generator Surat Dinamis | Export PDF & Excel |
| 9 | **Edit UKM Profile** | Headless CMS untuk Profil, Struktur, & Galeri Web | Update Langsung ke Web Profil |
| 10 | **Integrasi WhatsApp** | *Ditiadakan / Skip pada fase ini* | - |