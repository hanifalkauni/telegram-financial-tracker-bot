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
  handleAddQris,
  handleDeletePayment,
  handlePackagesList,
  handleAddPackage,
  handleDeletePackage,
} from './handlers/adminCommands.js';
import { handleCallbackQuery } from './callbacks/callbackHandler.js';

export function createUserBot(token: string) {
  const bot = new Telegraf(token);

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
  bot.on('document', (ctx) => {
    const doc = ctx.message && 'document' in ctx.message ? ctx.message.document : null;
    if (doc && doc.mime_type && doc.mime_type.startsWith('image/')) {
      handlePhotoMessage(ctx);
    }
  });

  return bot;
}

export function createAdminBot(token: string) {
  const bot = new Telegraf(token);

  bot.command('start', handleAdminStart);
  bot.command('reply', handleAdminReply);
  bot.command('generate_code', handleGenerateCode);
  bot.command('admin_stats', handleAdminStats);
  bot.command('users', handleUsersList);
  bot.command('extend', handleExtendUser);
  bot.command('broadcast', handleBroadcast);
  bot.command('payments', handlePaymentMethodsList);
  bot.command('add_payment', handleAddPayment);
  bot.command('add_qris', handleAddQris);
  bot.command('delete_payment', handleDeletePayment);
  bot.command('packages', handlePackagesList);
  bot.command('add_package', handleAddPackage);
  bot.command('delete_package', handleDeletePackage);

  bot.on('callback_query', handleCallbackQuery);

  bot.on('photo', (ctx) => {
    if (ctx.message && 'caption' in ctx.message && ctx.message.caption?.startsWith('/add_qris')) {
      handleAddQris(ctx);
    } else {
      handlePhotoMessage(ctx);
    }
  });
  bot.on('document', (ctx) => {
    const doc = ctx.message && 'document' in ctx.message ? ctx.message.document : null;
    if (doc && doc.mime_type && doc.mime_type.startsWith('image/')) {
      handlePhotoMessage(ctx);
    }
  });

  // Reject unauthorized text messages
  bot.on('text', async (ctx) => {
    if (!(await checkIsAdmin(ctx))) return;
  });

  return bot;
}

export const userBot = createUserBot(ENV.BOT_TOKEN);
export const adminBot = (ENV.ADMIN_BOT_TOKEN && ENV.ADMIN_BOT_TOKEN !== ENV.BOT_TOKEN)
  ? createAdminBot(ENV.ADMIN_BOT_TOKEN)
  : userBot;
