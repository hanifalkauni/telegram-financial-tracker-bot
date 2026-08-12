# Project Context: Telegram AI Financial Tracker Bot (Commercial MVP)

Document ini adalah panduan konteks utama (*Master Context PRD*) untuk **Telegram AI Financial Tracker Bot**, sebuah bot Telegram komersial berbasis AI yang berfungsi sebagai asisten pencatat keuangan pribadi otomatis (*expense & income tracker*) skala MVP komersial siap langganan.

---

## 1. Project Overview & Business Value

- **Kemudahan Input**: Pengguna mencatat transaksi cukup dengan mengetik pesan teks biasa (contoh: *"makan siang warteg 20rb gopay"*) atau mengunggah foto struk/nota belanja.
- **Ekstraksi AI Otomatis**: Memanfaatkan **Google Gemini 2.5 Flash** untuk ekstraksi data terstruktur (Tipe, Nominal, Kategori, Dompet Pembayaran, Pilar Keuangan 50/30/20, & Tanggal).
- **Model Bisnis Commercial MVP**:
  - **Free Trial**: Pengguna baru otomatis mendapatkan kuota **5 transaksi gratis**.
  - **Model Langganan**: Setelah kuota habis, bot terkunci hingga pengguna memasukkan Kode Konfirmasi (30 Hari, 1 Tahun, atau Lifetime).
  - **Alur Pembayaran 1-Tap**: User upload foto bukti transfer (`/confirm`) -> Admin terima di Admin Bot -> Admin cukup 1x tap tombol `[✅ Approve 30 Hari]` untuk mengaktifkan user secara otomatis.
  - **CRM Tiket 2-Arah**: User bisa minta langganan (`/subscribe`) -> Admin terima di Admin Bot & membalas (`/reply <telegram_id> <pesan>`) yang diteruskan langsung ke chat room pengguna di User Bot.

---

## 2. Tech Stack & Environment Architecture

- **Runtime & Language:** Node.js (TypeScript / ES Modules)
- **Framework Bot:** Telegraf.js / Grammy.js
- **Deployment Platform:** Vercel (Serverless Functions via Webhook)
- **AI Engine:** Google Gemini API (`gemini-2.5-flash`) via `@google/genai` (Multimodal: Text & OCR Vision)
- **Database:** Supabase (PostgreSQL)
- **Timezone Standard:** Asia/Jakarta (`WIB` / `UTC+7`)

### Environment Variables Required:
```env
BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ
ADMIN_BOT_TOKEN=987654321:XYZabcDefGhiJklMnoPQRsTUV
TELEGRAM_SECRET_TOKEN=super-secret-random-string
GEMINI_API_KEY=AIzaSy...
SUPABASE_URL=https://xyz.supabase.co
SUPABASE_KEY=eyJhbGciOi...
ADMIN_MASTER_CODE=MYMASTERADMIN123
```

---

## 3. Core Architecture & Workflow Systems

### 3.1 Dual Telegram Bot Architecture
- **User Bot (`BOT_TOKEN`)**: Bot utama tempat pengguna biasa mencatat transaksi, cek rekap, atur budget, & minta langganan.
- **Admin Bot (`ADMIN_BOT_TOKEN`)**: Bot khusus Admin di chat room terpisah untuk menerima alert error, membalas tiket langganan (`/reply`), verifikasi bukti pembayaran (One-Tap Approval), & manajemen user.
- ⚠️ **Aturan Telegram API**: Admin **WAJIB** menekan tombol `/start` (1x di awal) di Admin Bot agar Telegram API memberikan izin ke bot untuk mengirimkan notifikasi.

### 3.2 Alur Akses & Free Trial (Access Control)
1. User baru mendaftar otomatis via `/start` dengan `trial_transactions_left = 5` & `is_activated = FALSE`.
2. Setiap kali user menyimpan transaksi (`[✅ Simpan]`), `trial_transactions_left` dikurangi 1.
3. Setelah sisa trial `0` dan tidak memiliki langganan aktif (`active_until < NOW()`), fitur pencatatan terkunci.

### 3.3 Alur Konfirmasi Pembayaran & 1-Tap Admin Approval (`/confirm`)
1. User mengunggah foto struk/screenshot transfer dengan command `/confirm` di User Bot.
2. User Bot meneruskan foto bukti ke **Admin Bot** disertai tombol interactive:
   - `[✅ Approve 30 Hari]`
   - `[✅ Approve 365 Hari]`
   - `[♾️ Approve Lifetime]`
   - `[❌ Tolak Pembayaran]`
3. Admin menekan tombol `[✅ Approve 30 Hari]` -> Sistem meregenerasi kode, memperpanjang `active_until`, dan otomatis mengirimkan pesan sukses ke User Bot pengguna.

### 3.4 Alur CRM & Tiket Langganan (`/subscribe` & `/reply`)
1. User mengetik `/subscribe <pesan>` di User Bot.
2. Tiket terkirim ke Admin Bot lengkap dengan Telegram ID & Username pengguna.
3. Admin membalas via Admin Bot: `/reply <telegram_id> <pesan>` -> Pesan balasan langsung dikirimkan ke User Bot pengguna.

---

## 4. AI Financial Advisory & Smart Features

### 4.1 Gemini AI Parsing Schema JSON
```json
{
  "type": "EXPENSE" | "INCOME",
  "amount": number,
  "category": string,
  "description": string,
  "wallet": "CASH" | "BANK" | "E_WALLET",
  "financial_pillar": "NEEDS" | "WANTS" | "SAVINGS",
  "date": "YYYY-MM-DD"
}
```

