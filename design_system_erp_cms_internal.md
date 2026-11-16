# Design System ERP & CMS Internal v1.0 - UKM HIPMI PT Universitas Telkom

Dokumen ini adalah sumber kebenaran **Design System** untuk portal operasional internal (`hipmi-pt-telkom-erp`), yang diadaptasi dari **Design System v1.2 Web Profil Publik** (`Emerald-Lime-Cream System` + `Montserrat` & `Inter`) agar optimal untuk produktivitas kerja, kepadatan data tabel, visualisasi finansial, dan kontrol CMS.

---

## 1. Filosofi Adaptasi (Editorial Dark-First -> Operational Light-First)

Jika website profil publik mendominasi layar dengan kanvas gelap dramatis (`#06231D`), sistem ERP membalik proporsi tersebut menjadi **Light-First Workspace dengan Dark Brand Chrome**:
* **Chrome Navigasi Gelap (`#06231D`):** Sidebar dan Header Info Berita mempertahankan identitas visual resmi HIPMI PT Telkom agar transisi mental dari web profil ke portal internal terasa mulus.
* **Kanvas Kerja Terang (`#FFFDEE` & `#FFFFFF`):** Area kerja utama menggunakan latar cream lembut (`#FFFDEE`) dan permukaan kartu/tabel putih bersih (`#FFFFFF`) untuk mencegah kelelahan mata (*eye strain*) saat membaca tabel kader ratusan baris, laporan arus kas, maupun penyuntingan konten CMS.

---

## 2. Design Tokens (`tokens.css`)

### A. Color Tokens (Brand & Surface)
| Token | Nilai Hex | Peran dalam ERP |
|---|---|---|
| `--bg-deep` | `#06231D` | Latar Sidebar Navigasi, Top Announcement Ticker, dan Modal Header |
| `--surface-dark` | `#0C342C` | Hover state menu sidebar, kartu ringkasan saldo/hero KPI gelap |
| `--surface-elevated` | `#09352C` | Active state item sidebar, dropdown akun user, dan popover gelap |
| `--surface-emerald` | `#076653` | Aksen utama grafik (garis pemasukan/proker selesai), tombol aksi sekunder |
| `--bg-cream` | `#FFFDEE` | Kanvas utama area kerja (*Main Content Area*) |
| `--tint-mint` | `#E2FBCE` | Header tabel, baris *highlight* posisi user di Leaderboard, badge aktif |
| `--surface-card` | `#FFFFFF` | Permukaan kartu KPI, kontainer grafik, form editor, dan baris tabel |
| `--accent-lime` | `#E3EF26` | Aksen primer (Tombol CTA utama seperti `+ Add Transaction`, indikator menu aktif, fokus ring) |
| `--text-cream` | `#FFFDEE` | Teks utama di dalam Sidebar & komponen gelap |
| `--text-cream-muted` | `#C7DCD2` | Label kategori menu sidebar & subjudul di atas permukaan gelap |
| `--text-ink` | `#06231D` | Teks utama di area kerja terang (judul halaman, isi tabel, angka KPI) |
| `--text-ink-muted` | `#2F4F46` | Label form, metadata sekunder, teks placeholder, dan subjudul kartu |
| `--border-dark` | `#124236` | Garis pemisah bagian di dalam Sidebar (`1px`) |
| `--border-light` | `#D4E4DC` | Border kartu, pembatas baris tabel, dan outline input form |

### B. Semantic Status Tokens (Khusus ERP & Workflow)
Digunakan untuk badge persetujuan keuangan, status presensi rapat, dan progres program kerja:
| Token Status | Warna Teks | Warna Latar | Warna Border | Penggunaan |
|---|---|---|---|---|
| `--status-success` | `#076653` | `#E2FBCE` | `#A7F3D0` | `Approved` (Keuangan), `Hadir` (Presensi), `Completed` (Proker), `Aktif` (Kader) |
| `--status-warning` | `#854D0E` | `#FEF9C3` | `#FDE047` | `Pending` (Menunggu Verifikasi Kas), `On Progress` (Proker), `Izin / Sakit` |
| `--status-danger` | `#991B1B` | `#FEE2E2` | `#FECACA` | `Rejected` (Transaksi Ditolak), `Alpha` (Presensi), `Non-Aktif` |
| `--status-neutral` | `#2F4F46` | `#F1F5F9` | `#CBD5E1` | `Planned` (Proker Belum Mulai), `Alumni`, `Draft` |

