# Project Context: Telegram AI Financial Tracker Bot (Commercial MVP)

Selamat datang di dokumentasi PRD modular untuk **Telegram AI Financial Tracker Bot**. Dokumentasi ini dirancang secara modular agar mudah dibaca, dikembangkan, dan dipelihara (*maintainable*).

---

## 📚 Master Index PRD Modules

| Modul | Deskripsi & Isi Utama | Link Dokumen |
| :--- | :--- | :--- |
| **01. Overview & Stack** | Ringkasan Project, Tech Stack, Arsitektur Webhook Vercel, & Environment Variables | [docs/01-overview-stack.md](file:///c:/AlKauni/project/financial-tracker-bot/docs/01-overview-stack.md) |
| **02. Database Schema** | Skema PostgreSQL Supabase (`users`, `confirmation_codes`, `transactions`, `recurring_transactions`) & Script SQL DDL | [docs/02-database-schema.md](file:///c:/AlKauni/project/financial-tracker-bot/docs/02-database-schema.md) |
| **03. Auth & Subscriptions** | Logika Free Trial (5x), Master Admin Code, Tiket `/subscribe` & `/reply`, Konfirmasi `/confirm` & 1-Tap Approval | [docs/03-auth-subscription.md](file:///c:/AlKauni/project/financial-tracker-bot/docs/03-auth-subscription.md) |
| **04. AI Parsing & UI** | Schema JSON Prompt Gemini AI (Wallet & Financial Pillar 50/30/20), Vision OCR, & Inline Keyboard Confirmation | [docs/04-ai-parsing-ui.md](file:///c:/AlKauni/project/financial-tracker-bot/docs/04-ai-parsing-ui.md) |
| **05. User Features** | Fitur Komersial MVP (`/status`, `/subscribe`, `/confirm`, `/rekap` Fleksibel, `/ratio` 50/30/20, `/insight`, `/rutin`, `/history`, `/export` CSV, `/budget`) | [docs/05-user-features.md](file:///c:/AlKauni/project/financial-tracker-bot/docs/05-user-features.md) |
| **06. Admin System** | Dual Bot Architecture, One-Tap Approval Buttons, `/reply` (2-Way CRM), `/admin_stats`, `/users`, `/generate_code`, `/extend`, `/broadcast` | [docs/06-admin-system.md](file:///c:/AlKauni/project/financial-tracker-bot/docs/06-admin-system.md) |
| **07. Error Standards** | System Global Error Handling, Admin Error Alert, Standar Stateless Vercel & Zona Waktu WIB | [docs/07-error-standards.md](file:///c:/AlKauni/project/financial-tracker-bot/docs/07-error-standards.md) |

---

## ⚡ Quick Summary Fitur Utama

- **Pencatatan Keuangan AI**: Teks biasa & foto struk otomatis diproses Gemini AI (`gemini-2.5-flash`).
- **Access Control & Monetisasi**: Free Trial 5x transaksi otomatis -> Berlangganan via Kode Konfirmasi (Durasi / Lifetime).
- **Konfirmasi Pembayaran & 1-Tap Approval**: User upload bukti transfer (`/confirm`) -> Admin Bot terima foto + Tombol Interactive `[✅ Approve 30 Hari]` `[✅ Approve Lifetime]` -> 1 Tap langsung aktifkan user!
- **Sistem Tiket Langganan 2-Arah**: User minta langganan (`/subscribe`) -> Admin terima di Admin Bot & balas (`/reply <telegram_id> <pesan>`) diteruskan ke User Bot.
- **AI Coach & Financial Health**: Evaluasi Rasio Keuangan 50/30/20 (bisa di-custom via `/ratio`), Financial Health Score, & AI Insight Cerdas (`/insight`).
- **Dual Bot Architecture**: User Bot khusus pencatatan keuangan; Admin Bot khusus manajemen & error alerts.
- **Fitur Lengkap MVP**: Export CSV, Batas Anggaran (`/budget`), Rekap Bulanan/Mingguan/Custom (`/rekap`), Transaksi Rutin (`/rutin`), Hapus Transaksi (`/history`), Cek Telegram ID (`/status`), Broadcast Masal (`/broadcast`).
- **Serverless First**: Stateless execution di atas Vercel Serverless Function & Supabase PostgreSQL (WIB UTC+7).