import { Context, Telegraf } from 'telegraf';
import { supabase, UserRecord } from '../../db/supabase.js';
import { ENV } from '../../config/env.js';
import { redeemMasterCode, getOrCreateUser } from '../../services/accessControl.js';
import { sendErrorAlert } from '../../utils/errorAlert.js';

export async function checkIsAdmin(ctx: Context): Promise<boolean> {
  const telegramId = ctx.from?.id;
  const name = ctx.from?.first_name || 'User';
  if (!telegramId) return false;

  const { data: user } = await supabase.from('users').select('is_admin').eq('telegram_id', telegramId).single();

  if (!user || !user.is_admin) {
    // Check if the user is typing the Master Code to activate Admin
    if (ctx.message && 'text' in ctx.message && ctx.message.text.trim() === ENV.ADMIN_MASTER_CODE) {
      const userRecord = await getOrCreateUser(telegramId, name);
      const reply = await redeemMasterCode(userRecord);
      await ctx.reply(reply, { parse_mode: 'Markdown' });
      return true;
    }

    // Send access rejection message for non-admin chatting in Admin Bot
    await ctx
      .reply(
        '⛔ **Akses Ditolak!**\n\nChat room ini khusus untuk Admin SetorSini. Anda tidak memiliki wewenang untuk mengakses bot ini.',
        { parse_mode: 'Markdown' }
      )
      .catch(() => {});
    return false;
  }

  return true;
}

export async function handleAdminStart(ctx: Context) {
  if (!(await checkIsAdmin(ctx))) return;

  const name = ctx.from?.first_name || 'Admin';
  const startMsg = `👑 **Selamat Datang di Panel Admin SetorSini, ${name}!**

Anda memiliki akses penuh untuk mengelola sistem, menerima notifikasi error, dan mengonfirmasi pembayaran pengguna.

💡 **Menu Command Admin**:
• /admin_stats : Lihat statistik bisnis & pengguna
• /users : Lihat 20 daftar pengguna & Telegram ID
• /generate_code 30 : Buat Kode Konfirmasi 30 Hari
• /generate_code 0 : Buat Kode Konfirmasi Lifetime
• /reply <telegram_id> <pesan> : Balas tiket pesan pengguna
• /extend <telegram_id> <hari> : Perpanjang langganan user
• /broadcast <pesan> : Kirim pesan pengumuman masal`;

  await ctx.reply(startMsg, { parse_mode: 'Markdown' });
}

export async function handleAdminReply(ctx: Context) {
  if (!(await checkIsAdmin(ctx))) return;
  if (!ctx.message || !('text' in ctx.message)) return;

  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length < 3) {
    await ctx.reply('⚠️ **Format Salah**. Gunakan: `/reply <telegram_id> <pesan_balasan>`', { parse_mode: 'Markdown' });
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
    await userBot.telegram.sendMessage(targetId, `📩 **Pesan Balasan dari Admin**:\n━━━━━━━━━━━━━━━━━━━\n${replyMessage}`, { parse_mode: 'Markdown' });
    await ctx.reply(`✅ Pesan balasan berhasil dikirimkan ke Telegram ID \`${targetId}\`!`, { parse_mode: 'Markdown' });
  } catch (error) {
    await sendErrorAlert(error, 'handleAdminReply', `Target ID: ${targetId}`);
    await ctx.reply(`⚠️ Gagal mengirimkan pesan ke Telegram ID \`${targetId}\`. Pengguna mungkin belum pernah menekan /start pada User Bot.`);
  }
}

export async function handleGenerateCode(ctx: Context) {
  if (!(await checkIsAdmin(ctx))) return;
  if (!ctx.message || !('text' in ctx.message)) return;

  const parts = ctx.message.text.trim().split(/\s+/);
  let durationDays: number | null = 30; // default 30 days

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

  await ctx.reply(`🔑 **Kode Konfirmasi Berlangganan Dibuat!**
━━━━━━━━━━━━━━━━━━━
Kode       : \`${code}\` (Tap untuk copy)
Masa Aktif : ${durationLabel}
━━━━━━━━━━━━━━━━━━━
Kirimkan kode ini ke pengguna untuk mengaktivasi bot.`, { parse_mode: 'Markdown' });
}

