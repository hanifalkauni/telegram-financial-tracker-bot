import type { IncomingMessage, ServerResponse } from 'http';
import { userBot, adminBot } from '../src/bot/bot.js';
import { ENV, validateEnv } from '../src/config/env.js';

validateEnv();

export const maxDuration = 60; // Set maximum Serverless execution time to 60 seconds (Vercel Hobby limit)
export const dynamic = 'force-dynamic';

const landingPageHtml = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SetorSini AI Bot - Web Server Active</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Inter', system-ui, -apple-system, sans-serif; }
    body { background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 20px; padding: 40px 32px; max-width: 460px; width: 100%; text-align: center; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6); }
    .icon { font-size: 48px; margin-bottom: 16px; }
    .badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 9999px; padding: 8px 18px; font-size: 14px; font-weight: 600; margin-bottom: 24px; }
    .dot { width: 8px; height: 8px; background: #22c55e; border-radius: 50%; box-shadow: 0 0 10px #22c55e; }
    h1 { font-size: 26px; font-weight: 700; margin-bottom: 10px; color: #ffffff; letter-spacing: -0.5px; }
    p { color: #94a3b8; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
    .info-box { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 14px; font-family: monospace; font-size: 13px; color: #38bdf8; word-break: break-all; margin-bottom: 24px; }
    .footer { font-size: 12px; color: #64748b; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🤖</div>
    <div class="badge"><div class="dot"></div> Web Server Active & Healthy</div>
    <h1>SetorSini AI Bot</h1>
    <p>Serverless Webhook Engine & Telegram AI Financial Tracker Bot is running smoothly on Vercel.</p>
    <div class="info-box">POST /api/webhook ➔ Webhook Ready</div>
    <div class="footer">Powered by Node.js • Telegraf.js • Gemini 3.6 Flash • Supabase</div>
  </div>
</body>
</html>`;

export default async function handler(
  req: IncomingMessage & { body?: any; query?: any },
  res: ServerResponse & { status?: (code: number) => any; json?: (data: any) => any; send?: (data: any) => any }
) {
  const sendJson = (statusCode: number, payload: any) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  };

  const sendHtml = (statusCode: number, html: string) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  };

  // Render HTML landing page on GET requests
  if (req.method !== 'POST') {
    return sendHtml(200, landingPageHtml);
  }

  // Security Token Validation for POST requests
  if (ENV.TELEGRAM_SECRET_TOKEN) {
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    if (secretHeader !== ENV.TELEGRAM_SECRET_TOKEN) {
      console.warn('[WEBHOOK FORBIDDEN] Invalid secret token header.');
      return sendJson(403, { error: 'Forbidden: Invalid Secret Token' });
    }
  }

  try {
    let update = req.body;

    if (typeof update === 'string') {
      try {
        update = JSON.parse(update);
      } catch (e) {
        console.error('[WEBHOOK JSON PARSE ERROR]:', e);
      }
    } else if (!update) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      const rawBody = Buffer.concat(chunks).toString('utf-8');
      if (rawBody) {
        try {
          update = JSON.parse(rawBody);
        } catch (e) {
          console.error('[WEBHOOK STREAM JSON PARSE ERROR]:', e);
        }
      }
    }

    if (!update) {
      return sendHtml(400, '<h1>400 Bad Request</h1><p>No update payload received.</p>');
    }

    // Parse URL search parameters using standard WHATWG URL API
    const reqUrl = req.url || '';
    const fullUrl = new URL(reqUrl.startsWith('http') ? reqUrl : `https://localhost${reqUrl}`);
    const isAdminRoute = fullUrl.searchParams.get('bot') === 'admin' || req.query?.bot === 'admin';

    // Route update to Admin Bot or User Bot
    const targetBot = isAdminRoute ? adminBot : userBot;
    await targetBot.handleUpdate(update);

    return sendJson(200, { ok: true });
  } catch (error) {
    console.error('[WEBHOOK ERROR]:', error);
    return sendJson(500, { error: 'Internal Server Error' });
  }
}
