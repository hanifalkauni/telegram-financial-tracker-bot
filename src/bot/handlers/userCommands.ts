import { Context } from 'telegraf';
import { checkUserAccess } from '../../services/accessControl.js';
import { getRekapReport, formatRekapMessage } from '../../services/reportService.js';
import { generateAIInsight } from '../../services/gemini.js';
import { supabase, TransactionRecord, RecurringTransactionRecord } from '../../db/supabase.js';
import { formatRupiah, getWIBMonthRange } from '../../utils/timezone.js';
import { generateCSVBuffer } from '../../utils/csv.js';
import { ENV } from '../../config/env.js';
import { sendErrorAlert } from '../../utils/errorAlert.js';

export async function handleStart(ctx: Context) {
  const telegramId = ctx.from?.id;
  const name = ctx.from?.first_name || 'User';
  if (!telegramId) return;

  const access = await checkUserAccess(telegramId, name);

  const startMessage = `👋 **Selamat datang di SetorSini AI Bot, ${name}!**

Bot AI ini siap membantu Anda mencatat & mengelola keuangan pribadi secara otomatis.

🎁 **Status Akses**: ${access.statusType}
• Kuota Trial: ${access.user.trial_transactions_left}/5 transaksi gratis
• Masa Aktif: ${access.user.active_until ? new Date(access.user.active_until).toLocaleDateString('id-ID') : access.user.is_activated ? 'Seumur Hidup (Lifetime)' : 'Free Trial'}

💡 **Cara Menggunakan**:
• Ketik pesan biasa: \`makan siang warteg 20rb gopay\`
• Upload foto struk / nota belanja
• Ketik /rekap untuk melihat ringkasan keuangan
• Ketik /help untuk daftar command lengkap`;

  await ctx.reply(startMessage, { parse_mode: 'Markdown' });
}

export async function handleStatus(ctx: Context) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const access = await checkUserAccess(telegramId, ctx.from?.first_name);
  const u = access.user;

  let activeText = 'Free Trial';
  if (u.is_admin) activeText = 'Admin Seumur Hidup 👑';
  else if (u.is_activated && !u.active_until) activeText = 'Berlangganan Aktif (Lifetime) ✅';
  else if (u.is_activated && u.active_until) {
    activeText = `Berlangganan Aktif (s/d ${new Date(u.active_until).toLocaleDateString('id-ID')}) ✅`;
  } else if (!u.is_activated && u.trial_transactions_left <= 0) {
    activeText = 'Expired ⚠️';
  }

  const budgetText = u.monthly_budget ? formatRupiah(Number(u.monthly_budget)) : 'Belum diatur (/budget)';

  const msg = `📊 **Status Akun Anda**
━━━━━━━━━━━━━━━━━━━
🆔 **Telegram ID** : \`${u.telegram_id}\` (Tap untuk copy)
👤 **Nama**        : ${u.name || '-'}
👤 **Status Akun**  : ${activeText}
🎁 **Kuota Trial**  : ${u.trial_transactions_left}/5 transaksi
⚖️ **Target Rasio**: ${u.ratio_needs} / ${u.ratio_wants} / ${u.ratio_savings} (Needs/Wants/Savings)
💰 **Limit Budget** : ${budgetText}
━━━━━━━━━━━━━━━━━━━`;

  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

