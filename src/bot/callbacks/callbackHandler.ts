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

      const compactPayload = data.replace('save_tx:', '');
      const parsed: ParsedTransaction = decodeCompactTx(compactPayload);

      // Insert transaction into database
      await supabase.from('transactions').insert([
        {
          user_id: access.user.id,
          type: parsed.type,
          amount: parsed.amount,
          category: parsed.category,
          description: parsed.description,
          wallet: parsed.wallet,
          financial_pillar: parsed.financial_pillar,
          transaction_date: parsed.date,
        },
      ]);

      // Decrement trial count if in trial mode
      let trialNote = '';
      if (!access.user.is_admin && !access.user.is_activated && access.user.trial_transactions_left > 0) {
        const newLeft = access.user.trial_transactions_left - 1;
        await supabase.from('users').update({ trial_transactions_left: newLeft }).eq('id', access.user.id);
        trialNote = `\n✨ (Sisa kuota Free Trial: ${newLeft}/5 transaksi)`;
      }

      // Check Budget Alert
      let budgetAlertText = '';
      if (access.user.monthly_budget && Number(access.user.monthly_budget) > 0) {
        const report = await getRekapReport(access.user.id, 'MONTH');
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

    // 5. One-Tap Admin Approval Callback
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

    // 6. Reject Payment Proof Callback
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
