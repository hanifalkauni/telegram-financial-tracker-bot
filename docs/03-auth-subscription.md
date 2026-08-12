# Module 3: Authentication, Free Trial & Subscription System

## 1. Free Trial & Access Control Workflow

### 1.1 Automatic New User Registration
Ketika pengguna pertama kali mengirimkan pesan / command `/start`:
- Bot mendaftarkan `telegram_id` pengguna di tabel `users` dengan status:
  - `trial_transactions_left = 5`
  - `is_activated = FALSE`
  - `active_until = NULL`

---

## 2. Access Control Middleware Logic

```mermaid
flowchart TD
    A[User Message / Command] --> B{Text == ADMIN_MASTER_CODE?}
    B -- Yes --> C[Set is_activated=TRUE, is_admin=TRUE, active_until=NULL]
    C --> D[Reply Admin Success & Prompt to /start Admin Bot]
    B -- No --> E{Matches Valid confirmation_codes?}
    E -- Yes --> F[Mark Code is_used=TRUE, Extend active_until]
    F --> G[Reply Subscription Activated!]
    E -- No --> H{Is User Active & Subscription Valid?}
    H -- Yes active_until > NOW or NULL --> I[Allow Unlimited Bot Access]
    H -- No / Expired --> J{Is trial_transactions_left > 0?}
    J -- Yes --> K[Process AI Parsing -> Decrement Trial Counter by 1]
    J -- No --> L[Lock Bot Access -> Prompt for Code, /subscribe or /confirm]
```

---

## 3. Payment Confirmation & One-Tap Admin Approval Workflow (`/confirm` & Interactive Buttons)

```mermaid
sequenceDiagram
    autonumber
    actor User as User (User Bot)
    participant UserBot as User Bot
    participant AdminBot as Admin Bot
    actor Admin as Admin (Admin Bot)

    User->>UserBot: /confirm + Upload Foto Bukti Transfer
    UserBot->>AdminBot: Teruskan Foto Bukti + Telegram ID + Tombol Inline Approval
    AdminBot->>Admin: 📩 Bukti Transfer Baru dari Budi (ID: 123456789)<br/>[Button: Approve 30 Hari] [Button: Approve Lifetime] [Button: Tolak]
    Admin->>AdminBot: Tap Tombol [Approve 30 Hari]
    AdminBot->>AdminBot: Auto Generate Code & Activate User active_until + 30 Days
    AdminBot->>UserBot: Kirim Notifikasi Sukses Aktivasi ke User Bot
    UserBot->>User: 🎉 Pembayaran Dikonfirmasi! Akun Anda Aktif s/d 12 Sep 2026.
```

### 3.1 Alur Konfirmasi Pembayaran (`/confirm`):
1. **User Upload Bukti Transfer (`/confirm`)**:
   - Pengguna mengirimkan foto struk transfer / QRIS dengan command `/confirm` (atau langsung mengunggah foto saat status trial mepet/expired).
   - User Bot meneruskan foto bukti transfer tersebut ke chat room **Admin Bot**.
2. **One-Tap Approval Inline Buttons di Admin Bot**:
   - Admin Bot menampilkan foto bukti transfer disertai **Inline Keyboard Buttons**:
     - `[✅ Approve 30 Hari]` (callback_data: `approve_sub:123456789:30`)
     - `[✅ Approve 365 Hari]` (callback_data: `approve_sub:123456789:365`)
     - `[✅ Approve Lifetime]` (callback_data: `approve_sub:123456789:0`)
     - `[❌ Tolak]` (callback_data: `reject_sub:123456789`)
3. **Eksekusi 1-Tap Admin**:
   - Ketika Admin menekan salah satu tombol `Approve`, sistem secara otomatis:
     1. Meregenerasi Kode Konfirmasi.
     2. Mengubah `is_activated = TRUE` dan memperpanjang `active_until` pengguna.
     3. Mengirimkan notifikasi sukses perpanjangan langsung ke chat room **User Bot** pengguna!
