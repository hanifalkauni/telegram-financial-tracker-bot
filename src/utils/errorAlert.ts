import { Telegraf } from 'telegraf';
import { ENV } from '../config/env.js';
import { supabase } from '../db/supabase.js';

export async function sendErrorAlert(error: any, component: string, contextInfo?: string) {
  console.error(`[ERROR ALERT] (${component}):`, error);

  const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const errorMessage = error?.message || String(error);

  const alertMessage = `⚠️ **SYSTEM ERROR WARNING**
━━━━━━━━━━━━━━━━━━━
🕒 Timestamp  : ${timestamp} WIB
🛠️ Component   : ${component}
👤 Context     : ${contextInfo || 'N/A'}
📝 Error Message:
\`${errorMessage.slice(0, 500)}\`
━━━━━━━━━━━━━━━━━━━`;

  try {
    // 1. Get all active admins from DB
    const { data: admins } = await supabase.from('users').select('telegram_id').eq('is_admin', true);

    const adminBot = new Telegraf(ENV.ADMIN_BOT_TOKEN || ENV.BOT_TOKEN);

    if (admins && admins.length > 0) {
      for (const admin of admins) {
        await adminBot.telegram.sendMessage(admin.telegram_id, alertMessage, { parse_mode: 'Markdown' }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[ERROR ALERT DISPATCH FAILURE]:', err);
  }
}

export async function sendProcessLogToAdmin(actionName: string, durationMs: number, details?: string) {
  const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const secondsStr = (durationMs / 1000).toFixed(2);
  const logMsg = `📊 <b>LOG PROSES GEMINI AI</b>
━━━━━━━━━━━━━━━━━━━
🕒 <b>Waktu</b>      : ${timestamp} WIB
⚙️ <b>Fitur</b>      : ${actionName}
⏱️ <b>Durasi</b>     : <code>${durationMs}ms</code> (${secondsStr}s)
📝 <b>Detail</b>     : ${details || '-'}
━━━━━━━━━━━━━━━━━━━`;

  console.log(`[ADMIN TELEMETRY LOG] ${actionName}: ${durationMs}ms | ${details || ''}`);

  try {
    const { data: admins } = await supabase.from('users').select('telegram_id').eq('is_admin', true);
    const adminBot = new Telegraf(ENV.ADMIN_BOT_TOKEN || ENV.BOT_TOKEN);

    if (admins && admins.length > 0) {
      for (const admin of admins) {
        await adminBot.telegram.sendMessage(admin.telegram_id, logMsg, { parse_mode: 'HTML' }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[ADMIN LOG DISPATCH FAILURE]:', err);
  }
}
