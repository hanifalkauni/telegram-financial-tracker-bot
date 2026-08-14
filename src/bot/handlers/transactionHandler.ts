import { Context } from 'telegraf';
import { checkUserAccess, redeemMasterCode, redeemConfirmationCode, checkRateLimit } from '../../services/accessControl.js';
import { parseTransactionFromText, parseTransactionFromImage, encodeCompactTx } from '../../services/gemini.js';
import { ENV } from '../../config/env.js';
import { formatRupiah } from '../../utils/timezone.js';
import { sendErrorAlert } from '../../utils/errorAlert.js';

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

    // 5. Parse Transaction via Gemini AI
    await ctx.sendChatAction('typing');
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

  try {
    const rateCheck = checkRateLimit(telegramId);
    if (!rateCheck.allowed) {
      await ctx.reply(`⚠️ <b>Mohon tunggu ${rateCheck.waitSeconds} detik</b> sebelum mengirim foto struk berikutnya.`, { parse_mode: 'HTML' });
      return;
    }

    const access = await checkUserAccess(telegramId, userName);
    if (!access.canProcess) {
      await ctx.reply(access.message || 'Access expired.', { parse_mode: 'HTML' });
      return;
    }

    await ctx.sendChatAction('upload_photo');

    // Select optimal resolution photo (index length - 2 for 800px-1280px, fast download & crisp OCR)
    const photos = ctx.message.photo;
    const optimalPhoto = photos.length > 2 ? photos[photos.length - 2] : photos[photos.length - 1];
    const fileLink = await ctx.telegram.getFileLink(optimalPhoto.file_id);

    // Fetch image binary buffer
    const response = await fetch(fileLink.href);
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // Parse image via Gemini Multimodal OCR
    const parsed = await parseTransactionFromImage(imageBuffer, 'image/jpeg');

    const compactPayload = encodeCompactTx(parsed);

    const pillarEmoji = parsed.financial_pillar === 'NEEDS' ? '🏠 NEEDS' : parsed.financial_pillar === 'WANTS' ? '🍿 WANTS' : '🏦 SAVINGS';
    const walletEmoji = parsed.wallet === 'E_WALLET' ? '📱 E_WALLET' : parsed.wallet === 'BANK' ? '🏦 BANK' : '💵 CASH';
    const typeEmoji = parsed.type === 'EXPENSE' ? '📤 EXPENSE' : '📥 INCOME';

    const confirmationMsg = `🧾 <b>Hasil OCR Struk Belanja</b>
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
  } catch (error) {
    await sendErrorAlert(error, 'handlePhotoMessage', `User ID: ${telegramId}`);
    await ctx.reply('⚠️ Gagal membaca foto struk. Pastikan foto tulisan struk terlihat jelas dan terang.');
  }
}
