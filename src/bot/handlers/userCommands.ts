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

  const startMessage = `👋 <b>Selamat datang di SetorSini AI Bot, ${name}!</b>

Bot AI ini siap membantu Anda mencatat &amp; mengelola keuangan pribadi secara otomatis.

🎁 <b>Status Akses</b>: ${access.statusType}
• Kuota Trial: ${access.user.trial_transactions_left}/5 transaksi gratis
• Masa Aktif: ${access.user.active_until ? new Date(access.user.active_until).toLocaleDateString('id-ID') : access.user.is_activated ? 'Seumur Hidup (Lifetime)' : 'Free Trial'}

💡 <b>Cara Menggunakan</b>:
• Ketik pesan biasa: <code>makan siang warteg 20rb gopay</code>
• Upload foto struk / nota belanja
• Ketik /rekap untuk melihat ringkasan keuangan
• Ketik /help untuk daftar command lengkap`;

  await ctx.reply(startMessage, { parse_mode: 'HTML' });
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

  const msg = `📊 <b>Status Akun Anda</b>
━━━━━━━━━━━━━━━━━━━
🆔 <b>Telegram ID</b> : <code>${u.telegram_id}</code> (Tap untuk copy)
👤 <b>Nama</b>        : ${u.name || '-'}
👤 <b>Status Akun</b>  : ${activeText}
🎁 <b>Kuota Trial</b>  : ${u.trial_transactions_left}/5 transaksi
⚖️ <b>Target Rasio</b>: ${u.ratio_needs} / ${u.ratio_wants} / ${u.ratio_savings} (Needs/Wants/Savings)
💰 <b>Limit Budget</b> : ${budgetText}
━━━━━━━━━━━━━━━━━━━`;

  await ctx.reply(msg, { parse_mode: 'HTML' });
}

