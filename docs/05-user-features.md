# Module 5: Commercial MVP User Features

## 1. Command `/status` (Profil, Status Langganan, & Telegram ID)
Menampilkan rincian status akun pengguna saat ini:

```text
📊 **Status Akun Anda**
━━━━━━━━━━━━━━━━━━━
🆔 Telegram ID : `123456789` (Tap untuk copy)
👤 Status      : Berlangganan Aktif ✅
📅 Masa Aktif  : s/d 12 Sep 2026 (28 hari lagi)
🎯 Target Rasio: 50 / 30 / 20 (Needs / Wants / Savings)
💰 Budget      : Rp 2.100.000 / Rp 3.000.000 (70%)
━━━━━━━━━━━━━━━━━━━
```

---

## 2. Command `/subscribe <pesan>` (Permintaan Langganan ke Admin)
Memudahkan pengguna trial/expired untuk menghubungi Admin dan meminta kode konfirmasi berlangganan.
- `/subscribe` -> Bot menampilkan pilihan paket berlangganan & instruksi request.
- `/subscribe Halo admin, saya mau beli paket 1 bulan via QRIS` -> Mengirimkan tiket pesan langsung ke **Admin Bot**.

---

## 3. Command `/confirm` (Kirim Bukti Pembayaran / Transfer)
Memudahkan pengguna untuk mengonfirmasi pembayaran langganan dengan mengunggah foto struk transfer / screenshot QRIS.

### 3.1 Cara Penggunaan:
- Pengguna mengirimkan foto bukti transfer disertai caption `/confirm` (atau menjalankan `/confirm` lalu mengunggah foto).
- User Bot merespon: *"📩 Bukti pembayaran Anda telah dikirimkan ke Admin. Mohon tunggu verifikasi Admin."*
- Foto beserta Telegram ID pengguna secara otomatis diteruskan ke **Admin Bot** untuk proses persetujuan 1-Tap (*One-Tap Approval*).

---

## 4. Command `/rekap` (Ringkasan, Health Score, & Rasio 50/30/20)

Command `/rekap` mendukung 3 fleksibilitas periode laporan keuangan (berdasarkan zona waktu `Asia/Jakarta` / `WIB`):

### 4.1 Variasi Parameter `/rekap`:
1. **`/rekap` (Default Bulanan)**: Menampilkan rekapitulasi keuangan bulan berjalan.
2. **`/rekap mingguan`** (atau `/rekap minggu`): Menampilkan rekapitulasi 7 hari terakhir / minggu berjalan.
3. **`/rekap <tgl_mulai> <tgl_selesai>` (Range of Date)**: Menampilkan rekapitulasi kustom rentang tanggal tertentu (contoh: `/rekap 2026-08-01 2026-08-15`).

---

## 5. Command `/ratio <needs> <wants> <savings>` (Kustomisasi Rasio Keuangan)
Secara default, bot menggunakan **Rasio 50/30/20** (50% Kebutuhan Pokok, 30% Keinginan, 20% Tabungan). Namun pengguna dapat mengatur rasio kustom sesuai kondisi finansial mereka masing-masing (`/ratio 60 20 20`).

---

## 6. Command `/insight` (AI Financial Advisory Cerdas & Hemat Token)
- Fitur ini **HANYA dipanggil saat pengguna secara eksplisit mengeksekusi `/insight`**.
- Gemini menganalisis ringkasan pengeluaran bulan ini berdasarkan rasio pengguna (`/ratio`) dan memberikan **3 rekomendasi finansial konkret & aksi nyata**.

---

## 7. Command `/rutin` (Pencatatan Transaksi Rutin Bulanan)
Mempermudah pencatatan pengeluaran & pemasukan tetap yang berulang setiap bulan (seperti tagihan kos, internet WiFi, listrik, Netflix, atau gaji bulanan).

---

## 8. Command `/history` & Hapus Transaksi
Menampilkan 10 transaksi terakhir pengguna. Setiap baris transaksi dilengkapi tombol inline **`[🗑️ Hapus]`** agar kesalahan input dapat dibatalkan secara mandiri oleh pengguna (`/hapus_terakhir`).

---

## 9. Command `/export` (Ekspor Data ke CSV/Excel)
Pengguna dapat mengunduh seluruh catatan transaksi bulanan mereka dalam format file `.csv`.

---

## 10. Command `/budget <nominal>` (Atur Batas Anggaran)
Mengatur batas anggaran pengeluaran bulanan pengguna (contoh: `/budget 3000000`).