### 4.2 Fitur Smart Advisory:
- **Metode Pembayaran (`wallet`)**: Otomatis mendeteksi pembagian saldo per dompet (Cash vs Bank vs E-Wallet/GoPay/OVO/QRIS).
- **Pilar Keuangan 50/30/20 (`financial_pillar`)**: Otomatis mengelompokkan ke Kebutuhan Pokok (`NEEDS`), Gaya Hidup (`WANTS`), dan Tabungan (`SAVINGS`).
- **Kustomisasi Rasio (`/ratio`)**: User dapat mengubah rasio sesuai kondisi finansial mereka (misal: `/ratio 60 20 20`).
- **Visual Health Score (`/rekap`)**: Menampilkan indikator kesehatan finansial bulanan (🟢 SEHAT, 🟡 WASPADA, 🔴 DEFISIT).
- **AI Financial Insight (`/insight`)**: Analisis cerdas Gemini AI secara *on-demand* (hemat token) yang memberikan 3 saran finansial konkret.
- **Transaksi Rutin Bulanan (`/rutin`)**: Memudahkan pengelolaan tagihan tetap (kos, WiFi, listrik, gaji).

---

## 5. Complete Bot Commands Reference

| Command | Akses | Fungsi & Deskripsi |
| :--- | :---: | :--- |
| `/start` | User | Memulai bot & melihat status sisa trial / masa aktif. |
| `/status` | User | Cek Telegram ID (monospace), status akun, budget, & target rasio. |
| `/subscribe` | User | Minta informasi langganan / kirim tiket pesan ke Admin. |
| `/confirm` | User | Upload foto bukti transfer / QRIS untuk verifikasi pembayaran. |
| `/rekap` | User | Laporan rekapitulasi (`/rekap`, `/rekap mingguan`, `/rekap <tgl_mulai> <tgl_selesai>`). |
| `/ratio` | User | Atur rasio kustom 50/30/20 (contoh: `/ratio 60 20 20`). |
| `/insight` | User | Panggil analisis cerdas AI Gemini untuk saran keuangan bulanan. |
| `/rutin` | User | Kelola transaksi rutin bulanan (`/rutin tambah`, `/rutin hapus`). |
| `/history` | User | Lihat 10 transaksi terakhir (lengkap dengan tombol `[🗑️ Hapus]`). |
| `/hapus_terakhir`| User | Hapus 1 transaksi terakhir yang baru dibuat. |
| `/export` | User | Unduh laporan keuangan bulan berjalan versi file CSV/Excel. |
| `/budget` | User | Atur batas anggaran bulanan (contoh: `/budget 3000000`). |
| `/reply` | Admin | Balas tiket pesan user dari Admin Bot (`/reply <telegram_id> <pesan>`). |
| `/generate_code`| Admin | Buat kode konfirmasi berlangganan (opsi: 30, 365, atau 0/unlimited). |
| `/admin_stats` | Admin | Statistik bisnis (user trial, subscriber, expired, total transaksi). |
| `/users` | Admin | Lihat 20 daftar pengguna terbaru terdaftar beserta Telegram ID mereka. |
| `/extend` | Admin | Perpanjang langganan user manual via Telegram ID (`/extend <id> <hari>`). |
| `/broadcast` | Admin | Kirim pesan pengumuman masal ke seluruh pengguna. |

---

## 6. Database Schemas Overview (Supabase PostgreSQL)

- **`users`**: `id`, `telegram_id` (UNIQUE), `name`, `is_activated`, `is_admin`, `trial_transactions_left`, `active_until`, `monthly_budget`, `ratio_needs`, `ratio_wants`, `ratio_savings`, `activated_at`, `created_at`.
- **`confirmation_codes`**: `id`, `code` (UNIQUE), `duration_days`, `created_by`, `is_used`, `used_by`, `used_at`, `created_at`.
- **`transactions`**: `id`, `user_id`, `type`, `amount`, `category`, `description`, `wallet`, `financial_pillar`, `transaction_date`, `created_at`.
- **`recurring_transactions`**: `id`, `user_id`, `type`, `amount`, `category`, `description`, `wallet`, `financial_pillar`, `due_day`, `is_active`, `created_at`.

---

## 7. Modular PRD Documentation Links (`docs/`)

Dokumentasi ini dipecah ke dalam 7 modul spesifik untuk kemudahan pemeliharaan:

1. 📑 **[Module 01: Overview & Stack](docs/01-overview-stack.md)** - Arsitektur Webhook, Tech Stack, & Env Vars.
2. 📑 **[Module 02: Database Schema](docs/02-database-schema.md)** - Skema Supabase PostgreSQL & SQL DDL Migration.
3. 📑 **[Module 03: Auth & Subscriptions](docs/03-auth-subscription.md)** - Free Trial, 1-Tap Approval, & CRM Tiket.
4. 📑 **[Module 04: AI Parsing & UI](docs/04-ai-parsing-ui.md)** - Schema JSON Gemini, Vision OCR, & Inline Keyboards.
5. 📑 **[Module 05: User Features](docs/05-user-features.md)** - Rincian seluruh command & fitur pengguna.
6. 📑 **[Module 06: Admin System](docs/06-admin-system.md)** - Dashboard Admin, 1-Tap Approval Buttons, & CRM `/reply`.
7. 📑 **[Module 07: Error Standards](docs/07-error-standards.md)** - Global Error Handler & System Development Standards.