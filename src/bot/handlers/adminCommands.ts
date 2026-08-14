import { Context, Telegraf } from 'telegraf';
import { supabase, UserRecord } from '../../db/supabase.js';
import { ENV } from '../../config/env.js';
import { redeemMasterCode, getOrCreateUser } from '../../services/accessControl.js';
import { formatRupiah } from '../../utils/timezone.js';
import { sendErrorAlert } from '../../utils/errorAlert.js';

export async function checkIsAdmin(ctx: Context): Promise<boolean> {
  const telegramId = ctx.from?.id;
  const name = ctx.from?.first_name || 'User';
  if (!telegramId) return false;

  const { data: user } = await supabase.from('users').select('is_admin').eq('telegram_id', telegramId).single();

  if (!user || !user.is_admin) {
    if (ctx.message && 'text' in ctx.message && ctx.message.text.trim() === ENV.ADMIN_MASTER_CODE) {
      const userRecord = await getOrCreateUser(telegramId, name);
      const reply = await redeemMasterCode(userRecord);
      await ctx.reply(reply, { parse_mode: 'HTML' });
      return true;
    }

    await ctx
      .reply(
        '⛔ <b>Akses Ditolak!</b>\n\nChat room ini khusus untuk Admin SetorSini. Anda tidak memiliki wewenang untuk mengakses bot ini.',
        { parse_mode: 'HTML' }
      )
      .catch(() => {});
    return false;
  }

  return true;
}

export async function handleAdminStart(ctx: Context) {
  if (!(await checkIsAdmin(ctx))) return;

  const name = ctx.from?.first_name || 'Admin';
  const startMsg = `👑 <b>Selamat Datang di Panel Admin SetorSini, ${name}!</b>

Anda memiliki akses penuh untuk mengelola sistem, menerima notifikasi error, mengelola pembayaran, paket langganan, dan mengonfirmasi langganan pengguna.

💡 <b>Menu Command Admin</b>:
• /admin_stats : Lihat statistik bisnis &amp; pengguna
• /users : Lihat 20 daftar pengguna &amp; Telegram ID
• /payments : Kelola daftar metode pembayaran
• /add_payment : Tambah metode pembayaran baru
• /delete_payment : Hapus metode pembayaran
• /packages : Kelola paket berlangganan
• /add_package : Tambah paket berlangganan baru
• /delete_package : Hapus paket berlangganan
• /generate_code 30 : Buat Kode Konfirmasi 30 Hari
• /generate_code 0 : Buat Kode Konfirmasi Lifetime
• /reply &lt;telegram_id&gt; &lt;pesan&gt; : Balas tiket pesan pengguna
• /extend &lt;telegram_id&gt; &lt;hari&gt; : Perpanjang langganan user
• /broadcast &lt;pesan&gt; : Kirim pesan pengumuman masal`;

  await ctx.reply(startMsg, { parse_mode: 'HTML' });
}

export async function handleAdminReply(ctx: Context) {
  if (!(await checkIsAdmin(ctx))) return;
  if (!ctx.message || !('text' in ctx.message)) return;

  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length < 3) {
    await ctx.reply('⚠️ <b>Format Salah</b>. Gunakan: <code>/reply &lt;telegram_id&gt; &lt;pesan_balasan&gt;</code>', { parse_mode: 'HTML' });
    return;
  }

  const targetId = parseInt(parts[1], 10);
  const replyMessage = parts.slice(2).join(' ');

  if (isNaN(targetId)) {
    await ctx.reply('⚠️ Telegram ID harus berupa angka.');
    return;
  }

  try {
    const userBot = new Telegraf(ENV.BOT_TOKEN);
    await userBot.telegram.sendMessage(targetId, `📩 <b>Pesan Balasan dari Admin</b>:\n━━━━━━━━━━━━━━━━━━━\n${replyMessage}`, { parse_mode: 'HTML' });
    await ctx.reply(`✅ Pesan balasan berhasil dikirimkan ke Telegram ID <code>${targetId}</code>!`, { parse_mode: 'HTML' });
  } catch (error) {
    await sendErrorAlert(error, 'handleAdminReply', `Target ID: ${targetId}`);
    await ctx.reply(`⚠️ Gagal mengirimkan pesan ke Telegram ID <code>${targetId}</code>. Pengguna mungkin belum pernah menekan /start pada User Bot.`);
  }
}