export async function handleSubscribe(ctx: Context) {
  const telegramId = ctx.from?.id;
  const name = ctx.from?.first_name || 'User';
  if (!telegramId || !ctx.message || !('text' in ctx.message)) return;

  const args = ctx.message.text.split(' ').slice(1).join(' ').trim();

  if (!args) {
    const subGuide = `🎁 **Permintaan Langganan SetorSini AI Bot**

Silakan pilih paket langganan dan hubungi Admin dengan mengetik:
👉 \`/subscribe <pesan_anda>\`

**Pilihan Paket**:
• 1 Bulan  : Rp 20.000
• 1 Tahun  : Rp 150.000
• Lifetime : Rp 300.000

Contoh: \`/subscribe Halo admin, saya ingin membeli paket 1 Bulan via QRIS\``;
    await ctx.reply(subGuide, { parse_mode: 'Markdown' });
    return;
  }

  // Send Subscription Ticket to Admin Bot
  try {
    const ticketMsg = `📩 **PERMINTAAN LANGGANAN BARU**
━━━━━━━━━━━━━━━━━━━
👤 **Nama**      : ${name} (@${ctx.from?.username || '-'})
🆔 **Telegram ID**: \`${telegramId}\`
💬 **Pesan**     : ${args}
━━━━━━━━━━━━━━━━━━━
Untuk membalas pesan user ini, ketik:
\`/reply ${telegramId} <pesan_anda>\``;

    const adminBotToken = ENV.ADMIN_BOT_TOKEN || ENV.BOT_TOKEN;
    const { data: admins } = await supabase.from('users').select('telegram_id').eq('is_admin', true);

    if (admins && admins.length > 0) {
      const { Telegraf } = await import('telegraf');
      const botAdmin = new Telegraf(adminBotToken);
      for (const a of admins) {
        await botAdmin.telegram.sendMessage(a.telegram_id, ticketMsg, { parse_mode: 'Markdown' }).catch(() => {});
      }
    }

    await ctx.reply('📩 **Permintaan langganan Anda telah terkirim ke Admin!**\n\nAdmin akan segera membalas pesan Anda di chat room ini.', { parse_mode: 'Markdown' });
  } catch (error) {
    await sendErrorAlert(error, 'handleSubscribe', `User: ${telegramId}`);
    await ctx.reply('⚠️ Gagal mengirimkan tiket langganan. Silakan coba lagi.');
  }
}

export async function handleConfirm(ctx: Context) {
  const telegramId = ctx.from?.id;
  const name = ctx.from?.first_name || 'User';
  if (!telegramId) return;

  const msg = ctx.message;
  let photoFileId: string | null = null;

  if (msg && 'photo' in msg && msg.photo.length > 0) {
    photoFileId = msg.photo[msg.photo.length - 1].file_id;
  }

  if (!photoFileId) {
    await ctx.reply('📸 **Silakan kirim foto struk transfer / screenshot QRIS dengan menuliskan caption `/confirm`**', { parse_mode: 'Markdown' });
    return;
  }

  try {
    const adminBotToken = ENV.ADMIN_BOT_TOKEN || ENV.BOT_TOKEN;
    const { data: admins } = await supabase.from('users').select('telegram_id').eq('is_admin', true);

    if (admins && admins.length > 0) {
      const { Telegraf } = await import('telegraf');
      const botAdmin = new Telegraf(adminBotToken);

      const caption = `📩 **KONFIRMASI PEMBAYARAN BARU**
━━━━━━━━━━━━━━━━━━━
👤 **Nama**      : ${name} (@${ctx.from?.username || '-'})
🆔 **Telegram ID**: \`${telegramId}\`
━━━━━━━━━━━━━━━━━━━
Pilih tindakan approval:`;

      for (const a of admins) {
        await botAdmin.telegram.sendPhoto(a.telegram_id, photoFileId, {
          caption: caption,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Approve 30 Hari', callback_data: `approve_sub:${telegramId}:30` },
                { text: '✅ Approve 1 Tahun', callback_data: `approve_sub:${telegramId}:365` },
              ],
              [
                { text: '♾️ Approve Lifetime', callback_data: `approve_sub:${telegramId}:0` },
                { text: '❌ Tolak', callback_data: `reject_sub:${telegramId}` },
              ],
            ],
          },
        }).catch(() => {});
      }
    }

    await ctx.reply('📩 **Bukti pembayaran Anda telah dikirimkan ke Admin.**\n\nMohon tunggu verifikasi Admin (Status akun Anda akan aktif otomatis setelah di-approve).', { parse_mode: 'Markdown' });
  } catch (error) {
    await sendErrorAlert(error, 'handleConfirm', `User: ${telegramId}`);
    await ctx.reply('⚠️ Gagal mengirimkan foto bukti transfer.');
  }
}