export async function handleSubscribe(ctx: Context) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const { data: dbPackages } = await supabase
    .from('subscription_packages')
    .select('*')
    .eq('is_active', true)
    .order('price', { ascending: true });

  let inlineKeyboard: any[][] = [];
  let packageSummaryList = '';

  if (dbPackages && dbPackages.length > 0) {
    dbPackages.forEach((pkg) => {
      const badgeText = pkg.badge ? ` <i>(${pkg.badge})</i>` : '';
      packageSummaryList += `• <b>${pkg.name}</b> : ${formatRupiah(Number(pkg.price))}${badgeText}\n`;

      const buttonLabel = `${pkg.name} - ${formatRupiah(Number(pkg.price))}${pkg.badge ? ` (${pkg.badge})` : ''}`;
      inlineKeyboard.push([{ text: buttonLabel, callback_data: `sub_pkg:${pkg.duration_days}:${pkg.price}` }]);
    });
  } else {
    // Fallback defaults
    packageSummaryList = `• 📦 <b>1 Bulan</b> : Rp 20.000 / bulan\n• 🌟 <b>1 Tahun</b> : Rp 150.000 / tahun <i>(Hemat 37%)</i>\n• ♾️ <b>Lifetime</b> : Rp 300.000 <i>(Akses Seumur Hidup)</i>\n`;
    inlineKeyboard = [
      [{ text: '📦 Paket 1 Bulan - Rp 20.000', callback_data: 'sub_pkg:30:20000' }],
      [{ text: '🌟 Paket 1 Tahun - Rp 150.000 (Hemat 37%)', callback_data: 'sub_pkg:365:150000' }],
      [{ text: '♾️ Paket Lifetime - Rp 300.000 (Seumur Hidup)', callback_data: 'sub_pkg:0:300000' }],
    ];
  }

  const msg = `🎁 <b>Pilihan Paket Berlangganan SetorSini AI Bot</b>

Buka akses fitur tanpa batas, catat struk belanja &amp; analisis finansial AI tanpa kuota trial:

${packageSummaryList}
Silakan pilih paket di bawah untuk melanjutkan pembayaran:`;

  await ctx.reply(msg, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: inlineKeyboard,
    },
  });
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
    await ctx.reply('📸 <b>Silakan kirim foto struk transfer / screenshot QRIS dengan menuliskan caption <code>/confirm</code></b>', { parse_mode: 'HTML' });
    return;
  }

  try {
    const adminBotToken = ENV.ADMIN_BOT_TOKEN || ENV.BOT_TOKEN;
    const { data: admins } = await supabase.from('users').select('telegram_id').eq('is_admin', true);

    if (admins && admins.length > 0) {
      const { Telegraf } = await import('telegraf');
      const botAdmin = new Telegraf(adminBotToken);

      const caption = `📩 <b>KONFIRMASI PEMBAYARAN BARU</b>
━━━━━━━━━━━━━━━━━━━
👤 <b>Nama</b>      : ${name} (@${ctx.from?.username || '-'})
🆔 <b>Telegram ID</b>: <code>${telegramId}</code>
━━━━━━━━━━━━━━━━━━━
Pilih tindakan approval:`;

      for (const a of admins) {
        await botAdmin.telegram.sendPhoto(a.telegram_id, photoFileId, {
          caption: caption,
          parse_mode: 'HTML',
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

    await ctx.reply('📩 <b>Bukti pembayaran Anda telah dikirimkan ke Admin.</b>\n\nMohon tunggu verifikasi Admin (Status akun Anda akan aktif otomatis setelah di-approve).', { parse_mode: 'HTML' });
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
    parse_mode: 'HTML',
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
    await ctx.reply(`⚖️ <b>Kustomisasi Rasio Keuangan 50/30/20</b>

Rasio Aktif Anda: <b>${access.user.ratio_needs} / ${access.user.ratio_wants} / ${access.user.ratio_savings}</b> (Needs / Wants / Savings)

👉 <b>Cara Mengubah</b>:
<code>/ratio &lt;needs&gt; &lt;wants&gt; &lt;savings&gt;</code>

Contoh:
• <code>/ratio 60 20 20</code> (60% Kebutuhan, 20% Keinginan, 20% Tabungan)
• <code>/ratio 70 20 10</code>`, { parse_mode: 'HTML' });
    return;
  }

  const needs = parseInt(parts[1], 10);
  const wants = parseInt(parts[2], 10);
  const savings = parseInt(parts[3], 10);

  if (isNaN(needs) || isNaN(wants) || isNaN(savings) || needs + wants + savings !== 100) {
    await ctx.reply('⚠️ <b>Total rasio harus bernilai 100%!</b> (Contoh: <code>/ratio 60 20 20</code>)', { parse_mode: 'HTML' });
    return;
  }

  await supabase.from('users').update({ ratio_needs: needs, ratio_wants: wants, ratio_savings: savings }).eq('id', access.user.id);

  await ctx.reply(`✅ <b>Target Rasio Keuangan Berhasil Diperbarui!</b>\n\n🎯 Target Baru: <b>${needs}% NEEDS / ${wants}% WANTS / ${savings}% SAVINGS</b>`, { parse_mode: 'HTML' });
}

export async function handleInsight(ctx: Context) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const access = await checkUserAccess(telegramId, ctx.from?.first_name);
  if (!access.canProcess) {
    await ctx.reply(access.message || 'Access expired.', { parse_mode: 'HTML' });
    return;
  }

  await ctx.sendChatAction('typing');

  const report = await getRekapReport(access.user.id, 'MONTH');
  const summaryText = `Total Pemasukan: ${formatRupiah(report.totalIncome)}, Total Pengeluaran: ${formatRupiah(report.totalExpense)}, Saldo Net: ${formatRupiah(report.netBalance)}.
Breakdown Pilar: Needs=${formatRupiah(report.pillarBreakdown.NEEDS)}, Wants=${formatRupiah(report.pillarBreakdown.WANTS)}, Savings=${formatRupiah(report.netBalance)}.
Kategori Terbesar: ${report.categoryBreakdown.slice(0, 3).map((c) => `${c.category} (${formatRupiah(c.amount)})`).join(', ')}`;

  const insight = await generateAIInsight(summaryText);
  await ctx.reply(`💡 <b>AI Financial Insight &amp; Advisory</b>\n━━━━━━━━━━━━━━━━━━━\n${insight}`, { parse_mode: 'HTML' });
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
      await ctx.reply('⚠️ Format salah. Contoh: <code>/rutin tambah EXPENSE 1500000 5 Uang Kos</code> (Jatuh tempo tgl 1-31)', { parse_mode: 'HTML' });
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

    await ctx.reply(`✅ <b>Transaksi Rutin Ditambahkan!</b>\n\n📌 ${desc} (${formatRupiah(amount)}) - Jatuh tempo setiap tanggal <b>${dueDay}</b>`, { parse_mode: 'HTML' });
    return;
  }

  const { data: recs } = await supabase.from('recurring_transactions').select('*').eq('user_id', access.user.id).eq('is_active', true);
  const list = (recs as RecurringTransactionRecord[]) || [];

  let text = '🔄 <b>Daftar Transaksi Rutin Bulanan</b>\n━━━━━━━━━━━━━━━━━━━\n';
  if (list.length === 0) {
    text += 'Belum ada transaksi rutin.\n\n👉 <b>Cara Tambah</b>: <code>/rutin tambah EXPENSE 1500000 5 Uang Kos</code>';
  } else {
    list.forEach((r, idx) => {
      text += `${idx + 1}. <b>${r.description}</b> - ${formatRupiah(Number(r.amount))} (Tgl ${r.due_day})\n`;
    });
  }

  await ctx.reply(text, { parse_mode: 'HTML' });
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
    await ctx.reply('📋 <b>Riwayat Transaksi</b>: Belum ada transaksi tercatat.', { parse_mode: 'HTML' });
    return;
  }

  await ctx.reply('📜 <b>10 Transaksi Terakhir Anda</b>:', { parse_mode: 'HTML' });

  for (const t of txs) {
    const icon = t.type === 'EXPENSE' ? '📤' : '📥';
    const text = `${icon} <b>${formatRupiah(Number(t.amount))}</b> | ${t.category}\n📝 ${t.description || '-'}\n📅 ${t.transaction_date}`;
    await ctx.reply(text, {
      parse_mode: 'HTML',
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
  await ctx.reply(`🗑️ <b>Transaksi Terakhir Berhasil Dihapus!</b>\n(${lastTx.category} - ${formatRupiah(Number(lastTx.amount))})`, { parse_mode: 'HTML' });
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
    await ctx.reply(`🎯 <b>Pengaturan Limit Budget Bulanan</b>\n\nBudget Aktif: <b>${current}</b>\n\n👉 <b>Cara Atur</b>: <code>/budget 3000000</code>`, { parse_mode: 'HTML' });
    return;
  }

  const amount = parseFloat(parts[1]);
  if (isNaN(amount) || amount <= 0) {
    await ctx.reply('⚠️ Masukkan nominal angka murni yang valid. Contoh: <code>/budget 3000000</code>', { parse_mode: 'HTML' });
    return;
  }

  await supabase.from('users').update({ monthly_budget: amount }).eq('id', access.user.id);
  await ctx.reply(`🎯 <b>Budget Bulanan Berhasil Diatur!</b>\n\nBatas Pengeluaran: <b>${formatRupiah(amount)}</b>`, { parse_mode: 'HTML' });
}

export async function handleHelp(ctx: Context) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const access = await checkUserAccess(telegramId, ctx.from?.first_name);

  if (access.user.is_admin) {
    const adminHelp = `👑 <b>Panduan Admin &amp; Pengelolaan Bisnis</b>

<b>Fitur Manajemen Admin</b>:
• /users : Lihat 20 daftar pengguna &amp; Telegram ID
• /payments : Lihat &amp; kelola metode pembayaran
• /add_payment : Tambah metode pembayaran baru
• /packages : Lihat &amp; kelola paket langganan
• /add_package : Tambah paket langganan baru
• /generate_code 30 : Buat Kode Konfirmasi 30 Hari
• /generate_code 0 : Buat Kode Konfirmasi Lifetime
• /reply &lt;telegram_id&gt; &lt;pesan&gt; : Balas tiket pesan user
• /extend &lt;telegram_id&gt; &lt;hari&gt; : Perpanjang langganan user
• /admin_stats : Statistik user trial, subscriber &amp; transaksi
• /broadcast &lt;pesan&gt; : Kirim pesan masal ke seluruh user

<b>Fitur Pencatatan</b>:
• Catat teks/struk, /status, /rekap, /ratio, /insight, /export`;
    await ctx.reply(adminHelp, { parse_mode: 'HTML' });
    return;
  }

  const userHelp = `💡 <b>Panduan Penggunaan SetorSini AI Bot</b>

🎁 <b>Status Trial</b>: Gratis 5 transaksi awal.
• Catat Teks: <code>makan siang warteg 20rb gopay</code>
• Upload Foto Struk / Nota

<b>Menu Command</b>:
• /status : Cek Telegram ID &amp; sisa masa aktif
• /subscribe : Pilih paket &amp; langganan 1-Tap
• /confirm : Kirim foto bukti transfer ke Admin
• /rekap : Lihat ringkasan laporan &amp; health score
• /ratio 60 20 20 : Atur target rasio 50/30/20
• /insight : Panggil AI Advisor saran finansial
• /rutin : Kelola transaksi tagihan rutin
• /history : Lihat 10 transaksi (bisa hapus)
• /export : Download laporan CSV Excel
• /budget 3000000 : Atur batas anggaran bulanan`;

  await ctx.reply(userHelp, { parse_mode: 'HTML' });
}
