# Module 4: AI Parsing & Interactive Confirmation UI

## 1. Gemini AI Parsing Prompting Schema

Setiap input teks biasa atau foto struk/nota HARUS diproses oleh Gemini (`gemini-2.5-flash`) untuk menghasilkan **Structured JSON** murni dengan format schema berikut:

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

### Parsing Rules:
- **Tanggal (`date`)**: Gunakan tanggal hari ini berdasarkan zona waktu `Asia/Jakarta` (`WIB` / `UTC+7`) jika tidak ada tanggal spesifik yang terdeteksi di dalam teks/struk.
- **Nominal (`amount`)**: Harus berupa angka murni tanpa simbol kurensi (`Rp`), titik ribuan, atau koma desimal (contoh: `20000`).
- **Metode Pembayaran (`wallet`)**:
  - `E_WALLET`: Jika teks/struk menyebutkan GoPay, OVO, Dana, ShopeePay, LinkAja, QRIS.
  - `BANK`: Jika menyebutkan transfer, BCA, Mandiri, BRI, BNI, Jago, Blu, debit, ATM.
  - `CASH`: Default jika tidak disebutkan atau pembayaran tunai.
- **Pilar Keuangan (`financial_pillar`)**:
  - `NEEDS`: Kebutuhan pokok/wajib (makan dasar, bensin, listrik, obat, kosan, air, sekolah).
  - `WANTS`: Keinginan/gaya hidup (nonton, kopi boba, belanja baju, game, liburan, gadget).
  - `SAVINGS`: Tabungan/investasi (reksadana, emas, dana darurat, saham, deposito).
- **Tipe Transaksi (`type`)**:
  - `EXPENSE`: Pengeluaran (makan, belanja, bensin, tagihan, dll).
  - `INCOME`: Pemasukan (gaji, transferan masuk, piutang cair, dll).

---

## 2. Interactive Confirmation UI Flow

```text
📝 **Konfirmasi Transaksi**
━━━━━━━━━━━━━━━━━━━
📌 Tipe       : 📤 EXPENSE
💵 Nominal    : Rp 20.000
🏷️ Kategori   : Makanan & Minuman
🏛️ Pilar       : 🏠 NEEDS (Kebutuhan Pokok)
💳 Dompet     : 📱 E_WALLET (GoPay)
📝 Deskripsi  : makan siang warteg
📅 Tanggal    : 2026-08-12
━━━━━━━━━━━━━━━━━━━
Apakah data di atas sudah benar?

[ ✅ Simpan ]    [ ❌ Batal ]
```

### Technical Workflow:
1. Setelah Gemini mengekstrak data JSON, bot **TIDAK langsung** menyimpannya ke database `transactions`.
2. Bot menyusun pesan konfirmasi di atas yang dilengkapi dengan Telegram Inline Keyboard:
   - Button **`[✅ Simpan]`**: `callback_data` membawa payload terkompresi/base64 encoded dari data JSON transaksi secara *stateless*.
   - Button **`[❌ Batal]`**: `callback_data` memuat `cancel_tx`.
3. **Eksekusi Tombol `[✅ Simpan]`**:
   - Data transaksi di-insert ke tabel `transactions`.
   - Jika user adalah pengguna Free Trial, kurangi `trial_transactions_left` sebesar 1.
   - Periksa `monthly_budget` pengguna. Jika total pengeluaran bulan ini > 80% atau > 100% dari limit, sertakan peringatan di balasan pesan.
   - Edit pesan konfirmasi menjadi: *"✅ Transaksi berhasil disimpan!"*.
4. **Eksekusi Tombol `[❌ Batal]`**:
   - Edit pesan konfirmasi menjadi: *"❌ Transaksi dibatalkan."*.