export async function handleRekap(ctx: Context) {
  const telegramId = ctx.from?.id;
  if (!telegramId || !ctx.message || !('text' in ctx.message)) return;

  const access = await checkUserAccess(telegramId, ctx.from?.first_name);

  const parts = ctx.message.text.trim().split(/\s+/);
  let rangeType: 'MONTH' | 'WEEK' | 'CUSTOM' = 'MONTH';
  let customStart = '';
  let customEnd = '';

  if (parts.length >= 2) {
    const param = parts[1].toLowerCase();
    if (param === 'mingguan' || param === 'minggu' || param === 'week') {
      rangeType = 'WEEK';
    } else if (parts.length >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(parts[1]) && /^\d{4}-\d{2}-\d{2}$/.test(parts[2])) {
      rangeType = 'CUSTOM';
      customStart = parts[1];
      customEnd = parts[2];
    }
  }

  const report = await getRekapReport(access.user.id, rangeType, customStart, customEnd);
  const msgText = formatRekapMessage(report, access.user);

  await ctx.reply(msgText, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📅 Minggu Ini', callback_data: 'rekap_filter:WEEK' },
          { text: '🗓️ Bulan Ini', callback_data: 'rekap_filter:MONTH' },
        ],
      ],
    },
  });
}

export async function handleRatio(ctx: Context) {
  const telegramId = ctx.from?.id;
  if (!telegramId || !ctx.message || !('text' in ctx.message)) return;

  const access = await checkUserAccess(telegramId, ctx.from?.first_name);
  const parts = ctx.message.text.trim().split(/\s+/);

  if (parts.length < 4) {
    await ctx.reply(`⚖️ **Kustomisasi Rasio Keuangan 50/30/20**

Rasio Aktif Anda: **${access.user.ratio_needs} / ${access.user.ratio_wants} / ${access.user.ratio_savings}** (Needs / Wants / Savings)

👉 **Cara Mengubah**:
\`/ratio <needs> <wants> <savings>\`

Contoh:
• \`/ratio 60 20 20\` (60% Kebutuhan, 20% Keinginan, 20% Tabungan)
• \`/ratio 70 20 10\``, { parse_mode: 'Markdown' });
    return;
  }

  const needs = parseInt(parts[1], 10);
  const wants = parseInt(parts[2], 10);
  const savings = parseInt(parts[3], 10);

  if (isNaN(needs) || isNaN(wants) || isNaN(savings) || needs + wants + savings !== 100) {
    await ctx.reply('⚠️ **Total rasio harus bernilai 100%!** (Contoh: `/ratio 60 20 20`)', { parse_mode: 'Markdown' });
    return;
  }

  await supabase.from('users').update({ ratio_needs: needs, ratio_wants: wants, ratio_savings: savings }).eq('id', access.user.id);

  await ctx.reply(`✅ **Target Rasio Keuangan Berhasil Diperbarui!**\n\n🎯 Target Baru: **${needs}% NEEDS / ${wants}% WANTS / ${savings}% SAVINGS**`, { parse_mode: 'Markdown' });
}

export async function handleInsight(ctx: Context) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const access = await checkUserAccess(telegramId, ctx.from?.first_name);
  if (!access.canProcess) {
    await ctx.reply(access.message || 'Access expired.', { parse_mode: 'Markdown' });
    return;
  }

  await ctx.sendChatAction('typing');

  const report = await getRekapReport(access.user.id, 'MONTH');
  const summaryText = `Total Pemasukan: ${formatRupiah(report.totalIncome)}, Total Pengeluaran: ${formatRupiah(report.totalExpense)}, Saldo Net: ${formatRupiah(report.netBalance)}.
Breakdown Pilar: Needs=${formatRupiah(report.pillarBreakdown.NEEDS)}, Wants=${formatRupiah(report.pillarBreakdown.WANTS)}, Savings=${formatRupiah(report.netBalance)}.
Kategori Terbesar: ${report.categoryBreakdown.slice(0, 3).map((c) => `${c.category} (${formatRupiah(c.amount)})`).join(', ')}`;

  const insight = await generateAIInsight(summaryText);
  await ctx.reply(`💡 **AI Financial Insight & Advisory**\n━━━━━━━━━━━━━━━━━━━\n${insight}`, { parse_mode: 'Markdown' });
}

