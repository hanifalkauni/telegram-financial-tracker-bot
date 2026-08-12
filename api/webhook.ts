import type { IncomingMessage, ServerResponse } from 'http';
import { userBot, createBot } from '../src/bot/bot.js';
import { ENV, validateEnv } from '../src/config/env.js';

validateEnv();

export default async function handler(req: IncomingMessage & { body?: any; query?: any }, res: ServerResponse & { status?: (code: number) => any; json?: (data: any) => any; send?: (data: any) => any }) {
  // Helpers for Vercel Serverless environment compatibility
  const sendJson = (statusCode: number, payload: any) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  };

  const sendText = (statusCode: number, payload: string) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'text/plain');
    res.end(payload);
  };

  // Only accept POST requests from Telegram Webhook
  if (req.method !== 'POST') {
    return sendText(200, 'Telegram AI Financial Tracker Bot Webhook is running.');
  }

  // Security Token Validation
  if (ENV.TELEGRAM_SECRET_TOKEN) {
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    if (secretHeader !== ENV.TELEGRAM_SECRET_TOKEN) {
      console.warn('[WEBHOOK FORBIDDEN] Invalid secret token header.');
      return sendJson(403, { error: 'Forbidden: Invalid Secret Token' });
    }
  }

  try {
    const update = req.body;
    if (!update) {
      return sendText(400, 'No update payload received.');
    }

    // Process update via userBot instance
    if (ENV.ADMIN_BOT_TOKEN && ENV.ADMIN_BOT_TOKEN !== ENV.BOT_TOKEN && req.query?.bot === 'admin') {
      const adminBotInstance = createBot(ENV.ADMIN_BOT_TOKEN);
      await adminBotInstance.handleUpdate(update);
    } else {
      await userBot.handleUpdate(update);
    }

    return sendJson(200, { ok: true });
  } catch (error) {
    console.error('[WEBHOOK ERROR]:', error);
    return sendJson(500, { error: 'Internal Server Error' });
  }
}