### C. Typography Scale & Density (`Montserrat` + `Inter`)
* **Display & Headings (`--font-display`):** `Montserrat` (Weight `700`, `800`)
* **Body, Tabel & Form (`--font-sans`):** `Inter` (Weight `400`, `500`, `600`)
* **Page Title (`<h1>`):** `24px` – `28px` / `Montserrat 800` / `letter-spacing: -0.02em`
* **KPI Metric Value:** `28px` – `36px` / `Montserrat 800` / `font-variant-numeric: tabular-nums`
* **Section / Card Title (`<h2>`):** `16px` – `18px` / `Montserrat 700`
* **Table Header (`<th>`):** `11px` – `12px` / `Montserrat 700` / `UPPERCASE` / `letter-spacing: 0.06em`
* **Table Cell & Input (`<td>`, `<input>`):** `13px` – `14px` / `Inter 400-500` / `line-height: 1.45`
* **Angka Finansial & Skor (`tabular-nums`):** Wajib menggunakan `font-variant-numeric: tabular-nums` pada seluruh nominal Rupiah (`Cash In/Out`), NIM, dan poin Leaderboard agar kolom angka sejajar presisi.

### D. Layout Grid, Spacing & Radius
* **App Shell Layout:**
  * **Header Info Berita (Top Ticker):** Tinggi `36px` – `40px` (`#06231D` bg, `#E3EF26` badge label `INFO TERKINI`), muncul di bagian paling atas jika ada pengumuman aktif.
  * **Sidebar Kiri (Desktop):** Lebar tetap `260px` (`#06231D`), *collapsible* ke drawer di layar `< 1024px`.
  * **Topbar Area Kerja:** Tinggi `64px` (`#FFFDEE` dengan border bawah `#D4E4DC`), berisi *Breadcrumb*, judul modul aktif, dan profil user + badge Role aktif.
  * **Content Padding:** `24px` (mobile) hingga `32px` (desktop), `max-width: 1440px`.
* **Border Radius:**
  * `4px` (`--radius-sm`): Input form, tombol aksi kecil, checkbox Role Matrix, badge status kotak.
  * `8px` (`--radius-md`): Kartu KPI, kontainer tabel, panel grafik, modal dialog.
  * `9999px` (`--radius-pill`): Filter pill, status badge bulat, avatar inisial kader.

---

## 3. Inventaris Komponen ERP (Atomic Design)

### Level 1: Atom
1. **Sidebar Brand Header:** Dual logo (`logo-bintang.png` + `logo-hipmi-pt-telkom.png`) + teks `HIPMI PT TELKOM / ERP SYSTEM`.
2. **Action Buttons (Target Sentuh Minimal `40px`–`44px`):**
   * *Primary CTA (`#E3EF26` bg, `#06231D` text, `Montserrat 700`)* — Untuk aksi utama (`+ Tambah Kader`, `+ Add Transaction`, `Simpan Perubahan`).
   * *Secondary Emerald (`#076653` bg, `#FFFDEE` text)* — Untuk aksi positif sekunder (`Approve Transaksi`, `Simpan Presensi`).
   * *Outline / Export Button (`#FFFFFF` bg, `#06231D` text, border `#D4E4DC`)* — Untuk `Export PDF`, `Export Excel`, dan tombol filter.
   * *Danger Button (`#FEE2E2` bg, `#991B1B` text)* — Untuk `Reject` atau `Hapus`.
3. **Character Counter Input (`CMS Guardrail`):** Input teks/textarea yang menampilkan indikator jumlah karakter secara *real-time* (misal `34 / 45 kar`), berubah menjadi warna peringatan saat mendekati batas keras `BACKEND-REQUIREMENTS.md`.
4. **Status Pill:** Lencana kecil (`11px`, `Montserrat 700`) menggunakan token semantic (`Approved`, `Pending`, `Rejected`, `Hadir`, `Completed`).
5. **External Link Nav Item (Template Surat):** Item menu sidebar dengan ikon dokumen + ikon panah eksternal (`↗`) yang membuka Google Docs persuratan di tab baru.