export async function handleAdminStats(ctx: Context) {
  if (!(await checkIsAdmin(ctx))) return;

  const { count: totalUsers } = await supabase.from('users').select('*', { count: 'exact', head: true });
  const { count: trialUsers } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_activated', false).gt('trial_transactions_left', 0);
  const { count: activeSubs } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_activated', true);
  const { count: expiredUsers } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_activated', false).lte('trial_transactions_left', 0);
  const { count: unusedCodes } = await supabase.from('confirmation_codes').select('*', { count: 'exact', head: true }).eq('is_used', false);
  const { count: totalTx } = await supabase.from('transactions').select('*', { count: 'exact', head: true });

  const statsMsg = `👑 **Statistik Bisnis Financial Tracker Bot**
━━━━━━━━━━━━━━━━━━━
👥 Total User Terdaftar  : ${totalUsers || 0}
🎁 Active Trial Users   : ${trialUsers || 0}
✅ Active Subscribers   : ${activeSubs || 0}
⚠️ Expired Users        : ${expiredUsers || 0}
🔑 Kode Belum Dipakai   : ${unusedCodes || 0}
📈 Total Transaksi System: ${totalTx || 0}
━━━━━━━━━━━━━━━━━━━`;

  await ctx.reply(statsMsg, { parse_mode: 'Markdown' });
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

  let text = '👥 **20 Pengguna Terbaru Terdaftar**:\n━━━━━━━━━━━━━━━━━━━\n';

  uList.forEach((u, i) => {
    let status = 'Trial';
    if (u.is_admin) status = 'Admin 👑';
    else if (u.is_activated) status = 'Active ✅';
    else if (u.trial_transactions_left <= 0) status = 'Expired ⚠️';

    text += `${i + 1}. **${u.name || 'User'}** | ID: \`${u.telegram_id}\` | Status: ${status}\n`;
  });

  await ctx.reply(text, { parse_mode: 'Markdown' });
}

export async function handleExtendUser(ctx: Context) {
  if (!(await checkIsAdmin(ctx))) return;
  if (!ctx.message || !('text' in ctx.message)) return;

  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length < 3) {
    await ctx.reply('⚠️ **Format Salah**. Contoh: `/extend 123456789 30` atau `/extend 123456789 0` (Lifetime)', { parse_mode: 'Markdown' });
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

  await ctx.reply(`✅ **Masa aktif user \`${targetId}\` berhasil diperpanjang!**`, { parse_mode: 'Markdown' });
}

export async function handleBroadcast(ctx: Context) {
  if (!(await checkIsAdmin(ctx))) return;
  if (!ctx.message || !('text' in ctx.message)) return;

  const broadcastText = ctx.message.text.trim().split(/\s+/).slice(1).join(' ');
  if (!broadcastText) {
    await ctx.reply('⚠️ Masukkan pesan yang ingin di-broadcast. Contoh: `/broadcast Halo semuanya!`', { parse_mode: 'Markdown' });
    return;
  }

  const { data: users } = await supabase.from('users').select('telegram_id');
  const userBot = new Telegraf(ENV.BOT_TOKEN);

  let successCount = 0;
  if (users) {
    for (const u of users) {
      try {
        await userBot.telegram.sendMessage(u.telegram_id, `📢 **PENGUMUMAN BROADCAST**\n━━━━━━━━━━━━━━━━━━━\n${broadcastText}`, { parse_mode: 'Markdown' });
        successCount++;
      } catch {
        // Ignore blocked users
      }
    }
  }

  await ctx.reply(`📢 Broadcast selesai dikirimkan ke **${successCount}** pengguna!`, { parse_mode: 'Markdown' });
}
