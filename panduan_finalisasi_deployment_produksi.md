# Backend Finalization & Production Deployment Guide
## Transisi Fase Testing (Supabase Cloud) ke Fase Production (VPS PostgreSQL)

**Versi:** 1.0  
**Spesifikasi Server Produksi:** VPS 2 vCPU / 4 GB RAM (Ubuntu 24.04 LTS)  
**Target Kapasitas:** >500 Pengguna Aktif

---

## 1. Spesifikasi Environment Variables (`.env`)

Gunakan variabel yang sama di kedua fase; cukup ubah nilainya saat berpindah dari Supabase Cloud ke VPS:

```env
# Server & Security
NODE_ENV=production
PORT=4000
JWT_SECRET=ganti_dengan_random_string_minimal_64_karakter
JWT_EXPIRES_IN=7d

# Database PostgreSQL (Fase 1: Supabase Pooler URL | Fase 2: Local VPS PostgreSQL)
DATABASE_URL=postgresql://user:password@host:5432/hipmi_erp

# S3-Compatible Object Storage (Fase 1: Supabase Storage S3 | Fase 2: Cloudflare R2)
S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=hipmi-assets
S3_ACCESS_KEY_ID=your_access_key
S3_SECRET_ACCESS_KEY=your_secret_key
S3_PUBLIC_BASE_URL=https://cdn.hipmipttelkom.or.id

# Integrasi Frontend & Webhook ISR Revalidation
ERP_FRONTEND_URL=https://erp.hipmipttelkom.or.id
PUBLIC_WEB_URL=https://hipmipttelkom.vercel.app
REVALIDATE_SECRET=secret_token_yang_sama_dengan_web_profil
```

---

## 2. Alokasi Resource & Tuning VPS (2 vCPU / 4 GB RAM)

Agar server tetap stabil menghadapi lonjakan >500 pengguna bersamaan (misal saat pembukaan pendaftaran proker atau presensi rapat akbar), terapkan pembatasan memori berikut:

| Layanan di VPS | Batas Alokasi RAM | Konfigurasi Kritis |
| :--- | :--- | :--- |
| **PostgreSQL 16** | ~600 MB – 1 GB | `max_connections = 100`, `shared_buffers = 512MB`, `effective_cache_size = 1536MB`, `work_mem = 8MB` |
| **Hono Backend API** | ~250 MB (2 Worker) | Jalankan 2 instance via PM2 cluster (`max_memory_restart: "300M"`) |
| **Caddy Reverse Proxy** | ~40 MB | Otomatis SSL/TLS HTTP/3 + Gzip/Zstd compression |
| **OS & Buffer Cache** | ~2.2 GB | Cadangan aman untuk pemrosesan gambar `sharp` dan spike trafik |

---

## 3. Prosedur Migrasi Data (Supabase Cloud -> VPS PostgreSQL)

Saat siap beralih ke VPS produksi, lakukan langkah berikut tanpa *downtime* panjang:

1. **Aktifkan Mode Maintenance** sementara pada ERP Frontend.
2. **Dump Database dari Supabase Cloud:**
   ```bash
   pg_dump "postgresql://postgres.[project-ref]:[password]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" \
     --no-owner --no-privileges --clean --if-exists -f backup_hipmi.sql
   ```
3. **Restore ke PostgreSQL di VPS:**
   ```bash
   psql -U hipmi_admin -d hipmi_erp -f backup_hipmi.sql
   ```
4. **Migrasi Aset Media (Jika pindah dari Supabase Storage ke Cloudflare R2):**
   Gunakan utilitas `rclone sync` untuk menyalin seluruh isi bucket `hipmi-assets` ke R2, lalu perbarui prefix `image_src` di database menggunakan query SQL `REPLACE()` jika domain CDN berubah.
5. **Update Environment Variables** di backend VPS dan arahkan `NEXT_PUBLIC_API_URL` pada Web Profil (`hipmipttelkom.vercel.app`) serta ERP Frontend ke domain API VPS (`https://api.hipmipttelkom.or.id`).

---

## 4. Konfigurasi Reverse Proxy & Process Manager di VPS

### A. Caddyfile (`/etc/caddy/Caddyfile`)
```caddyfile
api.hipmipttelkom.or.id {
    encode zstd gzip
    reverse_proxy localhost:4000 {
        header_up X-Real-IP {remote_host}
    }
}
```

### B. PM2 Ecosystem (`ecosystem.config.cjs`)
```javascript
module.exports = {
  apps: [
    {
      name: "hipmi-api",
      script: "./dist/index.js",
      instances: 2,
      exec_mode: "cluster",
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        PORT: 4000,
      },
    },
  ],
};
```

---

## 5. Pre-Launch Finalization Checklist

### Keamanan & Otorisasi
- [ ] Akun `Admin` bawaan sudah mengganti password default dengan password kuat.
- [ ] Seluruh modul baru terkonfigurasi `false` secara default untuk role selain `Admin` sebelum Admin mengatur **Role Matrix**.
- [ ] Middleware `rbacMiddleware` terpasang pada seluruh route `/api/*` (tidak hanya mengandalkan penyembunyian menu di frontend).
- [ ] *Rate limiting* aktif pada endpoint `POST /api/auth/login` (maksimal 10 percobaan per menit per IP) untuk mencegah *brute-force* NIM.
- [ ] CORS hanya mengizinkan origin resmi (`https://hipmipttelkom.vercel.app` dan domain ERP internal).

### Integritas Data & Backup Otomatis
- [ ] Indeks database (`CREATE INDEX`) terpasang pada kolom yang sering difilter: `kaders(nim)`, `kaders(total_score DESC)`, `transactions(status, transaction_date)`, dan `score_ledgers(kader_id)`.
- [ ] *Cron job* harian aktif di VPS untuk melakukan `pg_dump` terkompresi (`.sql.gz`) setiap pukul 02.00 WIB dan menyimpannya ke bucket terpisah di Cloudflare R2 (retensi 14 hari).

### Sinkronisasi Web Profil Publik
- [ ] Uji coba mengubah judul Hero Slide, menambah Mitra baru, dan mengunggah foto via modul CMS ERP -> pastikan halaman di `hipmipttelkom.vercel.app` otomatis terbarui melalui `/api/revalidate`.
- [ ] Uji coba cetak **Resi Otomatis (PDF)** dan **Export Laporan Keuangan (Excel)** berjalan tanpa kendala memori pada server.