export async function handleRutin(ctx: Context) {
  const telegramId = ctx.from?.id;
  if (!telegramId || !ctx.message || !('text' in ctx.message)) return;

  const access = await checkUserAccess(telegramId, ctx.from?.first_name);
  const parts = ctx.message.text.trim().split(/\s+/);

  if (parts.length >= 5 && parts[1].toLowerCase() === 'tambah') {
    const type = parts[2].toUpperCase() === 'INCOME' ? 'INCOME' : 'EXPENSE';
    const amount = parseFloat(parts[3]);
    const dueDay = parseInt(parts[4], 10);
    const desc = parts.slice(5).join(' ') || 'Tagihan Rutin';

    if (isNaN(amount) || isNaN(dueDay) || dueDay < 1 || dueDay > 31) {
      await ctx.reply('⚠️ Format salah. Contoh: `/rutin tambah EXPENSE 1500000 5 Uang Kos` (Jatuh tempo tgl 1-31)', { parse_mode: 'Markdown' });
      return;
    }

    await supabase.from('recurring_transactions').insert([{
      user_id: access.user.id,
      type,
      amount,
      category: 'Tagihan Rutin',
      description: desc,
      wallet: 'BANK',
      financial_pillar: type === 'EXPENSE' ? 'NEEDS' : 'SAVINGS',
      due_day: dueDay,
    }]);

    await ctx.reply(`✅ **Transaksi Rutin Ditambahkan!**\n\n📌 ${desc} (${formatRupiah(amount)}) - Jatuh tempo setiap tanggal **${dueDay}**`, { parse_mode: 'Markdown' });
    return;
  }

  const { data: recs } = await supabase.from('recurring_transactions').select('*').eq('user_id', access.user.id).eq('is_active', true);
  const list = (recs as RecurringTransactionRecord[]) || [];

  let text = '🔄 **Daftar Transaksi Rutin Bulanan**\n━━━━━━━━━━━━━━━━━━━\n';
  if (list.length === 0) {
    text += 'Belum ada transaksi rutin.\n\n👉 **Cara Tambah**: `/rutin tambah EXPENSE 1500000 5 Uang Kos`';
  } else {
    list.forEach((r, idx) => {
      text += `${idx + 1}. **${r.description}** - ${formatRupiah(Number(r.amount))} (Tgl ${r.due_day})\n`;
    });
  }

  await ctx.reply(text, { parse_mode: 'Markdown' });
}

export async function handleHistory(ctx: Context) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const access = await checkUserAccess(telegramId, ctx.from?.first_name);

  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', access.user.id)
    .order('created_at', { ascending: false })
    .limit(10);

  const txs = (transactions as TransactionRecord[]) || [];

  if (txs.length === 0) {
    await ctx.reply('📋 **Riwayat Transaksi**: Belum ada transaksi tercatat.', { parse_mode: 'Markdown' });
    return;
  }

  await ctx.reply('📜 **10 Transaksi Terakhir Anda**:', { parse_mode: 'Markdown' });

  for (const t of txs) {
    const icon = t.type === 'EXPENSE' ? '📤' : '📥';
    const text = `${icon} **${formatRupiah(Number(t.amount))}** | ${t.category}\n📝 ${t.description || '-'}\n📅 ${t.transaction_date}`;
    await ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🗑️ Hapus Transaksi Ini', callback_data: `delete_tx:${t.id}` }]],
      },
    });
  }
}

export async function handleHapusTerakhir(ctx: Context) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const access = await checkUserAccess(telegramId, ctx.from?.first_name);

  const { data: lastTx } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', access.user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!lastTx) {
    await ctx.reply('⚠️ Tidak ada transaksi yang bisa dihapus.');
    return;
  }

  await supabase.from('transactions').delete().eq('id', lastTx.id);
  await ctx.reply(`🗑️ **Transaksi Terakhir Berhasil Dihapus!**\n(${lastTx.category} - ${formatRupiah(Number(lastTx.amount))})`, { parse_mode: 'Markdown' });
}

