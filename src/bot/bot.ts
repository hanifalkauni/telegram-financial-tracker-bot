import { Telegraf } from 'telegraf';
import { ENV } from '../config/env.js';
import { handleTextMessage, handlePhotoMessage } from './handlers/transactionHandler.js';
import {
  handleStart,
  handleStatus,
  handleSubscribe,
  handleConfirm,
  handleRekap,
  handleRatio,
  handleInsight,
  handleRutin,
  handleHistory,
  handleHapusTerakhir,
  handleExport,
  handleBudget,
  handleHelp,
} from './handlers/userCommands.js';
import {
  handleAdminReply,
  handleGenerateCode,
  handleAdminStats,
  handleUsersList,
  handleExtendUser,
  handleBroadcast,
} from './handlers/adminCommands.js';
import { handleCallbackQuery } from './callbacks/callbackHandler.js';

export function createBot(token: string) {
  const bot = new Telegraf(token);

  // Set Telegram Menu Commands
  bot.telegram
    .setMyCommands([
      { command: 'start', description: 'Memulai bot & melihat status' },
      { command: 'status', description: 'Cek profil, sisa trial & Telegram ID' },
      { command: 'rekap', description: 'Rekapitulasi laporan keuangan bulanan' },
      { command: 'ratio', description: 'Atur target rasio 50/30/20' },
      { command: 'insight', description: 'Analisis cerdas AI rekomendasi keuangan' },
      { command: 'rutin', description: 'Kelola transaksi tagihan rutin bulanan' },
      { command: 'history', description: 'Lihat 10 transaksi terakhir' },
      { command: 'export', description: 'Download laporan CSV/Excel' },
      { command: 'budget', description: 'Atur batas anggaran pengeluaran bulanan' },
      { command: 'subscribe', description: 'Permintaan berlangganan ke Admin' },
      { command: 'confirm', description: 'Kirim foto bukti transfer pembayaran' },
      { command: 'help', description: 'Panduan lengkap penggunaan bot' },
    ])
    .catch(() => {});

  // Register Commands
  bot.command('start', handleStart);
  bot.command('status', handleStatus);
  bot.command('subscribe', handleSubscribe);
  bot.command('confirm', handleConfirm);
  bot.command('rekap', handleRekap);
  bot.command('ratio', handleRatio);
  bot.command('insight', handleInsight);
  bot.command('rutin', handleRutin);
  bot.command('history', handleHistory);
  bot.command('hapus_terakhir', handleHapusTerakhir);
  bot.command('export', handleExport);
  bot.command('budget', handleBudget);
  bot.command('help', handleHelp);

  // Admin Commands
  bot.command('reply', handleAdminReply);
  bot.command('generate_code', handleGenerateCode);
  bot.command('admin_stats', handleAdminStats);
  bot.command('users', handleUsersList);
  bot.command('extend', handleExtendUser);
  bot.command('broadcast', handleBroadcast);

  // Register Callbacks
  bot.on('callback_query', handleCallbackQuery);

  // Register Text & Photo message listeners
  bot.on('text', handleTextMessage);
  bot.on('photo', (ctx) => {
    if (ctx.message && 'caption' in ctx.message && ctx.message.caption?.startsWith('/confirm')) {
      handleConfirm(ctx);
    } else {
      handlePhotoMessage(ctx);
    }
  });

  return bot;
}

export const userBot = createBot(ENV.BOT_TOKEN);
