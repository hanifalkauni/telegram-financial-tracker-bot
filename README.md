# Telegram AI Financial Tracker Bot (Commercial MVP)

Repository ini berisi spesifikasi produk (**PRD - Product Requirement Document**) terstruktur dan modular untuk **Telegram AI Financial Tracker Bot**, bot Telegram berbasis AI komersial yang berfungsi sebagai asisten pencatat keuangan pribadi otomatis.

---

## 📚 Master Index & Documentation Structure

- 📘 **[context.md](context.md)** — Dokumentasi Konteks Utama (*Master PRD Document*).

### 📑 PRD Modules (`docs/`):

1. **[Module 01: Overview & Stack](docs/01-overview-stack.md)** — Ringkasan Project, Tech Stack, Arsitektur Webhook Vercel, & Environment Variables.
2. **[Module 02: Database Schema](docs/02-database-schema.md)** — Skema PostgreSQL Supabase (`users`, `confirmation_codes`, `transactions`, `recurring_transactions`) & Script SQL DDL.
3. **[Module 03: Auth & Subscriptions](docs/03-auth-subscription.md)** — Logika Free Trial (5x), Master Admin Code, Tiket `/subscribe` & `/reply`, Konfirmasi `/confirm` & 1-Tap Approval.
4. **[Module 04: AI Parsing & UI](docs/04-ai-parsing-ui.md)** — Schema JSON Prompt Gemini AI (Wallet & Financial Pillar 50/30/20), Vision OCR, & Inline Keyboard Confirmation.
5. **[Module 05: User Features](docs/05-user-features.md)** — Fitur Komersial MVP (`/status`, `/subscribe`, `/confirm`, `/rekap` Fleksibel, `/ratio` 50/30/20, `/insight`, `/rutin`, `/history`, `/export` CSV, `/budget`).
6. **[Module 06: Admin System](docs/06-admin-system.md)** — Dual Bot Architecture, One-Tap Approval Buttons, `/reply` (2-Way CRM), `/admin_stats`, `/users`, `/generate_code`, `/extend`, `/broadcast`.
7. **[Module 07: Error Standards](docs/07-error-standards.md)** — System Global Error Handling, Admin Error Alert, Standar Stateless Vercel & Zona Waktu WIB.

---

## ⚡ Key Highlights

- **Pencatatan Keuangan AI**: Teks biasa & foto struk otomatis diproses Gemini AI (`gemini-2.5-flash`).
- **Access Control & Monetisasi**: Free Trial 5x transaksi otomatis -> Berlangganan via Kode Konfirmasi (Durasi / Lifetime).
- **Konfirmasi Pembayaran & 1-Tap Approval**: User upload bukti transfer (`/confirm`) -> Admin Bot terima foto + Tombol Interactive `[✅ Approve 30 Hari]` `[✅ Approve Lifetime]` -> 1 Tap langsung aktifkan user!
- **Sistem Tiket Langganan 2-Arah**: User minta langganan (`/subscribe`) -> Admin terima di Admin Bot & balas (`/reply <telegram_id> <pesan>`) diteruskan ke User Bot.
- **AI Coach & Financial Health**: Evaluasi Rasio Keuangan 50/30/20 (bisa di-custom via `/ratio`), Financial Health Score, & AI Insight Cerdas (`/insight`).
- **Dual Bot Architecture**: User Bot khusus pencatatan keuangan; Admin Bot khusus manajemen & error alerts.
- **Fitur Lengkap MVP**: Export CSV, Batas Anggaran (`/budget`), Rekap Bulanan/Mingguan/Custom (`/rekap`), Transaksi Rutin (`/rutin`), Hapus Transaksi (`/history`), Cek Telegram ID (`/status`), Broadcast Masal (`/broadcast`).
- **Serverless First**: Stateless execution di atas Vercel Serverless Function & Supabase PostgreSQL (WIB UTC+7).
