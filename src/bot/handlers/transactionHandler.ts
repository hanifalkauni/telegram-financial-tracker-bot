import { Context } from 'telegraf';
import { checkUserAccess, redeemMasterCode, redeemConfirmationCode, checkRateLimit } from '../../services/accessControl.js';
import { parseTransactionFromText, parseTransactionFromImage, encodeCompactTx } from '../../services/gemini.js';
import { ENV } from '../../config/env.js';
import { supabase } from '../../db/supabase.js';
import { formatRupiah } from '../../utils/timezone.js';
import { sendErrorAlert } from '../../utils/errorAlert.js';

export async function forwardPaymentProofToAdmin(ctx: Context, photoFileId: string, telegramId: number, name: string) {
  try {
    const adminBotToken = ENV.ADMIN_BOT_TOKEN || ENV.BOT_TOKEN;
    const { data: admins } = await supabase.from('users').select('telegram_id').eq('is_admin', true);

    if (admins && admins.length > 0) {
      const { Telegraf } = await import('telegraf');
      const botAdmin = new Telegraf(adminBotToken);

      const caption = `📩 <b>KONFIRMASI PEMBAYARAN BARU (Auto-Detected)</b>
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
  } catch (error) {
    console.error('[FORWARD PAYMENT PROOF ERROR]', error);
  }
}

export async function handleTextMessage(ctx: Context) {
  if (!ctx.message || !('text' in ctx.message)) return;
  const text = ctx.message.text.trim();
  const telegramId = ctx.from?.id;
  const userName = ctx.from?.first_name || 'User';

  if (!telegramId || text.startsWith('/')) return; // Ignore bot commands

  try {
    // 0. Rate Limiting Check (Spam Guard)
    const rateCheck = checkRateLimit(telegramId);
    if (!rateCheck.allowed) {
      await ctx.reply(`⚠️ <b>Mohon tunggu ${rateCheck.waitSeconds} detik</b> sebelum mengirim pesan transaksi berikutnya.`, { parse_mode: 'HTML' });
      return;
    }

    // 1. Check Access Control
    const access = await checkUserAccess(telegramId, userName);

    // 2. Check for Master Code
    if (text === ENV.ADMIN_MASTER_CODE) {
      const reply = await redeemMasterCode(access.user);
      await ctx.reply(reply, { parse_mode: 'HTML' });
      return;
    }

    // 3. Check for Confirmation Code
    if (/^[A-Z0-9]{5,10}$/i.test(text)) {
      const codeReply = await redeemConfirmationCode(access.user, text);
      if (!codeReply.includes('tidak ditemukan')) {
        await ctx.reply(codeReply, { parse_mode: 'HTML' });
        return;
      }
    }

    // 4. Block if Access Expired
    if (!access.canProcess) {
      await ctx.reply(access.message || 'Access expired.', { parse_mode: 'HTML' });
      return;
    }

    // 5. Parse Transaction via AI Engine
    await ctx.sendChatAction('typing').catch(() => {});
    const parsed = await parseTransactionFromText(text);

    // Encode payload in compact format (max 60 bytes) for Telegram callback button
    const compactPayload = encodeCompactTx(parsed);

    const pillarEmoji = parsed.financial_pillar === 'NEEDS' ? '🏠 NEEDS' : parsed.financial_pillar === 'WANTS' ? '🍿 WANTS' : '🏦 SAVINGS';
    const walletEmoji = parsed.wallet === 'E_WALLET' ? '📱 E_WALLET' : parsed.wallet === 'BANK' ? '🏦 BANK' : '💵 CASH';
    const typeEmoji = parsed.type === 'EXPENSE' ? '📤 EXPENSE' : '📥 INCOME';

    const confirmationMsg = `📝 <b>Konfirmasi Transaksi</b>
━━━━━━━━━━━━━━━━━━━
📌 <b>Tipe</b>       : ${typeEmoji}
💵 <b>Nominal</b>    : ${formatRupiah(parsed.amount)}
🏷️ <b>Kategori</b>   : ${parsed.category}
🏛️ <b>Pilar</b>       : ${pillarEmoji}
💳 <b>Dompet</b>     : ${walletEmoji}
📝 <b>Deskripsi</b>  : ${parsed.description || '-'}
📅 <b>Tanggal</b>    : ${parsed.date}
━━━━━━━━━━━━━━━━━━━
Apakah data di atas sudah benar?`;

    await ctx.reply(confirmationMsg, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Simpan', callback_data: `save_tx:${compactPayload}` },
            { text: '❌ Batal', callback_data: 'cancel_tx' },
          ],
        ],
      },
    });
  } catch (error) {
    await sendErrorAlert(error, 'handleTextMessage', `User ID: ${telegramId}, Input: ${text}`);
    await ctx.reply('⚠️ Maaf, terjadi kendala saat memproses teks transaksi Anda. Silakan coba lagi nanti.');
  }
}

export async function handlePhotoMessage(ctx: Context) {
  if (!ctx.message || !('photo' in ctx.message)) return;
  const telegramId = ctx.from?.id;
  const userName = ctx.from?.first_name || 'User';

  if (!telegramId) return;

  let processingMsg: any = null;

  try {
    const rateCheck = checkRateLimit(telegramId);
    if (!rateCheck.allowed) {
      await ctx.reply(`⚠️ <b>Mohon tunggu ${rateCheck.waitSeconds} detik</b> sebelum mengirim foto struk berikutnya.`, { parse_mode: 'HTML' });
      return;
    }

    const photos = ctx.message.photo;
    // Pick optimal photo resolution (~500px-1280px) for fast download & high OCR accuracy
    // Avoid downloading massive 4K raw photos (4-8MB) which slow down network transfer and Gemini AI base64 parsing
    let optimalPhoto = photos[photos.length - 1];
    for (const p of photos) {
      if (p.width && p.width >= 500 && p.width <= 1280) {
        optimalPhoto = p;
        break;
      }
    }

    // Check if caption explicitly indicates payment proof
    const captionLower = ('caption' in ctx.message && ctx.message.caption) ? ctx.message.caption.toLowerCase() : '';
    if (captionLower.includes('/confirm') || captionLower.includes('confirm') || captionLower.includes('bukti') || captionLower.includes('bayar')) {
      await forwardPaymentProofToAdmin(ctx, optimalPhoto.file_id, telegramId, userName);
      await ctx.reply('📩 <b>Bukti pembayaran Anda telah dikirimkan ke Admin.</b>\n\nMohon tunggu verifikasi Admin (Status akun Anda akan aktif otomatis setelah di-approve).', { parse_mode: 'HTML' });
      return;
    }

    await ctx.sendChatAction('upload_photo').catch(() => {});
    processingMsg = await ctx.reply('🔎 <i>Sedang membaca &amp; menganalisis foto struk...</i>', { parse_mode: 'HTML' });

    // Fetch file link and check user access in parallel to eliminate DB latency
    const [fileLink, access] = await Promise.all([
      ctx.telegram.getFileLink(optimalPhoto.file_id),
      checkUserAccess(telegramId, userName),
    ]);

    // Fetch image binary buffer
    const response = await fetch(fileLink.href);
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // Parse image via AI Multimodal OCR
    const parsed = await parseTransactionFromImage(imageBuffer, 'image/jpeg');

    const chatId = ctx.chat?.id;

    // If user's account is EXPIRED and image is a transfer proof, auto-forward to Admin
    if (!access.canProcess && parsed.is_transfer_proof) {
      await forwardPaymentProofToAdmin(ctx, optimalPhoto.file_id, telegramId, userName);
      const proofMsg = '📩 <b>Bukti transfer pembayaran Anda terdeteksi &amp; telah dikirimkan ke Admin untuk verifikasi!</b>\n\nMohon tunggu konfirmasi Admin (Status akun Anda akan aktif otomatis setelah di-approve).';

      if (chatId && processingMsg) {
        await ctx.telegram.editMessageText(chatId, processingMsg.message_id, undefined, proofMsg, { parse_mode: 'HTML' }).catch(async () => {
          await ctx.reply(proofMsg, { parse_mode: 'HTML' });
        });
      } else {
        await ctx.reply(proofMsg, { parse_mode: 'HTML' });
      }
      return;
    }

    // Check if account access expired for non-payment proof uploads
    if (!access.canProcess) {
      const expiredMsg = access.message || 'Access expired.';
      if (chatId && processingMsg) {
        await ctx.telegram.editMessageText(chatId, processingMsg.message_id, undefined, expiredMsg, { parse_mode: 'HTML' }).catch(async () => {
          await ctx.reply(expiredMsg, { parse_mode: 'HTML' });
        });
      } else {
        await ctx.reply(expiredMsg, { parse_mode: 'HTML' });
      }
      return;
    }

    // Account is Active or Admin: Process photo as an Expense transaction
    const compactPayload = encodeCompactTx(parsed);

    const pillarEmoji = parsed.financial_pillar === 'NEEDS' ? '🏠 NEEDS' : parsed.financial_pillar === 'WANTS' ? '🍿 WANTS' : '🏦 SAVINGS';
    const walletEmoji = parsed.wallet === 'E_WALLET' ? '📱 E_WALLET' : parsed.wallet === 'BANK' ? '🏦 BANK' : '💵 CASH';
    const typeEmoji = parsed.type === 'EXPENSE' ? '📤 EXPENSE' : '📥 INCOME';

    const confirmationMsg = `🧾 <b>Hasil OCR Struk / Bukti Transfer</b>
━━━━━━━━━━━━━━━━━━━
📌 <b>Tipe</b>       : ${typeEmoji}
💵 <b>Nominal</b>    : ${formatRupiah(parsed.amount)}
🏷️ <b>Kategori</b>   : ${parsed.category}
🏛️ <b>Pilar</b>       : ${pillarEmoji}
💳 <b>Dompet</b>     : ${walletEmoji}
📝 <b>Deskripsi</b>  : ${parsed.description || '-'}
📅 <b>Tanggal</b>    : ${parsed.date}
━━━━━━━━━━━━━━━━━━━
Apakah data struk di atas sudah sesuai?`;

    if (chatId && processingMsg) {
      await ctx.telegram.editMessageText(chatId, processingMsg.message_id, undefined, confirmationMsg, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Simpan Struk', callback_data: `save_tx:${compactPayload}` },
              { text: '❌ Batal', callback_data: 'cancel_tx' },
            ],
          ],
        },
      }).catch(async () => {
        await ctx.reply(confirmationMsg, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Simpan Struk', callback_data: `save_tx:${compactPayload}` },
                { text: '❌ Batal', callback_data: 'cancel_tx' },
              ],
            ],
          },
        });
      });
    } else {
      await ctx.reply(confirmationMsg, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Simpan Struk', callback_data: `save_tx:${compactPayload}` },
              { text: '❌ Batal', callback_data: 'cancel_tx' },
            ],
          ],
        },
      });
    }
  } catch (error) {
    const chatId = ctx.chat?.id;
    const errorMsgText = '⚠️ <b>Gagal Membaca Foto</b>\n\nSistem tidak dapat membaca teks pada foto tersebut. Pastikan foto struk / bukti transfer terlihat terang dan tulisan terbaca jelas.';

    if (chatId && processingMsg) {
      await ctx.telegram.editMessageText(chatId, processingMsg.message_id, undefined, errorMsgText, { parse_mode: 'HTML' }).catch(async () => {
        await ctx.reply(errorMsgText, { parse_mode: 'HTML' });
      });
    } else {
      await ctx.reply(errorMsgText, { parse_mode: 'HTML' });
    }

    sendErrorAlert(error, 'handlePhotoMessage', `User ID: ${telegramId}`).catch(() => {});
  }
}