export async function handleGenerateCode(ctx: Context) {
  if (!(await checkIsAdmin(ctx))) return;
  if (!ctx.message || !('text' in ctx.message)) return;

  const parts = ctx.message.text.trim().split(/\s+/);
  let durationDays: number | null = 30;

  if (parts.length >= 2) {
    const arg = parts[1].toLowerCase();
    if (arg === '0' || arg === 'unlimited' || arg === 'lifetime') {
      durationDays = null;
    } else {
      const parsedDays = parseInt(arg, 10);
      if (!isNaN(parsedDays) && parsedDays >= 0) {
        durationDays = parsedDays === 0 ? null : parsedDays;
      }
    }
  }

  const code = Math.random().toString(36).substring(2, 10).toUpperCase();
  const { data: adminUser } = await supabase.from('users').select('id').eq('telegram_id', ctx.from?.id).single();

  await supabase.from('confirmation_codes').insert([{
    code: code,
    duration_days: durationDays,
    created_by: adminUser?.id || null,
  }]);

  const durationLabel = durationDays === null ? 'Seumur Hidup (Lifetime)' : `${durationDays} Hari`;

  await ctx.reply(`🔑 <b>Kode Konfirmasi Berlangganan Dibuat!</b>
━━━━━━━━━━━━━━━━━━━
Kode       : <code>${code}</code> (Tap untuk copy)
Masa Aktif : ${durationLabel}
━━━━━━━━━━━━━━━━━━━
Kirimkan kode ini ke pengguna untuk mengaktivasi bot.`, { parse_mode: 'HTML' });
}

export async function handleAdminStats(ctx: Context) {
  if (!(await checkIsAdmin(ctx))) return;

  const { count: totalUsers } = await supabase.from('users').select('*', { count: 'exact', head: true });
  const { count: trialUsers } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_activated', false).gt('trial_transactions_left', 0);
  const { count: activeSubs } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_activated', true);
  const { count: expiredUsers } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_activated', false).lte('trial_transactions_left', 0);
  const { count: unusedCodes } = await supabase.from('confirmation_codes').select('*', { count: 'exact', head: true }).eq('is_used', false);
  const { count: totalTx } = await supabase.from('transactions').select('*', { count: 'exact', head: true });

  const statsMsg = `👑 <b>Statistik Bisnis Financial Tracker Bot</b>
━━━━━━━━━━━━━━━━━━━
👥 Total User Terdaftar  : ${totalUsers || 0}
🎁 Active Trial Users   : ${trialUsers || 0}
✅ Active Subscribers   : ${activeSubs || 0}
⚠️ Expired Users        : ${expiredUsers || 0}
🔑 Kode Belum Dipakai   : ${unusedCodes || 0}
📈 Total Transaksi System: ${totalTx || 0}
━━━━━━━━━━━━━━━━━━━`;

  await ctx.reply(statsMsg, { parse_mode: 'HTML' });
}

export async function handleUsersList(ctx: Context) {
  if (!(await checkIsAdmin(ctx))) return;

  const { data: users } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  const uList = (users as UserRecord[]) || [];

  if (uList.length === 0) {
    await ctx.reply('👥 Belum ada pengguna terdaftar.');
    return;
  }

  let text = '👥 <b>20 Pengguna Terbaru Terdaftar</b>:\n━━━━━━━━━━━━━━━━━━━\n';

  uList.forEach((u, i) => {
    let status = 'Trial';
    if (u.is_admin) status = 'Admin 👑';
    else if (u.is_activated) status = 'Active ✅';
    else if (u.trial_transactions_left <= 0) status = 'Expired ⚠️';

    text += `${i + 1}. <b>${u.name || 'User'}</b> | ID: <code>${u.telegram_id}</code> | Status: ${status}\n`;
  });

  await ctx.reply(text, { parse_mode: 'HTML' });
}

