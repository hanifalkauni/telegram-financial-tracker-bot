# Module 7: Error Handling System & Development Standards

## 1. Global Error Handling & Admin Notification

### 1.1 Error Interception & Dispatch
Semua exception (error koneksi Supabase, AI quota limit / rate limit Gemini, Telegram API errors, maupun runtime bugs) WAJIB ditangkap oleh Global Error Handler.

Ketika error terjadi:
1. Bot mengirimkan laporan error detail ke chat room Admin (`is_admin = TRUE` atau via `ADMIN_BOT_TOKEN` / `ADMIN_TELEGRAM_ID`).
2. Format Laporan Error Admin:

```text
⚠️ **SYSTEM ERROR WARNING**
━━━━━━━━━━━━━━━━━━━
🕒 Timestamp  : 2026-08-12 15:30:00 WIB
👤 User Context: Telegram ID 123456789 (@username)
🛠️ Component   : Gemini AI Multimodal Vision Parser
📝 Error Message:
`QuotaExceededError: 429 Resource has been exhausted (e.g. check quota)`
━━━━━━━━━━━━━━━━━━━
```

3. Kepada pengguna biasa, bot membalas dengan pesan *user-friendly failure fallback*:
   > *"Maaf, terjadi kendala teknis pada sistem saat ini. Laporan error telah otomatis dikirimkan ke Admin untuk ditindaklanjuti."*

---

## 2. Coding & Development Standards

1. **Serverless First (Vercel)**:
   - Handler wajib dirancang *stateless*. Jangan menggunakan variabel memori global untuk menyimpan state antar-request HTTP.
2. **Stateless Callback Payloads**:
   - Callback data dari Inline Keyboards harus membawa seluruh payload transaksi yang dibutuhkan agar request dapat diproses secara independen.
3. **Timezone Enforcement**:
   - Seluruh instansiasi tanggal dan pemformatan laporan wajib menetapkan zona waktu `Asia/Jakarta` (`WIB` UTC+7).
4. **API Safety & Timeout**:
   - Semua pemanggilan Gemini API dan Supabase DB wajib dibungkus dalam blok `try-catch` dengan timeout batas aman HTTP Vercel Serverless Function.