export async function handleExport(ctx: Context) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const access = await checkUserAccess(telegramId, ctx.from?.first_name);
  const range = getWIBMonthRange();

  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', access.user.id)
    .gte('transaction_date', range.startDate)
    .lte('transaction_date', range.endDate);

  const txs = (transactions as TransactionRecord[]) || [];

  if (txs.length === 0) {
    await ctx.reply('⚠️ Belum ada transaksi bulan ini untuk diekspor.');
    return;
  }

  const buffer = generateCSVBuffer(txs);
  const filename = `Laporan_Keuangan_${range.startDate.slice(0, 7)}.csv`;

  await ctx.replyWithDocument({ source: buffer, filename: filename }, { caption: `📊 Laporan Keuangan CSV (${range.startDate} s/d ${range.endDate})` });
}

export async function handleBudget(ctx: Context) {
  const telegramId = ctx.from?.id;
  if (!telegramId || !ctx.message || !('text' in ctx.message)) return;

  const access = await checkUserAccess(telegramId, ctx.from?.first_name);
  const parts = ctx.message.text.trim().split(/\s+/);

  if (parts.length < 2) {
    const current = access.user.monthly_budget ? formatRupiah(Number(access.user.monthly_budget)) : 'Belum diatur';
    await ctx.reply(`🎯 **Pengaturan Limit Budget Bulanan**\n\nBudget Aktif: **${current}**\n\n👉 **Cara Atur**: \`/budget 3000000\``, { parse_mode: 'Markdown' });
    return;
  }

  const amount = parseFloat(parts[1]);
  if (isNaN(amount) || amount <= 0) {
    await ctx.reply('⚠️ Masukkan nominal angka murni yang valid. Contoh: `/budget 3000000`', { parse_mode: 'Markdown' });
    return;
  }

  await supabase.from('users').update({ monthly_budget: amount }).eq('id', access.user.id);
  await ctx.reply(`🎯 **Budget Bulanan Berhasil Diatur!**\n\nBatas Pengeluaran: **${formatRupiah(amount)}**`, { parse_mode: 'Markdown' });
}

export async function handleHelp(ctx: Context) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const access = await checkUserAccess(telegramId, ctx.from?.first_name);

  if (access.user.is_admin) {
    const adminHelp = `👑 **Panduan Admin & Pengelolaan Bisnis**

**Fitur Manajemen Admin**:
• /users : Lihat 20 daftar pengguna & Telegram ID
• /generate_code 30 : Buat Kode Konfirmasi 30 Hari
• /generate_code 0 : Buat Kode Konfirmasi Lifetime
• /reply <telegram_id> <pesan> : Balas tiket pesan user
• /extend <telegram_id> <hari> : Perpanjang langganan user
• /admin_stats : Statistik user trial, subscriber & transaksi
• /broadcast <pesan> : Kirim pesan masal ke seluruh user

**Fitur Pencatatan**:
• Catat teks/struk, /status, /rekap, /ratio, /insight, /export`;
    await ctx.reply(adminHelp, { parse_mode: 'Markdown' });
    return;
  }

  const userHelp = `💡 **Panduan Penggunaan SetorSini AI Bot**

🎁 **Status Trial**: Gratis 5 transaksi awal.
• Catat Teks: \`makan siang warteg 20rb gopay\`
• Upload Foto Struk / Nota

**Menu Command**:
• /status : Cek Telegram ID & sisa masa aktif
• /subscribe : Minta informasi / tiket langganan
• /confirm : Kirim foto bukti transfer ke Admin
• /rekap : Lihat ringkasan laporan & health score
• /ratio 60 20 20 : Atur target rasio 50/30/20
• /insight : Panggil AI Advisor saran finansial
• /rutin : Kelola transaksi tagihan rutin
• /history : Lihat 10 transaksi (bisa hapus)
• /export : Download laporan CSV Excel
• /budget 3000000 : Atur batas anggaran bulanan`;

  await ctx.reply(userHelp, { parse_mode: 'Markdown' });
}
