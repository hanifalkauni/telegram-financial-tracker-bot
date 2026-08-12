# Module 6: Admin Dashboard & Management System

## 1. Dual Bot Setup & Admin Access Control
- **User Bot (`BOT_TOKEN`)**: Khusus pengguna mencatat keuangan pribadi.
- **Admin Bot (`ADMIN_BOT_TOKEN`)**: (Opsional) Khusus Admin di ruang chat terpisah untuk eksekusi command manajemen, penerimaan error alert, penerimaan tiket langganan, dan verifikasi bukti transfer.
- **Rule Telegram API**: Admin **WAJIB** menekan tombol `/start` (1x di awal) di chat room Admin Bot agar Telegram API memberikan izin ke bot untuk mengirimkan notifikasi.

---

## 2. Admin Commands & Interactive Workflows

### 2.1 Verification Bukti Transfer & One-Tap Approval Buttons
Ketika pengguna mengunggah foto bukti pembayaran via `/confirm` di User Bot, **Admin Bot** menerima foto bukti tersebut secara otomatis disertai **Tombol Persetujuan 1-Tap**:

```text
📩 **KONFIRMASI PEMBAYARAN BARU**
━━━━━━━━━━━━━━━━━━━
👤 Nama      : Budi (@budi_12)
🆔 Telegram ID: `123456789`
📊 Status    : Trial Habis (0/5)
🖼️ [Foto Struk Transfer / QRIS]
━━━━━━━━━━━━━━━━━━━
Pilih tindakan approval:

[ ✅ Approve 30 Hari ]    [ ✅ Approve 1 Tahun ]
[ ♾️ Approve Lifetime ]   [ ❌ Tolak Pembayaran ]
```

#### Alur Eksekusi 1-Tap:
- Ketika Admin menekan **`[✅ Approve 30 Hari]`**:
  1. Sistem otomatis memperpanjang `active_until = NOW() + INTERVAL '30 days'` di database.
  2. Sistem otomatis mengirimkan notifikasi ke chat room **User Bot** pengguna: *"🎉 Pembayaran terverifikasi! Masa langganan Anda aktif s/d 12 Sep 2026."*
- Ketika Admin menekan **`[❌ Tolak Pembayaran]`**:
  1. Admin diminta memasukkan alasan penolakan.
  2. Notifikasi penolakan dikirimkan ke User Bot pengguna.

---

### 2.2 Receiving Subscription Tickets & Command `/reply <telegram_id> <pesan>`
Ketika pengguna mengetik `/subscribe <pesan>` di User Bot, Admin Bot menerima Tiket Permintaan Langganan:

```text
📩 **PERMINTAAN LANGGANAN BARU**
━━━━━━━━━━━━━━━━━━━
👤 Nama      : Budi (@budi_12)
🆔 Telegram ID: `123456789`
💬 Pesan     : "Halo admin, saya mau beli paket 1 bulan via QRIS"
━━━━━━━━━━━━━━━━━━━
Untuk membalas pesan user ini, ketik:
`/reply 123456789 <pesan_anda>`
```

---

### 2.3 Command `/admin_stats`
Menampilkan statistik komersial dan kesehatan bisnis bot.

---

### 2.4 Command `/users` (Lihat Daftar User & Telegram ID)
Menampilkan 20 pengguna terbaru beserta `telegram_id` mereka.

---

### 2.5 Command `/generate_code [durasi_hari]`
Membuat kode konfirmasi akses berlangganan baru (30, 365, atau 0/unlimited).

---

### 2.6 Command `/extend <telegram_id> <durasi_hari>`
Memperpanjang masa aktif pengguna secara manual menggunakan Telegram ID.

---

### 2.7 Command `/broadcast <pesan>`
Mengirimkan pesan pengumuman masal ke seluruh pengguna yang terdaftar di database `users`.
