# Module 1: Overview, Tech Stack & Architecture

## 1. Project Overview
Project ini adalah bot Telegram berbasis AI yang berfungsi sebagai asisten pencatat keuangan pribadi otomatis (*expense & income tracker*) skala komersial (MVP siap jual/langganan). 
Pengguna baru otomatis mendapatkan **Free Trial (5 Transaksi Gratis)** tanpa kode. Pengguna cukup mengirimkan teks biasa (contoh: "makan siang warteg 20rb") atau mengunggah foto struk belanja/nota. Bot akan mengekstrak informasi transaksi menggunakan LLM, mengonfirmasinya ke pengguna via Inline Keyboard Button (`[✅ Simpan]` / `[❌ Batal]`), dan menyimpannya ke database.

---

## 2. Tech Stack & Infrastructure
- **Runtime & Language:** Node.js (TypeScript / JavaScript ES Modules)
- **Framework Bot:** Telegraf.js (atau Grammy.js)
- **Deployment Platform:** Vercel (Serverless Functions via Webhook)
- **AI Engine:** Google Gemini API (`gemini-2.5-flash`) via `@google/genai` (Multimodal: Text & OCR Vision)
- **Database:** Supabase (PostgreSQL untuk simpan data transaksi, pengguna, & langganan)
- **Timezone Standard:** Asia/Jakarta (`WIB` / `UTC+7`) untuk seluruh pencatatan tanggal & query laporan.

---

## 3. Architecture & Security
- **Communication Pattern:** Telegram Webhook -> Vercel Serverless Function.
- **Dual Telegram Bot Architecture (Opsional):**
  - **User Bot (`BOT_TOKEN`)**: Bot utama khusus pengguna mencatat keuangan, cek rekap, dan status tanpa terganggu spam notifikasi admin.
  - **Admin Bot (`ADMIN_BOT_TOKEN`)**: (Opsional) Bot khusus Admin di chat room terpisah untuk menerima error alert, tiket langganan, verifikasi pembayaran (`/confirm`), mengelola user (`/users`), eksekusi `/generate_code`, `/admin_stats`, & `/broadcast`.
  - ⚠️ **Ketentuan Telegram API**: Admin **WAJIB** menekan tombol `/start` (atau mengirimkan 1 pesan pertama) di Admin Bot agar Telegram API memberikan izin kepada Admin Bot untuk mengirimkan notifikasi ke chat room Admin.
- **Security Validation:** Serverless handler WAJIB memvalidasi HTTP Header `X-Telegram-Bot-Api-Secret-Token` sesuai dengan environment variable `TELEGRAM_SECRET_TOKEN`. Jika token tidak sesuai atau tidak ada, kembalikan HTTP `403 Forbidden`.
- **Stateless Serverless Execution:** Callback data Telegram Inline Keyboard (`[✅ Simpan]`) membawa payload data transaksi terkompresi/encoded secara langsung (stateless), sehingga tidak bergantung pada state/memori server Vercel.

---

## 4. Environment Variables Required
```env
BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ
ADMIN_BOT_TOKEN=987654321:XYZabcDefGhiJklMnoPQRsTUV
TELEGRAM_SECRET_TOKEN=super-secret-random-string
GEMINI_API_KEY=AIzaSy...
SUPABASE_URL=https://xyz.supabase.co
SUPABASE_KEY=eyJhbGciOi...
```
---

## 5. Telegram Bot Menu Autocompletion (`setMyCommands`)
Saat inisialisasi bot atau startup script, bot mengeksekusi Telegram Bot API `setMyCommands` agar daftar command resmi muncul di menu autocompletion tombol `/` pada aplikasi Telegram pengguna.
