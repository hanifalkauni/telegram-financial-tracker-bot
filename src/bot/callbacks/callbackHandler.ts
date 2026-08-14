import { Context, Telegraf } from 'telegraf';
import { supabase } from '../../db/supabase.js';
import { checkUserAccess } from '../../services/accessControl.js';
import { getRekapReport, formatRekapMessage } from '../../services/reportService.js';
import { ParsedTransaction, decodeCompactTx } from '../../services/gemini.js';
import { formatRupiah } from '../../utils/timezone.js';
import { ENV } from '../../config/env.js';
import { sendErrorAlert } from '../../utils/errorAlert.js';

export async function handleCallbackQuery(ctx: Context) {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
  const data = ctx.callbackQuery.data;
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    // 1. Save Transaction Callback
    if (data.startsWith('save_tx:')) {
      const access = await checkUserAccess(telegramId, ctx.from?.first_name);

      // Fetch fresh user state from DB to prevent race conditions during concurrent stress tests
      const { data: freshUser } = await supabase
        .from('users')
        .select('id, is_admin, is_activated, trial_transactions_left, monthly_budget')
        .eq('id', access.user.id)
        .single();

      const userRec = freshUser || access.user;

      // Guard: Check if trial quota is exhausted
      if (!userRec.is_admin && !userRec.is_activated && userRec.trial_transactions_left <= 0) {
        await ctx.answerCbQuery('Masa Trial Habis');
        await ctx.editMessageText(
          '🎁 <b>Masa Free Trial 5 Transaksi Gratis Anda Telah Habis</b>\n\nUntuk membuka akses penuh tanpa batas, silakan masukkan <b>Kode Konfirmasi Berlangganan</b> dari Admin, atau ketik /subscribe untuk menghubungi Admin.',
          { parse_mode: 'HTML' }
        );
        return;
      }

      // Optimistic Locking Atomic Decrement Guard for trial users
      let trialNote = '';
      if (!userRec.is_admin && !userRec.is_activated) {
        const nextTrialCount = userRec.trial_transactions_left - 1;

        const { data: updatedUser, error: updateErr } = await supabase
          .from('users')
          .update({ trial_transactions_left: nextTrialCount })
          .eq('id', userRec.id)
          .eq('trial_transactions_left', userRec.trial_transactions_left)
          .select()
          .single();

        if (updateErr || !updatedUser) {
          // Race condition caught! Another request decremented first
          await ctx.answerCbQuery('Masa Trial Habis');
          await ctx.editMessageText(
            '🎁 <b>Masa Free Trial 5 Transaksi Gratis Anda Telah Habis</b>\n\nUntuk membuka akses penuh tanpa batas, silakan masukkan <b>Kode Konfirmasi Berlangganan</b> dari Admin, atau ketik /subscribe untuk menghubungi Admin.',
            { parse_mode: 'HTML' }
          );
          return;
        }

        trialNote = `\n✨ (Sisa kuota Free Trial: ${nextTrialCount}/5 transaksi)`;
      }

      const compactPayload = data.replace('save_tx:', '');
      const parsed: ParsedTransaction = decodeCompactTx(compactPayload);

      // Insert transaction into database
      await supabase.from('transactions').insert([
        {
          user_id: userRec.id,
          type: parsed.type,
          amount: parsed.amount,
          category: parsed.category,
          description: parsed.description,
          wallet: parsed.wallet,
          financial_pillar: parsed.financial_pillar,
          transaction_date: parsed.date,
        },
      ]);

      // Check Budget Alert
      let budgetAlertText = '';
      if (userRec.monthly_budget && Number(userRec.monthly_budget) > 0) {
        const report = await getRekapReport(userRec.id, 'MONTH');
        if (report.budgetPercentage && report.budgetPercentage >= 100) {
          budgetAlertText = `\n⚠️ <b>PERINGATAN BUDGET</b>: Total pengeluaran bulan ini (${formatRupiah(report.totalExpense)}) telah MELAMPAUI limit budget Anda!`;
        } else if (report.budgetPercentage && report.budgetPercentage >= 80) {
          budgetAlertText = `\n⚠️ <b>PERINGATAN BUDGET</b>: Total pengeluaran bulan ini telah mencapai ${report.budgetPercentage}% dari limit budget Anda.`;
        }
      }

      await ctx.answerCbQuery('Transaksi Berhasil Disimpan!');
      await ctx.editMessageText(`✅ <b>Transaksi Berhasil Disimpan!</b>\n\n📌 ${parsed.category} - ${formatRupiah(parsed.amount)}${trialNote}${budgetAlertText}`, { parse_mode: 'HTML' });
      return;
    }

    // 2. Cancel Transaction Callback
    if (data === 'cancel_tx') {
      await ctx.answerCbQuery('Dibatalkan');
      await ctx.editMessageText('❌ <b>Transaksi Dibatalkan.</b>', { parse_mode: 'HTML' });
      return;
    }

    // 3. Delete Transaction Callback
    if (data.startsWith('delete_tx:')) {
      const txId = data.replace('delete_tx:', '');
      await supabase.from('transactions').delete().eq('id', txId);

      await ctx.answerCbQuery('Transaksi Dihapus!');
      await ctx.editMessageText('🗑️ <b>Transaksi telah berhasil dihapus.</b>', { parse_mode: 'HTML' });
      return;
    }

    // 4. Rekap Interactive Filter Callback
    if (data.startsWith('rekap_filter:')) {
      const filterType = data.replace('rekap_filter:', '') as 'WEEK' | 'MONTH';
      const access = await checkUserAccess(telegramId, ctx.from?.first_name);
      const report = await getRekapReport(access.user.id, filterType);
      const msgText = formatRekapMessage(report, access.user);

      await ctx.answerCbQuery();
      await ctx.editMessageText(msgText, {
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
      return;
    }

    // 5. Interactive Subscription Package Selected
    if (data.startsWith('sub_pkg:')) {
      const parts = data.split(':');
      const days = parseInt(parts[1], 10);
      const amount = parseInt(parts[2], 10);

      const pkgName = days === 30 ? '📦 Paket 1 Bulan (30 Hari)' : days === 365 ? '🌟 Paket 1 Tahun (365 Hari)' : '♾️ Paket Lifetime (Seumur Hidup)';

      // Dynamically fetch active payment methods from Supabase database table
      const { data: payMethods } = await supabase
        .from('payment_methods')
        .select('name, account_number, account_name, image_url')
        .eq('is_active', true);

      const qrisMethod = payMethods?.find((pm) => pm.image_url && pm.image_url.length > 0);

      let payDetailsText = '• 🏦 Bank BCA: <code>1234567890</code> (a.n. SetorSini)\n• 📱 E-Wallet: <code>08123456789</code> (GoPay/OVO/Dana)';

      if (payMethods && payMethods.length > 0) {
        payDetailsText = payMethods
          .map((pm) => pm.image_url ? `• 🖼️ <b>${pm.name}</b> (${pm.account_name}) - Scan QRIS di bawah` : `• ${pm.name}: <code>${pm.account_number}</code> (${pm.account_name})`)
          .join('\n');
      }

      const invoiceMsg = `🧾 <b>INVOICE PEMBAYARAN SETORSINI</b>
━━━━━━━━━━━━━━━━━━━
📦 <b>Paket</b>     : ${pkgName}
💵 <b>Total</b>     : <b>${formatRupiah(amount)}</b>
💳 <b>Metode</b>    : QRIS / Bank Transfer

<b>Petunjuk Pembayaran</b>:
${payDetailsText}

Setelah transfer, klik <b>📤 Kirim Bukti Bayar</b> di bawah ini untuk mengunggah foto struk/screenshot transfer Anda:`;

      await ctx.answerCbQuery();

      if (qrisMethod && qrisMethod.image_url) {
        // Send QRIS barcode image directly to user with invoice caption and action buttons!
        await ctx.replyWithPhoto(qrisMethod.image_url, {
          caption: invoiceMsg,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📤 Kirim Bukti Bayar', callback_data: `sub_upload:${days}:${amount}` }],
              [{ text: '❌ Batal Pembayaran', callback_data: 'cancel_sub' }],
            ],
          },
        }).catch(async () => {
          await ctx.editMessageText(invoiceMsg, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📤 Kirim Bukti Bayar', callback_data: `sub_upload:${days}:${amount}` }],
                [{ text: '❌ Batal Pembayaran', callback_data: 'cancel_sub' }],
              ],
            },
          });
        });
      } else {
        await ctx.editMessageText(invoiceMsg, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📤 Kirim Bukti Bayar', callback_data: `sub_upload:${days}:${amount}` }],
              [{ text: '❌ Batal Pembayaran', callback_data: 'cancel_sub' }],
            ],
          },
        });
      }
      return;
    }

    // 6. Interactive Subscription Upload Callback
    if (data.startsWith('sub_upload:')) {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        '📸 <b>Unggah Bukti Transfer Anda</b>\n\nSilakan kirimkan foto struk transfer / screenshot QRIS Anda sekarang di chat room ini dengan caption <code>/confirm</code>.\n\nBukti transfer akan otomatis diteruskan ke Admin untuk di-approve secara instan.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    // 7. Cancel Subscription Callback
    if (data === 'cancel_sub') {
      await ctx.answerCbQuery('Pembayaran dibatalkan');
      await ctx.editMessageText('❌ <b>Proses Pembayaran Dibatalkan.</b>\n\nAnda dapat mengetik /subscribe kapan saja jika ingin berlangganan kembali.', { parse_mode: 'HTML' });
      return;
    }

    // 8. One-Tap Admin Approval Callback
    if (data.startsWith('approve_sub:')) {
      const parts = data.split(':');
      const targetTelegramId = parseInt(parts[1], 10);
      const days = parseInt(parts[2], 10);

      let newActiveUntil: string | null = null;
      if (days > 0) {
        const now = new Date();
        now.setDate(now.getDate() + days);
        newActiveUntil = now.toISOString();
      }

      await supabase
        .from('users')
        .update({
          is_activated: true,
          active_until: newActiveUntil,
          activated_at: new Date().toISOString(),
        })
        .eq('telegram_id', targetTelegramId);

      const userBot = new Telegraf(ENV.BOT_TOKEN);
      const durationLabel = newActiveUntil ? `s/d ${new Date(newActiveUntil).toLocaleDateString('id-ID')}` : 'Seumur Hidup (Lifetime)';

      await userBot.telegram.sendMessage(targetTelegramId, `🎉 <b>Pembayaran Dikonfirmasi!</b>\n\n✅ Status Akun: Berlangganan Aktif\n📅 Masa Aktif: ${durationLabel}\n\nTerima kasih telah berlangganan SetorSini AI Bot!`, { parse_mode: 'HTML' }).catch(() => {});

      await ctx.answerCbQuery('User Approved!');
      await ctx.editMessageText(`✅ <b>Approved!</b> Akun user <code>${targetTelegramId}</code> telah diaktifkan (${durationLabel}).`, { parse_mode: 'HTML' });
      return;
    }

    // 9. Reject Payment Proof Callback
    if (data.startsWith('reject_sub:')) {
      const targetTelegramId = parseInt(data.split(':')[1], 10);
      const userBot = new Telegraf(ENV.BOT_TOKEN);

      await userBot.telegram.sendMessage(targetTelegramId, `❌ <b>Pembayaran Tidak Dikonfirmasi</b>\n\nAdmin tidak dapat memverifikasi bukti pembayaran Anda. Silakan ketik /subscribe untuk menghubungi Admin.`, { parse_mode: 'HTML' }).catch(() => {});

      await ctx.answerCbQuery('Pembayaran Ditolak');
      await ctx.editMessageText(`❌ <b>Pembayaran Ditolak</b> untuk user <code>${targetTelegramId}</code>.`, { parse_mode: 'HTML' });
      return;
    }
  } catch (error) {
    await sendErrorAlert(error, 'handleCallbackQuery', `Data: ${data}`);
    await ctx.answerCbQuery('Terjadi kesalahan.');
  }
}