### Level 2: Molekul
1. **KPI Summary Card:** Kartu `#FFFFFF` border `#D4E4DC` (atau varian gelap `#06231D` khusus Saldo Kas Utama) berisi ikon sudut kanan atas, label metrik (`12px`), angka besar `Montserrat 800`, dan sub-keterangan tren/perbandingan.
2. **Data Table Toolbar:** Baris kontrol di atas tabel berisi kolom pencarian (*Search NIM/Nama*), *Multi-select Dropdown Filter* (Prodi, Fakultas, Minat, Status), dan tombol aksi (`Import Excel`, `Export PDF/Excel`).
3. **RBAC Permission Matrix Row:** Baris konfigurasi pada Dashboard Admin berisi nama modul di kolom kiri dan 5 *Checkbox* sejajar (`Read`, `Create`, `Update`, `Delete`, `Approve`) dengan fokus ring `#E3EF26`.
4. **Aspect-Ratio Image Uploader & Cropper:** Komponen unggah gambar untuk modul CMS yang otomatis mengunci rasio potong (`16:9`, `4:5`, atau `1:1`) dan menampilkan peringatan jika resolusi di bawah batas minimum.
5. **Digital Receipt Preview Card (Resi Otomatis):** Kartu format cetak bersih (`#FFFFFF`, header `#06231D` dengan logo HIPMI, nomor resi `INV/HIPMI/...`, tabel rincian `Dari / Ke / Nominal`, stempel status `APPROVED / LUNAS`, serta tombol `Cetak / Unduh PDF`).

### Level 3: Organisme (Tampilan Halaman Utama)
1. **Dynamic Sidebar Navigation:** Merender daftar modul secara otomatis berdasarkan objek `permissions` milik role user yang sedang login (hanya modul dengan `can_read === true` yang muncul).
2. **Executive Dashboard Grid:**
   * Baris 1: 3–4 Kartu KPI (Indeks Keaktifan Total, Kader Terdata vs Aktif, Saldo Kas Saat Ini, Proker Berjalan).
   * Baris 2: *Pie Chart Proker Selesai* (kiri) + *Daftar Agenda Terdekat dari Calendar HIPMI* (kanan).
3. **Finance Workspace:** Ringkasan Saldo & Keuntungan + *Line Chart Pemasukan vs Pengeluaran* (Recharts dengan garis `#076653` dan `#E3EF26` / `#991B1B`) + Tabel Transaksi Interaktif + Modal Verifikasi & Resi Otomatis.
4. **Leaderboard Table:** Papan peringkat dengan kolom `Peringkat (#1, #2, #3 dengan badge medali)`, `Nama & Prodi`, `Role`, `Total Poin`, dan tombol `Lihat Riwayat Poin`. Baris milik user yang sedang login otomatis diberi latar `#E2FBCE` (`--tint-mint`) agar mudah dikenali.
5. **Admin Role Matrix Panel:** Tab pemilih Role (`Topman`, `Kepala Bidang & Sekretaris Bidang`, `Kepala Kompartemen`, `Staff`, `Kader 1`) + tabel matriks izin seluruh modul + tombol simpan perubahan.

---

## 4. Aturan Aksesibilitas & Kualitas (`antislop` ERP Standard)
1. **Kontras & Keterbacaan Data:** Seluruh teks tabel dan badge status wajib memenuhi rasio kontras minimal WCAG AA (`>= 4.5:1`). Hindari teks abu-abu pudar pada angka nominal uang atau skor.
2. **Target Sentuh & Navigasi Keyboard:** Seluruh tombol aksi tabel, pagination, tab switcher, dan checkbox Role Matrix memiliki area klik minimal `40px`–`44px` dengan indikator `:focus-visible` berwarna `#E3EF26` atau `#076653`.
3. **Print Stylesheet (`@media print`):** Halaman resi otomatis dan laporan keuangan wajib menyembunyikan Sidebar, Topbar, dan tombol filter saat dicetak ke PDF sehingga hasil cetak bersih seperti dokumen resmi.
4. **Empty & Loading States Jujur:** Gunakan *Skeleton Loader* berbentuk baris tabel/kartu saat memuat data dari API, dan tampilkan pesan status kosong yang jelas (misal `"Belum ada transaksi pada periode ini"`) tanpa data contoh fiktif.