export async function handleExtendUser(ctx: Context) {
  if (!(await checkIsAdmin(ctx))) return;
  if (!ctx.message || !('text' in ctx.message)) return;

  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length < 3) {
    await ctx.reply('⚠️ <b>Format Salah</b>. Contoh: <code>/extend 123456789 30</code> atau <code>/extend 123456789 0</code> (Lifetime)', { parse_mode: 'HTML' });
    return;
  }

  const targetId = parseInt(parts[1], 10);
  const daysArg = parts[2].toLowerCase();

  if (isNaN(targetId)) {
    await ctx.reply('⚠️ Telegram ID harus angka.');
    return;
  }

  let newActiveUntil: string | null = null;
  if (daysArg !== '0' && daysArg !== 'unlimited' && daysArg !== 'lifetime') {
    const days = parseInt(daysArg, 10);
    if (!isNaN(days) && days > 0) {
      const now = new Date();
      now.setDate(now.getDate() + days);
      newActiveUntil = now.toISOString();
    }
  }

  const { error } = await supabase
    .from('users')
    .update({ is_activated: true, active_until: newActiveUntil, activated_at: new Date().toISOString() })
    .eq('telegram_id', targetId);

  if (error) {
    await ctx.reply(`⚠️ Gagal memperpanjang user: ${error.message}`);
    return;
  }

  await ctx.reply(`✅ <b>Masa aktif user <code>${targetId}</code> berhasil diperpanjang!</b>`, { parse_mode: 'HTML' });
}

export async function handleBroadcast(ctx: Context) {
  if (!(await checkIsAdmin(ctx))) return;
  if (!ctx.message || !('text' in ctx.message)) return;

  const broadcastText = ctx.message.text.trim().split(/\s+/).slice(1).join(' ');
  if (!broadcastText) {
    await ctx.reply('⚠️ Masukkan pesan yang ingin di-broadcast. Contoh: <code>/broadcast Halo semuanya!</code>', { parse_mode: 'HTML' });
    return;
  }

  const { data: users } = await supabase.from('users').select('telegram_id');
  const userBot = new Telegraf(ENV.BOT_TOKEN);

  let successCount = 0;
  if (users) {
    for (const u of users) {
      try {
        await userBot.telegram.sendMessage(u.telegram_id, `📢 <b>PENGUMUMAN BROADCAST</b>\n━━━━━━━━━━━━━━━━━━━\n${broadcastText}`, { parse_mode: 'HTML' });
        successCount++;
      } catch {
        // Ignore blocked users
      }
    }
  }

  await ctx.reply(`📢 Broadcast selesai dikirimkan ke <b>${successCount}</b> pengguna!`, { parse_mode: 'HTML' });
}

export async function handlePaymentMethodsList(ctx: Context) {
  if (!(await checkIsAdmin(ctx))) return;

  const { data: payMethods } = await supabase
    .from('payment_methods')
    .select('*')
    .order('created_at', { ascending: true });

  const list = payMethods || [];

  let text = '💳 <b>Daftar Metode Pembayaran Aktif</b>:\n━━━━━━━━━━━━━━━━━━━\n';

  if (list.length === 0) {
    text += 'Belum ada metode pembayaran kustom di database (menggunakan default system).\n\n';
  } else {
    list.forEach((pm, idx) => {
      const statusIcon = pm.is_active ? '✅' : '❌';
      text += `${idx + 1}. [ID: <code>${pm.id}</code>] <b>${pm.name}</b>\n   No. Rek: <code>${pm.account_number}</code> | ${pm.account_name} (${statusIcon})\n\n`;
    });
  }

  text += `💡 <b>Panduan Pengelolaan</b>:
• Tambah : <code>/add_payment Nama Bank | Nomor Rekening | Nama Pemilik</code>
• Hapus  : <code>/delete_payment &lt;id&gt;</code>`;

  await ctx.reply(text, { parse_mode: 'HTML' });
}

