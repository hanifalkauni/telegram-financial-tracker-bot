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
  checkIsAdmin,
  handleAdminStart,
  handleAdminReply,
  handleGenerateCode,
  handleAdminStats,
  handleUsersList,
  handleExtendUser,
  handleBroadcast,
  handlePaymentMethodsList,
  handleAddPayment,
  handleDeletePayment,
  handlePackagesList,
  handleAddPackage,
  handleDeletePackage,
} from './handlers/adminCommands.js';
import { handleCallbackQuery } from './callbacks/callbackHandler.js';

export function createUserBot(token: string) {
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

export function createAdminBot(token: string) {
  const bot = new Telegraf(token);

  bot.telegram
    .setMyCommands([
      { command: 'start', description: 'Panel Utama Admin SetorSini' },
      { command: 'admin_stats', description: 'Statistik pengguna & transaksi' },
      { command: 'users', description: 'Lihat 20 daftar pengguna & Telegram ID' },
      { command: 'payments', description: 'Kelola metode pembayaran BCA/Mandiri/QRIS' },
      { command: 'add_payment', description: 'Tambah rekening/metode pembayaran baru' },
      { command: 'delete_payment', description: 'Hapus metode pembayaran by ID' },
      { command: 'packages', description: 'Kelola paket berlangganan' },
      { command: 'add_package', description: 'Tambah paket berlangganan baru' },
      { command: 'delete_package', description: 'Hapus paket berlangganan by ID' },
      { command: 'generate_code', description: 'Buat Kode Konfirmasi (30/365/Lifetime)' },
      { command: 'reply', description: 'Balas tiket pesan pengguna (/reply <id> <pesan>)' },
      { command: 'extend', description: 'Perpanjang langganan user manual' },
      { command: 'broadcast', description: 'Kirim pesan pengumuman masal' },
    ])
    .catch(() => {});

  bot.command('start', handleAdminStart);
  bot.command('reply', handleAdminReply);
  bot.command('generate_code', handleGenerateCode);
  bot.command('admin_stats', handleAdminStats);
  bot.command('users', handleUsersList);
  bot.command('extend', handleExtendUser);
  bot.command('broadcast', handleBroadcast);
  bot.command('payments', handlePaymentMethodsList);
  bot.command('add_payment', handleAddPayment);
  bot.command('delete_payment', handleDeletePayment);
  bot.command('packages', handlePackagesList);
  bot.command('add_package', handleAddPackage);
  bot.command('delete_package', handleDeletePackage);

  bot.on('callback_query', handleCallbackQuery);

  // Reject unauthorized text messages
  bot.on('text', async (ctx) => {
    if (!(await checkIsAdmin(ctx))) return;
  });

  return bot;
}

export const userBot = createUserBot(ENV.BOT_TOKEN);