export async function handleAddPayment(ctx: Context) {
  if (!(await checkIsAdmin(ctx))) return;
  if (!ctx.message || !('text' in ctx.message)) return;

  const rawInput = ctx.message.text.replace(/^\/add_payment\s*/i, '').trim();

  if (!rawInput || !rawInput.includes('|')) {
    await ctx.reply(
      '⚠️ <b>Format Salah</b>.\n\nGunakan separator <code>|</code>:\n<code>/add_payment Nama Bank | Nomor Rekening | Nama Pemilik</code>\n\nContoh:\n<code>/add_payment Bank Mandiri | 9876543210 | a.n. SetorSini AI</code>',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const parts = rawInput.split('|').map((p) => p.trim());
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
    await ctx.reply('⚠️ Harap isi ketiga parameter: <code>Nama Bank | No Rekening | Nama Pemilik</code>', { parse_mode: 'HTML' });
    return;
  }

  const [name, accountNumber, accountName] = parts;

  const { data, error } = await supabase
    .from('payment_methods')
    .insert([{ name, account_number: accountNumber, account_name: accountName, is_active: true }])
    .select('*')
    .single();

  if (error) {
    await ctx.reply(`⚠️ Gagal menambahkan metode pembayaran: ${error.message}`);
    return;
  }

  await ctx.reply(`✅ <b>Metode Pembayaran Ditambahkan!</b>\n━━━━━━━━━━━━━━━━━━━\nID      : <code>${data.id}</code>\nMetode  : <b>${name}</b>\nNo. Rek : <code>${accountNumber}</code>\nPemilik : ${accountName}`, { parse_mode: 'HTML' });
}

export async function handleDeletePayment(ctx: Context) {
  if (!(await checkIsAdmin(ctx))) return;
  if (!ctx.message || !('text' in ctx.message)) return;

  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length < 2) {
    await ctx.reply('⚠️ <b>Format Salah</b>. Gunakan: <code>/delete_payment &lt;id&gt;</code> (Cek ID via /payments)', { parse_mode: 'HTML' });
    return;
  }

  const id = parseInt(parts[1], 10);
  if (isNaN(id)) {
    await ctx.reply('⚠️ ID metode pembayaran harus berupa angka.');
    return;
  }

  const { error } = await supabase.from('payment_methods').delete().eq('id', id);

  if (error) {
    await ctx.reply(`⚠️ Gagal menghapus metode pembayaran ID ${id}: ${error.message}`);
    return;
  }

  await ctx.reply(`🗑️ <b>Metode Pembayaran ID <code>${id}</code> telah berhasil dihapus.</b>`, { parse_mode: 'HTML' });
}

export async function handlePackagesList(ctx: Context) {
  if (!(await checkIsAdmin(ctx))) return;

  const { data: packages } = await supabase
    .from('subscription_packages')
    .select('*')
    .order('created_at', { ascending: true });

  const list = packages || [];

  let text = '🎁 <b>Daftar Paket Berlangganan Aktif</b>:\n━━━━━━━━━━━━━━━━━━━\n';

  if (list.length === 0) {
    text += 'Belum ada paket berlangganan kustom di database (menggunakan default system).\n\n';
  } else {
    list.forEach((pkg, idx) => {
      const statusIcon = pkg.is_active ? '✅' : '❌';
      const durationText = pkg.duration_days === 0 ? 'Lifetime' : `${pkg.duration_days} Hari`;
      const badgeText = pkg.badge ? ` | Badge: ${pkg.badge}` : '';
      text += `${idx + 1}. [ID: <code>${pkg.id}</code>] <b>${pkg.name}</b>\n   Harga: <code>${formatRupiah(Number(pkg.price))}</code> | ${durationText}${badgeText} (${statusIcon})\n\n`;
    });
  }

  text += `💡 <b>Panduan Pengelolaan</b>:
• Tambah : <code>/add_package Nama Paket | DurasiHari | Harga | Badge(opsional)</code>
  <i>Contoh: /add_package Paket 1 Bulan | 30 | 20000 | Populer</i>
  <i>Contoh: /add_package Paket Lifetime | 0 | 300000 | Akses Selamanya</i>
• Hapus  : <code>/delete_package &lt;id&gt;</code>`;

  await ctx.reply(text, { parse_mode: 'HTML' });
}

export async function handleAddPackage(ctx: Context) {
  if (!(await checkIsAdmin(ctx))) return;
  if (!ctx.message || !('text' in ctx.message)) return;

  const rawInput = ctx.message.text.replace(/^\/add_package\s*/i, '').trim();

  if (!rawInput || !rawInput.includes('|')) {
    await ctx.reply(
      '⚠️ <b>Format Salah</b>.\n\nGunakan separator <code>|</code>:\n<code>/add_package Nama Paket | DurasiHari | Harga | BadgeOpsional</code>\n\nContoh:\n<code>/add_package Paket 6 Bulan | 180 | 100000 | Diskon 20%</code>',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const parts = rawInput.split('|').map((p) => p.trim());
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
    await ctx.reply('⚠️ Harap isi minimal 3 parameter: <code>Nama Paket | DurasiHari | Harga</code>', { parse_mode: 'HTML' });
    return;
  }

  const name = parts[0];
  const durationDays = parseInt(parts[1], 10);
  const price = parseFloat(parts[2]);
  const badge = parts[3] || null;

  if (isNaN(durationDays) || isNaN(price)) {
    await ctx.reply('⚠️ Durasi hari dan Harga harus berupa angka valid. (Gunakan 0 untuk Lifetime)', { parse_mode: 'HTML' });
    return;
  }

  const { data, error } = await supabase
    .from('subscription_packages')
    .insert([{ name, duration_days: durationDays, price: price, badge: badge, is_active: true }])
    .select('*')
    .single();

  if (error) {
    await ctx.reply(`⚠️ Gagal menambahkan paket: ${error.message}`);
    return;
  }

  const durLabel = durationDays === 0 ? 'Lifetime' : `${durationDays} Hari`;
  await ctx.reply(`✅ <b>Paket Berlangganan Ditambahkan!</b>\n━━━━━━━━━━━━━━━━━━━\nID     : <code>${data.id}</code>\nNama   : <b>${name}</b>\nDurasi : ${durLabel}\nHarga  : <b>${formatRupiah(price)}</b>\nBadge  : ${badge || '-'}`, { parse_mode: 'HTML' });
}

export async function handleDeletePackage(ctx: Context) {
  if (!(await checkIsAdmin(ctx))) return;
  if (!ctx.message || !('text' in ctx.message)) return;

  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length < 2) {
    await ctx.reply('⚠️ <b>Format Salah</b>. Gunakan: <code>/delete_package &lt;id&gt;</code> (Cek ID via /packages)', { parse_mode: 'HTML' });
    return;
  }

  const id = parseInt(parts[1], 10);
  if (isNaN(id)) {
    await ctx.reply('⚠️ ID paket harus berupa angka.');
    return;
  }

  const { error } = await supabase.from('subscription_packages').delete().eq('id', id);

  if (error) {
    await ctx.reply(`⚠️ Gagal menghapus paket ID ${id}: ${error.message}`);
    return;
  }

  await ctx.reply(`🗑️ <b>Paket Berlangganan ID <code>${id}</code> telah berhasil dihapus.</b>`, { parse_mode: 'HTML' });
}
